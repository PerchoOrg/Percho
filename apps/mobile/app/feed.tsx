/**
 * Feed — swipe stack with:
 *   1. Three-face card model (front / back-data / peek modal).
 *   2. Persona chip + toast on label change.
 *   3. **Scope strip** — persistent yes/no filters ridden above the feed.
 *   4. **Ask-cards** — interleaved yes/no scope questions (yes = pin chip,
 *      no = clear).
 *   5. **Real-data pagination** — SSR-of-sorts via `/api/mobile/feed` +
 *      tail-fetch when within 5 cards of the end. Falls back to
 *      ASK_POOL cycling if the API is unreachable.
 *
 * Skill: paginated-feed-and-swipe-ui (all invariants).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Modal,
  Pressable,
  Animated as RNAnimated,
  Image,
  ScrollView,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import {
  type FeedCard,
  type FeedPage,
  type CommunityCard,
  type AskCard,
  type ScopeChip,
  ASK_POOL,
  scopeAcceptAsk,
  scopeRejectAsk,
  scopeRemoveLayer,
  derivePersona,
  emptyTally,
  updateTally,
} from '@percho/shared';

const { width: SCREEN_W } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.25;
const LONGPRESS_MS = 800;
const TAIL_TRIGGER = 5; // fetch next page when within 5 of tail
const PAGE_LIMIT = 20;
const ASK_EVERY = 4; // insert an ask-card every N real cards (after initial 3)
const INITIAL_ASKS = 3;

// Web origin for the mobile feed API. Overridable via app.json extra later.
const API_BASE = 'https://percho.co';

// Fallback mock (used only when API is unreachable — first-boot dev / offline).
const MOCK_CARDS: FeedCard[] = [
  {
    kind: 'community',
    id: 'waterside',
    name: 'Waterside',
    city: 'Chapel Hill, NC',
    heroUrl:
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=70&auto=format',
    tags: ['🌳 Wooded', '👨‍👩‍👧 Family', '🏫 Top schools'],
    stats: { median: '$685K', homes: 142, vibe: 'Quiet' },
    traits: {
      family: 90,
      walkable: 40,
      quiet: 85,
      hip: 30,
      schools: 95,
      green: 80,
    },
  },
];

// ─── Ask-card interleaving ──────────────────────────────────────────
// Inject ask-cards at [0, 1, 2, then every ASK_EVERY]. Skip asks whose
// scope layer is already answered. Dedupe by id via the seen-set the
// caller passes.
function interleaveAsks(
  content: FeedCard[],
  answered: Set<string>,
  scopeLayersUsed: Set<string>,
): FeedCard[] {
  const remaining = ASK_POOL.filter(
    (a) => !answered.has(a.id) && !scopeLayersUsed.has(a.scopeType),
  );
  let ai = 0;
  const out: FeedCard[] = [];
  let contentIdx = 0;
  let overallIdx = 0;
  while (contentIdx < content.length || ai < remaining.length) {
    const askTurn =
      (overallIdx < INITIAL_ASKS || overallIdx % ASK_EVERY === 0) &&
      ai < remaining.length;
    if (askTurn) {
      out.push(remaining[ai++]);
    } else if (contentIdx < content.length) {
      out.push(content[contentIdx++]);
    } else if (ai < remaining.length) {
      out.push(remaining[ai++]);
    }
    overallIdx++;
  }
  return out;
}

export default function Feed() {
  const [rawCards, setRawCards] = useState<FeedCard[]>([]);
  const [feedExhausted, setFeedExhausted] = useState(false);
  const fetchingRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState(emptyTally());
  const [scope, setScope] = useState<ScopeChip[]>([]);
  const [answeredAsks, setAnsweredAsks] = useState<Set<string>>(new Set());
  const [flipped, setFlipped] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastAnim = useRef(new RNAnimated.Value(0)).current;
  const prevPersonaName = useRef<string | null>(null);

  const persona = useMemo(() => derivePersona(tally), [tally]);

  // Interleave ask-cards against real content, skipping already-answered
  // asks + already-answered layers. Reruns whenever content or scope change.
  const scopeLayersUsed = useMemo(
    () => new Set(scope.map((c) => c.layer)),
    [scope],
  );
  const feed = useMemo(
    () => interleaveAsks(rawCards, answeredAsks, scopeLayersUsed),
    [rawCards, answeredAsks, scopeLayersUsed],
  );

  const communityTraits = useMemo(() => {
    const map: Record<string, CommunityCard['traits']> = {};
    for (const c of rawCards) if (c.kind === 'community') map[c.id] = c.traits;
    return map;
  }, [rawCards]);

  const card = feed[index];
  const next = feed[index + 1];

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const flipV = useSharedValue(0);

  // ─── Data fetch ──────────────────────────────────────────────────
  useEffect(() => {
    // Initial page
    fetchPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Tail-fetch when within TAIL_TRIGGER of the end of the *real content*
    // (ask cards don't count against the trigger since they're synthetic).
    if (feedExhausted || fetchingRef.current) return;
    const realRemaining = rawCards.length - realIndexOf(feed, index, rawCards);
    if (realRemaining <= TAIL_TRIGGER) fetchPage(rawCards.length);
  }, [index, rawCards.length, feedExhausted, feed]);

  async function fetchPage(offset: number) {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch(
        `${API_BASE}/api/mobile/feed?offset=${offset}&limit=${PAGE_LIMIT}`,
      );
      if (!res.ok) {
        // Fallback: on first-load failure, seed the mock so the surface still swipes.
        if (rawCards.length === 0) {
          for (const c of MOCK_CARDS) seenIdsRef.current.add(c.id);
          setRawCards(MOCK_CARDS);
        }
        setFeedExhausted(true);
        return;
      }
      const body = (await res.json()) as FeedPage;
      const fresh = (body.cards ?? []).filter(
        (c) => !seenIdsRef.current.has(c.id),
      );
      for (const c of fresh) seenIdsRef.current.add(c.id);
      if (fresh.length > 0) setRawCards((p) => [...p, ...fresh]);
      if (body.done || fresh.length === 0) setFeedExhausted(true);
    } catch {
      if (rawCards.length === 0) {
        for (const c of MOCK_CARDS) seenIdsRef.current.add(c.id);
        setRawCards(MOCK_CARDS);
      }
      setFeedExhausted(true);
    } finally {
      fetchingRef.current = false;
    }
  }

  // ─── Interaction ─────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg);
    toastAnim.setValue(0);
    RNAnimated.sequence([
      RNAnimated.timing(toastAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      RNAnimated.delay(1200),
      RNAnimated.timing(toastAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  };

  const advance = () => {
    setIndex((i) => Math.min(i + 1, feed.length));
    setFlipped(false);
    flipV.value = 0;
    tx.value = 0;
    ty.value = 0;
  };

  const commit = (action: 'like' | 'pass') => {
    if (!card) return;
    if (card.kind === 'ask') {
      // Yes → pin chip; No → clear that layer.
      const nextScope =
        action === 'like'
          ? scopeAcceptAsk(scope, card)
          : scopeRejectAsk(scope, card);
      setScope(nextScope);
      setAnsweredAsks((prev) => {
        const s = new Set(prev);
        s.add(card.id);
        return s;
      });
      if (action === 'like') showToast(`+ ${card.chipLabel}`);
      advance();
      return;
    }
    setTally((t) => {
      const nextT = updateTally(t, action, card, communityTraits);
      const nextP = derivePersona(nextT);
      if (prevPersonaName.current == null) prevPersonaName.current = nextP.name;
      else if (nextP.name !== prevPersonaName.current) {
        prevPersonaName.current = nextP.name;
        showToast(`→ You're now ${nextP.name}`);
      }
      return nextT;
    });
    advance();
  };

  const toggleFlip = () => {
    if (card?.kind === 'ask') return; // ask-cards don't flip
    const nextVal = flipped ? 0 : 1;
    flipV.value = withTiming(nextVal, { duration: 320 });
    setFlipped(!flipped);
  };

  const openPeek = () => {
    if (card?.kind === 'ask') return; // no peek on ask-cards
    setPeekOpen(true);
  };

  const removeScope = (layer: ScopeChip['layer']) => {
    setScope((s) => scopeRemoveLayer(s, layer));
  };

  const pan = Gesture.Pan()
    .enabled(!flipped)
    .minDistance(6)
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const dir = e.translationX > 0 ? 'like' : 'pass';
        tx.value = withSpring(e.translationX > 0 ? SCREEN_W * 1.5 : -SCREEN_W * 1.5);
        runOnJS(commit)(dir);
      } else {
        tx.value = withSpring(0);
        ty.value = withSpring(0);
      }
    });

  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(toggleFlip)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(LONGPRESS_MS)
    .maxDistance(6)
    .onStart(() => {
      runOnJS(openPeek)();
    });

  const composed = Gesture.Exclusive(pan, longPress, tap);

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      {
        rotate: `${interpolate(
          tx.value,
          [-SCREEN_W, 0, SCREEN_W],
          [-15, 0, 15],
        )}deg`,
      },
    ],
  }));

  const nextStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          Math.abs(tx.value),
          [0, SWIPE_THRESHOLD],
          [0.94, 1],
          'clamp',
        ),
      },
    ],
    opacity: interpolate(
      Math.abs(tx.value),
      [0, SWIPE_THRESHOLD],
      [0.5, 1],
      'clamp',
    ),
  }));

  const frontFaceStyle = useAnimatedStyle(() => ({ opacity: 1 - flipV.value }));
  const backFaceStyle = useAnimatedStyle(() => ({ opacity: flipV.value }));

  if (!card && rawCards.length === 0 && !feedExhausted) {
    return (
      <View style={styles.container}>
        <Text style={styles.done}>Loading feed…</Text>
      </View>
    );
  }
  if (!card) {
    return (
      <View style={styles.container}>
        <Text style={styles.done}>You're all caught up.</Text>
        <Text style={styles.persona}>Persona: {persona.name}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.personaChip}>
          {persona.name}
          {persona.count > 0 ? ` · ${persona.count.toFixed(1)}` : ''}
        </Text>

        {/* Scope strip */}
        {scope.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scopeStrip}
            contentContainerStyle={styles.scopeStripInner}
            pointerEvents="box-none"
          >
            {scope.map((chip) => (
              <Pressable
                key={chip.layer}
                onPress={() => removeScope(chip.layer)}
                style={styles.scopePill}
              >
                <Text style={styles.scopePillText}>{chip.label}</Text>
                <Text style={styles.scopePillX}> ×</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.stack}>
        {next && (
          <Animated.View style={[styles.card, styles.cardNext, nextStyle]}>
            <CardFront card={next} />
          </Animated.View>
        )}
        <GestureDetector gesture={composed}>
          <Animated.View style={[styles.card, styles.cardTop, topStyle]}>
            <Animated.View
              style={[styles.face, frontFaceStyle]}
              pointerEvents={flipped ? 'none' : 'auto'}
            >
              <CardFront card={card} />
            </Animated.View>
            {card.kind !== 'ask' && (
              <Animated.View
                style={[styles.face, backFaceStyle]}
                pointerEvents={flipped ? 'auto' : 'none'}
              >
                <CardBack card={card} communityTraits={communityTraits} />
              </Animated.View>
            )}
          </Animated.View>
        </GestureDetector>
      </View>

      <Text style={styles.swipeHint}>
        {card.kind === 'ask'
          ? '← No     Swipe to answer     Yes →'
          : flipped
            ? 'Tap to flip back · Hold to peek'
            : '← No     Tap: data · Hold: peek     Yes →'}
      </Text>

      {toast && (
        <RNAnimated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.toastText}>{toast}</Text>
        </RNAnimated.View>
      )}

      <Modal
        visible={peekOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPeekOpen(false)}
      >
        <View style={styles.peekBackdrop}>
          <View style={styles.peekCard}>
            <CardFront card={card} big />
            <View style={styles.peekActions}>
              <Pressable
                style={styles.peekPrimary}
                onPress={() => setPeekOpen(false)}
              >
                <Text style={styles.peekPrimaryText}>Explore →</Text>
              </Pressable>
              <Pressable
                style={styles.peekSecondary}
                onPress={() => setPeekOpen(false)}
              >
                <Text style={styles.peekSecondaryText}>Back to feed</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Utility — where does the currently-displayed card map to in rawCards?
// Used to compute "how many real content cards are left after `index`".
function realIndexOf(
  feed: FeedCard[],
  displayIndex: number,
  rawCards: FeedCard[],
): number {
  let real = 0;
  for (let i = 0; i <= displayIndex && i < feed.length; i++) {
    if (feed[i].kind !== 'ask') real++;
  }
  return Math.min(real, rawCards.length);
}

// ─── Card faces ─────────────────────────────────────────────────────
function CardFront({ card, big }: { card: FeedCard; big?: boolean }) {
  if (card.kind === 'ask') return <AskFront card={card} big={big} />;
  if (card.kind === 'community') {
    return (
      <View style={styles.faceInner}>
        <View style={styles.hero}>
          {!!card.heroUrl && (
            <Image source={{ uri: card.heroUrl }} style={styles.heroImg} />
          )}
          <View style={styles.heroDim} />
          <Text style={styles.kindChip}>COMMUNITY</Text>
          {big && <Text style={styles.peekLabel}>👁 Peek</Text>}
        </View>
        <View style={styles.footer}>
          <Text style={styles.title}>{card.name}</Text>
          <Text style={styles.subtitle}>{card.city}</Text>
          <Text style={styles.stats}>
            {card.stats.median} · {card.stats.homes} homes · {card.stats.vibe}
          </Text>
          <View style={styles.tagRow}>
            {card.tags.slice(0, 3).map((t) => (
              <Text key={t} style={styles.tag}>
                {t}
              </Text>
            ))}
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.faceInner}>
      <View style={styles.hero}>
        {!!card.heroUrl && (
          <Image source={{ uri: card.heroUrl }} style={styles.heroImg} />
        )}
        <View style={styles.heroDim} />
        <Text style={styles.kindChip}>LISTING</Text>
        {card.matchScore != null && (
          <Text style={styles.matchChip}>🎯 {card.matchScore}% MATCH</Text>
        )}
        {big && <Text style={styles.peekLabel}>👁 Peek</Text>}
      </View>
      <View style={styles.footer}>
        <Text style={styles.title}>{card.address}</Text>
        <Text style={styles.subtitle}>{card.priceLabel}</Text>
        <Text style={styles.stats}>{card.bedBathSqft}</Text>
      </View>
    </View>
  );
}

function AskFront({ card, big }: { card: AskCard; big?: boolean }) {
  return (
    <View style={styles.faceInner}>
      <View style={styles.hero}>
        {!!card.heroUrl && (
          <Image source={{ uri: card.heroUrl }} style={styles.heroImg} />
        )}
        <View style={styles.askDim} />
        <Text style={styles.askKindChip}>QUICK ASK</Text>
        <View style={styles.askCenter}>
          <Text style={styles.askQ}>{card.q}</Text>
          <Text style={styles.askSub}>{card.sub}</Text>
        </View>
        {big && <Text style={styles.peekLabel}>👁 Peek</Text>}
      </View>
      <View style={styles.askFooter}>
        <View style={styles.askAction}>
          <Text style={styles.askActionNo}>← No</Text>
        </View>
        <View style={styles.askAction}>
          <Text style={styles.askActionYes}>Yes →</Text>
        </View>
      </View>
    </View>
  );
}

function CardBack({
  card,
  communityTraits,
}: {
  card: FeedCard;
  communityTraits: Record<string, CommunityCard['traits']>;
}) {
  if (card.kind === 'ask') return null;
  const community =
    card.kind === 'community'
      ? card
      : card.communityId
        ? undefined
        : undefined;
  const traits =
    card.kind === 'community'
      ? card.traits
      : card.communityId
        ? communityTraits[card.communityId] ?? {}
        : {};
  return (
    <View style={styles.back}>
      <Text style={styles.backTitle}>
        {card.kind === 'community' ? card.name : card.address}
      </Text>
      <Text style={styles.backSubtitle}>
        {card.kind === 'community' ? card.city : card.priceLabel}
      </Text>

      {Object.keys(traits).length > 0 && (
        <>
          <Text style={styles.backSectionLabel}>Neighborhood traits</Text>
          <View style={styles.traitList}>
            {Object.entries(traits).map(([k, v]) => (
              <View key={k} style={styles.traitRow}>
                <Text style={styles.traitLabel}>{k}</Text>
                <View style={styles.traitBarTrack}>
                  <View style={[styles.traitBarFill, { width: `${v}%` }]} />
                </View>
                <Text style={styles.traitValue}>{v}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {card.kind === 'listing' && (
        <>
          <Text style={styles.backSectionLabel}>Home</Text>
          <Text style={styles.backBody}>{card.bedBathSqft}</Text>
          <Text style={styles.backBody}>{card.priceLabel}</Text>
        </>
      )}
      {card.kind === 'community' && (
        <>
          <Text style={styles.backSectionLabel}>Community</Text>
          <Text style={styles.backBody}>
            {card.stats.median} median · {card.stats.homes} homes · vibe:{' '}
            {card.stats.vibe}
          </Text>
        </>
      )}

      <Text style={styles.backHint}>Tap to flip back</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3eee7', paddingTop: 60 },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  personaChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#f59e0b',
    color: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 13,
    fontWeight: '600',
  },
  scopeStrip: { marginTop: 10, maxHeight: 34 },
  scopeStripInner: { gap: 6, paddingRight: 20 },
  scopePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  scopePillText: { color: '#f3eee7', fontSize: 12, fontWeight: '600' },
  scopePillX: { color: '#c9c3ba', fontSize: 14, fontWeight: '700' },

  stack: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute',
    width: SCREEN_W - 32,
    aspectRatio: 3 / 5,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  cardTop: { zIndex: 5 },
  cardNext: { zIndex: 4, opacity: 0.5, transform: [{ scale: 0.94 }] },
  face: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  faceInner: { flex: 1 },
  hero: { flex: 1, padding: 16, backgroundColor: '#2a3040' },
  heroImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  kindChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.9)',
    color: '#1a1a1a',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    letterSpacing: 1,
    overflow: 'hidden',
  },
  matchChip: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#f59e0b',
    color: '#1a1a1a',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  peekLabel: {
    position: 'absolute',
    top: 16,
    right: 16,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  footer: { padding: 20, backgroundColor: 'rgba(0,0,0,0.85)' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#f3eee7', fontSize: 16, marginTop: 4 },
  stats: { color: '#c9c3ba', fontSize: 13, marginTop: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 6 },
  tag: {
    color: '#f3eee7',
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  swipeHint: {
    textAlign: 'center',
    color: '#5a5651',
    fontSize: 13,
    paddingBottom: 40,
  },
  done: { color: '#313131', fontSize: 24, textAlign: 'center', marginTop: 200 },
  persona: {
    color: '#5a5651',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
  },

  // Back face
  back: { flex: 1, backgroundColor: '#1a1a1a', padding: 24 },
  backTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  backSubtitle: {
    color: '#c9c3ba',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 24,
  },
  backSectionLabel: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
  },
  traitList: { gap: 8 },
  traitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  traitLabel: {
    color: '#c9c3ba',
    fontSize: 12,
    width: 70,
    textTransform: 'capitalize',
  },
  traitBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  traitBarFill: { height: 6, backgroundColor: '#f59e0b' },
  traitValue: {
    color: '#f3eee7',
    fontSize: 12,
    width: 28,
    textAlign: 'right',
  },
  backBody: { color: '#f3eee7', fontSize: 14, marginTop: 4 },
  backHint: {
    color: '#5a5651',
    fontSize: 12,
    marginTop: 'auto',
    paddingTop: 24,
    textAlign: 'center',
  },

  // Ask card
  askDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  askKindChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#f59e0b',
    color: '#1a1a1a',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    letterSpacing: 1,
    overflow: 'hidden',
  },
  askCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    padding: 32,
  },
  askQ: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 36,
  },
  askSub: {
    color: '#f3eee7',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    opacity: 0.9,
  },
  askFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  askAction: { flex: 1, alignItems: 'center' },
  askActionNo: { color: '#c9c3ba', fontSize: 15, fontWeight: '600' },
  askActionYes: { color: '#f59e0b', fontSize: 15, fontWeight: '700' },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toastText: {
    backgroundColor: '#1a1a1a',
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },

  // Peek modal
  peekBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  peekCard: {
    width: '100%',
    aspectRatio: 3 / 5,
    maxHeight: '90%',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  peekActions: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    gap: 10,
  },
  peekPrimary: {
    backgroundColor: '#f59e0b',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  peekPrimaryText: { color: '#1a1a1a', fontSize: 16, fontWeight: '700' },
  peekSecondary: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  peekSecondaryText: { color: '#f3eee7', fontSize: 14 },
});

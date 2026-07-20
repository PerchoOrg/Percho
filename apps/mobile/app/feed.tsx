/**
 * Feed skeleton — mock cards, three-face model.
 *
 * Ports the vibe/feed.html web prototype into RN:
 *   1. Front face (hero + overlays) — full-bleed, minimal chrome.
 *   2. Back face (data face) — traits, stats, POI-like blurbs.
 *      Tap card → opacity crossfade to back. Skill: NEVER use 3D rotate.
 *   4. Longpress deep peek — hold ~800ms → modal shows big hero + primary
 *      "Explore →". This is the ⭐ depth-conversion mechanic from
 *      paginated-feed-and-swipe-ui skill.
 *   +  Persona toast on label change — 1.6s bottom pill.
 *
 * NOT wired yet: video autoplay, API pagination, scope strip. Next passes.
 */
import { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Modal,
  Pressable,
  Animated as RNAnimated,
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
  type CommunityCard,
  type ListingCard,
  derivePersona,
  emptyTally,
  updateTally,
} from '@percho/shared';

const { width: SCREEN_W } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.25;
const LONGPRESS_MS = 800;

const MOCK_CARDS: FeedCard[] = [
  {
    kind: 'community',
    id: 'waterside',
    name: 'Waterside',
    city: 'Chapel Hill, NC',
    heroUrl: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=70&auto=format',
    tags: ['🌳 Wooded', '👨‍👩‍👧 Family', '🏫 Top schools'],
    stats: { median: '$685K', homes: 142, vibe: 'Quiet' },
    traits: { family: 90, walkable: 40, quiet: 85, hip: 30, schools: 95, green: 80 },
  },
  {
    kind: 'listing',
    id: 'l-5122',
    slug: '5122-lower-creek',
    address: '5122 Lower Creek St',
    priceLabel: '$540K',
    bedBathSqft: '3 bd · 2 ba · 1,840 sqft',
    heroUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=70&auto=format',
    communityId: 'waterside',
    matchScore: 92,
  },
  {
    kind: 'community',
    id: 'oldtown',
    name: 'Old Town',
    city: 'Durham, NC',
    heroUrl: 'https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=900&q=70&auto=format',
    tags: ['🎨 Hip', '🚶 Walkable', '🌃 Nightlife'],
    stats: { median: '$495K', homes: 88, vibe: 'Buzzy' },
    traits: { walkable: 90, hip: 88, nightlife: 75, quiet: 20, family: 40, schools: 60 },
  },
  {
    kind: 'listing',
    id: 'l-oldtown-1',
    slug: '221-magnolia',
    address: '221 Magnolia Ave',
    priceLabel: '$465K',
    bedBathSqft: '2 bd · 2 ba · 1,320 sqft',
    heroUrl: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900&q=70&auto=format',
    communityId: 'oldtown',
    matchScore: 78,
  },
];

const COMMUNITY_TRAITS = Object.fromEntries(
  MOCK_CARDS.filter((c): c is CommunityCard => c.kind === 'community').map((c) => [c.id, c.traits]),
);

const COMMUNITY_BY_ID = Object.fromEntries(
  MOCK_CARDS.filter((c): c is CommunityCard => c.kind === 'community').map((c) => [c.id, c]),
);

export default function Feed() {
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState(emptyTally());
  const [flipped, setFlipped] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastAnim = useRef(new RNAnimated.Value(0)).current;
  const prevPersonaName = useRef<string | null>(null);

  const persona = useMemo(() => derivePersona(tally), [tally]);
  const card = MOCK_CARDS[index];
  const next = MOCK_CARDS[index + 1];

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const flipV = useSharedValue(0); // 0 = front, 1 = back

  const showToast = (msg: string) => {
    setToast(msg);
    toastAnim.setValue(0);
    RNAnimated.sequence([
      RNAnimated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      RNAnimated.delay(1200),
      RNAnimated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  const commit = (action: 'like' | 'pass') => {
    if (!card) return;
    setTally((t) => {
      const nextT = updateTally(t, action, card, COMMUNITY_TRAITS);
      // check persona label change post-update
      const nextP = derivePersona(nextT);
      if (prevPersonaName.current == null) prevPersonaName.current = nextP.name;
      else if (nextP.name !== prevPersonaName.current) {
        prevPersonaName.current = nextP.name;
        showToast(`→ You're now ${nextP.name}`);
      }
      return nextT;
    });
    setIndex((i) => Math.min(i + 1, MOCK_CARDS.length));
    setFlipped(false);
    flipV.value = 0;
    tx.value = 0;
    ty.value = 0;
  };

  const toggleFlip = () => {
    const nextVal = flipped ? 0 : 1;
    flipV.value = withTiming(nextVal, { duration: 320 });
    setFlipped(!flipped);
  };

  const openPeek = () => {
    setPeekOpen(true);
  };

  // Pan gesture — disabled when flipped so user can read data face
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

  // Tap → flip front↔back. Distinct from longpress by duration.
  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(toggleFlip)();
    });

  // Longpress → open peek modal. 800ms, cancels on 4px drift.
  const longPress = Gesture.LongPress()
    .minDuration(LONGPRESS_MS)
    .maxDistance(6)
    .onStart(() => {
      runOnJS(openPeek)();
    });

  // Priority order: pan wins if it triggers first (drift), longpress wins on
  // stationary hold, tap wins on quick release. Exclusive is the right combo.
  const composed = Gesture.Exclusive(pan, longPress, tap);

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-SCREEN_W, 0, SCREEN_W], [-15, 0, 15])}deg` },
    ],
  }));

  const nextStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(Math.abs(tx.value), [0, SWIPE_THRESHOLD], [0.94, 1], 'clamp'),
      },
    ],
    opacity: interpolate(Math.abs(tx.value), [0, SWIPE_THRESHOLD], [0.5, 1], 'clamp'),
  }));

  const frontFaceStyle = useAnimatedStyle(() => ({ opacity: 1 - flipV.value }));
  const backFaceStyle = useAnimatedStyle(() => ({ opacity: flipV.value }));

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
          {persona.name} · {persona.count.toFixed(1)}
        </Text>
      </View>
      <View style={styles.stack}>
        {next && (
          <Animated.View style={[styles.card, styles.cardNext, nextStyle]}>
            <CardFront card={next} />
          </Animated.View>
        )}
        <GestureDetector gesture={composed}>
          <Animated.View style={[styles.card, styles.cardTop, topStyle]}>
            <Animated.View style={[styles.face, frontFaceStyle]} pointerEvents={flipped ? 'none' : 'auto'}>
              <CardFront card={card} />
            </Animated.View>
            <Animated.View style={[styles.face, backFaceStyle]} pointerEvents={flipped ? 'auto' : 'none'}>
              <CardBack card={card} />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
      <Text style={styles.swipeHint}>
        {flipped
          ? 'Tap to flip back · Hold to peek'
          : '← No     Tap: data · Hold: peek     Yes →'}
      </Text>

      {/* Persona toast */}
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

      {/* Deep peek modal */}
      <Modal visible={peekOpen} transparent animationType="fade" onRequestClose={() => setPeekOpen(false)}>
        <View style={styles.peekBackdrop}>
          <View style={styles.peekCard}>
            <CardFront card={card} big />
            <View style={styles.peekActions}>
              <Pressable style={styles.peekPrimary} onPress={() => setPeekOpen(false)}>
                <Text style={styles.peekPrimaryText}>Explore →</Text>
              </Pressable>
              <Pressable style={styles.peekSecondary} onPress={() => setPeekOpen(false)}>
                <Text style={styles.peekSecondaryText}>Back to feed</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CardFront({ card, big }: { card: FeedCard; big?: boolean }) {
  if (card.kind === 'community') {
    return (
      <View style={styles.faceInner}>
        <View style={[styles.hero, { backgroundColor: '#3a4a3a' }]}>
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
      <View style={[styles.hero, { backgroundColor: '#2a3040' }]}>
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

function CardBack({ card }: { card: FeedCard }) {
  const community = card.kind === 'community' ? card : card.communityId ? COMMUNITY_BY_ID[card.communityId] : undefined;
  const traits = community?.traits ?? {};
  return (
    <View style={styles.back}>
      <Text style={styles.backTitle}>
        {card.kind === 'community' ? card.name : card.address}
      </Text>
      <Text style={styles.backSubtitle}>
        {card.kind === 'community' ? card.city : card.priceLabel}
      </Text>

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
            {card.stats.median} median · {card.stats.homes} homes · vibe: {card.stats.vibe}
          </Text>
        </>
      )}

      <Text style={styles.backHint}>Tap to flip back</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3eee7', paddingTop: 60 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
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
  face: { position: 'absolute', inset: 0, top: 0, left: 0, right: 0, bottom: 0 },
  faceInner: { flex: 1 },
  hero: { flex: 1, padding: 16 },
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
  persona: { color: '#5a5651', fontSize: 15, textAlign: 'center', marginTop: 12 },

  // Back face
  back: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    padding: 24,
  },
  backTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  backSubtitle: { color: '#c9c3ba', fontSize: 14, marginTop: 4, marginBottom: 24 },
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
  traitLabel: { color: '#c9c3ba', fontSize: 12, width: 70, textTransform: 'capitalize' },
  traitBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  traitBarFill: { height: 6, backgroundColor: '#f59e0b' },
  traitValue: { color: '#f3eee7', fontSize: 12, width: 28, textAlign: 'right' },
  backBody: { color: '#f3eee7', fontSize: 14, marginTop: 4 },
  backHint: {
    color: '#5a5651',
    fontSize: 12,
    marginTop: 'auto',
    paddingTop: 24,
    textAlign: 'center',
  },

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

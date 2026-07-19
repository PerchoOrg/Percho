/**
 * Feed skeleton — 3 mock cards, Tinder-style horizontal swipe.
 *
 * NOT production feed logic. This exists to prove:
 *   1. Reanimated 3 + gesture-handler swipe stack renders on iOS.
 *   2. @percho/shared types + persona derivation import cleanly from mobile.
 *   3. The three-face card model (front / back / explore) has a home.
 *
 * Real feed will replace this with:
 *   - API-driven pagination (see paginated-feed-and-swipe-ui skill)
 *   - Video autoplay via expo-video
 *   - Flip-to-data-face via opacity crossfade
 *   - Long-press deep peek modal
 *   - Live persona chip + toast on label change
 *   - Scope strip ask-cards
 */
import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import {
  type FeedCard,
  derivePersona,
  emptyTally,
  updateTally,
} from '@percho/shared';

const { width: SCREEN_W } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.25;

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
];

const COMMUNITY_TRAITS = Object.fromEntries(
  MOCK_CARDS.filter((c) => c.kind === 'community').map((c) => [c.id, c.traits]),
);

export default function Feed() {
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState(emptyTally());
  const persona = useMemo(() => derivePersona(tally), [tally]);
  const card = MOCK_CARDS[index];
  const next = MOCK_CARDS[index + 1];

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const commit = (action: 'like' | 'pass') => {
    setTally((t) => updateTally(t, action, card as FeedCard, COMMUNITY_TRAITS));
    setIndex((i) => Math.min(i + 1, MOCK_CARDS.length));
    tx.value = 0;
    ty.value = 0;
  };

  const pan = Gesture.Pan()
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
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.card, styles.cardTop, topStyle]}>
            <CardFront card={card} />
          </Animated.View>
        </GestureDetector>
      </View>
      <Text style={styles.swipeHint}>← Swipe left · No     Swipe right · Yes →</Text>
    </View>
  );
}

function CardFront({ card }: { card: FeedCard }) {
  if (card.kind === 'community') {
    return (
      <View style={styles.faceFront}>
        <View style={[styles.hero, { backgroundColor: '#3a3a3a' }]}>
          <Text style={styles.kindChip}>COMMUNITY</Text>
        </View>
        <View style={styles.footer}>
          <Text style={styles.title}>{card.name}</Text>
          <Text style={styles.subtitle}>{card.city}</Text>
          <Text style={styles.stats}>
            {card.stats.median} · {card.stats.homes} homes · {card.stats.vibe}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.faceFront}>
      <View style={[styles.hero, { backgroundColor: '#2a2a2a' }]}>
        <Text style={styles.kindChip}>LISTING</Text>
        {card.matchScore != null && (
          <Text style={styles.matchChip}>🎯 {card.matchScore}% MATCH</Text>
        )}
      </View>
      <View style={styles.footer}>
        <Text style={styles.title}>{card.address}</Text>
        <Text style={styles.subtitle}>{card.priceLabel}</Text>
        <Text style={styles.stats}>{card.bedBathSqft}</Text>
      </View>
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
  faceFront: { flex: 1 },
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
  },
  footer: { padding: 20, backgroundColor: 'rgba(0,0,0,0.85)' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#f3eee7', fontSize: 16, marginTop: 4 },
  stats: { color: '#c9c3ba', fontSize: 13, marginTop: 8 },
  swipeHint: {
    textAlign: 'center',
    color: '#5a5651',
    fontSize: 13,
    paddingBottom: 40,
  },
  done: { color: '#313131', fontSize: 24, textAlign: 'center', marginTop: 200 },
  persona: { color: '#5a5651', fontSize: 15, textAlign: 'center', marginTop: 12 },
});

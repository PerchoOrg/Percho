import {
	ASK_POOL,
	type AskCard,
	CHALLENGE_POOL,
	type ChallengeCard,
	type CommunityCard,
	type DimKey,
	type EvidenceProfile,
	type FeedCard,
	type FeedPage,
	type InsightCard,
	type ListingCard,
	type ScopeChip,
	type SlotKind,
	TRADEOFF_POOL,
	type TradeoffCard,
	bumpDim,
	derivePersona,
	emptyTally,
	pickInsight,
	scopeAcceptAsk,
	scopeRejectAsk,
	scopeRemoveLayer,
	slotAt,
	updateTally,
	whyLine,
} from "@percho/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
/**
 * Feed — swipe stack with:
 *   1. Three-face card model (front / back-data / peek modal).
 *   2. Persona chip + toast on label change.
 *   3. **Scope strip** — persistent yes/no filters ridden above the feed.
 *   4. **Six card types** — community, listing, ask, tradeoff, challenge,
 *      insight — driven by a shared rhythm engine (see packages/shared/
 *      rhythm.ts).
 *   5. **Evidence profile** — per-dim counters bumped on likes; drives the
 *      back-face WHY line and insight cards.
 *   6. **Real-data pagination** — via `/api/mobile/feed` + tail-fetch. Falls
 *      back to a MOCK card if the API is unreachable.
 *
 * Skill: paginated-feed-and-swipe-ui (all invariants).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
	Dimensions,
	Image,
	Modal,
	Pressable,
	Animated as RNAnimated,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withSpring,
	withTiming,
	runOnJS,
	interpolate,
} from "react-native-reanimated";

const { width: SCREEN_W } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_W * 0.25;
const LONGPRESS_MS = 800;
const TAIL_TRIGGER = 5;
const PAGE_LIMIT = 20;
const API_BASE = "https://percho.co";

// AsyncStorage — mirror web localStorage naming (percho-v3: prefix).
const STATE_KEY = "percho-v3:state:v1";
const SAVE_DEBOUNCE_MS = 300;

interface PersistedState {
	swipes: number;
	profile: EvidenceProfile;
	tally: ReturnType<typeof emptyTally>;
	insightsFired: DimKey[];
}

// Fallback mock (used only when API is unreachable — first-boot dev / offline).
const MOCK_CARDS: FeedCard[] = [
	{
		kind: "community",
		id: "waterside",
		name: "Waterside",
		city: "Chapel Hill, NC",
		heroUrl:
			"https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=70&auto=format",
		tags: ["🌳 Wooded", "👨‍👩‍👧 Family", "🏫 Top schools"],
		stats: { median: "$685K", homes: 142, vibe: "Quiet" },
		traits: {
			family: 90,
			walkable: 40,
			quiet: 85,
			hip: 30,
			schools: 95,
			green: 80,
		},
		dims: ["outdoors", "trails", "quiet", "schools", "family"],
		hook: "Cul-de-sacs, mature oaks, Bolin Creek Trail runs behind the lots.",
	},
];

// ─── Rhythm-driven display feed builder ─────────────────────────────
// Walks positions 0..N; for each position, asks the rhythm engine which
// slot kind to emit, then pulls from the appropriate pool. If a slot
// can't be filled (insight not eligible, listings exhausted early),
// advances slotPos and tries the next — mirrors _data.js `nextCard()`.

interface BuildCtx {
	rawCards: FeedCard[];
	answeredAsks: Set<string>;
	scopeLayersUsed: Set<string>;
	evidence: EvidenceProfile;
	firedInsights: DimKey[];
	feedExhausted: boolean;
}

function buildDisplay(ctx: BuildCtx, targetLen: number): FeedCard[] {
	const out: FeedCard[] = [];
	let slotPos = 0;
	let li = 0;
	let ci = 0;
	let ai = 0;
	let ti = 0;
	let chi = 0;
	const localFired = [...ctx.firedInsights];

	const listings = ctx.rawCards.filter((c) => c.kind === "listing");
	const communities = ctx.rawCards.filter((c) => c.kind === "community");
	const askQueue = ASK_POOL.filter(
		(a) => !ctx.answeredAsks.has(a.id) && !ctx.scopeLayersUsed.has(a.scopeType),
	);

	// Safety cap so a malformed slot plan can't infinite-loop.
	const SAFETY = targetLen * 6 + 60;
	let steps = 0;
	while (out.length < targetLen && steps < SAFETY) {
		steps++;
		const kind: SlotKind = slotAt(slotPos);
		slotPos++;

		let card: FeedCard | null = null;
		if (kind === "listing") {
			if (li < listings.length) card = listings[li++] ?? null;
		} else if (kind === "community") {
			if (ci < communities.length) card = communities[ci++] ?? null;
		} else if (kind === "preference") {
			if (ai < askQueue.length) card = askQueue[ai++] ?? null;
		} else if (kind === "tradeoff") {
			const t = TRADEOFF_POOL[ti % TRADEOFF_POOL.length];
			ti++;
			card = t ?? null;
		} else if (kind === "challenge") {
			const c = CHALLENGE_POOL[chi % CHALLENGE_POOL.length];
			chi++;
			card = c ?? null;
		} else if (kind === "insight") {
			const ins = pickInsight(ctx.evidence, localFired);
			if (ins) {
				localFired.push(ins.dim);
				const insightCard: InsightCard = {
					kind: "insight",
					id: `insight-${ins.dim}-${out.length}`,
					dim: ins.dim,
					text: ins.text,
					evidence: ins.evidence,
				};
				card = insightCard;
			}
		}

		if (card) out.push(card);

		// After exhaustion (paged + all asks answered), fall back to looping
		// listings/community only — matches skill "loop only after exhaustion".
		if (
			ctx.feedExhausted &&
			li >= listings.length &&
			ci >= communities.length &&
			ai >= askQueue.length &&
			out.length > 0 &&
			out.length < targetLen
		) {
			// Emit a listing or community from the tail loop.
			const loopFrom = listings.length > 0 ? listings : communities;
			if (loopFrom.length > 0) {
				const rec = loopFrom[out.length % loopFrom.length];
				if (rec) out.push(rec);
				else break;
			} else {
				break;
			}
		}
	}
	return out;
}

export default function Feed() {
	const router = useRouter();
	const [rawCards, setRawCards] = useState<FeedCard[]>([]);
	const [feedExhausted, setFeedExhausted] = useState(false);
	const fetchingRef = useRef(false);
	const seenIdsRef = useRef<Set<string>>(new Set());

	const [index, setIndex] = useState(0);
	const [swipes, setSwipes] = useState(0);
	const [tally, setTally] = useState(emptyTally());
	const [evidence, setEvidence] = useState<EvidenceProfile>([]);
	const [firedInsights, setFiredInsights] = useState<DimKey[]>([]);
	const [hydrated, setHydrated] = useState(false);
	const [scope, setScope] = useState<ScopeChip[]>([]);
	const [answeredAsks, setAnsweredAsks] = useState<Set<string>>(new Set());
	const [revealedChallenges, setRevealedChallenges] = useState<
		Record<string, number>
	>({});
	const [flipped, setFlipped] = useState(false);
	const [peekOpen, setPeekOpen] = useState(false);
	const [toast, setToast] = useState<string | null>(null);
	const toastAnim = useRef(new RNAnimated.Value(0)).current;
	const prevPersonaName = useRef<string | null>(null);

	const persona = useMemo(() => derivePersona(tally), [tally]);

	const scopeLayersUsed = useMemo(
		() => new Set<string>(scope.map((c) => c.layer)),
		[scope],
	);

	// Community traits lookup — used by listing back face + persona tally.
	const communityTraits = useMemo(() => {
		const map: Record<string, CommunityCard["traits"]> = {};
		for (const c of rawCards) if (c.kind === "community") map[c.id] = c.traits;
		return map;
	}, [rawCards]);

	const feed = useMemo(
		() =>
			buildDisplay(
				{
					rawCards,
					answeredAsks,
					scopeLayersUsed,
					evidence,
					firedInsights,
					feedExhausted,
				},
				// Build enough to cover current view + a lookahead buffer.
				Math.max(index + 3, 20),
			),
		[
			rawCards,
			answeredAsks,
			scopeLayersUsed,
			evidence,
			firedInsights,
			feedExhausted,
			index,
		],
	);

	const card = feed[index];
	const next = feed[index + 1];

	const tx = useSharedValue(0);
	const ty = useSharedValue(0);
	const flipV = useSharedValue(0);

	useEffect(() => {
		fetchPage(0);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Hydrate persisted user signal from AsyncStorage once on mount.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const raw = await AsyncStorage.getItem(STATE_KEY);
				if (!cancelled && raw) {
					const parsed = JSON.parse(raw) as Partial<PersistedState>;
					if (typeof parsed.swipes === "number") setSwipes(parsed.swipes);
					if (parsed.profile) setEvidence(parsed.profile);
					if (parsed.tally) setTally(parsed.tally);
					if (parsed.insightsFired) setFiredInsights(parsed.insightsFired);
				}
			} catch {
				// Ignore corrupt state — start fresh.
			} finally {
				if (!cancelled) setHydrated(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// Debounced save of user signal only (not raw feed / display / seen).
	useEffect(() => {
		if (!hydrated) return;
		const t = setTimeout(() => {
			const state: PersistedState = {
				swipes,
				profile: evidence,
				tally,
				insightsFired: firedInsights,
			};
			AsyncStorage.setItem(STATE_KEY, JSON.stringify(state)).catch(() => {});
		}, SAVE_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [hydrated, swipes, evidence, tally, firedInsights]);

	useEffect(() => {
		if (feedExhausted || fetchingRef.current) return;
		// Count how many raw listing/community cards have been consumed by the
		// display feed up to the current index — tail-fetch when close to end.
		let consumed = 0;
		for (let i = 0; i <= index && i < feed.length; i++) {
			const c = feed[i];
			if (c && (c.kind === "listing" || c.kind === "community")) consumed++;
		}
		const realRemaining = rawCards.length - consumed;
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
		setIndex((i) => i + 1);
		setSwipes((s) => s + 1);
		setFlipped(false);
		flipV.value = 0;
		tx.value = 0;
		ty.value = 0;
	};

	const commit = (action: "like" | "pass") => {
		if (!card) return;
		if (card.kind === "ask") {
			const nextScope =
				action === "like"
					? scopeAcceptAsk(scope, card)
					: scopeRejectAsk(scope, card);
			setScope(nextScope);
			setAnsweredAsks((prev) => {
				const s = new Set(prev);
				s.add(card.id);
				return s;
			});
			if (action === "like") showToast(`+ ${card.chipLabel}`);
			advance();
			return;
		}
		if (card.kind === "tradeoff") {
			const chosen = action === "like" ? card.R.dim : card.L.dim;
			setEvidence((p) => bumpDim(p, chosen));
			advance();
			return;
		}
		if (card.kind === "challenge") {
			// Swipes on challenge don't produce signal — just advance.
			advance();
			return;
		}
		if (card.kind === "insight") {
			if (action === "like") {
				// Agree — keep the fired insight, small evidence reinforcement.
				setFiredInsights((p) => (p.includes(card.dim) ? p : [...p, card.dim]));
			} else {
				// Disagree — de-weight this dim.
				setEvidence((p) => bumpDim(p, card.dim, -2));
			}
			advance();
			return;
		}
		// community / listing
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
		if (action === "like") {
			const dims = (card as CommunityCard | ListingCard).dims;
			if (dims && dims.length > 0) {
				setEvidence((p) => dims.reduce((acc, d) => bumpDim(acc, d), p));
			}
		}
		advance();
	};

	const toggleFlip = () => {
		// Only listings + communities have a back-face data view.
		if (card?.kind !== "community" && card?.kind !== "listing") return;
		const nextVal = flipped ? 0 : 1;
		flipV.value = withTiming(nextVal, { duration: 320 });
		setFlipped(!flipped);
	};

	const openPeek = () => {
		if (card?.kind !== "community" && card?.kind !== "listing") return;
		setPeekOpen(true);
	};

	const removeScope = (layer: ScopeChip["layer"]) => {
		setScope((s) => scopeRemoveLayer(s, layer));
	};

	const skipAsk = () => {
		if (card?.kind !== "ask") return;
		setAnsweredAsks((prev) => {
			const s = new Set(prev);
			s.add(card.id);
			return s;
		});
		advance();
	};

	const revealChallenge = (option: number) => {
		if (card?.kind !== "challenge") return;
		setRevealedChallenges((prev) => ({ ...prev, [card.id]: option }));
	};

	const explorePlace = () => {
		if (!card) return;
		setPeekOpen(false);
		router.push(`/place/${card.id}`);
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
				const dir = e.translationX > 0 ? "like" : "pass";
				tx.value = withSpring(
					e.translationX > 0 ? SCREEN_W * 1.5 : -SCREEN_W * 1.5,
				);
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
					"clamp",
				),
			},
		],
		opacity: interpolate(
			Math.abs(tx.value),
			[0, SWIPE_THRESHOLD],
			[0.5, 1],
			"clamp",
		),
	}));

	const frontFaceStyle = useAnimatedStyle(() => ({ opacity: 1 - flipV.value }));
	const backFaceStyle = useAnimatedStyle(() => ({ opacity: flipV.value }));

	if (!hydrated) {
		return (
			<View style={styles.container}>
				<Text style={styles.done}>Loading…</Text>
			</View>
		);
	}
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

	const hasBackFace = card.kind === "community" || card.kind === "listing";
	const revealedOpt =
		card.kind === "challenge" ? revealedChallenges[card.id] : undefined;

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.personaChip}>
					{persona.name}
					{persona.count > 0 ? ` · ${persona.count.toFixed(1)}` : ""}
				</Text>

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
						<CardFront card={next} evidence={evidence} />
					</Animated.View>
				)}
				<GestureDetector gesture={composed}>
					<Animated.View style={[styles.card, styles.cardTop, topStyle]}>
						<Animated.View
							style={[styles.face, frontFaceStyle]}
							pointerEvents={flipped ? "none" : "auto"}
						>
							<CardFront
								card={card}
								evidence={evidence}
								active={!flipped}
								revealedOpt={revealedOpt}
								onRevealChallenge={revealChallenge}
								onSkipAsk={skipAsk}
							/>
						</Animated.View>
						{hasBackFace && (
							<Animated.View
								style={[styles.face, backFaceStyle]}
								pointerEvents={flipped ? "auto" : "none"}
							>
								<CardBack
									card={card}
									communityTraits={communityTraits}
									evidence={evidence}
								/>
							</Animated.View>
						)}
					</Animated.View>
				</GestureDetector>
			</View>

			<Text style={styles.swipeHint}>
				{card.kind === "ask"
					? "← No     Swipe to answer     Yes →"
					: card.kind === "tradeoff"
						? `← ${card.L.label}     ·     ${card.R.label} →`
						: card.kind === "challenge"
							? revealedOpt != null
								? "Swipe to continue"
								: "Tap an option — or swipe to skip"
							: card.kind === "insight"
								? "← Disagree     Agree →"
								: flipped
									? "Tap to flip back · Hold to peek"
									: "← No     Tap: data · Hold: peek     Yes →"}
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
						<CardFront card={card} evidence={evidence} big />
						<View style={styles.peekActions}>
							<Pressable style={styles.peekPrimary} onPress={explorePlace}>
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

// ─── Card faces ─────────────────────────────────────────────────────
// CardVideo — per-card video player (own hook). Only autoplay when the
// card is the active/top card. Falls back to poster (hero image) otherwise.
// pointerEvents="none" so swipe gestures pass through to the card container.
function CardVideo({
	url,
	poster,
	active,
}: {
	url: string;
	poster?: string;
	active: boolean;
}) {
	const player = useVideoPlayer(url, (p) => {
		p.loop = true;
		p.muted = true;
	});
	useEffect(() => {
		if (active) player.play();
		else player.pause();
	}, [active, player]);
	return (
		<View style={styles.heroImg} pointerEvents="none">
			{!!poster && <Image source={{ uri: poster }} style={styles.heroImg} />}
			<VideoView
				player={player}
				style={styles.heroImg}
				contentFit="cover"
				nativeControls={false}
			/>
		</View>
	);
}

function CardFront({
	card,
	evidence,
	big,
	active,
	revealedOpt,
	onRevealChallenge,
	onSkipAsk,
}: {
	card: FeedCard;
	evidence: EvidenceProfile;
	big?: boolean;
	active?: boolean;
	revealedOpt?: number;
	onRevealChallenge?: (opt: number) => void;
	onSkipAsk?: () => void;
}) {
	if (card.kind === "ask")
		return <AskFront card={card} big={big} onSkip={onSkipAsk} />;
	if (card.kind === "tradeoff") return <TradeoffFront card={card} big={big} />;
	if (card.kind === "challenge")
		return (
			<ChallengeFront
				card={card}
				big={big}
				revealedOpt={revealedOpt}
				onReveal={onRevealChallenge}
			/>
		);
	if (card.kind === "insight") return <InsightFront card={card} big={big} />;
	if (card.kind === "community") {
		return (
			<View style={styles.faceInner}>
				<View style={styles.hero}>
					{card.videoUrl ? (
						<CardVideo
							url={card.videoUrl}
							poster={card.heroUrl}
							active={!!active && !big}
						/>
					) : (
						!!card.heroUrl && (
							<Image source={{ uri: card.heroUrl }} style={styles.heroImg} />
						)
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
	// listing
	return (
		<View style={styles.faceInner}>
			<View style={styles.hero}>
				{card.videoUrl ? (
					<CardVideo
						url={card.videoUrl}
						poster={card.heroUrl}
						active={!!active && !big}
					/>
				) : (
					!!card.heroUrl && (
						<Image source={{ uri: card.heroUrl }} style={styles.heroImg} />
					)
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

function AskFront({
	card,
	big,
	onSkip,
}: {
	card: AskCard;
	big?: boolean;
	onSkip?: () => void;
}) {
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
				{!!onSkip && (
					<Pressable
						hitSlop={10}
						onPress={(e) => {
							e.stopPropagation();
							onSkip();
						}}
						style={styles.askSkipBtn}
					>
						<Text style={styles.askSkipText}>Skip this topic</Text>
					</Pressable>
				)}
				<View style={styles.askAction}>
					<Text style={styles.askActionYes}>Yes →</Text>
				</View>
			</View>
		</View>
	);
}

function TradeoffFront({ card, big }: { card: TradeoffCard; big?: boolean }) {
	return (
		<View style={styles.faceInner}>
			<View style={styles.tradeoffContainer}>
				<Text style={styles.tradeoffKindChip}>TRADE-OFF</Text>
				{big && <Text style={styles.peekLabel}>👁 Peek</Text>}
				<View style={styles.tradeoffSplit}>
					<View style={[styles.tradeoffHalf, styles.tradeoffLeft]}>
						<Text style={styles.tradeoffLabel}>{card.L.label}</Text>
						<Text style={styles.tradeoffDim}>#{card.L.dim}</Text>
					</View>
					<View style={styles.tradeoffDivider}>
						<Text style={styles.tradeoffVs}>vs</Text>
					</View>
					<View style={[styles.tradeoffHalf, styles.tradeoffRight]}>
						<Text style={styles.tradeoffLabel}>{card.R.label}</Text>
						<Text style={styles.tradeoffDim}>#{card.R.dim}</Text>
					</View>
				</View>
				<Text style={styles.tradeoffHint}>Which matters more?</Text>
			</View>
		</View>
	);
}

function ChallengeFront({
	card,
	big,
	revealedOpt,
	onReveal,
}: {
	card: ChallengeCard;
	big?: boolean;
	revealedOpt?: number;
	onReveal?: (opt: number) => void;
}) {
	const revealed = revealedOpt != null;
	return (
		<View style={styles.faceInner}>
			<View style={styles.hero}>
				{!!card.heroUrl && (
					<Image source={{ uri: card.heroUrl }} style={styles.heroImg} />
				)}
				<View style={styles.heroDim} />
				<Text style={styles.challengeKindChip}>CHALLENGE</Text>
				{big && <Text style={styles.peekLabel}>👁 Peek</Text>}
			</View>
			<View style={styles.challengeFooter}>
				<Text style={styles.challengePrompt}>{card.prompt}</Text>
				<View style={styles.challengeOptions}>
					{card.options.map((opt) => {
						const isPicked = revealedOpt === opt;
						const isCorrect = opt === card.correct;
						const style = [
							styles.challengeOptBtn,
							revealed && isCorrect && styles.challengeOptCorrect,
							revealed && isPicked && !isCorrect && styles.challengeOptWrong,
						];
						return (
							<Pressable
								key={opt}
								disabled={revealed}
								onPress={(e) => {
									e.stopPropagation();
									onReveal?.(opt);
								}}
								style={style}
							>
								<Text style={styles.challengeOptText}>${fmtK(opt)}</Text>
							</Pressable>
						);
					})}
				</View>
				{revealed && <Text style={styles.challengeTeach}>{card.teach}</Text>}
			</View>
		</View>
	);
}

function InsightFront({ card, big }: { card: InsightCard; big?: boolean }) {
	return (
		<View style={styles.faceInner}>
			<View style={styles.insightContainer}>
				<Text style={styles.insightKindChip}>INSIGHT</Text>
				{big && <Text style={styles.peekLabel}>👁 Peek</Text>}
				<View style={styles.insightCenter}>
					<Text style={styles.insightText}>{card.text}</Text>
					<Text style={styles.insightEvidence}>{card.evidence}</Text>
				</View>
				<Text style={styles.insightHint}>Does this feel right?</Text>
			</View>
		</View>
	);
}

function CardBack({
	card,
	communityTraits,
	evidence,
}: {
	card: FeedCard;
	communityTraits: Record<string, CommunityCard["traits"]>;
	evidence: EvidenceProfile;
}) {
	if (card.kind !== "community" && card.kind !== "listing") return null;
	const traits =
		card.kind === "community"
			? card.traits
			: card.communityId
				? (communityTraits[card.communityId] ?? {})
				: {};
	const dims = card.dims ?? [];
	const why = whyLine(evidence, dims);
	return (
		<View style={styles.back}>
			<Text style={styles.backTitle}>
				{card.kind === "community" ? card.name : card.address}
			</Text>
			<Text style={styles.backSubtitle}>
				{card.kind === "community" ? card.city : card.priceLabel}
			</Text>

			<Text style={styles.backSectionLabel}>Why this fits</Text>
			<Text style={styles.backBody}>{why}</Text>

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

			{card.kind === "listing" && (
				<>
					<Text style={styles.backSectionLabel}>Home</Text>
					<Text style={styles.backBody}>{card.bedBathSqft}</Text>
					<Text style={styles.backBody}>{card.priceLabel}</Text>
				</>
			)}
			{card.kind === "community" && (
				<>
					<Text style={styles.backSectionLabel}>Community</Text>
					<Text style={styles.backBody}>
						{card.stats.median} median · {card.stats.homes} homes · vibe:{" "}
						{card.stats.vibe}
					</Text>
				</>
			)}

			<Text style={styles.backHint}>Tap to flip back</Text>
		</View>
	);
}

function fmtK(n: number): string {
	if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
	return `${Math.round(n / 1000)}K`;
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: "#f3eee7", paddingTop: 60 },
	header: { paddingHorizontal: 16, paddingBottom: 8 },
	personaChip: {
		alignSelf: "flex-start",
		backgroundColor: "#f59e0b",
		color: "#1a1a1a",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 999,
		fontSize: 13,
		fontWeight: "600",
	},
	scopeStrip: { marginTop: 10, maxHeight: 34 },
	scopeStripInner: { gap: 6, paddingRight: 20 },
	scopePill: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#1a1a1a",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 999,
	},
	scopePillText: { color: "#f3eee7", fontSize: 12, fontWeight: "600" },
	scopePillX: { color: "#c9c3ba", fontSize: 14, fontWeight: "700" },

	stack: { flex: 1, alignItems: "center", justifyContent: "center" },
	card: {
		position: "absolute",
		width: SCREEN_W - 32,
		aspectRatio: 3 / 5,
		borderRadius: 24,
		overflow: "hidden",
		backgroundColor: "#1a1a1a",
		shadowColor: "#000",
		shadowOpacity: 0.15,
		shadowRadius: 20,
		shadowOffset: { width: 0, height: 8 },
	},
	cardTop: { zIndex: 5 },
	cardNext: { zIndex: 4, opacity: 0.5, transform: [{ scale: 0.94 }] },
	face: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
	faceInner: { flex: 1 },
	hero: { flex: 1, padding: 16, backgroundColor: "#2a3040" },
	heroImg: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		width: "100%",
		height: "100%",
	},
	heroDim: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0,0,0,0.15)",
	},
	kindChip: {
		alignSelf: "flex-start",
		backgroundColor: "rgba(255,255,255,0.9)",
		color: "#1a1a1a",
		fontSize: 11,
		fontWeight: "700",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		letterSpacing: 1,
		overflow: "hidden",
	},
	matchChip: {
		position: "absolute",
		top: 16,
		right: 16,
		backgroundColor: "#f59e0b",
		color: "#1a1a1a",
		fontSize: 12,
		fontWeight: "700",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		overflow: "hidden",
	},
	peekLabel: {
		position: "absolute",
		top: 16,
		right: 16,
		color: "#fff",
		fontSize: 12,
		fontWeight: "700",
		backgroundColor: "rgba(0,0,0,0.5)",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		overflow: "hidden",
	},
	footer: { padding: 20, backgroundColor: "rgba(0,0,0,0.85)" },
	title: { color: "#fff", fontSize: 24, fontWeight: "700" },
	subtitle: { color: "#f3eee7", fontSize: 16, marginTop: 4 },
	stats: { color: "#c9c3ba", fontSize: 13, marginTop: 8 },
	tagRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, gap: 6 },
	tag: {
		color: "#f3eee7",
		fontSize: 12,
		backgroundColor: "rgba(255,255,255,0.15)",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		overflow: "hidden",
	},
	swipeHint: {
		textAlign: "center",
		color: "#5a5651",
		fontSize: 13,
		paddingBottom: 40,
	},
	done: { color: "#313131", fontSize: 24, textAlign: "center", marginTop: 200 },
	persona: {
		color: "#5a5651",
		fontSize: 15,
		textAlign: "center",
		marginTop: 12,
	},

	// Back face
	back: { flex: 1, backgroundColor: "#1a1a1a", padding: 24 },
	backTitle: { color: "#fff", fontSize: 22, fontWeight: "700" },
	backSubtitle: {
		color: "#c9c3ba",
		fontSize: 14,
		marginTop: 4,
		marginBottom: 24,
	},
	backSectionLabel: {
		color: "#f59e0b",
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 1,
		marginTop: 16,
		marginBottom: 10,
	},
	traitList: { gap: 8 },
	traitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	traitLabel: {
		color: "#c9c3ba",
		fontSize: 12,
		width: 70,
		textTransform: "capitalize",
	},
	traitBarTrack: {
		flex: 1,
		height: 6,
		backgroundColor: "rgba(255,255,255,0.1)",
		borderRadius: 3,
		overflow: "hidden",
	},
	traitBarFill: { height: 6, backgroundColor: "#f59e0b" },
	traitValue: {
		color: "#f3eee7",
		fontSize: 12,
		width: 28,
		textAlign: "right",
	},
	backBody: { color: "#f3eee7", fontSize: 14, marginTop: 4 },
	backHint: {
		color: "#5a5651",
		fontSize: 12,
		marginTop: "auto",
		paddingTop: 24,
		textAlign: "center",
	},

	// Ask card
	askDim: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0,0,0,0.5)",
	},
	askKindChip: {
		alignSelf: "flex-start",
		backgroundColor: "#f59e0b",
		color: "#1a1a1a",
		fontSize: 11,
		fontWeight: "700",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		letterSpacing: 1,
		overflow: "hidden",
	},
	askCenter: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		justifyContent: "center",
		padding: 32,
	},
	askQ: {
		color: "#fff",
		fontSize: 30,
		fontWeight: "700",
		textAlign: "center",
		lineHeight: 36,
	},
	askSub: {
		color: "#f3eee7",
		fontSize: 15,
		textAlign: "center",
		marginTop: 12,
		opacity: 0.9,
	},
	askFooter: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 20,
		backgroundColor: "rgba(0,0,0,0.85)",
	},
	askAction: { flex: 1, alignItems: "center" },
	askActionNo: { color: "#c9c3ba", fontSize: 15, fontWeight: "600" },
	askActionYes: { color: "#f59e0b", fontSize: 15, fontWeight: "700" },
	askSkipBtn: {
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	askSkipText: {
		color: "#c9c3ba",
		fontSize: 12,
		textDecorationLine: "underline",
	},

	// Tradeoff card
	tradeoffContainer: {
		flex: 1,
		backgroundColor: "#0f1220",
		padding: 20,
		justifyContent: "space-between",
	},
	tradeoffKindChip: {
		alignSelf: "flex-start",
		backgroundColor: "#f59e0b",
		color: "#1a1a1a",
		fontSize: 11,
		fontWeight: "700",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		letterSpacing: 1,
		overflow: "hidden",
	},
	tradeoffSplit: {
		flex: 1,
		flexDirection: "row",
		alignItems: "stretch",
		marginVertical: 20,
	},
	tradeoffHalf: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 16,
		borderRadius: 16,
	},
	tradeoffLeft: { backgroundColor: "#1e2a3d" },
	tradeoffRight: { backgroundColor: "#3d1e2a" },
	tradeoffDivider: {
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 8,
	},
	tradeoffVs: {
		color: "#c9c3ba",
		fontSize: 13,
		fontWeight: "700",
		letterSpacing: 2,
	},
	tradeoffLabel: {
		color: "#fff",
		fontSize: 20,
		fontWeight: "700",
		textAlign: "center",
	},
	tradeoffDim: {
		color: "#f59e0b",
		fontSize: 12,
		marginTop: 8,
		letterSpacing: 1,
	},
	tradeoffHint: {
		color: "#c9c3ba",
		fontSize: 14,
		textAlign: "center",
		paddingBottom: 8,
	},

	// Challenge card
	challengeKindChip: {
		alignSelf: "flex-start",
		backgroundColor: "#22c55e",
		color: "#0a0a0a",
		fontSize: 11,
		fontWeight: "700",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		letterSpacing: 1,
		overflow: "hidden",
	},
	challengeFooter: {
		padding: 20,
		backgroundColor: "rgba(0,0,0,0.9)",
	},
	challengePrompt: {
		color: "#fff",
		fontSize: 17,
		fontWeight: "600",
		marginBottom: 14,
	},
	challengeOptions: { gap: 8 },
	challengeOptBtn: {
		paddingVertical: 12,
		paddingHorizontal: 14,
		borderRadius: 12,
		backgroundColor: "rgba(255,255,255,0.12)",
		alignItems: "center",
	},
	challengeOptCorrect: { backgroundColor: "#166534" },
	challengeOptWrong: { backgroundColor: "#7f1d1d" },
	challengeOptText: { color: "#fff", fontSize: 16, fontWeight: "700" },
	challengeTeach: {
		color: "#c9c3ba",
		fontSize: 13,
		marginTop: 14,
		lineHeight: 18,
	},

	// Insight card
	insightContainer: {
		flex: 1,
		backgroundColor: "#4c1d95",
		padding: 24,
		justifyContent: "space-between",
	},
	insightKindChip: {
		alignSelf: "flex-start",
		backgroundColor: "#facc15",
		color: "#1a1a1a",
		fontSize: 11,
		fontWeight: "700",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		letterSpacing: 1,
		overflow: "hidden",
	},
	insightCenter: {
		flex: 1,
		justifyContent: "center",
	},
	insightText: {
		color: "#fff",
		fontSize: 22,
		fontWeight: "700",
		lineHeight: 30,
	},
	insightEvidence: {
		color: "#e9d5ff",
		fontSize: 14,
		marginTop: 16,
	},
	insightHint: {
		color: "#e9d5ff",
		fontSize: 13,
		textAlign: "center",
		paddingBottom: 8,
	},

	// Toast
	toast: {
		position: "absolute",
		bottom: 100,
		alignSelf: "center",
		left: 0,
		right: 0,
		alignItems: "center",
	},
	toastText: {
		backgroundColor: "#1a1a1a",
		color: "#f59e0b",
		fontSize: 13,
		fontWeight: "600",
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderRadius: 999,
		overflow: "hidden",
	},

	// Peek modal
	peekBackdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.7)",
		justifyContent: "center",
		padding: 20,
	},
	peekCard: {
		width: "100%",
		aspectRatio: 3 / 5,
		maxHeight: "90%",
		borderRadius: 28,
		overflow: "hidden",
		backgroundColor: "#1a1a1a",
	},
	peekActions: {
		position: "absolute",
		bottom: 24,
		left: 20,
		right: 20,
		gap: 10,
	},
	peekPrimary: {
		backgroundColor: "#f59e0b",
		paddingVertical: 14,
		borderRadius: 999,
		alignItems: "center",
	},
	peekPrimaryText: { color: "#1a1a1a", fontSize: 16, fontWeight: "700" },
	peekSecondary: {
		backgroundColor: "rgba(255,255,255,0.15)",
		paddingVertical: 12,
		borderRadius: 999,
		alignItems: "center",
	},
	peekSecondaryText: { color: "#f3eee7", fontSize: 14 },
});

/**
 * Timed narration — a script anchored to the cut, not laid over it.
 *
 * The previous approach wrote one continuous paragraph sized to the film's
 * total runtime and let the reader's pace decide where each sentence landed.
 * Measured on Aberdeen, the drift compounded: Halcyon was named 4.6s early,
 * Sims Lake 13.9s early, and by the closing Publix shot the narration was 28.7
 * seconds ahead of the picture — talking about groceries over a park. No
 * amount of rewriting fixes that, because the error is structural: nothing
 * connected a sentence to a shot.
 *
 * So narration is produced as SEGMENTS, each anchored to a run of clips that
 * share a subject, with a word budget derived from that run's real duration.
 * Each segment is synthesised separately and placed at its own start time, so
 * a change to any clip's length moves only that segment. Owner 2026-08-20:
 * "shouldnt we generate tts during planning phase? since it knows what to
 * tell, how long and transition stuff."
 *
 * It also has to stop sounding like a template. Same voice, same opening, same
 * order for every community was the complaint, and the material to fix it was
 * already there and unused: `narrative_angle` is written by the research step
 * and had never been read by anything.
 */

import {
  ANGLE_BRIEF,
  type InsightAngle,
  type PlaceFact,
  anglesForCommunity,
  filmFacts,
  renderFacts,
} from './insights';
import { findSchoolAssignment, stripSchoolAssignment } from './school-language';
import { countWords } from './vo-pass';

/**
 * Words per second, measured on this voice rather than assumed.
 *
 * The VO pass's WORDS_PER_SECOND_FIT is 2.4. Timing three real Gemini TTS lines
 * in Aoede gave 2.20, 2.26 and 2.37 — so budgets built on 2.4 came out about 9%
 * long, and at 92% fill that was enough to leave 0.1s between the Halcyon line
 * and the schools line. They did not technically overlap; they simply ran into
 * each other, which sounds the same (owner 2026-08-21: "before the elementary,
 * tts overlaps").
 */
export const NARRATION_WORDS_PER_SECOND = 2.25;

export const NARRATION_MODEL = process.env.GEMINI_VO_MODEL ?? 'gemini-3.5-flash';

const GENERATE_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * Narration covers this share of a section's runtime, not all of it.
 *
 * Some air is right — wall-to-wall speech is exhausting and leaves the pictures
 * nothing to say — but the first cut came back 46% silent, with a 15.9-second
 * hole after the opening line. Owner 2026-08-20: "you can leave some pause, but
 * you definitely dont want 50% pause during the video."
 *
 * Raising this alone would not have fixed it: the opening section allowed 44
 * words and the model wrote 25. The cap was never the constraint, so the prompt
 * carries a FLOOR as well, and asks long sections for more than one sentence.
 *
 * Tuned against measurement rather than feel. The film that followed came back
 * 59% spoken, at a delivered rate of 2.45 words per second — which confirms
 * WORDS_PER_SECOND_FIT, and puts the shortfall entirely in sections written to
 * 60-75% of a cap set at 85%. Owner 2026-08-21 asked for 80%; at 0.92 fill with
 * a 0.85 floor the band works out to 76-89%.
 */
export const SECTION_FILL = 0.92;

/** A line must use at least this much of its section's budget. */
export const SECTION_MIN_FILL = 0.85;

/** Past this, one sentence cannot carry the section and the prompt says so. */
const MULTI_SENTENCE_SECONDS = 11;

/**
 * A section too short to say anything useful in gets no line at all.
 *
 * 2.0 rather than 2.5 since 2026-08-21: at 2.5 the three two-second sections at
 * the end of the Aberdeen cut were skipped outright, and four of the film's
 * ninety seconds went quiet for no better reason than a threshold. Four words
 * fit in two seconds.
 */
export const MIN_SECTION_SECONDS = 2.0;

/**
 * The crossfade between two clips, which the finished film is 15 seconds
 * shorter than the sum of its parts because of.
 *
 * Must match `xfade` in scripts/render-worker/worker.py — that is the timeline
 * audio is actually placed against, and this file's only job is to be right
 * about when a line is spoken.
 *
 * It was missing here, and the error was systematic rather than occasional: a
 * 31-clip cut summing to 90s plays for 75.7s, so every section was budgeted
 * ~17% more time than its footage occupies, and a short one much worse — the
 * two-second Breakfast Bar shot at the end of Bellmoore Park's film is 1.5
 * seconds of screen time. Short sections therefore over-ran by design, each
 * pushing the next later, and the last two lines of that film were spoken on
 * top of each other (owner 2026-08-23: "there is overlap of the tts for last
 * two sentences").
 */
export const TOUR_XFADE_S = 0.5;

/**
 * When each clip begins, and when the film ends, on the CROSSFADED timeline.
 *
 * Mirrors `clip_start_times` and `crossfade_total` in the render worker. A
 * crossfade overlaps the outgoing clip, so clip i takes over one transition
 * after the offset that introduced it — which makes the first step a full
 * duration and every later one a duration less the fade.
 */
function timeline(clips: NarrationClip[], xfade: number): { starts: number[]; end: number } {
  const starts: number[] = [];
  let t = 0;
  for (const [i, c] of clips.entries()) {
    starts.push(t);
    t += i === 0 ? c.duration_s : c.duration_s - xfade;
  }
  const sum = clips.reduce((a, c) => a + c.duration_s, 0);
  return { starts, end: sum - xfade * Math.max(0, clips.length - 1) };
}

export interface NarrationClip {
  poi_name?: string | null;
  poi_id?: string | null;
  bucket?: string | null;
  duration_s: number;
  label_distance?: string | null;
}

/** One run of consecutive clips that share a subject. */
export interface NarrationSection {
  index: number;
  /**
   * First and last clip of the run, inclusive. THIS is the anchor.
   *
   * The seconds below are a plan-time estimate and nothing more. The real
   * timeline is only known at assembly, where the worker ffprobes each
   * rendered file and lays them out with 0.5s crossfades — clips come back
   * about half a second longer than planned, which happens to cancel the
   * overlap almost exactly, but "happens to cancel" is not something to place
   * audio on. The worker converts these indices to real seconds the same way
   * it already does for the on-screen place labels.
   */
  startClip: number;
  endClip: number;
  /** Estimated from planned durations. Used for the word budget, not for placement. */
  startS: number;
  endS: number;
  bucket: string;
  /** Distinct place names in this run, in order. */
  places: string[];
  /** Distinct poi ids, so facts can be attached without matching on names. */
  poiIds: string[];
  /** How many words fit, at the VO pass's established pace. */
  wordBudget: number;
}

/**
 * Split the cut into sections at every change of PLACE GROUP.
 *
 * A section is a run of clips sharing a bucket — which, since the scheduler
 * started grouping buckets into chapters, is also a run sharing a subject. The
 * boundaries are therefore the film's own transitions, which is what makes a
 * segment land on the footage it describes.
 */
export function buildSections(
  clips: NarrationClip[],
  xfade: number = TOUR_XFADE_S,
): NarrationSection[] {
  const sections: NarrationSection[] = [];
  // A section runs until the NEXT one takes the screen, not until its own last
  // clip has finished playing — those differ by exactly one crossfade, and the
  // difference is the room the following line needs.
  const { starts, end } = timeline(clips, xfade);
  for (const [i, c] of clips.entries()) {
    const bucket = c.bucket ?? 'other';
    const last = sections.at(-1);
    const endS = starts[i + 1] ?? end;
    if (last && last.bucket === bucket) {
      last.endClip = i;
      last.endS = endS;
      if (c.poi_name && !last.places.includes(c.poi_name)) last.places.push(c.poi_name);
      if (c.poi_id && !last.poiIds.includes(c.poi_id)) last.poiIds.push(c.poi_id);
    } else {
      sections.push({
        index: sections.length,
        startClip: i,
        endClip: i,
        startS: starts[i] ?? 0,
        endS,
        bucket,
        places: c.poi_name ? [c.poi_name] : [],
        poiIds: c.poi_id ? [c.poi_id] : [],
        wordBudget: 0,
      });
    }
  }
  for (const s of sections) {
    s.wordBudget = Math.max(
      0,
      Math.floor((s.endS - s.startS) * SECTION_FILL * NARRATION_WORDS_PER_SECOND),
    );
  }
  return sections;
}

export interface NarrationContext {
  communityName: string;
  city: string | null;
  state: string | null;
  /** The research step's one-line take. Unused before 2026-08-20. */
  narrativeAngle?: string | null;
  /** Community id — seeds the angle rotation. Falls back to the name. */
  seed?: string;
  /** What we know about each place, keyed by poi id. */
  facts?: Record<string, PlaceFact>;
  /** Which kinds of insight this film leans on. */
  angles?: InsightAngle[];
  /**
   * `communities.narration_voice` — the owner's own pick for this community.
   * Beats the automatic choice, and no re-run overwrites it.
   */
  voiceOverride?: string | null;
  sections: NarrationSection[];
}

/**
 * The prompt. Structure is fixed; VOICE is not.
 *
 * The opening instruction deliberately refuses the "<Name> sits in <City>"
 * formula the old script defaulted to, and hands the model the community's own
 * angle to open from instead — so a lakeside community can open on water and a
 * school-heavy one on the morning run.
 */
export function buildNarrationPrompt(ctx: NarrationContext): string {
  const where = [ctx.city, ctx.state].filter(Boolean).join(', ');
  const facts = ctx.facts ?? {};
  const timeline = ctx.sections
    .map((s) => {
      const secs = s.endS - s.startS;
      const min = Math.floor(s.wordBudget * SECTION_MIN_FILL);
      const ask =
        secs >= MULTI_SENTENCE_SECONDS
          ? ` — needs ${secs >= 20 ? 'three sentences' : 'two sentences'}`
          : '';
      const head = `  ${s.index}. ${s.startS.toFixed(1)}–${s.endS.toFixed(1)}s (${secs.toFixed(1)}s, ${min}-${s.wordBudget} words${ask}) — ${s.bucket}: ${s.places.join(', ') || '(unnamed)'}`;
      // The facts, indented under the section. This is the whole difference
      // between a line that captions the picture and one that tells you
      // something: before this, the model had nothing but the name.
      const known = s.poiIds.map((id) => facts[id]).filter((f): f is PlaceFact => !!f);
      return known.length > 0 ? `${head}\n${renderFacts(known)}` : head;
    })
    .join('\n');

  const angles = ctx.angles ?? [];
  const allFacts = Object.values(facts);
  const overall = allFacts.length > 0 ? filmFacts(allFacts) : [];

  return `Write the spoken narration for a ${ctx.sections.at(-1)?.endS.toFixed(0)}-second video tour of ${ctx.communityName}${where ? `, ${where}` : ''}.

${ctx.narrativeAngle ? `What defines this place, in the researcher's words: "${ctx.narrativeAngle}"\n` : ''}
The film is already cut. Here is what is on screen, when — with what we know
about each place under it:

${timeline}
${
  overall.length > 0
    ? `\nTrue of the film as a whole:\n${overall.map((f) => `  · ${f}`).join('\n')}\n`
    : ''
}${
  angles.length > 0
    ? `\nLEAN ON THESE. Not every line, but this film is about these things as much
as it is about the pictures. Weave them in; do not list them.\n\n${angles
        .map((a) => ANGLE_BRIEF[a])
        .join('\n\n')}\n`
    : ''
}
Write ONE line per section. Each line is spoken while those exact shots are on
screen, so it must be about THOSE places — never the next ones, never the last.

This is a STORY, not a caption track. The lines are heard in order by one
person, so they have to build. Before writing, decide what this tour is
actually saying about this place — then let each line carry a piece of it.

BANNED, because they turn narration into a brochure:
  "offers", "features", "provides", "boasts", "is home to", "enjoy",
  "nestled", "conveniently located", "a variety of", "something for everyone"
If a line still works with the place name swapped out, it is not about this
place. Rewrite it.

RULES
- Every section has a word RANGE. Land inside it. Under the minimum leaves
  silence over moving pictures; over the cap runs into the next section.
- A long section is several shots of several places. Say something about more
  than one of them.
- Open from what makes this community specific — but do not quote the
  researcher's sentence back, it is a note to you. Never "<Name> sits in
  <City>": it fits every community, which is why it is wrong for this one.
- Name the community once, early. After that, say "here".
- Concrete nouns, real detail. "The courts stay busy past dusk" beats "tennis
  courts are available".
- USE THE FACTS, all of them — what the place is, what it looks like, what it
  is known for, how many people rate it and how highly. Don't recite them, but
  let at least half the lines rest on something real. Only the facts given
  above: never invent a rating, a distance, a count or an amenity.
- DISTANCE EARNS ITS PLACE — how far the school is, whether you can walk out
  for coffee. But it is the easiest fact to reach for, because every place has
  one, and it crowds the others out. Ration it:
    · At most a QUARTER of the lines may carry a distance.
    · Never two lines running.
    · Never as the whole of a line — it qualifies something you have already
      said about the place.
    · Say it the way a person would, not the way a map would.
    · Under about ten words there is no room for both, and a distance is what
      fits when nothing else will — which is why those sections keep coming
      back as "Life Time fitness is under a mile". Say what the place IS:
      "Crunch Fitness, three thousand reviews deep".
      YES — "Bell-Boles Park is a mile of shaded trail, close enough to walk."
      NO  — "Life Time sits under a mile from home."
      NO  — "Drive six miles to Newtown Dog Park."
- A line that only says a place exists is worse than no line. If you have
  nothing to say about somewhere, omit that section and let the pictures run.
- SCHOOLS: describe the PLACE, never anyone going to it. Name them, say where
  they sit, describe the campus. Nothing about attendance, zoning, enrolment,
  morning routines, the school run, or which school leads to which — a line
  that makes one of those claims is deleted rather than reworded, leaving the
  shot silent.
      YES — "Sharon Elementary, Riverwatch Middle and Lambert High sit within a
             few miles, low brick campuses behind their ball fields."
      NO  — "Morning routines flow toward Sharon Elementary."
  No ratings for schools: a quality claim needs a source that is not us.
- No claims about who lives here, or who would like it.
- Vary sentence length. The last line should land, not trail off.

OUTPUT — JSON only, no fences:
{"lines": [{"index": 0, "text": "..."}, ...]}
Omit a section entirely rather than padding it.`;
}

export interface NarrationSegment {
  index: number;
  /** The clips this line is spoken over. The worker places audio from these. */
  startClip: number;
  endClip: number;
  /** Plan-time estimate, for review in the admin table. Not the placement. */
  startS: number;
  endS: number;
  text: string;
  words: number;
  /** Trimmed because it exceeded the section's budget. */
  trimmed: boolean;
}

/**
 * Validate the model's lines against the sections they claim.
 *
 * Everything here is enforced rather than trusted: the school-assignment rule
 * gets past prompts (it is enforced twice elsewhere for the same reason), and a
 * line over budget is a line that runs into the next section's footage — the
 * exact failure this module exists to prevent.
 */
export function parseNarration(
  raw: string,
  sections: NarrationSection[],
): { segments: NarrationSegment[]; warnings: string[] } {
  const warnings: string[] = [];
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return { segments: [], warnings: ['no JSON in response'] };

  let parsed: { lines?: Array<{ index?: number; text?: string }> };
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { segments: [], warnings: ['unparseable JSON'] };
  }

  const byIndex = new Map(sections.map((s) => [s.index, s]));
  const segments: NarrationSegment[] = [];
  for (const line of parsed.lines ?? []) {
    const section = typeof line.index === 'number' ? byIndex.get(line.index) : undefined;
    if (!section || typeof line.text !== 'string') continue;
    if (section.endS - section.startS < MIN_SECTION_SECONDS) continue;

    const cleaned = stripSchoolAssignment(line.text.trim());
    if (cleaned.codes.length > 0) {
      warnings.push(`section ${section.index}: school-assignment (${cleaned.codes.join(', ')})`);
    }
    let text = cleaned.text.trim();
    if (!text) continue;

    // Over budget: drop whole sentences from the end, so what remains is still
    // speakable.
    //
    // And if NOTHING whole fits, drop the line rather than clipping a word.
    // The fallback used to be `slice(0, wordBudget)`, which guillotines a
    // single long sentence mid-clause and hands the result to the TTS: "Further
    // out, H Mart stands as a massive specialty", spoken exactly like that.
    // A fragment is not a shorter line, it is a broken one, and the section's
    // clips play under silence perfectly well — the prompt already tells the
    // model to omit a section rather than pad it, and this is the same
    // judgement applied to overflow.
    //
    // A HAIR over is kept whole. The budget is already 92% of the section
    // (SECTION_FILL), so a word or two past it eats deliberate air rather than
    // the next section — and losing "Walk dogs at Caney Creek." from a
    // two-second shot because it is one word long is the silence this pipeline
    // spent a fix getting rid of.
    const slack = section.wordBudget + Math.max(1, Math.round(section.wordBudget * 0.15));
    let trimmed = false;
    while (countWords(text) > slack) {
      const cut = text.replace(/(^|\s)[^.!?]*[.!?]\s*$/, '').trim();
      if (!cut || cut === text) {
        text = '';
        break;
      }
      text = cut;
      trimmed = true;
    }
    if (!text) {
      warnings.push(
        `section ${section.index}: dropped — no whole sentence fits ${section.wordBudget} words`,
      );
      continue;
    }
    if (trimmed) warnings.push(`section ${section.index}: trimmed to ${section.wordBudget} words`);

    segments.push({
      index: section.index,
      startClip: section.startClip,
      endClip: section.endClip,
      startS: section.startS,
      endS: section.endS,
      text,
      words: countWords(text),
      trimmed,
    });
  }
  segments.sort((a, b) => a.startS - b.startS);

  // A late safety net, matching the one the VO pass keeps: the strip above
  // works sentence by sentence and a rewritten line can still carry the
  // phrasing across a sentence boundary.
  for (const seg of segments) {
    const codes = findSchoolAssignment(seg.text);
    if (codes.length > 0) warnings.push(`section ${seg.index}: RESIDUAL school-assignment`);
  }

  // Measured, not hoped for. A prompt is a request; this is the only thing that
  // says whether it was honoured. Across the three films that prompted the rule
  // the figure was 19 of 30 (owner 2026-08-23: "too many miles related
  // information … narrative should not too much focus on it").
  //
  // The prompt asks for a QUARTER and this fires past a THIRD, deliberately.
  // The model tracks whatever number the prompt names — measured at 3/10 for
  // "a third" and 2/10 for "a quarter", three runs each, no variation — so a
  // warning set at the cap itself would fire on every good script. The gap is
  // the tolerance band. To make films less distance-forward, lower the number
  // in the prompt; that is the lever, not more words.
  //
  // A warning, never a rejection: a script that leans on distance is still a
  // script, and dropping it would leave a silent film over a stylistic call.
  const heavy = segments.filter((seg) => mentionsDistance(seg.text)).length;
  if (segments.length >= 3 && heavy * 3 > segments.length) {
    warnings.push(
      `distance-heavy: ${heavy} of ${segments.length} lines mention how far something is`,
    );
  }
  return { segments, warnings };
}

/**
 * Does this line tell you how far away something is? PURE.
 *
 * Deliberately broad — drive times count, and so does "just up the road". The
 * point is to measure how often the script reaches for the same move, and a
 * pattern that only caught the decimal form would report a clean sheet on
 * "Find H Mart just one mile down the road."
 */
export function mentionsDistance(text: string): boolean {
  return (
    /\b(\d+(\.\d+)?|a|one|two|three|four|five|six|seven|eight|nine|ten|half)[\s-]+(mile|miles|mi|minute|minutes|min)\b/i.test(
      text,
    ) ||
    /\b(miles?|minutes?)\s+(away|out|down|from|east|west|north|south)\b/i.test(text) ||
    /\b(walk|walking|drive|driving)\s+(to|less than|under|just)\b/i.test(text) ||
    /\b(down the road|up the road|steps away|within .{0,12}(mile|minute))\b/i.test(text)
  );
}

/**
 * Every prebuilt voice the Gemini TTS models offer, with Google's own
 * one-word descriptor. Thirty of them; the pipeline used five.
 *
 * The whole catalogue is exposed so the admin dropdown can offer it — a voice
 * we would not pick automatically is still a voice the owner may want for one
 * community. `AUTO_VOICE_POOL` below is the narrower set anything picks FROM.
 */
export const VOICE_CATALOGUE: ReadonlyArray<{ id: string; character: string }> = [
  { id: 'Achernar', character: 'Soft' },
  { id: 'Achird', character: 'Friendly' },
  { id: 'Algenib', character: 'Gravelly' },
  { id: 'Algieba', character: 'Smooth' },
  { id: 'Alnilam', character: 'Firm' },
  { id: 'Aoede', character: 'Breezy' },
  { id: 'Autonoe', character: 'Bright' },
  { id: 'Callirrhoe', character: 'Easy-going' },
  { id: 'Charon', character: 'Informative' },
  { id: 'Despina', character: 'Smooth' },
  { id: 'Enceladus', character: 'Breathy' },
  { id: 'Erinome', character: 'Clear' },
  { id: 'Fenrir', character: 'Excitable' },
  { id: 'Gacrux', character: 'Mature' },
  { id: 'Iapetus', character: 'Clear' },
  { id: 'Kore', character: 'Firm' },
  { id: 'Laomedeia', character: 'Upbeat' },
  { id: 'Leda', character: 'Youthful' },
  { id: 'Orus', character: 'Firm' },
  { id: 'Puck', character: 'Upbeat' },
  { id: 'Pulcherrima', character: 'Forward' },
  { id: 'Rasalgethi', character: 'Informative' },
  { id: 'Sadachbia', character: 'Lively' },
  { id: 'Sadaltager', character: 'Knowledgeable' },
  { id: 'Schedar', character: 'Even' },
  { id: 'Sulafat', character: 'Warm' },
  { id: 'Umbriel', character: 'Easy-going' },
  { id: 'Vindemiatrix', character: 'Gentle' },
  { id: 'Zephyr', character: 'Bright' },
  { id: 'Zubenelgenubi', character: 'Casual' },
];

export const VOICE_IDS: ReadonlySet<string> = new Set(VOICE_CATALOGUE.map((v) => v.id));

/**
 * The voices automatic selection draws from.
 *
 * Not all thirty. A property film is read by someone telling you about a
 * place, so Excitable, Gravelly, Breathy, Forward, Lively and Youthful are
 * left out of the automatic pool — they are still selectable by hand, because
 * "wrong for the format in general" is not the same as "wrong for this one".
 */
export const AUTO_VOICE_POOL: readonly string[] = [
  'Achernar',
  'Achird',
  'Algieba',
  'Alnilam',
  'Aoede',
  'Autonoe',
  'Callirrhoe',
  'Charon',
  'Despina',
  'Erinome',
  'Gacrux',
  'Iapetus',
  'Kore',
  'Laomedeia',
  'Orus',
  'Puck',
  'Rasalgethi',
  'Sadaltager',
  'Schedar',
  'Sulafat',
  'Umbriel',
  'Vindemiatrix',
  'Zephyr',
  'Zubenelgenubi',
];

/**
 * Kept as an alias so older callers and stored results keep resolving. The
 * five names it held are all still in the catalogue.
 */
export const NARRATION_VOICES = {
  warm: 'Kore',
  grounded: 'Charon',
  bright: 'Puck',
  calm: 'Aoede',
  assured: 'Fenrir',
} as const;

export interface NarrationResult {
  segments: NarrationSegment[];
  sections: NarrationSection[];
  voice: string;
  /** The insight angles this script was asked to lean on. */
  angles: InsightAngle[];
  warnings: string[];
  ok: boolean;
  error?: string;
}

/**
 * Write the narration for a planned cut.
 *
 * Called from `runPlan`, because that is where the shot list — what is shown,
 * in what order, for how long — first exists. Everything the script needs to
 * be in sync is known at that moment and nowhere earlier (owner 2026-08-20:
 * "shouldnt we generate tts during planning phase? since it knows what to
 * tell, how long and transition stuff").
 *
 * Temperature 1.1: three takes were compared side by side against the Aberdeen
 * cut and the owner picked the loosest one. The lower settings stayed closer
 * to the shot list and read like an inventory of it.
 *
 * A failure here returns no segments rather than throwing. A tour with music
 * and no narration is the product as it shipped last week; a plan step that
 * dies on a text-generation call is a regression.
 */
export async function runNarration(
  clips: NarrationClip[],
  ctx: Omit<NarrationContext, 'sections'>,
): Promise<NarrationResult> {
  const sections = buildSections(clips);
  // Seeded on the community's id where we have one — a rename must not change
  // the narrator. Falls back to the name for callers that pass no seed.
  const voice = voiceForCommunity(
    ctx.seed ?? ctx.communityName,
    sections.map((s) => s.bucket),
    ctx.voiceOverride,
  );
  // Which insight angles this film leans on, seeded so a community keeps its
  // own emphasis while two communities differ.
  const angles = ctx.angles ?? anglesForCommunity(ctx.seed ?? ctx.communityName);
  const base = { segments: [], sections, voice, angles, warnings: [] };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ...base, ok: false, error: 'GEMINI_API_KEY not set' };
  if (sections.length === 0) return { ...base, ok: true };

  // Retried, because the failure mode is transient and the cost of accepting it
  // is a silent film. One live call came back with unparseable JSON — a
  // thinking model that ran out of room mid-object — and the empty result then
  // overwrote a perfectly good script.
  let lastError = 'unknown';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(GENERATE_URL(NARRATION_MODEL), {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: buildNarrationPrompt({ ...ctx, sections, angles }) }] },
          ],
          generationConfig: {
            // Room for the reasoning AND the answer. 8192 was enough while the
            // sections carried only names; with facts under each one, and a
            // denser script asked for, a reply ran out of room mid-object.
            maxOutputTokens: 16384,
            temperature: 1.1,
            responseMimeType: 'application/json',
          },
        }),
      });
      if (!res.ok) {
        lastError = `narration ${res.status}: ${(await res.text()).slice(0, 200)}`;
        continue;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      };
      // Skip the thinking block: it is parts[0] often enough that reading
      // parts[0].text returned prose instead of JSON on every call.
      const raw = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('');
      const { segments, warnings } = parseNarration(raw, sections);
      if (segments.length > 0) return { segments, sections, voice, angles, warnings, ok: true };
      lastError = warnings[0] ?? 'no lines';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { ...base, ok: false, error: lastError };
}

/**
 * The voice this community is read in. PURE.
 *
 * Owner 2026-08-20: "i dont want to hear the same voice, same format, same
 * opening, same order for every single community."
 *
 * IT DID EXACTLY THAT for three months. The old version picked on character,
 * and its first rule was "has an outdoor place → the calm voice". Every
 * community tour visits a park, so that rule won every single time: Aberdeen,
 * Bellmoore Park and Apremont - Highcroft were all read by Aoede, and the four
 * other voices plus the hash fallback beneath them were unreachable code
 * (owner 2026-08-23: "voice is same for all videos").
 *
 * The bucket rules are gone rather than reordered, because the premise was
 * wrong. Those three communities' bucket sets are nearly identical — outdoor,
 * dining, schools, fitness, shopping, kids all appear in all three — so
 * buckets cannot tell communities apart, whatever order they are tested in.
 * Something that does not discriminate cannot be the basis of a choice.
 *
 * So: a stable hash over the pool. Same community, same voice for ever, which
 * is what makes a re-run sound like the same product; different communities,
 * different voices, which is what was asked for. `override` is the owner's own
 * pick from the admin panel and beats all of it.
 */
export function voiceForCommunity(
  seed: string,
  _buckets: string[] = [],
  override?: string | null,
): string {
  if (override && VOICE_IDS.has(override)) return override;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AUTO_VOICE_POOL[h % AUTO_VOICE_POOL.length] as string;
}

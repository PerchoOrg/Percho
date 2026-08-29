/**
 * Move-in question generation — one listing in, a set of storable answers out
 * (`docs/design/move-in-questions.md` §6).
 *
 * Two halves, split so the important one is testable without a network:
 *
 *   `buildPrompt`      — the system rule (Fair Housing verbatim, basis
 *                        allow-lists, output shape) and the listing's facts.
 *   `parseAnswerBatch` — the model's text → accepted rows + rejections. This
 *                        is where "answer or absent" is enforced: an unknown
 *                        id, a reserved question, a basis type the question
 *                        does not allow, a sourced basis with no URL, or an
 *                        empty basis all drop the answer. Nothing is repaired.
 *
 * `generateListingQuestions` glues them to the grounded Gemini caller. It is
 * only ever invoked from `scripts/admin/generate-move-in-questions.ts` — never
 * from a request path (CLAUDE.md §7: async only; the search-grounded call
 * takes tens of seconds).
 */

import { generateGrounded } from '@/lib/ai/gemini';
import { extractJsonObject } from '@/lib/utils/extract-json';
import { QuestionAnswer, QuestionAnswerBatch } from '@/lib/zod/questions';
import {
  ASKABLE_QUESTIONS,
  type QuestionDef,
  SOURCED_BASIS_TYPES,
  questionById,
} from '@percho/shared/questions';

/** What the generator knows about the home. Every field optional but `address`. */
export interface ListingFacts {
  address: string;
  city: string;
  state: string;
  zip?: string;
  neighborhood?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  lotSize?: string;
  hoa?: string;
  description?: string[];
  daysOnMarket?: number;
  /** Vision-tagger captions, one per photo the tagger found usable. */
  photoCaptions?: string[];
}

/** A row ready for `listing_questions`, minus listing_id / status. */
export interface AnswerRow {
  question_id: string;
  answer: string;
  basis: { type: string; note: string; url?: string }[];
  verify: string | null;
  form: string;
  decisiveness: number;
  scope: string;
}

export interface ParseResult {
  accepted: AnswerRow[];
  rejected: { id: string; reason: string }[];
}

/**
 * Fair Housing rule, verbatim from the design doc §1.3. Lives in the system
 * prompt on every call; the parser cannot check it, so the prompt must.
 */
const FAIR_HOUSING_RULE = `FAIR HOUSING — NON-NEGOTIABLE.
You describe PLACES and BEHAVIOUR, never PEOPLE by any protected class (race, colour, religion, national origin, sex, familial status, disability, sexual orientation, gender identity, marital status, veteran status, age).
ALLOWED: the existence, distance and character of places and institutions (a grocery, a mosque, a language school, a senior centre, a playground, a festival); behavioural indicators of a street (owner tenure, rental share, Halloween turnout, what Nextdoor argues about).
FORBIDDEN: any description of who the neighbours are by a protected class; demographic percentages of any kind, even from public Census data; "people like you live / don't live here"; "a family neighbourhood" as a description of residents. Say "playground 200 m away, elementary school three blocks" instead.
Questions marked fh=care must be answered ONLY through places, institutions and behaviour.`;

function systemPrompt(questions: readonly QuestionDef[]): string {
  const bank = questions
    .map(
      (q) =>
        `- ${q.id} [${q.scope}; basis: ${q.basis.join(',')}; form: ${q.form}; fh: ${q.fh}] ${q.q}`,
    )
    .join('\n');
  return `You research one specific home for a buyer who is deciding whether to visit it, and answer a fixed bank of questions about what it would be like to LIVE there — the things a person only finds out after moving in.

${FAIR_HOUSING_RULE}

HOW TO ANSWER
- Use web search. Prefer city / county / school-district / DOT / transit-agency pages, the municipal code, assessor records, local news, and attributed community posts. Answer about THIS home and THIS street; a neighbourhood-level fact is fine when phrased for the home.
- Every answer must rest on facts you can name. Each basis item has a "type" from the question's allowed list, a short "note" naming the fact (a distance you measured, a project name and date, a quoted post), and a "url" for anything that is a claim about the world. Basis types that MUST carry a url: ${SOURCED_BASIS_TYPES.join(', ')}. The others (dist, road, place, assessor, mls, listing_text, photo) may be your own measurement or the listing's own record.
- If you cannot support an answer with at least one real basis item, OMIT that question entirely. Do not guess. Do not pad. A short bank of true answers beats a long bank of plausible ones.
- Write the answer in 1–3 sentences, second person, plain and specific ("Left turns onto 104th Ave NE will wait at 8am: the city lists it as a cut-through collector and has scheduled speed cushions for 2027."). Narrative-form answers may open with "We'd expect…" and must still cite their basis.
- "verify" is an optional, concrete go-and-see action with a time of day when a visit can settle the question.
- "decisiveness" is 1–3: how much this answer could change a buyer's decision about THIS home (3 = could kill or make the deal, 1 = nice to know).

OUTPUT
Return exactly one JSON object and nothing else:
{"answers":[{"id":"<question id>","answer":"...","basis":[{"type":"road","note":"...","url":"https://..."}],"verify":"...","decisiveness":2,"form":"text"}]}
"form" must be the question's listed form. Use only ids from the bank below.

THE BANK
${bank}`;
}

export function buildPrompt(
  facts: ListingFacts,
  questions: readonly QuestionDef[] = ASKABLE_QUESTIONS,
): { system: string; user: string } {
  return {
    system: systemPrompt(questions),
    user: `THE HOME\n${JSON.stringify(facts, null, 1)}`,
  };
}

/**
 * The model's reply → rows. Pure; the bank is the only context. See the file
 * header for what is rejected and why nothing is repaired.
 */
export function parseAnswerBatch(raw: string): ParseResult {
  const rejected: ParseResult['rejected'] = [];
  const extracted = extractJsonObject(raw);
  if (!extracted) {
    return { accepted: [], rejected: [{ id: '*', reason: 'no JSON object in reply' }] };
  }
  let json: unknown;
  try {
    json = JSON.parse(extracted);
  } catch {
    return { accepted: [], rejected: [{ id: '*', reason: 'reply is not valid JSON' }] };
  }
  const parsed = QuestionAnswerBatch.safeParse(json);
  if (!parsed.success) {
    return {
      accepted: [],
      rejected: [{ id: '*', reason: `schema: ${parsed.error.issues[0]?.message ?? 'invalid'}` }],
    };
  }

  const accepted: AnswerRow[] = [];
  const seen = new Set<string>();
  for (const item of parsed.data.answers) {
    const one = QuestionAnswer.safeParse(item);
    if (!one.success) {
      const id =
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { id?: unknown }).id === 'string'
          ? (item as { id: string }).id
          : '?';
      const issue = one.error.issues[0];
      rejected.push({
        id,
        reason: `schema: ${issue ? `${issue.path.join('.') || 'answer'} ${issue.message}` : 'invalid'}`,
      });
      continue;
    }
    const a = one.data;
    const def = questionById(a.id);
    if (!def) {
      rejected.push({ id: a.id, reason: 'unknown question id' });
      continue;
    }
    if (def.fh === 'never') {
      rejected.push({ id: a.id, reason: 'reserved question (fh=never)' });
      continue;
    }
    if (seen.has(a.id)) {
      rejected.push({ id: a.id, reason: 'duplicate id' });
      continue;
    }
    if (a.basis.length === 0) {
      rejected.push({ id: a.id, reason: 'empty basis' });
      continue;
    }
    const badType = a.basis.find((b) => !def.basis.includes(b.type));
    if (badType) {
      rejected.push({ id: a.id, reason: `basis type '${badType.type}' not allowed` });
      continue;
    }
    const unsourced = a.basis.find((b) => SOURCED_BASIS_TYPES.includes(b.type) && !b.url);
    if (unsourced) {
      rejected.push({ id: a.id, reason: `basis '${unsourced.type}' needs a url` });
      continue;
    }
    if (a.form !== def.form) {
      rejected.push({ id: a.id, reason: `form '${a.form}' is not the question's '${def.form}'` });
      continue;
    }
    seen.add(a.id);
    accepted.push({
      question_id: a.id,
      answer: a.answer,
      basis: a.basis.map((b) => ({
        type: b.type,
        note: b.note,
        ...(b.url ? { url: b.url } : {}),
      })),
      verify: a.verify ?? null,
      form: a.form,
      decisiveness: a.decisiveness,
      scope: def.scope,
    });
  }
  return { accepted, rejected };
}

/** Generous cap: ~85 answers × ~90 tokens, plus the basis arrays. */
const MAX_TOKENS = 16000;

export async function generateListingQuestions(
  facts: ListingFacts,
  opts: { questions?: readonly QuestionDef[]; model?: string } = {},
): Promise<ParseResult & { sources: { url: string; title?: string }[]; rawText: string }> {
  const { system, user } = buildPrompt(facts, opts.questions ?? ASKABLE_QUESTIONS);
  const { text, sources } = await generateGrounded({
    system,
    user,
    maxTokens: MAX_TOKENS,
    ...(opts.model ? { model: opts.model } : {}),
  });
  return { ...parseAnswerBatch(text), sources, rawText: text };
}

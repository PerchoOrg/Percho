'use client';

/**
 * EditListingForm — Phase 4.3a metadata editor.
 *
 * Phase 8/listing-form-autosave (2026-06-11): switched from explicit
 * "Save changes" button to debounced auto-save. Every edit kicks a 600ms
 * debounce; on tick we POST the whole payload via `updateListing`. The
 * form also registers a `flushPending` hook the PublishPanel calls before
 * publishing, so an agent who edits and immediately clicks Publish doesn't
 * race the debounce.
 *
 * Phase 51/save-button-parity (2026-06-24): added an explicit "Save" button
 * at the bottom of the form (matching the community editor layout) so agents
 * have an instant-confirm escape hatch. Auto-save still runs on every edit
 * but is now SILENT — it never touches `saveState`, so the button label and
 * the "✓ Saved" flash react ONLY to explicit Save clicks. Owner ask
 * 2026-06-24: "auto save doesn't need to click the save button effect and
 * show the saved hint, only users click the save button, then do that".
 *
 * Phase 52 follow-up (2026-06-24): the Save button is always enabled (owner
 * ask: "let save button always be available"). Disabling it whenever the
 * form was clean made the button feel broken in the common case where
 * auto-save had already flushed. We only block clicks while a save is in
 * flight; otherwise pressing Save is a no-op flush that the user can hit
 * any time.
 *
 * UI conventions otherwise unchanged from phase 8/listing-form-ux:
 * Required/Optional badges, dropdowns for beds/baths/style with escape
 * inputs, lot size split into number+unit composed back into the text col.
 */

import { type UpdateListingInput, updateListing } from '@/app/dashboard/listings/[id]/edit/actions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { registerFlush } from './flush-registry';

interface InitialValues {
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  lot_size: string | null;
  hoa: string | null;
  style: string | null;
  description: string[];
  community_id: string | null;
}

export interface ListingContext {
  address: string;
  city: string;
  state: string;
  neighborhood: string | null;
}

export interface CommunityOption {
  id: string;
  name: string;
  city: string | null;
  state: string;
}

interface Props {
  listingId: string;
  initial: InitialValues;
  communities: CommunityOption[];
  listingContext: ListingContext;
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type GenState = 'idle' | 'loading' | 'error';

const STYLE_OPTIONS = [
  'Craftsman',
  'Colonial',
  'Modern',
  'Contemporary',
  'Ranch',
  'Tudor',
  'Mediterranean',
  'Farmhouse',
  'Townhouse',
  'Condo',
] as const;

const BED_OPTIONS = ['0', '1', '2', '3', '4', '5', '6'] as const;
const BATH_OPTIONS = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'] as const;

type LotUnit = 'acres' | 'sqft';

const AUTOSAVE_DEBOUNCE_MS = 600;

function parseLotSize(value: string | null): { num: string; unit: LotUnit } {
  if (!value) return { num: '', unit: 'acres' };
  const lower = value.toLowerCase();
  const unit: LotUnit = lower.includes('sqft') || lower.includes('sq ft') ? 'sqft' : 'acres';
  const numMatch = value.match(/[\d.,]+/);
  const num = numMatch ? numMatch[0].replace(/,/g, '') : '';
  return { num, unit };
}

function composeLotSize(num: string, unit: LotUnit): string | null {
  const trimmed = num.trim();
  if (trimmed === '') return null;
  return `${trimmed} ${unit}`;
}

// HOA stored as free text (legacy). UI now collects a number ($/month).
// Read: extract first integer from a stored string like "$120/mo" → "120".
// Write: compose "$<n>/month" so existing buyer-side renderers keep working.
function parseHoaAmount(value: string | null): string {
  if (!value) return '';
  const m = value.match(/\d[\d,]*/);
  return m ? m[0].replace(/,/g, '') : '';
}

function composeHoa(amount: string): string | null {
  const n = amount.trim();
  if (n === '') return null;
  return `$${n}/month`;
}

function buildYearOptions(): string[] {
  const current = new Date().getFullYear();
  const out: string[] = [];
  for (let y = current; y >= 1900; y--) out.push(y.toString());
  return out;
}

export function EditListingForm({ listingId, initial, communities, listingContext }: Props) {
  const [price, setPrice] = useState(initial.price?.toString() ?? '');

  const initialBeds = initial.beds?.toString() ?? '';
  const initialBedsInList = (BED_OPTIONS as readonly string[]).includes(initialBeds);
  const [bedsMode, setBedsMode] = useState<'list' | 'more'>(
    initialBeds === '' || initialBedsInList ? 'list' : 'more',
  );
  const [beds, setBeds] = useState(initialBeds);

  const initialBaths = initial.baths?.toString() ?? '';
  const initialBathsInList = (BATH_OPTIONS as readonly string[]).includes(initialBaths);
  const [bathsMode, setBathsMode] = useState<'list' | 'more'>(
    initialBaths === '' || initialBathsInList ? 'list' : 'more',
  );
  const [baths, setBaths] = useState(initialBaths);

  const [sqft, setSqft] = useState(initial.sqft?.toString() ?? '');
  const initialYearBuilt = initial.year_built?.toString() ?? '';
  const [yearBuilt, setYearBuilt] = useState(initialYearBuilt);

  const initialLot = useMemo(() => parseLotSize(initial.lot_size), [initial.lot_size]);
  const [lotNum, setLotNum] = useState(initialLot.num);
  const [lotUnit, setLotUnit] = useState<LotUnit>(initialLot.unit);

  const [hoa, setHoa] = useState(parseHoaAmount(initial.hoa));

  const yearOptions = useMemo(() => buildYearOptions(), []);
  const initialYearInList = initialYearBuilt !== '' && yearOptions.includes(initialYearBuilt);
  const [yearBuiltMode, setYearBuiltMode] = useState<'list' | 'custom'>(
    initialYearBuilt === '' || initialYearInList ? 'list' : 'custom',
  );

  const initialStyleInList = initial.style
    ? (STYLE_OPTIONS as readonly string[]).includes(initial.style)
    : true;
  const [styleMode, setStyleMode] = useState<'list' | 'other'>(
    initialStyleInList ? 'list' : 'other',
  );
  const [style, setStyle] = useState(initial.style ?? '');

  const [description, setDescription] = useState(initial.description.join('\n\n'));
  const [communityId, setCommunityId] = useState<string>(initial.community_id ?? '');

  // `saveState` reflects EXPLICIT Save-button clicks only — silent
  // auto-save never touches it (owner ask 2026-06-24). The Save button
  // stays enabled at all times so the agent can re-trigger a flush
  // whenever they want; we only disable while a save is in flight.
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [genState, setGenState] = useState<GenState>('idle');
  const [genError, setGenError] = useState<string | null>(null);

  function parseIntOrNull(s: string): number | null {
    if (s.trim() === '') return null;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function parseFloatOrNull(s: string): number | null {
    if (s.trim() === '') return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  /**
   * Build the payload from the latest state. Centralised so both the debounce
   * tick and the imperative flush use the same shape.
   */
  function buildPayload(): UpdateListingInput {
    return {
      price: parseIntOrNull(price),
      beds: parseFloatOrNull(beds),
      baths: parseFloatOrNull(baths),
      sqft: parseIntOrNull(sqft),
      year_built: parseIntOrNull(yearBuilt),
      lot_size: composeLotSize(lotNum, lotUnit),
      hoa: composeHoa(hoa),
      style: style.trim() === '' ? null : style.trim(),
      description,
      community_id: communityId === '' ? null : communityId,
    };
  }

  // Refs that survive renders. We don't put the payload in a ref because
  // useEffect already closes over the latest values via its dep array.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const dirtyRef = useRef(false);
  const initialMountRef = useRef(true);

  /**
   * Run a single save round trip.
   *
   * `silent=true` (auto-save path): never touches `saveState`. Errors still
   *   surface via `errorMsg` so an invalid edit doesn't fail invisibly.
   * `silent=false` (explicit Save click): drives saveState through
   *   saving → saved → idle so the button label and "✓ Saved" flash react.
   *
   * Resolves on completion regardless of outcome so the flusher never hangs.
   */
  async function runSave(silent: boolean) {
    if (!silent) {
      setSaveState('saving');
      setErrorMsg(null);
    }
    try {
      const result = await updateListing(listingId, buildPayload());
      if (result.ok) {
        dirtyRef.current = false;
        if (!silent) {
          setSaveState('saved');
          // brief "Saved" flash, then back to idle
          setTimeout(() => {
            setSaveState((s) => (s === 'saved' ? 'idle' : s));
          }, 1500);
        }
      } else {
        if (!silent) setSaveState('error');
        setErrorMsg(result.error);
      }
    } catch (err) {
      if (!silent) setSaveState('error');
      setErrorMsg(err instanceof Error ? err.message : 'unknown');
    }
  }

  /**
   * Cancel any pending debounce, flush whatever's dirty, await any in-flight
   * save. Called by PublishPanel before publish; also exposed for unmount.
   * Always silent — publish flow doesn't want a "Saved" flash to flicker
   * before the publish action takes over.
   */
  async function flushNow(): Promise<void> {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (inflightRef.current) {
      await inflightRef.current;
    }
    if (dirtyRef.current) {
      const p = runSave(true);
      inflightRef.current = p.finally(() => {
        if (inflightRef.current === p) inflightRef.current = null;
      });
      await p;
    }
  }

  /**
   * Explicit Save-button click. Same as flushNow but VISIBLE: drives
   * saveState so the button shows "Saving…" then "✓ Saved".
   */
  async function saveNow(): Promise<void> {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (inflightRef.current) {
      await inflightRef.current;
    }
    const p = runSave(false);
    inflightRef.current = p.finally(() => {
      if (inflightRef.current === p) inflightRef.current = null;
    });
    await p;
  }

  // Debounced auto-save. Skip the very first effect run (mount) so we don't
  // round-trip a no-op save on page load. The form-state vars ARE the deps;
  // runSave/inflightRef are intentionally stable across renders.
  // biome-ignore lint/correctness/useExhaustiveDependencies: form-state deps drive auto-save; runSave reads latest state via closure
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    dirtyRef.current = true;
    setErrorMsg(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      // If a save is already in flight, wait for it before kicking the next.
      const tick = async () => {
        if (inflightRef.current) await inflightRef.current;
        const p = runSave(true);
        inflightRef.current = p.finally(() => {
          if (inflightRef.current === p) inflightRef.current = null;
        });
      };
      void tick();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [price, beds, baths, sqft, yearBuilt, lotNum, lotUnit, hoa, style, description, communityId]);

  // Register the flush hook for PublishPanel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: register once on mount.
  useEffect(() => {
    const unregister = registerFlush(flushNow);
    return unregister;
  }, []);

  // Best-effort flush on tab close. Note: server actions can't be called from
  // beforeunload (no fetch keepalive on Next server actions), so we just warn
  // the user if there's unsaved work.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current || saveState === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveState]);

  async function onGenerate() {
    setGenState('loading');
    setGenError(null);
    try {
      const payload: Record<string, unknown> = {
        address: listingContext.address,
        city: listingContext.city,
        state: listingContext.state,
      };
      if (listingContext.neighborhood) payload.neighborhood = listingContext.neighborhood;
      const priceN = parseIntOrNull(price);
      if (priceN !== null) payload.price = priceN;
      const bedsN = parseFloatOrNull(beds);
      if (bedsN !== null) payload.beds = bedsN;
      const bathsN = parseFloatOrNull(baths);
      if (bathsN !== null) payload.baths = bathsN;
      const sqftN = parseIntOrNull(sqft);
      if (sqftN !== null) payload.sqft = sqftN;
      const styleT = style.trim();
      if (styleT) payload.style = styleT;

      const res = await fetch('/api/generate-copy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 429) throw new Error('Rate limit hit — try again in a minute.');
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { paragraphs: string[] };
      setDescription(data.paragraphs.join('\n\n'));
      setGenState('idle');
    } catch (err) {
      setGenState('error');
      setGenError(err instanceof Error ? err.message : 'unknown');
    }
  }

  return (
    <div className="space-y-6">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="List price (USD)" required>
          <input
            type="number"
            min="0"
            step="1000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 950000"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Square feet" optional>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="10"
              value={sqft}
              onChange={(e) => setSqft(e.target.value)}
              placeholder="e.g. 3200"
              className={`${INPUT_CLASS} pr-12`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
              sq ft
            </span>
          </div>
        </Field>

        <Field label="Bedrooms" required>
          {bedsMode === 'list' ? (
            <select
              value={beds}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__more__') {
                  setBedsMode('more');
                  setBeds('');
                } else {
                  setBeds(v);
                }
              }}
              className={INPUT_CLASS}
            >
              <option value="">— Select —</option>
              {BED_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b === '0' ? '0 (studio)' : b}
                </option>
              ))}
              <option value="__more__">7 or more…</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input
                type="number"
                min="7"
                step="1"
                value={beds}
                onChange={(e) => setBeds(e.target.value)}
                placeholder="e.g. 8"
                className={INPUT_CLASS}
              />
              <button
                type="button"
                onClick={() => {
                  setBedsMode('list');
                  setBeds('');
                }}
                className="shrink-0 rounded border border-line px-2 text-xs text-ink2 hover:bg-ink2/10"
              >
                Use list
              </button>
            </div>
          )}
        </Field>

        <Field
          label="Bathrooms"
          required
        >
          {bathsMode === 'list' ? (
            <select
              value={baths}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__more__') {
                  setBathsMode('more');
                  setBaths('');
                } else {
                  setBaths(v);
                }
              }}
              className={INPUT_CLASS}
            >
              <option value="">— Select —</option>
              {BATH_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value="__more__">More than 5…</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.5"
                value={baths}
                onChange={(e) => setBaths(e.target.value)}
                placeholder="e.g. 5.5"
                className={INPUT_CLASS}
              />
              <button
                type="button"
                onClick={() => {
                  setBathsMode('list');
                  setBaths('');
                }}
                className="shrink-0 rounded border border-line px-2 text-xs text-ink2 hover:bg-ink2/10"
              >
                Use list
              </button>
            </div>
          )}
        </Field>

        <Field label="Year built" optional>
          {yearBuiltMode === 'list' ? (
            <select
              value={yearBuilt}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__custom__') {
                  setYearBuiltMode('custom');
                  setYearBuilt('');
                } else {
                  setYearBuilt(v);
                }
              }}
              className={INPUT_CLASS}
            >
              <option value="">— Select —</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value="__custom__">Type a year…</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input
                type="number"
                min="1800"
                max="2100"
                value={yearBuilt}
                onChange={(e) => setYearBuilt(e.target.value)}
                placeholder="e.g. 1898"
                className={INPUT_CLASS}
              />
              <button
                type="button"
                onClick={() => {
                  setYearBuiltMode('list');
                  setYearBuilt('');
                }}
                className="shrink-0 rounded border border-line px-2 text-xs text-ink2 hover:bg-ink2/10"
              >
                Use list
              </button>
            </div>
          )}
        </Field>

        <Field label="Lot size" optional>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={lotNum}
              onChange={(e) => setLotNum(e.target.value)}
              placeholder={lotUnit === 'acres' ? 'e.g. 0.35' : 'e.g. 15000'}
              className={INPUT_CLASS}
            />
            <select
              value={lotUnit}
              onChange={(e) => setLotUnit(e.target.value as LotUnit)}
              className={`${INPUT_CLASS} max-w-[7rem]`}
            >
              <option value="acres">acres</option>
              <option value="sqft">sqft</option>
            </select>
          </div>
        </Field>

        <Field label="HOA" optional>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted">
              $
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={hoa}
              onChange={(e) => setHoa(e.target.value)}
              placeholder="e.g. 120"
              className={`${INPUT_CLASS} pl-7 pr-16`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
              /month
            </span>
          </div>
        </Field>

        <Field label="Style" optional>
          {styleMode === 'list' ? (
            <select
              value={style}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__other__') {
                  setStyleMode('other');
                  setStyle('');
                } else {
                  setStyle(v);
                }
              }}
              className={INPUT_CLASS}
            >
              <option value="">— Select —</option>
              {STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="__other__">Other…</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="e.g. Mid-century"
                maxLength={80}
                className={INPUT_CLASS}
              />
              <button
                type="button"
                onClick={() => {
                  setStyleMode('list');
                  setStyle('');
                }}
                className="shrink-0 rounded border border-line px-2 text-xs text-ink2 hover:bg-ink2/10"
              >
                Use list
              </button>
            </div>
          )}
        </Field>
      </fieldset>

      <Field
        label="Community"
        optional
      >
        <select
          value={communityId}
          onChange={(e) => setCommunityId(e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">— None —</option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.city ? ` (${c.city}, ${c.state})` : ` (${c.state})`}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Description"
        optional
      >
        <div className="mb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={genState === 'loading'}
            className="rounded border border-line px-3 py-1 text-xs text-ink hover:bg-ink2/20 disabled:opacity-50"
          >
            {genState === 'loading' ? 'Generating…' : '✨ Generate description'}
          </button>
          {genState === 'error' && (
            <span className="text-xs text-red-400">Error: {genError ?? 'unknown'}</span>
          )}
          <span className="text-xs text-muted">Overwrites current text.</span>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          placeholder="Tell buyers what makes this home special. Press Enter twice for a new paragraph."
          className={`${INPUT_CLASS} min-h-[10rem] resize-y`}
        />
      </Field>

      <div className="flex items-center gap-3 border-line border-t pt-4">
        <button
          type="button"
          onClick={() => {
            void saveNow();
          }}
          disabled={saveState === 'saving'}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-cream transition hover:opacity-90 disabled:opacity-50"
        >
          {saveState === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {saveState === 'saved' && <span className="text-sm text-emerald-400">✓ Saved</span>}
        {saveState === 'error' && errorMsg && (
          <span className="text-sm text-red-400">Error: {errorMsg}</span>
        )}
      </div>
    </div>
  );
}

const INPUT_CLASS =
  'w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong';

function Field({
  label,
  hint,
  required,
  optional: _optional,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-ink2">
        <span>{label}</span>
        {required ? (
          <span className="text-red-300" aria-label="required">
            *
          </span>
        ) : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

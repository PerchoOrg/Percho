'use client';

/**
 * CommunityEditor — Phase 4.4; Phase 23 trimmed; Phase 50 flattened;
 * Phase 50.4 expanded; Phase 50.5 typed numerics; Phase 50.6 opt-in ranges;
 * Phase 50.7 (2026-06-22) form-level cleanup per owner;
 * Phase 51 (2026-06-24) auto-save parity with listing editor.
 *
 * Phase 51/save-button-parity (2026-06-24): added 600ms debounced auto-save
 * mirroring the listing editor (Phase 8 pattern). The "Save changes" button
 * is renamed to "Save" and now functions as a flush-now escape hatch — it
 * cancels the pending debounce and round-trips immediately, useful when the
 * agent wants explicit confirmation. The "No unsaved changes" hint is gone
 * (the SaveBadge already conveys state). Auto-save tick failures still
 * surface fieldErrors / formError so a typo doesn't silently fail.
 *
 * Phase 50.7 design notes:
 *   - **No section grouping.** "Identity / Location / Pitch / Property /
 *     Contact" headings are gone. Owner: "Remove all categories like
 *     identity, location…". Flat field stream — fewer visual layers, less
 *     for the eye to parse on mobile.
 *   - **City + ZIP required.** Both starred. Buyer-side geo filtering needs
 *     them; agents can fix bad data faster when the form refuses to save
 *     a community without them.
 *   - **Year built = two optional number inputs.** Start year + End year,
 *     both 1800–2100, both optional. The 50.5 dual-mode select (recent
 *     years dropdown + "Type a year…" escape hatch) and the 50.6 opt-in
 *     toggle are both gone — owner asked for "two dropdowns for start and
 *     end, both optional", literal interpretation. End-year cross-field
 *     check (>= start) still runs server-side.
 *   - **Price = two optional dollar inputs.** Min + Max, both optional.
 *     50.6 opt-in toggle removed for the same reason.
 *   - **Tagline dropped.** Owner: "redundant with highlights and
 *     descriptions". Migration 0039 drops the column.
 *   - **Property types are NAR/Zillow consumer-facing labels** (Single
 *     Family / Townhouse / Condo / Co-op / Multi-Family / Manufactured /
 *     Land). The 50.4 list mixed type with sale-stage ("New Construction",
 *     "Resale") and surfaced "Active Adult 55+" jargon — owner: "not sure
 *     what is 55". Cleaner taxonomy.
 *   - All hints stay removed; placeholders + adornments carry the load.
 */

import { deleteCommunity, updateCommunity } from '@/app/dashboard/communities/actions';
import { COMMUNITY_PROPERTY_TYPES } from '@/lib/zod/community';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

const AUTOSAVE_DEBOUNCE_MS = 600;
type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const INPUT_BASE =
  'w-full rounded border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-60';
const INPUT_OK = 'border-line focus:border-line-strong focus:ring-line-strong';
const INPUT_ERR = 'border-red-500/70 focus:border-red-400 focus:ring-red-400';

function inputCls(hasError: boolean) {
  return `${INPUT_BASE} ${hasError ? INPUT_ERR : INPUT_OK}`;
}

// Year dropdown options — current year + 24 prior years. Phase 50.7 simplified
// from the 50.5 dual-mode "Type a year…" escape hatch: an "old" community is
// rare in our pipeline (Vivian's set is mostly post-2000 builds) and the
// escape hatch added a state machine for ~1% of cases. If a 1950s build
// shows up, owner can use the listing editor or we add the escape back later.
function buildYearOptions(): string[] {
  const now = new Date().getFullYear();
  const out: string[] = [];
  for (let y = now; y >= now - 24; y--) out.push(String(y));
  return out;
}

function parseIntOrNull(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

interface CommunityRow {
  id: string;
  name: string;
  city: string | null;
  state: string;
  description: string | null;
  zip: string | null;
  county: string | null;
  hoa_fee_monthly: number | null;
  year_built: number | null;
  year_built_end: number | null;
  price_min: number | null;
  price_max: number | null;
  property_types: string[] | null;
  highlights: string[] | null;
  builder: string | null;
  website: string | null;
}

export function CommunityEditor({
  community,
  canEditMetadata,
}: {
  community: CommunityRow;
  canEditMetadata: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(community.name);
  const [city, setCity] = useState(community.city ?? '');
  const [state, setState] = useState(community.state);
  const [zip, setZip] = useState(community.zip ?? '');
  const [county, setCounty] = useState(community.county ?? '');
  const [highlights, setHighlights] = useState<string[]>(community.highlights ?? []);
  const [description, setDescription] = useState(community.description ?? '');
  const [propertyTypes, setPropertyTypes] = useState<string[]>(community.property_types ?? []);
  const [builder, setBuilder] = useState(community.builder ?? '');

  // Year built — two optional selects (start + end). Phase 50.7 simplified
  // from the 50.5 dual-mode + 50.6 opt-in toggle. Both fields are stringified
  // ints for input compatibility.
  const yearOptions = useMemo(() => buildYearOptions(), []);
  const [yearBuilt, setYearBuilt] = useState(community.year_built?.toString() ?? '');
  const [yearBuiltEnd, setYearBuiltEnd] = useState(community.year_built_end?.toString() ?? '');

  const [priceMin, setPriceMin] = useState(community.price_min?.toString() ?? '');
  const [priceMax, setPriceMax] = useState(community.price_max?.toString() ?? '');
  const [hoaFee, setHoaFee] = useState(community.hoa_fee_monthly?.toString() ?? '');
  const [website, setWebsite] = useState(community.website ?? '');

  // `saveState` only reflects EXPLICIT Save-button clicks. Silent auto-save
  // does not flip it (owner ask 2026-06-24: "auto save doesn't need to click
  // the save button effect and show the saved hint, only users click the
  // save button, then do that").
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The Save button stays enabled at all times (owner ask 2026-06-24: a
  // disabled Save button feels broken — let the agent re-trigger a flush
  // whenever they want, even if nothing has changed). We only disable
  // while a save is in flight. dirtyRef remains for the flush hook /
  // auto-save tick, which DO want to know whether work is queued.

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function togglePropertyType(t: string) {
    setPropertyTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
    clearFieldError('property_types');
  }

  // Refs for the auto-save state machine. `dirtyRef` tracks whether there's
  // unsynced state since last successful save; `inflightRef` lets us serialise
  // saves so a debounce tick that fires while a save is mid-flight queues
  // behind it instead of racing. `initialMountRef` swallows the first effect
  // run so we don't ship a no-op save on page load. Mirrors EditListingForm.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const dirtyRef = useRef(false);
  const initialMountRef = useRef(true);

  /**
   * Build the payload from the latest state. Centralised so both the debounce
   * tick and the explicit Save button use the same shape.
   */
  function buildPayload() {
    const trimOrNull = (v: string) => (v.trim() === '' ? null : v.trim());
    return {
      name: name.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase(),
      description: trimOrNull(description),
      zip: zip.trim(),
      county: trimOrNull(county),
      hoa_fee_monthly: parseIntOrNull(hoaFee),
      year_built: parseIntOrNull(yearBuilt),
      year_built_end: parseIntOrNull(yearBuiltEnd),
      price_min: parseIntOrNull(priceMin),
      price_max: parseIntOrNull(priceMax),
      property_types: propertyTypes.length > 0 ? propertyTypes : null,
      highlights: highlights.length > 0 ? highlights : null,
      builder: trimOrNull(builder),
      website: trimOrNull(website),
    };
  }

  /**
   * One save round trip. Resolves on completion regardless of outcome so the
   * flusher never hangs.
   *
   * `silent=true` (auto-save path): never touches `saveState`. fieldErrors
   *   and formError ARE still surfaced — silent ≠ swallow validation. Skips
   *   router.refresh() to avoid mid-edit surface flicker.
   * `silent=false` (explicit Save click): drives saveState through
   *   saving → saved → idle for the visible "Saving…" / "✓ Saved" feedback.
   *   Calls router.refresh() so any read-only surfaces update.
   */
  async function runSave(silent: boolean) {
    if (!silent) {
      setSaveState('saving');
      setFieldErrors({});
      setFormError(null);
    }
    try {
      const result = await updateCommunity(community.id, buildPayload());
      if (result.ok) {
        dirtyRef.current = false;
        if (!silent) {
          setSaveState('saved');
          setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
          router.refresh();
        }
      } else {
        if (!silent) setSaveState('error');
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        if (!result.fieldErrors || Object.keys(result.fieldErrors).length === 0) {
          setFormError(result.error);
        }
      }
    } catch (err) {
      if (!silent) setSaveState('error');
      setFormError(err instanceof Error ? err.message : 'unknown');
    }
  }

  /**
   * Explicit Save-button click. Cancels any pending debounce, awaits any
   * in-flight save, then runs a VISIBLE save: drives saveState so the
   * button shows "Saving…" then "✓ Saved".
   */
  async function saveNow(): Promise<void> {
    if (!canEditMetadata) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (inflightRef.current) await inflightRef.current;
    const p = runSave(false);
    inflightRef.current = p.finally(() => {
      if (inflightRef.current === p) inflightRef.current = null;
    });
    await p;
  }

  // Debounced auto-save. Skip the very first effect run (mount) so we don't
  // round-trip a no-op save on page load. The form-state vars ARE the deps;
  // runSave reads latest state via closure on each tick.
  // biome-ignore lint/correctness/useExhaustiveDependencies: form-state deps drive auto-save; runSave reads latest state via closure
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (!canEditMetadata) return;
    dirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
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
  }, [
    name,
    city,
    state,
    zip,
    county,
    description,
    builder,
    yearBuilt,
    yearBuiltEnd,
    priceMin,
    priceMax,
    hoaFee,
    website,
    propertyTypes,
    highlights,
  ]);

  // Best-effort warn-on-close if there's unsaved work.
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

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEditMetadata) return;
    startTransition(() => {
      void saveNow();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Name" required error={fieldErrors.name}>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError('name');
          }}
          maxLength={120}
          placeholder="e.g. Peachtree Corners"
          disabled={!canEditMetadata}
          aria-invalid={!!fieldErrors.name}
          className={inputCls(!!fieldErrors.name)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_5rem_7rem]">
        <Field label="City" required error={fieldErrors.city}>
          <input
            type="text"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              clearFieldError('city');
            }}
            maxLength={80}
            placeholder="Atlanta"
            disabled={!canEditMetadata}
            aria-invalid={!!fieldErrors.city}
            className={inputCls(!!fieldErrors.city)}
          />
        </Field>
        <Field label="State" required error={fieldErrors.state}>
          <input
            type="text"
            value={state}
            onChange={(e) => {
              setState(e.target.value.toUpperCase());
              clearFieldError('state');
            }}
            maxLength={2}
            placeholder="GA"
            disabled={!canEditMetadata}
            aria-invalid={!!fieldErrors.state}
            className={inputCls(!!fieldErrors.state)}
          />
        </Field>
        <Field label="ZIP" required error={fieldErrors.zip}>
          <input
            type="text"
            value={zip}
            onChange={(e) => {
              setZip(e.target.value);
              clearFieldError('zip');
            }}
            maxLength={10}
            placeholder="30092"
            disabled={!canEditMetadata}
            aria-invalid={!!fieldErrors.zip}
            className={inputCls(!!fieldErrors.zip)}
          />
        </Field>
      </div>

      <Field label="County" error={fieldErrors.county}>
        <input
          type="text"
          value={county}
          onChange={(e) => {
            setCounty(e.target.value);
            clearFieldError('county');
          }}
          maxLength={80}
          placeholder="Gwinnett County"
          disabled={!canEditMetadata}
          aria-invalid={!!fieldErrors.county}
          className={inputCls(!!fieldErrors.county)}
        />
      </Field>

      <Field label="Highlights" error={fieldErrors.highlights}>
        <ChipInput
          values={highlights}
          onChange={(next) => {
            setHighlights(next);
            clearFieldError('highlights');
          }}
          placeholder="e.g. Top-rated schools"
          maxItems={8}
          maxLength={80}
          disabled={!canEditMetadata}
          ariaInvalid={!!fieldErrors.highlights}
        />
      </Field>

      <Field label="Description" error={fieldErrors.description}>
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            clearFieldError('description');
          }}
          rows={4}
          maxLength={2000}
          placeholder="Tell buyers what makes this neighborhood feel like home — vibe, who lives here, what you'd notice on a Saturday morning."
          disabled={!canEditMetadata}
          aria-invalid={!!fieldErrors.description}
          className={`${inputCls(!!fieldErrors.description)} resize-y`}
        />
      </Field>

      <Field label="Property types" error={fieldErrors.property_types}>
        <div className="flex flex-wrap gap-2">
          {COMMUNITY_PROPERTY_TYPES.map((t) => {
            const active = propertyTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                disabled={!canEditMetadata}
                onClick={() => togglePropertyType(t)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? 'border-ink bg-ink text-cream'
                    : 'border-line bg-surface text-ink2 hover:border-line-strong hover:text-ink'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Builder" error={fieldErrors.builder}>
          <input
            type="text"
            value={builder}
            onChange={(e) => {
              setBuilder(e.target.value);
              clearFieldError('builder');
            }}
            maxLength={120}
            placeholder="e.g. Pulte, Toll Brothers"
            disabled={!canEditMetadata}
            aria-invalid={!!fieldErrors.builder}
            className={inputCls(!!fieldErrors.builder)}
          />
        </Field>
        {/* Year built — two optional dropdowns. Owner ask 2026-06-22:
            "Year built range, show two drop downs for start and end, both
            are optional". Cross-field check (end >= start) runs in zod. */}
        <Field
          label="Year built"
          error={fieldErrors.year_built || fieldErrors.year_built_end}
        >
          <div className="flex items-center gap-2">
            <select
              value={yearBuilt}
              onChange={(e) => {
                setYearBuilt(e.target.value);
                clearFieldError('year_built');
                clearFieldError('year_built_end');
              }}
              disabled={!canEditMetadata}
              aria-invalid={!!fieldErrors.year_built}
              aria-label="Start year"
              className={inputCls(!!fieldErrors.year_built)}
            >
              <option value="">— Start —</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="shrink-0 text-ink2 text-sm">–</span>
            <select
              value={yearBuiltEnd}
              onChange={(e) => {
                setYearBuiltEnd(e.target.value);
                clearFieldError('year_built_end');
              }}
              disabled={!canEditMetadata}
              aria-invalid={!!fieldErrors.year_built_end}
              aria-label="End year"
              className={inputCls(!!fieldErrors.year_built_end)}
            >
              <option value="">— End —</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </Field>
      </div>

      {/* Price — two optional dollar inputs (min + max). Owner ask
          2026-06-22: "Price range, similar [to year]". Cross-field check
          (max >= min) runs in zod. */}
      <Field
        label="Price"
        error={fieldErrors.price_min || fieldErrors.price_max}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DollarInput
            value={priceMin}
            onChange={(v) => {
              setPriceMin(v);
              clearFieldError('price_min');
              clearFieldError('price_max');
            }}
            placeholder="450,000"
            suffix="from"
            disabled={!canEditMetadata}
            hasError={!!fieldErrors.price_min}
          />
          <DollarInput
            value={priceMax}
            onChange={(v) => {
              setPriceMax(v);
              clearFieldError('price_max');
            }}
            placeholder="1,200,000"
            suffix="to"
            disabled={!canEditMetadata}
            hasError={!!fieldErrors.price_max}
          />
        </div>
      </Field>

      <Field label="HOA fee" error={fieldErrors.hoa_fee_monthly}>
        <DollarInput
          value={hoaFee}
          onChange={(v) => {
            setHoaFee(v);
            clearFieldError('hoa_fee_monthly');
          }}
          placeholder="220"
          suffix="/month"
          disabled={!canEditMetadata}
          hasError={!!fieldErrors.hoa_fee_monthly}
        />
      </Field>

      <Field label="Website" error={fieldErrors.website}>
        <input
          type="url"
          value={website}
          onChange={(e) => {
            setWebsite(e.target.value);
            clearFieldError('website');
          }}
          maxLength={500}
          placeholder="https://peachtreecorners.example.com"
          disabled={!canEditMetadata}
          aria-invalid={!!fieldErrors.website}
          className={inputCls(!!fieldErrors.website)}
        />
      </Field>

      {canEditMetadata && (
        <div className="flex items-center gap-3 border-line border-t pt-4">
          <button
            type="submit"
            disabled={isPending || saveState === 'saving'}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-cream transition hover:opacity-90 disabled:opacity-50"
          >
            {saveState === 'saving' ? 'Saving…' : 'Save'}
          </button>
          {saveState === 'saved' && <span className="text-sm text-emerald-400">✓ Saved</span>}
          {saveState === 'error' && formError && (
            <span className="text-sm text-red-400">Error: {formError}</span>
          )}
        </div>
      )}
    </form>
  );
}

export function CommunityDangerZone({ communityId }: { communityId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleDelete() {
    if (
      !confirm(
        'Permanently delete this neighborhood? Schools, POIs, photos, videos and saved entries for it will be removed. Listings will be detached but not deleted. This cannot be undone.',
      )
    )
      return;
    setErr(null);
    startTransition(async () => {
      const res = await deleteCommunity(communityId);
      if (res.ok) {
        router.replace('/dashboard/communities');
      } else {
        setErr(res.error);
      }
    });
  }

  // Mirrors the listing DangerZone — solid rose on the light palette so the
  // destructive action actually reads as destructive. Phase 50.18 (2026-06-24):
  // bumped border to rose-400 and bg from rose-50/40 → rose-50 (no opacity)
  // because the translucent treatment looked faded against the cream surface
  // — qiaoxux feedback "danger zone color is fainted".
  return (
    <section>
      <div className="rounded-2xl border border-rose-400 bg-rose-50 p-5 sm:p-6">
        <h2 className="font-semibold text-ink text-sm">Danger zone</h2>
        <p className="mt-1 text-ink2 text-xs">
          Deleting a neighborhood is permanent and removes its schools, POIs, photos, videos, and
          saved entries. Listings will be detached but not deleted.
        </p>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 font-medium text-sm text-white transition hover:bg-rose-700 active:scale-[0.99] disabled:opacity-60 sm:w-auto sm:min-w-[240px]"
        >
          {isPending ? 'Deleting…' : 'Delete this neighborhood'}
        </button>
        {err && <p className="mt-2 text-rose-700 text-xs">{err}</p>}
      </div>
    </section>
  );
}

// ————————————————————————————————————————————————————————————————
// Local UI helpers

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-ink2 text-xs">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </span>
      {children}
      {error && <span className="block text-red-400 text-xs">{error}</span>}
    </label>
  );
}

/**
 * DollarInput — number input with `$` prefix and an optional right-side
 * suffix (e.g. "/month", "from", "to"). Value is the raw integer string;
 * parent component handles parseIntOrNull on submit.
 *
 * Mirrors the listing editor's HOA input shape so price/HOA across the two
 * editors render and feel identical.
 */
function DollarInput({
  value,
  onChange,
  placeholder,
  suffix,
  disabled,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix?: string;
  disabled?: boolean;
  hasError?: boolean;
}) {
  const suffixWidth = suffix ? `${Math.max(suffix.length * 0.55 + 1.25, 4)}rem` : '0.75rem';
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted text-xs">
        $
      </span>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={hasError}
        className={`${inputCls(!!hasError)} pl-7`}
        style={{ paddingRight: suffixWidth }}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted text-xs">
          {suffix}
        </span>
      )}
    </div>
  );
}

function ChipInput({
  values,
  onChange,
  placeholder,
  maxItems,
  maxLength,
  disabled,
  ariaInvalid,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  maxItems: number;
  maxLength: number;
  disabled?: boolean;
  ariaInvalid?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const atCap = values.length >= maxItems;

  function addCurrent() {
    const t = draft.trim();
    if (t === '' || atCap || values.includes(t)) {
      setDraft('');
      return;
    }
    onChange([...values, t.slice(0, maxLength)]);
    setDraft('');
  }

  function removeAt(i: number) {
    onChange(values.filter((_, idx) => idx !== i));
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded border bg-surface px-2 py-2 text-sm ${
        ariaInvalid ? 'border-red-500/70' : 'border-line'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-ink/10 px-2.5 py-0.5 text-ink text-xs"
        >
          {v}
          {!disabled && (
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label={`Remove ${v}`}
              className="text-ink2 hover:text-ink"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!atCap && !disabled && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addCurrent();
            } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
              removeAt(values.length - 1);
            }
          }}
          onBlur={addCurrent}
          maxLength={maxLength}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[8rem] bg-transparent px-1 outline-none placeholder:text-muted"
        />
      )}
      {atCap && (
        <span className="px-1 text-muted text-xs">
          Max {maxItems} reached
        </span>
      )}
    </div>
  );
}

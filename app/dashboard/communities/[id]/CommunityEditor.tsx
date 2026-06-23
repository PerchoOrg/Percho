'use client';

/**
 * CommunityEditor — Phase 4.4; Phase 23 (2026-06-14) trimmed; Phase 50
 * (2026-06-22) flattened; Phase 50.4 (2026-06-22) expanded with 10 metadata
 * fields; Phase 50.5 (2026-06-22) typed numerics + unit adornments to match
 * the listing editor.
 *
 * Phase 50.5 design notes — input parity with listing:
 *   - Year built: single year (1800–2100). Same dual-mode UI as listing —
 *     a select of recent years with a "Type a year…" escape hatch into a
 *     number input. Don't make agents reinvent format choices.
 *   - HOA fee: integer dollars/month with `$` prefix and `/month` suffix
 *     adornments, exactly like the listing HOA field.
 *   - Price: split into From / To integers, both with `$` prefix. Min ≤ max
 *     enforced server-side. Two number inputs is friendlier than free-text
 *     "$450k – $1.2M" because the agent never has to think about hyphens,
 *     "k" abbreviations, or which dash character to use.
 *   - All hints removed per owner ask 2026-06-22 — placeholders + adornments
 *     should communicate everything a hint would have. If a field needs a
 *     hint to be usable, the field's design is the bug.
 *
 * Earlier phases:
 *   - Phase 50.4: 10 metadata fields, chip inputs for property_types and
 *     highlights, isDirty Save gate, 5-section grouping (Identity / Location
 *     / Pitch / Property / Contact).
 *   - Phase 50: removed inner `<section>` wrapper + duplicate "Community
 *     details" heading. The page-level details panel is now the sole frame.
 *   - Phase 50: DangerZone moved out — page.tsx renders it as a sibling.
 */

import { deleteCommunity, updateCommunity } from '@/app/dashboard/communities/actions';
import { COMMUNITY_PROPERTY_TYPES } from '@/lib/zod/community';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

const INPUT_BASE =
  'w-full rounded border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-60';
const INPUT_OK = 'border-line focus:border-line-strong focus:ring-line-strong';
const INPUT_ERR = 'border-red-500/70 focus:border-red-400 focus:ring-red-400';

function inputCls(hasError: boolean) {
  return `${INPUT_BASE} ${hasError ? INPUT_ERR : INPUT_OK}`;
}

// Mirrors the listing editor's `buildYearOptions` — current year + 24 prior
// years + a "Type a year…" escape hatch covers the realistic "when was this
// new community delivered" case without pretending to support 1860 colonial
// pre-revival builds. Anything earlier falls through to the custom input.
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
  tagline: string | null;
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
  const [tagline, setTagline] = useState(community.tagline ?? '');
  const [highlights, setHighlights] = useState<string[]>(community.highlights ?? []);
  const [description, setDescription] = useState(community.description ?? '');
  const [propertyTypes, setPropertyTypes] = useState<string[]>(community.property_types ?? []);
  const [builder, setBuilder] = useState(community.builder ?? '');

  // Year built — dual mode like listing. Stored value is a stringified int
  // for input compatibility; parsed to number on submit.
  const initialYearBuilt = community.year_built?.toString() ?? '';
  const [yearBuilt, setYearBuilt] = useState(initialYearBuilt);
  const yearOptions = useMemo(() => buildYearOptions(), []);
  const initialYearInList = initialYearBuilt !== '' && yearOptions.includes(initialYearBuilt);
  const [yearBuiltMode, setYearBuiltMode] = useState<'list' | 'custom'>(
    initialYearBuilt === '' || initialYearInList ? 'list' : 'custom',
  );

  // Phase 50.6 — phased delivery. End year is opt-in: collapsed unless the
  // community already has a saved end-year value.
  const initialYearBuiltEnd = community.year_built_end?.toString() ?? '';
  const [yearBuiltEnd, setYearBuiltEnd] = useState(initialYearBuiltEnd);
  const [yearEndShown, setYearEndShown] = useState(initialYearBuiltEnd !== '');

  const [priceMin, setPriceMin] = useState(community.price_min?.toString() ?? '');
  const [priceMax, setPriceMax] = useState(community.price_max?.toString() ?? '');
  // Phase 50.6 — collapse Price max behind an opt-in toggle. If the row
  // already has a max price, show both inputs from the start.
  const [priceMaxShown, setPriceMaxShown] = useState(community.price_max != null);
  const [hoaFee, setHoaFee] = useState(community.hoa_fee_monthly?.toString() ?? '');
  const [website, setWebsite] = useState(community.website ?? '');

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Track whether the form has any unsaved changes vs. the loaded row. Lets
  // us disable the Save button when there's nothing to save — small thing
  // but quietly removes a "did it actually save?" foot-gun.
  const isDirty = useMemo(() => {
    const trimOrNull = (v: string) => (v.trim() === '' ? null : v.trim());
    const same = (a: string | null, b: string | null) => (a ?? null) === (b ?? null);
    const sameInt = (a: number | null, b: string) => (a ?? null) === parseIntOrNull(b);
    const sameArray = (a: string[] | null, b: string[]) =>
      JSON.stringify(a ?? []) === JSON.stringify(b);
    return !(
      same(community.name, name.trim()) &&
      same(community.city, trimOrNull(city)) &&
      same(community.state, state.trim().toUpperCase()) &&
      same(community.zip, trimOrNull(zip)) &&
      same(community.county, trimOrNull(county)) &&
      same(community.tagline, trimOrNull(tagline)) &&
      same(community.description, trimOrNull(description)) &&
      same(community.builder, trimOrNull(builder)) &&
      sameInt(community.year_built, yearBuilt) &&
      sameInt(community.year_built_end, yearEndShown ? yearBuiltEnd : '') &&
      sameInt(community.price_min, priceMin) &&
      sameInt(community.price_max, priceMaxShown ? priceMax : '') &&
      sameInt(community.hoa_fee_monthly, hoaFee) &&
      same(community.website, trimOrNull(website)) &&
      sameArray(community.property_types, propertyTypes) &&
      sameArray(community.highlights, highlights)
    );
  }, [
    community,
    name,
    city,
    state,
    zip,
    county,
    tagline,
    description,
    builder,
    yearBuilt,
    yearBuiltEnd,
    yearEndShown,
    priceMin,
    priceMax,
    priceMaxShown,
    hoaFee,
    website,
    propertyTypes,
    highlights,
  ]);

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

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEditMetadata) return;
    setSaveState('saving');
    setFieldErrors({});
    setFormError(null);
    const trimOrNull = (v: string) => (v.trim() === '' ? null : v.trim());
    startTransition(async () => {
      const result = await updateCommunity(community.id, {
        name: name.trim(),
        city: trimOrNull(city),
        state: state.trim().toUpperCase(),
        description: trimOrNull(description),
        zip: trimOrNull(zip),
        county: trimOrNull(county),
        hoa_fee_monthly: parseIntOrNull(hoaFee),
        year_built: parseIntOrNull(yearBuilt),
        year_built_end: yearEndShown ? parseIntOrNull(yearBuiltEnd) : null,
        price_min: parseIntOrNull(priceMin),
        price_max: priceMaxShown ? parseIntOrNull(priceMax) : null,
        property_types: propertyTypes.length > 0 ? propertyTypes : null,
        highlights: highlights.length > 0 ? highlights : null,
        builder: trimOrNull(builder),
        website: trimOrNull(website),
        tagline: trimOrNull(tagline),
      });
      if (result.ok) {
        setSaveState('saved');
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
        router.refresh();
      } else {
        setSaveState('error');
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        if (!result.fieldErrors || Object.keys(result.fieldErrors).length === 0) {
          setFormError(result.error);
        }
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      {/* — Identity ——————————————————————————————————————— */}
      <FieldGroup title="Identity">
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
        <Field label="Tagline" error={fieldErrors.tagline}>
          <input
            type="text"
            value={tagline}
            onChange={(e) => {
              setTagline(e.target.value);
              clearFieldError('tagline');
            }}
            maxLength={120}
            placeholder="e.g. Walkable new-build townhomes minutes from MARTA"
            disabled={!canEditMetadata}
            aria-invalid={!!fieldErrors.tagline}
            className={inputCls(!!fieldErrors.tagline)}
          />
        </Field>
      </FieldGroup>

      {/* — Location ——————————————————————————————————————— */}
      <FieldGroup title="Location">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_5rem_7rem]">
          <Field label="City" error={fieldErrors.city}>
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
          <Field label="ZIP" error={fieldErrors.zip}>
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
      </FieldGroup>

      {/* — Pitch ——————————————————————————————————————— */}
      <FieldGroup title="Pitch">
        <Field label="Highlights" error={fieldErrors.highlights}>
          <ChipInput
            values={highlights}
            onChange={(next) => {
              setHighlights(next);
              clearFieldError('highlights');
            }}
            placeholder="e.g. Top-rated schools  (press Enter)"
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
            placeholder="Tell buyers what makes this community feel like home — vibe, who lives here, what you'd notice on a Saturday morning."
            disabled={!canEditMetadata}
            aria-invalid={!!fieldErrors.description}
            className={`${inputCls(!!fieldErrors.description)} resize-y`}
          />
        </Field>
      </FieldGroup>

      {/* — Property ——————————————————————————————————————— */}
      <FieldGroup title="Property">
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
          {/* Year built — dual mode (select + custom input), copied from
              EditListingForm so the two editors feel identical.
              Phase 50.6: end year is opt-in — agents click "+ Add end year"
              when the community delivered in phases (e.g. 2019–2024). */}
          <Field
            label="Year built"
            error={fieldErrors.year_built || fieldErrors.year_built_end}
          >
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1">
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
                        clearFieldError('year_built');
                        clearFieldError('year_built_end');
                      }}
                      disabled={!canEditMetadata}
                      aria-invalid={!!fieldErrors.year_built}
                      aria-label={yearEndShown ? 'Start year' : 'Year built'}
                      className={inputCls(!!fieldErrors.year_built)}
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
                        onChange={(e) => {
                          setYearBuilt(e.target.value);
                          clearFieldError('year_built');
                          clearFieldError('year_built_end');
                        }}
                        placeholder="e.g. 1998"
                        disabled={!canEditMetadata}
                        aria-invalid={!!fieldErrors.year_built}
                        aria-label={yearEndShown ? 'Start year' : 'Year built'}
                        className={inputCls(!!fieldErrors.year_built)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setYearBuiltMode('list');
                          setYearBuilt('');
                        }}
                        disabled={!canEditMetadata}
                        className="shrink-0 rounded border border-line px-2 text-xs text-ink2 hover:bg-ink2/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Use list
                      </button>
                    </div>
                  )}
                </div>
                {yearEndShown && (
                  <>
                    <span className="pt-2 text-ink2 text-sm">–</span>
                    <div className="flex-1">
                      <input
                        type="number"
                        min="1800"
                        max="2100"
                        value={yearBuiltEnd}
                        onChange={(e) => {
                          setYearBuiltEnd(e.target.value);
                          clearFieldError('year_built_end');
                        }}
                        placeholder="e.g. 2024"
                        disabled={!canEditMetadata}
                        aria-invalid={!!fieldErrors.year_built_end}
                        aria-label="End year"
                        className={inputCls(!!fieldErrors.year_built_end)}
                      />
                    </div>
                  </>
                )}
              </div>
              {canEditMetadata && (
                <button
                  type="button"
                  onClick={() => {
                    if (yearEndShown) {
                      setYearEndShown(false);
                      setYearBuiltEnd('');
                      clearFieldError('year_built_end');
                    } else {
                      setYearEndShown(true);
                    }
                  }}
                  className="text-ink2 text-xs underline-offset-2 hover:underline"
                >
                  {yearEndShown ? '− Remove end year' : '+ Add end year (phased delivery)'}
                </button>
              )}
            </div>
          </Field>
        </div>

        {/* Price — single From input by default; "+ Add max price" reveals
            the To input. Phase 50.6: less friction for the common case
            ("starting at $X") while still supporting min–max ranges. */}
        <Field
          label="Price"
          error={fieldErrors.price_min || fieldErrors.price_max}
        >
          <div className="space-y-2">
            <div
              className={
                priceMaxShown
                  ? 'grid grid-cols-1 gap-3 sm:grid-cols-2'
                  : 'grid grid-cols-1 gap-3 sm:max-w-[16rem]'
              }
            >
              <DollarInput
                value={priceMin}
                onChange={(v) => {
                  setPriceMin(v);
                  clearFieldError('price_min');
                  clearFieldError('price_max');
                }}
                placeholder="450,000"
                suffix={priceMaxShown ? 'from' : 'starting at'}
                disabled={!canEditMetadata}
                hasError={!!fieldErrors.price_min}
              />
              {priceMaxShown && (
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
              )}
            </div>
            {canEditMetadata && (
              <button
                type="button"
                onClick={() => {
                  if (priceMaxShown) {
                    setPriceMaxShown(false);
                    setPriceMax('');
                    clearFieldError('price_max');
                  } else {
                    setPriceMaxShown(true);
                  }
                }}
                className="text-ink2 text-xs underline-offset-2 hover:underline"
              >
                {priceMaxShown ? '− Remove max price' : '+ Add max price (range)'}
              </button>
            )}
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
      </FieldGroup>

      {/* — Contact ——————————————————————————————————————— */}
      <FieldGroup title="Contact">
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
      </FieldGroup>

      {canEditMetadata && (
        <div className="flex items-center gap-3 border-line border-t pt-4">
          <button
            type="submit"
            disabled={isPending || saveState === 'saving' || !isDirty}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-cream transition hover:opacity-90 disabled:opacity-50"
          >
            {saveState === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
          {saveState === 'saved' && <span className="text-sm text-emerald-400">✓ Saved</span>}
          {saveState !== 'saved' && !isDirty && (
            <span className="text-muted text-xs">No unsaved changes</span>
          )}
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
        'Permanently delete this community? Schools, POIs, photos, videos and saved entries for it will be removed. Listings will be detached but not deleted. This cannot be undone.',
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

  return (
    <div className="rounded border border-red-500/40 bg-red-500/5 p-5">
      <h3 className="font-medium text-red-300 text-sm">Danger zone</h3>
      <p className="mt-1 text-muted text-xs">
        Deleting a community is permanent and removes its schools, POIs, photos, videos, and saved
        entries. Listings will be detached but not deleted.
      </p>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="mt-3 rounded border border-red-500/60 px-3 py-1.5 text-red-300 text-xs hover:bg-red-500/10 disabled:opacity-50"
      >
        {isPending ? 'Deleting…' : 'Delete community'}
      </button>
      {err && <p className="mt-2 text-red-300 text-xs">{err}</p>}
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// Local UI helpers

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="font-medium text-ink2 text-xs uppercase tracking-wide">{title}</legend>
      {children}
    </fieldset>
  );
}

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

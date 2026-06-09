'use client';

/**
 * EditListingForm — Phase 4.3a metadata editor.
 *
 * Renders the mutable fields of a draft listing. Address fields are shown as
 * read-only (see actions.ts header for why). Numeric fields use string state
 * so an empty input maps cleanly to null.
 */

import { type UpdateListingInput, updateListing } from '@/app/dashboard/listings/[id]/edit/actions';
import { useState, useTransition } from 'react';

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

/**
 * Read-only listing context the LLM needs to write good copy. Pulled from the
 * listings row at page render and passed through; the form doesn't edit any
 * of these fields (address fields are immutable by design — see actions.ts
 * header).
 */
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

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type GenState = 'idle' | 'loading' | 'error';

export function EditListingForm({ listingId, initial, communities, listingContext }: Props) {
  const [price, setPrice] = useState(initial.price?.toString() ?? '');
  const [beds, setBeds] = useState(initial.beds?.toString() ?? '');
  const [baths, setBaths] = useState(initial.baths?.toString() ?? '');
  const [sqft, setSqft] = useState(initial.sqft?.toString() ?? '');
  const [yearBuilt, setYearBuilt] = useState(initial.year_built?.toString() ?? '');
  const [lotSize, setLotSize] = useState(initial.lot_size ?? '');
  const [hoa, setHoa] = useState(initial.hoa ?? '');
  const [style, setStyle] = useState(initial.style ?? '');
  const [description, setDescription] = useState(initial.description.join('\n\n'));
  const [communityId, setCommunityId] = useState<string>(initial.community_id ?? '');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
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

  // Phase 6.2 — fire /api/generate-copy with the current form state.
  // Replaces the description textarea with the returned 3 paragraphs joined
  // by blank lines, matching the editor's split-on-blank-line convention
  // (see actions.ts `descriptionToParagraphs`). Existing description is
  // overwritten — the button label warns about this.
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

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveState('saving');
    setErrorMsg(null);

    const payload: UpdateListingInput = {
      price: parseIntOrNull(price),
      beds: parseFloatOrNull(beds),
      baths: parseFloatOrNull(baths),
      sqft: parseIntOrNull(sqft),
      year_built: parseIntOrNull(yearBuilt),
      lot_size: lotSize.trim() === '' ? null : lotSize.trim(),
      hoa: hoa.trim() === '' ? null : hoa.trim(),
      style: style.trim() === '' ? null : style.trim(),
      description,
      community_id: communityId === '' ? null : communityId,
    };

    startTransition(async () => {
      const result = await updateListing(listingId, payload);
      if (result.ok) {
        setSaveState('saved');
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
      } else {
        setSaveState('error');
        setErrorMsg(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Price (USD)">
          <input
            type="number"
            min="0"
            step="1000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="950000"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Square feet">
          <input
            type="number"
            min="0"
            step="10"
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
            placeholder="3200"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Beds">
          <input
            type="number"
            min="0"
            step="0.5"
            value={beds}
            onChange={(e) => setBeds(e.target.value)}
            placeholder="4"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Baths">
          <input
            type="number"
            min="0"
            step="0.5"
            value={baths}
            onChange={(e) => setBaths(e.target.value)}
            placeholder="3.5"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Year built">
          <input
            type="number"
            min="1800"
            max="2100"
            value={yearBuilt}
            onChange={(e) => setYearBuilt(e.target.value)}
            placeholder="2008"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Lot size">
          <input
            type="text"
            value={lotSize}
            onChange={(e) => setLotSize(e.target.value)}
            placeholder="0.35 acres"
            maxLength={40}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="HOA">
          <input
            type="text"
            value={hoa}
            onChange={(e) => setHoa(e.target.value)}
            placeholder="$120/mo"
            maxLength={80}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Style">
          <input
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="Craftsman"
            maxLength={80}
            className={INPUT_CLASS}
          />
        </Field>
      </fieldset>

      <Field
        label="Community"
        hint="Optional. Links this listing to a shared community for school + POI data. Manage communities at /dashboard/communities."
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
        hint="One paragraph per blank line. Up to 10 paragraphs, English only."
      >
        <div className="mb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={genState === 'loading'}
            className="rounded border border-bronze/50 px-3 py-1 text-xs text-cream hover:bg-bronze/20 disabled:opacity-50"
          >
            {genState === 'loading' ? 'Generating…' : '✨ Generate description'}
          </button>
          {genState === 'error' && (
            <span className="text-xs text-red-400">Error: {genError ?? 'unknown'}</span>
          )}
          <span className="text-xs text-cream/40">Overwrites current text.</span>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          placeholder="Tell buyers what makes this home special. Press Enter twice for a new paragraph."
          className={`${INPUT_CLASS} min-h-[10rem] resize-y`}
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending || saveState === 'saving'}
          className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {saveState === 'saving' ? 'Saving…' : 'Save changes'}
        </button>
        {saveState === 'saved' && <span className="text-sm text-emerald-400">✓ Saved</span>}
        {saveState === 'error' && (
          <span className="text-sm text-red-400">Error: {errorMsg ?? 'unknown'}</span>
        )}
      </div>
    </form>
  );
}

const INPUT_CLASS =
  'w-full rounded border border-bronze/30 bg-ink2 px-3 py-2 text-sm text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-cream/70">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-cream/40">{hint}</span> : null}
    </div>
  );
}

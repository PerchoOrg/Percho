'use client';

/**
 * CommunityEditor — Phase 4.4 client component.
 *
 * Three independent sections sharing the same client component because they
 * share state (the user expects "save" / "add" buttons to feel like one
 * coherent page) and we want optimistic-ish UX without N round-trips:
 *  - metadata form (name/city/state/description)
 *  - schools list + add form
 *  - pois list + add form
 *
 * Each `add` action invokes a server action that re-renders this page via
 * `revalidatePath`, so we use `router.refresh()` after success to pick up
 * the new row without a full reload.
 */

import {
  addPoi,
  addSchool,
  deletePoi,
  deleteSchool,
  updateCommunity,
} from '@/app/dashboard/communities/actions';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { PoiRow, SchoolRow } from './page';

const INPUT_CLASS =
  'w-full rounded border border-bronze/30 bg-ink2 px-3 py-2 text-sm text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold';

const FAIRHOUSING_HINT =
  'Data source URL is required for fair-housing compliance. Cite the school district / GreatSchools / Google Maps URL you got this info from.';

interface CommunityRow {
  id: string;
  name: string;
  city: string | null;
  state: string;
  description: string | null;
}

export function CommunityEditor({
  community,
  schools,
  pois,
  canEditMetadata,
}: {
  community: CommunityRow;
  schools: SchoolRow[];
  pois: PoiRow[];
  canEditMetadata: boolean;
}) {
  return (
    <div className="space-y-6">
      <MetadataSection community={community} canEdit={canEditMetadata} />
      <SchoolsSection communityId={community.id} schools={schools} />
      <PoisSection communityId={community.id} pois={pois} />
    </div>
  );
}

// ─── metadata ────────────────────────────────────────────────────

function MetadataSection({
  community,
  canEdit,
}: {
  community: CommunityRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(community.name);
  const [city, setCity] = useState(community.city ?? '');
  const [state, setState] = useState(community.state);
  const [description, setDescription] = useState(community.description ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    setSaveState('saving');
    setError(null);
    startTransition(async () => {
      const result = await updateCommunity(community.id, {
        name: name.trim(),
        city: city.trim() === '' ? null : city.trim(),
        state: state.trim().toUpperCase(),
        description: description.trim() === '' ? null : description.trim(),
      });
      if (result.ok) {
        setSaveState('saved');
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
        router.refresh();
      } else {
        setSaveState('error');
        setError(result.error);
      }
    });
  }

  return (
    <section className="rounded border border-bronze/30 bg-ink2 p-6">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Community details</h2>
        {!canEdit && (
          <span className="rounded-full border border-bronze/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cream/60">
            View only
          </span>
        )}
      </div>
      {!canEdit && (
        <p className="mb-4 rounded border border-bronze/20 bg-ink px-3 py-2 text-xs text-cream/60">
          Only the agent who created this community can edit metadata. You can still add schools,
          POIs, and videos below.
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            disabled={!canEdit}
            className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_5rem]">
          <Field label="City">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={80}
              disabled={!canEdit}
              className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
            />
          </Field>
          <Field label="State" required>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              required
              maxLength={2}
              disabled={!canEdit}
              className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
            />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
            disabled={!canEdit}
            className={`${INPUT_CLASS} resize-y disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </Field>
        {canEdit && (
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
              <span className="text-sm text-red-400">Error: {error ?? 'unknown'}</span>
            )}
          </div>
        )}
      </form>
    </section>
  );
}

// ─── schools ─────────────────────────────────────────────────────

function SchoolsSection({
  communityId,
  schools,
}: {
  communityId: string;
  schools: SchoolRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [grades, setGrades] = useState('');
  const [rating, setRating] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function clear() {
    setName('');
    setGrades('');
    setRating('');
    setSourceUrl('');
  }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const ratingNum = rating.trim() === '' ? null : Number.parseFloat(rating);
    startTransition(async () => {
      const result = await addSchool({
        community_id: communityId,
        name: name.trim(),
        grades: grades.trim() === '' ? null : grades.trim(),
        rating: ratingNum !== null && Number.isFinite(ratingNum) ? ratingNum : null,
        source_url: sourceUrl.trim(),
      });
      if (result.ok) {
        clear();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function onDelete(schoolId: string) {
    if (!confirm('Delete this school?')) return;
    startTransition(async () => {
      const result = await deleteSchool(schoolId, communityId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <section className="rounded border border-bronze/30 bg-ink2 p-6">
      <h2 className="mb-4 text-base font-semibold">Schools ({schools.length})</h2>

      {schools.length > 0 && (
        <ul className="mb-6 divide-y divide-bronze/20 rounded border border-bronze/20">
          {schools.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-cream">{s.name}</div>
                <div className="text-xs text-cream/50">
                  {[s.grades, s.rating != null ? `${s.rating}/10` : null]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                  {' · '}
                  <a
                    href={s.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold hover:underline"
                  >
                    source
                  </a>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDelete(s.id)}
                disabled={isPending}
                className="ml-4 text-xs text-red-400 hover:underline disabled:opacity-50"
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={onAdd}
        className="space-y-3 rounded border border-dashed border-bronze/20 p-4"
      >
        <h3 className="text-xs font-medium uppercase tracking-wide text-cream/50">Add a school</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_5rem]">
          <Field label="Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="North Atlanta High School"
              required
              maxLength={160}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Grades">
            <input
              type="text"
              value={grades}
              onChange={(e) => setGrades(e.target.value)}
              placeholder="9–12"
              maxLength={40}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Rating /10">
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              placeholder="8.5"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="Source URL" required hint={FAIRHOUSING_HINT}>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.greatschools.org/..."
            required
            maxLength={500}
            className={INPUT_CLASS}
          />
        </Field>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending || name.trim() === '' || sourceUrl.trim() === ''}
            className="rounded bg-gold px-3 py-1.5 text-xs font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Adding…' : 'Add school'}
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </form>
    </section>
  );
}

// ─── pois ────────────────────────────────────────────────────────

const POI_TYPES = ['restaurant', 'park', 'grocery', 'gym', 'shopping', 'transit', 'other'];

function PoisSection({ communityId, pois }: { communityId: string; pois: PoiRow[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [poiType, setPoiType] = useState<string>('restaurant');
  const [distanceText, setDistanceText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function clear() {
    setName('');
    setPoiType('restaurant');
    setDistanceText('');
    setSourceUrl('');
  }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addPoi({
        community_id: communityId,
        name: name.trim(),
        poi_type: poiType,
        distance_text: distanceText.trim() === '' ? null : distanceText.trim(),
        source_url: sourceUrl.trim(),
      });
      if (result.ok) {
        clear();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function onDelete(poiId: string) {
    if (!confirm('Delete this POI?')) return;
    startTransition(async () => {
      const result = await deletePoi(poiId, communityId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <section className="rounded border border-bronze/30 bg-ink2 p-6">
      <h2 className="mb-4 text-base font-semibold">Points of interest ({pois.length})</h2>

      {pois.length > 0 && (
        <ul className="mb-6 divide-y divide-bronze/20 rounded border border-bronze/20">
          {pois.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-cream">
                  {p.name} <span className="text-xs font-normal text-cream/50">[{p.poi_type}]</span>
                </div>
                <div className="text-xs text-cream/50">
                  {p.distance_text ?? '—'}
                  {' · '}
                  <a
                    href={p.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold hover:underline"
                  >
                    source
                  </a>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDelete(p.id)}
                disabled={isPending}
                className="ml-4 text-xs text-red-400 hover:underline disabled:opacity-50"
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={onAdd}
        className="space-y-3 rounded border border-dashed border-bronze/20 p-4"
      >
        <h3 className="text-xs font-medium uppercase tracking-wide text-cream/50">Add a POI</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Whole Foods Buckhead"
              required
              maxLength={160}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Type" required>
            <select
              value={poiType}
              onChange={(e) => setPoiType(e.target.value)}
              required
              className={INPUT_CLASS}
            >
              {POI_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Distance">
            <input
              type="text"
              value={distanceText}
              onChange={(e) => setDistanceText(e.target.value)}
              placeholder="0.8 mi"
              maxLength={40}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="Source URL" required hint={FAIRHOUSING_HINT}>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://maps.google.com/..."
            required
            maxLength={500}
            className={INPUT_CLASS}
          />
        </Field>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending || name.trim() === '' || sourceUrl.trim() === ''}
            className="rounded bg-gold px-3 py-1.5 text-xs font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Adding…' : 'Add POI'}
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </form>
    </section>
  );
}

// ─── shared field ────────────────────────────────────────────────

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-cream/70">
        {label}
        {required ? <span className="text-gold"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-cream/40">{hint}</span> : null}
    </div>
  );
}

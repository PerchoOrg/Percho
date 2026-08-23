'use client';

/**
 * Storage cleanup: what the pipeline has left on Cloudflare Stream that
 * nothing can reach, and the home-tour runs that stopped mid-pipeline.
 *
 * Loaded on demand, not with the rest of the hub — the Stream listing is a
 * round trip to Cloudflare for every video in the account, which has no place
 * in a panel that polls every few seconds.
 *
 * Owner 2026-08-23: "i do care the previous runs, and failed one, because they
 * are consuming my resources, can we have some way to clean up them?" — and
 * asked to see the list before anything is deleted, so the button only appears
 * once the list is on screen and says exactly what it will remove.
 */

import { useCallback, useState } from 'react';

type Bucket = { count: number; minutes: number; usdPerMonth: number };
type Asset = { uid: string; created: string; duration: number | null; klass: string };
type Report = { buckets: Record<string, Bucket>; deletable: Asset[] };
type StalledRun = { id: string; listingId: string; status: string; updatedAt: string | null };

const BUCKET_LABEL: Record<string, string> = {
  live: 'In use — a video row plays it',
  superseded: 'Superseded — only an old cut points at it',
  unreferenced: 'Unreferenced — nothing in the database points at it',
};

export function CleanupPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [runs, setRuns] = useState<StalledRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const [s, r] = await Promise.all([
        fetch('/api/admin/cleanup/stream', { cache: 'no-store' }),
        fetch('/api/admin/cleanup/runs', { cache: 'no-store' }),
      ]);
      const sBody = (await s.json()) as Report & { error?: string };
      const rBody = (await r.json()) as { runs?: StalledRun[]; error?: string };
      if (!s.ok) throw new Error(sBody.error ?? `stream HTTP ${s.status}`);
      if (!r.ok) throw new Error(rBody.error ?? `runs HTTP ${r.status}`);
      setReport(sBody);
      setRuns(rBody.runs ?? []);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'cleanup read failed');
    } finally {
      setLoading(false);
    }
  }, []);

  async function deleteAssets() {
    if (!report) return;
    const uids = report.deletable.map((a) => a.uid);
    // The route caps a request at 250; more than that is a second click.
    const batch = uids.slice(0, 250);
    if (!confirm(`Delete ${batch.length} Cloudflare Stream videos? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/cleanup/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uids: batch }),
      });
      const body = (await res.json()) as {
        deleted?: number;
        skipped?: Array<{ uid: string; why: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const skipped = body.skipped ?? [];
      setNotice(
        `Deleted ${body.deleted ?? 0}.${skipped.length ? ` Skipped ${skipped.length}: ${skipped[0]?.why}` : ''}`,
      );
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function abandonRuns() {
    if (!runs || runs.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/cleanup/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: runs.map((r) => r.id) }),
      });
      const body = (await res.json()) as { abandoned?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setNotice(`Marked ${body.abandoned ?? 0} run(s) abandoned.`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'abandon failed');
    } finally {
      setBusy(false);
    }
  }

  const deletable = report?.deletable ?? [];
  const deletableMinutes = deletable.reduce((n, a) => n + (a.duration ?? 0) / 60, 0);

  return (
    <section className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium text-sm">Storage cleanup</h2>
        <span className="text-ink2 text-xs">
          Cloudflare Stream assets no cut plays, and runs that stopped mid-pipeline
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="ml-auto rounded-lg border border-line px-2 py-1 text-xs hover:bg-bg/40 disabled:opacity-50"
        >
          {loading ? 'reading…' : report ? 'Refresh' : 'Show what can be cleaned'}
        </button>
      </div>

      {notice && <p className="mt-2 text-ink2 text-xs">{notice}</p>}

      {report && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {(['live', 'superseded', 'unreferenced'] as const).map((k) => {
              const b = report.buckets[k];
              return (
                <div key={k} className="rounded-xl border border-line px-3 py-2">
                  <div className="text-ink2 text-[11px]">{BUCKET_LABEL[k]}</div>
                  <div className="text-sm">
                    {b?.count ?? 0} videos
                    <span className="text-ink2">
                      {' · '}
                      {(b?.minutes ?? 0).toFixed(1)} min · ${(b?.usdPerMonth ?? 0).toFixed(2)}/mo
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>
              <strong>{deletable.length}</strong> deletable ({deletableMinutes.toFixed(1)} min, $
              {(deletableMinutes * 0.005).toFixed(2)}/mo)
            </span>
            {deletable.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="text-blue-500 hover:underline"
                >
                  {expanded ? 'hide list' : 'show list'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAssets()}
                  disabled={busy}
                  className="rounded-lg border border-red-500/40 px-2 py-1 text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                >
                  {busy ? 'working…' : `Delete ${Math.min(deletable.length, 250)}`}
                </button>
              </>
            )}
            {/* Anything younger than a day is held back whatever it looks like:
                a cut still encoding has no video row yet. */}
            <span className="text-ink2">Assets under 24h old are never offered.</span>
          </div>

          {expanded && (
            <div className="max-h-64 overflow-auto rounded-xl border border-line">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-bg/40 text-ink2">
                  <tr>
                    <th className="px-2 py-1 font-medium">uid</th>
                    <th className="px-2 py-1 font-medium">created</th>
                    <th className="px-2 py-1 text-right font-medium">sec</th>
                    <th className="px-2 py-1 font-medium">why</th>
                  </tr>
                </thead>
                <tbody>
                  {deletable.map((a) => (
                    <tr key={a.uid} className="border-line border-t">
                      <td className="px-2 py-1 font-mono">{a.uid}</td>
                      <td className="px-2 py-1 text-ink2">
                        {a.created.slice(0, 16).replace('T', ' ')}
                      </td>
                      <td className="px-2 py-1 text-right">{Math.round(a.duration ?? 0)}</td>
                      <td className="px-2 py-1 text-ink2">{a.klass}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-line border-t pt-2 text-xs">
            <span>
              <strong>{runs?.length ?? 0}</strong> home-tour run(s) stalled over 6h
              {runs && runs.length > 0 && (
                <span className="text-ink2">
                  {' — '}
                  {runs
                    .map((r) => `${r.status} ${r.updatedAt?.slice(0, 16).replace('T', ' ')}`)
                    .join(', ')}
                </span>
              )}
            </span>
            {runs && runs.length > 0 && (
              <button
                type="button"
                onClick={() => void abandonRuns()}
                disabled={busy}
                className="rounded-lg border border-line px-2 py-1 hover:bg-bg/40 disabled:opacity-50"
              >
                Mark abandoned
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

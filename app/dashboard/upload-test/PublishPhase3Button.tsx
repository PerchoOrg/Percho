'use client';

import { useState, useTransition } from 'react';
import { publishPhase3Demo } from './actions';

/**
 * PublishPhase3Button — flips the reserved `__upload_test__` listing to
 * `published` so the Phase 3.1 public route has live data to render.
 * Idempotent: clicking again on an already-published listing just refreshes
 * the placeholder fields and re-revalidates the public path.
 *
 * Phase 4 deletes this control along with the rest of the upload-test page.
 */
export function PublishPhase3Button() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const onClick = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await publishPhase3Demo();
      if (res.ok) {
        setMsg({
          kind: 'ok',
          text: `Published → ${res.publicUrl}`,
        });
      } else {
        setMsg({ kind: 'err', text: res.error });
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-300/20 disabled:opacity-50"
      >
        {pending ? 'Publishing…' : 'Publish for Phase 3 demo'}
      </button>
      {msg && (
        <p className="text-xs" style={{ color: msg.kind === 'ok' ? '#86efac' : '#f87171' }}>
          {msg.kind === 'ok' && msg.text.startsWith('Published') ? (
            <>
              Published →{' '}
              <a
                href={msg.text.replace('Published → ', '')}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {msg.text.replace('Published → ', '')}
              </a>
            </>
          ) : (
            msg.text
          )}
        </p>
      )}
    </div>
  );
}

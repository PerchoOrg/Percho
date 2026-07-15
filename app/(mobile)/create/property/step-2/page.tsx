/**
 * Mobile Create Property wizard — step 2 stub (details / auto-filled specs).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.9
 *
 * C6.4 scope: **stub screen only**, per plan directive
 * ("skeleton, 'coming soon' if not designed"). Real form / MLS-hydrated
 * fields land after the wizard shape is signed off with the owner.
 *
 * Query param `mode=mls|manual` is passed through from step-1's CTA links so
 * the back chevron round-trips. It's not branched on yet — step-2's visible
 * shape will diverge between MLS auto-fill vs manual entry once designed.
 */
import { CreatePropertyWizardHeader } from '@/components/reelestate/CreatePropertyWizardHeader';
import { CreatePropertyStepStub } from '@/components/reelestate/CreatePropertyStepStub';

type Mode = 'mls' | 'manual';

interface PageProps {
  searchParams: Promise<{ mode?: string }>;
}

export default async function CreatePropertyStep2Page({ searchParams }: PageProps) {
  const { mode: raw } = await searchParams;
  const mode: Mode | null = raw === 'mls' || raw === 'manual' ? raw : null;

  const backHref = mode ? `/create/property?mode=${mode}` : '/create/property';
  const nextHref = mode
    ? `/create/property/step-3?mode=${mode}`
    : '/create/property/step-3';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      <CreatePropertyWizardHeader current={2} backHref={backHref} />
      <CreatePropertyStepStub
        title="Property details"
        subtitle={
          mode === 'manual'
            ? 'Enter address, specs, and price by hand.'
            : 'Confirm the address, specs, and price we pulled from MLS.'
        }
        nextHref={nextHref}
        nextLabel="Next: Photos"
      />
    </div>
  );
}

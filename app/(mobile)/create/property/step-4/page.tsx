/**
 * Mobile Create Property wizard — step 4 stub (description).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.9
 *
 * C6.4 scope: **stub screen only**. Real description editor / AI-generated
 * copy lands after wizard sign-off (LLM copy pipeline is a separate spend
 * decision per CLAUDE.md §7).
 */
import { CreatePropertyWizardHeader } from '@/components/reelestate/CreatePropertyWizardHeader';
import { CreatePropertyStepStub } from '@/components/reelestate/CreatePropertyStepStub';

interface PageProps {
  searchParams: Promise<{ mode?: string }>;
}

export default async function CreatePropertyStep4Page({ searchParams }: PageProps) {
  const { mode: raw } = await searchParams;
  const mode = raw === 'mls' || raw === 'manual' ? raw : null;
  const qs = mode ? `?mode=${mode}` : '';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      <CreatePropertyWizardHeader current={4} backHref={`/create/property/step-3${qs}`} />
      <CreatePropertyStepStub
        title="Description"
        subtitle="Write your listing story or let Percho draft one from the specs and photos."
        nextHref={`/create/property/step-5${qs}`}
        nextLabel="Next: Review"
      />
    </div>
  );
}

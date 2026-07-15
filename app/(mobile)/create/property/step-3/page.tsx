/**
 * Mobile Create Property wizard — step 3 stub (photos).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.9
 *
 * C6.4 scope: **stub screen only**. Real photo upload / reordering lands
 * after wizard sign-off (CLAUDE.md §8 — new upload surface belongs to owner
 * schema/infra call).
 */
import { CreatePropertyWizardHeader } from '@/components/reelestate/CreatePropertyWizardHeader';
import { CreatePropertyStepStub } from '@/components/reelestate/CreatePropertyStepStub';

interface PageProps {
  searchParams: Promise<{ mode?: string }>;
}

export default async function CreatePropertyStep3Page({ searchParams }: PageProps) {
  const { mode: raw } = await searchParams;
  const mode = raw === 'mls' || raw === 'manual' ? raw : null;
  const qs = mode ? `?mode=${mode}` : '';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      <CreatePropertyWizardHeader current={3} backHref={`/create/property/step-2${qs}`} />
      <CreatePropertyStepStub
        title="Photos"
        subtitle="Upload photos or reorder what MLS provided. This drives the reel auto-generator too."
        nextHref={`/create/property/step-4${qs}`}
        nextLabel="Next: Description"
      />
    </div>
  );
}

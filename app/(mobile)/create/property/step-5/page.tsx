/**
 * Mobile Create Property wizard — step 5 stub (review + publish).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.9
 *
 * C6.4 scope: **stub screen only**. Real publish flow (insert into
 * `listings`, kick off reel render, notify subscribers) lands after wizard
 * sign-off — publish is a data-write surface, belongs to owner per
 * CLAUDE.md §8.
 *
 * The terminal "Publish listing" pill routes back to `/listings` so the
 * wizard is round-trippable end-to-end for design review. No actual insert.
 */
import { CreatePropertyWizardHeader } from '@/components/reelestate/CreatePropertyWizardHeader';
import { CreatePropertyStepStub } from '@/components/reelestate/CreatePropertyStepStub';

interface PageProps {
  searchParams: Promise<{ mode?: string }>;
}

export default async function CreatePropertyStep5Page({ searchParams }: PageProps) {
  const { mode: raw } = await searchParams;
  const mode = raw === 'mls' || raw === 'manual' ? raw : null;
  const qs = mode ? `?mode=${mode}` : '';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      <CreatePropertyWizardHeader current={5} backHref={`/create/property/step-4${qs}`} />
      <CreatePropertyStepStub
        title="Review & publish"
        subtitle="Preview the listing card and reel before it goes live."
        nextHref="/listings"
        nextLabel="Publish listing"
      />
    </div>
  );
}

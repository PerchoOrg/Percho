'use client';

/**
 * Save on the community page hero (phase311) — the iOS community page has
 * one, and until now the web page did not, so a filmed community without
 * uploaded clips could not be saved from the web at all.
 *
 * Saving needs an account: signed out, the tap goes to /login and back.
 */
import {
  listSavedCommunityIds,
  saveCommunity,
  unsaveCommunity,
} from '@/app/_actions/saved-communities';
import { HeroControl } from '@/app/dashboard/_components/HeroControl';
import { currentPath, loginHref } from '@/lib/auth/login-href';
import { Bookmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function SaveCommunityButton({ communityId }: { communityId: string }) {
  const router = useRouter();
  /** null until the saved-state read answers; then whether anyone is signed in. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    listSavedCommunityIds()
      .then((ids) => {
        setSignedIn(ids !== null);
        setSaved(ids?.includes(communityId) ?? false);
      })
      .catch(() => setSignedIn(null));
  }, [communityId]);

  const toggle = async () => {
    if (signedIn === false) {
      router.push(loginHref(currentPath()));
      return;
    }
    const was = saved;
    setSaved(!was); // optimistic
    const result = await (was ? unsaveCommunity({ communityId }) : saveCommunity({ communityId }));
    if (!result.ok) {
      setSaved(was);
      if (result.error === 'not_signed_in') router.push(loginHref(currentPath()));
    }
  };

  return (
    <HeroControl onClick={toggle} ariaLabel={saved ? 'Saved' : 'Save'}>
      <Bookmark size={14} aria-hidden="true" fill={saved ? 'currentColor' : 'none'} />
      {saved ? 'Saved' : 'Save'}
    </HeroControl>
  );
}

/**
 * Human label for an intent bucket. Shared by every surface that names a
 * bucket in copy — previously duplicated verbatim in listing-video-actions.ts
 * and community-video-actions.ts, which meant a new bucket had to be added in
 * two places or one side silently fell through.
 */
import type { IntentBucket } from './types';

const LABELS: Record<IntentBucket, string> = {
  amenities: 'Community Amenities',
  schools: 'Schools',
  dining: 'Dining',
  nightlife: 'Nightlife',
  shopping: 'Shopping',
  outdoor: 'Outdoor',
  fitness: 'Fitness',
  kids: 'Kids & Family',
  asian_community: 'Asian Community',
  daily_errands: 'Daily Errands',
  faith: 'Faith',
  work_hubs: 'Work Hubs',
  healthcare: 'Healthcare',
  pets: 'Pets',
  transit: 'Transit',
};

export function bucketLabel(bucket: IntentBucket): string {
  return LABELS[bucket];
}

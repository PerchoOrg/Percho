-- phase343: a city's photo verdicts live on the city, not on the photo.
--
-- Owner 2026-11-15: "每个community或者city都是单独approval process 不要搞全局
-- 但是可以参考别的approval". `poi_photos.status` is shared by every place that
-- links the photo, so a city's review page showed whatever the last community
-- film had stamped — Suwanee's admin table read 23 of its film's 24 photos as
-- `pending`. `city_poi_photos` (phase318) already carries a per-city status;
-- it gains the two things a verdict needs to be read back: who gave it and why.
--
-- `poi_photos.status = 'rejected'` stays as the platform-wide switch for LEGAL
-- reasons only (owner: "因为全局原因比如legal拒绝的是可以全局 因为其他筛选原因的
-- 不是全局"). Communities are untouched by this migration.

alter table public.city_poi_photos
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references public.agents(id) on delete set null;

-- Seed every city with the verdicts its current film was cut under, so the
-- switch changes nothing about what the film may use. Until now the city plan
-- excluded every globally rejected photo; those rejections become the city's
-- own, reason included. Only an undecided city row is overwritten.
insert into public.city_poi_photos
  (city_id, poi_photo_id, status, rejection_reason, reviewed_by, reviewed_at)
select distinct on (cp.city_id, pp.id)
  cp.city_id, pp.id, 'rejected', pp.rejection_reason, pp.reviewed_by, pp.reviewed_at
from public.city_pois cp
join public.poi_photos pp on pp.poi_id = cp.poi_id
where pp.status = 'rejected'
on conflict (city_id, poi_photo_id) do update
  set status = 'rejected',
      rejection_reason = excluded.rejection_reason,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at
  where public.city_poi_photos.status = 'pending';

-- Approved = in the city's current film: the photos of its newest ready cut.
insert into public.city_poi_photos (city_id, poi_photo_id, status)
select distinct a.city_id, (clip ->> 'photo_id')::uuid, 'approved'
from (
  select distinct on (city_id) city_id, ordered_clips
  from public.city_tour_assemblies
  where status = 'ready'
  order by city_id, created_at desc
) a
cross join lateral jsonb_array_elements(a.ordered_clips) clip
join public.poi_photos pp on pp.id = (clip ->> 'photo_id')::uuid
where clip ->> 'photo_id' is not null
on conflict (city_id, poi_photo_id) do update
  set status = 'approved', rejection_reason = null;

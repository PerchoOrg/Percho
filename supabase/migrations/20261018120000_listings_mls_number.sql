-- The FMLS listing number, stored where every listing read can see it
-- (phase307).
--
-- FMLS IDX rule 13.7.b: "The FMLS listing number must be clearly and
-- prominently displayed directly with each FMLS Listing." FMLS Data Services
-- made it a condition of approving the licence (2026-10-12, 2026-10-15).
--
-- Bridge rows (`source = 'fmls_bridge'`) carry `source_id = ListingKey`, a
-- 32-char hash that is the record's key, not the number a buyer or FMLS
-- would recognise. The number is `ListingId` (e.g. 7404568), and until now
-- it lived only inside five of the six slugs. `mls_listings.listing_key`,
-- which the mobile detail DTO used to show as "FMLS <n>", is the same hash.
--
-- Null for every listing that did not come from FMLS. RLS: `listings`
-- already has its policies; a new column changes nothing there.

alter table public.listings
  add column if not exists mls_number text;

-- The six Bridge sandbox rows imported in phase304. Explicit ids rather than
-- a slug regex: Fairmount was imported before the slug carried the number,
-- and the Bridge token can no longer read the `fmls` dataset to re-import.
-- On any database without these rows this updates nothing.
update public.listings as l
   set mls_number = v.mls_number
  from (values
    ('90871e1e-f3c0-4aec-9e72-b5b3d0948ebb'::uuid, '5893300'),
    ('e16d4ea8-9ade-4c0e-b389-d23146afae79'::uuid, '7404568'),
    ('91b8a86f-9817-4d71-b406-e0c980e46c74'::uuid, '6826677'),
    ('1349c9a3-ce60-485c-8a75-d38987d4688b'::uuid, '7049147'),
    ('abf8cfc0-b954-4e5c-a72c-fafb9dbbc1f1'::uuid, '5303661'),
    ('ab3ce606-1872-4a89-8637-bb372a37c398'::uuid, '6755168')
  ) as v(id, mls_number)
 where l.id = v.id
   and l.source = 'fmls_bridge'
   and l.mls_number is null;

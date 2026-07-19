-- drop tagline.
--
-- Owner: "Remove tagline it is redundant with highlights and descriptions."
-- It was added in 50.4 as a "buyer-facing one-liner" but in practice it
-- ended up duplicating either the description's first sentence or one of
-- the highlights. Cutting it removes a maintenance ask from agents.

alter table public.communities drop column if exists tagline;

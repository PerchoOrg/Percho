-- ─── 0032_saved_social_drafts_update ──────────────────────────────
-- Allow agents to edit their own saved drafts
-- in place. made drafts immutable to keep the surface simple,
-- but qiaoxux wants in-place edit so a refined post can be saved without
-- the delete + re-save dance (which also loses the original timestamp).
--
-- Why now: edits feed back into regenerate. If a user tweaks a draft,
-- the next "Regenerate" should treat that edited body as the seed. Edit
-- + persist is the natural shape.
--
-- Constraints:
--   * Only body / language are user-editable. platform stays pinned to
--     the original — switching platforms means a different draft.
--   * created_at stays put; we add updated_at to surface "last edited".
--   * RLS update policy mirrors select: agent → own drafts only.

alter table public.saved_social_drafts
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_saved_social_drafts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saved_social_drafts_touch on public.saved_social_drafts;
create trigger saved_social_drafts_touch
  before update on public.saved_social_drafts
  for each row execute function public.touch_saved_social_drafts_updated_at();

create policy "agent updates own social drafts" on public.saved_social_drafts
  for update using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  ) with check (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

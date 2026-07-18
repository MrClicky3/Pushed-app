-- ── Fist bumps ────────────────────────────────────────────────────────────
-- One-tap reactions between friends: "I saw you trained today — respect."
-- A bump is (from_user → to_user, day); one per friend per day. Recipients
-- see bumps for today on their session recap card.
--
-- Paste this whole file into the Supabase SQL editor and run it once.

create table if not exists public.fist_bumps (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid not null references public.profiles(id) on delete cascade,
  day        date not null default current_date,
  created_at timestamptz not null default now(),
  constraint fist_bumps_no_self check (from_user <> to_user),
  constraint fist_bumps_once_per_day unique (from_user, to_user, day)
);

create index if not exists fist_bumps_to_user_day_idx on public.fist_bumps (to_user, day);

alter table public.fist_bumps enable row level security;

-- Sender must be the authed user AND an accepted friend of the recipient.
drop policy if exists "fist_bumps_insert" on public.fist_bumps;
create policy "fist_bumps_insert" on public.fist_bumps
  for insert with check (
    auth.uid() = from_user
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = from_user and f.addressee_id = to_user)
          or (f.requester_id = to_user and f.addressee_id = from_user))
    )
  );

-- Both ends can read their own bumps.
drop policy if exists "fist_bumps_select" on public.fist_bumps;
create policy "fist_bumps_select" on public.fist_bumps
  for select using (auth.uid() in (from_user, to_user));

-- A sender may retract their own bump (same-day undo).
drop policy if exists "fist_bumps_delete" on public.fist_bumps;
create policy "fist_bumps_delete" on public.fist_bumps
  for delete using (auth.uid() = from_user);

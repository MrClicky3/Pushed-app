create table if not exists public.routines (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  exercise_ids text[] not null default '{}',
  created_at timestamptz default now()
);
alter table public.routines enable row level security;
create policy "Users own their routines" on public.routines for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.schedule (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  routine_id uuid references public.routines(id) on delete set null,
  unique(user_id, day_of_week)
);
alter table public.schedule enable row level security;
create policy "Users own their schedule" on public.schedule for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

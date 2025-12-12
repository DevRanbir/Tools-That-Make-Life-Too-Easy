-- Create events table
create table if not exists public.events (
  id uuid not null default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  all_day boolean default false,
  description text,
  location text,
  color text default 'primary',
  created_at timestamptz default now(),
  primary key (id)
);

-- Enable RLS
alter table public.events enable row level security;

-- Policies
create policy "Users can view their own events" on events
  for select using (auth.uid() = user_id);

create policy "Users can insert their own events" on events
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own events" on events
  for update using (auth.uid() = user_id);

create policy "Users can delete their own events" on events
  for delete using (auth.uid() = user_id);

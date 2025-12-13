-- Create the todos table
create table public.todos (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  pinned boolean not null default false,
  subtasks jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint todos_pkey primary key (id)
);

-- Enable Row Level Security (RLS)
alter table public.todos enable row level security;

-- Create Policies for RLS
create policy "Users can view their own todos" on public.todos
  for select using (auth.uid() = user_id);

create policy "Users can insert their own todos" on public.todos
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own todos" on public.todos
  for update using (auth.uid() = user_id);

create policy "Users can delete their own todos" on public.todos
  for delete using (auth.uid() = user_id);

-- Create a realtime publication if you want realtime updates (Optional but recommended)
-- drop publication if exists supabase_realtime;
-- create publication supabase_realtime for table public.todos;

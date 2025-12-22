-- ==========================================
-- 1. Initial Setup (Products Table)
-- ==========================================

-- Drop the existing table (WARNING: This deletes all data)
-- DROP TABLE IF EXISTS products;

-- Create the new table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    title TEXT NOT NULL,
    description TEXT,
    image TEXT,
    price TEXT DEFAULT 'Free',
    tags TEXT[] DEFAULT '{}',
    views BIGINT DEFAULT 0,
    likes BIGINT DEFAULT 0,
    -- saves BIGINT DEFAULT 0, -- Removed in later updates
    rating NUMERIC DEFAULT 0.0,
    viewed_by uuid[] default array[]::uuid[] -- Added in later updates
);

-- Enable Row Level Security (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create policies (Adjust as needed for your auth setup)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read access' AND tablename = 'products') THEN
        CREATE POLICY "Allow public read access" ON products FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public insert access' AND tablename = 'products') THEN
        CREATE POLICY "Allow public insert access" ON products FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public update access' AND tablename = 'products') THEN
        CREATE POLICY "Allow public update access" ON products FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public delete access' AND tablename = 'products') THEN
        CREATE POLICY "Allow public delete access" ON products FOR DELETE USING (true);
    END IF;
END $$;


-- ==========================================
-- 2. User Details Table
-- ==========================================

-- Create user_details table
create table if not exists public.user_details (
  id uuid references auth.users not null primary key, -- distinct user id
  username text,
  avatar_url text,
  occupation text,
  sort_preference text,
  bookmarks uuid[] default array[]::uuid[], -- API to store array of product UUIDs
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  role text DEFAULT 'freebiee',
  credits integer DEFAULT 0,
  status text default 'active'
);

-- Enable RLS
alter table public.user_details enable row level security;

-- Policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public profiles are viewable by everyone.' AND tablename = 'user_details') THEN
        create policy "Public profiles are viewable by everyone." on public.user_details for select using (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own profile.' AND tablename = 'user_details') THEN
        create policy "Users can insert their own profile." on public.user_details for insert with check (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile.' AND tablename = 'user_details') THEN
        create policy "Users can update own profile." on public.user_details for update using (auth.uid() = id);
    END IF;
END $$;


-- ==========================================
-- 3. Todos Table
-- ==========================================

-- Create the todos table
create table if not exists public.todos (
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
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own todos' AND tablename = 'todos') THEN
        create policy "Users can view their own todos" on public.todos for select using (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own todos' AND tablename = 'todos') THEN
        create policy "Users can insert their own todos" on public.todos for insert with check (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own todos' AND tablename = 'todos') THEN
        create policy "Users can update their own todos" on public.todos for update using (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own todos' AND tablename = 'todos') THEN
        create policy "Users can delete their own todos" on public.todos for delete using (auth.uid() = user_id);
    END IF;
END $$;


-- ==========================================
-- 4. Events Table (Calendar)
-- ==========================================

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
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own events' AND tablename = 'events') THEN
        create policy "Users can view their own events" on events for select using (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own events' AND tablename = 'events') THEN
        create policy "Users can insert their own events" on events for insert with check (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own events' AND tablename = 'events') THEN
        create policy "Users can update their own events" on events for update using (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own events' AND tablename = 'events') THEN
        create policy "Users can delete their own events" on events for delete using (auth.uid() = user_id);
    END IF;
END $$;


-- ==========================================
-- 5. Helper Functions & RPCs
-- ==========================================

-- Function to handle bookmark toggling safely
create or replace function toggle_bookmark(product_id uuid)
returns void as $$
declare
  user_bookmarks uuid[];
  exists_check boolean;
begin
  -- Check if user_details exists
  select exists(select 1 from public.user_details where id = auth.uid()) into exists_check;

  if not exists_check then
    -- Insert new row if it doesn't exist
    insert into public.user_details (id, bookmarks)
    values (auth.uid(), array[product_id]);
  else
    -- Get current bookmarks
    select bookmarks into user_bookmarks from public.user_details where id = auth.uid();
    
    if product_id = any(user_bookmarks) then
      -- Remove if exists
      update public.user_details 
      set bookmarks = array_remove(bookmarks, product_id)
      where id = auth.uid();
    else
      -- Add if not exists
      update public.user_details 
      set bookmarks = array_append(bookmarks, product_id)
      where id = auth.uid();
    end if;
  end if;
end;
$$ language plpgsql security definer;

-- Function to increment view count uniquely (Updated logic)
create or replace function register_view(row_id uuid)
returns void as $$
declare
  already_viewed boolean;
begin
  -- Check if user already viewed
  select (auth.uid() = any(viewed_by)) into already_viewed 
  from public.products 
  where id = row_id;

  if already_viewed is null or already_viewed = false then
    -- Add user to viewed_by array and increment views count
    update public.products
    set 
      viewed_by = array_append(viewed_by, auth.uid()),
      views = coalesce(views, 0) + 1
    where id = row_id;
  end if;
end;
$$ language plpgsql security definer;

-- Independent increment_views (Simpler version, kept for compatibility if needed)
CREATE OR REPLACE FUNCTION increment_views(row_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET views = views + 1
  WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment user credits
create or replace function increment_credits(amount int, user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.user_details
  set credits = coalesce(credits, 0) + amount
  where id = user_id;
end;
$$;

-- Grant execution permissions
grant execute on function increment_credits(int, uuid) to authenticated;
grant execute on function increment_credits(int, uuid) to service_role;

-- ==========================================
-- Function to update credits and append to logs atomically
-- This ensures the trigger fires correctly
-- ==========================================
CREATE OR REPLACE FUNCTION update_credits_with_log(
    user_id uuid,
    new_credits integer,
    credits_spent integer,
    log_type text,
    log_description text
)
RETURNS void
LANGUAGE plpgsql
SECURITY definer
AS $$
DECLARE
    new_log jsonb;
BEGIN
    -- Create the log entry
    new_log := jsonb_build_object(
        'credits_spent', credits_spent,
        'current_total_credits', new_credits,
        'type', log_type,
        'description', log_description,
        'created_at', now()
    );

    -- Update credits and append log in a SINGLE UPDATE statement
    -- This is CRITICAL for the trigger to fire
    UPDATE public.user_details
    SET 
        credits = new_credits,
        logs = COALESCE(logs, '[]'::jsonb) || jsonb_build_array(new_log)
    WHERE id = user_id;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION update_credits_with_log(uuid, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_credits_with_log(uuid, integer, integer, text, text) TO service_role;


-- ==========================================
-- 6. Monthly Credit Reset Logic
-- ==========================================

-- Create a function to handle the credit reset logic
CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS void AS $$
BEGIN
    UPDATE user_details
    SET credits = LEAST(
        credits + CASE 
            WHEN role = 'freebiee' THEN 0 
            WHEN role = 'common' THEN 20 
            WHEN role = 'wealthy' THEN 50 
            WHEN role = 'administrator' THEN 100 
            ELSE 0 
        END, 
        (CASE 
            WHEN role = 'freebiee' THEN 0 
            WHEN role = 'common' THEN 20 
            WHEN role = 'wealthy' THEN 50 
            WHEN role = 'administrator' THEN 100 
            ELSE 0 
        END) + 10
    );
END;
$$ LANGUAGE plpgsql;

-- To schedule this (if you have pg_cron extension enabled):
-- SELECT cron.schedule('0 0 1 * *', 'SELECT reset_monthly_credits()');


-- ==========================================
-- 7. Storage Setup
-- ==========================================

-- Enable the storage extension if not already enabled (usually enabled by default)
-- create extension if not exists "storage";

-- Create specific buckets
insert into storage.buckets (id, name, public) values ('drive', 'drive', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('products', 'products', true) on conflict (id) do nothing;

-- Policies for 'drive' (Private user files)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Individual user Access' AND tablename = 'objects' AND schemaname = 'storage') THEN
        create policy "Individual user Access" on storage.objects for all
        using ( bucket_id = 'drive' and auth.uid()::text = (storage.foldername(name))[1] )
        with check ( bucket_id = 'drive' and auth.uid()::text = (storage.foldername(name))[1] );
    END IF;
END $$;

-- Policies for 'products' (Public images)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Products' AND tablename = 'objects' AND schemaname = 'storage') THEN
        create policy "Public Access Products" on storage.objects for select using ( bucket_id = 'products' );
    END IF;
    -- Restrict insert to authenticated users or keep open for demo
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Insert Products' AND tablename = 'objects' AND schemaname = 'storage') THEN
        create policy "Public Insert Products" on storage.objects for insert with check ( bucket_id = 'products' );
    END IF;
END $$;

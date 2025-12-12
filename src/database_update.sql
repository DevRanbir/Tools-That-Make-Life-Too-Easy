-- 1. Create user_details table
create table public.user_details (
  id uuid references auth.users not null primary key, -- distinct user id
  username text,
  avatar_url text,
  occupation text,
  sort_preference text,
  bookmarks uuid[] default array[]::uuid[], -- API to store array of product UUIDs
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.user_details enable row level security;

-- Policies
create policy "Public profiles are viewable by everyone." on public.user_details
  for select using (true);

create policy "Users can insert their own profile." on public.user_details
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on public.user_details
  for update using (auth.uid() = id);

-- 2. Modify products table
-- Add viewed_by column to store array of user IDs
alter table public.products 
add column viewed_by uuid[] default array[]::uuid[];

-- Remove saves column
alter table public.products 
drop column saves;

-- 3. Helper Functions (RPCs) for atomic updates

-- Function to handle bookmark toggling safely
create or replace function toggle_bookmark(product_id uuid)
returns void as $$
declare
  user_bookmarks uuid[];
begin
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
end;
$$ language plpgsql security definer;

-- Function to increment view count uniquely
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

-- 4. OPTIONAL: Migrate old bookmarks (Run this only if you want to keep old data)
-- This is tricky without a script, but here is a query to insert initial profiles from auth (if you had access to auth schema, which standard SQL editor might not).
-- Instead, we will assume new system starts fresh or users get created on login.

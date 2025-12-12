-- Improved toggle_bookmark function to handle missing user_details row
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

-- Ensure viewed_by column exists (in case previous script wasn't run)
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'viewed_by') then
        alter table public.products add column viewed_by uuid[] default array[]::uuid[];
    end if;
end $$;

-- Add status column to user_details
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'user_details' and column_name = 'status') then
        alter table public.user_details add column status text default 'active';
    end if;
end $$;

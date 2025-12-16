-- Create a Security Definer function to reliably fetch user data including emails
-- This bypasses potential View permission issues by running with the privileges of the creator (postgres)

create or replace function get_admin_users()
returns table (
  id uuid,
  username text,
  occupation text,
  role text,
  status text,
  credits numeric, -- or int/text depending on your schema. admin_users_view defines it.
  avatar_url text,
  created_at timestamptz,
  email varchar
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    au.id,
    ud.username,
    ud.occupation,
    ud.role,
    ud.status,
    ud.credits::numeric, -- Ensure type matching
    ud.avatar_url,
    ud.created_at,
    au.email::varchar
  from public.user_details ud
  join auth.users au on ud.id = au.id
  order by ud.created_at desc;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function get_admin_users to authenticated;
grant execute on function get_admin_users to service_role;

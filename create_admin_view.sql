-- Run this query in your Supabase SQL Editor to create a view that exposes emails
-- This allows the frontend to fetch user emails for the Admin Dashboard

create or replace view public.admin_users_view as
select
  ud.id,
  ud.username,
  ud.occupation,
  ud.role,
  ud.status,
  ud.credits,
  ud.avatar_url,
  ud.created_at,
  au.email
from public.user_details ud
join auth.users au on ud.id = au.id;

-- Grant access permissions (adjust as needed for your security model)
grant select on public.admin_users_view to anon, authenticated, service_role;

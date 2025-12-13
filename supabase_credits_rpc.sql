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


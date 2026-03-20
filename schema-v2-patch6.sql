-- Patch 6: Add missing RLS helper functions
-- These functions are required by the players table RLS policy.
-- Without them, the players query returns a 500 error.

create or replace function public.is_org_member(p_org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer stable;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer stable;

create or replace function public.ensure_business_welcome_outbox(
  p_business_id uuid,
  p_to_email text,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean := false;
  v_inserted_id uuid;
begin
  if p_business_id is null or nullif(trim(p_to_email), '') is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':business_welcome', 0));

  select exists (
    select 1
    from public.notification_email_outbox
    where business_id = p_business_id
      and template_key = 'business_welcome'
  ) into v_exists;

  -- The pg_advisory_xact_lock above serializes this business_welcome check/insert
  -- without creating a unique index that could fail on historical duplicate rows.
  if v_exists then
    return true;
  end if;

  insert into public.notification_email_outbox (
    business_id,
    to_email,
    template_key,
    payload
  ) values (
    p_business_id,
    p_to_email,
    'business_welcome',
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_inserted_id;

  return v_inserted_id is not null;
end;
$$;

comment on function public.ensure_business_welcome_outbox(uuid, text, jsonb) is
  'Atomically ensures one paid signup business_welcome outbox row per business using an advisory transaction lock; avoids unique-index migration failures when historical duplicates exist.';

revoke all on function public.ensure_business_welcome_outbox(uuid, text, jsonb) from public;
revoke all on function public.ensure_business_welcome_outbox(uuid, text, jsonb) from anon;
revoke all on function public.ensure_business_welcome_outbox(uuid, text, jsonb) from authenticated;
grant execute on function public.ensure_business_welcome_outbox(uuid, text, jsonb) to service_role;

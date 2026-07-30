alter table public.notification_email_outbox
  add column if not exists processing_claim_id uuid,
  add column if not exists processing_claimed_at timestamptz,
  add column if not exists processing_error text;

comment on column public.notification_email_outbox.processing_claim_id is
  'Opaque send-processing claim id. A worker must claim a persisted outbox row before provider fetch.';

comment on column public.notification_email_outbox.processing_claimed_at is
  'Timestamp for the active send-processing claim. Stale claims can be replaced after the RPC timeout.';

comment on column public.notification_email_outbox.processing_error is
  'Sanitized latest provider-processing error label; never stores recipient, rendered HTML, provider body, or secrets.';

create index if not exists notification_email_outbox_processing_claim_idx
  on public.notification_email_outbox (processing_claim_id, processing_claimed_at)
  where sent_at is null;

create or replace function public.claim_notification_email_outbox_for_send(
  p_outbox_id uuid,
  p_claim_id uuid,
  p_claim_timeout interval default interval '10 minutes'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  update public.notification_email_outbox
  set
    processing_claim_id = p_claim_id,
    processing_claimed_at = now(),
    processing_error = null
  where id = p_outbox_id
    and sent_at is null
    and (
      processing_claim_id is null
      or processing_claimed_at is null
      or processing_claimed_at < now() - p_claim_timeout
    )
  returning true into v_claimed;

  if coalesce(v_claimed, false) then
    return 'claimed';
  end if;

  if exists (
    select 1
    from public.notification_email_outbox
    where id = p_outbox_id
      and sent_at is not null
  ) then
    return 'already_sent';
  end if;

  return 'unavailable';
end;
$$;

revoke all on function public.claim_notification_email_outbox_for_send(uuid, uuid, interval) from public;
grant execute on function public.claim_notification_email_outbox_for_send(uuid, uuid, interval) to service_role;

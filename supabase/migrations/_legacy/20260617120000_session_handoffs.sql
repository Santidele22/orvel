-- Secure opaque one-time session handoff storage.
-- No public RLS policies: Edge Functions use the service role and atomic UPDATE redemption.

create table if not exists public.session_handoffs (
  id uuid primary key default gen_random_uuid(),
  handoff_hash text not null unique,
  encrypted_session jsonb not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint session_handoffs_hash_sha256_hex check (handoff_hash ~ '^[a-f0-9]{64}$'),
  constraint session_handoffs_encrypted_session_shape check (
    encrypted_session ? 'v'
    and encrypted_session ? 'alg'
    and encrypted_session ? 'iv'
    and encrypted_session ? 'ct'
    and encrypted_session->>'alg' = 'AES-GCM'
  ),
  constraint session_handoffs_expiry_after_create check (expires_at > created_at)
);

alter table public.session_handoffs enable row level security;

revoke all on table public.session_handoffs from anon, authenticated;

create index if not exists session_handoffs_redeem_idx
  on public.session_handoffs (handoff_hash, expires_at)
  where redeemed_at is null;

create index if not exists session_handoffs_expiry_idx
  on public.session_handoffs (expires_at);

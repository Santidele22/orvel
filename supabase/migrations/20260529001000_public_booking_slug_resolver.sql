-- Canonical public booking slug resolver. Keeps public lookup behind a narrow RPC
-- and fails closed if existing data has canonical collisions.

create or replace function public.canonical_booking_slug(input text)
returns text
language sql
immutable
strict
as $$
  select regexp_replace(
    regexp_replace(
      translate(lower(trim(input)), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
      '[^a-z0-9]+',
      '-',
      'g'
    ),
    '(^-+|-+$)',
    '',
    'g'
  );
$$;
alter table public.businesses
  add column if not exists slug_canonical text;
create or replace function public.set_business_slug_canonical()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.slug_canonical := case
    when new.slug is null then null
    else public.canonical_booking_slug(new.slug)
  end;

  return new;
end;
$$;
drop trigger if exists businesses_slug_canonical_sync on public.businesses;
create trigger businesses_slug_canonical_sync
before insert or update of slug on public.businesses
for each row
execute function public.set_business_slug_canonical();
update public.businesses
set slug_canonical = public.canonical_booking_slug(slug)
where slug is not null
  and (slug_canonical is null or slug_canonical <> public.canonical_booking_slug(slug));
alter table public.businesses
  add constraint businesses_slug_canonical_not_blank
  check (slug_canonical is null or slug_canonical ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  not valid;
do $$
begin
  if exists (
    select 1
    from public.businesses
    where slug_canonical is not null
    group by slug_canonical
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_BUSINESS_SLUG_CANONICAL';
  end if;
end $$;
create unique index if not exists businesses_slug_canonical_unique
  on public.businesses (slug_canonical)
  where slug_canonical is not null;
drop function if exists public.resolve_business_by_slug(text);
create or replace function public.resolve_business_by_slug(business_slug text)
returns table (
  id text,
  slug text,
  name text,
  timezone text
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_slug text := public.canonical_booking_slug(business_slug);
  v_count integer;
begin
  if v_slug is null or v_slug = '' then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  select count(*) into v_count
  from public.businesses b
  where b.slug_canonical = v_slug;

  if v_count <> 1 then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  return query
  select b.id::text, b.slug::text, b.name::text, coalesce(b.timezone, 'America/Argentina/Buenos_Aires')::text
  from public.businesses b
  where b.slug_canonical = v_slug
  limit 1;
end;
$$;

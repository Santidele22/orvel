-- Preserve business records when account closure deletes the bound auth user.
-- The FK constraint name may differ across environments, so discover the
-- public.businesses(owner_id) -> auth.users(id) constraint before replacing it.

ALTER TABLE public.businesses
  ALTER COLUMN owner_id DROP NOT NULL;

DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace rel_ns ON rel_ns.oid = rel.relnamespace
    JOIN pg_class ref_rel ON ref_rel.oid = con.confrelid
    JOIN pg_namespace ref_ns ON ref_ns.oid = ref_rel.relnamespace
    WHERE con.contype = 'f'
      AND rel_ns.nspname = 'public'
      AND rel.relname = 'businesses'
      AND ref_ns.nspname = 'auth'
      AND ref_rel.relname = 'users'
      AND con.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = con.conrelid AND attname = 'owner_id' AND NOT attisdropped)
      ]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.businesses DROP CONSTRAINT %I', constraint_record.conname);
  END LOOP;
END $$;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_owner_id_auth_users_set_null_fkey
  FOREIGN KEY (owner_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

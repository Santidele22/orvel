-- Seed Data for salon-de-belleza testing
-- Run this in Supabase SQL Editor
-- IMPORTANT: Use slug with hyphens: "studio-roma" not "studioroma"

BEGIN;

-- 1. Create business with hyphenated slug (use ON CONFLICT to avoid duplicates if already exists)
INSERT INTO public.businesses (id, slug, name, timezone)
VALUES ('00000000-0000-0000-0000-000000000001', 'studio-roma', 'Studio Roma', 'America/Argentina/Buenos_Aires')
ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name;

-- Also ensure business_settings has a record for this business (with working hours)
INSERT INTO public.business_settings (business_id, business_name, buffer_minutes, min_notice_minutes, slot_interval_minutes, working_hours)
VALUES (
  '00000000-0000-0000-0000-000000000001', 
  'Studio Roma', 
  15, 
  120, 
  30,
  '{
    "monday": { "enabled": true, "start": "09:00", "end": "19:00" },
    "tuesday": { "enabled": true, "start": "09:00", "end": "19:00" },
    "wednesday": { "enabled": true, "start": "09:00", "end": "19:00" },
    "thursday": { "enabled": true, "start": "09:00", "end": "19:00" },
    "friday": { "enabled": true, "start": "09:00", "end": "20:00" },
    "saturday": { "enabled": true, "start": "09:00", "end": "18:00" },
    "sunday": { "enabled": false, "start": "10:00", "end": "14:00" }
  }'::jsonb
)
ON CONFLICT (business_id) DO UPDATE SET 
  business_name = EXCLUDED.business_name,
  working_hours = EXCLUDED.working_hours;

-- 2. Add services for studio-roma
INSERT INTO public.services (id, business_id, name, description, category, duration_minutes, price, is_active)
VALUES 
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Corte de Cabello', 'Corte de cabello con asesoramiento profesional', 'corte', 45, 2500.00, true),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Manicure Rusa', 'Manicure con duración de cuticula rusa', 'manicure', 60, 1800.00, true),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Coloración Completa', 'Coloración completa con productos de calidad', 'coloracion', 120, 4500.00, true),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Limpieza Facial', 'Limpieza facial profunda con productos naturales', 'facial', 60, 3500.00, true),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'Masaje Relajante', 'Masaje corporal relajante con aceites esenciales', 'masaje', 60, 4000.00, true)
ON CONFLICT (id) DO NOTHING;

-- 2. Get the actual business_id if it already exists
DO $$
DECLARE
  biz_id uuid;
BEGIN
  SELECT id INTO biz_id FROM public.businesses WHERE slug = 'studio-roma' LIMIT 1;
  
  -- 3. Create customers with the actual business_id
  INSERT INTO public.customers (id, business_id, full_name, email, phone)
  VALUES 
    (gen_random_uuid(), biz_id, 'Valentina Rossi', 'valentina@email.com', '+54 11 1234-5678'),
    (gen_random_uuid(), biz_id, 'Sofia Martinez', 'sofia@email.com', '+54 11 2345-6789'),
    (gen_random_uuid(), biz_id, 'Maria Lopez', 'maria@email.com', '+54 11 3456-7890'),
    (gen_random_uuid(), biz_id, 'Carolina Gomez', 'carolina@email.com', '+54 11 4567-8901')
  ON CONFLICT DO NOTHING;

  -- 4. Create bookings (turnos) with the actual business_id and service_id
  INSERT INTO public.bookings (id, business_id, customer_id, service_id, starts_at, ends_at, status, manage_token, professional_id, notes)
  SELECT gen_random_uuid(), biz_id, id, '00000000-0000-0000-0000-000000000010', 
    CURRENT_DATE + INTERVAL '10 hours', CURRENT_DATE + INTERVAL '10 hours 45 minutes', 
    'confirmed', encode(gen_random_bytes(18), 'hex'), NULL, 'Corte de cabello'
  FROM public.customers WHERE full_name = 'Valentina Rossi' LIMIT 1;

  INSERT INTO public.bookings (id, business_id, customer_id, service_id, starts_at, ends_at, status, manage_token, professional_id, notes)
  SELECT gen_random_uuid(), biz_id, id, '00000000-0000-0000-0000-000000000012', 
    CURRENT_DATE + INTERVAL '14 hours', CURRENT_DATE + INTERVAL '16 hours', 
    'confirmed', encode(gen_random_uuid(), 'hex'), NULL, 'Coloración completa'
  FROM public.customers WHERE full_name = 'Sofia Martinez' LIMIT 1;

  INSERT INTO public.bookings (id, business_id, customer_id, service_id, starts_at, ends_at, status, manage_token, professional_id, notes)
  SELECT gen_random_uuid(), biz_id, id, '00000000-0000-0000-0000-000000000014', 
    CURRENT_DATE + INTERVAL '1 day 9 hours', CURRENT_DATE + INTERVAL '1 day 10 hours', 
    'confirmed', encode(gen_random_uuid(), 'hex'), NULL, 'Masaje de piedras'
  FROM public.customers WHERE full_name = 'Maria Lopez' LIMIT 1;

  INSERT INTO public.bookings (id, business_id, customer_id, service_id, starts_at, ends_at, status, manage_token, professional_id, notes)
  SELECT gen_random_uuid(), biz_id, id, '00000000-0000-0000-0000-000000000011', 
    CURRENT_DATE + INTERVAL '1 day 15 hours', CURRENT_DATE + INTERVAL '1 day 16 hours', 
    'en-proceso', encode(gen_random_uuid(), 'hex'), NULL, 'Manicure Rusia'
  FROM public.customers WHERE full_name = 'Carolina Gomez' LIMIT 1;

  INSERT INTO public.bookings (id, business_id, customer_id, service_id, starts_at, ends_at, status, manage_token, professional_id, notes)
  SELECT gen_random_uuid(), biz_id, id, '00000000-0000-0000-0000-000000000013', 
    CURRENT_DATE - INTERVAL '2 days 11 hours', CURRENT_DATE - INTERVAL '2 days 12 hours', 
    'completed', encode(gen_random_uuid(), 'hex'), NULL, 'Limpieza facial'
  FROM public.customers WHERE full_name = 'Valentina Rossi' LIMIT 1;

END $$;

COMMIT;

-- Verify data
SELECT 'Businesses:' as info, COUNT(*) as count FROM public.businesses
UNION ALL
SELECT 'Services:', COUNT(*) FROM public.services
UNION ALL
SELECT 'Customers:', COUNT(*) FROM public.customers
UNION ALL
SELECT 'Bookings:', COUNT(*) FROM public.bookings
UNION ALL
SELECT 'Blocked Times:', COUNT(*) FROM public.blocked_times
UNION ALL
SELECT 'Business Settings:', COUNT(*) FROM public.business_settings;
-- Illegal overlap = occupancy in a window greater than roster capacity.
-- Scope: sandbox-v1-* only.

WITH roster AS (
  SELECT
    b.id AS business_id,
    b.slug,
    count(p.id)::integer AS capacity
  FROM public.businesses b
  LEFT JOIN public.professionals p
    ON p.business_id = b.id
   AND p.active IS TRUE
   AND p.deleted_at IS NULL
  WHERE b.slug LIKE 'sandbox-v1-%'
  GROUP BY b.id, b.slug
),
occupancy AS (
  SELECT
    bk.id AS booking_id,
    bk.business_id,
    r.slug,
    r.capacity,
    (
      SELECT count(*)::integer
      FROM public.bookings other
      WHERE other.business_id = bk.business_id
        AND other.status IN ('confirmed', 'pending')
        AND COALESCE(other.deposit_status, 'none') NOT IN ('released', 'abandoned', 'void')
        AND tstzrange(other.starts_at, other.ends_at, '[)')
          && tstzrange(bk.starts_at, bk.ends_at, '[)')
    ) AS overlapping
  FROM public.bookings bk
  JOIN roster r ON r.business_id = bk.business_id
  WHERE bk.status IN ('confirmed', 'pending')
    AND COALESCE(bk.deposit_status, 'none') NOT IN ('released', 'abandoned', 'void')
)
SELECT
  booking_id,
  business_id,
  slug,
  capacity,
  overlapping
FROM occupancy
WHERE overlapping > capacity
ORDER BY slug, booking_id;

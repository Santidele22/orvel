WITH contract AS (
  SELECT public.one_time_operational_email_contract() AS value
)
SELECT attempt.state, attempt.attempted_at, attempt.finalized_at
FROM public.one_time_email_attempts AS attempt
CROSS JOIN contract
WHERE attempt.lifecycle_key = contract.value->>'lifecycle_key'
  AND attempt.purpose = contract.value->>'purpose';

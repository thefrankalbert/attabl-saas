-- A/B test metrics - run weekly, decision date 2026-06-30
-- Experiments:
--   trial:  7d vs 14d (trial_ends_at offset from created_at)
--   toggle: 2-positions vs 3-positions (no server-side data, measure via analytics)
--
-- Trial variant is inferred from trial_ends_at - created_at:
--   ~7 days  => '7d' variant
--   ~14 days => '14d' variant (default)

-- 1. Per-variant signup counts and activation rates
SELECT
  CASE
    WHEN EXTRACT(EPOCH FROM (trial_ends_at - created_at)) / 86400 < 10 THEN '7d'
    ELSE '14d'
  END AS trial_variant,
  COUNT(*) AS total_signups,
  COUNT(*) FILTER (
    WHERE activation_events ? 'first_order_received'
  ) AS activated,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE activation_events ? 'first_order_received') / NULLIF(COUNT(*), 0),
    1
  ) AS activation_rate_pct,
  COUNT(*) FILTER (
    WHERE subscription_status = 'active'
  ) AS converted_to_paid,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE subscription_status = 'active') / NULLIF(COUNT(*), 0),
    1
  ) AS conversion_rate_pct
FROM tenants
WHERE
  created_at >= '2026-05-01'
  AND created_at < '2026-07-01'
  AND trial_ends_at IS NOT NULL
GROUP BY trial_variant
ORDER BY trial_variant;

-- 2. Trial-to-paid conversion by week cohort
SELECT
  DATE_TRUNC('week', created_at) AS cohort_week,
  CASE
    WHEN EXTRACT(EPOCH FROM (trial_ends_at - created_at)) / 86400 < 10 THEN '7d'
    ELSE '14d'
  END AS trial_variant,
  COUNT(*) AS signups,
  COUNT(*) FILTER (WHERE subscription_status = 'active') AS paid,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE subscription_status = 'active') / NULLIF(COUNT(*), 0),
    1
  ) AS conversion_pct
FROM tenants
WHERE
  created_at >= '2026-05-01'
  AND created_at < '2026-07-01'
  AND trial_ends_at IS NOT NULL
GROUP BY cohort_week, trial_variant
ORDER BY cohort_week, trial_variant;

-- 3. Churn by variant (cancelled within 90 days of conversion)
SELECT
  CASE
    WHEN EXTRACT(EPOCH FROM (trial_ends_at - created_at)) / 86400 < 10 THEN '7d'
    ELSE '14d'
  END AS trial_variant,
  COUNT(*) FILTER (WHERE subscription_status = 'active') AS currently_paid,
  COUNT(*) FILTER (WHERE subscription_status = 'cancelled') AS churned,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE subscription_status = 'cancelled') /
      NULLIF(COUNT(*) FILTER (WHERE subscription_status IN ('active', 'cancelled')), 0),
    1
  ) AS churn_rate_pct
FROM tenants
WHERE
  created_at >= '2026-05-01'
  AND created_at < '2026-07-01'
  AND trial_ends_at IS NOT NULL
GROUP BY trial_variant
ORDER BY trial_variant;

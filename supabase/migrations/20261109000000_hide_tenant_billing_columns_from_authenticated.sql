-- NOT YET APPLIED. Apply only AFTER this PR (getTenantBillingIds) is deployed.
-- Any logged-in user could read Stripe ids / activation events of every active tenant via
-- "Public can read active tenants". Keep every other column readable, hide the three sensitive ones.
-- NOTE: a NEW tenants column must be granted to authenticated explicitly if the storefront reads it authenticatedymously.
REVOKE SELECT ON public.tenants FROM authenticated;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'tenants'
     AND column_name NOT IN ('stripe_customer_id', 'stripe_subscription_id', 'activation_events');
  EXECUTE format('GRANT SELECT (%s) ON public.tenants TO authenticated', cols);
END $$;

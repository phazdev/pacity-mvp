-- Pacity MVP — 07 : renouvellement mensuel automatique
create extension if not exists pg_cron;

-- Le 1er de chaque mois a 00:05 UTC (soit 01h ou 02h a Paris selon
-- la saison : on reste toujours le 1er en heure locale).
-- L index credit_tx_one_subscription_per_month garantit qu un
-- double declenchement ne credite jamais deux fois.
select cron.schedule(
  'pacity-monthly-renewal',
  '5 0 1 * *',
  $$select public.run_monthly_renewal()$$
);

-- A paid Peeap transaction may create only one shipping job.
-- Review existing duplicates before applying; do not discard live jobs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.delivery_jobs
    WHERE transaction_id IS NOT NULL
    GROUP BY transaction_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_delivery_jobs_for_transaction_review_required';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_jobs_transaction_id_unique
  ON public.delivery_jobs (transaction_id)
  WHERE transaction_id IS NOT NULL;

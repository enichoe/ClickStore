-- ============================================================
-- ClickSaaS — QRs Payment Integration
-- ============================================================

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS yape_qr_url text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS plin_qr_url text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS yape_qr_path text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS plin_qr_path text;

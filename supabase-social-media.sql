-- ============================================================
-- ClickSaaS — Social Media Integration
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Agregar columnas de redes sociales a la tabla stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS facebook_url text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS tiktok_url text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS whatsapp_url text;

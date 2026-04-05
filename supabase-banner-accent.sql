-- Agregar soporte para banner y color de acento
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_banner_bg text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#4f46e5';

-- ============================================================
-- FIX: Tablas de Pedidos y Productos para StoreClick
-- ============================================================

-- 1. Agregar columnas faltantes a la tabla 'orders'
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_selected boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS voucher_url text;

-- 2. Asegurar que 'whatsapp' es el nombre correcto (ya está en migrations, pero por si acaso)
-- Si por error se creó 'whatsapp_phone', lo renombramos o aseguramos 'whatsapp'
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='whatsapp_phone') THEN
    ALTER TABLE public.orders RENAME COLUMN whatsapp_phone TO whatsapp;
  END IF;
END $$;

-- 3. Verificar productos
-- En este proyecto el campo de la imagen en DB parece ser 'image'
-- Aseguramos que 'image' existe (la mayoría de las implementaciones previas lo usaban)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image text;

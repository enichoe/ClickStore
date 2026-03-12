-- ============================================================
-- ClickSaaS — Migraciones seguras para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Son idempotentes: pueden ejecutarse múltiples veces sin error
-- ============================================================

-- PASO 1: Crear tabla platform_admins si no existe
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- PASO 2: Columnas nuevas en stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS whatsapp_phone text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS description    text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS logo_url       text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS active         boolean DEFAULT true;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS currency       text    DEFAULT 'USD';

-- PASO 3: Columnas nuevas en products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS active      boolean DEFAULT true;

-- Actualizar productos existentes sin "active" a true
UPDATE public.products SET active = true WHERE active IS NULL;

-- PASO 4: Constraint ÚNICO en slug (resolver duplicados primero)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT slug FROM public.stores WHERE slug IS NOT NULL
    GROUP BY slug HAVING COUNT(*) > 1
  LOOP
    UPDATE public.stores
    SET slug = slug || '-' || extract(epoch from now())::int
    WHERE id IN (
      SELECT id FROM public.stores WHERE slug = r.slug
      ORDER BY created_at ASC OFFSET 1
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_slug_unique') THEN
    ALTER TABLE public.stores ADD CONSTRAINT stores_slug_unique UNIQUE (slug);
  END IF;
END;
$$;

-- PASO 5: Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_products_store_id  ON public.products (store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id    ON public.orders   (store_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at  ON public.orders   (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stores_slug        ON public.stores   (slug);
CREATE INDEX IF NOT EXISTS idx_stores_owner_id    ON public.stores   (owner_id);

-- PASO 6: RLS en platform_admins
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_public_insert_platform_admins" ON public.platform_admins;
DROP POLICY IF EXISTS "no_public_update_platform_admins" ON public.platform_admins;
DROP POLICY IF EXISTS "no_public_delete_platform_admins" ON public.platform_admins;
DROP POLICY IF EXISTS "self_select_platform_admins"      ON public.platform_admins;

CREATE POLICY "no_public_insert_platform_admins" ON public.platform_admins FOR INSERT WITH CHECK (false);
CREATE POLICY "no_public_update_platform_admins" ON public.platform_admins FOR UPDATE USING (false);
CREATE POLICY "no_public_delete_platform_admins" ON public.platform_admins FOR DELETE USING (false);
CREATE POLICY "self_select_platform_admins"      ON public.platform_admins FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- PASO 7: Función RPC create_order
-- FIX v2: removido AND active=true que causaba error 400.
-- El total se calcula server-side — el cliente NO puede modificar precios.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_order(
  _store_id      uuid,
  _customer_name text,
  _whatsapp      text,
  _items         jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  elem           jsonb;
  prod_price     numeric;
  qty            int;
  computed_total numeric := 0;
  order_id       uuid;
BEGIN
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'store_id es requerido';
  END IF;
  IF _customer_name IS NULL OR trim(_customer_name) = '' THEN
    RAISE EXCEPTION 'El nombre del cliente es requerido';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'El carrito no puede estar vacío';
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(_items) LOOP
    BEGIN
      qty := (elem->>'qty')::int;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Cantidad inválida en el pedido: %', elem;
    END;

    IF qty <= 0 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
    END IF;

    -- Precio real desde la BD (no del cliente)
    SELECT price INTO prod_price
    FROM public.products
    WHERE id       = (elem->>'id')::uuid
      AND store_id = _store_id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado: %', (elem->>'id');
    END IF;

    computed_total := computed_total + (prod_price * qty);
  END LOOP;

  INSERT INTO public.orders (store_id, customer_name, whatsapp, items, total, status, created_at)
  VALUES (_store_id, _customer_name, _whatsapp, _items, computed_total, 'pending', now())
  RETURNING id INTO order_id;

  RETURN order_id;
END;
$$;

-- Permitir llamadas desde clientes (anon = cliente no logueado de la tienda)
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, text, jsonb) TO authenticated;

-- ============================================================
-- VERIFICACIÓN: Ver columnas actuales de stores y products
-- ============================================================
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('stores', 'products', 'orders')
ORDER BY table_name, ordinal_position;

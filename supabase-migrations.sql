-- ============================================================
-- ClickSaaS — Migraciones seguras para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Son idempotentes: pueden ejecutarse múltiples veces sin error
-- ============================================================

-- ============================================================
-- PASO 1: Crear tabla platform_admins si no existe
-- (DEBE ejecutarse ANTES que cualquier política que la use)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- PASO 2: Agregar columna whatsapp_phone a stores
-- ============================================================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS whatsapp_phone text;

-- ============================================================
-- PASO 3: Columnas adicionales recomendadas en stores
-- ============================================================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- ============================================================
-- PASO 4: Columnas adicionales recomendadas en products
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- ============================================================
-- PASO 5: Constraint ÚNICO en slug (seguro si hay duplicados)
-- Primero hacemos slugs duplicados únicos añadiéndoles sufijo
-- ============================================================
DO $$
DECLARE
  r RECORD;
  c INT;
BEGIN
  -- Resolver duplicados de slug antes de crear el constraint
  FOR r IN
    SELECT slug, COUNT(*) as cnt
    FROM public.stores
    WHERE slug IS NOT NULL
    GROUP BY slug
    HAVING COUNT(*) > 1
  LOOP
    c := 1;
    UPDATE public.stores
    SET slug = slug || '-' || c
    WHERE id IN (
      SELECT id FROM public.stores
      WHERE slug = r.slug
      ORDER BY created_at ASC
      LIMIT 1
      OFFSET 1  -- Dejar el primero intacto
    );
    c := c + 1;
  END LOOP;
END;
$$;

-- Ahora sí crear el constraint (solo si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_slug_unique'
  ) THEN
    ALTER TABLE public.stores ADD CONSTRAINT stores_slug_unique UNIQUE (slug);
    RAISE NOTICE 'Constraint stores_slug_unique creado.';
  ELSE
    RAISE NOTICE 'Constraint stores_slug_unique ya existe. Saltando.';
  END IF;
END;
$$;

-- ============================================================
-- PASO 6: Índices de rendimiento (IF NOT EXISTS disponible en PG)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_store_id   ON public.products (store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id     ON public.orders (store_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stores_slug         ON public.stores (slug);
CREATE INDEX IF NOT EXISTS idx_stores_owner_id     ON public.stores (owner_id);

-- ============================================================
-- PASO 7: Habilitar RLS en platform_admins y crear políticas
-- ============================================================
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas anteriores si existen (para poder recrearlas)
DROP POLICY IF EXISTS "no_public_insert_platform_admins"  ON public.platform_admins;
DROP POLICY IF EXISTS "no_public_update_platform_admins"  ON public.platform_admins;
DROP POLICY IF EXISTS "no_public_delete_platform_admins"  ON public.platform_admins;
DROP POLICY IF EXISTS "self_select_platform_admins"       ON public.platform_admins;

-- Nadie puede insertar desde el cliente (solo service_role)
CREATE POLICY "no_public_insert_platform_admins" ON public.platform_admins
  FOR INSERT WITH CHECK (false);

-- Nadie puede actualizar desde el cliente
CREATE POLICY "no_public_update_platform_admins" ON public.platform_admins
  FOR UPDATE USING (false);

-- Nadie puede eliminar desde el cliente
CREATE POLICY "no_public_delete_platform_admins" ON public.platform_admins
  FOR DELETE USING (false);

-- Solo el propio admin puede verse a sí mismo (para validar si es admin)
CREATE POLICY "self_select_platform_admins" ON public.platform_admins
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- PASO 8: Crear función RPC create_order (segura, server-side)
-- Reemplaza la inserción directa de órdenes desde el cliente
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
  -- Validaciones básicas
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'store_id es requerido';
  END IF;
  IF _customer_name IS NULL OR trim(_customer_name) = '' THEN
    RAISE EXCEPTION 'customer_name es requerido';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'items no puede estar vacío';
  END IF;

  -- Validar cada producto y calcular total
  FOR elem IN SELECT * FROM jsonb_array_elements(_items) LOOP
    -- Validar qty
    BEGIN
      qty := (elem->>'qty')::int;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'qty inválido en items: %', elem;
    END;

    IF qty <= 0 THEN
      RAISE EXCEPTION 'qty debe ser mayor a 0: %', elem;
    END IF;

    -- Obtener precio real desde la DB (no del cliente)
    SELECT price INTO prod_price
    FROM public.products
    WHERE id = (elem->>'id')::uuid
      AND store_id = _store_id
      AND active = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado o no pertenece a esta tienda: %', elem->>'id';
    END IF;

    computed_total := computed_total + (prod_price * qty);
  END LOOP;

  -- Insertar orden con total calculado en servidor
  INSERT INTO public.orders (store_id, customer_name, whatsapp, items, total, status, created_at)
  VALUES (_store_id, _customer_name, _whatsapp, _items, computed_total, 'pending', now())
  RETURNING id INTO order_id;

  RETURN order_id;
END;
$$;

-- Permitir que usuarios anónimos llamen a la función
-- (La función valida internamente con SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, text, jsonb) TO authenticated;

-- ============================================================
-- VERIFICACIÓN FINAL — Ver resumen
-- ============================================================
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'stores'
ORDER BY ordinal_position;

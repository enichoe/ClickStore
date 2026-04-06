-- ============================================================
-- supabase-fix-500-stores.sql
-- FIX CRÍTICO: Error 500 al hacer SELECT/INSERT en stores
-- CAUSA: Políticas RLS referencian store_members que no existe
-- 
-- INSTRUCCIONES: Ejecutar COMPLETO en Supabase > SQL Editor
-- ============================================================

-- ============================================================
-- PASO 1: Crear tabla store_members si no existe
-- (Las políticas la referencian, si no existe → error 500)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.store_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'manager',
  permissions jsonb DEFAULT '{"view_orders": true, "edit_products": true, "edit_store": false, "update_orders": true}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, user_id)
);

-- ============================================================
-- PASO 2: Crear tabla platform_admins si no existe
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- PASO 3: Limpiar TODAS las políticas existentes en stores
-- (Eliminar conflictos entre supabase-policies.sql y supabase-rls-production.sql)
-- ============================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'stores' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.stores', pol.policyname);
  END LOOP;
END$$;

-- ============================================================
-- PASO 4: Crear políticas simples y funcionales para stores
-- ============================================================

-- SELECT: Lectura pública por slug (storefront) + acceso del propietario + platform_admins
CREATE POLICY "stores_select" ON public.stores
FOR SELECT USING (
  (slug IS NOT NULL)                    -- Storefront público (cualquiera puede ver si hay slug)
  OR (owner_id = auth.uid())            -- El dueño puede ver su propia tienda
  OR EXISTS (                           -- Platform admins (superadmin) pueden ver todo
    SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
  )
);

-- INSERT: Solo el usuario autenticado puede crear SU tienda
CREATE POLICY "stores_insert" ON public.stores
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND owner_id = auth.uid()
);

-- UPDATE: Solo el propietario puede actualizar
CREATE POLICY "stores_update" ON public.stores
FOR UPDATE USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- DELETE: Solo el propietario puede eliminar
CREATE POLICY "stores_delete" ON public.stores
FOR DELETE USING (owner_id = auth.uid());

-- ============================================================
-- PASO 5: Limpiar y recrear políticas de products
-- ============================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'products' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.products', pol.policyname);
  END LOOP;
END$$;

-- SELECT: Productos visibles si la tienda tiene slug (storefront) o el dueño los ve
CREATE POLICY "products_select" ON public.products
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = products.store_id
    AND (
      s.slug IS NOT NULL          -- Tienda pública
      OR s.owner_id = auth.uid()  -- Dueño de la tienda
    )
  )
);

-- INSERT: Solo el dueño de la tienda puede agregar productos
CREATE POLICY "products_insert" ON public.products
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = products.store_id AND s.owner_id = auth.uid()
  )
);

-- UPDATE: Solo el dueño
CREATE POLICY "products_update" ON public.products
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid())
);

-- DELETE: Solo el dueño
CREATE POLICY "products_delete" ON public.products
FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid())
);

-- ============================================================
-- PASO 6: Limpiar y recrear políticas de categories
-- ============================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'categories' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.categories', pol.policyname);
  END LOOP;
END$$;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select" ON public.categories
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = categories.store_id
    AND (s.slug IS NOT NULL OR s.owner_id = auth.uid())
  )
);

CREATE POLICY "categories_insert" ON public.categories
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = categories.store_id AND s.owner_id = auth.uid())
);

CREATE POLICY "categories_update" ON public.categories
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = categories.store_id AND s.owner_id = auth.uid())
);

CREATE POLICY "categories_delete" ON public.categories
FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = categories.store_id AND s.owner_id = auth.uid())
);

-- ============================================================
-- PASO 7: Políticas de orders (INSERT bloqueado, usar RPC)
-- ============================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'orders' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', pol.policyname);
  END LOOP;
END$$;

-- SELECT: Solo el dueño de la tienda ve sus pedidos
CREATE POLICY "orders_select" ON public.orders
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = orders.store_id AND s.owner_id = auth.uid())
);

-- UPDATE: Solo el dueño puede actualizar estado de pedidos
CREATE POLICY "orders_update" ON public.orders
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = orders.store_id AND s.owner_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = orders.store_id AND s.owner_id = auth.uid())
);

-- INSERT de orders: solo via RPC create_order_secure (SECURITY DEFINER)
-- El rol 'anon' y 'authenticated' NO pueden insertar directamente
REVOKE INSERT ON public.orders FROM anon;
REVOKE INSERT ON public.orders FROM authenticated;
GRANT INSERT ON public.orders TO service_role;

-- ============================================================
-- PASO 8: Asegurar que RLS esté habilitado en todas las tablas
-- ============================================================
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PASO 9: Recrear la función create_order_secure (por si acaso)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_order_secure(
  p_store_id uuid,
  p_customer_name text,
  p_whatsapp text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_price numeric;
  v_qty integer;
  v_store_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
  IF NOT v_store_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Store not found');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT price INTO v_price 
    FROM public.products 
    WHERE id = (v_item->>'id')::uuid AND store_id = p_store_id;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Product not found: %s', v_item->>'id'));
    END IF;
    
    v_qty := COALESCE((v_item->>'qty')::integer, 1);
    v_qty := GREATEST(1, LEAST(v_qty, 100));
    v_total := v_total + (v_price * v_qty);
  END LOOP;

  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order total must be greater than zero');
  END IF;

  INSERT INTO public.orders (store_id, customer_name, whatsapp, items, total, status)
  VALUES (p_store_id, trim(p_customer_name), trim(p_whatsapp), p_items, v_total, 'pending')
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id::text, 'total', v_total);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_secure TO anon, authenticated;

-- ============================================================
-- VERIFICACIÓN FINAL
-- Deberías ver las políticas creadas sin errores
-- ============================================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('stores', 'products', 'orders', 'categories')
ORDER BY tablename, cmd;

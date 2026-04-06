-- ============================================================
-- supabase-fix-registro-tienda.sql
-- FIX CRÍTICO: Restaura permisos para crear órdenes y tiendas
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- ---------------------------------------------------------------
-- PROBLEMA 1: El REVOKE de INSERT en orders bloqueó todo.
-- El storefront usa la función RPC `create_order_secure`.
-- Si esa función no existe, ningún pedido puede crearse.
-- Este script crea la función y restaura los permisos mínimos.
-- ---------------------------------------------------------------

-- 1. Restaurar permiso de INSERT en orders para service_role (ya existe)
-- y para la función RPC con SECURITY DEFINER
GRANT INSERT ON public.orders TO service_role;

-- 2. Crear (o reemplazar) la función RPC segura para crear órdenes
-- Esto es necesario porque el JS llama a supabase.rpc('create_order_secure')
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
  -- 1. Validar que la tienda existe
  SELECT EXISTS(SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
  IF NOT v_store_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Store not found');
  END IF;

  -- 2. Calcular total desde los precios reales en BD (no los del cliente)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT price INTO v_price 
    FROM public.products 
    WHERE id = (v_item->>'id')::uuid 
      AND store_id = p_store_id
      AND active = true;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Product not found or inactive: %s', v_item->>'id')
      );
    END IF;
    
    v_qty := COALESCE((v_item->>'qty')::integer, 1);
    IF v_qty < 1 OR v_qty > 100 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
    END IF;
    
    v_total := v_total + (v_price * v_qty);
  END LOOP;

  -- 3. Validaciones básicas
  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order total must be greater than zero');
  END IF;
  
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid customer name');
  END IF;

  -- 4. Insertar la orden (SECURITY DEFINER bypasses RLS)
  INSERT INTO public.orders (
    store_id,
    customer_name,
    whatsapp,
    items,
    total,
    status
  ) VALUES (
    p_store_id,
    trim(p_customer_name),
    trim(p_whatsapp),
    p_items,
    v_total,
    'pending'
  ) RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id::text,
    'total', v_total
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- 3. Otorgar permiso de ejecución a usuarios anónimos y autenticados
GRANT EXECUTE ON FUNCTION public.create_order_secure TO anon, authenticated;

-- ---------------------------------------------------------------
-- PROBLEMA 2: Verificar política INSERT de stores
-- Asegurarse de que usuarios autenticados puedan crear su tienda
-- ---------------------------------------------------------------

-- Limpiar y recrear política INSERT de stores
DROP POLICY IF EXISTS "insert_stores" ON public.stores;
DROP POLICY IF EXISTS "owner_insert_stores" ON public.stores;

CREATE POLICY "insert_stores" ON public.stores
FOR INSERT WITH CHECK (
  owner_id = auth.uid()
  AND auth.uid() IS NOT NULL
);

-- ---------------------------------------------------------------
-- VERIFICACIÓN: Puedes ejecutar esto para confirmar que funciona
-- SELECT public.create_order_secure(
--   'TU-STORE-UUID-AQUI',
--   'Cliente Test',
--   '51900000000',
--   '[{"id": "TU-PRODUCT-UUID", "qty": 1}]'::jsonb
-- );
-- ---------------------------------------------------------------

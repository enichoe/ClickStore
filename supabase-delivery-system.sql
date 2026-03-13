-- ============================================================
-- IMPLEMENTACIÓN DE DELIVERY OPCIONAL
-- ============================================================

-- 1. Añadir configuración de delivery a las tiendas
ALTER TABLE public.stores 
ADD COLUMN IF NOT EXISTS active_delivery boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS delivery_price  numeric(10,2) DEFAULT 0;

-- 2. Actualizar función create_order para manejar delivery server-side
-- Borramos primero para evitar conflictos de parámetros
DROP FUNCTION IF EXISTS public.create_order(uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_order(
  p_store_id uuid,
  p_customer_name text,
  p_whatsapp text,
  p_items jsonb,
  p_delivery_selected boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_price numeric;
  v_total numeric := 0;
  v_order_id uuid;
  v_delivery_active boolean;
  v_delivery_price numeric;
BEGIN
  -- 1. Obtener configuración de la tienda
  SELECT active_delivery, delivery_price 
  INTO v_delivery_active, v_delivery_price
  FROM public.stores WHERE id = p_store_id;

  -- 2. Calcular total de productos
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT price INTO v_price 
    FROM public.products 
    WHERE id = (v_item->>'id')::uuid AND store_id = p_store_id;
    
    IF v_price IS NULL THEN 
       RAISE EXCEPTION 'Producto no encontrado o inválido';
    END IF;

    v_total := v_total + (v_price * (v_item->>'qty')::int);
  END LOOP;

  -- 3. Sumar delivery si está activo Y el cliente lo seleccionó
  IF v_delivery_active = true AND p_delivery_selected = true THEN
    v_total := v_total + v_delivery_price;
  END IF;

  -- 4. Insertar pedido con el TOTAL FINAL calculado en servidor
  INSERT INTO public.orders (store_id, customer_name, whatsapp, items, total, status, created_at)
  VALUES (p_store_id, p_customer_name, p_whatsapp, p_items, v_total, 'pending', now())
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, text, jsonb) TO anon, authenticated;

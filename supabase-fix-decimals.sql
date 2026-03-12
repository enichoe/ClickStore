-- ============================================================
-- FIX FINAL: COLUMNA WHATSAPP, DECIMALES Y ERROR 400
-- ============================================================

-- 1. AGREGAR COLUMNA 'whatsapp' A LA TABLA 'orders' SI NO EXISTE
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS whatsapp text;

-- 2. Asegurar que los precios y totales acepten decimales
ALTER TABLE public.products 
  ALTER COLUMN price TYPE numeric(10,2);

ALTER TABLE public.orders 
  ALTER COLUMN total TYPE numeric(10,2);

-- 3. Asegurar que currency exista en stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS currency text DEFAULT 'PEN';

-- 4. ELIMINAR LA FUNCIÓN ANTERIOR PARA EVITAR EL ERROR 42P13
DROP FUNCTION IF EXISTS public.create_order(uuid, text, text, jsonb);

-- 5. RE-CREAR FUNCIÓN create_order (Sincronizada con la tabla)
CREATE OR REPLACE FUNCTION public.create_order(
  p_store_id uuid,
  p_customer_name text,
  p_whatsapp text,
  p_items jsonb
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
BEGIN
  -- Iterar y calcular total server-side
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT price INTO v_price 
    FROM public.products 
    WHERE id = (v_item->>'id')::uuid;
    
    IF v_price IS NULL THEN 
       RAISE EXCEPTION 'Producto no encontrado: %', (v_item->>'id');
    END IF;

    v_total := v_total + (v_price * (v_item->>'qty')::int);
  END LOOP;

  -- Insertar en orders (ahora con la columna 'whatsapp' garantizada)
  INSERT INTO public.orders (store_id, customer_name, whatsapp, items, total, status, created_at)
  VALUES (p_store_id, p_customer_name, p_whatsapp, p_items, v_total, 'pending', now())
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, text, jsonb) TO anon, authenticated;

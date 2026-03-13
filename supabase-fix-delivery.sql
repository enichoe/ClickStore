-- PASO 1: Añadir columnas necesarias a la tabla orders si no existen
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_address text,
ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_type text DEFAULT 'pickup';

-- PASO 2: Eliminar funciones pre-existentes para evitar inconsistencias de parámetros
DROP FUNCTION IF EXISTS public.create_order(uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS public.create_order(uuid, text, text, jsonb, boolean);

-- PASO 3: Recrear la función create_order con soporte nativo para delivery y direcciones
CREATE OR REPLACE FUNCTION public.create_order(
  _store_id uuid,
  _customer_name text,
  _whatsapp text,
  _items jsonb,
  _delivery_address text DEFAULT NULL,
  _delivery_selected boolean DEFAULT false
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
  v_delivery_type text := 'pickup';
BEGIN
  -- Validaciones iniciales
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'store_id es requerido';
  END IF;
  IF _customer_name IS NULL OR trim(_customer_name) = '' THEN
    RAISE EXCEPTION 'El nombre del cliente es requerido';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'El carrito no puede estar vacío';
  END IF;

  -- 1. Obtener configuración de la tienda para delivery
  SELECT active_delivery, COALESCE(delivery_price, 0)
  INTO v_delivery_active, v_delivery_price
  FROM public.stores WHERE id = _store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tienda no encontrada';
  END IF;

  -- 2. Calcular total de productos iterando sobre _items
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    BEGIN
      IF (v_item->>'qty')::int <= 0 THEN
        RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
      END IF;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Cantidad inválida en el pedido';
    END;

    SELECT price INTO v_price 
    FROM public.products 
    WHERE id = (v_item->>'id')::uuid AND store_id = _store_id
    LIMIT 1;
    
    IF v_price IS NULL THEN 
       RAISE EXCEPTION 'Producto no encontrado o inválido: %', (v_item->>'id');
    END IF;

    v_total := v_total + (v_price * (v_item->>'qty')::int);
  END LOOP;

  -- 3. Sumar delivery del lado servidor si está activo Y el cliente lo seleccionó
  IF v_delivery_active = true AND _delivery_selected = true THEN
    v_total := v_total + v_delivery_price;
    v_delivery_type := 'delivery';
  ELSE
    v_delivery_price := 0; -- Resetear para evitar guardar costo si no aplica
  END IF;

  -- 4. Insertar pedido con el TOTAL FINAL calculado
  INSERT INTO public.orders (
    store_id, 
    customer_name, 
    whatsapp, 
    items, 
    total, 
    status, 
    delivery_address, 
    delivery_fee, 
    delivery_type, 
    created_at
  )
  VALUES (
    _store_id, 
    _customer_name, 
    _whatsapp, 
    _items, 
    v_total, 
    'pending', 
    _delivery_address, 
    v_delivery_price, 
    v_delivery_type, 
    now()
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, text, jsonb, text, boolean) TO anon, authenticated;

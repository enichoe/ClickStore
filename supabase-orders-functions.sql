-- ============================================================
-- supabase-orders-functions.sql
-- Funciones RPC seguras para manejo de órdenes
-- ============================================================

-- ============================================================
-- 1. FUNCIÓN: create_order_secure
-- Crear órdenes con validación total server-side
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
  v_elem jsonb;
  v_prod_price numeric(10,2);
  v_prod_id uuid;
  v_qty int;
  v_computed_total numeric(10,2) := 0;
  v_order_id uuid;
  v_store_exists boolean;
  v_error_msg text;
BEGIN
  -- 1. VALIDAR TIENDA
  SELECT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND slug IS NOT NULL)
  INTO v_store_exists;
  
  IF NOT v_store_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Store does not exist or is not public'
    );
  END IF;

  -- 2. VALIDAR ITEMS
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Items cannot be empty'
    );
  END IF;

  IF jsonb_array_length(p_items) > 100 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot order more than 100 different items'
    );
  END IF;

  -- 3. PROCESAR ITEMS Y CALCULAR TOTAL
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- Parse JSON safely
    BEGIN
      v_prod_id := (v_elem->>'id')::uuid;
      v_qty := (v_elem->>'qty')::int;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid item format in request'
      );
    END;

    -- Validar cantidad
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 999 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid quantity: must be between 1 and 999'
      );
    END IF;

    -- Validar producto existe, pertenece a tienda y está disponible
    SELECT price INTO v_prod_price FROM products
      WHERE id = v_prod_id 
      AND store_id = p_store_id
      AND is_available = true
      LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Product not found, unavailable, or belongs to different store'
      );
    END IF;

    -- Validar precio
    IF v_prod_price IS NULL OR v_prod_price < 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Product has invalid price'
      );
    END IF;

    -- Acumular total
    v_computed_total := v_computed_total + (v_prod_price * v_qty);
  END LOOP;

  -- Validar total final
  IF v_computed_total <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Order total must be greater than zero'
    );
  END IF;

  IF v_computed_total > 999999.99 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Order total exceeds maximum allowed (999,999.99)'
    );
  END IF;

  -- 4. VALIDAR INFORMACIÓN DE CLIENTE
  IF p_customer_name IS NULL OR TRIM(p_customer_name) = '' OR LENGTH(TRIM(p_customer_name)) < 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Customer name must be at least 3 characters'
    );
  END IF;

  IF p_whatsapp IS NULL OR TRIM(p_whatsapp) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'WhatsApp number is required'
    );
  END IF;

  -- 5. INSERTAR ORDEN
  BEGIN
    INSERT INTO orders (
      store_id,
      customer_name,
      whatsapp,
      items,
      total,
      status,
      created_at
    ) VALUES (
      p_store_id,
      TRIM(SUBSTRING(p_customer_name, 1, 255)),
      TRIM(SUBSTRING(p_whatsapp, 1, 20)),
      p_items,
      v_computed_total,
      'pending',
      now()
    ) RETURNING id INTO v_order_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_msg := SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to create order: ' || v_error_msg
    );
  END;

  -- 6. REGISTRAR EN AUDITORÍA
  PERFORM log_audit_event(
    p_store_id,
    'INSERT',
    'orders',
    v_order_id,
    NULL,
    jsonb_build_object(
      'customer_name', p_customer_name,
      'total', v_computed_total,
      'items_count', jsonb_array_length(p_items)
    )
  );

  -- 7. RETORNAR ÉXITO
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'total', v_computed_total,
    'message', 'Order created successfully'
  );

EXCEPTION WHEN OTHERS THEN
  v_error_msg := SQLERRM;
  
  -- Registrar error en auditoría
  PERFORM log_audit_event(
    p_store_id,
    'CREATE_ORDER_ERROR',
    'orders',
    NULL,
    NULL,
    jsonb_build_object('error', v_error_msg)
  );

  RETURN jsonb_build_object(
    'success', false,
    'error', 'Internal server error'
  );
END;
$$;

-- Permitir que clientes públicos llamen a esta función
GRANT EXECUTE ON FUNCTION public.create_order_secure TO anon, authenticated;

-- ============================================================
-- 2. FUNCIÓN: update_order_status
-- Actualizar estado de orden (solo propietario)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_new_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_old_status text;
  v_is_owner boolean;
BEGIN
  -- Obtener tienda de la orden
  SELECT store_id, status INTO v_store_id, v_old_status
  FROM orders WHERE id = p_order_id;

  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Order not found'
    );
  END IF;

  -- Verificar permisos: debe ser propietario o manager
  SELECT EXISTS (
    SELECT 1 FROM stores
    WHERE id = v_store_id AND owner_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner AND NOT EXISTS (
    SELECT 1 FROM store_members
    WHERE store_id = v_store_id 
    AND user_id = auth.uid() 
    AND role = 'manager'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You do not have permission to update this order'
    );
  END IF;

  -- Validar nuevo estado
  IF p_new_status NOT IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid status. Allowed: pending, confirmed, preparing, ready, delivered, cancelled'
    );
  END IF;

  -- Actualizar estado
  UPDATE orders
  SET status = p_new_status, updated_at = now()
  WHERE id = p_order_id;

  -- Registrar auditoría
  PERFORM log_audit_event(
    v_store_id,
    'UPDATE',
    'orders',
    p_order_id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Order status updated successfully',
    'previous_status', v_old_status,
    'new_status', p_new_status
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status TO authenticated;

-- ============================================================
-- 3. FUNCIÓN: get_store_orders_summary
-- Obtener resumen de órdenes (con paginación)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_store_orders_summary(
  p_store_id uuid,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_orders jsonb;
  v_total_count int;
BEGIN
  -- Verificar acceso
  SELECT owner_id = auth.uid() INTO v_is_owner FROM stores WHERE id = p_store_id;

  IF NOT v_is_owner AND NOT EXISTS (
    SELECT 1 FROM store_members
    WHERE store_id = p_store_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized'
    );
  END IF;

  -- Validar límites
  IF p_limit > 500 THEN p_limit := 500; END IF;
  IF p_limit < 1 THEN p_limit := 1; END IF;
  IF p_offset < 0 THEN p_offset := 0; END IF;

  -- Contar total
  SELECT COUNT(*) INTO v_total_count FROM orders
  WHERE store_id = p_store_id
  AND (p_status IS NULL OR status = p_status);

  -- Obtener órdenes
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'customer_name', customer_name,
      'whatsapp', whatsapp,
      'total', total,
      'status', status,
      'items_count', jsonb_array_length(items),
      'created_at', created_at
    )
  ) INTO v_orders
  FROM (
    SELECT * FROM orders
    WHERE store_id = p_store_id
    AND (p_status IS NULL OR status = p_status)
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'orders', COALESCE(v_orders, '[]'::jsonb),
    'pagination', jsonb_build_object(
      'total', v_total_count,
      'limit', p_limit,
      'offset', p_offset,
      'has_more', (p_offset + p_limit) < v_total_count
    )
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_orders_summary TO authenticated;

-- ============================================================
-- 4. FUNCIÓN: check_rate_limit
-- Validar rate limiting por IP
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  endpoint text NOT NULL,
  request_count int DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  window_end timestamptz DEFAULT now() + interval '1 minute',
  UNIQUE(ip_address, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_end);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_ip_address text,
  p_endpoint text,
  p_max_requests int DEFAULT 10,
  p_window_minutes int DEFAULT 1
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_now timestamptz := now();
BEGIN
  -- Limpiar entradas expiradas
  DELETE FROM rate_limits WHERE window_end < v_now;

  -- Obtener contador
  SELECT request_count INTO v_count 
  FROM rate_limits 
  WHERE ip_address = p_ip_address 
  AND endpoint = p_endpoint 
  AND window_end > v_now;

  IF v_count IS NULL THEN
    -- Primera solicitud
    INSERT INTO rate_limits (ip_address, endpoint, request_count, window_end)
    VALUES (p_ip_address, p_endpoint, 1, v_now + (p_window_minutes || ' minutes')::interval);
    RETURN true;
  ELSIF v_count < p_max_requests THEN
    -- Incrementar
    UPDATE rate_limits
    SET request_count = request_count + 1
    WHERE ip_address = p_ip_address 
    AND endpoint = p_endpoint 
    AND window_end > v_now;
    RETURN true;
  ELSE
    -- Límite alcanzado
    RETURN false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit TO anon, authenticated;

-- ============================================================
-- 5. FUNCIÓN: get_audit_logs
-- Obtener logs de auditoría (solo propietario)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_audit_logs(
  p_store_id uuid,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_action text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_logs jsonb;
BEGIN
  -- Solo propietario puede ver logs
  SELECT owner_id = auth.uid() INTO v_is_owner FROM stores WHERE id = p_store_id;

  IF NOT v_is_owner THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Only store owner can view audit logs'
    );
  END IF;

  IF p_limit > 500 THEN p_limit := 500; END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'action', action,
      'table_name', table_name,
      'user_id', user_id,
      'created_at', created_at,
      'old_values', old_values,
      'new_values', new_values
    ) ORDER BY created_at DESC
  ) INTO v_logs
  FROM audit_logs
  WHERE store_id = p_store_id
  AND (p_action IS NULL OR action = p_action)
  LIMIT p_limit OFFSET p_offset;

  RETURN jsonb_build_object(
    'success', true,
    'logs', COALESCE(v_logs, '[]'::jsonb),
    'count', COALESCE(jsonb_array_length(v_logs), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_logs TO authenticated;

-- ============================================================
-- TEST: Verificar funciones creadas correctamente
-- ============================================================

-- Listar todas las funciones creadas
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND (
  routine_name LIKE 'create_order%'
  OR routine_name LIKE 'update_order%'
  OR routine_name LIKE 'get_%'
  OR routine_name LIKE 'check_%'
  OR routine_name LIKE 'log_%'
)
ORDER BY routine_name;

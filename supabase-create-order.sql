-- Supabase: función RPC para crear órdenes validadas server-side
-- Ejecutar en SQL Editor de Supabase.
-- Recomendación: revisar ownership y seguridad. Idealmente invocar esta función
-- desde un endpoint serverless con la service_role, o permitir rpc público tras
-- revisar que la función valida correctamente los items.

CREATE OR REPLACE FUNCTION public.create_order(
  _store_id uuid,
  _customer_name text,
  _whatsapp text,
  _items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  elem jsonb;
  prod_price numeric;
  qty int;
  computed_total numeric := 0;
  order_id uuid;
BEGIN
  IF _items IS NULL THEN
    RAISE EXCEPTION 'items is required';
  END IF;

  -- Validar elementos: cada elemento debe tener { id: uuid, qty: int }
  FOR elem IN SELECT * FROM jsonb_array_elements(_items) LOOP
    BEGIN
      qty := (elem->> 'qty')::int;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid qty in items: %', elem;
    END;

    IF qty <= 0 THEN
      RAISE EXCEPTION 'Invalid qty (<=0) in items: %', elem;
    END IF;

    SELECT price INTO prod_price FROM public.products
      WHERE id = (elem->> 'id')::uuid AND store_id = _store_id
      LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found or does not belong to store: %', elem->> 'id';
    END IF;

    computed_total := computed_total + (prod_price * qty);
  END LOOP;

  -- Insertar orden con total calculado
  INSERT INTO public.orders (store_id, customer_name, whatsapp, items, total, status, created_at)
    VALUES (_store_id, _customer_name, _whatsapp, _items, computed_total, 'pending', now())
    RETURNING id INTO order_id;

  RETURN order_id;
END;
$$;

-- Opcional: revocar INSERT directo desde role publico para evitar inserciones sin validación
-- (Ejecuta manualmente si deseas bloquear INSERTs directos)
-- REVOKE INSERT ON public.orders FROM public;

-- NOTA:
-- - Esta función está marcada SECURITY DEFINER: ejecutará con los permisos del propietario.
-- - En Supabase, para que la función pueda bypass RLS y escribir en la tabla pese a
--   políticas restrictivas, el owner debe ser un role con privilegios (service_role).
-- - Alternativa segura: exponer la función sólo vía una Function/Serverless que use
--   la service_role key y no permitir RPC público.

-- Ejemplo de uso desde la API cliente (no recomendado en producción sin revisar seguridad):
-- select public.create_order('store-uuid', 'Cliente', '+123456789', '[{"id":"product-uuid","qty":2}]'::jsonb);

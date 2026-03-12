-- Supabase RLS policies sugeridas para ClickSaaS
-- Ejecutar en SQL Editor de Supabase

-- 1) Habilitar RLS en tablas
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Tabla para platform admins (necesaria antes de políticas que la referencian)
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

-- 2) Políticas para stores
-- SELECT: permitir lectura pública por slug (usada en storefront)
DROP POLICY IF EXISTS "public_select_stores_by_slug" ON public.stores;
CREATE POLICY "public_select_stores_by_slug" ON public.stores
FOR SELECT USING (
  (slug IS NOT NULL) OR (owner_id = auth.uid())
);

-- INSERT: permitir crear tiendas solo si owner_id coincide con auth.uid()
DROP POLICY IF EXISTS "owner_insert_stores" ON public.stores;
CREATE POLICY "owner_insert_stores" ON public.stores
FOR INSERT WITH CHECK (owner_id = auth.uid());

-- UPDATE: sólo propietario
DROP POLICY IF EXISTS "owner_update_stores" ON public.stores;
CREATE POLICY "owner_update_stores" ON public.stores
FOR UPDATE USING (owner_id = auth.uid());

-- DELETE: sólo propietario
DROP POLICY IF EXISTS "owner_delete_stores" ON public.stores;
CREATE POLICY "owner_delete_stores" ON public.stores
FOR DELETE USING (owner_id = auth.uid());

-- 3) Políticas para products
-- SELECT: productos visibles públicamente asociados a una tienda
DROP POLICY IF EXISTS "public_select_products_by_store" ON public.products;
CREATE POLICY "public_select_products_by_store" ON public.products
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND (s.slug IS NOT NULL OR s.owner_id = auth.uid()))
);

-- INSERT: sólo si el owner de la tienda coincide
DROP POLICY IF EXISTS "owner_insert_products" ON public.products;
CREATE POLICY "owner_insert_products" ON public.products
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid())
);

-- UPDATE: sólo si el usuario es owner de la tienda
DROP POLICY IF EXISTS "owner_update_products" ON public.products;
CREATE POLICY "owner_update_products" ON public.products
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid())
);

-- DELETE: sólo si el usuario es owner de la tienda
DROP POLICY IF EXISTS "owner_delete_products" ON public.products;
CREATE POLICY "owner_delete_products" ON public.products
FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid())
);

-- 4) Políticas para orders
-- INSERT: permitir público (cliente creando pedido)
-- INSERT: permitir público (cliente creando pedido)
-- Antes: permitir INSERT público (no seguro). Eliminamos/neutralizamos esa política
DROP POLICY IF EXISTS "public_insert_orders" ON public.orders;

-- RECOMENDACIÓN: revocar INSERT directo desde role `public` para forzar uso de la
-- función RPC `create_order` o de un endpoint server-side que valide items y total.
REVOKE INSERT ON public.orders FROM public;

-- Si quieres permitir que ciertos admins insert en orders, crea una policy basada
-- en `platform_admins` u otro claim. Ejemplo (opcional):
DROP POLICY IF EXISTS "admins_insert_orders" ON public.orders;
CREATE POLICY "admins_insert_orders" ON public.orders
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = auth.uid())
);

-- SELECT: sólo propietario de la tienda
DROP POLICY IF EXISTS "owner_select_orders" ON public.orders;
CREATE POLICY "owner_select_orders" ON public.orders
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = orders.store_id AND s.owner_id = auth.uid())
);

-- UPDATE: sólo propietario de la tienda
DROP POLICY IF EXISTS "owner_update_orders" ON public.orders;
CREATE POLICY "owner_update_orders" ON public.orders
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = orders.store_id AND s.owner_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = orders.store_id AND s.owner_id = auth.uid())
);

-- DELETE: sólo propietario de la tienda
DROP POLICY IF EXISTS "owner_delete_orders" ON public.orders;
CREATE POLICY "owner_delete_orders" ON public.orders
FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = orders.store_id AND s.owner_id = auth.uid())
);

-- Nota: para superadmin, crea un role o guarda un claim en user_metadata y amplía las políticas para permitir role = 'superadmin'.

-- 5) Storage (product-images) recomendaciones:
-- - Si quieres público: configura "Public" para el bucket o usa URLs públicas.
-- - Para uploads controlados: realiza uploads desde una función serverless usando service_role key y valida owner_id.

-- FIN

-- ------------------------------------------------------------------
-- Mejoras recomendadas (ejecútalas en SQL Editor):
-- 1) Tabla para platform admins (permitir lectura global desde UI de superadmin)
-- ------------------------------------------------------------------
-- Ampliar la política de stores para permitir lectura a platform_admins
DROP POLICY IF EXISTS "public_select_stores_by_slug" ON public.stores;
CREATE POLICY "public_select_stores_by_slug_or_admin" ON public.stores
FOR SELECT USING (
  (slug IS NOT NULL) OR (owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = auth.uid())
);

-- 2) UNIQUE constraint para slug (evita colisiones a nivel DB)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_slug_unique') THEN
    ALTER TABLE public.stores ADD CONSTRAINT stores_slug_unique UNIQUE (slug);
  END IF;
END$$;

-- 3) Recomendación: crear una función server-side para crear órdenes con validación
-- (ejemplo básico; adapta según tu esquema y validaciones necesarias)
-- NOTA: Este es un ejemplo de función; ajusta tipos y manejo de errores.
--
/*
CREATE OR REPLACE FUNCTION public.create_order(
  _store_id uuid,
  _customer_name text,
  _whatsapp text,
  _items jsonb
) RETURNS TABLE(id uuid) LANGUAGE plpgsql AS $$
DECLARE
  computed_total numeric := 0;
  elem jsonb;
  prod record;
BEGIN
  FOR elem IN SELECT * FROM jsonb_array_elements(_items) LOOP
    PERFORM 1 FROM public.products p WHERE p.id = (elem->> 'id')::uuid AND p.store_id = _store_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no válido en items';
    END IF;
    SELECT price INTO prod FROM public.products WHERE id = (elem->> 'id')::uuid;
    computed_total := computed_total + (prod.price * ((elem->> 'qty')::int));
  END LOOP;

  INSERT INTO public.orders(store_id, customer_name, whatsapp, items, total, status)
  VALUES(_store_id, _customer_name, _whatsapp, _items, computed_total, 'pending')
  RETURNING id INTO id;

  RETURN NEXT;
END;
$$;

-- Luego, evita INSERT directo por anon revocando INSERT y obligando a usar la función
REVOKE INSERT ON public.orders FROM public;
*/

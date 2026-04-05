-- ============================================================
-- supabase-rls-production.sql
-- Políticas RLS HARDENED para producción
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ADVERTENCIA: Esto REEMPLACZARÁ políticas antiguas
-- ============================================================

-- 1. CREAR TABLAS DE SOPORTE (Si no existen)
-- ============================================================

-- Tabla de miembros de tienda con roles granulares
CREATE TABLE IF NOT EXISTS public.store_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'manager', -- 'owner', 'manager', 'viewer'
  permissions jsonb DEFAULT '{"view_orders": true, "edit_products": true, "edit_store": false, "update_orders": true}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_store_members_store_id ON public.store_members(store_id);
CREATE INDEX IF NOT EXISTS idx_store_members_user_id ON public.store_members(user_id);
CREATE INDEX IF NOT EXISTS idx_store_members_role ON public.store_members(role);

-- Tabla de auditoría (inmutable)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_store_id ON public.audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;

-- Tabla de alertas
CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  severity text CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  event_type text,
  message text,
  metadata jsonb,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_store_id ON public.alerts(store_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON public.alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON public.alerts(resolved_at) WHERE resolved_at IS NULL;

-- ============================================================
-- 2. FUNCIONES DE AUDITORÍA Y VALIDACIÓN
-- ============================================================

-- Función para registrar eventos de auditoría
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_store_id uuid,
  p_action text,
  p_table_name text,
  p_record_id uuid,
  p_old_values jsonb DEFAULT NULL,
  p_new_values jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    store_id, user_id, action, table_name, record_id, 
    old_values, new_values, created_at
  ) VALUES (
    p_store_id,
    auth.uid(),
    p_action,
    p_table_name,
    p_record_id,
    p_old_values,
    p_new_values,
    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event TO authenticated, service_role;

-- Función para validar acceso a tienda
CREATE OR REPLACE FUNCTION public.user_has_store_access(
  p_store_id uuid,
  p_required_role text DEFAULT 'viewer'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_has_access boolean;
  v_role text;
BEGIN
  -- Verificar si es propietario
  SELECT owner_id = auth.uid() INTO v_is_owner FROM stores WHERE id = p_store_id;
  IF v_is_owner THEN RETURN true; END IF;

  -- Verificar si es miembro con rol adecuado
  SELECT role INTO v_role FROM store_members 
  WHERE store_id = p_store_id AND user_id = auth.uid();

  IF v_role IS NULL THEN RETURN false; END IF;

  -- Validar roles jerárquicos
  CASE p_required_role
    WHEN 'owner' THEN RETURN v_role = 'owner';
    WHEN 'manager' THEN RETURN v_role IN ('owner', 'manager');
    WHEN 'viewer' THEN RETURN v_role IN ('owner', 'manager', 'viewer');
    ELSE RETURN false;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_store_access TO authenticated;

-- ============================================================
-- 3. RLS PARA store_members
-- ============================================================

ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_manage_members" ON public.store_members;
CREATE POLICY "owner_manage_members" ON public.store_members
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = store_members.store_id 
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = store_members.store_id 
    AND s.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "members_view_self" ON public.store_members;
CREATE POLICY "members_view_self" ON public.store_members
FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- 4. RLS PARA STORES (HARDENED)
-- ============================================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas antiguas
DROP POLICY IF EXISTS "public_select_stores_by_slug" ON public.stores;
DROP POLICY IF EXISTS "owner_insert_stores" ON public.stores;
DROP POLICY IF EXISTS "owner_update_stores" ON public.stores;
DROP POLICY IF EXISTS "owner_delete_stores" ON public.stores;

-- SELECT: Tiendas públicas por slug O acceso de propietario/miembro
CREATE POLICY "select_stores" ON public.stores
FOR SELECT USING (
  (slug IS NOT NULL)
  OR
  (owner_id = auth.uid())
  OR
  (
    EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = stores.id
      AND sm.user_id = auth.uid()
    )
  )
);

-- INSERT: Solo propietarios autenticados
CREATE POLICY "insert_stores" ON public.stores
FOR INSERT WITH CHECK (
  owner_id = auth.uid()
  AND auth.role() = 'authenticated'
);

-- UPDATE: Propietario o manager autorizado
CREATE POLICY "update_stores" ON public.stores
FOR UPDATE USING (
  owner_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM public.store_members sm
    WHERE sm.store_id = stores.id
    AND sm.user_id = auth.uid()
    AND sm.role = 'manager'
    AND (sm.permissions->>'edit_store')::boolean = true
  )
) WITH CHECK (
  owner_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM public.store_members sm
    WHERE sm.store_id = stores.id
    AND sm.user_id = auth.uid()
    AND sm.role = 'manager'
    AND (sm.permissions->>'edit_store')::boolean = true
  )
);

-- DELETE: Solo propietario
CREATE POLICY "delete_stores" ON public.stores
FOR DELETE USING (
  owner_id = auth.uid()
);

-- ============================================================
-- 5. RLS PARA PRODUCTOS (HARDENED)
-- ============================================================

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_products_by_store" ON public.products;
DROP POLICY IF EXISTS "owner_insert_products" ON public.products;
DROP POLICY IF EXISTS "owner_update_products" ON public.products;
DROP POLICY IF EXISTS "owner_delete_products" ON public.products;

-- SELECT: Productos públicos O acceso de miembro
CREATE POLICY "select_products" ON public.products
FOR SELECT USING (
  (
    EXISTS (
      SELECT 1 FROM public.stores s 
      WHERE s.id = products.store_id 
      AND s.slug IS NOT NULL
    )
  )
  OR
  (
    EXISTS (
      SELECT 1 FROM public.stores s
      JOIN public.store_members sm ON sm.store_id = s.id
      WHERE s.id = products.store_id
      AND sm.user_id = auth.uid()
    )
  )
);

-- INSERT: Propietario o manager autorizado
CREATE POLICY "insert_products" ON public.products
FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
  AND
  (
    EXISTS (
      SELECT 1 FROM public.stores s 
      WHERE s.id = products.store_id 
      AND s.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.stores s
      JOIN public.store_members sm ON sm.store_id = s.id
      WHERE s.id = products.store_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'manager'
      AND (sm.permissions->>'edit_products')::boolean != false
    )
  )
);

-- UPDATE: Con validación de permisos
CREATE POLICY "update_products" ON public.products
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = products.store_id 
    AND (
      s.owner_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM public.store_members sm
        WHERE sm.store_id = s.id
        AND sm.user_id = auth.uid()
        AND sm.role = 'manager'
        AND (sm.permissions->>'edit_products')::boolean != false
      )
    )
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = products.store_id 
    AND (
      s.owner_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM public.store_members sm
        WHERE sm.store_id = s.id
        AND sm.user_id = auth.uid()
        AND sm.role = 'manager'
        AND (sm.permissions->>'edit_products')::boolean != false
      )
    )
  )
);

-- DELETE: Solo propietario
CREATE POLICY "delete_products" ON public.products
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = products.store_id 
    AND s.owner_id = auth.uid()
  )
);

-- ============================================================
-- 6. RLS PARA ÓRDENES (CRITICAL)
-- ============================================================

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_orders" ON public.orders;
DROP POLICY IF EXISTS "admins_insert_orders" ON public.orders;
DROP POLICY IF EXISTS "owner_select_orders" ON public.orders;
DROP POLICY IF EXISTS "owner_update_orders" ON public.orders;
DROP POLICY IF EXISTS "select_orders" ON public.orders;
DROP POLICY IF EXISTS "update_orders" ON public.orders;

-- SELECT: Solo propietario/manager de la tienda
CREATE POLICY "select_orders" ON public.orders
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = orders.store_id 
    AND (
      s.owner_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM public.store_members sm
        WHERE sm.store_id = s.id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'manager')
      )
    )
  )
);

-- UPDATE: Propietario/manager con permiso
CREATE POLICY "update_orders" ON public.orders
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = orders.store_id 
    AND (
      s.owner_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM public.store_members sm
        WHERE sm.store_id = s.id
        AND sm.user_id = auth.uid()
        AND sm.role = 'manager'
        AND (sm.permissions->>'update_orders')::boolean != false
      )
    )
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = orders.store_id 
    AND (
      s.owner_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM public.store_members sm
        WHERE sm.store_id = s.id
        AND sm.user_id = auth.uid()
        AND sm.role = 'manager'
        AND (sm.permissions->>'update_orders')::boolean != false
      )
    )
  )
);

-- BLOQUEAR INSERT directo - forzar uso de RPC
REVOKE INSERT ON public.orders FROM public, authenticated;
GRANT INSERT ON public.orders TO service_role;

-- ============================================================
-- 7. RLS PARA STORAGE
-- ============================================================

-- Crear bucket si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880
)
ON CONFLICT (id) DO NOTHING;

-- Limpiar políticas antiguas
DROP POLICY IF EXISTS "Acceso Público" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios Autenticados Suben Fotos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios Borran sus Fotos" ON storage.objects;

-- Public read: Solo imágenes en /public/*
CREATE POLICY "public_read_product_images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'public'
);

-- Owner read: Acceso a /stores/{store_id}/*
CREATE POLICY "owner_read_private_images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'stores'
  AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id::text = (storage.foldername(name))[2]
    AND (
      s.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.store_members sm
        WHERE sm.store_id = s.id
        AND sm.user_id = auth.uid()
      )
    )
  )
);

-- Upload: Solo propietarios y managers
CREATE POLICY "authenticated_upload_product_images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'stores'
  AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id::text = (storage.foldername(name))[2]
    AND (
      s.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.store_members sm
        WHERE sm.store_id = s.id
        AND sm.user_id = auth.uid()
        AND sm.role = 'manager'
      )
    )
  )
);

-- Delete: Solo propietarios
CREATE POLICY "owner_delete_product_images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'stores'
  AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id::text = (storage.foldername(name))[2]
    AND s.owner_id = auth.uid()
  )
);

-- ============================================================
-- 8. CREAR ÍNDICES PARA PERFORMANCE
-- ============================================================

-- Stores
CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON public.stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON public.stores(slug);
CREATE INDEX IF NOT EXISTS idx_stores_created_at ON public.stores(created_at DESC);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_is_available ON public.products(is_available) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_products_store_available ON public.products(store_id, is_available);
CREATE INDEX IF NOT EXISTS idx_products_price ON public.products(price);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON public.orders(store_id, status);

-- Categories
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON public.categories(store_id);

-- Store Members
CREATE INDEX IF NOT EXISTS idx_store_members_store_id ON public.store_members(store_id);
CREATE INDEX IF NOT EXISTS idx_store_members_user_id ON public.store_members(user_id);

COMMIT;

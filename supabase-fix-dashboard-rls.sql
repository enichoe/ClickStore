-- ============================================================
-- FIX: POLÍTICAS DE ACCESO PARA PEDIDOS (DASHBOARD)
-- ============================================================

-- 1. Asegurar que RLS esté activo
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 2. Limpiar políticas antiguas
DROP POLICY IF EXISTS "owner_select_orders" ON public.orders;
DROP POLICY IF EXISTS "public_insert_orders" ON public.orders;
DROP POLICY IF EXISTS "admins_select_orders" ON public.orders;

-- 3. POLÍTICA: El dueño de la tienda puede VER sus pedidos
-- Buscamos el store_id en la tabla stores y comparamos con auth.uid()
CREATE POLICY "owner_select_orders" ON public.orders
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.stores 
    WHERE public.stores.id = public.orders.store_id 
    AND public.stores.owner_id = auth.uid()
  )
);

-- 4. POLÍTICA: Los Administradores de la Plataforma pueden ver TODO
CREATE POLICY "admins_select_orders" ON public.orders
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.platform_admins 
    WHERE public.platform_admins.user_id = auth.uid()
  )
);

-- 5. POLÍTICA: El dueño de la tienda puede ACTUALIZAR sus pedidos (marcar como entregado, etc)
DROP POLICY IF EXISTS "owner_update_orders" ON public.orders;
CREATE POLICY "owner_update_orders" ON public.orders
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.stores 
    WHERE public.stores.id = public.orders.store_id 
    AND public.stores.owner_id = auth.uid()
  )
);

-- 6. Verificación: Listar políticas actuales de la tabla orders
SELECT * FROM pg_policies WHERE tablename = 'orders';

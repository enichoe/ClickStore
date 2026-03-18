-- ============================================================
-- FIX: Error 401 (Unauthorized) al realizar pedidos
-- Permite que los clientes (anon) puedan insertar pedidos directamente
-- ============================================================

-- 1. Otorgar permisos de inserción al rol público (anon)
GRANT INSERT ON public.orders TO anon, authenticated;

-- 2. Crear una política de RLS que permita la inserción pública
DROP POLICY IF EXISTS "public_insert_orders_fix" ON public.orders;
CREATE POLICY "public_insert_orders_fix" ON public.orders 
FOR INSERT WITH CHECK (true);

-- Nota: Solo el dueño de la tienda podrá VER los pedidos (esto ya está en las políticas anteriores)

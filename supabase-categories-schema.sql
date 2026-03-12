-- ============================================================
-- MEJORA DE ARQUITECTURA: CATEGORÍAS Y EXTRAS
-- ============================================================

-- 1. Tabla de Categorías formalizada
CREATE TABLE IF NOT EXISTS public.categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name       text NOT NULL,
  priority   int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 2. Vincular productos a categorías (UUID en lugar de texto)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

-- 3. Tabla para Extras/Modificadores (Ej: "Extra queso", "Sin cebolla")
CREATE TABLE IF NOT EXISTS public.product_options (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  name       text NOT NULL,
  price      numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 4. RLS para Categorías
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_categories" ON public.categories;
CREATE POLICY "public_select_categories" ON public.categories 
FOR SELECT USING (true); -- Visibles para todos los clientes de la tienda

DROP POLICY IF EXISTS "owner_manage_categories" ON public.categories;
CREATE POLICY "owner_manage_categories" ON public.categories
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = categories.store_id AND s.owner_id = auth.uid())
);

-- 5. RLS para Product Options
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_select_options" ON public.product_options;
CREATE POLICY "public_select_options" ON public.product_options FOR SELECT USING (true);

DROP POLICY IF EXISTS "owner_manage_options" ON public.product_options;
CREATE POLICY "owner_manage_options" ON public.product_options FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.products p 
    JOIN public.stores s ON s.id = p.store_id 
    WHERE p.id = product_options.product_id AND s.owner_id = auth.uid()
  )
);

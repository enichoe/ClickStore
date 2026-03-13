-- 1. ASEGURAR COLUMNAS CRÍTICAS EN STORES
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- 2. ASEGURAR POLÍTICAS DE LECTURA PÚBLICA (ESTO ES LO QUE SUELE CAUSAR EL 404)
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir ver tiendas a todo el mundo" ON public.stores;
CREATE POLICY "Permitir ver tiendas a todo el mundo" 
ON public.stores FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Permitir ver productos a todo el mundo" ON public.products;
CREATE POLICY "Permitir ver productos a todo el mundo" 
ON public.products FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Permitir ver categorías a todo el mundo" ON public.categories;
CREATE POLICY "Permitir ver categorías a todo el mundo" 
ON public.categories FOR SELECT 
USING (true);

-- 3. ACTUALIZAR TIENDAS EXISTENTES SIN SLUG (Poner un slug temporal si está vacío)
UPDATE public.stores SET slug = id::text WHERE slug IS NULL;

-- 4. REFRESCAR CACHÉ
NOTIFY pgrst, 'reload schema';

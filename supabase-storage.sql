-- ============================================================
-- SQL para habilitar Storage en Supabase dashboard
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Crear el bucket 'product-images' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Eliminar políticas antiguas si existen para evitar conflictos
DROP POLICY IF EXISTS "Acceso Público" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios Autenticados Suben Fotos" ON storage.objects;

-- 3. Crear política de ACCESO PÚBLICO (para que los clientes vean las imágenes)
CREATE POLICY "Acceso Público"
ON storage.objects FOR SELECT
USING ( bucket_id = 'product-images' );

-- 4. Crear política de SUBIDA (solo dueños de tienda autenticados)
CREATE POLICY "Usuarios Autenticados Suben Fotos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images' 
  AND auth.role() = 'authenticated'
);

-- 5. Opcional: Política para BORRAR (que los dueños puedan limpiar sus fotos)
DROP POLICY IF EXISTS "Usuarios Borran sus Fotos" ON storage.objects;
CREATE POLICY "Usuarios Borran sus Fotos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images' 
  AND auth.role() = 'authenticated'
);

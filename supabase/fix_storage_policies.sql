-- =====================================================
-- FIX: Políticas de Storage para acceso público a evidencias
-- Ejecuta este archivo en el Dashboard de Supabase > Storage > Policies
-- O en el SQL Editor
-- =====================================================

-- =====================================================
-- IMPORTANTE: Configurar buckets como PÚBLICOS
-- =====================================================
-- 1. Ve a Storage en el Dashboard de Supabase
-- 2. Para cada bucket (stage-evidence, intake-evidence), haz clic en los 3 puntos
-- 3. Selecciona "Edit bucket" 
-- 4. Marca como "Public bucket" ✓
-- 5. Guarda los cambios
-- =====================================================

-- =====================================================
-- POLÍTICAS PARA: stage-evidence (Evidencia de avances)
-- =====================================================

-- Eliminar políticas existentes que puedan estar bloqueando
DROP POLICY IF EXISTS "Users can view stage evidence from their shop" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload stage evidence to their shop" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete stage evidence from their shop" ON storage.objects;

-- Política SELECT: Permitir acceso público de lectura
CREATE POLICY "Public read access for stage evidence"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'stage-evidence');

-- Política INSERT: Usuarios autenticados pueden subir a su carpeta de shop
CREATE POLICY "Authenticated users can upload stage evidence"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'stage-evidence' AND
    (storage.foldername(name))[1] IN (
        SELECT shop_id::text FROM profiles WHERE id = auth.uid()
    )
);

-- Política DELETE: Admin puede eliminar de su shop
CREATE POLICY "Admin can delete stage evidence"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'stage-evidence' AND
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'superadmin')
        AND (
            role = 'superadmin' OR
            (storage.foldername(name))[1] = shop_id::text
        )
    )
);

-- =====================================================
-- POLÍTICAS PARA: intake-evidence (Evidencia de ingreso)
-- =====================================================

-- Eliminar políticas existentes que puedan estar bloqueando
DROP POLICY IF EXISTS "Users can view intake evidence from their shop" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload intake evidence to their shop" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete intake evidence from their shop" ON storage.objects;

-- Política SELECT: Permitir acceso público de lectura
CREATE POLICY "Public read access for intake evidence"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'intake-evidence');

-- Política INSERT: Usuarios autenticados pueden subir a su carpeta de shop
CREATE POLICY "Authenticated users can upload intake evidence"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'intake-evidence' AND
    (storage.foldername(name))[1] IN (
        SELECT shop_id::text FROM profiles WHERE id = auth.uid()
    )
);

-- Política DELETE: Admin puede eliminar de su shop
CREATE POLICY "Admin can delete intake evidence"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'intake-evidence' AND
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'superadmin')
        AND (
            role = 'superadmin' OR
            (storage.foldername(name))[1] = shop_id::text
        )
    )
);

-- =====================================================
-- POLÍTICAS PARA: shop-logos (Logos de tiendas)
-- =====================================================

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Anyone can view shop logos" ON storage.objects;
DROP POLICY IF EXISTS "Admin can upload shop logo" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete shop logo" ON storage.objects;

-- Política SELECT: Acceso público total
CREATE POLICY "Public read access for shop logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'shop-logos');

-- Política INSERT: Solo admin puede subir
CREATE POLICY "Admin can upload shop logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'shop-logos' AND
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'superadmin')
        AND (
            role = 'superadmin' OR
            (storage.foldername(name))[1] = shop_id::text
        )
    )
);

-- Política DELETE: Solo admin puede eliminar
CREATE POLICY "Admin can delete shop logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'shop-logos' AND
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'superadmin')
        AND (
            role = 'superadmin' OR
            (storage.foldername(name))[1] = shop_id::text
        )
    )
);

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- Listar todas las políticas de storage
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects'
ORDER BY policyname;

-- Verificar que los buckets estén configurados correctamente
SELECT 
    id,
    name,
    public
FROM storage.buckets
WHERE name IN ('stage-evidence', 'intake-evidence', 'shop-logos');

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================
/*
1. Los buckets DEBEN estar marcados como PÚBLICOS en la configuración
   - Ve a Storage > [nombre-bucket] > Edit > Public bucket ✓

2. Las políticas permiten:
   - Lectura pública (anónimos pueden ver las imágenes)
   - Escritura solo para usuarios autenticados de su propio shop
   - Eliminación solo para admins

3. Si las imágenes aún no cargan después de esto:
   - Verifica en el navegador (F12 > Network) si hay errores CORS
   - Verifica que las URLs generadas incluyan el dominio correcto de Supabase
   - Asegúrate de que el bucket existe y tiene archivos

4. Para producción, considera:
   - Configurar CORS en Supabase si es necesario
   - Implementar rate limiting
   - Monitorear uso de storage
*/

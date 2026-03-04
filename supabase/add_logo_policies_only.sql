-- =====================================================
-- Agregar políticas RLS para bucket shop-logos
-- Ejecuta DESPUÉS de crear el bucket desde la interfaz
-- =====================================================

-- PASO 1: Eliminar políticas existentes (si hay conflictos)
DROP POLICY IF EXISTS "Public Access to Shop Logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload shop logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update shop logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete shop logos" ON storage.objects;

-- PASO 2: Crear política de lectura PÚBLICA
CREATE POLICY "Public Access to Shop Logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'shop-logos');

-- PASO 3: Crear política de subida para admin y superadmin
CREATE POLICY "Authenticated users can upload shop logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'shop-logos'
    AND (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'superadmin')
        )
    )
);

-- PASO 4: Crear política de actualización para admin y superadmin
CREATE POLICY "Authenticated users can update shop logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'shop-logos'
    AND (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'superadmin')
        )
    )
)
WITH CHECK (bucket_id = 'shop-logos');

-- PASO 5: Crear política de eliminación para admin y superadmin
CREATE POLICY "Authenticated users can delete shop logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'shop-logos'
    AND (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'superadmin')
        )
    )
);

-- PASO 6: Verificar políticas creadas
SELECT policyname, cmd, roles
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%Shop Logos%';

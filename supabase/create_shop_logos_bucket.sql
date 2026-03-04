-- =====================================================
-- Create storage bucket for shop logos - VERSIÓN MEJORADA
-- Ejecuta esto en Supabase SQL Editor
-- =====================================================

-- IMPORTANTE: Primero verifica si existe
DO $$
BEGIN
    -- Intenta crear el bucket
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'shop-logos') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'shop-logos', 
            'shop-logos', 
            true,
            2097152, -- 2MB en bytes
            ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
        );
        RAISE NOTICE 'Bucket shop-logos creado exitosamente';
    ELSE
        -- Si existe, asegurarse que sea público
        UPDATE storage.buckets 
        SET public = true,
            file_size_limit = 2097152,
            allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
        WHERE id = 'shop-logos';
        RAISE NOTICE 'Bucket shop-logos ya existe, actualizado a público';
    END IF;
END $$;

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Public Access to Shop Logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload shop logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update shop logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete shop logos" ON storage.objects;

-- Crear política de lectura PÚBLICA
CREATE POLICY "Public Access to Shop Logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'shop-logos');

-- Crear política de subida para admin y superadmin
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

-- Crear política de actualización para admin y superadmin
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

-- Crear política de eliminación para admin y superadmin
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

-- Verificar que todo está correcto
SELECT 
    'Bucket configuración:' as info,
    id, 
    name, 
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets 
WHERE id = 'shop-logos';

SELECT 
    'Políticas creadas:' as info,
    policyname, 
    cmd, 
    roles
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%Shop Logos%';

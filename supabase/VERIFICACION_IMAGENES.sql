-- =====================================================
-- VERIFICACIÓN COMPLETA DEL FLUJO DE IMÁGENES
-- Ejecuta estos queries para diagnosticar problemas
-- =====================================================

-- 1. Verificar que los buckets existen y están configurados como públicos
SELECT 
    id,
    name,
    public as es_publico,
    created_at
FROM storage.buckets
WHERE name IN ('stage-evidence', 'intake-evidence', 'shop-logos')
ORDER BY name;

-- DEBE MOSTRAR: public = true para todos los buckets
-- Si public = false, ve a Storage > Edit bucket > Marcar "Public bucket"

-- =====================================================

-- 2. Verificar políticas de Storage activas
SELECT 
    policyname as politica,
    cmd as operacion,
    roles as para_roles
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects'
AND policyname LIKE '%evidence%' OR policyname LIKE '%logo%'
ORDER BY policyname;

-- DEBE INCLUIR: 
-- - "Public read access for stage evidence" (SELECT, public)
-- - "Public read access for intake evidence" (SELECT, public)
-- - "Public read access for shop logos" (SELECT, public)

-- =====================================================

-- 3. Verificar funciones RPC para tracking público
SELECT 
    proname as funcion,
    pg_get_function_identity_arguments(oid) as argumentos,
    proacl as permisos
FROM pg_proc 
WHERE proname IN (
    'get_stages_by_repair', 
    'get_stage_evidence_by_stage', 
    'get_intake_evidence_by_repair'
)
ORDER BY proname;

-- DEBE MOSTRAR: Las 3 funciones con sus argumentos
-- Si NO aparecen, ejecuta: supabase/fix_tracking_rpc.sql

-- =====================================================

-- 4. Verificar archivos en Storage (ejemplo con un repair_id real)
-- REEMPLAZA 'tu-shop-id-aqui' con un UUID real de tu tabla shops
SELECT 
    name as archivo,
    id,
    created_at,
    metadata->>'size' as tamaño_bytes
FROM storage.objects
WHERE bucket_id = 'stage-evidence'
AND name LIKE '%tu-shop-id-aqui%'
ORDER BY created_at DESC
LIMIT 10;

-- DEBE MOSTRAR: Los archivos subidos con estructura shopId/repairId/stageId/filename

-- =====================================================

-- 5. Verificar evidencias guardadas en la BD
-- REEMPLAZA 'tu-repair-id-aqui' con un UUID real de una reparación
SELECT 
    se.id,
    se.file_url as url_guardada,
    se.file_name as nombre_archivo,
    rs.stage_name as etapa,
    se.created_at
FROM stage_evidence se
JOIN repair_stages rs ON se.stage_id = rs.id
WHERE rs.repair_id = 'tu-repair-id-aqui'
ORDER BY se.created_at DESC;

-- DEBE MOSTRAR: file_url con URL completa de Supabase Storage
-- Formato: https://[proyecto].supabase.co/storage/v1/object/public/stage-evidence/[path]

-- =====================================================

-- 6. Verificar que las evidencias se retornan por RPC
-- REEMPLAZA con un stage_id real y el tracking_token correcto
SELECT * FROM get_stage_evidence_by_stage(
    'tu-stage-id-aqui'::uuid,
    'tu-tracking-token-aqui'
);

-- DEBE RETORNAR: Los registros de stage_evidence si el token es válido

-- =====================================================

-- 7. Test completo de acceso público a una imagen
-- REEMPLAZA con valores reales
SELECT 
    r.code as codigo_reparacion,
    r.tracking_token,
    rs.stage_name,
    se.file_url,
    -- Extraer el path después de /public/
    SUBSTRING(se.file_url FROM 'public/[^/]+/(.+)') as path_en_storage
FROM repairs r
JOIN repair_stages rs ON rs.repair_id = r.id
JOIN stage_evidence se ON se.stage_id = rs.id
WHERE r.code = 'TU-CODIGO-AQUI'
ORDER BY se.created_at DESC
LIMIT 5;

-- COPIA una de las URLs de file_url y ábrela en navegador incógnito
-- DEBE ABRIR: La imagen sin pedir autenticación

-- =====================================================
-- DIAGNÓSTICO DE PROBLEMAS COMUNES
-- =====================================================

/*
PROBLEMA: Las imágenes no se ven (403 Forbidden)
SOLUCIÓN: 
  1. Verifica query #1 - Los buckets deben ser públicos
  2. Verifica query #2 - Deben existir políticas "Public read access"
  3. Ejecuta: supabase/fix_storage_policies.sql

PROBLEMA: Las imágenes no aparecen en track.html
SOLUCIÓN:
  1. Verifica query #3 - Las funciones RPC deben existir
  2. Verifica query #6 - Las funciones deben retornar datos
  3. Ejecuta: supabase/fix_tracking_rpc.sql

PROBLEMA: Error "operator does not exist: uuid = text"
SOLUCIÓN:
  Las políticas de Storage tienen conversiones incorrectas
  Ejecuta la versión corregida de fix_storage_policies.sql

PROBLEMA: file_url guarda solo el path, no la URL completa
SOLUCIÓN:
  Verifica query #5 - file_url debe empezar con https://
  Si solo tiene el path, hay un error en uploadFile()
  
PROBLEMA: Subir foto da error en celular pero funciona en PC
SOLUCIÓN:
  1. Verifica el tamaño de la imagen (límite en CONFIG)
  2. Verifica la compresión de imagen en storageService.js
  3. Limpia caché del navegador móvil

PROBLEMA: "Error al registrar" pero sí guarda
SOLUCIÓN:
  Ya está corregido en tech.js y admin.js
  Despliega los archivos actualizados a producción
*/

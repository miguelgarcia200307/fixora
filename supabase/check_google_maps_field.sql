-- =====================================================
-- VERIFICAR: Campos de ubicación mejorados en shops
-- =====================================================

-- 1. Verificar si los campos existen
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'shops' 
  AND column_name IN ('google_maps_url', 'country', 'state', 'country_code', 'neighborhood', 'city', 'address')
ORDER BY column_name;

-- Si la consulta anterior NO devuelve 'google_maps_url' o 'neighborhood',
-- los campos NO existen y necesitas ejecutar: add_enhanced_shop_location.sql

-- =====================================================

-- 2. Ver los datos actuales de tu local
SELECT 
    id,
    name,
    address,
    neighborhood,
    city,
    state,
    country,
    google_maps_url,
    country_code
FROM shops
WHERE is_deleted = false
ORDER BY name;

-- Resultado esperado:
-- neighborhood: Nombre del barrio o sector
-- google_maps_url: URL completa de Google Maps
-- Si son NULL, no aparecerán en los mensajes de WhatsApp

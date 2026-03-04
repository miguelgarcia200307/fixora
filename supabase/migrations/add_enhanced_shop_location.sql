-- =====================================================
-- Add enhanced location fields to shops table
-- =====================================================

-- Add new location fields
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS country VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(100),
ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(150),
ADD COLUMN IF NOT EXISTS country_code VARCHAR(5) DEFAULT '+1',
ADD COLUMN IF NOT EXISTS google_maps_url TEXT;

-- Update existing shops to have default country code
UPDATE shops 
SET country_code = '+1', 
    country = 'United States'
WHERE country_code IS NULL;

-- Add comment for clarity
COMMENT ON COLUMN shops.country IS 'País del local';
COMMENT ON COLUMN shops.state IS 'Estado/Departamento del local';
COMMENT ON COLUMN shops.neighborhood IS 'Barrio/Sector del local';
COMMENT ON COLUMN shops.country_code IS 'Código de país para teléfono (ej: +1, +57)';
COMMENT ON COLUMN shops.google_maps_url IS 'URL de Google Maps del local (opcional)';
COMMENT ON COLUMN shops.city IS 'Ciudad del local';
COMMENT ON COLUMN shops.address IS 'Dirección detallada (calle, número, local)';

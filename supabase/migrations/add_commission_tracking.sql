-- =====================================================
-- MIGRATION: Add Commission Tracking to Repairs
-- =====================================================
-- Agrega campos para rastrear el pago de comisiones
-- Fecha: 2026-03-03

-- Agregar columnas para rastrear pagos de comisión
ALTER TABLE repairs
ADD COLUMN IF NOT EXISTS commission_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS commission_paid_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS commission_paid_by UUID REFERENCES auth.users(id);

-- Crear índice para búsquedas de comisiones pendientes
CREATE INDEX IF NOT EXISTS idx_repairs_commission_paid 
ON repairs(shop_id, commission_paid) 
WHERE is_deleted = false AND status = 'delivered';

-- Comentarios
COMMENT ON COLUMN repairs.commission_paid IS 'Indica si la comisión del técnico ya fue pagada';
COMMENT ON COLUMN repairs.commission_paid_date IS 'Fecha en que se pagó la comisión';
COMMENT ON COLUMN repairs.commission_paid_by IS 'Usuario que marcó la comisión como pagada';

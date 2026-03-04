-- =====================================================
-- MEJORA FINANCIERA: Sistema de Abonos/Pagos Parciales
-- CORRECCIÓN: Agregar columna device_password faltante
-- Ejecuta este archivo en SQL Editor de Supabase
-- =====================================================

-- =====================================================
-- CORRECCIÓN CRÍTICA: Agregar columna device_password
-- =====================================================
-- Esta columna es ESENCIAL para que el técnico pueda 
-- acceder al dispositivo durante la reparación

ALTER TABLE repairs 
ADD COLUMN IF NOT EXISTS device_password VARCHAR(100);

COMMENT ON COLUMN repairs.device_password IS 'PIN, contraseña o patrón de bloqueo del dispositivo';

-- =====================================================
-- Agregar campos de abonos a la tabla repairs
-- =====================================================

ALTER TABLE repairs 
ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_paid DECIMAL(12,2) DEFAULT 0;

-- Comentarios para documentación
COMMENT ON COLUMN repairs.deposit_amount IS 'Abono inicial o suma de abonos realizados';
COMMENT ON COLUMN repairs.remaining_balance IS 'Saldo pendiente de pago (calculado)';
COMMENT ON COLUMN repairs.total_paid IS 'Total pagado hasta el momento';

-- =====================================================
-- FUNCIÓN: Calcular saldo pendiente automáticamente
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_remaining_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Si hay cotización, calcular saldo pendiente
    IF NEW.quote_amount IS NOT NULL THEN
        NEW.remaining_balance := COALESCE(NEW.quote_amount, 0) - COALESCE(NEW.deposit_amount, 0);
        
        -- Asegurar que no sea negativo
        IF NEW.remaining_balance < 0 THEN
            NEW.remaining_balance := 0;
        END IF;
    ELSE
        NEW.remaining_balance := 0;
    END IF;
    
    -- Total pagado es el abono por ahora (al finalizar se suma el pago final)
    NEW.total_paid := COALESCE(NEW.deposit_amount, 0);
    
    -- Si está delivered y hay final_amount, ajustar total_paid
    IF NEW.status = 'delivered' AND NEW.final_amount IS NOT NULL THEN
        NEW.total_paid := COALESCE(NEW.final_amount, 0);
        NEW.remaining_balance := 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para calcular automáticamente
DROP TRIGGER IF EXISTS trigger_calculate_remaining_balance ON repairs;
CREATE TRIGGER trigger_calculate_remaining_balance
    BEFORE INSERT OR UPDATE OF quote_amount, deposit_amount, final_amount, status
    ON repairs
    FOR EACH ROW
    EXECUTE FUNCTION calculate_remaining_balance();

-- =====================================================
-- FUNCIÓN: Agregar abono a una reparación
-- =====================================================

CREATE OR REPLACE FUNCTION add_deposit(
    p_repair_id UUID,
    p_deposit_amount DECIMAL(12,2)
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    new_deposit_amount DECIMAL(12,2),
    new_remaining_balance DECIMAL(12,2)
) AS $$
DECLARE
    v_current_deposit DECIMAL(12,2);
    v_quote_amount DECIMAL(12,2);
BEGIN
    -- Obtener datos actuales
    SELECT deposit_amount, quote_amount
    INTO v_current_deposit, v_quote_amount
    FROM repairs
    WHERE id = p_repair_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Reparación no encontrada', 0::DECIMAL(12,2), 0::DECIMAL(12,2);
        RETURN;
    END IF;
    
    -- Validar que hay cotización
    IF v_quote_amount IS NULL OR v_quote_amount = 0 THEN
        RETURN QUERY SELECT false, 'Debe existir una cotización antes de agregar abonos', 0::DECIMAL(12,2), 0::DECIMAL(12,2);
        RETURN;
    END IF;
    
    -- Validar que el abono no exceda la cotización
    IF (COALESCE(v_current_deposit, 0) + p_deposit_amount) > v_quote_amount THEN
        RETURN QUERY SELECT false, 'El abono total no puede exceder el monto cotizado', 0::DECIMAL(12,2), 0::DECIMAL(12,2);
        RETURN;
    END IF;
    
    -- Actualizar abono
    UPDATE repairs
    SET deposit_amount = COALESCE(deposit_amount, 0) + p_deposit_amount,
        updated_at = NOW()
    WHERE id = p_repair_id;
    
    -- Retornar datos actualizados
    RETURN QUERY
    SELECT 
        true,
        'Abono agregado exitosamente'::TEXT,
        deposit_amount,
        remaining_balance
    FROM repairs
    WHERE id = p_repair_id;
END;
$$ LANGUAGE plpgsql;

-- Dar permisos
GRANT EXECUTE ON FUNCTION add_deposit(UUID, DECIMAL) TO authenticated;

-- =====================================================
-- FUNCIÓN: Actualizar stats de shop (incluir abonos)
-- =====================================================

CREATE OR REPLACE FUNCTION get_shop_financial_stats(p_shop_id UUID, p_date_range VARCHAR DEFAULT 'month')
RETURNS TABLE(
    total_repairs INTEGER,
    active_repairs INTEGER,
    completed_repairs INTEGER,
    total_revenue DECIMAL(12,2),
    total_deposits DECIMAL(12,2),
    total_pending_balance DECIMAL(12,2),
    total_cost DECIMAL(12,2),
    total_profit DECIMAL(12,2),
    avg_repair_value DECIMAL(12,2)
) AS $$
DECLARE
    v_date_from TIMESTAMPTZ;
BEGIN
    -- Calcular fecha desde
    CASE p_date_range
        WHEN 'today' THEN
            v_date_from := CURRENT_DATE;
        WHEN 'week' THEN
            v_date_from := CURRENT_DATE - INTERVAL '7 days';
        WHEN 'month' THEN
            v_date_from := DATE_TRUNC('month', CURRENT_DATE);
        WHEN 'year' THEN
            v_date_from := DATE_TRUNC('year', CURRENT_DATE);
        ELSE
            v_date_from := DATE_TRUNC('month', CURRENT_DATE);
    END CASE;
    
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_repairs,
        COUNT(*) FILTER (WHERE status NOT IN ('delivered', 'cancelled'))::INTEGER as active_repairs,
        COUNT(*) FILTER (WHERE status = 'delivered')::INTEGER as completed_repairs,
        COALESCE(SUM(final_amount) FILTER (WHERE status = 'delivered'), 0) as total_revenue,
        COALESCE(SUM(deposit_amount), 0) as total_deposits,
        COALESCE(SUM(remaining_balance) FILTER (WHERE status NOT IN ('delivered', 'cancelled')), 0) as total_pending_balance,
        COALESCE(SUM(total_cost) FILTER (WHERE status = 'delivered'), 0) as total_cost,
        COALESCE(SUM(total_profit) FILTER (WHERE status = 'delivered'), 0) as total_profit,
        COALESCE(AVG(final_amount) FILTER (WHERE status = 'delivered'), 0) as avg_repair_value
    FROM repairs
    WHERE shop_id = p_shop_id
        AND is_deleted = false
        AND intake_date >= v_date_from;
END;
$$ LANGUAGE plpgsql;

-- Dar permisos
GRANT EXECUTE ON FUNCTION get_shop_financial_stats(UUID, VARCHAR) TO authenticated;

-- =====================================================
-- ACTUALIZAR vista de estadísticas existente
-- =====================================================

-- Eliminar función antigua si existe
DROP FUNCTION IF EXISTS get_shop_stats(UUID);
DROP FUNCTION IF EXISTS get_tech_stats(UUID);

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- Verificar columna device_password agregada
SELECT 
    column_name, 
    data_type, 
    character_maximum_length,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'repairs' 
AND column_name = 'device_password';

-- Verificar columnas de abonos agregadas
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'repairs' 
AND column_name IN ('deposit_amount', 'remaining_balance', 'total_paid')
ORDER BY column_name;

-- Verificar funciones creadas
SELECT 
    proname as nombre_funcion, 
    pg_get_function_identity_arguments(oid) as argumentos
FROM pg_proc 
WHERE proname IN ('calculate_remaining_balance', 'add_deposit', 'get_shop_financial_stats')
ORDER BY proname;

-- Verificar trigger
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trigger_calculate_remaining_balance';

-- Test: Actualizar reparaciones existentes con valores por defecto
UPDATE repairs
SET deposit_amount = COALESCE(deposit_amount, 0),
    total_paid = COALESCE(total_paid, 0)
WHERE deposit_amount IS NULL OR total_paid IS NULL;

-- Recalcular saldos pendientes para todas las reparaciones existentes
UPDATE repairs
SET remaining_balance = GREATEST(COALESCE(quote_amount, 0) - COALESCE(deposit_amount, 0), 0)
WHERE status NOT IN ('delivered', 'cancelled');

-- Mensaje de éxito
SELECT '✅ Sistema de Abonos y device_password instalados correctamente' as status,
       COUNT(*) as reparaciones_en_sistema,
       COUNT(*) FILTER (WHERE deposit_amount IS NOT NULL) as con_columnas_abono,
       COUNT(*) FILTER (WHERE device_password IS NOT NULL) as con_password_guardado
FROM repairs;

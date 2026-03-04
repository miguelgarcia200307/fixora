-- =====================================================
-- FIX: Funciones RPC para tracking público
-- Ejecuta este archivo en el SQL Editor de Supabase
-- =====================================================

-- Función para obtener stages de una reparación (tracking público)
CREATE OR REPLACE FUNCTION get_stages_by_repair(p_repair_id UUID, p_token VARCHAR)
RETURNS SETOF repair_stages AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM repairs r
        JOIN shops s ON r.shop_id = s.id
        WHERE r.id = p_repair_id
          AND r.tracking_token = p_token
          AND r.is_deleted = false
          AND s.is_active = true
    ) THEN
        RETURN QUERY
        SELECT rs.*
        FROM repair_stages rs
        WHERE rs.repair_id = p_repair_id
          AND rs.is_public = true
        ORDER BY rs.created_at DESC;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener evidencia de una etapa (tracking público)
CREATE OR REPLACE FUNCTION get_stage_evidence_by_stage(p_stage_id UUID, p_token VARCHAR)
RETURNS SETOF stage_evidence AS $$
DECLARE
    v_repair_id UUID;
BEGIN
    -- Obtener repair_id de la etapa
    SELECT repair_id INTO v_repair_id FROM repair_stages WHERE id = p_stage_id;
    
    IF EXISTS (
        SELECT 1 FROM repairs r
        JOIN shops s ON r.shop_id = s.id
        WHERE r.id = v_repair_id
          AND r.tracking_token = p_token
          AND r.is_deleted = false
          AND s.is_active = true
    ) THEN
        RETURN QUERY
        SELECT se.*
        FROM stage_evidence se
        WHERE se.stage_id = p_stage_id
        ORDER BY se.sort_order, se.created_at;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener evidencia de ingreso (tracking público)
CREATE OR REPLACE FUNCTION get_intake_evidence_by_repair(p_repair_id UUID, p_token VARCHAR)
RETURNS SETOF intake_evidence AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM repairs r
        JOIN shops s ON r.shop_id = s.id
        WHERE r.id = p_repair_id
          AND r.tracking_token = p_token
          AND r.is_deleted = false
          AND s.is_active = true
    ) THEN
        RETURN QUERY
        SELECT ie.*
        FROM intake_evidence ie
        WHERE ie.repair_id = p_repair_id
        ORDER BY ie.sort_order, ie.created_at;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dar permisos de ejecución a anon y authenticated
GRANT EXECUTE ON FUNCTION get_intake_evidence_by_repair(UUID, VARCHAR) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_stages_by_repair(UUID, VARCHAR) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_stage_evidence_by_stage(UUID, VARCHAR) TO anon, authenticated;

-- Verificar que las funciones se crearon correctamente
SELECT 'Funciones RPC creadas exitosamente:' as status;
SELECT proname as nombre_funcion, pg_get_function_identity_arguments(oid) as argumentos
FROM pg_proc 
WHERE proname IN ('get_stages_by_repair', 'get_stage_evidence_by_stage', 'get_intake_evidence_by_repair')
ORDER BY proname;

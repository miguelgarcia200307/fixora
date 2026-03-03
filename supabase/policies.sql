-- =====================================================
-- FIXORA - Políticas RLS (Row Level Security)
-- Ejecutar DESPUÉS de schema.sql
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- FUNCIONES HELPER PARA POLÍTICAS
-- =====================================================

-- Obtener rol del usuario actual
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
DECLARE
    v_role user_role;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE id = auth.uid() AND is_active = true AND is_deleted = false;
    
    RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Obtener shop_id del usuario actual
CREATE OR REPLACE FUNCTION get_user_shop_id()
RETURNS UUID AS $$
DECLARE
    v_shop_id UUID;
BEGIN
    SELECT shop_id INTO v_shop_id
    FROM profiles
    WHERE id = auth.uid() AND is_active = true AND is_deleted = false;
    
    RETURN v_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificar si el usuario es superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_user_role() = 'superadmin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificar si el usuario es admin de su shop
CREATE OR REPLACE FUNCTION is_shop_admin(check_shop_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_user_role() = 'admin' AND get_user_shop_id() = check_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificar si el usuario es técnico del shop
CREATE OR REPLACE FUNCTION is_shop_tech(check_shop_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_user_role() = 'tech' AND get_user_shop_id() = check_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificar si el usuario pertenece al shop
CREATE OR REPLACE FUNCTION belongs_to_shop(check_shop_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_user_shop_id() = check_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificar si una reparación está asignada al técnico actual
CREATE OR REPLACE FUNCTION is_repair_assigned_to_me(repair_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_tech_id UUID;
BEGIN
    SELECT tech_id INTO v_tech_id
    FROM repairs
    WHERE id = repair_id;
    
    RETURN v_tech_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- POLÍTICAS: shops
-- =====================================================

-- Superadmin puede ver todos los shops
CREATE POLICY "superadmin_read_all_shops" ON shops
    FOR SELECT
    USING (is_superadmin());

-- Superadmin puede crear shops
CREATE POLICY "superadmin_create_shops" ON shops
    FOR INSERT
    WITH CHECK (is_superadmin());

-- Superadmin puede actualizar todos los shops
CREATE POLICY "superadmin_update_all_shops" ON shops
    FOR UPDATE
    USING (is_superadmin());

-- Admin puede ver su propio shop
CREATE POLICY "admin_read_own_shop" ON shops
    FOR SELECT
    USING (id = get_user_shop_id() AND is_active = true);

-- Admin puede actualizar algunos campos de su shop
CREATE POLICY "admin_update_own_shop" ON shops
    FOR UPDATE
    USING (id = get_user_shop_id() AND get_user_role() = 'admin')
    WITH CHECK (id = get_user_shop_id());

-- Tech puede ver su shop (solo lectura)
CREATE POLICY "tech_read_own_shop" ON shops
    FOR SELECT
    USING (id = get_user_shop_id() AND is_active = true);

-- =====================================================
-- POLÍTICAS: profiles
-- =====================================================

-- Superadmin puede ver todos los perfiles
CREATE POLICY "superadmin_read_all_profiles" ON profiles
    FOR SELECT
    USING (is_superadmin());

-- Superadmin puede crear perfiles
CREATE POLICY "superadmin_create_profiles" ON profiles
    FOR INSERT
    WITH CHECK (is_superadmin());

-- Superadmin puede actualizar todos los perfiles
CREATE POLICY "superadmin_update_all_profiles" ON profiles
    FOR UPDATE
    USING (is_superadmin());

-- Usuario puede ver su propio perfil
CREATE POLICY "user_read_own_profile" ON profiles
    FOR SELECT
    USING (id = auth.uid());

-- Usuario puede actualizar su propio perfil (campos limitados)
CREATE POLICY "user_update_own_profile" ON profiles
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Admin puede ver perfiles de su shop
CREATE POLICY "admin_read_shop_profiles" ON profiles
    FOR SELECT
    USING (shop_id = get_user_shop_id() AND get_user_role() IN ('admin', 'tech'));

-- Admin puede crear técnicos en su shop
CREATE POLICY "admin_create_tech_profiles" ON profiles
    FOR INSERT
    WITH CHECK (
        get_user_role() = 'admin' AND 
        shop_id = get_user_shop_id() AND 
        role = 'tech'
    );

-- Admin puede actualizar técnicos de su shop
CREATE POLICY "admin_update_tech_profiles" ON profiles
    FOR UPDATE
    USING (
        get_user_role() = 'admin' AND 
        shop_id = get_user_shop_id() AND 
        role = 'tech'
    );

-- =====================================================
-- POLÍTICAS: clients
-- =====================================================

-- Superadmin puede ver todos los clientes
CREATE POLICY "superadmin_read_all_clients" ON clients
    FOR SELECT
    USING (is_superadmin());

-- Admin puede CRUD clientes de su shop
CREATE POLICY "admin_all_shop_clients" ON clients
    FOR ALL
    USING (shop_id = get_user_shop_id() AND get_user_role() = 'admin')
    WITH CHECK (shop_id = get_user_shop_id());

-- Tech puede ver clientes de su shop (solo lectura)
CREATE POLICY "tech_read_shop_clients" ON clients
    FOR SELECT
    USING (shop_id = get_user_shop_id() AND get_user_role() = 'tech');

-- =====================================================
-- POLÍTICAS: repairs
-- =====================================================

-- Superadmin puede ver todas las reparaciones
CREATE POLICY "superadmin_read_all_repairs" ON repairs
    FOR SELECT
    USING (is_superadmin());

-- Admin puede CRUD reparaciones de su shop
CREATE POLICY "admin_all_shop_repairs" ON repairs
    FOR ALL
    USING (shop_id = get_user_shop_id() AND get_user_role() = 'admin')
    WITH CHECK (shop_id = get_user_shop_id());

-- Tech puede ver reparaciones de su shop
CREATE POLICY "tech_read_shop_repairs" ON repairs
    FOR SELECT
    USING (shop_id = get_user_shop_id() AND get_user_role() = 'tech');

-- Tech puede actualizar reparaciones asignadas a él
CREATE POLICY "tech_update_assigned_repairs" ON repairs
    FOR UPDATE
    USING (
        get_user_role() = 'tech' AND 
        shop_id = get_user_shop_id() AND 
        tech_id = auth.uid()
    )
    WITH CHECK (
        shop_id = get_user_shop_id() AND 
        tech_id = auth.uid()
    );

-- Política para tracking público (anónimo) - usando función separada
CREATE OR REPLACE FUNCTION get_repair_by_tracking_token(p_token VARCHAR)
RETURNS SETOF repairs AS $$
BEGIN
    RETURN QUERY
    SELECT r.*
    FROM repairs r
    JOIN shops s ON r.shop_id = s.id
    WHERE r.tracking_token = p_token
      AND r.is_deleted = false
      AND s.is_active = true
      AND s.is_deleted = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para tracking público por código de reparación
CREATE OR REPLACE FUNCTION get_repair_by_code(p_code VARCHAR)
RETURNS SETOF repairs AS $$
BEGIN
    RETURN QUERY
    SELECT r.*
    FROM repairs r
    JOIN shops s ON r.shop_id = s.id
    WHERE r.code = p_code
      AND r.is_deleted = false
      AND s.is_active = true
      AND s.is_deleted = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- POLÍTICAS: intake_evidence
-- =====================================================

-- Superadmin puede ver toda la evidencia
CREATE POLICY "superadmin_read_all_intake_evidence" ON intake_evidence
    FOR SELECT
    USING (is_superadmin());

-- Admin puede CRUD evidencia de reparaciones de su shop
CREATE POLICY "admin_all_shop_intake_evidence" ON intake_evidence
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM repairs r 
            WHERE r.id = intake_evidence.repair_id 
            AND r.shop_id = get_user_shop_id()
        ) AND get_user_role() = 'admin'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM repairs r 
            WHERE r.id = intake_evidence.repair_id 
            AND r.shop_id = get_user_shop_id()
        )
    );

-- Tech puede ver evidencia de reparaciones de su shop
CREATE POLICY "tech_read_shop_intake_evidence" ON intake_evidence
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM repairs r 
            WHERE r.id = intake_evidence.repair_id 
            AND r.shop_id = get_user_shop_id()
        ) AND get_user_role() = 'tech'
    );

-- Función para tracking público - evidencia de ingreso
CREATE OR REPLACE FUNCTION get_intake_evidence_by_repair(p_repair_id UUID, p_token VARCHAR)
RETURNS SETOF intake_evidence AS $$
BEGIN
    -- Verificar que el token es válido para esa reparación
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

-- =====================================================
-- POLÍTICAS: repair_stages
-- =====================================================

-- Superadmin puede ver todas las etapas
CREATE POLICY "superadmin_read_all_stages" ON repair_stages
    FOR SELECT
    USING (is_superadmin());

-- Admin puede CRUD etapas de reparaciones de su shop
CREATE POLICY "admin_all_shop_stages" ON repair_stages
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM repairs r 
            WHERE r.id = repair_stages.repair_id 
            AND r.shop_id = get_user_shop_id()
        ) AND get_user_role() = 'admin'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM repairs r 
            WHERE r.id = repair_stages.repair_id 
            AND r.shop_id = get_user_shop_id()
        )
    );

-- Tech puede ver etapas de reparaciones de su shop
CREATE POLICY "tech_read_shop_stages" ON repair_stages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM repairs r 
            WHERE r.id = repair_stages.repair_id 
            AND r.shop_id = get_user_shop_id()
        ) AND get_user_role() = 'tech'
    );

-- Tech puede crear etapas en reparaciones asignadas
CREATE POLICY "tech_create_assigned_stages" ON repair_stages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM repairs r 
            WHERE r.id = repair_stages.repair_id 
            AND r.tech_id = auth.uid()
            AND r.shop_id = get_user_shop_id()
        ) AND get_user_role() = 'tech'
    );

-- Función para tracking público - etapas
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

-- =====================================================
-- POLÍTICAS: stage_evidence
-- =====================================================

-- Superadmin puede ver toda la evidencia de etapas
CREATE POLICY "superadmin_read_all_stage_evidence" ON stage_evidence
    FOR SELECT
    USING (is_superadmin());

-- Admin puede CRUD evidencia de etapas de su shop
CREATE POLICY "admin_all_shop_stage_evidence" ON stage_evidence
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM repair_stages rs
            JOIN repairs r ON rs.repair_id = r.id
            WHERE rs.id = stage_evidence.stage_id 
            AND r.shop_id = get_user_shop_id()
        ) AND get_user_role() = 'admin'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM repair_stages rs
            JOIN repairs r ON rs.repair_id = r.id
            WHERE rs.id = stage_evidence.stage_id 
            AND r.shop_id = get_user_shop_id()
        )
    );

-- Tech puede ver evidencia de etapas de su shop
CREATE POLICY "tech_read_shop_stage_evidence" ON stage_evidence
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM repair_stages rs
            JOIN repairs r ON rs.repair_id = r.id
            WHERE rs.id = stage_evidence.stage_id 
            AND r.shop_id = get_user_shop_id()
        ) AND get_user_role() = 'tech'
    );

-- Tech puede crear evidencia en etapas de reparaciones asignadas
CREATE POLICY "tech_create_assigned_stage_evidence" ON stage_evidence
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM repair_stages rs
            JOIN repairs r ON rs.repair_id = r.id
            WHERE rs.id = stage_evidence.stage_id 
            AND r.tech_id = auth.uid()
            AND r.shop_id = get_user_shop_id()
        ) AND get_user_role() = 'tech'
    );

-- Función para tracking público - evidencia de etapas
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

-- =====================================================
-- POLÍTICAS: notifications_log
-- =====================================================

-- Superadmin puede ver todo el log
CREATE POLICY "superadmin_read_all_notifications" ON notifications_log
    FOR SELECT
    USING (is_superadmin());

-- Admin puede CRUD log de su shop
CREATE POLICY "admin_all_shop_notifications" ON notifications_log
    FOR ALL
    USING (shop_id = get_user_shop_id() AND get_user_role() = 'admin')
    WITH CHECK (shop_id = get_user_shop_id());

-- Tech puede crear y ver log de su shop
CREATE POLICY "tech_read_create_shop_notifications" ON notifications_log
    FOR SELECT
    USING (shop_id = get_user_shop_id() AND get_user_role() = 'tech');

CREATE POLICY "tech_create_shop_notifications" ON notifications_log
    FOR INSERT
    WITH CHECK (shop_id = get_user_shop_id() AND get_user_role() = 'tech');

-- =====================================================
-- POLÍTICAS STORAGE (ejecutar en Dashboard > Storage > Policies)
-- =====================================================

/*
Para bucket: intake-evidence
1. SELECT: authenticated users can read files from their shop
2. INSERT: authenticated users can upload to their shop folder
3. DELETE: admin can delete from their shop folder

Para bucket: stage-evidence
1. SELECT: authenticated users can read files from their shop
2. INSERT: authenticated users can upload to their shop folder
3. DELETE: admin can delete from their shop folder

Para bucket: shop-logos
1. SELECT: anyone can read (public)
2. INSERT: admin and superadmin can upload
3. DELETE: admin and superadmin can delete

-- Estructura de carpetas sugerida:
-- intake-evidence/{shop_id}/{repair_id}/{filename}
-- stage-evidence/{shop_id}/{repair_id}/{stage_id}/{filename}
-- shop-logos/{shop_id}/{filename}

-- Políticas de Storage (copiar en Supabase Dashboard):

-- intake-evidence bucket policies:

-- SELECT policy for intake-evidence
CREATE POLICY "Users can view intake evidence from their shop"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'intake-evidence' AND
    (
        is_superadmin() OR
        (storage.foldername(name))[1] = get_user_shop_id()::text
    )
);

-- INSERT policy for intake-evidence
CREATE POLICY "Users can upload intake evidence to their shop"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'intake-evidence' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_shop_id()::text
);

-- DELETE policy for intake-evidence
CREATE POLICY "Admin can delete intake evidence from their shop"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'intake-evidence' AND
    (
        is_superadmin() OR
        (get_user_role() = 'admin' AND (storage.foldername(name))[1] = get_user_shop_id()::text)
    )
);

-- stage-evidence bucket policies:

CREATE POLICY "Users can view stage evidence from their shop"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'stage-evidence' AND
    (
        is_superadmin() OR
        (storage.foldername(name))[1] = get_user_shop_id()::text
    )
);

CREATE POLICY "Users can upload stage evidence to their shop"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'stage-evidence' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_shop_id()::text
);

CREATE POLICY "Admin can delete stage evidence from their shop"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'stage-evidence' AND
    (
        is_superadmin() OR
        (get_user_role() = 'admin' AND (storage.foldername(name))[1] = get_user_shop_id()::text)
    )
);

-- shop-logos bucket policies:

CREATE POLICY "Anyone can view shop logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'shop-logos');

CREATE POLICY "Admin can upload shop logo"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'shop-logos' AND
    auth.role() = 'authenticated' AND
    (
        is_superadmin() OR
        (get_user_role() = 'admin' AND (storage.foldername(name))[1] = get_user_shop_id()::text)
    )
);

CREATE POLICY "Admin can delete shop logo"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'shop-logos' AND
    (
        is_superadmin() OR
        (get_user_role() = 'admin' AND (storage.foldername(name))[1] = get_user_shop_id()::text)
    )
);

*/

-- =====================================================
-- REALTIME
-- =====================================================

-- Habilitar Realtime para las tablas necesarias
-- Ejecutar en Supabase Dashboard > Database > Replication

ALTER PUBLICATION supabase_realtime ADD TABLE repairs;
ALTER PUBLICATION supabase_realtime ADD TABLE repair_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE stage_evidence;

-- =====================================================
-- GRANTS ADICIONALES
-- =====================================================

-- Permitir que las funciones SECURITY DEFINER sean ejecutables
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_shop_id() TO authenticated;
GRANT EXECUTE ON FUNCTION is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_shop_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_shop_tech(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION belongs_to_shop(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_repair_assigned_to_me(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_repair_by_tracking_token(VARCHAR) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_intake_evidence_by_repair(UUID, VARCHAR) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_stages_by_repair(UUID, VARCHAR) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_stage_evidence_by_stage(UUID, VARCHAR) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_repair_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_tracking_token() TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_tech_commission(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION is_shop_active(UUID) TO anon, authenticated;

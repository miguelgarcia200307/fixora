-- =====================================================
-- FIXORA - Schema de Base de Datos
-- Sistema de Gestión de Talleres de Reparación
-- =====================================================
-- Ejecutar en Supabase SQL Editor en orden

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TIPOS ENUM
-- =====================================================

-- Roles de usuario
CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'tech');

-- Estados de reparación
CREATE TYPE repair_status AS ENUM (
    'pending',        -- Pendiente de asignación
    'assigned',       -- Asignado a técnico
    'in_progress',    -- En proceso
    'waiting_parts',  -- Esperando repuestos
    'ready',          -- Listo para entrega
    'delivered',      -- Entregado
    'cancelled'       -- Cancelado
);

-- Estados de cotización
CREATE TYPE quote_status AS ENUM (
    'pending',        -- Pendiente
    'approximate',    -- Aproximada (puede variar)
    'accepted',       -- Aceptada
    'rejected'        -- Rechazada
);

-- Categorías de dispositivos
CREATE TYPE device_category AS ENUM (
    'cellphone',
    'tablet',
    'console',
    'pc',
    'laptop',
    'smartwatch',
    'other'
);

-- Estados de suscripción
CREATE TYPE subscription_status AS ENUM (
    'active',
    'trial',
    'expired',
    'cancelled'
);

-- Planes de suscripción
CREATE TYPE subscription_plan AS ENUM (
    'free',
    'pro',
    'premium'
);

-- =====================================================
-- TABLA: shops (Locales/Talleres)
-- =====================================================

CREATE TABLE shops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,                          -- Nombre comercial
    slug VARCHAR(100) UNIQUE,                            -- Slug único para URLs
    city VARCHAR(100),
    address TEXT,
    phone VARCHAR(50),
    whatsapp VARCHAR(50),                                -- WhatsApp del local
    email VARCHAR(255),
    logo_url TEXT,                                       -- URL del logo en Storage
    
    -- Configuración del local
    default_tech_commission DECIMAL(5,2) DEFAULT 30.00,  -- % comisión técnico por defecto
    
    -- Plantillas de mensajes WhatsApp personalizadas (JSON)
    whatsapp_templates JSONB DEFAULT '{}',
    
    -- Suscripción
    subscription_plan subscription_plan DEFAULT 'free',
    subscription_status subscription_status DEFAULT 'trial',
    subscription_start_date TIMESTAMPTZ,
    subscription_end_date TIMESTAMPTZ,
    subscription_notes TEXT,
    
    -- Estados
    is_active BOOLEAN DEFAULT true,                      -- Si está activo (puede operar)
    is_deleted BOOLEAN DEFAULT false,                    -- Soft delete
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Índices
CREATE INDEX idx_shops_slug ON shops(slug);
CREATE INDEX idx_shops_active ON shops(is_active) WHERE is_deleted = false;
CREATE INDEX idx_shops_subscription ON shops(subscription_status, subscription_end_date);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_shops_updated_at
    BEFORE UPDATE ON shops
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: profiles (Perfiles de usuarios)
-- =====================================================

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
    
    role user_role NOT NULL DEFAULT 'tech',
    
    -- Datos personales
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    whatsapp VARCHAR(50),
    avatar_url TEXT,
    
    -- Configuración técnico
    commission_percentage DECIMAL(5,2),                  -- % comisión (null = usar default del local)
    
    -- Estados
    is_active BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX idx_profiles_shop ON profiles(shop_id) WHERE is_deleted = false;
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_active ON profiles(is_active) WHERE is_deleted = false;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: clients (Clientes)
-- =====================================================

CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    
    -- Datos del cliente
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,                          -- Obligatorio
    whatsapp VARCHAR(50),                                -- WhatsApp (puede ser diferente)
    email VARCHAR(255),                                  -- Opcional
    address TEXT,                                        -- Opcional
    
    -- Notas internas
    notes TEXT,
    
    -- Estados
    is_deleted BOOLEAN DEFAULT false,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Índices
CREATE INDEX idx_clients_shop ON clients(shop_id) WHERE is_deleted = false;
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_clients_name ON clients(name);

CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: repairs (Reparaciones)
-- =====================================================

CREATE TABLE repairs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    tech_id UUID REFERENCES profiles(id) ON DELETE SET NULL,           -- Técnico asignado
    
    -- Código único de reparación (humano-legible)
    code VARCHAR(20) NOT NULL,
    
    -- Token de tracking público (largo y seguro)
    tracking_token VARCHAR(48) NOT NULL UNIQUE,
    
    -- Datos del equipo
    device_category device_category NOT NULL,
    device_brand VARCHAR(100),
    device_model VARCHAR(100),
    device_color VARCHAR(50),
    device_imei VARCHAR(50),                             -- IMEI o Serial
    device_accessories JSONB DEFAULT '[]',               -- Array de accesorios
    
    -- Motivo de ingreso
    intake_reason TEXT NOT NULL,
    intake_notes TEXT,
    
    -- Cotización
    quote_status quote_status DEFAULT 'pending',
    quote_amount DECIMAL(12,2),                          -- Monto cotizado (COP)
    quote_notes TEXT,
    
    -- Finanzas finales
    final_amount DECIMAL(12,2),                          -- Monto final cobrado
    total_cost DECIMAL(12,2) DEFAULT 0,                  -- Costo total de repuestos
    total_profit DECIMAL(12,2),                          -- Ganancia neta
    tech_commission DECIMAL(12,2),                       -- Comisión del técnico
    
    -- Estado
    status repair_status DEFAULT 'pending',
    
    -- Fechas importantes
    intake_date TIMESTAMPTZ DEFAULT NOW(),
    assigned_date TIMESTAMPTZ,
    completed_date TIMESTAMPTZ,
    delivered_date TIMESTAMPTZ,
    
    -- Prioridad (1-5, siendo 1 la más alta)
    priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
    
    -- Estados
    is_deleted BOOLEAN DEFAULT false,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Índices
CREATE INDEX idx_repairs_shop ON repairs(shop_id) WHERE is_deleted = false;
CREATE INDEX idx_repairs_client ON repairs(client_id);
CREATE INDEX idx_repairs_tech ON repairs(tech_id);
CREATE INDEX idx_repairs_code ON repairs(code);
CREATE INDEX idx_repairs_tracking ON repairs(tracking_token);
CREATE INDEX idx_repairs_status ON repairs(status) WHERE is_deleted = false;
CREATE INDEX idx_repairs_intake_date ON repairs(intake_date DESC);
CREATE INDEX idx_repairs_shop_status ON repairs(shop_id, status) WHERE is_deleted = false;

CREATE TRIGGER update_repairs_updated_at
    BEFORE UPDATE ON repairs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Función para generar código de reparación
CREATE OR REPLACE FUNCTION generate_repair_code(p_shop_id UUID)
RETURNS VARCHAR(20) AS $$
DECLARE
    v_prefix VARCHAR(10);
    v_count INTEGER;
    v_code VARCHAR(20);
BEGIN
    -- Obtener las primeras 3 letras del nombre del local o usar 'FIX'
    SELECT UPPER(SUBSTRING(COALESCE(slug, 'FIX') FROM 1 FOR 3))
    INTO v_prefix
    FROM shops WHERE id = p_shop_id;
    
    v_prefix := COALESCE(v_prefix, 'FIX');
    
    -- Contar reparaciones del local + 1
    SELECT COUNT(*) + 1 INTO v_count
    FROM repairs WHERE shop_id = p_shop_id;
    
    -- Formato: PREFIX-YYYYMMDD-NNNN
    v_code := v_prefix || '-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(v_count::TEXT, 4, '0');
    
    RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Función para generar token de tracking seguro
CREATE OR REPLACE FUNCTION generate_tracking_token()
RETURNS VARCHAR(48) AS $$
BEGIN
    RETURN encode(gen_random_bytes(24), 'hex');
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TABLA: intake_evidence (Evidencias de ingreso)
-- =====================================================

CREATE TABLE intake_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repair_id UUID NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
    
    -- Archivo
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(50),
    file_size INTEGER,
    
    -- Metadatos
    evidence_type VARCHAR(50),                           -- frontal, trasera, lateral, daño, otro
    description TEXT,
    
    -- Orden de visualización
    sort_order INTEGER DEFAULT 0,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_intake_evidence_repair ON intake_evidence(repair_id);

-- =====================================================
-- TABLA: repair_stages (Etapas de reparación)
-- =====================================================

CREATE TABLE repair_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repair_id UUID NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
    
    -- Tipo de etapa
    stage_type VARCHAR(50) NOT NULL,                     -- ID del tipo predefinido o 'other'
    stage_name VARCHAR(255) NOT NULL,                    -- Nombre visible
    
    -- Descripción
    description TEXT,
    
    -- Finanzas de esta etapa
    cost_amount DECIMAL(12,2) DEFAULT 0,                 -- Costo de repuestos
    charge_amount DECIMAL(12,2) DEFAULT 0,               -- Monto cobrado
    
    -- Visibilidad pública (para tracking del cliente)
    is_public BOOLEAN DEFAULT true,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_repair_stages_repair ON repair_stages(repair_id);
CREATE INDEX idx_repair_stages_created ON repair_stages(created_at DESC);

-- =====================================================
-- TABLA: stage_evidence (Evidencias por etapa)
-- =====================================================

CREATE TABLE stage_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stage_id UUID NOT NULL REFERENCES repair_stages(id) ON DELETE CASCADE,
    
    -- Archivo
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(50),
    file_size INTEGER,
    
    -- Metadatos
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_stage_evidence_stage ON stage_evidence(stage_id);

-- =====================================================
-- TABLA: notifications_log (Log de notificaciones)
-- =====================================================

CREATE TABLE notifications_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    repair_id UUID REFERENCES repairs(id) ON DELETE SET NULL,
    
    -- Tipo de notificación
    notification_type VARCHAR(50) NOT NULL,              -- whatsapp_client, whatsapp_tech, whatsapp_admin
    recipient_phone VARCHAR(50),
    recipient_name VARCHAR(255),
    
    -- Contenido
    message TEXT NOT NULL,
    
    -- Estado (para future referencia, no verifica delivery real)
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    sent_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_notifications_shop ON notifications_log(shop_id);
CREATE INDEX idx_notifications_repair ON notifications_log(repair_id);

-- =====================================================
-- VISTAS
-- =====================================================

-- Vista para stats de reparaciones por shop
CREATE OR REPLACE VIEW repair_stats AS
SELECT 
    shop_id,
    COUNT(*) FILTER (WHERE status NOT IN ('delivered', 'cancelled') AND is_deleted = false) as active_repairs,
    COUNT(*) FILTER (WHERE status = 'pending' AND is_deleted = false) as pending_repairs,
    COUNT(*) FILTER (WHERE quote_status = 'pending' AND is_deleted = false) as pending_quotes,
    COUNT(*) FILTER (WHERE status = 'delivered' AND is_deleted = false) as delivered_repairs,
    COUNT(*) FILTER (WHERE status = 'delivered' AND delivered_date >= CURRENT_DATE AND is_deleted = false) as delivered_today,
    COUNT(*) FILTER (WHERE status = 'delivered' AND delivered_date >= CURRENT_DATE - INTERVAL '7 days' AND is_deleted = false) as delivered_week,
    COUNT(*) FILTER (WHERE status = 'delivered' AND delivered_date >= DATE_TRUNC('month', CURRENT_DATE) AND is_deleted = false) as delivered_month,
    COALESCE(SUM(final_amount) FILTER (WHERE status = 'delivered' AND is_deleted = false), 0) as total_revenue,
    COALESCE(SUM(total_profit) FILTER (WHERE status = 'delivered' AND is_deleted = false), 0) as total_profit
FROM repairs
GROUP BY shop_id;

-- Vista para stats de técnico
CREATE OR REPLACE VIEW tech_stats AS
SELECT 
    r.tech_id,
    r.shop_id,
    COUNT(*) FILTER (WHERE r.status NOT IN ('delivered', 'cancelled') AND r.is_deleted = false) as active_repairs,
    COUNT(*) FILTER (WHERE r.status = 'delivered' AND r.is_deleted = false) as completed_repairs,
    COALESCE(SUM(r.final_amount) FILTER (WHERE r.status = 'delivered' AND r.is_deleted = false), 0) as total_charged,
    COALESCE(SUM(r.total_cost) FILTER (WHERE r.status = 'delivered' AND r.is_deleted = false), 0) as total_costs,
    COALESCE(SUM(r.total_profit) FILTER (WHERE r.status = 'delivered' AND r.is_deleted = false), 0) as total_profit,
    COALESCE(SUM(r.tech_commission) FILTER (WHERE r.status = 'delivered' AND r.is_deleted = false), 0) as total_commission
FROM repairs r
WHERE r.tech_id IS NOT NULL
GROUP BY r.tech_id, r.shop_id;

-- =====================================================
-- FUNCIONES ÚTILES
-- =====================================================

-- Función para calcular comisión del técnico
CREATE OR REPLACE FUNCTION calculate_tech_commission(
    p_repair_id UUID,
    p_profit DECIMAL(12,2)
)
RETURNS DECIMAL(12,2) AS $$
DECLARE
    v_commission_pct DECIMAL(5,2);
    v_shop_default DECIMAL(5,2);
BEGIN
    -- Obtener porcentaje del técnico o usar default del local
    SELECT 
        COALESCE(p.commission_percentage, s.default_tech_commission),
        s.default_tech_commission
    INTO v_commission_pct, v_shop_default
    FROM repairs r
    JOIN profiles p ON r.tech_id = p.id
    JOIN shops s ON r.shop_id = s.id
    WHERE r.id = p_repair_id;
    
    v_commission_pct := COALESCE(v_commission_pct, v_shop_default, 30);
    
    RETURN ROUND(p_profit * (v_commission_pct / 100), 2);
END;
$$ LANGUAGE plpgsql;

-- Función para verificar si un local está activo
CREATE OR REPLACE FUNCTION is_shop_active(p_shop_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_active BOOLEAN;
    v_sub_status subscription_status;
    v_sub_end TIMESTAMPTZ;
BEGIN
    SELECT is_active, subscription_status, subscription_end_date
    INTO v_is_active, v_sub_status, v_sub_end
    FROM shops
    WHERE id = p_shop_id AND is_deleted = false;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Verificar que esté activo y la suscripción no haya expirado
    IF NOT v_is_active THEN
        RETURN false;
    END IF;
    
    IF v_sub_status = 'cancelled' THEN
        RETURN false;
    END IF;
    
    IF v_sub_status = 'expired' OR (v_sub_end IS NOT NULL AND v_sub_end < NOW()) THEN
        RETURN false;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================
-- Ejecutar en la sección Storage de Supabase o vía API

-- Nota: Los buckets deben crearse manualmente en Supabase Dashboard
-- o usando la API de Storage:
-- - intake-evidence (para fotos de ingreso)
-- - stage-evidence (para fotos de etapas)
-- - shop-logos (para logos de locales)

-- =====================================================
-- TRIGGERS PARA ACTUALIZACIÓN AUTOMÁTICA
-- =====================================================

-- Trigger para actualizar totales de reparación cuando se agregan etapas
CREATE OR REPLACE FUNCTION update_repair_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE repairs
    SET 
        total_cost = (
            SELECT COALESCE(SUM(cost_amount), 0) 
            FROM repair_stages 
            WHERE repair_id = NEW.repair_id
        ),
        updated_at = NOW()
    WHERE id = NEW.repair_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_repair_totals
    AFTER INSERT OR UPDATE ON repair_stages
    FOR EACH ROW
    EXECUTE FUNCTION update_repair_totals();

-- Trigger para auto-generar código y token al crear reparación
CREATE OR REPLACE FUNCTION auto_generate_repair_identifiers()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.code IS NULL OR NEW.code = '' THEN
        NEW.code := generate_repair_code(NEW.shop_id);
    END IF;
    
    IF NEW.tracking_token IS NULL OR NEW.tracking_token = '' THEN
        NEW.tracking_token := generate_tracking_token();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_repair_identifiers
    BEFORE INSERT ON repairs
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_repair_identifiers();

-- Trigger para actualizar fecha de asignación
CREATE OR REPLACE FUNCTION update_repair_assignment_date()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.tech_id IS NULL AND NEW.tech_id IS NOT NULL THEN
        NEW.assigned_date := NOW();
        IF NEW.status = 'pending' THEN
            NEW.status := 'assigned';
        END IF;
    END IF;
    
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
        NEW.delivered_date := NOW();
    END IF;
    
    IF NEW.status IN ('ready', 'delivered') AND OLD.status NOT IN ('ready', 'delivered') THEN
        IF NEW.completed_date IS NULL THEN
            NEW.completed_date := NOW();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_repair_dates
    BEFORE UPDATE ON repairs
    FOR EACH ROW
    EXECUTE FUNCTION update_repair_assignment_date();

-- =====================================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- =====================================================

COMMENT ON TABLE shops IS 'Locales/talleres de reparación (multi-tenant)';
COMMENT ON TABLE profiles IS 'Perfiles de usuarios vinculados a Auth';
COMMENT ON TABLE clients IS 'Clientes de cada local';
COMMENT ON TABLE repairs IS 'Reparaciones/órdenes de trabajo';
COMMENT ON TABLE intake_evidence IS 'Fotos de evidencia al momento del ingreso';
COMMENT ON TABLE repair_stages IS 'Etapas/actualizaciones del proceso de reparación';
COMMENT ON TABLE stage_evidence IS 'Fotos de evidencia por cada etapa';
COMMENT ON TABLE notifications_log IS 'Log de notificaciones enviadas';

COMMENT ON COLUMN repairs.tracking_token IS 'Token único para tracking público del cliente';
COMMENT ON COLUMN repairs.code IS 'Código humano-legible de la reparación';
COMMENT ON COLUMN profiles.commission_percentage IS 'Porcentaje de comisión personalizado del técnico (null = usar default del local)';

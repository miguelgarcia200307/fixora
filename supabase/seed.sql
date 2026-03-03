-- =====================================================
-- FIXORA - Datos Semilla (Seed)
-- Ejecutar DESPUÉS de schema.sql y policies.sql
-- =====================================================

-- =====================================================
-- IMPORTANTE: CREACIÓN DEL SUPERADMIN
-- =====================================================
-- 
-- El superadmin se crea de la siguiente manera:
-- 
-- 1. Registra un usuario en Supabase Auth con el email configurado 
--    en CONFIG.SUPERADMIN_EMAILS (por defecto: superadmin@fixora.app)
-- 
-- 2. Luego ejecuta este INSERT para crear su perfil:
--
-- INSERT INTO profiles (id, role, full_name, is_active)
-- SELECT id, 'superadmin', 'Super Administrador', true
-- FROM auth.users
-- WHERE email = 'superadmin@fixora.app';
--
-- O si ya conoces el UUID del usuario:
-- INSERT INTO profiles (id, role, full_name, is_active)
-- VALUES ('UUID-DEL-USUARIO-AQUI', 'superadmin', 'Super Administrador', true);
-- =====================================================

-- =====================================================
-- DATOS DE EJEMPLO (OPCIONAL - SOLO PARA PRUEBAS)
-- =====================================================

-- Nota: Este seed es para pruebas. En producción, los datos se crean
-- a través de la interfaz de la aplicación.

-- Crear un local de ejemplo (después de tener un superadmin)
-- Descomenta y ajusta según necesites:

/*
-- Shop de ejemplo
INSERT INTO shops (
    id,
    name,
    slug,
    city,
    address,
    phone,
    whatsapp,
    email,
    default_tech_commission,
    subscription_plan,
    subscription_status,
    subscription_start_date,
    subscription_end_date,
    is_active
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'TechFix Colombia',
    'techfix-col',
    'Bogotá',
    'Calle 123 #45-67, Centro Comercial Tech Plaza, Local 101',
    '+57 601 234 5678',
    '+57 300 123 4567',
    'info@techfix.co',
    30.00,
    'pro',
    'active',
    NOW(),
    NOW() + INTERVAL '1 year',
    true
);

-- Cuando crees un usuario admin en Supabase Auth, 
-- crea su perfil así (reemplaza el UUID):
-- 
-- INSERT INTO profiles (
--     id,
--     shop_id,
--     role,
--     full_name,
--     phone,
--     whatsapp,
--     is_active
-- ) VALUES (
--     'UUID-DEL-ADMIN-AQUI',
--     'a0000000-0000-0000-0000-000000000001',
--     'admin',
--     'Administrador TechFix',
--     '+57 300 123 4567',
--     '+57 300 123 4567',
--     true
-- );

-- Cuando crees usuarios técnicos en Supabase Auth,
-- crea sus perfiles así (reemplaza los UUIDs):
--
-- INSERT INTO profiles (
--     id,
--     shop_id,
--     role,
--     full_name,
--     phone,
--     whatsapp,
--     commission_percentage,
--     is_active
-- ) VALUES 
-- (
--     'UUID-DEL-TECNICO-1',
--     'a0000000-0000-0000-0000-000000000001',
--     'tech',
--     'Carlos Técnico',
--     '+57 311 111 1111',
--     '+57 311 111 1111',
--     35.00,
--     true
-- ),
-- (
--     'UUID-DEL-TECNICO-2',
--     'a0000000-0000-0000-0000-000000000001',
--     'tech',
--     'María Técnica',
--     '+57 312 222 2222',
--     '+57 312 222 2222',
--     NULL,  -- Usa el porcentaje default del local
--     true
-- );

-- Clientes de ejemplo
INSERT INTO clients (id, shop_id, name, phone, whatsapp, email, address)
VALUES 
(
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Juan Pérez',
    '+57 320 123 4567',
    '+57 320 123 4567',
    'juan.perez@email.com',
    'Cra 10 #20-30, Bogotá'
),
(
    'c0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'María García',
    '+57 321 234 5678',
    '+57 321 234 5678',
    NULL,
    NULL
),
(
    'c0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Pedro Rodríguez',
    '+57 322 345 6789',
    '+57 322 345 6789',
    'pedro@empresa.co',
    'Av 68 #45-12'
);

-- Reparaciones de ejemplo
-- Nota: Estas se crearán sin tech_id hasta que tengas técnicos reales
INSERT INTO repairs (
    id,
    shop_id,
    client_id,
    tech_id,
    code,
    tracking_token,
    device_category,
    device_brand,
    device_model,
    device_color,
    device_imei,
    device_accessories,
    intake_reason,
    quote_status,
    quote_amount,
    status,
    priority
) VALUES 
(
    'r0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    NULL,
    'TEC-20260301-0001',
    'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    'cellphone',
    'Samsung',
    'Galaxy S23 Ultra',
    'Negro',
    '123456789012345',
    '["charger", "case"]',
    'Pantalla rota, no enciende después de caída',
    'approximate',
    450000.00,
    'pending',
    2
),
(
    'r0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000002',
    NULL,
    'TEC-20260301-0002',
    'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7',
    'laptop',
    'Apple',
    'MacBook Pro 14"',
    'Gris Espacial',
    'C02XL0PQJGH5',
    '["charger", "box"]',
    'No carga, batería hinchada, se apaga solo',
    'pending',
    NULL,
    'pending',
    1
),
(
    'r0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000003',
    NULL,
    'TEC-20260301-0003',
    'c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8',
    'console',
    'Sony',
    'PlayStation 5',
    'Blanco',
    NULL,
    '["cable"]',
    'No lee discos, hace ruido extraño al insertar',
    'accepted',
    280000.00,
    'assigned',
    3
);

-- Etapas de ejemplo para la tercera reparación
INSERT INTO repair_stages (
    id,
    repair_id,
    stage_type,
    stage_name,
    description,
    is_public
) VALUES 
(
    's0000000-0000-0000-0000-000000000001',
    'r0000000-0000-0000-0000-000000000003',
    'diagnosis_started',
    'Diagnóstico iniciado',
    'Se recibe el equipo y se inicia diagnóstico. Se verificará el lector de discos.',
    true
);
*/

-- =====================================================
-- FUNCIÓN HELPER PARA CREAR USUARIOS DE PRUEBA
-- =====================================================

-- Esta función ayuda a crear el perfil después de que el usuario
-- se registra en Supabase Auth. Llámala desde un trigger o manualmente.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_is_superadmin BOOLEAN;
    v_superadmin_emails TEXT[] := ARRAY['superadmin@fixora.app'];
BEGIN
    -- Verificar si es superadmin por email
    v_is_superadmin := NEW.email = ANY(v_superadmin_emails);
    
    -- Crear perfil básico
    INSERT INTO profiles (id, role, full_name, is_active)
    VALUES (
        NEW.id,
        CASE WHEN v_is_superadmin THEN 'superadmin'::user_role ELSE 'tech'::user_role END,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        true
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para crear perfil automáticamente al registrarse
-- NOTA: Descomentar solo si quieres creación automática de perfiles
-- En producción es mejor crear perfiles manualmente para control

/*
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
*/

-- =====================================================
-- INSTRUCCIONES DE USO
-- =====================================================

/*
PASOS PARA CONFIGURAR FIXORA:

1. CREAR SUPERADMIN:
   a. Ve a Supabase Auth > Users > Add User
   b. Crea usuario con email: superadmin@fixora.app (o el que configures)
   c. Ejecuta:
      INSERT INTO profiles (id, role, full_name, is_active)
      SELECT id, 'superadmin', 'Super Administrador', true
      FROM auth.users WHERE email = 'superadmin@fixora.app';

2. CREAR STORAGE BUCKETS:
   Ve a Supabase Storage y crea estos buckets:
   - intake-evidence (para fotos de ingreso)
   - stage-evidence (para fotos de etapas)
   - shop-logos (público, para logos)

3. CONFIGURAR STORAGE POLICIES:
   Copia las políticas de storage del archivo policies.sql
   y pégalas en cada bucket (Settings > Policies)

4. HABILITAR REALTIME:
   Ve a Database > Replication y habilita las tablas:
   - repairs
   - repair_stages
   - stage_evidence

5. CONFIGURAR LA APP:
   Edita src/js/config.js con tu SUPABASE_URL y SUPABASE_ANON_KEY

6. INICIAR SESIÓN:
   Accede a login.html con las credenciales del superadmin

7. CREAR UN LOCAL:
   Desde el panel de superadmin, crea tu primer local/taller

8. CREAR ADMIN DEL LOCAL:
   El superadmin crea el usuario admin del local

9. ¡LISTO!
   El admin puede crear técnicos y empezar a gestionar reparaciones
*/

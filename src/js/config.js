/**
 * FIXORA - Configuración Central
 * 
 * INSTRUCCIONES:
 * 1. Reemplaza SUPABASE_URL con tu URL de proyecto Supabase
 * 2. Reemplaza SUPABASE_ANON_KEY con tu clave anónima pública
 * 3. Configura el SUPERADMIN_EMAIL con el email del superadministrador inicial
 */

export const CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://yymgyvjswntaziaqinxk.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_EMD7VvvrCgAfRQuUkW2i6g_-gbjhxhz',
    
    // Superadmin email (el primer usuario con este email será superadmin automáticamente)
    SUPERADMIN_EMAILS: ['superadmin@fixora.app'],
    
    // App Info
    APP_NAME: 'FIXORA',
    APP_VERSION: '1.0.0',
    
    // Roles
    ROLES: {
        SUPERADMIN: 'superadmin',
        ADMIN: 'admin',
        TECH: 'tech'
    },
    
    // Estados de reparación
    REPAIR_STATUS: {
        PENDING: 'pending',           // Pendiente de asignación
        ASSIGNED: 'assigned',         // Asignado a técnico
        IN_PROGRESS: 'in_progress',   // En proceso
        WAITING_PARTS: 'waiting_parts', // Esperando repuestos
        READY: 'ready',               // Listo para entrega
        DELIVERED: 'delivered',       // Entregado
        CANCELLED: 'cancelled'        // Cancelado
    },
    
    // Estados de cotización
    QUOTE_STATUS: {
        PENDING: 'pending',           // Pendiente
        APPROXIMATE: 'approximate',   // Aproximada
        ACCEPTED: 'accepted',         // Aceptada
        REJECTED: 'rejected'          // Rechazada
    },
    
    // Categorías de equipos
    DEVICE_CATEGORIES: [
        { id: 'cellphone', name: 'Celular', icon: 'smartphone' },
        { id: 'tablet', name: 'Tablet', icon: 'tablet' },
        { id: 'console', name: 'Consola', icon: 'gamepad' },
        { id: 'pc', name: 'PC de Escritorio', icon: 'desktop' },
        { id: 'laptop', name: 'Laptop', icon: 'laptop' },
        { id: 'smartwatch', name: 'Smartwatch', icon: 'watch' },
        { id: 'other', name: 'Otro', icon: 'device' }
    ],
    
    // Accesorios comunes
    COMMON_ACCESSORIES: [
        { id: 'charger', name: 'Cargador' },
        { id: 'case', name: 'Funda/Estuche' },
        { id: 'box', name: 'Caja original' },
        { id: 'sim', name: 'Tarjeta SIM' },
        { id: 'sd', name: 'Memoria SD' },
        { id: 'earphones', name: 'Audífonos' },
        { id: 'cable', name: 'Cable de datos' },
        { id: 'stylus', name: 'Stylus/Lápiz' }
    ],
    
    // Etapas predefinidas para técnicos
    REPAIR_STAGES: [
        { id: 'diagnosis_started', name: 'Diagnóstico iniciado', icon: 'search' },
        { id: 'maintenance', name: 'Mantenimiento', icon: 'tool' },
        { id: 'cleaning', name: 'Limpieza', icon: 'sparkles' },
        { id: 'battery_change', name: 'Cambio de batería', icon: 'battery' },
        { id: 'screen_change', name: 'Cambio de pantalla', icon: 'monitor' },
        { id: 'port_change', name: 'Cambio de puerto de carga', icon: 'plug' },
        { id: 'software_reinstall', name: 'Reinstalación de sistema', icon: 'refresh' },
        { id: 'testing', name: 'Pruebas', icon: 'check-circle' },
        { id: 'ready_delivery', name: 'Listo para entrega', icon: 'package' },
        { id: 'delivered', name: 'Entregado', icon: 'check-double' },
        { id: 'other', name: 'Otro', icon: 'more' }
    ],
    
    // Planes de suscripción
    SUBSCRIPTION_PLANS: [
        { id: 'free', name: 'Free', maxTechs: 1, maxRepairs: 50 },
        { id: 'pro', name: 'Pro', maxTechs: 5, maxRepairs: 500 },
        { id: 'premium', name: 'Premium', maxTechs: -1, maxRepairs: -1 } // -1 = ilimitado
    ],
    
    // Configuración de tracking
    TRACKING: {
        TOKEN_LENGTH: 24,
        REALTIME_ENABLED: true,
        POLLING_INTERVAL: 10000,      // 10 segundos
        POLLING_MAX_INTERVAL: 60000   // 1 minuto (backoff máximo)
    },
    
    // Configuración de imágenes
    IMAGES: {
        MAX_SIZE_MB: 5,
        MAX_WIDTH: 1920,
        MAX_HEIGHT: 1920,
        QUALITY: 0.85,
        ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp']
    },
    
    // Storage buckets
    STORAGE_BUCKETS: {
        INTAKE_EVIDENCE: 'intake-evidence',
        STAGE_EVIDENCE: 'stage-evidence',
        SHOP_LOGOS: 'shop-logos'
    },
    
    // Plantillas de mensajes WhatsApp por defecto
    WHATSAPP_TEMPLATES: {
        ADMIN_TO_TECH: `🔧 *NUEVA REPARACIÓN ASIGNADA*
━━━━━━━━━━━━━━━━━━━━━

📋 *Código de Reparación*
   {codigo}

👤 *Cliente*
   {cliente}

📱 *Dispositivo*
   {marca} {modelo}

🔍 *Motivo de Ingreso*
   {motivo}

💰 *Cotización*
   Estado: {estadoCotizacion}
   Monto: {monto}

━━━━━━━━━━━━━━━━━━━━━
🎯 *ACCESO DIRECTO AL PANEL*
{linkPanel}

⚡ Por favor revisa los detalles y actualiza el estado en cuanto puedas.

_Enviado desde {local}_`,

        ADMIN_TO_CLIENT: `✅ *¡RECIBIMOS TU EQUIPO!*
━━━━━━━━━━━━━━━━━━━━━

¡Hola! 👋 Tu dispositivo ha sido registrado exitosamente en nuestro sistema.

📍 *Taller*
   {local}

📋 *Tu Código de Seguimiento*
   *{codigo}*

📱 *Equipo Recibido*
   {marca} {modelo}

💰 *Estado de Cotización*
   {estadoCotizacion} - {monto}

━━━━━━━━━━━━━━━━━━━━━
🔍 *RASTREA TU REPARACIÓN EN TIEMPO REAL*
{trackingLink}

📌 *Importante:* Guarda este código para consultar el estado de tu reparación en cualquier momento.

🙏 _¡Gracias por confiar en nosotros!_
Trabajaremos para devolverte tu equipo lo antes posible.`,

        TECH_TO_ADMIN: `📢 *ACTUALIZACIÓN DE REPARACIÓN*
━━━━━━━━━━━━━━━━━━━━━

🆔 *Código*
   {codigo}

👤 *Cliente*
   {cliente}

📱 *Equipo*
   {marca} {modelo}

🔄 *Estado Actualizado*
   {estado}

📝 *Observaciones del Técnico*
   {nota}

━━━━━━━━━━━━━━━━━━━━━
🔗 *VER DETALLES COMPLETOS*
{linkPanel}

_Actualización enviada desde el panel técnico_`,

        TECH_TO_CLIENT: `📱 *ACTUALIZACIÓN DE TU EQUIPO*
━━━━━━━━━━━━━━━━━━━━━

¡Hola! 👋 Tenemos novedades sobre tu reparación.

📋 *Código de Seguimiento*
   *{codigo}*

🔄 *Estado Actual*
   {estado}

📝 *Mensaje del Técnico*
   {nota}

━━━━━━━━━━━━━━━━━━━━━
🔍 *VER DETALLES COMPLETOS*
{trackingLink}

📞 Si tienes alguna pregunta, no dudes en contactarnos.

_Atentamente,_
_{local}_`
    },
    
    // Configuración regional
    LOCALE: {
        CURRENCY: 'COP',
        CURRENCY_SYMBOL: '$',
        COUNTRY_CODE: '+57',
        LANGUAGE: 'es-CO',
        TIMEZONE: 'America/Bogota'
    }
};

// Función para verificar si la configuración está completa
export function isConfigValid() {
    return CONFIG.SUPABASE_URL !== 'TU_SUPABASE_URL_AQUI' && 
           CONFIG.SUPABASE_ANON_KEY !== 'TU_SUPABASE_ANON_KEY_AQUI';
}

// Función para obtener etiqueta de estado de reparación
export function getRepairStatusLabel(status) {
    const labels = {
        pending: 'Pendiente',
        assigned: 'Asignado',
        in_progress: 'En proceso',
        waiting_parts: 'Esperando repuestos',
        ready: 'Listo para entrega',
        delivered: 'Entregado',
        cancelled: 'Cancelado'
    };
    return labels[status] || status;
}

// Función para obtener etiqueta de estado de cotización
export function getQuoteStatusLabel(status) {
    const labels = {
        pending: 'Pendiente',
        approximate: 'Aproximada',
        accepted: 'Aceptada',
        rejected: 'Rechazada'
    };
    return labels[status] || status;
}

// Función para obtener color de estado
export function getStatusColor(status) {
    const colors = {
        pending: '#6B7280',      // Gray
        assigned: '#3B82F6',     // Blue
        in_progress: '#F59E0B',  // Amber
        waiting_parts: '#8B5CF6', // Purple
        ready: '#10B981',        // Green
        delivered: '#059669',    // Emerald
        cancelled: '#EF4444'     // Red
    };
    return colors[status] || '#6B7280';
}

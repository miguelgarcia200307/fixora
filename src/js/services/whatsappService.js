/**
 * FIXORA - WhatsApp Service
 * WhatsApp click-to-chat message generation
 */

import { CONFIG, getRepairStatusLabel, getQuoteStatusLabel } from '../config.js';
import { getShopTemplates } from './shopService.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';

/**
 * Encode message for WhatsApp URL with proper emoji support
 * This ensures emojis display correctly instead of showing as question marks
 */
function encodeWhatsAppMessage(message) {
    // WhatsApp Web accepts UTF-8 encoded messages
    // We use encodeURIComponent which properly handles Unicode characters including emojis
    // This converts emojis to their percent-encoded UTF-8 representation
    return encodeURIComponent(message)
        // Additional safety: ensure line breaks are properly encoded
        .replace(/%0A/g, '%0A')  // Preserve line breaks
        .replace(/%20/g, '%20'); // Preserve spaces
}

/**
 * Generate WhatsApp URL
 */
export function generateWhatsAppUrl(phone, message) {
    // Clean phone number
    const cleanPhone = cleanPhoneNumber(phone);
    
    // Encode message with proper emoji support
    const encodedMessage = encodeWhatsAppMessage(message);
    
    // Debug log to verify encoding (remove in production if needed)
    if (CONFIG.DEBUG) {
        console.log('[WhatsApp] Original message length:', message.length);
        console.log('[WhatsApp] Encoded message length:', encodedMessage.length);
        console.log('[WhatsApp] Phone:', cleanPhone);
    }
    
    // Use wa.me for universal compatibility
    return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

/**
 * Open WhatsApp chat in new tab
 */
export function openWhatsAppChat(phone, message) {
    const url = generateWhatsAppUrl(phone, message);
    
    // Log for debugging emoji encoding issues
    console.log('[WhatsApp] Opening chat with message preview:', message.substring(0, 100));
    console.log('[WhatsApp] Generated URL length:', url.length);
    
    window.open(url, '_blank');
}

/**
 * Normalize message text to ensure proper emoji display
 * Replaces any corrupted characters with proper emoji codes
 */
function normalizeMessageText(text) {
    // If emojis appear as question marks or boxes, replace them with unicode codes
    // This ensures they display correctly in WhatsApp
    return text
        // Replace any Unicode replacement characters with nothing
        .replace(/\ufffd/g, '')
        // Normalize whitespace
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
}

/**
 * Generate message from template with variables
 */
export function processTemplate(template, variables) {
    let message = template;
    
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\{${key}\}`, 'g');
        message = message.replace(regex, value || '');
    }
    
    // Normalize to ensure emojis display correctly
    return normalizeMessageText(message);
}

/**
 * Send WhatsApp to technician (admin action)
 */
export async function sendToTechnician(repair, shop, techProfile) {
    if (!shop) {
        throw new Error('Información del local no disponible');
    }
    
    const templates = await getShopTemplates(shop.id);
    
    const variables = {
        codigo: repair.code,
        cliente: repair.client?.name || 'Cliente',
        marca: repair.device_brand || '',
        modelo: repair.device_model || '',
        motivo: repair.intake_reason || '',
        estadoCotizacion: getQuoteStatusLabel(repair.quote_status),
        monto: repair.quote_amount ? formatCurrency(repair.quote_amount) : 'Por definir',
        linkPanel: `${window.location.origin}/tech.html?repair=${repair.id}`,
        local: shop?.name || 'El taller'
    };
    
    const message = processTemplate(templates.admin_to_tech, variables);
    openWhatsAppChat(techProfile.whatsapp || techProfile.phone, message);
}

/**
 * Send WhatsApp to client (admin action)
 */
export async function sendToClientFromAdmin(repair, shop) {
    if (!shop) {
        throw new Error('Información del local no disponible');
    }
    
    const templates = await getShopTemplates(shop.id);
    
    const variables = {
        local: shop?.name || 'El taller',
        codigo: repair.code,
        marca: repair.device_brand || '',
        modelo: repair.device_model || '',
        estadoCotizacion: getQuoteStatusLabel(repair.quote_status),
        monto: repair.quote_amount ? formatCurrency(repair.quote_amount) : 'Por definir',
        trackingLink: `${window.location.origin}/track.html?token=${repair.tracking_token}`,
        estado: getRepairStatusLabel(repair.status)
    };
    
    const message = processTemplate(templates.admin_to_client, variables);
    openWhatsAppChat(repair.client?.whatsapp || repair.client?.phone, message);
}

/**
 * Send WhatsApp to admin (tech action)
 */
export async function sendToAdminFromTech(repair, shop, note = '') {
    if (!shop) {
        throw new Error('Información del local no disponible');
    }
    
    const templates = await getShopTemplates(shop.id);
    
    const variables = {
        codigo: repair.code,
        cliente: repair.client?.name || 'Cliente',
        marca: repair.device_brand || '',
        modelo: repair.device_model || '',
        estado: getRepairStatusLabel(repair.status),
        nota: note || 'Sin notas adicionales',
        linkPanel: `${window.location.origin}/admin.html?repair=${repair.id}`
    };
    
    const message = processTemplate(templates.tech_to_admin, variables);
    openWhatsAppChat(shop?.whatsapp || shop?.phone, message);
}

/**
 * Send WhatsApp to client (tech action)
 */
export async function sendToClientFromTech(repair, shop, note = '') {
    if (!shop) {
        throw new Error('Información del local no disponible');
    }
    
    const templates = await getShopTemplates(shop.id);
    
    const variables = {
        codigo: repair.code,
        estado: getRepairStatusLabel(repair.status),
        nota: note || '',
        trackingLink: `${window.location.origin}/track.html?token=${repair.tracking_token}`,
        local: shop?.name || 'El taller'
    };
    
    const message = processTemplate(templates.tech_to_client, variables);
    openWhatsAppChat(repair.client?.whatsapp || repair.client?.phone, message);
}

/**
 * Generate completion message for client
 */
export function generateCompletionMessage(repair, shop) {
    // Build location string with all available details
    const locationParts = [];
    
    if (shop?.address) locationParts.push(shop.address);
    if (shop?.neighborhood) locationParts.push(shop.neighborhood);
    
    const cityState = [];
    if (shop?.city) cityState.push(shop.city);
    if (shop?.state) cityState.push(shop.state);
    if (cityState.length > 0) locationParts.push(cityState.join(', '));
    
    const fullLocation = locationParts.join('\n');
    
    const message = `\ud83c\udf89 *¡TU EQUIPO ESTÁ LISTO!*
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

\u00a1Excelente noticia! \ud83d\udc4f Tu reparación ha sido completada exitosamente.

\ud83d\udccb *Código de Reparación*
   *${repair.code}*

\ud83d\udcf1 *Equipo Reparado*
   ${repair.device_brand || ''} ${repair.device_model || ''}

\ud83d\udcb0 *Total a Pagar*
   ${repair.final_amount || repair.quote_amount ? formatCurrency(repair.final_amount || repair.quote_amount) : 'Por confirmar'}

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\ud83d\udccd *RECOGER EN*
*${shop?.name || 'Nuestro local'}*${fullLocation ? `\n${fullLocation}` : ''}${shop?.google_maps_url ? `\n\n\ud83d\uddfa\ufe0f Ver ubicación:\n${shop.google_maps_url}` : ''}

\ud83d\udcde *Contáctanos*
${shop?.phone || shop?.whatsapp || ''}

\u23f0 Puedes pasar a recogerlo en nuestro horario de atención.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u26a0\ufe0f *IMPORTANTE - POR FAVOR LEER*

Por motivos de espacio e inventario, los equipos que *no sean recogidos dentro de los próximos 30 días calendario* quedarán sujetos a nuestra política de almacenamiento.

Después de este plazo, no podemos garantizar la disponibilidad del equipo y nos reservamos el derecho de disponer del mismo para cubrir costos de almacenamiento y reparación.

\ud83d\udcc5 *Fecha límite de recogida:* ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

\ud83d\ude4f _¡Gracias por confiar en nosotros!_
Esperamos que disfrutes tu equipo como nuevo.

_Atentamente,_
_${shop?.name || 'El equipo'}_`;

    return message;
}

/**
 * Generate quote notification message
 */
export function generateQuoteMessage(repair, shop) {
    const quoteLabel = getQuoteStatusLabel(repair.quote_status);
    
    let priceText = '';
    let statusIcon = '\ud83d\udcb0';
    
    if (repair.quote_status === 'approximate') {
        statusIcon = '\ud83d\udcca';
        priceText = `\ud83d\udcb0 *Cotización Aproximada*
   ${formatCurrency(repair.quote_amount)}

\u26a0\ufe0f _El precio puede variar según el diagnóstico final_`;
    } else if (repair.quote_status === 'accepted') {
        statusIcon = '\u2705';
        priceText = `\u2705 *Cotización Aceptada*
   ${formatCurrency(repair.quote_amount)}

\ud83d\udd27 Iniciamos la reparación de inmediato.`;
    } else if (repair.quote_status === 'rejected') {
        statusIcon = '\u274c';
        priceText = `\u274c *Cotización Rechazada*
   
\ud83d\udcde Por favor contáctanos para más información.`;
    } else {
        statusIcon = '\u23f3';
        priceText = '\u23f3 *Cotización Pendiente*\n   Estamos realizando el diagnóstico...';
    }

    const message = `${statusIcon} *ACTUALIZACIÓN DE COTIZACIÓN*
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

\ud83d\udcf1 *Equipo*
   ${repair.device_brand || ''} ${repair.device_model || ''}

\ud83d\udccb *Código*
   *${repair.code}*

${priceText}

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\ud83d\udd0d *SEGUIMIENTO EN TIEMPO REAL*
${window.location.origin}/track.html?token=${repair.tracking_token}

\ud83d\udcde Si tienes dudas, contáctanos.

_Atentamente,_
_${shop?.name || 'El equipo'}_`;

    return message;
}

/**
 * Send ready for pickup notification to client
 */
export async function sendReadyForPickupNotification(repair, shop) {
    if (!repair.client?.phone && !repair.client?.whatsapp) {
        throw new Error('Cliente no tiene teléfono/WhatsApp registrado');
    }
    
    if (!shop) {
        throw new Error('Información del local no disponible');
    }
    
    // Debug: verificar si el shop tiene google_maps_url
    console.log('📍 Shop data para notificación:', {
        name: shop.name,
        address: shop.address,
        neighborhood: shop.neighborhood || '(sin barrio)',
        city: shop.city,
        state: shop.state,
        google_maps_url: shop.google_maps_url || '❌ NO TIENE'
    });
    
    const message = generateCompletionMessage(repair, shop);
    openWhatsAppChat(repair.client?.whatsapp || repair.client?.phone, message);
    
    // Log notification
    await logNotification(
        shop.id,
        repair.id,
        'ready_for_pickup',
        repair.client?.whatsapp || repair.client?.phone,
        repair.client?.name,
        message
    );
}

/**
 * Clean phone number for WhatsApp
 */
function cleanPhoneNumber(phone) {
    if (!phone) return '';
    
    // Remove all non-numeric characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // If it doesn't start with +, assume Colombian number
    if (!cleaned.startsWith('+')) {
        // Remove leading 0 if present
        if (cleaned.startsWith('0')) {
            cleaned = cleaned.substring(1);
        }
        
        // If it's 10 digits, add Colombia code
        if (cleaned.length === 10) {
            cleaned = '57' + cleaned;
        }
    } else {
        // Remove the + for the URL
        cleaned = cleaned.substring(1);
    }
    
    return cleaned;
}

/**
 * Validate phone number
 */
export function isValidPhone(phone) {
    if (!phone) return false;
    
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    // Must have at least 10 digits
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 10) return false;
    
    // If starts with +, must have country code
    if (cleaned.startsWith('+') && digits.length < 11) return false;
    
    return true;
}

/**
 * Format phone for display
 */
export function formatPhone(phone) {
    if (!phone) return '';
    
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    // Colombian format: +57 XXX XXX XXXX
    if (cleaned.startsWith('+57') || cleaned.startsWith('57')) {
        const digits = cleaned.replace(/\D/g, '');
        const number = digits.startsWith('57') ? digits.substring(2) : digits;
        
        if (number.length === 10) {
            return `+57 ${number.substring(0, 3)} ${number.substring(3, 6)} ${number.substring(6)}`;
        }
    }
    
    return phone;
}

/**
 * Log WhatsApp notification
 */
export async function logNotification(shopId, repairId, type, recipientPhone, recipientName, message) {
    const { insert } = await import('./supabaseService.js');
    
    try {
        await insert('notifications_log', {
            shop_id: shopId,
            repair_id: repairId,
            notification_type: type,
            recipient_phone: recipientPhone,
            recipient_name: recipientName,
            message: message
        });
    } catch (error) {
        console.error('Error logging notification:', error);
        // Non-critical, continue
    }
}

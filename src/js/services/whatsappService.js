/**
 * FIXORA - WhatsApp Service
 * WhatsApp click-to-chat message generation
 */

import { CONFIG, getRepairStatusLabel, getQuoteStatusLabel } from '../config.js';
import { getShopTemplates } from './shopService.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';

/**
 * Generate WhatsApp URL
 */
export function generateWhatsAppUrl(phone, message) {
    // Clean phone number
    const cleanPhone = cleanPhoneNumber(phone);
    
    // Encode message
    const encodedMessage = encodeURIComponent(message);
    
    // Use wa.me for universal compatibility
    return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

/**
 * Open WhatsApp chat in new tab
 */
export function openWhatsAppChat(phone, message) {
    const url = generateWhatsAppUrl(phone, message);
    window.open(url, '_blank');
}

/**
 * Generate message from template with variables
 */
export function processTemplate(template, variables) {
    let message = template;
    
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        message = message.replace(regex, value || '');
    }
    
    return message;
}

/**
 * Send WhatsApp to technician (admin action)
 */
export async function sendToTechnician(repair, shop, techProfile) {
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
        local: shop.name
    };
    
    const message = processTemplate(templates.admin_to_tech, variables);
    openWhatsAppChat(techProfile.whatsapp || techProfile.phone, message);
}

/**
 * Send WhatsApp to client (admin action)
 */
export async function sendToClientFromAdmin(repair, shop) {
    const templates = await getShopTemplates(shop.id);
    
    const variables = {
        local: shop.name,
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
    openWhatsAppChat(shop.whatsapp || shop.phone, message);
}

/**
 * Send WhatsApp to client (tech action)
 */
export async function sendToClientFromTech(repair, shop, note = '') {
    const templates = await getShopTemplates(shop.id);
    
    const variables = {
        codigo: repair.code,
        estado: getRepairStatusLabel(repair.status),
        nota: note || '',
        trackingLink: `${window.location.origin}/track.html?token=${repair.tracking_token}`,
        local: shop.name
    };
    
    const message = processTemplate(templates.tech_to_client, variables);
    openWhatsAppChat(repair.client?.whatsapp || repair.client?.phone, message);
}

/**
 * Generate completion message for client
 */
export function generateCompletionMessage(repair, shop) {
    const message = `🎉 *¡TU EQUIPO ESTÁ LISTO!*
━━━━━━━━━━━━━━━━━━━━━

¡Excelente noticia! 👏 Tu reparación ha sido completada exitosamente.

📋 *Código de Reparación*
   *${repair.code}*

📱 *Equipo Reparado*
   ${repair.device_brand || ''} ${repair.device_model || ''}

💰 *Total a Pagar*
   ${repair.final_amount ? formatCurrency(repair.final_amount) : 'Por confirmar'}

━━━━━━━━━━━━━━━━━━━━━
📍 *RECOGER EN*
${shop.name}
${shop.address || ''}

📞 *Contáctanos*
${shop.phone || ''}

⏰ Puedes pasar a recogerlo en nuestro horario de atención.

🙏 _¡Gracias por confiar en nosotros!_
Esperamos que disfrutes tu equipo como nuevo.`;

    return message;
}

/**
 * Generate quote notification message
 */
export function generateQuoteMessage(repair, shop) {
    const quoteLabel = getQuoteStatusLabel(repair.quote_status);
    
    let priceText = '';
    let statusIcon = '💰';
    
    if (repair.quote_status === 'approximate') {
        statusIcon = '📊';
        priceText = `💰 *Cotización Aproximada*
   ${formatCurrency(repair.quote_amount)}

⚠️ _El precio puede variar según el diagnóstico final_`;
    } else if (repair.quote_status === 'accepted') {
        statusIcon = '✅';
        priceText = `✅ *Cotización Aceptada*
   ${formatCurrency(repair.quote_amount)}

🔧 Iniciamos la reparación de inmediato.`;
    } else if (repair.quote_status === 'rejected') {
        statusIcon = '❌';
        priceText = `❌ *Cotización Rechazada*
   
📞 Por favor contáctanos para más información.`;
    } else {
        statusIcon = '⏳';
        priceText = '⏳ *Cotización Pendiente*\n   Estamos realizando el diagnóstico...';
    }

    const message = `${statusIcon} *ACTUALIZACIÓN DE COTIZACIÓN*
━━━━━━━━━━━━━━━━━━━━━

📱 *Equipo*
   ${repair.device_brand || ''} ${repair.device_model || ''}

📋 *Código*
   *${repair.code}*

${priceText}

━━━━━━━━━━━━━━━━━━━━━
🔍 *SEGUIMIENTO EN TIEMPO REAL*
${window.location.origin}/track.html?token=${repair.tracking_token}

📞 Si tienes dudas, contáctanos.

_Atentamente,_
_${shop.name}_`;

    return message;
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

/**
 * FIXORA - Formatters
 * Utility functions for formatting data
 */

import { CONFIG } from '../config.js';

/**
 * Format currency (Colombian Pesos)
 */
export function formatCurrency(amount, options = {}) {
    if (amount === null || amount === undefined) return '-';
    
    const { showSymbol = true, decimals = 0 } = options;
    
    const formatter = new Intl.NumberFormat(CONFIG.LOCALE.LANGUAGE, {
        style: showSymbol ? 'currency' : 'decimal',
        currency: CONFIG.LOCALE.CURRENCY,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
    
    return formatter.format(amount);
}

/**
 * Format number with thousand separators
 */
export function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined) return '-';
    
    return new Intl.NumberFormat(CONFIG.LOCALE.LANGUAGE, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value);
}

/**
 * Format percentage
 */
export function formatPercentage(value, decimals = 1) {
    if (value === null || value === undefined) return '-';
    
    return `${formatNumber(value, decimals)}%`;
}

/**
 * Format date
 */
export function formatDate(date, format = 'medium') {
    if (!date) return '-';
    
    const d = date instanceof Date ? date : new Date(date);
    
    if (isNaN(d.getTime())) return '-';
    
    const options = {
        short: { day: '2-digit', month: '2-digit', year: '2-digit' },
        medium: { day: 'numeric', month: 'short', year: 'numeric' },
        long: { day: 'numeric', month: 'long', year: 'numeric' },
        full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    };
    
    return d.toLocaleDateString(CONFIG.LOCALE.LANGUAGE, options[format] || options.medium);
}

/**
 * Format time
 */
export function formatTime(date, format = '12h') {
    if (!date) return '-';
    
    const d = date instanceof Date ? date : new Date(date);
    
    if (isNaN(d.getTime())) return '-';
    
    const options = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: format === '12h'
    };
    
    return d.toLocaleTimeString(CONFIG.LOCALE.LANGUAGE, options);
}

/**
 * Format date and time
 */
export function formatDateTime(date, dateFormat = 'medium', timeFormat = '12h') {
    if (!date) return '-';
    
    return `${formatDate(date, dateFormat)} ${formatTime(date, timeFormat)}`;
}

/**
 * Format relative time (e.g., "hace 2 horas")
 */
export function formatRelativeTime(date) {
    if (!date) return '-';
    
    const d = date instanceof Date ? date : new Date(date);
    
    if (isNaN(d.getTime())) return '-';
    
    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    
    if (diffSec < 60) return 'Hace un momento';
    if (diffMin < 60) return `Hace ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
    if (diffHour < 24) return `Hace ${diffHour} ${diffHour === 1 ? 'hora' : 'horas'}`;
    if (diffDay < 7) return `Hace ${diffDay} ${diffDay === 1 ? 'día' : 'días'}`;
    if (diffWeek < 4) return `Hace ${diffWeek} ${diffWeek === 1 ? 'semana' : 'semanas'}`;
    if (diffMonth < 12) return `Hace ${diffMonth} ${diffMonth === 1 ? 'mes' : 'meses'}`;
    
    return formatDate(date, 'medium');
}

/**
 * Format phone number
 */
export function formatPhone(phone) {
    if (!phone) return '-';
    
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
 * Capitalize first letter
 */
export function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Title case
 */
export function titleCase(str) {
    if (!str) return '';
    return str.split(' ').map(word => capitalize(word)).join(' ');
}

/**
 * Truncate text
 */
export function truncate(str, maxLength = 50, suffix = '...') {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - suffix.length).trim() + suffix;
}

/**
 * Format file size
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get initials from name
 */
export function getInitials(name, count = 2) {
    if (!name) return '';
    
    return name
        .split(' ')
        .filter(word => word.length > 0)
        .slice(0, count)
        .map(word => word[0].toUpperCase())
        .join('');
}

/**
 * Format repair code
 */
export function formatRepairCode(code) {
    if (!code) return '-';
    return code.toUpperCase();
}

/**
 * Slugify string
 */
export function slugify(str) {
    if (!str) return '';
    
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

/**
 * Format device category
 */
export function formatDeviceCategory(category) {
    const device = CONFIG.DEVICE_CATEGORIES.find(d => d.id === category);
    return device?.name || category || '-';
}

/**
 * Format repair status
 */
export function formatRepairStatus(status) {
    const labels = {
        pending: 'Pendiente',
        assigned: 'Asignado',
        in_progress: 'En proceso',
        waiting_parts: 'Esperando repuestos',
        ready: 'Listo para entrega',
        delivered: 'Entregado',
        cancelled: 'Cancelado'
    };
    return labels[status] || status || '-';
}

/**
 * Format quote status
 */
export function formatQuoteStatus(status) {
    const labels = {
        pending: 'Pendiente',
        approximate: 'Aproximada',
        accepted: 'Aceptada',
        rejected: 'Rechazada'
    };
    return labels[status] || status || '-';
}

/**
 * Get status badge class
 */
export function getStatusBadgeClass(status) {
    const classes = {
        pending: 'badge-gray',
        assigned: 'badge-info',
        in_progress: 'badge-warning',
        waiting_parts: 'badge-accent',
        ready: 'badge-success',
        delivered: 'badge-success',
        cancelled: 'badge-error'
    };
    return classes[status] || 'badge-gray';
}

/**
 * Get quote status badge class
 */
export function getQuoteBadgeClass(status) {
    const classes = {
        pending: 'badge-gray',
        approximate: 'badge-warning',
        accepted: 'badge-success',
        rejected: 'badge-error'
    };
    return classes[status] || 'badge-gray';
}

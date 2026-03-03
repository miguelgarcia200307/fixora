/**
 * FIXORA - Validators
 * Utility functions for data validation
 */

import { CONFIG } from '../config.js';

/**
 * Validation result object
 */
class ValidationResult {
    constructor() {
        this.valid = true;
        this.errors = {};
    }
    
    addError(field, message) {
        this.valid = false;
        if (!this.errors[field]) {
            this.errors[field] = [];
        }
        this.errors[field].push(message);
    }
    
    hasErrors() {
        return !this.valid;
    }
    
    getFirstError(field) {
        return this.errors[field]?.[0] || null;
    }
    
    getAllErrors() {
        return Object.values(this.errors).flat();
    }
}

/**
 * Check if value is empty
 */
export function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

/**
 * Check if value is not empty
 */
export function isNotEmpty(value) {
    return !isEmpty(value);
}

/**
 * Validate required field
 */
export function isRequired(value, message = 'Este campo es requerido') {
    return {
        valid: isNotEmpty(value),
        message
    };
}

/**
 * Validate email format
 */
export function isEmail(value, message = 'Email inválido') {
    if (isEmpty(value)) return { valid: true, message: null };
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return {
        valid: emailRegex.test(value),
        message
    };
}

/**
 * Validate Colombian phone number
 */
export function isPhone(value, message = 'Número de teléfono inválido') {
    if (isEmpty(value)) return { valid: true, message: null };
    
    const cleaned = value.replace(/[\s\-\(\)]/g, '');
    
    // Accept formats: 3XXXXXXXXX, +573XXXXXXXXX, 573XXXXXXXXX
    const phoneRegex = /^(\+?57)?3\d{9}$/;
    return {
        valid: phoneRegex.test(cleaned),
        message
    };
}

/**
 * Validate minimum length
 */
export function minLength(value, min, message = null) {
    if (isEmpty(value)) return { valid: true, message: null };
    
    const len = typeof value === 'string' ? value.length : String(value).length;
    return {
        valid: len >= min,
        message: message || `Debe tener al menos ${min} caracteres`
    };
}

/**
 * Validate maximum length
 */
export function maxLength(value, max, message = null) {
    if (isEmpty(value)) return { valid: true, message: null };
    
    const len = typeof value === 'string' ? value.length : String(value).length;
    return {
        valid: len <= max,
        message: message || `Debe tener máximo ${max} caracteres`
    };
}

/**
 * Validate numeric value
 */
export function isNumeric(value, message = 'Debe ser un número') {
    if (isEmpty(value)) return { valid: true, message: null };
    
    return {
        valid: !isNaN(parseFloat(value)) && isFinite(value),
        message
    };
}

/**
 * Validate positive number
 */
export function isPositive(value, message = 'Debe ser un número positivo') {
    if (isEmpty(value)) return { valid: true, message: null };
    
    const num = parseFloat(value);
    return {
        valid: !isNaN(num) && num > 0,
        message
    };
}

/**
 * Validate non-negative number
 */
export function isNonNegative(value, message = 'Debe ser un número mayor o igual a cero') {
    if (isEmpty(value)) return { valid: true, message: null };
    
    const num = parseFloat(value);
    return {
        valid: !isNaN(num) && num >= 0,
        message
    };
}

/**
 * Validate minimum value
 */
export function minValue(value, min, message = null) {
    if (isEmpty(value)) return { valid: true, message: null };
    
    const num = parseFloat(value);
    return {
        valid: !isNaN(num) && num >= min,
        message: message || `El valor mínimo es ${min}`
    };
}

/**
 * Validate maximum value
 */
export function maxValue(value, max, message = null) {
    if (isEmpty(value)) return { valid: true, message: null };
    
    const num = parseFloat(value);
    return {
        valid: !isNaN(num) && num <= max,
        message: message || `El valor máximo es ${max}`
    };
}

/**
 * Validate value is in list
 */
export function isIn(value, list, message = 'Valor no válido') {
    if (isEmpty(value)) return { valid: true, message: null };
    
    return {
        valid: list.includes(value),
        message
    };
}

/**
 * Validate URL format
 */
export function isUrl(value, message = 'URL inválida') {
    if (isEmpty(value)) return { valid: true, message: null };
    
    try {
        new URL(value);
        return { valid: true, message: null };
    } catch {
        return { valid: false, message };
    }
}

/**
 * Validate date
 */
export function isDate(value, message = 'Fecha inválida') {
    if (isEmpty(value)) return { valid: true, message: null };
    
    const date = new Date(value);
    return {
        valid: !isNaN(date.getTime()),
        message
    };
}

/**
 * Validate future date
 */
export function isFutureDate(value, message = 'La fecha debe ser futura') {
    if (isEmpty(value)) return { valid: true, message: null };
    
    const date = new Date(value);
    return {
        valid: !isNaN(date.getTime()) && date > new Date(),
        message
    };
}

/**
 * Validate regex pattern
 */
export function matchesPattern(value, pattern, message = 'Formato inválido') {
    if (isEmpty(value)) return { valid: true, message: null };
    
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    return {
        valid: regex.test(value),
        message
    };
}

/**
 * Validate file type
 */
export function isValidFileType(file, allowedTypes = CONFIG.IMAGE_SETTINGS.ALLOWED_TYPES) {
    if (!file) return { valid: true, message: null };
    
    return {
        valid: allowedTypes.includes(file.type),
        message: `Tipo de archivo no permitido. Tipos válidos: ${allowedTypes.join(', ')}`
    };
}

/**
 * Validate file size
 */
export function isValidFileSize(file, maxSize = CONFIG.IMAGE_SETTINGS.MAX_SIZE) {
    if (!file) return { valid: true, message: null };
    
    const maxMB = maxSize / (1024 * 1024);
    return {
        valid: file.size <= maxSize,
        message: `El archivo es muy grande. Tamaño máximo: ${maxMB}MB`
    };
}

/**
 * Create a form validator
 */
export function createValidator(rules) {
    return function validate(data) {
        const result = new ValidationResult();
        
        for (const [field, fieldRules] of Object.entries(rules)) {
            const value = data[field];
            
            for (const rule of fieldRules) {
                const validation = rule(value);
                if (!validation.valid) {
                    result.addError(field, validation.message);
                    break; // Stop at first error for field
                }
            }
        }
        
        return result;
    };
}

/**
 * Validate login form
 */
export const validateLoginForm = createValidator({
    email: [
        (v) => isRequired(v, 'El email es requerido'),
        (v) => isEmail(v)
    ],
    password: [
        (v) => isRequired(v, 'La contraseña es requerida'),
        (v) => minLength(v, 6, 'La contraseña debe tener al menos 6 caracteres')
    ]
});

/**
 * Validate client form
 */
export const validateClientForm = createValidator({
    name: [
        (v) => isRequired(v, 'El nombre es requerido'),
        (v) => minLength(v, 2, 'El nombre es muy corto'),
        (v) => maxLength(v, 100, 'El nombre es muy largo')
    ],
    phone: [
        (v) => isRequired(v, 'El teléfono es requerido'),
        (v) => isPhone(v)
    ],
    email: [
        (v) => isEmail(v)
    ]
});

/**
 * Validate repair form
 */
export const validateRepairForm = createValidator({
    device_category: [
        (v) => isRequired(v, 'Seleccione una categoría')
    ],
    device_brand: [
        (v) => isRequired(v, 'La marca es requerida'),
        (v) => maxLength(v, 50)
    ],
    device_model: [
        (v) => isRequired(v, 'El modelo es requerido'),
        (v) => maxLength(v, 50)
    ],
    reported_issue: [
        (v) => isRequired(v, 'Describa el problema reportado'),
        (v) => minLength(v, 10, 'Describa el problema con más detalle'),
        (v) => maxLength(v, 1000)
    ]
});

/**
 * Validate quote form
 */
export const validateQuoteForm = createValidator({
    quote_amount: [
        (v) => isRequired(v, 'El monto de la cotización es requerido'),
        (v) => isNumeric(v),
        (v) => isPositive(v, 'El monto debe ser mayor a cero')
    ],
    quote_description: [
        (v) => maxLength(v, 500)
    ]
});

/**
 * Validate shop form
 */
export const validateShopForm = createValidator({
    name: [
        (v) => isRequired(v, 'El nombre del local es requerido'),
        (v) => minLength(v, 2),
        (v) => maxLength(v, 100)
    ],
    address: [
        (v) => maxLength(v, 200)
    ],
    phone: [
        (v) => isPhone(v)
    ],
    email: [
        (v) => isEmail(v)
    ]
});

/**
 * Validate user form
 */
export const validateUserForm = createValidator({
    email: [
        (v) => isRequired(v, 'El email es requerido'),
        (v) => isEmail(v)
    ],
    full_name: [
        (v) => isRequired(v, 'El nombre es requerido'),
        (v) => minLength(v, 2),
        (v) => maxLength(v, 100)
    ],
    role: [
        (v) => isRequired(v, 'Seleccione un rol'),
        (v) => isIn(v, ['admin', 'tech'], 'Rol no válido')
    ]
});

/**
 * Validate stage form
 */
export const validateStageForm = createValidator({
    title: [
        (v) => isRequired(v, 'El título es requerido'),
        (v) => maxLength(v, 100)
    ],
    description: [
        (v) => maxLength(v, 500)
    ]
});

/**
 * Show validation errors in form
 */
export function showValidationErrors(form, result) {
    // Clear previous errors
    form.querySelectorAll('.form-error').forEach(el => el.remove());
    form.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
    
    // Show new errors
    for (const [field, messages] of Object.entries(result.errors)) {
        const input = form.querySelector(`[name="${field}"]`);
        if (input) {
            const group = input.closest('.form-group') || input.parentElement;
            group.classList.add('has-error');
            
            const errorEl = document.createElement('span');
            errorEl.className = 'form-error';
            errorEl.textContent = messages[0];
            
            input.insertAdjacentElement('afterend', errorEl);
        }
    }
}

/**
 * Clear form validation errors
 */
export function clearValidationErrors(form) {
    form.querySelectorAll('.form-error').forEach(el => el.remove());
    form.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
}

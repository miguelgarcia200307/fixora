/**
 * FIXORA - Helper Utilities
 * DOM helpers and general utility functions
 */

/**
 * Query selector shorthand
 */
export function $(selector, parent = document) {
    return parent.querySelector(selector);
}

/**
 * Query selector all shorthand
 */
export function $$(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
}

/**
 * Create element with options
 */
export function createElement(tag, options = {}) {
    const { className, id, text, html, attributes = {}, children = [], events = {} } = options;
    
    const element = document.createElement(tag);
    
    if (className) element.className = className;
    if (id) element.id = id;
    if (text) element.textContent = text;
    if (html) element.innerHTML = html;
    
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    
    for (const child of children) {
        if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Element) {
            element.appendChild(child);
        }
    }
    
    for (const [event, handler] of Object.entries(events)) {
        element.addEventListener(event, handler);
    }
    
    return element;
}

/**
 * Add event listener with delegation
 */
export function delegate(parent, selector, event, handler) {
    if (!parent) {
        console.warn('delegate: parent element is null for selector', selector);
        return;
    }
    parent.addEventListener(event, (e) => {
        const target = e.target.closest(selector);
        if (target && parent.contains(target)) {
            handler.call(target, e, target);
        }
    });
}

/**
 * Wait for DOM ready
 */
export function ready(fn) {
    if (document.readyState !== 'loading') {
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

/**
 * Debounce function
 */
export function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 */
export function throttle(func, limit = 300) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Sleep/delay promise
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate unique ID
 */
export function generateId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Deep clone object
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (obj instanceof Object) {
        const copy = {};
        for (const [key, value] of Object.entries(obj)) {
            copy[key] = deepClone(value);
        }
        return copy;
    }
    return obj;
}

/**
 * Merge objects deeply
 */
export function deepMerge(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();
    
    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                deepMerge(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }
    
    return deepMerge(target, ...sources);
}

function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Get value from nested object by path
 */
export function getNestedValue(obj, path, defaultValue = undefined) {
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
        if (result === null || result === undefined) {
            return defaultValue;
        }
        result = result[key];
    }
    
    return result !== undefined ? result : defaultValue;
}

/**
 * Set value in nested object by path
 */
export function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current) || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
    return obj;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            return true;
        } finally {
            document.body.removeChild(textarea);
        }
    }
}

/**
 * Get URL parameters as object
 */
export function getUrlParams(url = window.location.href) {
    const params = {};
    const searchParams = new URL(url).searchParams;
    for (const [key, value] of searchParams) {
        params[key] = value;
    }
    return params;
}

/**
 * Build URL with parameters
 */
export function buildUrl(base, params = {}) {
    const url = new URL(base, window.location.origin);
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined) {
            url.searchParams.set(key, value);
        }
    }
    return url.toString();
}

/**
 * Format form data as object
 */
export function formDataToObject(form) {
    const formData = new FormData(form);
    const obj = {};
    
    for (const [key, value] of formData.entries()) {
        if (key in obj) {
            // Handle multiple values (e.g., checkboxes)
            if (!Array.isArray(obj[key])) {
                obj[key] = [obj[key]];
            }
            obj[key].push(value);
        } else {
            obj[key] = value;
        }
    }
    
    return obj;
}

/**
 * Fill form with data
 */
export function fillForm(form, data) {
    for (const [key, value] of Object.entries(data)) {
        const field = form.elements[key];
        if (!field) continue;
        
        if (field.type === 'checkbox') {
            field.checked = Boolean(value);
        } else if (field.type === 'radio') {
            const radio = form.querySelector(`[name="${key}"][value="${value}"]`);
            if (radio) radio.checked = true;
        } else if (field.tagName === 'SELECT' && field.multiple) {
            const values = Array.isArray(value) ? value : [value];
            for (const option of field.options) {
                option.selected = values.includes(option.value);
            }
        } else {
            field.value = value ?? '';
        }
    }
}

/**
 * Reset form and clear validation
 */
export function resetForm(form) {
    form.reset();
    form.querySelectorAll('.form-error').forEach(el => el.remove());
    form.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
}

/**
 * Show loading state on element
 */
export function showLoading(element, options = {}) {
    const { text = 'Cargando...', overlay = false } = options;
    
    element.classList.add('is-loading');
    element.setAttribute('data-loading-text', element.textContent);
    
    if (element.tagName === 'BUTTON') {
        element.disabled = true;
        element.innerHTML = `
            <span class="spinner spinner-sm"></span>
            <span>${text}</span>
        `;
    } else if (overlay) {
        const loadingOverlay = createElement('div', {
            className: 'loading-overlay',
            html: `
                <div class="loading-content">
                    <div class="spinner"></div>
                    <span>${text}</span>
                </div>
            `
        });
        element.style.position = 'relative';
        element.appendChild(loadingOverlay);
    }
}

/**
 * Hide loading state on element
 */
export function hideLoading(element) {
    element.classList.remove('is-loading');
    
    if (element.tagName === 'BUTTON') {
        element.disabled = false;
        element.textContent = element.getAttribute('data-loading-text') || element.textContent;
    } else {
        const overlay = element.querySelector('.loading-overlay');
        if (overlay) overlay.remove();
    }
}

/**
 * Smooth scroll to element
 */
export function scrollTo(target, options = {}) {
    const { offset = 0, behavior = 'smooth' } = options;
    
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return;
    
    const top = element.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top, behavior });
}

/**
 * Check if element is in viewport
 */
export function isInViewport(element, threshold = 0) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= -threshold &&
        rect.left >= -threshold &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + threshold &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth) + threshold
    );
}

/**
 * Local storage helpers with JSON support
 */
export const storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    },
    
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    },
    
    remove(key) {
        localStorage.removeItem(key);
    },
    
    clear() {
        localStorage.clear();
    }
};

/**
 * Session storage helpers
 */
export const session = {
    get(key, defaultValue = null) {
        try {
            const item = sessionStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    },
    
    set(key, value) {
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    },
    
    remove(key) {
        sessionStorage.removeItem(key);
    },
    
    clear() {
        sessionStorage.clear();
    }
};

/**
 * Get device info
 */
export function getDeviceInfo() {
    const ua = navigator.userAgent;
    
    return {
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua),
        isIOS: /iPad|iPhone|iPod/.test(ua),
        isAndroid: /Android/.test(ua),
        isSafari: /Safari/.test(ua) && !/Chrome/.test(ua),
        isChrome: /Chrome/.test(ua),
        isFirefox: /Firefox/.test(ua),
        isEdge: /Edg/.test(ua),
        hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0
    };
}

/**
 * Parse query string from location
 */
export function parseQueryString() {
    return Object.fromEntries(new URLSearchParams(window.location.search));
}

/**
 * Group array by key
 */
export function groupBy(array, key) {
    return array.reduce((groups, item) => {
        const value = typeof key === 'function' ? key(item) : item[key];
        (groups[value] = groups[value] || []).push(item);
        return groups;
    }, {});
}

/**
 * Sort array by key
 */
export function sortBy(array, key, order = 'asc') {
    const sorted = [...array].sort((a, b) => {
        const valueA = typeof key === 'function' ? key(a) : a[key];
        const valueB = typeof key === 'function' ? key(b) : b[key];
        
        if (valueA < valueB) return -1;
        if (valueA > valueB) return 1;
        return 0;
    });
    
    return order === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Unique array values
 */
export function unique(array, key = null) {
    if (key) {
        const seen = new Set();
        return array.filter(item => {
            const value = typeof key === 'function' ? key(item) : item[key];
            if (seen.has(value)) return false;
            seen.add(value);
            return true;
        });
    }
    return [...new Set(array)];
}

/**
 * Chunk array into smaller arrays
 */
export function chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * FIXORA - Toast Notification System
 * Handles toast notifications across the application
 */

class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = new Map();
        this.counter = 0;
        this.defaultDuration = 4000;
        this.maxToasts = 5;
    }
    
    /**
     * Initialize toast container
     */
    init() {
        if (this.container) return;
        
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        this.container.setAttribute('aria-live', 'polite');
        this.container.setAttribute('aria-label', 'Notificaciones');
        document.body.appendChild(this.container);
    }
    
    /**
     * Create toast element
     */
    createToast(message, type, options = {}) {
        const id = ++this.counter;
        const { 
            duration = this.defaultDuration,
            action = null,
            actionLabel = 'Deshacer',
            closable = true,
            icon = null
        } = options;
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.dataset.id = id;
        
        // Icon
        const iconEl = document.createElement('div');
        iconEl.className = 'toast-icon';
        iconEl.innerHTML = icon || this.getDefaultIcon(type);
        toast.appendChild(iconEl);
        
        // Content
        const content = document.createElement('div');
        content.className = 'toast-content';
        
        if (typeof message === 'object') {
            if (message.title) {
                const title = document.createElement('div');
                title.className = 'toast-title';
                title.textContent = message.title;
                content.appendChild(title);
            }
            
            const text = document.createElement('div');
            text.className = 'toast-message';
            text.textContent = message.text || message.message || '';
            content.appendChild(text);
        } else {
            const text = document.createElement('div');
            text.className = 'toast-message';
            text.textContent = message;
            content.appendChild(text);
        }
        
        toast.appendChild(content);
        
        // Actions container
        const actions = document.createElement('div');
        actions.className = 'toast-actions';
        
        // Custom action button
        if (action && typeof action === 'function') {
            const actionBtn = document.createElement('button');
            actionBtn.className = 'toast-action';
            actionBtn.textContent = actionLabel;
            actionBtn.onclick = (e) => {
                e.stopPropagation();
                action();
                this.dismiss(id);
            };
            actions.appendChild(actionBtn);
        }
        
        // Close button
        if (closable) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'toast-close';
            closeBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            `;
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this.dismiss(id);
            };
            actions.appendChild(closeBtn);
        }
        
        toast.appendChild(actions);
        
        // Progress bar for auto-dismiss
        if (duration > 0) {
            const progress = document.createElement('div');
            progress.className = 'toast-progress';
            progress.style.animationDuration = `${duration}ms`;
            toast.appendChild(progress);
        }
        
        return { id, toast, duration };
    }
    
    /**
     * Get default icon for type
     */
    getDefaultIcon(type) {
        const icons = {
            success: `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
            `,
            error: `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
            `,
            warning: `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
            `,
            info: `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
            `
        };
        return icons[type] || icons.info;
    }
    
    /**
     * Show toast notification
     */
    show(message, type = 'info', options = {}) {
        this.init();
        
        // Limit number of toasts
        while (this.toasts.size >= this.maxToasts) {
            const firstId = this.toasts.keys().next().value;
            this.dismiss(firstId);
        }
        
        const { id, toast, duration } = this.createToast(message, type, options);
        
        // Add to container
        this.container.appendChild(toast);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-show');
        });
        
        // Store toast info
        const toastInfo = { element: toast, timeout: null };
        
        // Auto dismiss
        if (duration > 0) {
            toastInfo.timeout = setTimeout(() => {
                this.dismiss(id);
            }, duration);
        }
        
        this.toasts.set(id, toastInfo);
        
        return id;
    }
    
    /**
     * Dismiss toast
     */
    dismiss(id) {
        const toastInfo = this.toasts.get(id);
        if (!toastInfo) return;
        
        const { element, timeout } = toastInfo;
        
        if (timeout) {
            clearTimeout(timeout);
        }
        
        element.classList.remove('toast-show');
        element.classList.add('toast-hide');
        
        element.addEventListener('animationend', () => {
            element.remove();
        }, { once: true });
        
        // Fallback removal
        setTimeout(() => {
            if (element.parentNode) {
                element.remove();
            }
        }, 300);
        
        this.toasts.delete(id);
    }
    
    /**
     * Dismiss all toasts
     */
    dismissAll() {
        for (const id of this.toasts.keys()) {
            this.dismiss(id);
        }
    }
    
    /**
     * Success toast shorthand
     */
    success(message, options = {}) {
        return this.show(message, 'success', options);
    }
    
    /**
     * Error toast shorthand
     */
    error(message, options = {}) {
        return this.show(message, 'error', { duration: 6000, ...options });
    }
    
    /**
     * Warning toast shorthand
     */
    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }
    
    /**
     * Info toast shorthand
     */
    info(message, options = {}) {
        return this.show(message, 'info', options);
    }
    
    /**
     * Loading toast (no auto-dismiss)
     */
    loading(message = 'Cargando...', options = {}) {
        const icon = `
            <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
        `;
        return this.show(message, 'info', { 
            duration: 0, 
            closable: false,
            icon,
            ...options 
        });
    }
    
    /**
     * Promise toast - shows loading, then success/error
     */
    async promise(promise, messages = {}) {
        const {
            loading = 'Procesando...',
            success = 'Completado',
            error = 'Ha ocurrido un error'
        } = messages;
        
        const loadingId = this.loading(loading);
        
        try {
            const result = await promise;
            this.dismiss(loadingId);
            this.success(typeof success === 'function' ? success(result) : success);
            return result;
        } catch (err) {
            this.dismiss(loadingId);
            this.error(typeof error === 'function' ? error(err) : error);
            throw err;
        }
    }
}

// Create singleton instance
const toast = new ToastManager();

// Export functions
export default toast;
export const showToast = (message, type, options) => toast.show(message, type, options);
export const showSuccess = (message, options) => toast.success(message, options);
export const showError = (message, options) => toast.error(message, options);
export const showWarning = (message, options) => toast.warning(message, options);
export const showInfo = (message, options) => toast.info(message, options);
export const showLoading = (message, options) => toast.loading(message, options);
export const dismissToast = (id) => toast.dismiss(id);
export const dismissAllToasts = () => toast.dismissAll();
export const toastPromise = (promise, messages) => toast.promise(promise, messages);

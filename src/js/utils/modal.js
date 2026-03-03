/**
 * FIXORA - Modal System
 * Handles modal dialogs across the application
 */

class ModalManager {
    constructor() {
        this.modals = new Map();
        this.activeModals = [];
        this.counter = 0;
    }
    
    /**
     * Register a static modal
     */
    register(id, element) {
        const closeBtn = element.querySelector('.modal-close');
        const overlay = element.querySelector('.modal-overlay') || element;
        
        const modal = {
            element,
            closeBtn,
            overlay,
            onOpen: null,
            onClose: null
        };
        
        // Close button click
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close(id));
        }
        
        // Overlay click (close on backdrop click)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.classList.contains('modal-overlay')) {
                this.close(id);
            }
        });
        
        // ESC key
        element.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close(id);
            }
        });
        
        this.modals.set(id, modal);
        return modal;
    }
    
    /**
     * Open a registered modal
     */
    open(id, data = null) {
        const modal = this.modals.get(id);
        if (!modal) {
            console.error(`Modal "${id}" not found`);
            return;
        }
        
        // Store data for retrieval
        modal.data = data;
        
        // Add to active stack
        this.activeModals.push(id);
        
        // Prevent body scroll
        document.body.classList.add('modal-open');
        
        // Show modal
        modal.element.classList.add('modal-visible');
        
        // Focus first focusable element
        requestAnimationFrame(() => {
            const focusable = modal.element.querySelector(
                'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
            );
            if (focusable) {
                focusable.focus();
            }
        });
        
        // Callback
        if (modal.onOpen) {
            modal.onOpen(data);
        }
        
        return modal;
    }
    
    /**
     * Close a modal
     */
    close(id) {
        const modal = this.modals.get(id);
        if (!modal) return;
        
        // Remove from active stack
        const index = this.activeModals.indexOf(id);
        if (index > -1) {
            this.activeModals.splice(index, 1);
        }
        
        // Restore body scroll if no more modals
        if (this.activeModals.length === 0) {
            document.body.classList.remove('modal-open');
        }
        
        // Hide modal
        modal.element.classList.remove('modal-visible');
        
        // Callback
        if (modal.onClose) {
            modal.onClose(modal.data);
        }
        
        // Clear data
        modal.data = null;
    }
    
    /**
     * Close all modals
     */
    closeAll() {
        for (const id of [...this.activeModals]) {
            this.close(id);
        }
    }
    
    /**
     * Get modal data
     */
    getData(id) {
        return this.modals.get(id)?.data || null;
    }
    
    /**
     * Set callbacks for a modal
     */
    on(id, event, callback) {
        const modal = this.modals.get(id);
        if (!modal) return;
        
        if (event === 'open') {
            modal.onOpen = callback;
        } else if (event === 'close') {
            modal.onClose = callback;
        }
    }
    
    /**
     * Check if modal is open
     */
    isOpen(id) {
        return this.activeModals.includes(id);
    }
    
    /**
     * Create a dynamic modal
     */
    create(options = {}) {
        const {
            title = '',
            content = '',
            size = 'medium', // small, medium, large, full
            closable = true,
            className = '',
            footer = null,
            onOpen = null,
            onClose = null
        } = options;
        
        const id = `modal-dynamic-${++this.counter}`;
        
        const modalHTML = `
            <div class="modal ${className}" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
                <div class="modal-overlay">
                    <div class="modal-container modal-${size}">
                        <div class="modal-header">
                            <h2 class="modal-title" id="${id}-title">${this.escapeHtml(title)}</h2>
                            ${closable ? `
                                <button class="modal-close" aria-label="Cerrar">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                            ` : ''}
                        </div>
                        <div class="modal-body">
                            ${content}
                        </div>
                        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        const element = document.getElementById(id);
        const modal = this.register(id, element);
        modal.onOpen = onOpen;
        modal.onClose = onClose;
        modal.isDynamic = true;
        
        return {
            id,
            element,
            open: (data) => this.open(id, data),
            close: () => this.close(id),
            destroy: () => this.destroy(id)
        };
    }
    
    /**
     * Destroy a dynamic modal
     */
    destroy(id) {
        const modal = this.modals.get(id);
        if (!modal || !modal.isDynamic) return;
        
        this.close(id);
        modal.element.remove();
        this.modals.delete(id);
    }
    
    /**
     * Show confirmation dialog
     */
    confirm(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Confirmar',
                message = '¿Está seguro?',
                confirmText = 'Confirmar',
                cancelText = 'Cancelar',
                confirmClass = 'btn-danger',
                danger = false
            } = options;
            
            const modal = this.create({
                title,
                content: `<p class="modal-confirm-message">${this.escapeHtml(message)}</p>`,
                size: 'small',
                footer: `
                    <button class="btn btn-secondary" data-action="cancel">${cancelText}</button>
                    <button class="btn ${danger ? 'btn-danger' : confirmClass}" data-action="confirm">${confirmText}</button>
                `,
                closable: true,
                onClose: () => {
                    resolve(false);
                    setTimeout(() => modal.destroy(), 100);
                }
            });
            
            const container = modal.element.querySelector('.modal-footer');
            
            container.querySelector('[data-action="cancel"]').onclick = () => {
                modal.close();
            };
            
            container.querySelector('[data-action="confirm"]').onclick = () => {
                resolve(true);
                modal.destroy();
            };
            
            modal.open();
        });
    }
    
    /**
     * Show alert dialog
     */
    alert(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Aviso',
                message = '',
                buttonText = 'Aceptar',
                type = 'info' // info, success, warning, error
            } = options;
            
            const icons = {
                success: '<svg class="modal-alert-icon modal-alert-success" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
                error: '<svg class="modal-alert-icon modal-alert-error" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
                warning: '<svg class="modal-alert-icon modal-alert-warning" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
                info: '<svg class="modal-alert-icon modal-alert-info" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
            };
            
            const modal = this.create({
                title,
                content: `
                    <div class="modal-alert-content">
                        ${icons[type] || icons.info}
                        <p>${this.escapeHtml(message)}</p>
                    </div>
                `,
                size: 'small',
                footer: `
                    <button class="btn btn-primary" data-action="ok">${buttonText}</button>
                `,
                className: `modal-alert modal-alert-${type}`,
                onClose: () => {
                    resolve();
                    setTimeout(() => modal.destroy(), 100);
                }
            });
            
            modal.element.querySelector('[data-action="ok"]').onclick = () => {
                modal.close();
            };
            
            modal.open();
        });
    }
    
    /**
     * Show prompt dialog
     */
    prompt(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Ingrese un valor',
                message = '',
                placeholder = '',
                defaultValue = '',
                inputType = 'text',
                confirmText = 'Aceptar',
                cancelText = 'Cancelar'
            } = options;
            
            const inputId = `prompt-input-${++this.counter}`;
            
            const modal = this.create({
                title,
                content: `
                    <div class="modal-prompt-content">
                        ${message ? `<p>${this.escapeHtml(message)}</p>` : ''}
                        <div class="form-group">
                            <input 
                                type="${inputType}" 
                                id="${inputId}"
                                class="form-input" 
                                placeholder="${this.escapeHtml(placeholder)}"
                                value="${this.escapeHtml(defaultValue)}"
                            >
                        </div>
                    </div>
                `,
                size: 'small',
                footer: `
                    <button class="btn btn-secondary" data-action="cancel">${cancelText}</button>
                    <button class="btn btn-primary" data-action="confirm">${confirmText}</button>
                `,
                onOpen: () => {
                    const input = document.getElementById(inputId);
                    input.focus();
                    input.select();
                },
                onClose: () => {
                    resolve(null);
                    setTimeout(() => modal.destroy(), 100);
                }
            });
            
            const input = document.getElementById(inputId);
            
            modal.element.querySelector('[data-action="cancel"]').onclick = () => {
                modal.close();
            };
            
            modal.element.querySelector('[data-action="confirm"]').onclick = () => {
                resolve(input.value);
                modal.destroy();
            };
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    resolve(input.value);
                    modal.destroy();
                }
            });
            
            modal.open();
        });
    }
    
    /**
     * Escape HTML for safe insertion
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    /**
     * Initialize all modals with data-modal attribute
     */
    initAll() {
        // Register modals by data-modal attribute
        document.querySelectorAll('[data-modal]').forEach(element => {
            const id = element.getAttribute('data-modal');
            if (id && !this.modals.has(id)) {
                this.register(id, element);
            }
        });
        
        // Also register modals by ID (fallback)
        document.querySelectorAll('.modal[id]').forEach(element => {
            const id = element.id;
            if (id && !this.modals.has(id)) {
                this.register(id, element);
            }
        });
        
        // Setup triggers
        document.querySelectorAll('[data-modal-open]').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const id = trigger.getAttribute('data-modal-open');
                const data = trigger.dataset.modalData ? JSON.parse(trigger.dataset.modalData) : null;
                this.open(id, data);
            });
        });
        
        document.querySelectorAll('[data-modal-close]').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const id = trigger.getAttribute('data-modal-close');
                if (id) {
                    this.close(id);
                } else {
                    // Close nearest modal
                    const modal = trigger.closest('.modal');
                    if (modal) {
                        this.close(modal.getAttribute('data-modal') || modal.id);
                    }
                }
            });
        });
    }
}

// Create singleton instance
const modal = new ModalManager();

// Export
export default modal;
export const registerModal = (id, element) => modal.register(id, element);
export const openModal = (id, data) => modal.open(id, data);
export const closeModal = (id) => modal.close(id);
export const closeAllModals = () => modal.closeAll();
export const createModal = (options) => modal.create(options);
export const confirmModal = (options) => modal.confirm(options);
export const alertModal = (options) => modal.alert(options);
export const promptModal = (options) => modal.prompt(options);
export const initModals = () => modal.initAll();

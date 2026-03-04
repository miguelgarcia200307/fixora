/**
 * FIXORA - Admin Dashboard
 * Shop management for administrators
 */

import { CONFIG } from '../config.js';
import { requireAuth, signOut, getCurrentProfile, isAdmin, getShopId } from '../services/authService.js';
import { getShopById, updateShop, getShopTechnicians } from '../services/shopService.js';
import { 
    getRepairs, 
    getRepairById, 
    createRepair, 
    updateRepair, 
    getShopClients,
    getOrCreateClient,
    getRepairStages,
    assignTechnician,
    subscribeToRepairs,
    getRepairStats,
    updateClient
} from '../services/repairService.js';
import { uploadIntakeEvidence, getIntakeEvidence, uploadShopLogo } from '../services/storageService.js';
import { sendToClientFromAdmin, sendToTechnician } from '../services/whatsappService.js';
import { getSupabase } from '../services/supabaseService.js';
import { 
    formatDate, 
    formatDateTime,
    formatCurrency, 
    formatPhone,
    formatRepairStatus,
    formatQuoteStatus,
    formatDeviceCategory,
    getInitials,
    getStatusBadgeClass,
    getQuoteBadgeClass
} from '../utils/formatters.js';
import { validateRepairForm, validateClientForm, showValidationErrors, clearValidationErrors } from '../utils/validators.js';
import toast from '../utils/toast.js';
import modal, { initModals, confirmModal } from '../utils/modal.js';
import { openCamera, pickImages, setupDragDrop, setupPaste, createImagePreview } from '../utils/camera.js';
import { $, $$, delegate, debounce, showLoading, hideLoading, resetForm, formDataToObject, fillForm } from '../utils/helpers.js';

// State
let currentSection = 'dashboard';
let shopId = null;
let shop = null;
let profile = null;
let repairs = [];
let technicians = [];
let wizardStep = 1;
let wizardPhotos = [];
let selectedRepairId = null;
let realtimeSubscription = null;
let currentFinancialData = {
    repairs: [],
    metrics: null,
    startDate: null,
    endDate: null,
    period: 'today'
};

// Elements
const sidebar = $('#sidebar');
const pageTitle = $('#page-title');

/**
 * Initialize page
 */
async function init() {
    try {
        // Verify authentication and role
        const session = await requireAuth();
        if (!session) return;
        
        profile = await getCurrentProfile();
        shopId = await getShopId();
        
        // Check if admin
        if (!await isAdmin()) {
            toast.error('Acceso denegado.');
            window.location.href = 'index.html';
            return;
        }
        
        if (!shopId) {
            toast.error('No tienes un local asignado.');
            window.location.href = 'index.html';
            return;
        }
        
        // Load shop data
        shop = await getShopById(shopId);
        
        // Update UI
        updateUserInfo();
        
        // Setup
        setupSidebar();
        setupNavigation();
        setupModals();
        setupWizard();
        setupEventListeners();
        
        // Load data
        await loadDashboardData();
        
        // Setup realtime
        setupRealtime();
        
        // Handle hash navigation
        handleHashChange();
        window.addEventListener('hashchange', handleHashChange);
        
    } catch (error) {
        console.error('Initialization error:', error);
        toast.error('Error al cargar el panel');
    }
}

/**
 * Update user info
 */
function updateUserInfo() {
    if (profile) {
        $('#user-name').textContent = profile.full_name || 'Admin';
        $('#user-avatar').textContent = getInitials(profile.full_name || 'AD');
    }
    if (shop) {
        $('#shop-name').textContent = shop.name || 'Mi Local';
    }
}

/**
 * Setup sidebar
 */
function setupSidebar() {
    $('#sidebar-toggle')?.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });
    
    $('#mobile-menu-btn')?.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });
    
    document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && 
            !e.target.closest('#mobile-menu-btn')) {
            sidebar.classList.remove('open');
        }
    });
}

/**
 * Setup navigation
 */
function setupNavigation() {
    $$('.sidebar-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToSection(link.dataset.section);
            sidebar.classList.remove('open');
        });
    });
    
    delegate(document, '[data-section]', 'click', (e, el) => {
        if (!el.classList.contains('sidebar-link')) {
            e.preventDefault();
            navigateToSection(el.dataset.section);
        }
    });
}

/**
 * Navigate to section
 */
function navigateToSection(section) {
    currentSection = section;
    window.location.hash = section;
    
    $$('.sidebar-link').forEach(link => {
        link.classList.toggle('active', link.dataset.section === section);
    });
    
    $$('.page-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `section-${section}`);
    });
    
    const titles = {
        dashboard: 'Dashboard',
        repairs: 'Reparaciones',
        technicians: 'Técnicos',
        finances: 'Finanzas',
        settings: 'Configuración'
    };
    pageTitle.textContent = titles[section] || 'Dashboard';
    
    loadSectionData(section);
}

/**
 * Handle hash change
 */
function handleHashChange() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    if (hash !== currentSection) {
        navigateToSection(hash);
    }
}

/**
 * Load section data
 */
async function loadSectionData(section) {
    switch (section) {
        case 'dashboard':
            await loadDashboardData();
            break;
        case 'repairs':
            await loadRepairs();
            break;
        case 'technicians':
            await loadTechnicians();
            break;
        case 'finances':
            await loadFinances();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

/**
 * Load dashboard data
 */
async function loadDashboardData() {
    try {
        const stats = await getRepairStats(shopId);
        
        $('#stat-pending').textContent = stats.pending || 0;
        $('#stat-in-progress').textContent = stats.in_progress || 0;
        $('#stat-ready').textContent = stats.ready || 0;
        $('#stat-revenue').textContent = formatCurrency(stats.total_revenue || 0);
        
        // Load recent repairs
        repairs = await getRepairs(shopId, { limit: 5 });
        renderRecentRepairs(repairs);
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        toast.error('Error al cargar datos');
    }
}

/**
 * Render recent repairs
 */
function renderRecentRepairs(recentRepairs) {
    const container = $('#recent-repairs');
    
    if (!recentRepairs.length) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No hay reparaciones recientes</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="repair-list">
            ${recentRepairs.map(repair => `
                <div class="repair-list-item" data-id="${repair.id}">
                    <div class="repair-list-info">
                        <span class="repair-code">${repair.code}</span>
                        <span class="repair-device">${repair.device_brand} ${repair.device_model}</span>
                        <span class="repair-client">${repair.client?.name || '-'}</span>
                    </div>
                    <span class="badge ${getStatusBadgeClass(repair.status)}">
                        ${formatRepairStatus(repair.status)}
                    </span>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Load repairs
 */
async function loadRepairs() {
    try {
        repairs = await getRepairs(shopId);
        technicians = await getShopTechnicians(shopId);
        
        // Render both desktop table and mobile cards
        renderRepairsTable(repairs);
        renderRepairsList(repairs);
    } catch (error) {
        console.error('Error loading repairs:', error);
        toast.error('Error al cargar reparaciones');
    }
}

/**
 * Render repairs table (Desktop)
 */
function renderRepairsTable(repairsData) {
    const tbody = $('#repairs-tbody');
    
    if (!repairsData.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <line x1="3" y1="9" x2="21" y2="9"/>
                                <line x1="9" y1="21" x2="9" y2="9"/>
                            </svg>
                        </div>
                        <h3>No hay reparaciones</h3>
                        <p>Comienza registrando tu primera reparación</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = repairsData.map(repair => `
        <tr data-id="${repair.id}" class="clickable-row">
            <td><span class="repair-code-link">${repair.code}</span></td>
            <td>
                <div class="cell-with-subtitle">
                    <span>${repair.client?.name || '-'}</span>
                    <span class="cell-subtitle">${formatPhone(repair.client?.phone) || ''}</span>
                </div>
            </td>
            <td>
                <div class="cell-with-subtitle">
                    <span>${repair.device_brand} ${repair.device_model}</span>
                    <span class="cell-subtitle">${formatDeviceCategory(repair.device_category)}</span>
                </div>
            </td>
            <td><span class="badge ${getStatusBadgeClass(repair.status)}">${formatRepairStatus(repair.status)}</span></td>
            <td>${repair.tech?.full_name || '-'}</td>
            <td>
                <div class="cell-with-subtitle">
                    <span>${repair.quote_amount ? formatCurrency(repair.quote_amount) : '-'}</span>
                    <span class="badge badge-sm ${getQuoteBadgeClass(repair.quote_status)}">${formatQuoteStatus(repair.quote_status)}</span>
                </div>
            </td>
            <td>${formatDate(repair.created_at)}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-sm btn-view-repair" title="Ver">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="btn btn-whatsapp btn-sm btn-whatsapp-client" title="WhatsApp">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

/**
 * Render repairs list (Mobile Cards)
 */
function renderRepairsList(repairsData) {
    const container = $('#repairs-list');
    const emptyState = $('#repairs-empty-state');
    
    if (!repairsData.length) {
        // Show empty state
        emptyState.style.display = 'block';
        // Remove any existing repair cards
        const existingCards = container.querySelectorAll('.repair-card');
        existingCards.forEach(card => card.remove());
        return;
    }
    
    // Hide empty state
    emptyState.style.display = 'none';
    
    // Clear existing cards
    const existingCards = container.querySelectorAll('.repair-card');
    existingCards.forEach(card => card.remove());
    
    // Create new cards
    const cardsHTML = repairsData.map(repair => `
        <div class="repair-card" data-id="${repair.id}">
            <div class="repair-card-header">
                <span class="repair-code">${repair.code}</span>
                <div class="repair-actions">
                    <button class="repair-action btn-view-repair" title="Ver reparación">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="repair-action btn-whatsapp-client" title="WhatsApp cliente">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="repair-card-content">
                <div class="repair-info-group">
                    <div class="repair-info-item">
                        <span class="repair-info-label">Cliente</span>
                        <span class="repair-info-value">${repair.client?.name || '-'}</span>
                    </div>
                    <div class="repair-info-item">
                        <span class="repair-info-label">Teléfono</span>
                        <span class="repair-info-value">${formatPhone(repair.client?.phone) || '-'}</span>
                    </div>
                    <div class="repair-info-item">
                        <span class="repair-info-label">Dispositivo</span>
                        <span class="repair-info-value">${repair.device_brand} ${repair.device_model}</span>
                    </div>
                    <div class="repair-info-item">
                        <span class="repair-info-label">Categoría</span>
                        <span class="repair-info-value">${formatDeviceCategory(repair.device_category)}</span>
                    </div>
                </div>
                <div class="repair-info-group">
                    <div class="repair-info-item">
                        <span class="repair-info-label">Técnico</span>
                        <span class="repair-info-value">${repair.tech?.full_name || 'Sin asignar'}</span>
                    </div>
                    <div class="repair-info-item">
                        <span class="repair-info-label">Estado</span>
                        <span class="badge ${getStatusBadgeClass(repair.status)}">${formatRepairStatus(repair.status)}</span>
                    </div>
                </div>
                <div class="repair-status-section">
                    <span class="repair-price">${repair.quote_amount ? formatCurrency(repair.quote_amount) : 'Sin cotizar'}</span>
                    <span class="badge badge-sm ${getQuoteBadgeClass(repair.quote_status)}">${formatQuoteStatus(repair.quote_status)}</span>
                    <span class="repair-date">${formatDate(repair.created_at)}</span>
                </div>
            </div>
        </div>
    `).join('');
    
    // Insert cards after the empty state
    emptyState.insertAdjacentHTML('afterend', cardsHTML);
}

/**
 * Load technicians
 */
async function loadTechnicians() {
    try {
        technicians = await getShopTechnicians(shopId);
        
        // Obtener estadísticas de reparaciones para cada técnico
        const supabase = getSupabase();
        const techsWithStats = await Promise.all(technicians.map(async (tech) => {
            // Total de reparaciones
            const { count: totalRepairs } = await supabase
                .from('repairs')
                .select('id', { count: 'exact', head: true })
                .eq('tech_id', tech.id)
                .eq('is_deleted', false);
            
            // Reparaciones activas (no entregadas ni canceladas)
            const { count: activeRepairs } = await supabase
                .from('repairs')
                .select('id', { count: 'exact', head: true })
                .eq('tech_id', tech.id)
                .not('status', 'in', '(delivered,cancelled)')
                .eq('is_deleted', false);
            
            // Reparaciones completadas (entregadas)
            const { count: completedRepairs } = await supabase
                .from('repairs')
                .select('id', { count: 'exact', head: true })
                .eq('tech_id', tech.id)
                .eq('status', 'delivered')
                .eq('is_deleted', false);
            
            // Total de comisiones ganadas
            const { data: commissionData } = await supabase
                .from('repairs')
                .select('tech_commission')
                .eq('tech_id', tech.id)
                .eq('status', 'delivered')
                .eq('is_deleted', false);
            
            const totalCommissions = commissionData?.reduce((sum, r) => sum + (r.tech_commission || 0), 0) || 0;
            
            return {
                ...tech,
                repairs_count: totalRepairs || 0,
                active_repairs: activeRepairs || 0,
                completed_repairs: completedRepairs || 0,
                total_commissions: totalCommissions
            };
        }));
        
        technicians = techsWithStats;
        renderTechniciansGrid(technicians);
        populateTechSelect();
    } catch (error) {
        console.error('Error loading technicians:', error);
    }
}

/**
 * Render technicians grid
 */
function renderTechniciansGrid(techsData) {
    const container = $('#technicians-grid');
    
    if (!techsData.length) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <p>No hay técnicos registrados</p>
                <button class="btn btn-primary btn-sm" id="btn-empty-tech">Agregar Técnico</button>
            </div>
        `;
        $('#btn-empty-tech')?.addEventListener('click', () => openTechModal());
        return;
    }
    
    container.innerHTML = techsData.map(tech => `
        <div class="card tech-card" data-id="${tech.id}">
            <div class="card-body">
                <div class="tech-card-header">
                    <div class="avatar" style="background: linear-gradient(135deg, var(--accent, #6366F1) 0%, var(--accent-dark, #4F46E5) 100%);">${getInitials(tech.full_name)}</div>
                    <div class="tech-card-info">
                        <span class="tech-name">${tech.full_name}</span>
                        ${tech.email ? `<span class="tech-email">${tech.email}</span>` : ''}
                        ${tech.phone || tech.whatsapp ? `
                            <span class="tech-phone" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                </svg>
                                ${formatPhone(tech.phone || tech.whatsapp)}
                            </span>
                        ` : ''}
                    </div>
                </div>
                
                <div class="tech-card-stats-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 16px 0;">
                    <div class="tech-stat" style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                        <span class="tech-stat-value" style="font-size: 24px; font-weight: 700; color: var(--primary);">${tech.repairs_count || 0}</span>
                        <span class="tech-stat-label" style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total</span>
                    </div>
                    <div class="tech-stat" style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                        <span class="tech-stat-value" style="font-size: 24px; font-weight: 700; color: var(--warning);">${tech.active_repairs || 0}</span>
                        <span class="tech-stat-label" style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Activas</span>
                    </div>
                    <div class="tech-stat" style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                        <span class="tech-stat-value" style="font-size: 24px; font-weight: 700; color: var(--success);">${tech.completed_repairs || 0}</span>
                        <span class="tech-stat-label" style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Completadas</span>
                    </div>
                    <div class="tech-stat" style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                        <span class="tech-stat-value" style="font-size: 24px; font-weight: 700; color: var(--accent);">${tech.commission_percentage || tech.commission_rate || 30}%</span>
                        <span class="tech-stat-label" style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Comisión</span>
                    </div>
                </div>
                
                ${tech.total_commissions > 0 ? `
                    <div style="padding: 10px; background: linear-gradient(135deg, var(--success-bg, rgba(34,197,94,0.1)) 0%, transparent 100%); border-radius: 8px; margin-bottom: 12px; border-left: 3px solid var(--success);">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Comisiones Ganadas</div>
                        <div style="font-size: 20px; font-weight: 700; color: var(--success);">${formatCurrency(tech.total_commissions)}</div>
                    </div>
                ` : ''}
                
                <div style="display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap;">
                    <span class="badge" style="font-size: 10px; padding: 4px 8px; background: ${tech.is_active ? 'var(--success-bg, rgba(34,197,94,0.1))' : 'var(--error-bg, rgba(239,68,68,0.1))'}; color: ${tech.is_active ? 'var(--success)' : 'var(--error)'}; border: 1px solid ${tech.is_active ? 'var(--success)' : 'var(--error)'}; border-radius: 4px;">
                        ● ${tech.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                    <span class="badge" style="font-size: 10px; padding: 4px 8px; background: var(--bg-secondary); color: var(--text-secondary); border-radius: 4px;">
                        Desde ${formatDate(tech.created_at)}
                    </span>
                </div>
                
                <div class="tech-card-actions">
                    <button class="btn btn-ghost btn-sm btn-edit-tech" style="flex: 1;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Editar
                    </button>
                    <button class="btn btn-whatsapp btn-sm btn-whatsapp-tech" style="flex: 1;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        WhatsApp
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Populate tech select in wizard
 */
function populateTechSelect() {
    const select = $('#wizard-tech-select');
    if (!select) return;
    
    select.innerHTML = `
        <option value="">Sin asignar</option>
        ${technicians.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('')}
    `;
}

/**
 * Load finances with advanced filtering and management
 */
async function loadFinances() {
    console.log('=== INICIANDO CARGA DE SECCIÓN FINANZAS ===');
    console.log('Shop ID actual:', shopId);
    
    try {
        // Initialize finance section
        setupFinanceFilters();
        
        // Load initial data for today
        await applyFinanceFilter('today');
        
        console.log('=== FINANZAS CARGADAS EXITOSAMENTE ===');
        
    } catch (error) {
        console.error('Error loading finances:', error);
        toast.error('Error al cargar la sección de finanzas');
    }
}

/**
 * Setup finance filter controls
 */
function setupFinanceFilters() {
    // Initialize date inputs with current date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    $('#start-date').value = todayStr;
    $('#end-date').value = todayStr;
    
    // Period tabs with new premium design
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', async (e) => {
            const button = e.target.closest('.filter-tab');
            if (!button) return;
            
            const period = button.dataset.period;
            
            // Update active tab
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            button.classList.add('active');
            
            // Show/hide custom date range
            const customRange = $('#date-range-picker');
            if (period === 'custom') {
                customRange.style.display = 'block';
            } else {
                customRange.style.display = 'none';
                await applyFinanceFilter(period);
            }
        });
    });
    
    // Custom date range apply button
    $('#apply-dates')?.addEventListener('click', async () => {
        const startDate = $('#start-date').value;
        const endDate = $('#end-date').value;
        
        if (startDate && endDate) {
            await applyFinanceFilter('custom', startDate, endDate);
        } else {
            toast.error('Por favor selecciona ambas fechas');
        }
    });
    
    // Commission view button with smooth scroll
    $('#view-commissions-btn')?.addEventListener('click', () => {
        const commissionsSection = $('#commissions-section');
        if (commissionsSection) {
            commissionsSection.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        }
    });
    
    // Filter controls
    $('#tech-filter')?.addEventListener('change', applyTransactionFilters);
    $('#status-filter')?.addEventListener('change', applyTransactionFilters);
    
    // Export button
    $('#export-btn')?.addEventListener('click', exportFinancialReport);
    
    // Cash closure button
    $('#close-cash-btn')?.addEventListener('click', openCashClosureModal);
    
    // Commission report button
    $('#commission-report-btn')?.addEventListener('click', generateCommissionReport);
    
    // Mark all paid button
    $('#mark-all-paid-btn')?.addEventListener('click', markAllCommissionsPaid);
    
    // Animate metrics cards on load
    animateMetricCards();
}

/**
 * Apply finance filter based on period
 */
async function applyFinanceFilter(period, startDate = null, endDate = null) {
    try {
        // Calculate date range
        const dateRange = calculateDateRange(period, startDate, endDate);
        
        // Store current period
        currentFinancialData.period = period;
        currentFinancialData.startDate = dateRange.start;
        currentFinancialData.endDate = dateRange.end;
        
        // Update period display
        updatePeriodDisplay(period, dateRange.start, dateRange.end);
        
        // Load financial data
        await loadFinancialData(dateRange.start, dateRange.end);
        
    } catch (error) {
        console.error('Error applying finance filter:', error);
    }
}

/**
 * Calculate date range based on period
 */
function calculateDateRange(period, customStart = null, customEnd = null) {
    const now = new Date();
    let start, end;
    
    switch (period) {
        case 'today':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
            
        case 'yesterday':
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
            end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
            break;
            
        case 'week':
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            start = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate());
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
            
        case 'month':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
            
        case 'custom':
            if (customStart && customEnd) {
                start = new Date(customStart);
                end = new Date(customEnd);
                end.setHours(23, 59, 59);
            } else {
                throw new Error('Custom dates required');
            }
            break;
            
        default:
            throw new Error('Invalid period');
    }
    
    return {
        start: start.toISOString(),
        end: end.toISOString()
    };
}

/**
 * Update period display text
 */
function updatePeriodDisplay(period, startDate, endDate) {
    const periodDisplay = $('#current-period-label');
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    let displayText;
    
    switch (period) {
        case 'today':
            displayText = `Resumen del día - ${formatDate(startDate)}`;
            break;
        case 'yesterday':
            displayText = `Ayer - ${formatDate(startDate)}`;
            break;
        case 'week':
            displayText = `Esta semana: ${formatDate(startDate)} - ${formatDate(endDate)}`;
            break;
        case 'month':
            displayText = `Este mes: ${start.getDate()}/${start.getMonth() + 1} - ${end.getDate()}/${end.getMonth() + 1}`;
            break;
        case 'custom':
            displayText = `Período: ${formatDate(startDate)} - ${formatDate(endDate)}`;
            break;
    }
    
    if (periodDisplay) {
        periodDisplay.textContent = displayText;
    }
}

/**
 * Load financial data for date range
 */
async function loadFinancialData(startDate, endDate) {
    try {
        console.log('Cargando datos financieros desde:', startDate, 'hasta:', endDate);
        console.log('Shop ID:', shopId);
        
        // First, check total repairs for this shop
        const { data: allRepairs, error: errorAll } = await getSupabase()
            .from('repairs')
            .select('id, code, status, delivered_date, total_cost, tech_commission')
            .eq('shop_id', shopId);
        
        console.log(`Total de reparaciones en el taller: ${allRepairs?.length || 0}`);
        if (allRepairs && allRepairs.length > 0) {
            const statusCount = allRepairs.reduce((acc, r) => {
                acc[r.status] = (acc[r.status] || 0) + 1;
                return acc;
            }, {});
            console.log('Reparaciones por estado:', statusCount);
            console.log('Reparaciones con delivered_date:', allRepairs.filter(r => r.delivered_date).length);
        }
        
        // Fetch delivered repairs in date range
        const { data: deliveredRepairs, error } = await getSupabase()
            .from('repairs')
            .select(`
                *,
                clients(name),
                tech:profiles!tech_id(id, full_name, commission_percentage)
            `)
            .eq('shop_id', shopId)
            .eq('status', 'delivered')
            .gte('delivered_date', startDate)
            .lte('delivered_date', endDate)
            .order('delivered_date', { ascending: false });
        
        if (error) {
            console.error('Error al cargar reparaciones:', error);
            throw error;
        }
        
        const repairs = deliveredRepairs || [];
        
        console.log(`Se encontraron ${repairs.length} reparaciones entregadas en el período seleccionado`);
        if (repairs.length > 0) {
            console.log('Ejemplo de reparación:', repairs[0]);
        } else {
            console.warn('⚠️ No hay reparaciones entregadas en este período');
            console.log('Verifica que:');
            console.log('1. Las reparaciones tengan status="delivered"');
            console.log('2. El campo delivered_date esté poblado');
            console.log('3. Las fechas estén en el rango seleccionado');
        }
        
        // Calculate financial metrics
        const metrics = calculateFinancialMetrics(repairs);
        
        console.log('Métricas calculadas:', metrics);
        
        // Store current financial data
        currentFinancialData.repairs = repairs;
        currentFinancialData.metrics = metrics;
        
        // Update finance cards
        updateFinanceCards(metrics, repairs.length);
        
        // Update commission breakdown
        updateCommissionBreakdown(repairs);
        
        // Update transactions
        updateTransactionsList(repairs);
        
        // Load technicians for filter
        await loadTechniciansFilter();
        
    } catch (error) {
        console.error('Error loading financial data:', error);
        toast.error('Error al cargar datos financieros');
    }
}

/**
 * Calculate financial metrics from repairs
 */
function calculateFinancialMetrics(repairs) {
    console.log('Calculando métricas para', repairs.length, 'reparaciones');
    
    // Revenue = Lo que se cobró a los clientes (final_amount)
    const revenue = repairs.reduce((sum, r) => {
        const value = r.final_amount || 0;
        console.log(`Reparación #${r.code}: final_amount=${value}`);
        return sum + value;
    }, 0);
    
    // Costs = Costo de repuestos/insumos (total_cost)
    const costs = repairs.reduce((sum, r) => {
        const value = r.total_cost || 0;
        console.log(`Reparación #${r.code}: total_cost=${value}`);
        return sum + value;
    }, 0);
    
    // Commissions = Comisión de técnicos (tech_commission)
    const commissions = repairs.reduce((sum, r) => {
        const value = r.tech_commission || 0;
        console.log(`Reparación #${r.code}: tech_commission=${value}`);
        return sum + value;
    }, 0);
    
    // Net = Ingreso total - costos - comisiones
    const net = revenue - costs - commissions;
    
    console.log('Resultado:', {
        revenue,
        costs,
        commissions,
        net
    });
    
    return {
        revenue,
        costs,
        commissions,
        net
    };
}

/**
 * Update finance overview cards with animations
 */
function updateFinanceCards(metrics, repairCount) {
    console.log('Actualizando tarjetas financieras:', metrics, 'Reparaciones:', repairCount);
    
    // Update values with animation
    animateCount('#revenue-amount', metrics.revenue);
    animateCount('#commission-amount', metrics.commissions);
    animateCount('#profit-amount', metrics.net);
    animateCount('#costs-amount', metrics.costs);
    
    // Update details with new selectors - usar querySelector para mayor precisión
    const revenueDetailElement = document.querySelector('#revenue-detail span');
    if (revenueDetailElement) {
        revenueDetailElement.textContent = `${repairCount} reparación${repairCount !== 1 ? 'es' : ''} completada${repairCount !== 1 ? 's' : ''}`;
    }
    
    const costsDetailElement = document.querySelector('#costs-detail span');
    if (costsDetailElement) {
        costsDetailElement.textContent = 'Repuestos y materiales';
    }
    
    const commissionDetailElement = document.querySelector('#commission-detail span');
    if (commissionDetailElement) {
        commissionDetailElement.textContent = metrics.commissions > 0 ? 'Pendientes de pago' : 'Sin comisiones pendientes';
    }
    
    const profitDetailElement = document.querySelector('#profit-detail span');
    if (profitDetailElement) {
        profitDetailElement.textContent = 'Después de comisiones';
    }
}

/**
 * Animate number counting up
 */
function animateCount(selector, finalValue) {
    const element = document.querySelector(selector);
    if (!element) {
        console.warn('Elemento no encontrado:', selector);
        return;
    }
    
    console.log('Animando contador:', selector, 'Valor final:', finalValue);
    
    // Si el valor es 0, no animar
    if (finalValue === 0) {
        element.textContent = formatCurrency(0);
        return;
    }
    
    const duration = 1000; // 1 second
    const steps = 30;
    const increment = finalValue / steps;
    let current = 0;
    let step = 0;
    
    const timer = setInterval(() => {
        current += increment;
        step++;
        
        if (step >= steps) {
            current = finalValue;
            clearInterval(timer);
        }
        
        element.textContent = formatCurrency(Math.floor(current));
    }, duration / steps);
}

/**
 * Animate metric cards on load
 */
function animateMetricCards() {
    const cards = document.querySelectorAll('.metric-card-premium[data-animate]');
    cards.forEach((card, index) => {
        setTimeout(() => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, 50);
        }, index * 100);
    });
}

/**
 * Generate commission report
 */
/**
 * Generate commission report
 */
async function generateCommissionReport() {
    try {
        const { repairs, startDate, endDate } = currentFinancialData;
        
        if (!repairs || repairs.length === 0) {
            toast.warning('No hay datos de comisiones para generar reporte');
            return;
        }
        
        // Group repairs by technician (only unpaid commissions)
        const techCommissions = {};
        
        repairs.forEach(repair => {
            // Skip if no tech, no commission, already paid, or deleted
            if (!repair.tech || 
                !repair.tech_commission || 
                repair.tech_commission === 0 ||
                repair.commission_paid === true) {
                return;
            }
            
            const techId = repair.tech_id;
            if (!techCommissions[techId]) {
                techCommissions[techId] = {
                    id: techId,
                    name: repair.tech.full_name,
                    commission: 0,
                    repairs: [],
                    commissionRate: repair.tech.commission_percentage || 0
                };
            }
            
            techCommissions[techId].commission += repair.tech_commission;
            techCommissions[techId].repairs.push({
                code: repair.code,
                date: repair.delivered_date,
                total: repair.final_amount,
                commission: repair.tech_commission
            });
        });
        
        const techs = Object.values(techCommissions);
        
        if (techs.length === 0) {
            toast.warning('No hay comisiones pendientes en este período');
            return;
        }
        
        // Generate HTML report
        const reportHTML = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Reporte de Comisiones - ${shop.name}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                        padding: 40px;
                        background: white;
                        color: #000;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 40px;
                        padding-bottom: 20px;
                        border-bottom: 2px solid #333;
                    }
                    .header h1 {
                        font-size: 28px;
                        margin-bottom: 8px;
                    }
                    .header .subtitle {
                        font-size: 16px;
                        color: #666;
                    }
                    .period {
                        text-align: center;
                        margin-bottom: 30px;
                        font-size: 14px;
                        color: #666;
                    }
                    .tech-section {
                        margin-bottom: 40px;
                        page-break-inside: avoid;
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        overflow: hidden;
                    }
                    .tech-header {
                        background: #f5f5f5;
                        padding: 20px;
                        border-bottom: 1px solid #ddd;
                    }
                    .tech-name {
                        font-size: 20px;
                        font-weight: bold;
                        margin-bottom: 8px;
                    }
                    .tech-summary {
                        display: flex;
                        gap: 30px;
                        font-size: 14px;
                        color: #666;
                    }
                    .tech-summary-item {
                        display: flex;
                        gap: 8px;
                    }
                    .tech-summary-label {
                        font-weight: 600;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    th, td {
                        padding: 12px 20px;
                        text-align: left;
                        border-bottom: 1px solid #eee;
                    }
                    th {
                        background: #fafafa;
                        font-weight: 600;
                        font-size: 13px;
                        color: #666;
                        text-transform: uppercase;
                    }
                    td {
                        font-size: 14px;
                    }
                    .text-right {
                        text-align: right;
                    }
                    .tech-total {
                        background: #f9f9f9;
                        padding: 20px;
                        text-align: right;
                        font-size: 18px;
                        font-weight: bold;
                    }
                    .grand-total {
                        margin-top: 30px;
                        padding: 20px;
                        background: #333;
                        color: white;
                        text-align: right;
                        font-size: 20px;
                        font-weight: bold;
                        border-radius: 8px;
                    }
                    .footer {
                        margin-top: 40px;
                        padding-top: 20px;
                        border-top: 1px solid #ddd;
                        text-align: center;
                        font-size: 12px;
                        color: #999;
                    }
                    @media print {
                        body { padding: 20px; }
                        .tech-section { page-break-inside: avoid; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>⚡ ${shop.name}</h1>
                    <div class="subtitle">Reporte de Comisiones</div>
                </div>
                
                <div class="period">
                    Período: ${formatDate(startDate)} - ${formatDate(endDate)}
                </div>
                
                ${techs.map(tech => `
                    <div class="tech-section">
                        <div class="tech-header">
                            <div class="tech-name">${tech.name}</div>
                            <div class="tech-summary">
                                <div class="tech-summary-item">
                                    <span class="tech-summary-label">Reparaciones:</span>
                                    <span>${tech.repairs.length}</span>
                                </div>
                                <div class="tech-summary-item">
                                    <span class="tech-summary-label">Comisión:</span>
                                    <span>${tech.commissionRate}%</span>
                                </div>
                            </div>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Fecha</th>
                                    <th class="text-right">Total</th>
                                    <th class="text-right">Comisión</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tech.repairs.map(repair => `
                                    <tr>
                                        <td>#${repair.code}</td>
                                        <td>${formatDate(repair.date)}</td>
                                        <td class="text-right">${formatCurrency(repair.total)}</td>
                                        <td class="text-right">${formatCurrency(repair.commission)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div class="tech-total">
                            Total a Pagar: ${formatCurrency(tech.commission)}
                        </div>
                    </div>
                `).join('')}
                
                <div class="grand-total">
                    Total General de Comisiones: ${formatCurrency(techs.reduce((sum, t) => sum + t.commission, 0))}
                </div>
                
                <div class="footer">
                    Generado el ${formatDateTime(new Date().toISOString())} - FIXORA
                </div>
            </body>
            </html>
        `;
        
        // Open in new window for printing
        const printWindow = window.open('', '_blank');
        printWindow.document.write(reportHTML);
        printWindow.document.close();
        
        // Auto-print after a short delay
        setTimeout(() => {
            printWindow.print();
        }, 500);
        
        toast.success('Reporte de comisiones generado');
        
    } catch (error) {
        console.error('Error generating commission report:', error);
        toast.error('Error al generar el reporte');
    }
}

/**
 * Mark all commissions as paid
 */
async function markAllCommissionsPaid() {
    try {
        const { repairs } = currentFinancialData;
        
        if (!repairs || repairs.length === 0) {
            toast.warning('No hay comisiones para procesar');
            return;
        }
        
        // Group repairs by technician (only unpaid commissions)
        const techCommissions = {};
        
        repairs.forEach(repair => {
            // Skip if no tech, no commission, already paid, or deleted
            if (!repair.tech || 
                !repair.tech_commission || 
                repair.tech_commission === 0 ||
                repair.commission_paid === true) {
                return;
            }
            
            const techId = repair.tech_id;
            if (!techCommissions[techId]) {
                techCommissions[techId] = {
                    id: techId,
                    name: repair.tech.full_name,
                    commission: 0,
                    repairIds: []
                };
            }
            
            techCommissions[techId].commission += repair.tech_commission;
            techCommissions[techId].repairIds.push(repair.id);
        });
        
        const techs = Object.values(techCommissions);
        
        if (techs.length === 0) {
            toast.warning('No hay comisiones pendientes');
            return;
        }
        
        // Show confirmation modal with breakdown
        const totalCommission = techs.reduce((sum, t) => sum + t.commission, 0);
        
        const confirmed = await confirmModal(
            'Marcar Comisiones como Pagadas',
            `
                <div style="text-align: left;">
                    <p style="margin-bottom: 16px; color: var(--text-secondary);">
                        Se marcarán las siguientes comisiones como pagadas:
                    </p>
                    <div style="background: var(--bg-elevated); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                        ${techs.map(tech => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-subtle);">
                                <span style="color: var(--text-primary);">${tech.name}</span>
                                <span style="font-weight: 600; color: var(--success);">${formatCurrency(tech.commission)}</span>
                            </div>
                        `).join('')}
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; margin-top: 8px; font-size: 18px;">
                            <span style="font-weight: 600; color: var(--text-primary);">Total</span>
                            <span style="font-weight: bold; color: var(--primary);">${formatCurrency(totalCommission)}</span>
                        </div>
                    </div>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        Nota: Se registrará el pago de estas comisiones en el historial.
                    </p>
                </div>
            `,
            'Sí, marcar como pagadas',
            'Cancelar'
        );
        
        if (!confirmed) return;
        
        // Get current user ID
        const { data: { user } } = await getSupabase().auth.getUser();
        
        if (!user) {
            toast.error('No se pudo obtener el usuario actual');
            return;
        }
        
        // Get all repair IDs to update
        const allRepairIds = techs.flatMap(t => t.repairIds);
        
        // Update repairs in database
        showLoading();
        const { error } = await getSupabase()
            .from('repairs')
            .update({ 
                commission_paid: true,
                commission_paid_date: new Date().toISOString(),
                commission_paid_by: user.id
            })
            .in('id', allRepairIds);
        
        hideLoading();
        
        if (error) {
            console.error('Error updating commissions:', error);
            toast.error('Error al actualizar las comisiones');
            return;
        }
        
        // Show success messages
        toast.success(`Comisiones marcadas como pagadas: ${formatCurrency(totalCommission)}`);
        
        // Show individual notifications
        for (const tech of techs) {
            setTimeout(() => {
                toast.success(`${tech.name}: ${formatCurrency(tech.commission)} pagado`);
            }, 500);
        }
        
        // Reload financial data to reflect changes
        setTimeout(async () => {
            await loadFinancialData(currentFinancialData.startDate, currentFinancialData.endDate);
        }, 1500);
        
    } catch (error) {
        console.error('Error marking commissions as paid:', error);
        toast.error('Error al marcar las comisiones como pagadas');
    }
}

/**
 * Update commission breakdown by technician - Premium Design
 * Only shows unpaid commissions
 */
function updateCommissionBreakdown(repairs) {
    const commissionGrid = $('#commission-grid');
    const emptyState = $('#commission-empty');
    const commissionCount = $('#commission-count');
    
    // Group repairs by technician (only unpaid commissions)
    const techCommissions = {};
    
    repairs.forEach(repair => {
        // Skip if no tech, no commission, already paid, or deleted
        if (!repair.tech || 
            !repair.tech_commission || 
            repair.tech_commission === 0 ||
            repair.commission_paid === true) {
            return;
        }
        
        const techId = repair.tech_id;
        if (!techCommissions[techId]) {
            techCommissions[techId] = {
                name: repair.tech.full_name,
                commission: 0,
                repairs: 0,
                commissionRate: repair.tech.commission_percentage || 0
            };
        }
        
        techCommissions[techId].commission += repair.tech_commission;
        techCommissions[techId].repairs += 1;
    });
    
    const techs = Object.entries(techCommissions);
    
    // Update count
    if (commissionCount) {
        commissionCount.textContent = techs.length > 0 
            ? `${techs.length} técnico${techs.length !== 1 ? 's' : ''} con comisiones pendientes`
            : 'Sin comisiones pendientes';
    }
    
    if (techs.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        commissionGrid.innerHTML = '';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    commissionGrid.innerHTML = techs.map(([techId, data]) => `
        <div class="commission-card-premium" data-tech-id="${techId}">
            <div class="card-bg-pattern"></div>
            <div class="commission-card-header">
                <div class="commission-tech-info">
                    <div class="commission-avatar-premium">
                        ${getInitials(data.name)}
                    </div>
                    <div class="commission-tech-details">
                        <div class="commission-tech-name">${data.name}</div>
                        <div class="commission-tech-meta">${data.repairs} reparación${data.repairs !== 1 ? 'es' : ''}</div>
                    </div>
                </div>
                <div class="commission-status-badge pending">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12,6 12,12 16,14"/>
                    </svg>
                    <span>Pendiente</span>
                </div>
            </div>
            <div class="commission-amount-premium">${formatCurrency(data.commission)}</div>
            <div class="commission-info-row">
                <div class="commission-info-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2v20m7-16H5a3 3 0 100 6h9a3 3 0 110 6H9"/>
                    </svg>
                    <span>${data.commissionRate}% de comisión</span>
                </div>
            </div>
            <div class="commission-card-actions">
                <button class="btn-premium success btn-mark-paid" data-tech-id="${techId}" data-tech-name="${data.name.replace(/"/g, '&quot;')}" data-commission="${data.commission}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9,11 12,14 22,4"/>
                        <path d="M21,12v7a2,2 0 0,1-2,2H5a2,2 0 0,1-2-2V5a2,2 0 0,1,2-2h11"/>
                    </svg>
                    <span>Marcar Pagado</span>
                </button>
                <button class="btn-premium outline btn-view-details" data-tech-id="${techId}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <span>Ver Detalle</span>
                </button>
            </div>
        </div>
    `).join('');
    
    // Setup event listeners for commission cards
    setupCommissionCardListeners();
}

/**
 * Setup event listeners for commission cards
 */
function setupCommissionCardListeners() {
    // View details buttons
    document.querySelectorAll('.btn-view-details').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const techId = this.dataset.techId;
            console.log('Button clicked, techId:', techId);
            viewTechDetails(techId);
        });
    });
    
    // Mark paid buttons
    document.querySelectorAll('.btn-mark-paid').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const techId = this.dataset.techId;
            const techName = this.dataset.techName;
            const commission = parseFloat(this.dataset.commission);
            console.log('Mark paid clicked:', techId, techName, commission);
            markCommissionPaid(techId, techName, commission);
        });
    });
}

/**
 * Update transactions list - Premium Design
 */
function updateTransactionsList(repairs) {
    const transactionsList = $('#transaction-list');
    const transactionsTbody = $('#transaction-table-body');
    const emptyState = $('#transaction-empty');
    const transactionCount = $('#transaction-count');
    
    // Update count
    if (transactionCount) {
        transactionCount.textContent = repairs.length > 0 
            ? `${repairs.length} transacción${repairs.length !== 1 ? 'es' : ''} registrada${repairs.length !== 1 ? 's' : ''}`
            : 'Sin transacciones registradas';
    }
    
    if (repairs.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        if (transactionsList) transactionsList.innerHTML = '';
        if (transactionsTbody) transactionsTbody.innerHTML = `
            <tr>
                <td colspan="10">
                    <div class="empty-state-premium">
                        <div class="empty-icon-premium">
                            <div class="empty-icon-bg"></div>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <line x1="12" y1="1" x2="12" y2="23"/>
                                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                            </svg>
                        </div>
                        <div class="empty-text-premium">
                            <h3>Sin movimientos</h3>
                            <p>No hay entregas registradas en el período seleccionado</p>
                        </div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    // Mobile list with premium design
    if (transactionsList) {
        transactionsList.innerHTML = repairs.map(repair => {
            // Calcular ganancia neta del taller (lo que queda después de costos y comisión)
            const totalCobrado = repair.final_amount || 0;
            const costoRepuestos = repair.total_cost || 0;
            const comision = repair.tech_commission || 0;
            const netProfit = totalCobrado - costoRepuestos - comision;
            
            return `
                <div class="transaction-item-premium" onclick="viewRepairDetails(${repair.id})">
                    <div class="card-bg-pattern"></div>
                    <div class="transaction-header-premium">
                        <div class="transaction-code-premium">#${repair.code}</div>
                        <div class="transaction-amount-premium">${formatCurrency(totalCobrado)}</div>
                    </div>
                    <div class="transaction-details-premium">
                        <div class="transaction-detail-item">
                            <div class="transaction-detail-label">Cliente</div>
                            <div class="transaction-detail-value">${repair.clients?.name || '-'}</div>
                        </div>
                        <div class="transaction-detail-item">
                            <div class="transaction-detail-label">Técnico</div>
                            <div class="transaction-detail-value">${repair.tech?.full_name || '-'}</div>
                        </div>
                        <div class="transaction-detail-item">
                            <div class="transaction-detail-label">Comisión</div>
                            <div class="transaction-detail-value">${formatCurrency(comision)}</div>
                        </div>
                        <div class="transaction-detail-item">
                            <div class="transaction-detail-label">Ganancia</div>
                            <div class="transaction-detail-value" style="color: var(--success);">${formatCurrency(netProfit)}</div>
                        </div>
                    </div>
                    <div class="transaction-footer-premium">
                        <div class="commission-status-badge ${repair.commission_paid ? 'paid' : 'pending'}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${repair.commission_paid 
                                    ? '<polyline points="20,6 9,17 4,12"/>'
                                    : '<circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>'
                                }
                            </svg>
                            <span>${repair.commission_paid ? 'Pagado' : 'Pendiente'}</span>
                        </div>
                        <div class="transaction-date-premium">${formatDate(repair.delivered_date)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // Desktop table
    if (transactionsTbody) {
        transactionsTbody.innerHTML = repairs.map(repair => {
            // Calcular ganancia neta del taller (lo que queda después de costos y comisión)
            const totalCobrado = repair.final_amount || 0;
            const costoRepuestos = repair.total_cost || 0;
            const comision = repair.tech_commission || 0;
            const netProfit = totalCobrado - costoRepuestos - comision;
            
            return `
                <tr onclick="viewRepairDetails(${repair.id})" style="cursor: pointer;">
                    <td><strong style="color: var(--primary);">#${repair.code}</strong></td>
                    <td>${repair.clients?.name || '-'}</td>
                    <td>${repair.tech?.full_name || '-'}</td>
                    <td><strong>${formatCurrency(totalCobrado)}</strong></td>
                    <td>${formatCurrency(costoRepuestos)}</td>
                    <td>${formatCurrency(comision)}</td>
                    <td><strong style="color: var(--success);">${formatCurrency(netProfit)}</strong></td>
                    <td>
                        <div class="commission-status-badge ${repair.commission_paid ? 'paid' : 'pending'}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${repair.commission_paid 
                                    ? '<polyline points="20,6 9,17 4,12"/>'
                                    : '<circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>'
                                }
                            </svg>
                            <span>${repair.commission_paid ? 'Pagado' : 'Pendiente'}</span>
                        </div>
                    </td>
                    <td>${formatDate(repair.delivered_date)}</td>
                    <td>
                        <button class="btn-premium outline" onclick="event.stopPropagation(); viewRepairDetails(${repair.id})" style="padding: 8px; width: auto;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

/**
 * Load technicians for filter dropdown
 */
async function loadTechniciansFilter() {
    try {
        const { data: technicians } = await getSupabase()
            .from('profiles')
            .select('id, full_name')
            .eq('shop_id', shopId)
            .eq('role', 'tech')
            .order('full_name');
        
        const techFilter = $('#tech-filter');
        if (techFilter && technicians) {
            const currentOptions = techFilter.innerHTML;
            const newOptions = technicians.map(tech => 
                `<option value="${tech.id}">${tech.full_name}</option>`
            ).join('');
            
            techFilter.innerHTML = `
                <option value="">Todos los técnicos</option>
                ${newOptions}
            `;
        }
    } catch (error) {
        console.error('Error loading technicians filter:', error);
    }
}

/**
 * Apply transaction filters
 */
function applyTransactionFilters() {
    const techFilter = $('#tech-filter')?.value;
    const statusFilter = $('#status-filter')?.value;
    
    // Filter transaction items in mobile view
    const transactionItems = document.querySelectorAll('.transaction-item');
    transactionItems.forEach(item => {
        let show = true;
        // Add filtering logic if needed
        item.style.display = show ? 'block' : 'none';
    });
    
    // Filter table rows in desktop view
    const tableRows = document.querySelectorAll('#transactions-tbody tr');
    tableRows.forEach(row => {
        let show = true;
        // Add filtering logic if needed
        row.style.display = show ? '' : 'none';
    });
}

/**
 * Export financial report
 */
/**
 * Export financial report to CSV
 */
function exportFinancialReport() {
    try {
        const { repairs, metrics, startDate, endDate, period } = currentFinancialData;
        
        if (!repairs || repairs.length === 0) {
            toast.warning('No hay datos para exportar en este período');
            return;
        }
        
        // Prepare CSV data
        const headers = [
            'Código',
            'Cliente',
            'Dispositivo',
            'Técnico',
            'Fecha Entrega',
            'Total',
            'Costo Piezas',
            'Comisión Técnico',
            'Ganancia Neta'
        ];
        
        const rows = repairs.map(repair => {
            const total = repair.final_amount || 0;
            const parts = repair.total_cost || 0;
            const commission = repair.tech_commission || 0;
            const net = total - parts - commission;
            
            return [
                repair.code || '',
                repair.clients?.name || 'Sin cliente',
                `${repair.device_brand} ${repair.device_model}`,
                repair.tech?.full_name || 'Sin asignar',
                formatDate(repair.delivered_date),
                total.toFixed(2),
                parts.toFixed(2),
                commission.toFixed(2),
                net.toFixed(2)
            ];
        });
        
        // Add summary row
        rows.push([]);
        rows.push(['RESUMEN DEL PERÍODO']);
        rows.push(['Total Ingresos', '', '', '', '', metrics.revenue.toFixed(2)]);
        rows.push(['Total Costos', '', '', '', '', metrics.costs.toFixed(2)]);
        rows.push(['Total Comisiones', '', '', '', '', metrics.commissions.toFixed(2)]);
        rows.push(['Ganancia Neta', '', '', '', '', metrics.net.toFixed(2)]);
        
        // Convert to CSV
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        // Create blob and download
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        const fileName = `reporte_financiero_${period}_${new Date().toISOString().split('T')[0]}.csv`;
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.success('Reporte exportado exitosamente');
        
    } catch (error) {
        console.error('Error exporting report:', error);
        toast.error('Error al exportar el reporte');
    }
}

/**
 * Open cash closure modal
 */
function openCashClosureModal() {
    const { repairs, metrics, startDate, endDate, period } = currentFinancialData;
    
    if (!metrics) {
        toast.warning('No hay datos financieros cargados');
        return;
    }
    
    // Get closure period info
    const today = new Date();
    const closureDate = today.toISOString().split('T')[0];
    const closureTime = today.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    
    // Calculate payment method breakdown (assuming all cash for now, can be extended)
    const totalTransactions = repairs.length;
    const cashTransactions = repairs.filter(r => r.payment_method === 'cash' || !r.payment_method).length;
    const cardTransactions = repairs.filter(r => r.payment_method === 'card').length;
    const transferTransactions = repairs.filter(r => r.payment_method === 'transfer').length;
    
    // Calculate expected cash (revenue from cash payments only)
    const expectedCash = repairs
        .filter(r => r.payment_method === 'cash' || !r.payment_method)
        .reduce((sum, r) => sum + (r.final_amount || 0), 0);
    
    // Calculate detailed breakdown
    const totalRepairs = repairs.filter(r => r.status === 'delivered').length;
    const pendingRepairs = repairs.filter(r => r.status !== 'delivered' && r.status !== 'cancelled').length;
    
    // Period display
    let periodDisplay = '';
    if (period === 'today') periodDisplay = 'Hoy';
    else if (period === 'week') periodDisplay = 'Esta Semana';
    else if (period === 'month') periodDisplay = 'Este Mes';
    else periodDisplay = `${formatDate(startDate)} - ${formatDate(endDate)}`;
    
    const cashClosureModal = modal.create({
        title: '💰 Cierre de Caja',
        content: `
            <div class="cash-closure-content">
                <!-- Header with Date & Time -->
                <div class="closure-header-premium">
                    <div class="closure-date-time">
                        <div class="closure-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                        </div>
                        <div class="closure-date-info">
                            <div class="closure-period">${periodDisplay}</div>
                            <div class="closure-timestamp">${formatDate(closureDate)} • ${closureTime}</div>
                        </div>
                    </div>
                    <button class="print-closure-btn" id="print-closure-btn" title="Imprimir cierre">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 6 2 18 2 18 9"/>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                    </button>
                </div>

                <!-- Financial Summary Grid -->
                <div class="closure-grid">
                    <!-- Main Metrics -->
                    <div class="closure-card revenue-card">
                        <div class="card-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="1" x2="12" y2="23"/>
                                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                            </svg>
                        </div>
                        <div class="card-content">
                            <div class="card-label">Total Ingresos</div>
                            <div class="card-value">${formatCurrency(metrics.revenue)}</div>
                            <div class="card-detail">${totalTransactions} transacciones</div>
                        </div>
                    </div>

                    <div class="closure-card costs-card">
                        <div class="card-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="16"/>
                                <line x1="8" y1="12" x2="16" y2="12"/>
                            </svg>
                        </div>
                        <div class="card-content">
                            <div class="card-label">Total Costos</div>
                            <div class="card-value">${formatCurrency(metrics.costs)}</div>
                            <div class="card-detail">Repuestos y materiales</div>
                        </div>
                    </div>

                    <div class="closure-card commissions-card">
                        <div class="card-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                <circle cx="8.5" cy="7" r="4"/>
                                <line x1="20" y1="8" x2="20" y2="14"/>
                                <line x1="23" y1="11" x2="17" y2="11"/>
                            </svg>
                        </div>
                        <div class="card-content">
                            <div class="card-label">Comisiones</div>
                            <div class="card-value">${formatCurrency(metrics.commissions)}</div>
                            <div class="card-detail">Técnicos</div>
                        </div>
                    </div>

                    <div class="closure-card profit-card">
                        <div class="card-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                            </svg>
                        </div>
                        <div class="card-content">
                            <div class="card-label">Ganancia Neta</div>
                            <div class="card-value profit-value">${formatCurrency(metrics.net)}</div>
                            <div class="card-detail">${((metrics.net / metrics.revenue) * 100).toFixed(1)}% margen</div>
                        </div>
                    </div>
                </div>

                <!-- Payment Methods Breakdown -->
                <div class="closure-section">
                    <h4 class="section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                            <line x1="1" y1="10" x2="23" y2="10"/>
                        </svg>
                        Métodos de Pago
                    </h4>
                    <div class="payment-methods-grid">
                        <div class="payment-method">
                            <div class="method-info">
                                <span class="method-icon">💵</span>
                                <span class="method-name">Efectivo</span>
                            </div>
                            <div class="method-stats">
                                <span class="method-count">${cashTransactions} pagos</span>
                                <span class="method-amount">${formatCurrency(expectedCash)}</span>
                            </div>
                        </div>
                        <div class="payment-method">
                            <div class="method-info">
                                <span class="method-icon">💳</span>
                                <span class="method-name">Tarjeta</span>
                            </div>
                            <div class="method-stats">
                                <span class="method-count">${cardTransactions} pagos</span>
                                <span class="method-amount">$0</span>
                            </div>
                        </div>
                        <div class="payment-method">
                            <div class="method-info">
                                <span class="method-icon">🏦</span>
                                <span class="method-name">Transferencia</span>
                            </div>
                            <div class="method-stats">
                                <span class="method-count">${transferTransactions} pagos</span>
                                <span class="method-amount">$0</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Repairs Statistics -->
                <div class="closure-section">
                    <h4 class="section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                        </svg>
                        Estadísticas de Reparaciones
                    </h4>
                    <div class="repair-stats">
                        <div class="repair-stat">
                            <div class="stat-value">${totalRepairs}</div>
                            <div class="stat-label">Entregadas</div>
                        </div>
                        <div class="repair-stat">
                            <div class="stat-value">${pendingRepairs}</div>
                            <div class="stat-label">En proceso</div>
                        </div>
                        <div class="repair-stat">
                            <div class="stat-value">${totalTransactions}</div>
                            <div class="stat-label">Total</div>
                        </div>
                    </div>
                </div>

                <!-- Cash Verification Form -->
                <div class="closure-section verification-section">
                    <h4 class="section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 11l3 3L22 4"/>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                        </svg>
                        Verificación de Efectivo
                    </h4>
                    
                    <div class="verification-form">
                        <div class="expected-cash-display">
                            <div class="expected-label">Efectivo Esperado</div>
                            <div class="expected-value">${formatCurrency(expectedCash)}</div>
                        </div>

                        <div class="form-group-premium">
                            <label for="cash-counted" class="form-label-premium">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="1" x2="12" y2="23"/>
                                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                                </svg>
                                Efectivo Contado (Real)
                            </label>
                            <div class="input-with-icon">
                                <span class="input-currency">$</span>
                                <input 
                                    type="number" 
                                    id="cash-counted" 
                                    class="form-control-premium" 
                                    placeholder="0.00" 
                                    step="0.01" 
                                    min="0"
                                    autocomplete="off"
                                >
                            </div>
                        </div>

                        <!-- Difference Display -->
                        <div id="difference-display" class="difference-display" style="display: none;">
                            <div class="difference-content">
                                <div class="difference-icon"></div>
                                <div class="difference-info">
                                    <div class="difference-label">Diferencia</div>
                                    <div class="difference-value" id="difference-value"></div>
                                </div>
                            </div>
                        </div>

                        <div class="form-group-premium">
                            <label for="closure-notes" class="form-label-premium">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                                Notas y Observaciones (Opcional)
                            </label>
                            <textarea 
                                id="closure-notes" 
                                class="form-control-premium" 
                                rows="3" 
                                placeholder="Ej: Billetes en buen estado, sin novedades..."
                            ></textarea>
                        </div>
                    </div>
                </div>
            </div>
            
            <style>
                .cash-closure-content {
                    padding: 4px;
                    max-height: 75vh;
                    overflow-y: auto;
                }
                
                /* Header Premium */
                .closure-header-premium {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px;
                    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, #2563eb) 100%);
                    border-radius: var(--radius-lg);
                    margin-bottom: 24px;
                    color: white;
                }
                
                .closure-date-time {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                
                .closure-icon {
                    width: 48px;
                    height: 48px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .closure-icon svg {
                    width: 24px;
                    height: 24px;
                    stroke: white;
                }
                
                .closure-date-info {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                
                .closure-period {
                    font-size: 18px;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                }
                
                .closure-timestamp {
                    font-size: 13px;
                    opacity: 0.9;
                    font-weight: 500;
                }
                
                .print-closure-btn {
                    width: 40px;
                    height: 40px;
                    background: rgba(255, 255, 255, 0.15);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .print-closure-btn:hover {
                    background: rgba(255, 255, 255, 0.25);
                    transform: translateY(-2px);
                }
                
                .print-closure-btn svg {
                    width: 20px;
                    height: 20px;
                    stroke: white;
                }
                
                /* Grid Layout */
                .closure-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                    margin-bottom: 24px;
                }
                
                .closure-card {
                    background: var(--bg-elevated);
                    border: 1px solid var(--border-light);
                    border-radius: var(--radius-lg);
                    padding: 20px;
                    display: flex;
                    gap: 16px;
                    transition: all 0.3s;
                }
                
                .closure-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
                    border-color: var(--primary-subtle);
                }
                
                .card-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                
                .card-icon svg {
                    width: 24px;
                    height: 24px;
                }
                
                .revenue-card .card-icon {
                    background: var(--success-subtle);
                }
                
                .revenue-card .card-icon svg {
                    stroke: var(--success);
                }
                
                .costs-card .card-icon {
                    background: var(--warning-subtle);
                }
                
                .costs-card .card-icon svg {
                    stroke: var(--warning);
                }
                
                .commissions-card .card-icon {
                    background: var(--info-subtle);
                }
                
                .commissions-card .card-icon svg {
                    stroke: var(--info);
                }
                
                .profit-card .card-icon {
                    background: var(--primary-subtle);
                }
                
                .profit-card .card-icon svg {
                    stroke: var(--primary);
                }
                
                .card-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                
                .card-label {
                    font-size: 13px;
                    color: var(--text-secondary);
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                
                .card-value {
                    font-size: 24px;
                    font-weight: 700;
                    color: var(--text-primary);
                    letter-spacing: -0.02em;
                }
                
                .profit-value {
                    color: var(--primary);
                }
                
                .card-detail {
                    font-size: 12px;
                    color: var(--text-tertiary);
                }
                
                /* Sections */
                .closure-section {
                    background: var(--bg-elevated);
                    border: 1px solid var(--border-light);
                    border-radius: var(--radius-lg);
                    padding: 24px;
                    margin-bottom: 16px;
                }
                
                .section-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 15px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 20px;
                    padding-bottom: 12px;
                    border-bottom: 2px solid var(--border-light);
                }
                
                .section-title svg {
                    width: 20px;
                    height: 20px;
                    stroke: var(--primary);
                }
                
                /* Payment Methods */
                .payment-methods-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                
                .payment-method {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px;
                    background: var(--bg-card);
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-md);
                    transition: all 0.2s;
                }
                
                .payment-method:hover {
                    background: var(--bg-hover);
                    border-color: var(--primary-subtle);
                }
                
                .method-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .method-icon {
                    font-size: 24px;
                }
                
                .method-name {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                }
                
                .method-stats {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 4px;
                }
                
                .method-count {
                    font-size: 12px;
                    color: var(--text-secondary);
                }
                
                .method-amount {
                    font-size: 16px;
                    font-weight: 700;
                    color: var(--text-primary);
                }
                
                /* Repair Stats */
                .repair-stats {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 16px;
                }
                
                .repair-stat {
                    text-align: center;
                    padding: 16px;
                    background: var(--bg-card);
                    border-radius: var(--radius-md);
                }
                
                .stat-value {
                    font-size: 32px;
                    font-weight: 700;
                    color: var(--primary);
                    margin-bottom: 4px;
                }
                
                .stat-label {
                    font-size: 13px;
                    color: var(--text-secondary);
                    font-weight: 500;
                }
                
                /* Verification Section */
                .verification-section {
                    background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-card) 100%);
                    border: 2px solid var(--primary-subtle);
                }
                
                .verification-form {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                
                .expected-cash-display {
                    text-align: center;
                    padding: 20px;
                    background: var(--bg-card);
                    border: 2px dashed var(--border-light);
                    border-radius: var(--radius-md);
                }
                
                .expected-label {
                    font-size: 13px;
                    color: var(--text-secondary);
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 8px;
                }
                
                .expected-value {
                    font-size: 36px;
                    font-weight: 700;
                    color: var(--primary);
                    letter-spacing: -0.02em;
                }
                
                .form-group-premium {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                .form-label-premium {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                }
                
                .form-label-premium svg {
                    width: 18px;
                    height: 18px;
                    stroke: var(--primary);
                }
                
                .input-with-icon {
                    position: relative;
                }
                
                .input-currency {
                    position: absolute;
                    left: 16px;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 20px;
                    font-weight: 700;
                    color: var(--text-secondary);
                    pointer-events: none;
                }
                
                .form-control-premium {
                    width: 100%;
                    padding: 16px 16px 16px 40px;
                    background: var(--bg-input);
                    border: 2px solid var(--border-light);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-size: 18px;
                    font-weight: 600;
                    transition: all 0.3s;
                    font-family: inherit;
                }
                
                .form-control-premium:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 4px var(--primary-subtle);
                    background: var(--bg-elevated);
                }
                
                textarea.form-control-premium {
                    padding: 16px;
                    font-size: 14px;
                    font-weight: 400;
                    resize: vertical;
                    min-height: 80px;
                }
                
                /* Difference Display */
                .difference-display {
                    padding: 16px;
                    border-radius: var(--radius-md);
                    border: 2px solid;
                    animation: slideDown 0.3s ease-out;
                }
                
                .difference-display.positive {
                    background: var(--success-subtle);
                    border-color: var(--success);
                }
                
                .difference-display.negative {
                    background: var(--error-subtle);
                    border-color: var(--error);
                }
                
                .difference-display.neutral {
                    background: var(--info-subtle);
                    border-color: var(--info);
                }
                
                .difference-content {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                
                .difference-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    flex-shrink: 0;
                }
                
                .difference-display.positive .difference-icon {
                    background: var(--success);
                }
                
                .difference-display.negative .difference-icon {
                    background: var(--error);
                }
                
                .difference-display.neutral .difference-icon {
                    background: var(--info);
                }
                
                .difference-icon::after {
                    color: white;
                }
                
                .difference-display.positive .difference-icon::after {
                    content: '✓';
                }
                
                .difference-display.negative .difference-icon::after {
                    content: '⚠';
                }
                
                .difference-display.neutral .difference-icon::after {
                    content: '📊';
                }
                
                .difference-info {
                    flex: 1;
                }
                
                .difference-label {
                    font-size: 13px;
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 4px;
                }
                
                .difference-display.positive .difference-label {
                    color: var(--success-dark);
                }
                
                .difference-display.negative .difference-label {
                    color: var(--error-dark);
                }
                
                .difference-display.neutral .difference-label {
                    color: var(--info-dark);
                }
                
                .difference-value {
                    font-size: 24px;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                }
                
                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                /* Responsive */
                @media (max-width: 768px) {
                    .closure-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .repair-stats {
                        grid-template-columns: 1fr;
                    }
                }
                
                /* Modal Footer Buttons */
                .modal-footer .btn-secondary,
                .modal-footer .btn-primary {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 12px 24px;
                    font-size: 15px;
                    font-weight: 600;
                    border-radius: var(--radius-md);
                    border: 2px solid;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: inherit;
                    gap: 8px;
                }
                
                .modal-footer .btn-secondary {
                    background: var(--bg-elevated);
                    color: var(--text-secondary);
                    border-color: var(--border-light);
                }
                
                .modal-footer .btn-secondary:hover {
                    background: var(--bg-hover);
                    border-color: var(--border-medium);
                    color: var(--text-primary);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }
                
                .modal-footer .btn-secondary:active {
                    transform: translateY(0);
                }
                
                .modal-footer .btn-primary {
                    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, #2563eb) 100%);
                    color: white;
                    border-color: var(--primary);
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                }
                
                .modal-footer .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
                    filter: brightness(1.1);
                }
                
                .modal-footer .btn-primary:active {
                    transform: translateY(0);
                    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
                }
                
                .modal-footer .btn-secondary svg,
                .modal-footer .btn-primary svg {
                    width: 18px;
                    height: 18px;
                    flex-shrink: 0;
                }
            </style>
        `,
        footer: `
            <button class="btn-secondary" onclick="document.querySelector('.modal').remove()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Cancelar
            </button>
            <button class="btn-primary" id="register-closure-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Registrar Cierre
            </button>
        `
    });
    
    // Setup real-time difference calculation
    setTimeout(() => {
        const cashCountedInput = $('#cash-counted');
        const differenceDisplay = $('#difference-display');
        const differenceValue = $('#difference-value');
        
        if (cashCountedInput) {
            cashCountedInput.addEventListener('input', () => {
                const counted = parseFloat(cashCountedInput.value) || 0;
                
                if (counted > 0) {
                    const difference = counted - expectedCash;
                    const absDifference = Math.abs(difference);
                    
                    differenceDisplay.style.display = 'block';
                    
                    // Remove all classes
                    differenceDisplay.classList.remove('positive', 'negative', 'neutral');
                    
                    if (absDifference < 0.01) {
                        // Perfect match
                        differenceDisplay.classList.add('neutral');
                        differenceValue.textContent = '¡Caja cuadrada perfectamente! 🎉';
                        differenceValue.style.color = 'var(--info)';
                    } else if (difference > 0) {
                        // Surplus
                        differenceDisplay.classList.add('positive');
                        differenceValue.textContent = `+${formatCurrency(difference)} de sobrante`;
                        differenceValue.style.color = 'var(--success)';
                    } else {
                        // Shortage
                        differenceDisplay.classList.add('negative');
                        differenceValue.textContent = `${formatCurrency(difference)} faltante`;
                        differenceValue.style.color = 'var(--error)';
                    }
                } else {
                    differenceDisplay.style.display = 'none';
                }
            });
        }
        
        // Print functionality - Professional PDF Generation
        const printBtn = $('#print-closure-btn');
        if (printBtn) {
            printBtn.addEventListener('click', () => {
                // Generate unique closure number
                const closureNumber = `CC-${closureDate.replace(/-/g, '')}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
                
                // Get technician breakdown
                const techBreakdown = {};
                repairs.forEach(repair => {
                    const techName = repair.tech?.name || 'Sin asignar';
                    if (!techBreakdown[techName]) {
                        techBreakdown[techName] = {
                            repairs: 0,
                            revenue: 0,
                            commission: 0
                        };
                    }
                    techBreakdown[techName].repairs++;
                    techBreakdown[techName].revenue += repair.final_amount || 0;
                    techBreakdown[techName].commission += repair.tech_commission || 0;
                });
                
                const printWindow = window.open('', '_blank');
                printWindow.document.write(`
                    <!DOCTYPE html>
                    <html lang="es">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Cierre de Caja ${closureNumber} - FIXORA</title>
                        <style>
                            /* Reset & Base */
                            * {
                                margin: 0;
                                padding: 0;
                                box-sizing: border-box;
                            }
                            
                            @media print {
                                @page {
                                    size: letter;
                                    margin: 0.5cm;
                                }
                                
                                body {
                                    print-color-adjust: exact;
                                    -webkit-print-color-adjust: exact;
                                }
                                
                                .no-print {
                                    display: none !important;
                                }
                                
                                .page-break {
                                    page-break-before: always;
                                }
                            }
                            
                            body {
                                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                                background: #f8f9fa;
                                padding: 20px;
                                color: #1a1a1a;
                                line-height: 1.6;
                            }
                            
                            .document {
                                background: white;
                                max-width: 900px;
                                margin: 0 auto;
                                box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
                                position: relative;
                                overflow: hidden;
                            }
                            
                            .watermark {
                                position: absolute;
                                top: 50%;
                                left: 50%;
                                transform: translate(-50%, -50%) rotate(-45deg);
                                font-size: 120px;
                                font-weight: bold;
                                color: rgba(59, 130, 246, 0.03);
                                z-index: 0;
                                pointer-events: none;
                                white-space: nowrap;
                                user-select: none;
                            }
                            
                            .content {
                                position: relative;
                                z-index: 1;
                                padding: 40px;
                            }
                            
                            /* Header */
                            .header {
                                display: flex;
                                justify-content: space-between;
                                align-items: flex-start;
                                padding-bottom: 30px;
                                border-bottom: 3px solid #3b82f6;
                                margin-bottom: 30px;
                            }
                            
                            .company-info {
                                flex: 1;
                            }
                            
                            .logo {
                                font-size: 36px;
                                font-weight: 900;
                                color: #3b82f6;
                                letter-spacing: -1px;
                                margin-bottom: 8px;
                            }
                            
                            .company-details {
                                font-size: 12px;
                                color: #6b7280;
                                line-height: 1.8;
                            }
                            
                            .company-details strong {
                                color: #374151;
                                font-weight: 600;
                            }
                            
                            .document-info {
                                text-align: right;
                                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                                color: white;
                                padding: 20px 25px;
                                border-radius: 8px;
                                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                            }
                            
                            .document-title {
                                font-size: 18px;
                                font-weight: 700;
                                letter-spacing: 1px;
                                margin-bottom: 12px;
                                text-transform: uppercase;
                            }
                            
                            .document-number {
                                font-size: 20px;
                                font-weight: 900;
                                letter-spacing: 2px;
                                margin-bottom: 15px;
                                font-family: 'Courier New', monospace;
                                background: rgba(255, 255, 255, 0.2);
                                padding: 8px 12px;
                                border-radius: 4px;
                            }
                            
                            .document-date {
                                font-size: 13px;
                                opacity: 0.95;
                                line-height: 1.6;
                            }
                            
                            /* Section */
                            .section {
                                margin-bottom: 35px;
                            }
                            
                            .section-title {
                                font-size: 16px;
                                font-weight: 700;
                                color: #1f2937;
                                margin-bottom: 18px;
                                padding-bottom: 10px;
                                border-bottom: 2px solid #e5e7eb;
                                display: flex;
                                align-items: center;
                                gap: 10px;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                            }
                            
                            .section-title::before {
                                content: '';
                                width: 4px;
                                height: 20px;
                                background: #3b82f6;
                                border-radius: 2px;
                            }
                            
                            /* Metrics Grid */
                            .metrics-grid {
                                display: grid;
                                grid-template-columns: repeat(4, 1fr);
                                gap: 15px;
                                margin-bottom: 25px;
                            }
                            
                            .metric-card {
                                background: #f9fafb;
                                border: 2px solid #e5e7eb;
                                border-radius: 8px;
                                padding: 18px;
                                text-align: center;
                                transition: all 0.3s;
                            }
                            
                            .metric-card.primary {
                                background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
                                border-color: #3b82f6;
                            }
                            
                            .metric-card.success {
                                background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
                                border-color: #10b981;
                            }
                            
                            .metric-card.warning {
                                background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                                border-color: #f59e0b;
                            }
                            
                            .metric-card.danger {
                                background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                                border-color: #ef4444;
                            }
                            
                            .metric-label {
                                font-size: 11px;
                                color: #6b7280;
                                text-transform: uppercase;
                                font-weight: 600;
                                letter-spacing: 0.5px;
                                margin-bottom: 8px;
                            }
                            
                            .metric-value {
                                font-size: 24px;
                                font-weight: 900;
                                color: #1f2937;
                                letter-spacing: -0.5px;
                            }
                            
                            .metric-detail {
                                font-size: 11px;
                                color: #9ca3af;
                                margin-top: 4px;
                            }
                            
                            /* Table */
                            .table {
                                width: 100%;
                                border-collapse: collapse;
                                margin-bottom: 20px;
                                font-size: 13px;
                            }
                            
                            .table thead {
                                background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
                                color: white;
                            }
                            
                            .table th {
                                padding: 12px 15px;
                                text-align: left;
                                font-weight: 600;
                                font-size: 12px;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                            }
                            
                            .table th:last-child,
                            .table td:last-child {
                                text-align: right;
                            }
                            
                            .table tbody tr {
                                border-bottom: 1px solid #e5e7eb;
                            }
                            
                            .table tbody tr:hover {
                                background: #f9fafb;
                            }
                            
                            .table tbody tr:last-child {
                                border-bottom: 2px solid #3b82f6;
                            }
                            
                            .table td {
                                padding: 12px 15px;
                                color: #374151;
                            }
                            
                            .table tfoot {
                                background: #f9fafb;
                                font-weight: 700;
                                border-top: 3px solid #3b82f6;
                            }
                            
                            .table tfoot td {
                                padding: 15px;
                                font-size: 15px;
                                color: #1f2937;
                            }
                            
                            /* Summary Box */
                            .summary-box {
                                background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
                                border: 3px solid #3b82f6;
                                border-radius: 10px;
                                padding: 25px;
                                margin: 25px 0;
                            }
                            
                            .summary-row {
                                display: flex;
                                justify-content: space-between;
                                padding: 12px 0;
                                border-bottom: 1px dashed #d1d5db;
                                font-size: 14px;
                            }
                            
                            .summary-row:last-child {
                                border-bottom: none;
                                padding-top: 15px;
                                margin-top: 10px;
                                border-top: 3px solid #3b82f6;
                            }
                            
                            .summary-row.total {
                                font-size: 18px;
                                font-weight: 900;
                                color: #3b82f6;
                            }
                            
                            .summary-label {
                                color: #6b7280;
                                font-weight: 600;
                            }
                            
                            .summary-value {
                                color: #1f2937;
                                font-weight: 700;
                                font-size: 16px;
                            }
                            
                            .summary-row.total .summary-value {
                                font-size: 22px;
                            }
                            
                            /* Notes Box */
                            .notes-box {
                                background: #fffbeb;
                                border-left: 4px solid #f59e0b;
                                padding: 18px;
                                border-radius: 4px;
                                margin: 20px 0;
                            }
                            
                            .notes-title {
                                font-weight: 700;
                                color: #92400e;
                                margin-bottom: 8px;
                                font-size: 13px;
                                text-transform: uppercase;
                            }
                            
                            .notes-content {
                                color: #78350f;
                                font-size: 13px;
                                line-height: 1.7;
                            }
                            
                            /* Signatures */
                            .signatures {
                                display: grid;
                                grid-template-columns: repeat(3, 1fr);
                                gap: 30px;
                                margin-top: 60px;
                                margin-bottom: 40px;
                            }
                            
                            .signature-box {
                                text-align: center;
                            }
                            
                            .signature-line {
                                border-top: 2px solid #1f2937;
                                margin-bottom: 10px;
                                padding-top: 50px;
                            }
                            
                            .signature-label {
                                font-size: 12px;
                                color: #6b7280;
                                font-weight: 600;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                            }
                            
                            .signature-name {
                                font-size: 13px;
                                color: #1f2937;
                                font-weight: 700;
                                margin-top: 4px;
                            }
                            
                            /* Footer */
                            .footer {
                                margin-top: 40px;
                                padding-top: 20px;
                                border-top: 3px solid #3b82f6;
                                text-align: center;
                                font-size: 11px;
                                color: #9ca3af;
                            }
                            
                            .footer-info {
                                margin-bottom: 10px;
                                line-height: 1.8;
                            }
                            
                            .footer-disclaimer {
                                background: #f9fafb;
                                padding: 12px;
                                border-radius: 6px;
                                font-size: 10px;
                                color: #6b7280;
                                font-style: italic;
                                margin-top: 15px;
                            }
                            
                            /* Badge */
                            .badge {
                                display: inline-block;
                                padding: 4px 12px;
                                border-radius: 12px;
                                font-size: 11px;
                                font-weight: 700;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                            }
                            
                            .badge-success {
                                background: #d1fae5;
                                color: #065f46;
                            }
                            
                            .badge-warning {
                                background: #fef3c7;
                                color: #92400e;
                            }
                            
                            .badge-info {
                                background: #dbeafe;
                                color: #1e40af;
                            }
                            
                            /* Barcode */
                            .barcode {
                                text-align: center;
                                margin: 20px 0;
                                font-family: 'Courier New', monospace;
                            }
                            
                            .barcode-lines {
                                height: 50px;
                                background: repeating-linear-gradient(
                                    90deg,
                                    #000 0px,
                                    #000 2px,
                                    #fff 2px,
                                    #fff 4px
                                );
                                margin-bottom: 8px;
                            }
                            
                            .barcode-number {
                                font-size: 13px;
                                font-weight: 700;
                                letter-spacing: 2px;
                                color: #1f2937;
                            }
                            
                            /* Highlight Box */
                            .highlight-box {
                                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                                color: white;
                                padding: 20px;
                                border-radius: 8px;
                                margin: 20px 0;
                                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                            }
                            
                            .highlight-title {
                                font-size: 14px;
                                font-weight: 600;
                                margin-bottom: 12px;
                                opacity: 0.95;
                                text-transform: uppercase;
                            }
                            
                            .highlight-value {
                                font-size: 32px;
                                font-weight: 900;
                                letter-spacing: -1px;
                            }
                            
                            .highlight-detail {
                                font-size: 13px;
                                opacity: 0.9;
                                margin-top: 8px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="document">
                            <div class="watermark">FIXORA ORIGINAL</div>
                            
                            <div class="content">
                                <!-- Header -->
                                <div class="header">
                                    <div class="company-info">
                                        <div class="logo">FIXORA</div>
                                        <div class="company-details">
                                            <div><strong>Sistema de Gestión de Reparaciones</strong></div>
                                            <div>Reporte Oficial de Cierre de Caja</div>
                                            <div>Documento Confidencial - Uso Contable</div>
                                        </div>
                                    </div>
                                    
                                    <div class="document-info">
                                        <div class="document-title">Cierre de Caja</div>
                                        <div class="document-number">${closureNumber}</div>
                                        <div class="document-date">
                                            <div><strong>Fecha:</strong> ${formatDate(closureDate)}</div>
                                            <div><strong>Hora:</strong> ${closureTime}</div>
                                            <div><strong>Período:</strong> ${periodDisplay}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Barcode -->
                                <div class="barcode">
                                    <div class="barcode-lines"></div>
                                    <div class="barcode-number">${closureNumber}</div>
                                </div>
                                
                                <!-- Executive Summary -->
                                <div class="section">
                                    <div class="section-title">Resumen Ejecutivo</div>
                                    <div class="metrics-grid">
                                        <div class="metric-card success">
                                            <div class="metric-label">Ingresos Totales</div>
                                            <div class="metric-value">${formatCurrency(metrics.revenue)}</div>
                                            <div class="metric-detail">${totalTransactions} transacciones</div>
                                        </div>
                                        <div class="metric-card warning">
                                            <div class="metric-label">Costos Totales</div>
                                            <div class="metric-value">${formatCurrency(metrics.costs)}</div>
                                            <div class="metric-detail">Materiales y repuestos</div>
                                        </div>
                                        <div class="metric-card danger">
                                            <div class="metric-label">Comisiones</div>
                                            <div class="metric-value">${formatCurrency(metrics.commissions)}</div>
                                            <div class="metric-detail">Técnicos</div>
                                        </div>
                                        <div class="metric-card primary">
                                            <div class="metric-label">Ganancia Neta</div>
                                            <div class="metric-value">${formatCurrency(metrics.net)}</div>
                                            <div class="metric-detail">${((metrics.net / metrics.revenue) * 100).toFixed(1)}% margen</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Payment Methods Breakdown -->
                                <div class="section">
                                    <div class="section-title">Desglose por Método de Pago</div>
                                    <table class="table">
                                        <thead>
                                            <tr>
                                                <th>Método de Pago</th>
                                                <th>N° Transacciones</th>
                                                <th>Porcentaje</th>
                                                <th>Monto Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td><span class="badge badge-success">💵 Efectivo</span></td>
                                                <td>${cashTransactions}</td>
                                                <td>${((cashTransactions / totalTransactions) * 100).toFixed(1)}%</td>
                                                <td><strong>${formatCurrency(expectedCash)}</strong></td>
                                            </tr>
                                            <tr>
                                                <td><span class="badge badge-info">💳 Tarjeta</span></td>
                                                <td>${cardTransactions}</td>
                                                <td>${totalTransactions > 0 ? ((cardTransactions / totalTransactions) * 100).toFixed(1) : 0}%</td>
                                                <td><strong>$0.00</strong></td>
                                            </tr>
                                            <tr>
                                                <td><span class="badge badge-warning">🏦 Transferencia</span></td>
                                                <td>${transferTransactions}</td>
                                                <td>${totalTransactions > 0 ? ((transferTransactions / totalTransactions) * 100).toFixed(1) : 0}%</td>
                                                <td><strong>$0.00</strong></td>
                                            </tr>
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colspan="3"><strong>TOTAL GENERAL</strong></td>
                                                <td><strong>${formatCurrency(metrics.revenue)}</strong></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                
                                <!-- Technician Performance -->
                                <div class="section">
                                    <div class="section-title">Desempeño por Técnico</div>
                                    <table class="table">
                                        <thead>
                                            <tr>
                                                <th>Técnico</th>
                                                <th>Reparaciones</th>
                                                <th>Ingresos Generados</th>
                                                <th>Comisión</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${Object.entries(techBreakdown).map(([name, data]) => `
                                                <tr>
                                                    <td><strong>${name}</strong></td>
                                                    <td>${data.repairs}</td>
                                                    <td>${formatCurrency(data.revenue)}</td>
                                                    <td><strong>${formatCurrency(data.commission)}</strong></td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                                
                                <!-- Financial Summary -->
                                <div class="section">
                                    <div class="section-title">Resumen Financiero Detallado</div>
                                    <div class="summary-box">
                                        <div class="summary-row">
                                            <span class="summary-label">Ingresos Brutos</span>
                                            <span class="summary-value">${formatCurrency(metrics.revenue)}</span>
                                        </div>
                                        <div class="summary-row">
                                            <span class="summary-label">(-) Costo de Materiales</span>
                                            <span class="summary-value">${formatCurrency(metrics.costs)}</span>
                                        </div>
                                        <div class="summary-row">
                                            <span class="summary-label">(-) Comisiones Técnicos</span>
                                            <span class="summary-value">${formatCurrency(metrics.commissions)}</span>
                                        </div>
                                        <div class="summary-row">
                                            <span class="summary-label">(=) Utilidad Bruta</span>
                                            <span class="summary-value">${formatCurrency(metrics.revenue - metrics.costs)}</span>
                                        </div>
                                        <div class="summary-row total">
                                            <span class="summary-label">GANANCIA NETA FINAL</span>
                                            <span class="summary-value">${formatCurrency(metrics.net)}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Repair Statistics -->
                                <div class="section">
                                    <div class="section-title">Estadísticas de Operación</div>
                                    <div class="metrics-grid">
                                        <div class="metric-card">
                                            <div class="metric-label">Entregadas</div>
                                            <div class="metric-value">${totalRepairs}</div>
                                            <div class="metric-detail">Completadas</div>
                                        </div>
                                        <div class="metric-card">
                                            <div class="metric-label">En Proceso</div>
                                            <div class="metric-value">${pendingRepairs}</div>
                                            <div class="metric-detail">Pendientes</div>
                                        </div>
                                        <div class="metric-card">
                                            <div class="metric-label">Total Reparaciones</div>
                                            <div class="metric-value">${totalTransactions}</div>
                                            <div class="metric-detail">En período</div>
                                        </div>
                                        <div class="metric-card">
                                            <div class="metric-label">Promedio por Reparación</div>
                                            <div class="metric-value">${totalRepairs > 0 ? formatCurrency(metrics.revenue / totalRepairs) : '$0'}</div>
                                            <div class="metric-detail">Ticket promedio</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Cash Verification -->
                                <div class="section">
                                    <div class="section-title">Verificación de Efectivo</div>
                                    <div class="highlight-box">
                                        <div class="highlight-title">Efectivo Esperado en Caja</div>
                                        <div class="highlight-value">${formatCurrency(expectedCash)}</div>
                                        <div class="highlight-detail">Basado en ${cashTransactions} transacciones en efectivo</div>
                                    </div>
                                    <div class="notes-box">
                                        <div class="notes-title">⚠️ Instrucciones de Verificación</div>
                                        <div class="notes-content">
                                            Este documento debe ser verificado por el cajero responsable y el supervisor de turno.
                                            El efectivo físico contabilizado debe coincidir con el monto esperado. Cualquier diferencia
                                            debe ser reportada inmediatamente y documentada en la sección de observaciones.
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Signatures -->
                                <div class="signatures">
                                    <div class="signature-box">
                                        <div class="signature-line"></div>
                                        <div class="signature-label">Elaborado Por</div>
                                        <div class="signature-name">Sistema FIXORA</div>
                                    </div>
                                    <div class="signature-box">
                                        <div class="signature-line"></div>
                                        <div class="signature-label">Revisado Por</div>
                                        <div class="signature-name">Supervisor</div>
                                    </div>
                                    <div class="signature-box">
                                        <div class="signature-line"></div>
                                        <div class="signature-label">Aprobado Por</div>
                                        <div class="signature-name">Gerencia</div>
                                    </div>
                                </div>
                                
                                <!-- Footer -->
                                <div class="footer">
                                    <div class="footer-info">
                                        <div><strong>FIXORA</strong> - Sistema de Gestión de Reparaciones</div>
                                        <div>Documento generado automáticamente el ${formatDate(closureDate)} a las ${closureTime}</div>
                                        <div>Código de Cierre: ${closureNumber}</div>
                                    </div>
                                    <div class="footer-disclaimer">
                                        Este documento es confidencial y de uso exclusivo para fines contables y administrativos. 
                                        La información contenida debe ser protegida según las políticas de seguridad de la empresa.
                                        Cualquier discrepancia debe ser reportada inmediatamente a la gerencia.
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <script>
                            // Auto-print after load
                            window.onload = function() {
                                setTimeout(function() {
                                    window.print();
                                }, 500);
                            };
                        </script>
                    </body>
                    </html>
                `);
                printWindow.document.close();
            });
        }
        
        // Register button functionality
        const registerBtn = $('#register-closure-btn');
        if (registerBtn) {
            registerBtn.addEventListener('click', async () => {
                const cashCounted = parseFloat($('#cash-counted').value);
                const notes = $('#closure-notes').value.trim();
                
                // Validation
                if (!cashCounted || cashCounted < 0) {
                    toast.error('Por favor ingresa el efectivo contado');
                    cashCountedInput.focus();
                    return;
                }
                
                const difference = cashCounted - expectedCash;
                const hasDifference = Math.abs(difference) > 0.01;
                
                if (hasDifference) {
                    const confirmClosure = await confirmModal(
                        'Confirmar Diferencia en Caja',
                        `Se detectó una diferencia de <strong>${formatCurrency(Math.abs(difference))}</strong> ${difference > 0 ? 'a favor (sobrante)' : 'faltante'}.<br><br>¿Deseas continuar con el registro?`,
                        'Sí, registrar',
                        'Revisar de nuevo'
                    );
                    
                    if (!confirmClosure) return;
                }
                
                // Here you would save to database
                // Example structure:
                // const closureData = {
                //     shop_id: shopId,
                //     closure_date: closureDate,
                //     period_start: startDate,
                //     period_end: endDate,
                //     total_revenue: metrics.revenue,
                //     total_costs: metrics.costs,
                //     total_commissions: metrics.commissions,
                //     net_profit: metrics.net,
                //     expected_cash: expectedCash,
                //     counted_cash: cashCounted,
                //     difference: difference,
                //     total_transactions: totalTransactions,
                //     notes: notes,
                //     created_by: currentUser.id
                // };
                
                toast.success(`✅ Cierre de caja registrado exitosamente`);
                
                if (!hasDifference) {
                    toast.success('🎉 ¡Caja cuadrada perfectamente!');
                } else if (difference > 0) {
                    toast.info(`💰 Sobrante: ${formatCurrency(difference)}`);
                } else {
                    toast.warning(`⚠️ Faltante: ${formatCurrency(Math.abs(difference))}`);
                }
                
                cashClosureModal.close();
            });
        }
    }, 100);
    
    // Open the modal
    cashClosureModal.open();
}

/**
 * Load settings
 */
function loadSettings() {
    if (!shop) return;
    
    $('#settings-shop-name').value = shop.name || '';
    $('#settings-shop-phone').value = shop.phone || '';
    $('#settings-shop-whatsapp').value = shop.whatsapp || '';
    $('#settings-shop-email').value = shop.email || '';
    $('#settings-shop-address').value = shop.address || '';
    $('#settings-commission').value = shop.default_tech_commission || '';
    
    $('#settings-plan').textContent = shop.subscription_plan?.toUpperCase() || 'FREE';
    
    const limits = CONFIG.SUBSCRIPTION_PLANS.find(p => p.id === shop.subscription_plan) || CONFIG.SUBSCRIPTION_PLANS[0];
    $('#settings-repair-limit').textContent = limits.maxRepairs === -1 ? 'Ilimitado' : `${limits.maxRepairs}/mes`;
    $('#settings-tech-limit').textContent = limits.maxTechs === -1 ? 'Ilimitado' : limits.maxTechs;
    
    // Load shop logo
    const logoImg = $('#settings-logo-img');
    const logoPlaceholder = $('#settings-logo-placeholder');
    const logoRemoveBtn = $('#settings-logo-remove');
    const logoInput = $('#settings-logo-input');
    
    if (logoImg && logoPlaceholder) {
        // Handle image load success
        logoImg.onload = function() {
            this.style.display = 'block';
            logoPlaceholder.style.display = 'none';
            if (logoRemoveBtn) logoRemoveBtn.style.display = 'inline-flex';
        };
        
        // Handle image load errors
        logoImg.onerror = function() {
            console.error('Error loading logo. Please check if the storage bucket is configured correctly.');
            this.style.display = 'none';
            logoPlaceholder.style.display = 'block';
            if (logoRemoveBtn) logoRemoveBtn.style.display = 'none';
        };
        
        if (shop.logo_url && shop.logo_url.trim() !== '') {
            // Clear any previous src first
            logoImg.src = '';
            // Set new src
            setTimeout(() => {
                logoImg.src = shop.logo_url;
            }, 0);
            if (logoInput) logoInput.dataset.remove = 'false';
        } else {
            logoImg.src = '';
            logoImg.style.display = 'none';
            logoPlaceholder.style.display = 'block';
            if (logoRemoveBtn) logoRemoveBtn.style.display = 'none';
            if (logoInput) logoInput.dataset.remove = 'false';
        }
    }
}

/**
 * Setup modals
 */
function setupModals() {
    initModals();
    modal.register('repair-wizard-modal', $('#repair-wizard-modal'));
    modal.register('tech-modal', $('#tech-modal'));
}

/**
 * Setup wizard
 */
function setupWizard() {
    // Category selector
    const categorySelector = $('#category-selector');
    if (categorySelector) {
        categorySelector.innerHTML = CONFIG.DEVICE_CATEGORIES.map(cat => `
            <button type="button" class="category-btn" data-category="${cat.id}">
                <span class="category-icon">${cat.icon}</span>
                <span>${cat.name}</span>
            </button>
        `).join('');
        
        delegate(categorySelector, '.category-btn', 'click', (e, btn) => {
            $$('.category-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            $('#wizard-category').value = btn.dataset.category;
        });
    }
    
    // Accessories
    const accessoriesGroup = $('#accessories-group');
    if (accessoriesGroup) {
        const accessories = CONFIG.COMMON_ACCESSORIES || [];
        accessoriesGroup.innerHTML = accessories.map(acc => `
            <label class="checkbox-label">
                <input type="checkbox" name="acc_${acc.id}" value="${acc.id}">
                <span class="checkbox-custom"></span>
                <span>${acc.name}</span>
            </label>
        `).join('');
    }
    
    // Photo drop zone
    const dropZone = $('#photo-drop-zone');
    if (dropZone) {
        setupDragDrop(dropZone, handlePhotosAdded);
        setupPaste(document.body, handlePhotosAdded);
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Logout
    $('#logout-btn')?.addEventListener('click', async () => {
        const confirmed = await confirmModal({
            title: 'Cerrar Sesión',
            message: '¿Estás seguro de que deseas cerrar sesión?'
        });
        if (confirmed) {
            if (realtimeSubscription) realtimeSubscription.unsubscribe();
            await signOut();
            window.location.href = 'index.html';
        }
    });
    
    // New repair buttons
    $('#btn-new-repair')?.addEventListener('click', openRepairWizard);
    $('#btn-new-repair-section')?.addEventListener('click', openRepairWizard);
    $('#quick-new-repair')?.addEventListener('click', openRepairWizard);
    
    // Quick actions
    $('#quick-search')?.addEventListener('click', () => {
        navigateToSection('repairs');
        setTimeout(() => $('#repairs-search')?.focus(), 100);
    });
    
    $('#quick-pending')?.addEventListener('click', () => {
        navigateToSection('repairs');
        setTimeout(() => {
            $('#repairs-filter-status').value = 'pending';
            filterRepairs();
        }, 100);
    });
    
    // Wizard navigation
    $('#wizard-prev')?.addEventListener('click', prevWizardStep);
    $('#wizard-next')?.addEventListener('click', nextWizardStep);
    $('#wizard-submit')?.addEventListener('click', submitRepairWizard);
    
    // Search client
    $('#btn-search-client')?.addEventListener('click', searchClient);
    
    // Photo buttons
    $('#btn-take-photo')?.addEventListener('click', async () => {
        const success = await openCamera((files) => handlePhotosAdded(files));
    });
    
    $('#btn-upload-photo')?.addEventListener('click', async () => {
        const files = await pickImages();
        if (files.length) handlePhotosAdded(files);
    });
    
    // Repairs table interactions
    delegate($('#repairs-tbody'), '.clickable-row', 'click', (e, row) => {
        if (!e.target.closest('button')) {
            openRepairPanel(row.dataset.id);
        }
    });
    
    delegate($('#repairs-tbody'), '.btn-view-repair', 'click', (e, btn) => {
        const row = btn.closest('tr');
        openRepairPanel(row.dataset.id);
    });
    
    delegate($('#repairs-tbody'), '.btn-whatsapp-client', 'click', (e, btn) => {
        e.stopPropagation();
        const row = btn.closest('tr');
        const repair = repairs.find(r => r.id === row.dataset.id);
        if (repair) {
            showWhatsAppTargetModal(repair);
        }
    });

    // Mobile repairs cards interactions
    delegate($('#repairs-list'), '.repair-card', 'click', (e, card) => {
        if (!e.target.closest('button')) {
            openRepairPanel(card.dataset.id);
        }
    });
    
    delegate($('#repairs-list'), '.btn-view-repair', 'click', (e, btn) => {
        e.stopPropagation();
        const card = btn.closest('.repair-card');
        openRepairPanel(card.dataset.id);
    });
    
    delegate($('#repairs-list'), '.btn-whatsapp-client', 'click', (e, btn) => {
        e.stopPropagation();
        const card = btn.closest('.repair-card');
        const repair = repairs.find(r => r.id === card.dataset.id);
        if (repair) {
            showWhatsAppTargetModal(repair);
        }
    });
    
    // Recent repairs click
    delegate($('#recent-repairs'), '.repair-list-item', 'click', (e, item) => {
        openRepairPanel(item.dataset.id);
    });
    
    // Technician actions
    delegate($('#technicians-grid'), '.btn-edit-tech', 'click', (e, btn) => {
        const card = btn.closest('.tech-card');
        const tech = technicians.find(t => t.id === card.dataset.id);
        if (tech) openTechModal(tech);
    });
    
    delegate($('#technicians-grid'), '.btn-whatsapp-tech', 'click', (e, btn) => {
        const card = btn.closest('.tech-card');
        const tech = technicians.find(t => t.id === card.dataset.id);
        if (tech && tech.phone) {
            sendToTechnician(tech.phone, null, tech);
        }
    });
    
    // New technician
    $('#btn-new-tech')?.addEventListener('click', () => openTechModal());
    
    // Tech form
    $('#tech-form')?.addEventListener('submit', handleTechSubmit);
    
    // Toggle link existing user mode
    $('#link-existing-user')?.addEventListener('change', function() {
        const isLinking = this.checked;
        $('#user-uuid-group').style.display = isLinking ? 'block' : 'none';
        $('#tech-email-group').style.display = isLinking ? 'none' : 'block';
        $('#tech-password-group').style.display = isLinking ? 'none' : 'block';
        
        // Update required attributes
        const emailInput = $('#tech-email');
        const passwordInput = $('#tech-password');
        const uuidInput = $('#tech-user-uuid');
        
        if (emailInput) emailInput.required = !isLinking;
        if (passwordInput) passwordInput.required = !isLinking;
        if (uuidInput) uuidInput.required = isLinking;
    });
    
    // Repair panel close
    $('#close-repair-panel')?.addEventListener('click', closeRepairPanel);
    $('#repair-panel .slide-panel-overlay')?.addEventListener('click', closeRepairPanel);
    
    // Search and filter
    $('#repairs-search')?.addEventListener('input', debounce(filterRepairs, 300));
    $('#repairs-filter-status')?.addEventListener('change', filterRepairs);
    
    // Settings form
    $('#shop-settings-form')?.addEventListener('submit', handleSettingsSubmit);
    
    // Logo upload handlers
    const logoInput = $('#settings-logo-input');
    const logoRemoveBtn = $('#settings-logo-remove');
    
    if (logoInput) {
        logoInput.addEventListener('change', handleLogoChange);
    }
    
    if (logoRemoveBtn) {
        logoRemoveBtn.addEventListener('click', handleLogoRemove);
    }
    
    // Finance section event listeners
    setupFinanceEventListeners();
}

/**
 * Setup finance-specific event listeners
 */
function setupFinanceEventListeners() {
    // Mark all paid button
    $('#mark-all-paid')?.addEventListener('click', async () => {
        const confirmed = await showConfirmModal(
            'Marcar Todas las Comisiones como Pagadas',
            '¿Confirmar que todas las comisiones han sido pagadas?',
            'Confirmar Todo',
            'warning'
        );
        
        if (confirmed) {
            showToast('Todas las comisiones marcadas como pagadas', 'success');
            loadFinances();
        }
    });
}

/**
 * Filter repairs
 */
function filterRepairs() {
    const search = $('#repairs-search').value.toLowerCase();
    const status = $('#repairs-filter-status').value;
    
    let filtered = [...repairs];
    
    if (search) {
        filtered = filtered.filter(r => 
            r.code.toLowerCase().includes(search) ||
            r.client?.name?.toLowerCase().includes(search) ||
            r.client?.phone?.includes(search) ||
            r.device_brand?.toLowerCase().includes(search) ||
            r.device_model?.toLowerCase().includes(search)
        );
    }
    
    if (status) {
        filtered = filtered.filter(r => r.status === status);
    }
    
    renderRepairsTable(filtered);
}

/**
 * Open repair wizard
 */
function openRepairWizard() {
    resetWizard();
    modal.open('repair-wizard-modal');
}

/**
 * Reset wizard
 */
function resetWizard() {
    wizardStep = 1;
    wizardPhotos = [];
    
    resetForm($('#repair-wizard-form'));
    $('#wizard-client-id').value = '';
    $('#wizard-category').value = '';
    $('#wizard-accessories').value = '';
    
    $$('.category-btn').forEach(b => b.classList.remove('selected'));
    $$('#accessories-group input').forEach(cb => cb.checked = false);
    $('#photo-previews').innerHTML = '';
    
    updateWizardUI();
    populateTechSelect();
}

/**
 * Update wizard UI
 */
function updateWizardUI() {
    // Update steps
    $$('.wizard-step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.toggle('active', stepNum === wizardStep);
        step.classList.toggle('completed', stepNum < wizardStep);
    });
    
    // Update content
    $$('.wizard-content').forEach(content => {
        content.classList.toggle('active', parseInt(content.dataset.step) === wizardStep);
    });
    
    // Update buttons
    $('#wizard-prev').style.display = wizardStep > 1 ? 'block' : 'none';
    $('#wizard-next').style.display = wizardStep < 4 ? 'block' : 'none';
    $('#wizard-submit').style.display = wizardStep === 4 ? 'block' : 'none';
}

/**
 * Previous wizard step
 */
function prevWizardStep() {
    if (wizardStep > 1) {
        wizardStep--;
        updateWizardUI();
    }
}

/**
 * Next wizard step
 */
function nextWizardStep() {
    if (!validateWizardStep()) return;
    
    if (wizardStep < 4) {
        wizardStep++;
        updateWizardUI();
        
        if (wizardStep === 4) {
            updateConfirmSummary();
        }
    }
}

/**
 * Validate current wizard step
 */
function validateWizardStep() {
    const form = $('#repair-wizard-form');
    
    switch (wizardStep) {
        case 1: {
            const phone = form.elements.client_phone.value.trim();
            const name = form.elements.client_name.value.trim();
            
            if (!phone) {
                toast.warning('Ingrese el teléfono del cliente');
                return false;
            }
            if (!name) {
                toast.warning('Ingrese el nombre del cliente');
                return false;
            }
            return true;
        }
        case 2: {
            const category = $('#wizard-category').value;
            const brand = form.elements.device_brand.value.trim();
            const model = form.elements.device_model.value.trim();
            const issue = form.elements.reported_issue.value.trim();
            
            if (!category) {
                toast.warning('Seleccione una categoría');
                return false;
            }
            if (!brand || !model) {
                toast.warning('Ingrese marca y modelo');
                return false;
            }
            if (!issue) {
                toast.warning('Describa el problema reportado');
                return false;
            }
            
            // Collect accessories
            const accessories = [];
            $$('#accessories-group input:checked').forEach(cb => accessories.push(cb.value));
            $('#wizard-accessories').value = JSON.stringify(accessories);
            
            return true;
        }
        case 3:
            // Photos are optional
            return true;
        default:
            return true;
    }
}

/**
 * Update confirm summary
 */
function updateConfirmSummary() {
    const form = $('#repair-wizard-form');
    
    $('#confirm-client-name').textContent = form.elements.client_name.value;
    $('#confirm-client-phone').textContent = formatPhone(form.elements.client_phone.value);
    
    const category = CONFIG.DEVICE_CATEGORIES.find(c => c.id === $('#wizard-category').value);
    $('#confirm-device').textContent = `${category?.name || ''} - ${form.elements.device_brand.value} ${form.elements.device_model.value}`;
    $('#confirm-issue').textContent = form.elements.reported_issue.value;
    
    $('#confirm-photos').textContent = `${wizardPhotos.length} foto(s)`;
}

/**
 * Search client
 */
async function searchClient() {
    const phone = $('#repair-wizard-form').elements.client_phone.value.trim();
    if (!phone) {
        toast.warning('Ingrese un número de teléfono');
        return;
    }
    
    try {
        // Buscar cliente por teléfono en la lista de clientes
        const clients = await getShopClients(shopId, phone);
        const client = clients.find(c => c.phone === phone);
        
        if (client) {
            const form = $('#repair-wizard-form');
            form.elements.client_name.value = client.name || '';
            form.elements.client_email.value = client.email || '';
            form.elements.client_notes.value = client.notes || '';
            $('#wizard-client-id').value = client.id;
            toast.success('Cliente encontrado');
        } else {
            $('#wizard-client-id').value = '';
            toast.info('Cliente nuevo');
        }
    } catch (error) {
        console.error('Error searching client:', error);
    }
}

/**
 * Handle photos added
 */
async function handlePhotosAdded(files) {
    const container = $('#photo-previews');
    
    for (const file of files) {
        if (wizardPhotos.length >= 10) {
            toast.warning('Máximo 10 fotos');
            break;
        }
        
        const preview = await createImagePreview(file);
        wizardPhotos.push({ file, element: preview.element });
        
        preview.element.querySelector('.preview-remove').onclick = () => {
            const index = wizardPhotos.findIndex(p => p.file === file);
            if (index > -1) {
                wizardPhotos.splice(index, 1);
                preview.element.remove();
            }
        };
        
        container.appendChild(preview.element);
    }
}

/**
 * Submit repair wizard
 */
async function submitRepairWizard() {
    const submitBtn = $('#wizard-submit');
    showLoading(submitBtn, { text: 'Creando...' });
    
    try {
        const form = $('#repair-wizard-form');
        const formData = formDataToObject(form);
        
        // Create or get client
        let clientId = $('#wizard-client-id').value;
        
        if (!clientId) {
            const client = await getOrCreateClient(shopId, {
                name: formData.client_name,
                phone: formData.client_phone,
                email: formData.client_email || null,
                notes: formData.client_notes || null
            });
            clientId = client.id;
        }
        
        // Parse accessories
        let accessories = [];
        try {
            accessories = JSON.parse($('#wizard-accessories').value || '[]');
        } catch {}
        
        // Create repair
        const repairData = {
            shop_id: shopId,
            client_id: clientId,
            device_category: formData.device_category,
            device_brand: formData.device_brand,
            device_model: formData.device_model,
            device_imei: formData.device_serial || null,
            device_color: formData.device_color || null,
            device_password: formData.device_password || null,
            intake_reason: formData.reported_issue || 'Sin especificar',
            intake_notes: formData.intake_notes || null,
            device_accessories: accessories,
            quote_status: formData.quote_status || 'pending',
            quote_amount: formData.quote_amount ? parseFloat(formData.quote_amount) : null,
            tech_id: formData.technician_id || null,
            priority: parseInt(formData.priority) || 3
        };
        
        const repair = await createRepair(repairData);
        
        // Upload photos
        if (wizardPhotos.length > 0) {
            for (const photo of wizardPhotos) {
                if (photo.file) {
                    await uploadIntakeEvidence(shopId, repair.id, photo.file);
                }
            }
        }
        
        toast.success(`Reparación ${repair.code || repair.id} creada`);
        modal.close('repair-wizard-modal');
        
        // Refresh data
        await loadRepairs();
        await loadDashboardData();
        
        // Open repair panel
        openRepairPanel(repair.id);
        
    } catch (error) {
        console.error('Error creating repair:', error);
        toast.error('Error al crear la reparación');
    } finally {
        hideLoading(submitBtn);
    }
}

/**
 * Open repair panel
 */
async function openRepairPanel(repairId) {
    console.log('Opening repair panel for ID:', repairId);
    selectedRepairId = repairId;
    
    const panel = $('#repair-panel');
    console.log('Panel element:', panel);
    panel.classList.add('active');
    
    try {
        console.log('Fetching repair data...');
        const repair = await getRepairById(repairId);
        console.log('Repair data:', repair);
        if (!repair) {
            toast.error('Reparación no encontrada');
            closeRepairPanel();
            return;
        }
        
        // Get stages
        const stages = await getRepairStages(repairId);
        console.log('Stages:', stages);
        
        // Get intake evidence
        const intakeEvidence = await getIntakeEvidence(repairId);
        console.log('Intake evidence:', intakeEvidence);
        
        // Update header
        $('#panel-repair-code').textContent = repair.code;
        const statusBadge = $('#panel-repair-status');
        statusBadge.textContent = formatRepairStatus(repair.status);
        statusBadge.className = `badge ${getStatusBadgeClass(repair.status)}`;
        
        // Render body
        renderRepairPanelBody(repair, stages, intakeEvidence);
        
    } catch (error) {
        console.error('Error loading repair:', error);
        toast.error('Error al cargar reparación');
    }
}

/**
 * Render repair panel body
 */
function renderRepairPanelBody(repair, stages, intakeEvidence = []) {
    const body = $('#repair-panel-body');
    
    const trackingUrl = `${window.location.origin}/track.html?token=${repair.tracking_token}`;
    
    body.innerHTML = `
        <div class="panel-section" style="background: linear-gradient(135deg, var(--accent-50, rgba(99,102,241,0.1)) 0%, var(--bg-card) 100%); border-color: var(--accent, #6366F1);">
            <h4>Código de Seguimiento</h4>
            <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
                <p style="font-size: 24px; font-weight: 700; font-family: 'SF Mono', 'Fira Code', monospace; color: var(--accent, #6366F1); letter-spacing: 1px; margin: 0;" id="repair-code-display">${repair.code}</p>
                <button class="btn btn-secondary btn-sm" id="btn-copy-code" style="padding: 8px 12px; border-radius: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copiar
                </button>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Comparte este código con el cliente para seguimiento</p>
        </div>
        
        <div class="panel-section">
            <h4>Cliente</h4>
            <p><strong>${repair.client?.name || '-'}</strong></p>
            <p>${formatPhone(repair.client?.phone) || '-'}</p>
            ${repair.client?.email ? `<p>${repair.client.email}</p>` : ''}
            <button class="btn btn-secondary btn-sm mt-2" id="btn-edit-client">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Editar Datos
            </button>
        </div>
        
        <div class="panel-section">
            <h4>Dispositivo</h4>
            <p><strong>${repair.device_brand} ${repair.device_model}</strong></p>
            <p>${formatDeviceCategory(repair.device_category)}</p>
            ${repair.device_imei ? `<p>IMEI/Serial: ${repair.device_imei}</p>` : ''}
            ${repair.device_color ? `<p>Color: ${repair.device_color}</p>` : ''}
        </div>
        
        <div class="panel-section">
            <h4>Problema Reportado</h4>
            <p>${repair.intake_reason || 'Sin especificar'}</p>
        </div>
        
        ${intakeEvidence.length > 0 ? `
            <div class="panel-section" style="background: linear-gradient(135deg, var(--primary-bg, rgba(99,102,241,0.05)) 0%, var(--bg-card) 100%); border-left: 3px solid var(--primary);">
                <h4>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    Fotos de Ingreso
                </h4>
                <p style="font-size: 13px; color: var(--text-secondary); margin: 8px 0;">${intakeEvidence.length} foto${intakeEvidence.length !== 1 ? 's' : ''} tomada${intakeEvidence.length !== 1 ? 's' : ''} al recibir el equipo</p>
                <button class="btn btn-primary btn-sm" id="btn-view-intake-photos" style="width: 100%;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    Ver Fotos de Ingreso
                </button>
            </div>
        ` : ''}
        
        <div class="panel-section">
            <h4>Cotización</h4>
            <div class="quote-info">
                <span class="badge ${getQuoteBadgeClass(repair.quote_status)}">${formatQuoteStatus(repair.quote_status)}</span>
                <span class="quote-amount">${repair.quote_amount ? formatCurrency(repair.quote_amount) : 'Sin cotizar'}</span>
            </div>
            ${repair.status !== 'delivered' && repair.status !== 'cancelled' ? `
                <button class="btn btn-secondary btn-sm mt-2" id="btn-update-quote">Actualizar Cotización</button>
            ` : ''}
        </div>
        
        <div class="panel-section">
            <h4>Técnico Asignado</h4>
            <p>${repair.tech?.full_name || 'Sin asignar'}</p>
            ${!repair.tech_id ? `
                <select class="form-select mt-2" id="panel-assign-tech">
                    <option value="">Asignar técnico</option>
                    ${technicians.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('')}
                </select>
            ` : ''}
        </div>
        
        <div class="panel-section">
            <h4>Link de Seguimiento</h4>
            <div class="tracking-link-box">
                <input type="text" class="form-input" value="${trackingUrl}" readonly id="tracking-url-input">
                <button class="btn btn-secondary btn-sm" id="btn-copy-tracking">Copiar</button>
            </div>
        </div>
        
        ${stages.length > 0 ? `
            <div class="panel-section">
                <h4>Historial de Etapas</h4>
                <div class="timeline">
                    ${stages.map(stage => `
                        <div class="timeline-item">
                            <div class="timeline-dot"></div>
                            <div class="timeline-content">
                                <span class="timeline-title">${stage.stage_name}</span>
                                <span class="timeline-date">${formatDateTime(stage.created_at)}</span>
                                ${stage.description ? `<p>${stage.description}</p>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        <div class="panel-section">
            <h4>Acciones</h4>
            <div class="panel-actions">
                ${repair.status !== 'delivered' && repair.status !== 'cancelled' ? `
                    <button class="btn btn-secondary" id="btn-update-status">Cambiar Estado</button>
                ` : ''}
                ${repair.status === 'ready' ? `
                    <button class="btn btn-success" id="btn-notify-ready">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        Notificar: Equipo Listo
                    </button>
                ` : ''}
                <button class="btn btn-whatsapp" id="btn-whatsapp-panel">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Enviar WhatsApp
                </button>
            </div>
        </div>
    `;
    
    // Event listeners for panel
    $('#btn-copy-code')?.addEventListener('click', async () => {
        await navigator.clipboard.writeText(repair.code);
        toast.success('Código copiado');
    });
    
    $('#btn-copy-tracking')?.addEventListener('click', async () => {
        const input = $('#tracking-url-input');
        await navigator.clipboard.writeText(input.value);
        toast.success('Link copiado');
    });
    
    $('#panel-assign-tech')?.addEventListener('change', async (e) => {
        const techId = e.target.value;
        if (techId) {
            try {
                await assignTechnician(repair.id, techId);
                toast.success('Técnico asignado');
                openRepairPanel(repair.id);
                await loadRepairs();
            } catch (error) {
                toast.error('Error al asignar técnico');
            }
        }
    });
    
    $('#btn-update-status')?.addEventListener('click', () => updateRepairStatus(repair));
    
    $('#btn-notify-ready')?.addEventListener('click', async () => {
        const whatsappService = await import('../services/whatsappService.js');
        whatsappService.sendReadyForPickupNotification(repair, shop);
    });
    
    $('#btn-whatsapp-panel')?.addEventListener('click', () => {
        showWhatsAppTargetModal(repair);
    });
    
    $('#btn-update-quote')?.addEventListener('click', () => updateQuote(repair));
    
    $('#btn-edit-client')?.addEventListener('click', () => updateClientData(repair));
    
    $('#btn-view-intake-photos')?.addEventListener('click', () => showIntakePhotosModal(intakeEvidence, repair));
}

/**
 * Update repair status
 */
async function updateRepairStatus(repair) {
    const statusOptions = [
        { value: 'pending', label: 'Pendiente' },
        { value: 'assigned', label: 'Asignado' },
        { value: 'in_progress', label: 'En proceso' },
        { value: 'waiting_parts', label: 'Esperando repuestos' },
        { value: 'ready', label: 'Listo para entrega' },
        { value: 'delivered', label: 'Entregado' },
        { value: 'cancelled', label: 'Cancelado' }
    ];
    
    const currentIndex = statusOptions.findIndex(s => s.value === repair.status);
    
    const newModal = modal.create({
        title: 'Cambiar Estado',
        content: `
            <div class="form-group">
                <label class="form-label">Nuevo estado</label>
                <select class="form-select" id="new-status-select">
                    ${statusOptions.map((s, i) => `
                        <option value="${s.value}" ${s.value === repair.status ? 'selected' : ''}>
                            ${s.label}
                        </option>
                    `).join('')}
                </select>
            </div>
            <div class="form-group" id="final-amount-group" style="display: none;">
                <label class="form-label" style="font-weight: 600; color: var(--primary);">💰 Monto final cobrado al cliente</label>
                <div style="margin-bottom: 8px; padding: 12px; background: var(--warning-bg); border: 1px solid var(--warning-border); border-radius: 8px;">
                    <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">⚠️ <strong>Importante:</strong> Este es el monto total que se le cobró al cliente por la reparación. Asegúrate de que sea correcto antes de continuar.</p>
                </div>
                <input type="number" class="form-input" id="final-amount-input" value="${repair.final_amount || repair.quote_amount || 0}" min="0" step="1000" style="font-size: 18px; font-weight: 600; text-align: center;">
                <small style="display: block; margin-top: 6px; color: var(--text-muted);">Monto estimado: ${repair.quote_amount ? formatCurrency(repair.quote_amount) : 'Sin cotización previa'}</small>
            </div>
        `,
        footer: `
            <button class="btn btn-secondary" data-action="cancel">Cancelar</button>
            <button class="btn btn-primary" data-action="save">Guardar</button>
        `,
        size: 'small'
    });
    
    const statusSelect = newModal.element.querySelector('#new-status-select');
    const finalGroup = newModal.element.querySelector('#final-amount-group');
    
    statusSelect.addEventListener('change', () => {
        finalGroup.style.display = statusSelect.value === 'delivered' ? 'block' : 'none';
    });
    
    newModal.element.querySelector('[data-action="cancel"]').onclick = () => newModal.destroy();
    newModal.element.querySelector('[data-action="save"]').onclick = async () => {
        const newStatus = statusSelect.value;
        const updateData = { status: newStatus };
        
        if (newStatus === 'delivered') {
            // Special handling for delivered status
            const finalAmount = parseFloat(newModal.element.querySelector('#final-amount-input').value) || 0;
            newModal.destroy();
            
            // Show confirmation modal first
            const confirmed = await showDeliveryConfirmationModal(repair, finalAmount);
            if (confirmed) {
                // Show earnings calculation modal
                await showEarningsCalculationModal(repair, finalAmount);
            }
            return;
        }
        
        if (newStatus === 'ready') {
            // Special handling for ready status - offer to notify client
            newModal.destroy();
            await handleReadyForPickup(repair);
            return;
        }
        
        try {
            await updateRepair(repair.id, updateData);
            toast.success('Estado actualizado');
            newModal.destroy();
            openRepairPanel(repair.id);
            await loadRepairs();
            await loadDashboardData();
        } catch (error) {
            toast.error('Error al actualizar');
        }
    };
    
    newModal.open();
}

/**
 * Handle ready for pickup status change
 */
async function handleReadyForPickup(repair) {
    return new Promise((resolve) => {
        const readyModal = modal.create({
            title: '\ud83c\udf89 Equipo Listo para Entregar',
            content: `
                <div class="ready-notification-content">
                    <div class="success-banner" style="background: var(--success-bg); border: 1px solid var(--success-border); border-radius: 12px; padding: 16px; margin-bottom: 20px; display: flex; gap: 12px; align-items: start;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px; color: var(--success); flex-shrink: 0; margin-top: 2px;">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <div>
                            <strong>¡Excelente! El equipo está listo</strong>
                            <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Ahora puedes notificar al cliente por WhatsApp para que venga a recogerlo.</p>
                        </div>
                    </div>
                    
                    <div class="ready-summary" style="background: var(--bg-elevated); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                        <h4 style="margin: 0 0 12px 0; font-size: 14px; color: var(--text-secondary);">Resumen de la reparación:</h4>
                        <div style="display: grid; gap: 8px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: var(--text-secondary);">Código:</span>
                                <span style="font-weight: 600;">${repair.code}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: var(--text-secondary);">Cliente:</span>
                                <span style="font-weight: 600;">${repair.client?.name || 'Sin nombre'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: var(--text-secondary);">Dispositivo:</span>
                                <span style="font-weight: 600;">${repair.device_brand} ${repair.device_model}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: var(--text-secondary);">Precio:</span>
                                <span style="font-weight: 600; color: var(--success);">${repair.quote_amount ? formatCurrency(repair.quote_amount) : 'Por definir'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="notification-options" style="background: var(--bg-card); border-radius: 12px; padding: 16px;">
                        <h4 style="margin: 0 0 12px 0; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px; color: #25D366;">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            Notificación al Cliente
                        </h4>
                        <p style="margin: 0 0 16px 0; font-size: 13px; color: var(--text-secondary);">El cliente recibirá un mensaje con:</p>
                        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: var(--text-secondary); line-height: 1.6;">
                            <li>Confirmación de que su equipo está listo</li>
                            <li>Dirección y datos de contacto del taller</li>
                            <li>Monto a pagar</li>
                            <li><strong>Aviso importante:</strong> Plazo de 30 días para recoger</li>
                        </ul>
                    </div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" data-action="skip">Solo Cambiar Estado</button>
                <button class="btn btn-success" data-action="notify">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px; margin-right: 6px;">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Cambiar Estado y Notificar
                </button>
            `,
            size: 'medium'
        });
        
        // Skip - just change status without notification
        readyModal.element.querySelector('[data-action="skip"]').onclick = async () => {
            try {
                await updateRepair(repair.id, { status: 'ready' });
                toast.success('Estado actualizado a: Listo para entrega');
                readyModal.destroy();
                openRepairPanel(repair.id);
                await loadRepairs();
                await loadDashboardData();
                resolve(true);
            } catch (error) {
                console.error('Error updating status:', error);
                toast.error('Error al actualizar estado');
                resolve(false);
            }
        };
        
        // Notify - change status and send WhatsApp
        readyModal.element.querySelector('[data-action="notify"]').onclick = async () => {
            const notifyBtn = readyModal.element.querySelector('[data-action="notify"]');
            
            try {
                showLoading(notifyBtn, { text: 'Enviando...' });
                
                // Update status first
                await updateRepair(repair.id, { status: 'ready' });
                
                // Send WhatsApp notification
                const { sendReadyForPickupNotification } = await import('../services/whatsappService.js');
                await sendReadyForPickupNotification(repair, shop);
                
                hideLoading(notifyBtn);
                toast.success('¡Estado actualizado y cliente notificado!');
                readyModal.destroy();
                openRepairPanel(repair.id);
                await loadRepairs();
                await loadDashboardData();
                resolve(true);
                
            } catch (error) {
                hideLoading(notifyBtn);
                console.error('Error sending notification:', error);
                
                // Still update status even if notification fails
                try {
                    await updateRepair(repair.id, { status: 'ready' });
                    toast.warning('Estado actualizado pero no se pudo enviar la notificación');
                    readyModal.destroy();
                    openRepairPanel(repair.id);
                    await loadRepairs();
                    await loadDashboardData();
                } catch (updateError) {
                    toast.error('Error al actualizar estado');
                }
                
                resolve(false);
            }
        };
        
        readyModal.open();
    });
}

/**
 * Show delivery confirmation modal
 */
async function showDeliveryConfirmationModal(repair, finalAmount) {
    return new Promise((resolve) => {
        const confirmModal = modal.create({
            title: '⚠️ Confirmar Entrega',
            content: `
                <div class="delivery-confirmation-content">
                    <div class="warning-banner">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px; color: var(--warning);">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <div>
                            <strong>¡ATENCIÓN! Esta acción no se puede revertir</strong>
                            <p>Una vez marcado como entregado, no podrás cambiar el estado ni modificar la información de la reparación.</p>
                        </div>
                    </div>
                    
                    <div class="delivery-summary">
                        <h4>Resumen de la entrega:</h4>
                        <div class="summary-item">
                            <span class="label">Código:</span>
                            <span class="value">${repair.code}</span>
                        </div>
                        <div class="summary-item">
                            <span class="label">Cliente:</span>
                            <span class="value">${repair.client?.name || 'Sin nombre'}</span>
                        </div>
                        <div class="summary-item">
                            <span class="label">Dispositivo:</span>
                            <span class="value">${repair.device_brand} ${repair.device_model}</span>
                        </div>
                        <div class="summary-item">
                            <span class="label">Monto final:</span>
                            <span class="value money">${formatCurrency(finalAmount)}</span>
                        </div>
                    </div>
                    
                    <div class="confirmation-checkbox">
                        <label class="checkbox-container">
                            <input type="checkbox" id="delivery-confirm-check">
                            <span class="checkmark"></span>
                            Confirmo que he revisado toda la información y el equipo será entregado definitivamente
                        </label>
                    </div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" data-action="cancel">Cancelar</button>
                <button class="btn btn-danger" data-action="confirm" disabled>Confirmar Entrega</button>
            `,
            size: 'medium'
        });
        
        const checkBox = confirmModal.element.querySelector('#delivery-confirm-check');
        const confirmBtn = confirmModal.element.querySelector('[data-action="confirm"]');
        
        checkBox.addEventListener('change', () => {
            confirmBtn.disabled = !checkBox.checked;
            confirmBtn.classList.toggle('btn-danger', checkBox.checked);
        });
        
        confirmModal.element.querySelector('[data-action="cancel"]').onclick = () => {
            confirmModal.destroy();
            resolve(false);
        };
        
        confirmModal.element.querySelector('[data-action="confirm"]').onclick = () => {
            confirmModal.destroy();
            resolve(true);
        };
        
        confirmModal.open();
    });
}

/**
 * Show earnings calculation modal
 */
async function showEarningsCalculationModal(repair, finalAmount) {
    return new Promise((resolve) => {
        // Get the specific commission rate for the technician assigned to this repair
        const technicianCommissionRate = repair.tech?.commission_percentage || 30; // Default 30%
        const technicianName = repair.tech?.full_name || 'Técnico';
        
        const earningsModal = modal.create({
            title: '💰 Cálculo de Ganancias',
            content: `
                <div class="earnings-calculation-content">
                    <div class="earnings-header">
                        <div class="earnings-info">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px; color: var(--primary);">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 6v6l4 2"/>
                            </svg>
                            <div>
                                <h4>Separación de Costos</h4>
                                <p>Para calcular las ganancias reales, necesitamos separar los costos de repuestos/insumos de la mano de obra.</p>
                                <small style="color: var(--text-muted); display: block; margin-top: 4px;">
                                    <strong>Técnico:</strong> ${technicianName} - <strong>Comisión:</strong> ${technicianCommissionRate}%
                                </small>
                            </div>
                        </div>
                    </div>
                    
                    <div class="amount-breakdown">
                        <div class="breakdown-item total">
                            <span class="label">Total cobrado al cliente:</span>
                            <span class="value">${formatCurrency(finalAmount)}</span>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">💸 Costo real en repuestos/insumos</label>
                        <div class="input-with-icon">
                            <span class="input-icon">$</span>
                            <input type="number" class="form-input" id="parts-cost-input" 
                                   placeholder="0.00" step="0.01" min="0" max="${finalAmount}">
                        </div>
                        <small class="form-help">Ingresa el costo real de repuestos, componentes e insumos utilizados</small>
                    </div>
                    
                    <div class="calculation-preview" id="calculation-preview" style="display: none;">
                        <div class="preview-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;">
                                <polyline points="9,11 12,14 22,4"/>
                                <path d="M21,12v7a2,2 0 0,1-2,2H5a2,2 0 0,1-2-2V5a2,2 0 0,1,2-2h11"/>
                            </svg>
                            Vista previa del cálculo:
                        </div>
                        
                        <div class="calculation-breakdown">
                            <div class="calc-item">
                                <span class="calc-label">Costo de repuestos:</span>
                                <span class="calc-value cost" id="parts-display">$0</span>
                            </div>
                            <div class="calc-item labor">
                                <span class="calc-label">Mano de obra (ganancia):</span>
                                <span class="calc-value profit" id="labor-display">$0</span>
                            </div>
                            <hr class="calc-divider">
                            <div class="calc-item commission">
                                <span class="calc-label">Comisión ${technicianName} (${technicianCommissionRate}%):</span>
                                <span class="calc-value tech" id="tech-commission-display">$0</span>
                            </div>
                            <div class="calc-item commission">
                                <span class="calc-label">Ganancia administrador (${100 - technicianCommissionRate}%):</span>
                                <span class="calc-value admin" id="admin-commission-display">$0</span>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" data-action="cancel">Cancelar</button>
                <button class="btn btn-success" data-action="save" disabled>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 6px;">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17,21 17,13 7,13 7,21"/>
                        <polyline points="7,3 7,8 15,8"/>
                    </svg>
                    Guardar y Entregar
                </button>
            `,
            size: 'large'
        });
        
        const partsInput = earningsModal.element.querySelector('#parts-cost-input');
        const preview = earningsModal.element.querySelector('#calculation-preview');
        const saveBtn = earningsModal.element.querySelector('[data-action="save"]');
        
        function updateCalculation() {
            const partsCost = parseFloat(partsInput.value) || 0;
            const laborCost = finalAmount - partsCost;
            const techCommission = laborCost * (technicianCommissionRate / 100);
            const adminProfit = laborCost * ((100 - technicianCommissionRate) / 100);
            
            earningsModal.element.querySelector('#parts-display').textContent = formatCurrency(partsCost);
            earningsModal.element.querySelector('#labor-display').textContent = formatCurrency(laborCost);
            earningsModal.element.querySelector('#tech-commission-display').textContent = formatCurrency(techCommission);
            earningsModal.element.querySelector('#admin-commission-display').textContent = formatCurrency(adminProfit);
            
            preview.style.display = partsCost >= 0 ? 'block' : 'none';
            saveBtn.disabled = partsCost < 0 || partsCost > finalAmount;
            
            // Update visual feedback
            if (laborCost < 0) {
                earningsModal.element.querySelector('#labor-display').style.color = 'var(--error)';
                saveBtn.disabled = true;
            } else {
                earningsModal.element.querySelector('#labor-display').style.color = 'var(--success)';
            }
        }
        
        partsInput.addEventListener('input', updateCalculation);
        partsInput.addEventListener('focus', updateCalculation);
        
        earningsModal.element.querySelector('[data-action="cancel"]').onclick = () => {
            earningsModal.destroy();
            resolve(false);
        };
        
        earningsModal.element.querySelector('[data-action="save"]').onclick = async () => {
            const partsCost = parseFloat(partsInput.value) || 0;
            const laborCost = finalAmount - partsCost;
            const techCommission = laborCost * (technicianCommissionRate / 100);
            const adminProfit = laborCost * ((100 - technicianCommissionRate) / 100);
            
            const saveBtn = earningsModal.element.querySelector('[data-action="save"]');
            
            try {
                showLoading(saveBtn, { text: 'Procesando entrega...' });
                
                // Update repair with all the financial data
                const updateData = {
                    status: 'delivered',
                    final_amount: finalAmount,
                    delivered_date: new Date().toISOString(),
                    total_cost: partsCost,           // Costo de repuestos
                    total_profit: laborCost,         // Ganancia de mano de obra
                    tech_commission: techCommission   // Comisión del técnico
                };
                
                await updateRepair(repair.id, updateData);
                hideLoading(saveBtn);
                
                toast.success('¡Reparación entregada y ganancias calculadas!');
                earningsModal.destroy();
                
                // Refresh data
                openRepairPanel(repair.id);
                await loadRepairs();
                await loadDashboardData();
                
            } catch (error) {
                hideLoading(saveBtn);
                console.error('Error delivering repair:', error);
                toast.error('Error al procesar la entrega');
            }
        };
        
        earningsModal.open();
        
        // Focus on input after modal opens
        setTimeout(() => {
            partsInput.focus();
        }, 300);
    });
}

/**
 * Show WhatsApp target selection modal
 */
function showWhatsAppTargetModal(repair) {
    const hasClient = repair.client?.phone || repair.client?.whatsapp;
    const hasTech = repair.tech && (repair.tech.phone || repair.tech.whatsapp);
    
    if (!hasClient && !hasTech) {
        toast.error('No hay destinatarios disponibles');
        return;
    }
    
    const clientPhone = repair.client?.whatsapp || repair.client?.phone;
    const techPhone = repair.tech?.whatsapp || repair.tech?.phone;
    const clientName = repair.client?.name || 'Cliente';
    const techName = repair.tech?.full_name || 'Técnico';
    const clientInitials = clientName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const techInitials = techName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    
    const newModal = modal.create({
        title: '',
        content: `
            <div class="whatsapp-modal-container">
                <!-- Header con icono de WhatsApp -->
                <div class="whatsapp-modal-header">
                    <div class="whatsapp-icon-wrapper">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="#25D366">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                    </div>
                    <div class="whatsapp-modal-title">
                        <h3>Enviar mensaje de WhatsApp</h3>
                        <p>Selecciona el destinatario del mensaje</p>
                    </div>
                </div>
                
                <!-- Info de la reparación -->
                <div class="whatsapp-repair-info">
                    <div class="whatsapp-repair-badge">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                        </svg>
                        <span>${repair.code}</span>
                    </div>
                    <span class="whatsapp-repair-device">${repair.device_brand || ''} ${repair.device_model || ''}</span>
                </div>
                
                <!-- Opciones de destinatario -->
                <div class="whatsapp-target-cards">
                    ${hasClient ? `
                        <div class="whatsapp-target-card" id="whatsapp-to-client" tabindex="0">
                            <div class="whatsapp-target-card-header">
                                <div class="whatsapp-avatar whatsapp-avatar-client">
                                    <span>${clientInitials}</span>
                                </div>
                                <div class="whatsapp-target-info">
                                    <div class="whatsapp-target-role">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                            <circle cx="12" cy="7" r="4"/>
                                        </svg>
                                        Cliente
                                    </div>
                                    <div class="whatsapp-target-name">${clientName}</div>
                                    <div class="whatsapp-target-phone">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                        </svg>
                                        ${clientPhone ? formatPhone(clientPhone) : 'Sin teléfono'}
                                    </div>
                                </div>
                                <div class="whatsapp-target-arrow">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M9 18l6-6-6-6"/>
                                    </svg>
                                </div>
                            </div>
                            <div class="whatsapp-target-card-footer">
                                <div class="whatsapp-message-preview">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                    </svg>
                                    <span>Mensaje con estado de reparación y link de seguimiento</span>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${hasTech ? `
                        <div class="whatsapp-target-card" id="whatsapp-to-tech" tabindex="0">
                            <div class="whatsapp-target-card-header">
                                <div class="whatsapp-avatar whatsapp-avatar-tech">
                                    <span>${techInitials}</span>
                                </div>
                                <div class="whatsapp-target-info">
                                    <div class="whatsapp-target-role">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                                        </svg>
                                        Técnico Asignado
                                    </div>
                                    <div class="whatsapp-target-name">${techName}</div>
                                    <div class="whatsapp-target-phone">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                        </svg>
                                        ${techPhone ? formatPhone(techPhone) : 'Sin teléfono'}
                                    </div>
                                </div>
                                <div class="whatsapp-target-arrow">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M9 18l6-6-6-6"/>
                                    </svg>
                                </div>
                            </div>
                            <div class="whatsapp-target-card-footer">
                                <div class="whatsapp-message-preview">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                    </svg>
                                    <span>Mensaje con detalles de la reparación asignada</span>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Footer con nota -->
                <div class="whatsapp-modal-footer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 16v-4"/>
                        <path d="M12 8h.01"/>
                    </svg>
                    <span>Se abrirá WhatsApp con el mensaje predefinido</span>
                </div>
            </div>
            
            <style>
                .whatsapp-modal-container {
                    padding: 0;
                }
                
                .whatsapp-modal-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid var(--border-subtle);
                    margin-bottom: 16px;
                }
                
                .whatsapp-icon-wrapper {
                    width: 56px;
                    height: 56px;
                    border-radius: 16px;
                    background: linear-gradient(135deg, rgba(37, 211, 102, 0.15) 0%, rgba(37, 211, 102, 0.05) 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                
                .whatsapp-modal-title h3 {
                    font-size: 18px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin: 0 0 4px 0;
                }
                
                .whatsapp-modal-title p {
                    font-size: 13px;
                    color: var(--text-muted);
                    margin: 0;
                }
                
                .whatsapp-repair-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background: var(--bg-elevated);
                    border-radius: 10px;
                    margin-bottom: 20px;
                }
                
                .whatsapp-repair-badge {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    background: var(--accent-50, rgba(99, 102, 241, 0.1));
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--accent, #6366F1);
                }
                
                .whatsapp-repair-device {
                    font-size: 13px;
                    color: var(--text-secondary);
                }
                
                .whatsapp-target-cards {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-bottom: 20px;
                }
                
                .whatsapp-target-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-light);
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    overflow: hidden;
                }
                
                .whatsapp-target-card:hover {
                    border-color: #25D366;
                    box-shadow: 0 4px 20px rgba(37, 211, 102, 0.15);
                    transform: translateY(-2px);
                }
                
                .whatsapp-target-card:focus {
                    outline: none;
                    border-color: #25D366;
                    box-shadow: 0 0 0 3px rgba(37, 211, 102, 0.2);
                }
                
                .whatsapp-target-card-header {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 16px;
                }
                
                .whatsapp-avatar {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    font-weight: 700;
                    flex-shrink: 0;
                }
                
                .whatsapp-avatar-client {
                    background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
                    color: white;
                }
                
                .whatsapp-avatar-tech {
                    background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
                    color: white;
                }
                
                .whatsapp-target-info {
                    flex: 1;
                    min-width: 0;
                }
                
                .whatsapp-target-role {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    font-weight: 500;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 4px;
                }
                
                .whatsapp-target-name {
                    font-size: 15px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 4px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .whatsapp-target-phone {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 13px;
                    color: var(--text-secondary);
                }
                
                .whatsapp-target-arrow {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: var(--bg-elevated);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-muted);
                    transition: all 0.2s ease;
                    flex-shrink: 0;
                }
                
                .whatsapp-target-card:hover .whatsapp-target-arrow {
                    background: #25D366;
                    color: white;
                    transform: translateX(4px);
                }
                
                .whatsapp-target-card-footer {
                    padding: 12px 16px;
                    background: var(--bg-elevated);
                    border-top: 1px solid var(--border-subtle);
                }
                
                .whatsapp-message-preview {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                    color: var(--text-muted);
                }
                
                .whatsapp-modal-footer {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px;
                    background: rgba(37, 211, 102, 0.08);
                    border-radius: 8px;
                    font-size: 12px;
                    color: #25D366;
                }
            </style>
        `,
        size: 'medium',
        closable: true,
        className: 'whatsapp-selection-modal'
    });
    
    // Event listeners
    newModal.element.querySelector('#whatsapp-to-client')?.addEventListener('click', () => {
        sendToClientFromAdmin(repair, shop);
        newModal.destroy();
    });
    
    newModal.element.querySelector('#whatsapp-to-tech')?.addEventListener('click', () => {
        sendToTechnician(repair, shop, repair.tech);
        newModal.destroy();
    });
    
    // Keyboard navigation
    newModal.element.querySelectorAll('.whatsapp-target-card').forEach(card => {
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    });
    
    newModal.open();
}

/**
 * Update quote
 */
async function updateQuote(repair) {
    const newModal = modal.create({
        title: 'Actualizar Cotización',
        content: `
            <div class="form-group">
                <label class="form-label">Estado de cotización</label>
                <select class="form-select" id="quote-status-select">
                    <option value="pending" ${repair.quote_status === 'pending' ? 'selected' : ''}>Pendiente</option>
                    <option value="approximate" ${repair.quote_status === 'approximate' ? 'selected' : ''}>Aproximada</option>
                    <option value="accepted" ${repair.quote_status === 'accepted' ? 'selected' : ''}>Aceptada</option>
                    <option value="rejected" ${repair.quote_status === 'rejected' ? 'selected' : ''}>Rechazada</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Monto</label>
                <input type="number" class="form-input" id="quote-amount-input" value="${repair.quote_amount || 0}">
            </div>
            <div class="form-group">
                <label class="form-label">Descripción</label>
                <textarea class="form-textarea" id="quote-description-input" rows="3">${repair.quote_description || ''}</textarea>
            </div>
        `,
        footer: `
            <button class="btn btn-secondary" data-action="cancel">Cancelar</button>
            <button class="btn btn-primary" data-action="save">Guardar</button>
        `,
        size: 'small'
    });
    
    newModal.element.querySelector('[data-action="cancel"]').onclick = () => newModal.destroy();
    newModal.element.querySelector('[data-action="save"]').onclick = async () => {
        try {
            await updateRepair(repair.id, {
                quote_status: newModal.element.querySelector('#quote-status-select').value,
                quote_amount: parseFloat(newModal.element.querySelector('#quote-amount-input').value) || 0,
                quote_description: newModal.element.querySelector('#quote-description-input').value
            });
            toast.success('Cotización actualizada');
            newModal.destroy();
            openRepairPanel(repair.id);
            await loadRepairs();
        } catch (error) {
            toast.error('Error al actualizar');
        }
    };
    
    newModal.open();
}

/**
 * Update client data for a repair
 */
async function updateClientData(repair) {
    const clientData = repair.client || {};
    
    // Obtener el número de reparaciones de este cliente
    const repairCount = await getClientRepairCount(clientData.id);
    
    const newModal = modal.create({
        title: 'Editar Datos del Cliente',
        content: `
            <div class="form-group">
                <label class="form-label">Nombre completo *</label>
                <input type="text" class="form-input" id="edit-client-name" value="${clientData.name || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Teléfono *</label>
                <input type="tel" class="form-input" id="edit-client-phone" value="${clientData.phone || ''}" placeholder="1234567890" required>
                <small class="form-hint">Número de 10 dígitos sin espacios ni guiones</small>
            </div>
            <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" class="form-input" id="edit-client-email" value="${clientData.email || ''}" placeholder="cliente@ejemplo.com">
            </div>
            <p class="form-hint" style="margin-top: 16px; padding: 12px; background: var(--warning-bg, #FFF3CD); border-left: 3px solid var(--warning, #FFA500); border-radius: 4px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; color: var(--warning);">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <strong>Importante:</strong> Los cambios se aplicarán a este cliente en todas sus reparaciones${repairCount > 0 ? ` (${repairCount} reparación${repairCount !== 1 ? 'es' : ''} en total)` : ''}.
            </p>
        `,
        footer: `
            <button class="btn btn-secondary" data-action="cancel">Cancelar</button>
            <button class="btn btn-primary" data-action="save">Guardar Cambios</button>
        `,
        size: 'small'
    });
    
    newModal.element.querySelector('[data-action="cancel"]').onclick = () => newModal.destroy();
    newModal.element.querySelector('[data-action="save"]').onclick = async () => {
        const name = newModal.element.querySelector('#edit-client-name').value.trim();
        const phone = newModal.element.querySelector('#edit-client-phone').value.trim();
        const email = newModal.element.querySelector('#edit-client-email').value.trim();
        
        // Validación
        if (!name) {
            toast.error('El nombre es requerido');
            return;
        }
        
        if (!phone) {
            toast.error('El teléfono es requerido');
            return;
        }
        
        // Validar formato de teléfono (10 dígitos)
        const phoneRegex = /^\d{10}$/;
        if (!phoneRegex.test(phone)) {
            toast.error('El teléfono debe tener 10 dígitos');
            return;
        }
        
        // Validar email si se proporcionó
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                toast.error('El email no es válido');
                return;
            }
        }
        
        try {
            // Actualizar los datos del cliente
            await updateClient(clientData.id, {
                name: name,
                phone: phone,
                email: email || null
            });
            
            toast.success('Datos del cliente actualizados correctamente');
            newModal.destroy();
            openRepairPanel(repair.id);
            await loadRepairs();
        } catch (error) {
            console.error('Error updating client data:', error);
            toast.error('Error al actualizar los datos del cliente');
        }
    };
    
    newModal.open();
}

/**
 * Get count of repairs for a client
 */
async function getClientRepairCount(clientId) {
    if (!clientId) return 0;
    
    try {
        const supabase = getSupabase();
        const { count } = await supabase
            .from('repairs')
            .select('id', { count: 'exact', head: true })
            .eq('client_id', clientId)
            .eq('is_deleted', false);
        
        return count || 0;
    } catch (error) {
        console.error('Error getting client repair count:', error);
        return 0;
    }
}

/**
 * Close repair panel
 */
function closeRepairPanel() {
    $('#repair-panel').classList.remove('active');
    selectedRepairId = null;
}

/**
 * Show intake photos modal
 */
function showIntakePhotosModal(photos, repair) {
    if (!photos || photos.length === 0) {
        toast.info('No hay fotos de ingreso');
        return;
    }
    
    const photosHtml = photos.map((photo, index) => `
        <div class="intake-photo-item" style="position: relative; cursor: pointer;" data-index="${index}">
            <img src="${photo.file_url}" 
                 alt="Foto ${index + 1}" 
                 style="width: 100%; height: 200px; object-fit: cover; border-radius: 8px; transition: transform 0.2s;"
                 onmouseover="this.style.transform='scale(1.05)'"
                 onmouseout="this.style.transform='scale(1)'">
            <div style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                ${index + 1}/${photos.length}
            </div>
            ${photo.description ? `
                <div style="position: absolute; bottom: 8px; left: 8px; right: 8px; background: rgba(0,0,0,0.7); color: white; padding: 6px 8px; border-radius: 4px; font-size: 11px;">
                    ${photo.description}
                </div>
            ` : ''}
        </div>
    `).join('');
    
    const newModal = modal.create({
        title: `📸 Fotos de Ingreso - ${repair.code}`,
        content: `
            <div style="margin-bottom: 12px; padding: 12px; background: var(--bg-secondary); border-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    </svg>
                    <strong>Dispositivo:</strong> ${repair.device_brand} ${repair.device_model}
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <strong>Fecha de ingreso:</strong> ${formatDateTime(repair.intake_date)}
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; max-height: 60vh; overflow-y: auto;">
                ${photosHtml}
            </div>
            <p style="margin-top: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">
                Haz clic en cualquier foto para verla en tamaño completo
            </p>
        `,
        footer: `
            <button class="btn btn-secondary" data-action="close">Cerrar</button>
        `,
        size: 'large'
    });
    
    // Add click handlers for photos
    newModal.element.querySelectorAll('.intake-photo-item').forEach((item) => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            showPhotoLightbox(photos, index);
        });
    });
    
    newModal.element.querySelector('[data-action="close"]').onclick = () => newModal.destroy();
    
    newModal.open();
}

/**
 * Show photo lightbox (fullscreen viewer)
 */
function showPhotoLightbox(photos, startIndex = 0) {
    let currentIndex = startIndex;
    
    const updatePhoto = () => {
        const photo = photos[currentIndex];
        const img = lightbox.querySelector('#lightbox-image');
        const counter = lightbox.querySelector('#lightbox-counter');
        const description = lightbox.querySelector('#lightbox-description');
        
        img.src = photo.file_url;
        counter.textContent = `${currentIndex + 1} / ${photos.length}`;
        description.textContent = photo.description || '';
        description.style.display = photo.description ? 'block' : 'none';
    };
    
    const lightbox = document.createElement('div');
    lightbox.id = 'photo-lightbox';
    lightbox.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.95);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(5px);
    `;
    
    lightbox.innerHTML = `
        <div style="position: absolute; top: 16px; left: 16px; right: 16px; display: flex; justify-content: space-between; align-items: center; color: white; z-index: 10001;">
            <div id="lightbox-counter" style="font-size: 18px; font-weight: 600; background: rgba(0,0,0,0.5); padding: 8px 16px; border-radius: 8px;">
                ${currentIndex + 1} / ${photos.length}
            </div>
            <button id="lightbox-close" style="background: rgba(0,0,0,0.5); border: none; color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 24px; transition: background 0.2s;">
                ×
            </button>
        </div>
        
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; padding: 80px 20px 60px;">
            <img id="lightbox-image" src="${photos[currentIndex].file_url}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
        </div>
        
        ${photos[currentIndex].description ? `
            <div id="lightbox-description" style="position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 12px 24px; border-radius: 8px; max-width: 80%; text-align: center;">
                ${photos[currentIndex].description}
            </div>
        ` : '<div id="lightbox-description" style="display: none;"></div>'}
        
        <div style="position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px;">
            ${photos.length > 1 ? `
                <button id="lightbox-prev" style="background: rgba(255,255,255,0.9); border: none; color: #333; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: background 0.2s;">
                    ← Anterior
                </button>
                <button id="lightbox-next" style="background: rgba(255,255,255,0.9); border: none; color: #333; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: background 0.2s;">
                    Siguiente →
                </button>
            ` : ''}
        </div>
    `;
    
    document.body.appendChild(lightbox);
    
    // Close button
    lightbox.querySelector('#lightbox-close').addEventListener('click', () => {
        lightbox.remove();
    });
    
    // Navigation
    if (photos.length > 1) {
        lightbox.querySelector('#lightbox-prev').addEventListener('click', () => {
            currentIndex = (currentIndex - 1 + photos.length) % photos.length;
            updatePhoto();
        });
        
        lightbox.querySelector('#lightbox-next').addEventListener('click', () => {
            currentIndex = (currentIndex + 1) % photos.length;
            updatePhoto();
        });
        
        // Keyboard navigation
        const handleKeyboard = (e) => {
            if (e.key === 'ArrowLeft') {
                currentIndex = (currentIndex - 1 + photos.length) % photos.length;
                updatePhoto();
            } else if (e.key === 'ArrowRight') {
                currentIndex = (currentIndex + 1) % photos.length;
                updatePhoto();
            } else if (e.key === 'Escape') {
                lightbox.remove();
                document.removeEventListener('keydown', handleKeyboard);
            }
        };
        
        document.addEventListener('keydown', handleKeyboard);
    }
    
    // Close on background click
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            lightbox.remove();
        }
    });
}

/**
 * Open tech modal
 */
function openTechModal(tech = null) {
    const form = $('#tech-form');
    resetForm(form);
    
    // Reset link user controls
    const linkCheckbox = $('#link-existing-user');
    const uuidGroup = $('#user-uuid-group');
    const emailInput = $('#tech-email');
    const passwordInput = $('#tech-password');
    const uuidInput = $('#tech-user-uuid');
    
    if (linkCheckbox) linkCheckbox.checked = false;
    if (uuidGroup) uuidGroup.style.display = 'none';
    if (uuidInput) uuidInput.required = false;
    
    if (tech) {
        $('#tech-modal-title').textContent = 'Editar Técnico';
        $('#tech-id').value = tech.id;
        form.elements.full_name.value = tech.full_name || '';
        form.elements.email.value = tech.email || '';
        form.elements.phone.value = tech.phone || '';
        form.elements.commission_rate.value = tech.commission_percentage || tech.commission_rate || 30;
        $('#tech-password-group').style.display = 'none';
        $('#tech-email-group')?.style && ($('#tech-email-group').style.display = 'none');
        $('#link-user-toggle-group')?.style && ($('#link-user-toggle-group').style.display = 'none');
        $('#tech-submit-btn').textContent = 'Guardar Cambios';
        // No required for edit mode
        if (emailInput) emailInput.required = false;
        if (passwordInput) passwordInput.required = false;
    } else {
        $('#tech-modal-title').textContent = 'Nuevo Técnico';
        $('#tech-id').value = '';
        $('#tech-password-group').style.display = 'block';
        $('#tech-email-group')?.style && ($('#tech-email-group').style.display = 'block');
        $('#link-user-toggle-group')?.style && ($('#link-user-toggle-group').style.display = 'block');
        $('#tech-submit-btn').textContent = 'Crear Técnico';
        // Required for new tech (default mode - not linking)
        if (emailInput) emailInput.required = true;
        if (passwordInput) passwordInput.required = true;
    }
    
    modal.open('tech-modal');
}

/**
 * Generate UUID v4
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Handle tech form submit
 */
async function handleTechSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = $('#tech-submit-btn');
    const techId = $('#tech-id').value;
    
    showLoading(submitBtn, { text: 'Guardando...' });
    
    try {
        if (techId) {
            // Update existing - only fields in profiles table
            const updateData = {
                full_name: form.elements.full_name.value.trim(),
                phone: form.elements.phone.value.trim() || null,
                commission_percentage: parseFloat(form.elements.commission_rate.value) || null
            };
            
            await getSupabase().from('profiles').update(updateData).eq('id', techId);
            toast.success('Técnico actualizado');
        } else {
            // Check if linking existing user
            const isLinkingUser = $('#link-existing-user')?.checked;
            const fullName = form.elements.full_name.value.trim();
            const phone = form.elements.phone.value.trim() || null;
            const commissionRate = parseFloat(form.elements.commission_rate.value) || 30;
            
            if (!fullName) {
                toast.error('El nombre es requerido');
                hideLoading(submitBtn);
                return;
            }
            
            let userId;
            
            if (isLinkingUser) {
                // Link existing user from Supabase
                userId = $('#tech-user-uuid').value.trim();
                
                if (!userId || userId.length < 36) {
                    toast.error('Ingresa un UUID válido del usuario');
                    hideLoading(submitBtn);
                    return;
                }
                
                // Verify UUID format
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidRegex.test(userId)) {
                    toast.error('El formato del UUID no es válido');
                    hideLoading(submitBtn);
                    return;
                }
            } else {
                // Create new user with Supabase Auth
                const email = form.elements.email.value.trim();
                const password = form.elements.password.value;
                
                if (!email || !password) {
                    toast.error('Email y contraseña son requeridos');
                    hideLoading(submitBtn);
                    return;
                }
                
                if (password.length < 6) {
                    toast.error('La contraseña debe tener al menos 6 caracteres');
                    hideLoading(submitBtn);
                    return;
                }
                
                // 1. Create user in Supabase Auth
                const { data: authData, error: authError } = await getSupabase().auth.signUp({
                    email,
                    password,
                    options: {
                        data: { full_name: fullName }
                    }
                });
                
                if (authError) {
                    // Check if it's a rate limit error
                    if (authError.message.includes('rate limit')) {
                        toast.error('Límite alcanzado. Marca "Vincular usuario ya creado" y crea el usuario desde Supabase Dashboard.');
                        hideLoading(submitBtn);
                        return;
                    }
                    throw authError;
                }
                
                if (!authData.user) {
                    throw new Error('No se pudo crear el usuario');
                }
                
                userId = authData.user.id;
            }
            
            // 2. Create/update profile with tech role
            const { error: profileError } = await getSupabase()
                .from('profiles')
                .upsert({
                    id: userId,
                    full_name: fullName,
                    role: 'tech',
                    shop_id: shopId,
                    phone: phone,
                    commission_percentage: commissionRate,
                    is_active: true
                }, { onConflict: 'id' });
            
            if (profileError) {
                console.error('Error creating profile:', profileError);
                if (isLinkingUser) {
                    toast.error('Error al vincular usuario. Verifica que el UUID sea correcto.');
                } else {
                    toast.warning('Usuario creado pero falló el perfil');
                }
                throw profileError;
            }
            
            const successMsg = isLinkingUser 
                ? 'Usuario vinculado como técnico exitosamente.' 
                : 'Técnico creado exitosamente. Ya puede iniciar sesión.';
            toast.success(successMsg);
        }
        
        modal.close('tech-modal');
        await loadTechnicians();
        
    } catch (error) {
        console.error('Error saving technician:', error);
        toast.error(error.message || 'Error al guardar técnico');
    } finally {
        hideLoading(submitBtn);
    }
}

/**
 * Handle settings submit
 */
async function handleSettingsSubmit(e) {
    e.preventDefault();
    
    try {
        const data = {
            name: $('#settings-shop-name').value.trim(),
            phone: $('#settings-shop-phone').value.trim() || null,
            whatsapp: $('#settings-shop-whatsapp').value.trim() || null,
            email: $('#settings-shop-email').value.trim() || null,
            address: $('#settings-shop-address').value.trim() || null,
            default_tech_commission: parseFloat($('#settings-commission').value) || null
        };
        
        await updateShop(shopId, data);
        shop = { ...shop, ...data };
        
        // Handle logo upload or removal
        const logoInput = $('#settings-logo-input');
        
        if (logoInput?.dataset.remove === 'true') {
            // Remove logo
            await updateShop(shopId, { logo_url: null });
            shop.logo_url = null;
            logoInput.dataset.remove = 'false';
            toast.success('Configuración guardada y logo eliminado');
        } else if (logoInput?.files && logoInput.files.length > 0) {
            // Upload new logo
            const logoUrl = await uploadShopLogo(shopId, logoInput.files[0]);
            await updateShop(shopId, { logo_url: logoUrl });
            shop.logo_url = logoUrl;
            logoInput.value = ''; // Clear input
            toast.success('Configuración guardada y logo actualizado');
        } else {
            toast.success('Configuración guardada');
        }
        
        updateUserInfo();
        
    } catch (error) {
        console.error('Error saving settings:', error);
        toast.error('Error al guardar');
    }
}

/**
 * Handle logo file selection
 */
function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        toast.error('Por favor selecciona una imagen válida');
        e.target.value = '';
        return;
    }
    
    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
        toast.error('La imagen no debe superar 2MB');
        e.target.value = '';
        return;
    }
    
    // Preview image
    const reader = new FileReader();
    reader.onload = (event) => {
        const logoImg = $('#settings-logo-img');
        const logoPlaceholder = $('#settings-logo-placeholder');
        const logoRemoveBtn = $('#settings-logo-remove');
        
        logoImg.src = event.target.result;
        logoImg.style.display = 'block';
        logoPlaceholder.style.display = 'none';
        logoRemoveBtn.style.display = 'inline-flex';
        e.target.dataset.remove = 'false';
    };
    reader.readAsDataURL(file);
}

/**
 * Handle logo removal
 */
function handleLogoRemove(e) {
    e.preventDefault();
    
    const logoInput = $('#settings-logo-input');
    const logoImg = $('#settings-logo-img');
    const logoPlaceholder = $('#settings-logo-placeholder');
    const logoRemoveBtn = $('#settings-logo-remove');
    
    logoInput.value = '';
    logoInput.dataset.remove = 'true';
    logoImg.src = '';
    logoImg.style.display = 'none';
    logoPlaceholder.style.display = 'block';
    logoRemoveBtn.style.display = 'none';
}

// =====================================================
// GLOBAL FUNCTIONS FOR HTML ONCLICK HANDLERS  
// =====================================================

/**
 * Mark commission as paid (called from HTML)
 */
/**
 * Mark commission paid for a specific technician (called from HTML)
 */
async function markCommissionPaid(techId, techName, amount) {
    try {
        const { repairs } = currentFinancialData;
        
        if (!repairs || repairs.length === 0) {
            toast.warning('No hay datos disponibles');
            return;
        }
        
        // Filter repairs for this technician (only unpaid)
        const techRepairs = repairs.filter(repair => 
            repair.tech_id === techId && 
            repair.tech && 
            repair.tech_commission > 0 &&
            !repair.commission_paid
        );
        
        if (techRepairs.length === 0) {
            toast.warning('No hay comisiones pendientes para este técnico');
            return;
        }
        
        const confirmed = await confirmModal(
            'Confirmar Pago de Comisión',
            `
                <div style="text-align: center; padding: 16px 0;">
                    <p style="margin-bottom: 16px; color: var(--text-secondary);">
                        ¿Confirmar que se le pagó la comisión a <strong>${techName}</strong>?
                    </p>
                    <div style="background: var(--bg-elevated); border-radius: 12px; padding: 20px; margin: 16px 0;">
                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                            Monto a pagar
                        </div>
                        <div style="font-size: 32px; font-weight: bold; color: var(--primary);">
                            ${formatCurrency(amount)}
                        </div>
                        <div style="font-size: 13px; color: var(--text-muted); margin-top: 8px;">
                            ${techRepairs.length} reparación${techRepairs.length !== 1 ? 'es' : ''}
                        </div>
                    </div>
                    <p style="color: var(--text-muted); font-size: 12px;">
                        Esta acción marcará todas las comisiones de este técnico como pagadas.
                    </p>
                </div>
            `,
            'Confirmar Pago',
            'Cancelar'
        );
        
        if (!confirmed) return;
        
        // Get current user ID
        const { data: { user } } = await getSupabase().auth.getUser();
        
        if (!user) {
            toast.error('No se pudo obtener el usuario actual');
            return;
        }
        
        // Get repair IDs to update
        const repairIds = techRepairs.map(r => r.id);
        
        // Update repairs in database
        showLoading();
        const { error } = await getSupabase()
            .from('repairs')
            .update({ 
                commission_paid: true,
                commission_paid_date: new Date().toISOString(),
                commission_paid_by: user.id
            })
            .in('id', repairIds);
        
        hideLoading();
        
        if (error) {
            console.error('Error updating commission:', error);
            toast.error('Error al actualizar la comisión');
            return;
        }
        
        toast.success(`Comisión de ${formatCurrency(amount)} marcada como pagada a ${techName}`);
        
        // Reload financial data to reflect changes
        setTimeout(async () => {
            await loadFinancialData(currentFinancialData.startDate, currentFinancialData.endDate);
        }, 1000);
        
    } catch (error) {
        console.error('Error marking commission paid:', error);
        toast.error('Error al marcar la comisión como pagada');
    }
}

/**
 * View technician commission details (called from HTML)
 */
async function viewTechDetails(techId) {
    console.log('=== VIEW TECH DETAILS ===');
    console.log('Tech ID:', techId);
    
    try {
        const { repairs } = currentFinancialData;
        
        console.log('Total repairs available:', repairs?.length);
        
        if (!repairs || repairs.length === 0) {
            console.warn('No repairs data available');
            toast.warning('No hay datos de comisiones disponibles');
            return;
        }
        
        // Log all tech_ids to debug
        const allTechIds = repairs.map(r => r.tech_id).filter(Boolean);
        console.log('All tech IDs in data:', allTechIds);
        
        // Filter repairs for this technician (only unpaid commissions)
        const techRepairs = repairs.filter(repair => {
            const match = repair.tech_id === techId && 
                repair.tech && 
                repair.tech_commission > 0 &&
                !repair.commission_paid;
            
            if (repair.tech_id === techId) {
                console.log('Found repair for tech:', {
                    code: repair.code,
                    has_tech: !!repair.tech,
                    commission: repair.tech_commission,
                    paid: repair.commission_paid
                });
            }
            
            return match;
        });
        
        console.log('Filtered tech repairs:', techRepairs.length);
        
        if (techRepairs.length === 0) {
            console.warn('No unpaid commissions for this technician');
            toast.warning('No hay comisiones pendientes para este técnico');
            return;
        }
        
        const techName = techRepairs[0].tech.full_name;
        const techCommissionRate = techRepairs[0].tech.commission_percentage || 0;
        const totalCommission = techRepairs.reduce((sum, r) => sum + (r.tech_commission || 0), 0);
        
        console.log('Creating modal for:', techName, 'Total:', totalCommission);
        
        // Create detailed modal
        const detailsModal = modal.create({
            title: `💰 Detalle de Comisiones - ${techName}`,
            size: 'large',
            content: `
                <div class="commission-details-content">
                    <div class="commission-details-header">
                        <div class="commission-details-summary">
                            <div class="summary-item">
                                <div class="summary-label">Reparaciones</div>
                                <div class="summary-value">${techRepairs.length}</div>
                            </div>
                            <div class="summary-item highlight">
                                <div class="summary-label">Comisión Total</div>
                                <div class="summary-value">${formatCurrency(totalCommission)}</div>
                            </div>
                            <div class="summary-item">
                                <div class="summary-label">Porcentaje</div>
                                <div class="summary-value">${techCommissionRate}%</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="commission-details-list">
                        ${techRepairs.map(repair => {
                            // Cálculos correctos según schema:
                            // final_amount = Lo que se cobró al cliente
                            // total_cost = Costo de repuestos/insumos
                            // total_profit = Ganancia neta (final_amount - total_cost)
                            // tech_commission = Comisión del técnico
                            
                            const totalCobrado = repair.final_amount || 0;
                            const costoRepuestos = repair.total_cost || 0;
                            const gananciaNeta = repair.total_profit || (totalCobrado - costoRepuestos);
                            const comision = repair.tech_commission || 0;
                            const porcentajeReal = gananciaNeta > 0 ? ((comision / gananciaNeta) * 100).toFixed(1) : 0;
                            
                            return `
                                <div class="commission-detail-card">
                                    <div class="detail-card-header">
                                        <div class="detail-code">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px;">
                                                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                                            </svg>
                                            <span>#${repair.code}</span>
                                        </div>
                                        <div class="detail-commission">${formatCurrency(comision)}</div>
                                    </div>
                                    
                                    <div class="detail-card-info">
                                        <div class="detail-info-row">
                                            <span class="detail-info-label">Cliente:</span>
                                            <span class="detail-info-value">${repair.clients?.name || '-'}</span>
                                        </div>
                                        <div class="detail-info-row">
                                            <span class="detail-info-label">Dispositivo:</span>
                                            <span class="detail-info-value">${repair.device_brand} ${repair.device_model}</span>
                                        </div>
                                        <div class="detail-info-row">
                                            <span class="detail-info-label">Fecha entrega:</span>
                                            <span class="detail-info-value">${formatDate(repair.delivered_date)}</span>
                                        </div>
                                    </div>
                                    
                                    <div class="detail-card-breakdown">
                                        <div class="breakdown-title">Desglose Financiero</div>
                                        <div class="breakdown-items">
                                            <div class="breakdown-item">
                                                <span class="breakdown-label">
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                                                        <circle cx="12" cy="12" r="10"/>
                                                        <path d="M12 6v6l4 2"/>
                                                    </svg>
                                                    Total Cobrado
                                                </span>
                                                <span class="breakdown-value">${formatCurrency(totalCobrado)}</span>
                                            </div>
                                            <div class="breakdown-item subtract">
                                                <span class="breakdown-label">
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                                                        <line x1="5" y1="12" x2="19" y2="12"/>
                                                    </svg>
                                                    Costo Repuestos/Insumos
                                                </span>
                                                <span class="breakdown-value">${formatCurrency(costoRepuestos)}</span>
                                            </div>
                                            <div class="breakdown-divider"></div>
                                            <div class="breakdown-item total">
                                                <span class="breakdown-label">
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                                                        <polyline points="9,11 12,14 22,4"/>
                                                        <path d="M21,12v7a2,2 0 0,1-2,2H5a2,2 0 0,1-2-2V5a2,2 0 0,1,2-2h11"/>
                                                    </svg>
                                                    Ganancia Neta
                                                </span>
                                                <span class="breakdown-value">${formatCurrency(gananciaNeta)}</span>
                                            </div>
                                            <div class="breakdown-item commission">
                                                <span class="breakdown-label">
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                                                        <path d="M12 2v20m7-16H5a3 3 0 100 6h9a3 3 0 110 6H9"/>
                                                    </svg>
                                                    Tu Comisión (${porcentajeReal}%)
                                                </span>
                                                <span class="breakdown-value highlight">${formatCurrency(comision)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <style>
                    .commission-details-content {
                        max-height: 70vh;
                        overflow-y: auto;
                        padding: 8px 0;
                    }
                    
                    .commission-details-header {
                        margin-bottom: 24px;
                        position: sticky;
                        top: 0;
                        background: var(--bg-card);
                        z-index: 10;
                        padding: 16px 0;
                        border-bottom: 1px solid var(--border-subtle);
                    }
                    
                    .commission-details-summary {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 16px;
                    }
                    
                    .summary-item {
                        background: var(--bg-elevated);
                        padding: 16px;
                        border-radius: var(--radius-md);
                        text-align: center;
                    }
                    
                    .summary-item.highlight {
                        background: linear-gradient(135deg, var(--primary-subtle), var(--primary-subtle));
                        border: 1px solid var(--primary);
                    }
                    
                    .summary-label {
                        font-size: 13px;
                        color: var(--text-secondary);
                        margin-bottom: 8px;
                    }
                    
                    .summary-value {
                        font-size: 24px;
                        font-weight: 700;
                        color: var(--text-primary);
                    }
                    
                    .summary-item.highlight .summary-value {
                        color: var(--primary);
                    }
                    
                    .commission-details-list {
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }
                    
                    .commission-detail-card {
                        background: var(--bg-elevated);
                        border: 1px solid var(--border-subtle);
                        border-radius: var(--radius-md);
                        overflow: hidden;
                        transition: all var(--transition-fast);
                    }
                    
                    .commission-detail-card:hover {
                        border-color: var(--primary);
                        box-shadow: 0 4px 12px var(--primary-subtle);
                    }
                    
                    .detail-card-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 16px;
                        background: var(--bg-card);
                        border-bottom: 1px solid var(--border-subtle);
                    }
                    
                    .detail-code {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 600;
                        color: var(--primary);
                    }
                    
                    .detail-commission {
                        font-size: 20px;
                        font-weight: 700;
                        color: var(--success);
                    }
                    
                    .detail-card-info {
                        padding: 16px;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    
                    .detail-info-row {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        font-size: 14px;
                    }
                    
                    .detail-info-label {
                        color: var(--text-secondary);
                    }
                    
                    .detail-info-value {
                        color: var(--text-primary);
                        font-weight: 500;
                    }
                    
                    .detail-card-breakdown {
                        padding: 16px;
                        background: var(--bg-darker);
                        border-top: 1px solid var(--border-subtle);
                    }
                    
                    .breakdown-title {
                        font-size: 13px;
                        font-weight: 600;
                        color: var(--text-secondary);
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        margin-bottom: 12px;
                    }
                    
                    .breakdown-items {
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }
                    
                    .breakdown-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 12px;
                        border-radius: var(--radius-sm);
                        background: var(--bg-elevated);
                    }
                    
                    .breakdown-item.subtract {
                        opacity: 0.8;
                    }
                    
                    .breakdown-item.total {
                        background: var(--bg-card);
                        border: 1px solid var(--border-light);
                        font-weight: 600;
                    }
                    
                    .breakdown-item.commission {
                        background: var(--primary-subtle);
                        border: 1px solid var(--primary);
                        font-weight: 600;
                    }
                    
                    .breakdown-label {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 13px;
                        color: var(--text-secondary);
                    }
                    
                    .breakdown-value {
                        font-size: 14px;
                        font-weight: 600;
                        color: var(--text-primary);
                    }
                    
                    .breakdown-value.highlight {
                        color: var(--primary);
                        font-size: 16px;
                    }
                    
                    .breakdown-divider {
                        height: 1px;
                        background: var(--border-subtle);
                        margin: 4px 0;
                    }
                    
                    @media (max-width: 768px) {
                        .commission-details-summary {
                            grid-template-columns: 1fr;
                        }
                        
                        .detail-card-header {
                            flex-direction: column;
                            gap: 12px;
                            align-items: flex-start;
                        }
                    }
                </style>
            `,
            size: 'large',
            footer: `
                <button class="btn btn-secondary" data-action="close">Cerrar</button>
                <button class="btn btn-primary" data-action="mark-paid">Marcar como Pagado</button>
            `,
            closable: true
        });
        
        console.log('Modal created successfully');
        
        // Setup button actions
        const closeBtn = detailsModal.element.querySelector('[data-action="close"]');
        const markPaidBtn = detailsModal.element.querySelector('[data-action="mark-paid"]');
        
        if (closeBtn) {
            closeBtn.onclick = () => detailsModal.close();
        }
        
        if (markPaidBtn) {
            markPaidBtn.onclick = async () => {
                detailsModal.close();
                await markCommissionPaid(techId, techName, totalCommission);
            };
        }
        
        // Open the modal
        detailsModal.open();
        console.log('Modal opened');
        
    } catch (error) {
        console.error('=== ERROR IN VIEW TECH DETAILS ===');
        console.error('Error viewing tech details:', error);
        console.error('Stack:', error.stack);
        toast.error('Error al cargar los detalles: ' + error.message);
    }
}

/**
 * View repair details from transactions (called from HTML)
 */
function viewRepairDetails(repairId) {
    openRepairPanel(repairId);
}

// Make functions globally available
window.markCommissionPaid = markCommissionPaid;
window.viewTechDetails = viewTechDetails;
window.viewRepairDetails = viewRepairDetails;

/**
 * Setup realtime subscriptions
 */
function setupRealtime() {
    realtimeSubscription = subscribeToRepairs(shopId, (payload) => {
        console.log('Realtime update:', payload);
        
        // Refresh data
        loadDashboardData();
        if (currentSection === 'repairs') {
            loadRepairs();
        }
        
        // Update panel if open
        if (selectedRepairId && payload.new?.id === selectedRepairId) {
            openRepairPanel(selectedRepairId);
        }
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

/**
 * FIXORA - Technician Dashboard
 * Repair workstation for technicians
 */

import { CONFIG } from '../config.js';
import { requireAuth, signOut } from '../services/authService.js';
import { getShopById } from '../services/shopService.js';
import { 
    getRepairs, 
    getRepairById, 
    updateRepair,
    getRepairStages,
    addRepairStage,
    subscribeToRepairs
} from '../services/repairService.js';
import { uploadStageEvidence, getEvidenceUrl, getIntakeEvidence } from '../services/storageService.js';
import { getSupabase } from '../services/supabaseService.js';
import { 
    formatDate, 
    formatDateTime,
    formatCurrency, 
    formatRepairStatus,
    formatQuoteStatus,
    formatDeviceCategory,
    getInitials,
    getStatusBadgeClass,
    getQuoteBadgeClass
} from '../utils/formatters.js';
import toast from '../utils/toast.js';
import modal, { initModals } from '../utils/modal.js';
import { pickImages, setupDragDrop, createImagePreview } from '../utils/camera.js';
import { $, $$, delegate, showLoading, hideLoading, resetForm, formDataToObject } from '../utils/helpers.js';

// State
let currentSection = 'dashboard';
let userId = null;
let shopId = null;
let shop = null;
let profile = null;
let repairs = [];
let selectedRepairId = null;
let stagePhotos = [];
let realtimeSubscription = null;

// Elements
const sidebar = $('#sidebar');
const pageTitle = $('#page-title');

/**
 * Initialize page
 */
async function init() {
    try {
        // Verify authentication
        profile = await requireAuth();
        if (!profile) return;
        
        userId = profile.id;
        shopId = profile.shop_id;
        
        if (!shopId) {
            toast.error('No tienes un local asignado.');
            window.location.href = 'index.html';
            return;
        }
        
        // Verify role
        if (profile.role !== 'tech') {
            // Redirect to proper dashboard
            if (profile.role === 'admin') {
                window.location.href = 'admin.html';
            } else if (profile.role === 'superadmin') {
                window.location.href = 'superadmin.html';
            } else {
                window.location.href = 'index.html';
            }
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
        $('#user-name').textContent = profile.full_name || 'Técnico';
        $('#user-avatar').textContent = getInitials(profile.full_name || 'T');
        $('#welcome-name').textContent = profile.full_name?.split(' ')[0] || 'Técnico';
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
        repairs: 'Mis Reparaciones',
        earnings: 'Mis Ganancias'
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
            await loadMyRepairs();
            break;
        case 'earnings':
            await loadEarnings();
            break;
    }
}

/**
 * Load dashboard data
 */
async function loadDashboardData() {
    try {
        // Get my repairs
        const { data: myRepairs } = await getSupabase()
            .from('repairs')
            .select('*, clients(name), shops(name)')
            .eq('tech_id', userId)
            .in('status', ['assigned', 'in_progress', 'waiting_parts', 'ready']);
        
        repairs = myRepairs || [];
        
        // Calculate stats
        const assigned = repairs.filter(r => r.status === 'assigned').length;
        const inProgress = repairs.filter(r => ['in_progress', 'waiting_parts'].includes(r.status)).length;
        
        // Get completed this month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        
        const { data: completedRepairs, count: completedCount } = await getSupabase()
            .from('repairs')
            .select('tech_commission', { count: 'exact' })
            .eq('tech_id', userId)
            .eq('status', 'delivered')
            .gte('delivered_date', startOfMonth);
        
        const monthEarnings = (completedRepairs || []).reduce((sum, r) => sum + (r.tech_commission || 0), 0);
        
        // Update UI
        $('#stat-assigned').textContent = assigned;
        $('#stat-in-progress').textContent = inProgress;
        $('#stat-completed').textContent = completedCount || 0;
        $('#stat-earnings').textContent = formatCurrency(monthEarnings);
        
        // Render pending repairs
        const pending = repairs.filter(r => ['assigned', 'in_progress', 'waiting_parts'].includes(r.status));
        renderPendingRepairs(pending);
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        toast.error('Error al cargar datos');
    }
}

/**
 * Render pending repairs
 */
function renderPendingRepairs(pendingRepairs) {
    const container = $('#pending-repairs');
    
    if (!pendingRepairs.length) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No tienes reparaciones pendientes</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="repair-list">
            ${pendingRepairs.map(repair => `
                <div class="repair-list-item" data-id="${repair.id}">
                    <div class="repair-list-info">
                        <span class="repair-code">${repair.code}</span>
                        <span class="repair-device">${repair.device_brand} ${repair.device_model}</span>
                        <span class="badge ${getStatusBadgeClass(repair.status)}">${formatRepairStatus(repair.status)}</span>
                    </div>
                    <div class="repair-list-actions">
                        <button class="btn btn-primary btn-sm btn-work-repair">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                            </svg>
                            Trabajar
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Load my repairs (full list)
 */
async function loadMyRepairs(filter = 'active') {
    try {
        // Load all repairs first for counts
        const { data: allData } = await getSupabase()
            .from('repairs')
            .select('*, clients(name)')
            .eq('tech_id', userId)
            .order('created_at', { ascending: false });
        
        const allRepairs = allData || [];
        
        // Calculate counts
        const activeRepairs = allRepairs.filter(r => ['assigned', 'in_progress', 'waiting_parts', 'ready'].includes(r.status));
        const completedRepairs = allRepairs.filter(r => r.status === 'delivered');
        
        // Update counts
        updateFilterCounts(activeRepairs.length, completedRepairs.length, allRepairs.length);
        
        // Filter based on selected tab
        if (filter === 'active') {
            repairs = activeRepairs;
        } else if (filter === 'completed') {
            repairs = completedRepairs;
        } else {
            repairs = allRepairs;
        }
        
        renderRepairsList(repairs, filter);
        
    } catch (error) {
        console.error('Error loading repairs:', error);
        renderRepairsEmpty('Error al cargar las reparaciones');
    }
}

/**
 * Update filter tab counts
 */
function updateFilterCounts(active, completed, all) {
    const countActive = document.getElementById('count-active');
    const countCompleted = document.getElementById('count-completed');
    const countAll = document.getElementById('count-all');
    
    if (countActive) countActive.textContent = active;
    if (countCompleted) countCompleted.textContent = completed;
    if (countAll) countAll.textContent = all;
}

/**
 * Render repairs list with native cards
 */
function renderRepairsList(repairsData, filter = 'active') {
    const container = document.getElementById('repairs-list');
    if (!container) return;
    
    if (!repairsData.length) {
        const messages = {
            active: { title: 'Sin reparaciones activas', desc: 'No tienes reparaciones pendientes o en progreso' },
            completed: { title: 'Sin reparaciones completadas', desc: 'Aquí aparecerán tus reparaciones entregadas' },
            all: { title: 'Sin reparaciones', desc: 'No tienes reparaciones asignadas' }
        };
        const msg = messages[filter] || messages.all;
        
        container.innerHTML = `
            <div class="repairs-empty">
                <div class="repairs-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                    </svg>
                </div>
                <h3>${msg.title}</h3>
                <p>${msg.desc}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = repairsData.map(repair => renderRepairItem(repair)).join('');
}

/**
 * Render single repair item card
 */
function renderRepairItem(repair) {
    const statusClass = getStatusClass(repair.status);
    const statusText = formatRepairStatus(repair.status);
    const statusIcon = getStatusIcon(repair.status);
    const clientName = repair.clients?.name || 'Cliente';
    
    return `
        <div class="repair-item" data-id="${repair.id}">
            <div class="repair-item-status-bar ${statusClass}"></div>
            <div class="repair-item-content">
                <div class="repair-item-header">
                    <div class="repair-item-main">
                        <span class="repair-item-code">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            ${repair.code}
                        </span>
                        <div class="repair-item-device">${repair.device_brand} ${repair.device_model}</div>
                        <div class="repair-item-client">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                <circle cx="12" cy="7" r="4"/>
                            </svg>
                            ${clientName}
                        </div>
                    </div>
                    <div class="repair-item-badge">
                        <span class="status-pill ${statusClass}">
                            ${statusIcon}
                            ${statusText}
                        </span>
                    </div>
                </div>
                
                <div class="repair-item-problem">
                    <div class="repair-item-problem-label">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        Problema reportado
                    </div>
                    <div class="repair-item-problem-text">${repair.intake_reason || 'Sin descripción'}</div>
                </div>
                
                <div class="repair-item-footer">
                    <div class="repair-item-meta">
                        <div class="repair-meta-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            ${formatDate(repair.created_at)}
                        </div>
                        <div class="repair-meta-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                            </svg>
                            ${formatDeviceCategory(repair.device_category)}
                        </div>
                    </div>
                    <div class="repair-item-action btn-work-repair">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Get status class for styling
 */
function getStatusClass(status) {
    const classes = {
        'pending': 'pending',
        'assigned': 'pending',
        'in_progress': 'in-progress',
        'waiting_parts': 'in-progress',
        'ready': 'completed',
        'delivered': 'delivered'
    };
    return classes[status] || 'pending';
}

/**
 * Get status icon SVG
 */
function getStatusIcon(status) {
    const icons = {
        'pending': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        'assigned': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        'in_progress': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
        'waiting_parts': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
        'ready': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        'delivered': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
    };
    return icons[status] || icons['pending'];
}

/**
 * Render empty repairs state
 */
function renderRepairsEmpty(message = 'Sin reparaciones') {
    const container = document.getElementById('repairs-list');
    if (!container) return;
    
    container.innerHTML = `
        <div class="repairs-empty">
            <div class="repairs-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
            </div>
            <h3>${message}</h3>
            <p>Intenta de nuevo más tarde</p>
        </div>
    `;
}

/**
 * Filter repairs by search term
 */
function filterRepairsBySearch(searchTerm) {
    if (!searchTerm) {
        renderRepairsList(repairs);
        return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = repairs.filter(r => 
        r.code.toLowerCase().includes(term) ||
        r.device_brand.toLowerCase().includes(term) ||
        r.device_model.toLowerCase().includes(term) ||
        (r.clients?.name || '').toLowerCase().includes(term)
    );
    
    renderRepairsList(filtered);
}

/**
 * Load earnings
 */
async function loadEarnings() {
    try {
        // Get all delivered repairs for this tech
        const { data: delivered } = await getSupabase()
            .from('repairs')
            .select('*')
            .eq('tech_id', userId)
            .eq('status', 'delivered')
            .order('delivered_date', { ascending: false });
        
        const allDelivered = delivered || [];
        
        // This month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const thisMonth = allDelivered.filter(r => new Date(r.delivered_date) >= startOfMonth);
        const monthEarnings = thisMonth.reduce((sum, r) => sum + (r.tech_commission || 0), 0);
        const totalEarnings = allDelivered.reduce((sum, r) => sum + (r.tech_commission || 0), 0);
        
        $('#earnings-month').textContent = formatCurrency(monthEarnings);
        $('#earnings-total').textContent = formatCurrency(totalEarnings);
        $('#commission-rate').textContent = `${profile?.commission_percentage || 30}%`;
        
        // Render table
        const tbody = $('#earnings-tbody');
        
        if (!allDelivered.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">No hay entregas registradas</td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = allDelivered.map(repair => `
            <tr>
                <td>${repair.code}</td>
                <td>${repair.device_brand} ${repair.device_model}</td>
                <td>${formatCurrency(repair.final_amount || 0)}</td>
                <td><strong>${formatCurrency(repair.tech_commission || 0)}</strong></td>
                <td>${formatDate(repair.delivered_date)}</td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading earnings:', error);
    }
}

/**
 * Setup modals
 */
function setupModals() {
    initModals();
    modal.register('repair-work-modal', $('#repair-work-modal'));
    modal.register('stage-modal', $('#stage-modal'));
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Logout
    $('#logout-btn')?.addEventListener('click', async () => {
        if (realtimeSubscription) realtimeSubscription.unsubscribe();
        await signOut();
        window.location.href = 'index.html';
    });
    
    // Repairs filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const filter = tab.dataset.filter;
            loadMyRepairs(filter);
        });
    });
    
    // Repairs search
    const searchInput = $('#repairs-search');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                filterRepairsBySearch(e.target.value.trim());
            }, 300);
        });
    }
    
    // Work on repair (from pending list)
    delegate($('#pending-repairs'), '.btn-work-repair', 'click', (e, btn) => {
        console.log('Click on pending repair button');
        const item = btn.closest('.repair-list-item');
        console.log('Item:', item, 'ID:', item?.dataset?.id);
        if (item?.dataset?.id) {
            openRepairWorkModal(item.dataset.id);
        }
    });
    
    // Work on repair (from cards list)
    delegate($('#repairs-list'), '.btn-work-repair, .repair-item', 'click', (e, target) => {
        const card = target.closest('.repair-item');
        if (card?.dataset?.id) {
            openRepairWorkModal(card.dataset.id);
        }
    });
    
    // Stage form
    $('#stage-form')?.addEventListener('submit', handleStageSubmit);
    
    // Stage type buttons
    setupStageTypeButtons();
    
    // Quick templates
    setupQuickTemplates();
    
    // Stage photo upload zone
    setupUploadZone();
}

/**
 * Open repair work modal
 */
async function openRepairWorkModal(repairId) {
    selectedRepairId = repairId;
    
    try {
        console.log('Opening repair modal for ID:', repairId);
        
        // Get repair directly with getSupabase to ensure proper access
        const { data: repair, error } = await getSupabase()
            .from('repairs')
            .select(`
                *,
                client:clients(*),
                tech:profiles(id, full_name, whatsapp, commission_percentage),
                shop:shops(*)
            `)
            .eq('id', repairId)
            .single();
        
        console.log('Repair data:', repair, 'Error:', error);
        
        if (error || !repair) {
            console.error('Error fetching repair:', error);
            toast.error('Reparación no encontrada');
            return;
        }
        
        const stages = await getRepairStages(repairId);
        console.log('Stages:', stages);
        
        // Get intake evidence
        const intakeEvidence = await getIntakeEvidence(repairId);
        console.log('Intake evidence:', intakeEvidence);
        
        // Update header
        $('#modal-repair-code').textContent = repair.code;
        const statusBadge = $('#modal-repair-status');
        statusBadge.textContent = formatRepairStatus(repair.status);
        statusBadge.className = `work-modal-badge badge ${getStatusBadgeClass(repair.status)}`;
        
        // Build body content
        const body = $('#repair-work-body');
        body.innerHTML = `
            <!-- Device Info Card -->
            <div class="work-card">
                <div class="work-card-header">
                    <div class="work-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                            <line x1="12" y1="18" x2="12.01" y2="18"/>
                        </svg>
                    </div>
                    <span class="work-card-title">Información del Dispositivo</span>
                </div>
                <div class="work-card-body scrollable">
                    <div class="device-info-grid">
                        <div class="device-info-item">
                            <span class="device-info-label">Tipo</span>
                            <span class="device-info-value">${formatDeviceCategory(repair.device_category)}</span>
                        </div>
                        <div class="device-info-item">
                            <span class="device-info-label">Marca / Modelo</span>
                            <span class="device-info-value highlight">${repair.device_brand} ${repair.device_model}</span>
                        </div>
                        <div class="device-info-item">
                            <span class="device-info-label">Cliente</span>
                            <span class="device-info-value">${repair.client?.name || '-'}</span>
                        </div>
                        ${repair.device_color ? `
                            <div class="device-info-item">
                                <span class="device-info-label">Color</span>
                                <span class="device-info-value">${repair.device_color}</span>
                            </div>
                        ` : ''}
                        ${repair.device_imei ? `
                            <div class="device-info-item">
                                <span class="device-info-label">IMEI / Serial</span>
                                <span class="device-info-value" style="font-family: monospace;">${repair.device_imei}</span>
                            </div>
                        ` : ''}
                        ${repair.device_password ? `
                            <div class="device-info-item" style="grid-column: 1 / -1;">
                                <span class="device-info-label">🔐 PIN / Contraseña del dispositivo</span>
                                <div class="password-box" style="margin-top: 8px;">
                                    <code id="password-display">••••••••</code>
                                    <button class="btn btn-secondary btn-reveal" id="btn-reveal-password" data-password="${repair.device_password}">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                            <circle cx="12" cy="12" r="3"/>
                                        </svg>
                                        Ver
                                    </button>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${repair.device_accessories?.length ? `
                        <div style="margin-top: 16px;">
                            <span class="device-info-label">Accesorios Recibidos</span>
                            <div class="accessories-grid">
                                ${(typeof repair.device_accessories === 'string' ? JSON.parse(repair.device_accessories) : repair.device_accessories).map(acc => {
                                    const accInfo = CONFIG.COMMON_ACCESSORIES?.find(a => a.id === acc);
                                    return `<span class="accessory-tag">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                        ${accInfo?.name || acc}
                                    </span>`;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Problem Card -->
            <div class="problem-box">
                <div class="problem-box-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    Problema Reportado
                </div>
                <p class="problem-box-text">${repair.intake_reason || 'Sin especificar'}</p>
            </div>
            
            ${intakeEvidence.length > 0 ? `
                <!-- Intake Photos Card -->
                <div class="work-card" style="background: linear-gradient(135deg, rgba(99,102,241,0.05) 0%, var(--bg-card) 100%); border-left: 3px solid var(--primary);">
                    <div class="work-card-header">
                        <div class="work-card-icon" style="background: rgba(99,102,241,0.15); color: #6366F1;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                            </svg>
                        </div>
                        <span class="work-card-title">Fotos de Ingreso</span>
                    </div>
                    <div class="work-card-body">
                        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">${intakeEvidence.length} foto${intakeEvidence.length !== 1 ? 's' : ''} tomada${intakeEvidence.length !== 1 ? 's' : ''} al recibir el equipo</p>
                        <button class="btn btn-primary btn-sm" id="btn-view-intake-photos-tech" style="width: 100%;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                            Ver Fotos de Ingreso
                        </button>
                    </div>
                </div>
            ` : ''}
            
            <!-- Quote Card -->
            <div class="work-card">
                <div class="work-card-header">
                    <div class="work-card-icon" style="background: rgba(16, 185, 129, 0.15); color: #10B981;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="1" x2="12" y2="23"/>
                            <line x1="17" y1="5" x2="7" y2="5"/>
                            <line x1="19" y1="9" x2="5" y2="9"/>
                            <line x1="17" y1="13" x2="7" y2="13"/>
                            <line x1="19" y1="17" x2="5" y2="17"/>
                            <line x1="17" y1="21" x2="7" y2="21"/>
                        </svg>
                    </div>
                    <span class="work-card-title">Cotización</span>
                </div>
                <div class="work-card-body">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div>
                            <span class="badge ${getQuoteBadgeClass(repair.quote_status)}">${formatQuoteStatus(repair.quote_status)}</span>
                            <span style="margin-left: 8px; font-size: 20px; font-weight: 700; color: var(--primary);">${repair.quote_amount ? formatCurrency(repair.quote_amount) : 'Sin cotizar'}</span>
                        </div>
                    </div>
                    ${repair.status !== 'delivered' && repair.status !== 'cancelled' ? `
                        <button class="btn btn-secondary btn-sm" id="btn-update-quote-tech">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            Actualizar Cotización
                        </button>
                    ` : ''}
                </div>
            </div>
            
            <!-- Quick Actions Bar -->
            ${repair.status === 'assigned' ? `
                <div class="quick-actions">
                    <button class="btn btn-primary btn-lg" id="btn-start-repair">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        Iniciar Reparación
                    </button>
                </div>
            ` : ''}
            ${['in_progress', 'waiting_parts'].includes(repair.status) ? `
                <div class="quick-actions">
                    <button class="btn btn-primary" id="btn-add-stage">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Registrar Avance
                    </button>
                    <button class="btn btn-warning" id="btn-toggle-waiting">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        ${repair.status === 'waiting_parts' ? 'Repuestos Listos' : 'Esperar Repuestos'}
                    </button>
                    <button class="btn btn-success" id="btn-mark-ready">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Listo
                    </button>
                </div>
            ` : ''}
            ${repair.status === 'ready' || repair.status === 'delivered' ? `
                <div class="quick-actions completed">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span>Reparación ${repair.status === 'ready' ? 'lista para entregar' : 'entregada'}</span>
                </div>
            ` : ''}
            
            <!-- Timeline Card -->
            <div class="work-card">
                <div class="work-card-header">
                    <div class="work-card-icon" style="background: rgba(139, 92, 246, 0.15); color: #8B5CF6;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </div>
                    <span class="work-card-title">Historial de Avances</span>
                </div>
                <div class="work-card-body">
                    ${stages.length > 0 ? `
                        <div class="work-timeline-container">
                            <div class="work-timeline">
                                ${stages.map(stage => `
                                    <div class="work-timeline-item">
                                        <div class="work-timeline-dot"></div>
                                        <div class="work-timeline-content">
                                            <div class="work-timeline-header">
                                                <span class="work-timeline-title">${stage.stage_name}</span>
                                                <span class="work-timeline-date">${formatDateTime(stage.created_at)}</span>
                                            </div>
                                            ${stage.description ? `<p class="work-timeline-desc">${stage.description}</p>` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : `
                        <div class="empty-timeline">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            <p>No hay avances registrados aún</p>
                        </div>
                    `}
                </div>
            </div>
        `;
        
        // Setup action buttons
        body.querySelector('#btn-start-repair')?.addEventListener('click', () => startRepair(repair.id));
        body.querySelector('#btn-add-stage')?.addEventListener('click', () => openStageModal(repair.id));
        body.querySelector('#btn-toggle-waiting')?.addEventListener('click', () => toggleWaitingParts(repair));
        body.querySelector('#btn-mark-ready')?.addEventListener('click', () => markAsReady(repair));
        body.querySelector('#btn-update-quote-tech')?.addEventListener('click', () => updateQuoteTech(repair));
        body.querySelector('#btn-view-intake-photos-tech')?.addEventListener('click', () => showIntakePhotosModal(intakeEvidence, repair));
        
        // Password reveal
        body.querySelector('#btn-reveal-password')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const codeEl = document.querySelector('#password-display');
            const password = btn.dataset.password;
            
            if (codeEl.textContent === '••••••••') {
                codeEl.textContent = password;
                btn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                    Ocultar
                `;
            } else {
                codeEl.textContent = '••••••••';
                btn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    Ver
                `;
            }
        });
        
        modal.open('repair-work-modal');
        
    } catch (error) {
        console.error('Error opening repair:', error);
        toast.error('Error al cargar reparación');
    }
}

/**
 * Start repair
 */
async function startRepair(repairId) {
    try {
        await updateRepair(repairId, { status: 'in_progress' });
        
        // Create initial stage
        await addRepairStage({
            repair_id: repairId,
            stage_type: 'started',
            stage_name: 'Reparación iniciada',
            description: 'El técnico ha comenzado a trabajar en este dispositivo.',
            is_public: true
        });
        
        toast.success('Reparación iniciada');
        modal.close('repair-work-modal');
        await loadDashboardData();
        
    } catch (error) {
        console.error('Error starting repair:', error);
        toast.error('Error al iniciar');
    }
}

/**
 * Toggle waiting parts status
 */
async function toggleWaitingParts(repair) {
    try {
        const newStatus = repair.status === 'waiting_parts' ? 'in_progress' : 'waiting_parts';
        await updateRepair(repair.id, { status: newStatus });
        
        const message = newStatus === 'waiting_parts' 
            ? 'Estado actualizado: Esperando repuestos' 
            : 'Estado actualizado: En proceso';
        
        toast.success(message);
        openRepairWorkModal(repair.id); // Refresh
        await loadDashboardData();
        
    } catch (error) {
        console.error('Error updating status:', error);
        toast.error('Error al actualizar');
    }
}

/**
 * Mark as ready
 */
async function markAsReady(repair) {
    try {
        // If quote_amount is 0 or null, ask for the final amount first
        if (!repair.quote_amount || repair.quote_amount === 0) {
            return await markAsReadyWithQuote(repair);
        }
        
        await updateRepair(repair.id, { status: 'ready' });
        
        // Create stage
        await addRepairStage({
            repair_id: repair.id,
            stage_type: 'completed',
            stage_name: 'Reparación completada',
            description: 'El dispositivo está listo para ser recogido por el cliente.',
            is_public: true
        });
        
        toast.success('¡Reparación marcada como lista!');
        modal.close('repair-work-modal');
        await loadDashboardData();
        
    } catch (error) {
        console.error('Error marking ready:', error);
        toast.error('Error al actualizar');
    }
}

/**
 * Mark as ready with quote confirmation
 */
async function markAsReadyWithQuote(repair) {
    return new Promise((resolve) => {
        const quoteModal = modal.create({
            title: '💰 Establecer Precio de Reparación',
            content: `
                <div style="margin-bottom: 16px; padding: 12px; background: var(--warning-bg); border: 1px solid var(--warning-border); border-radius: 8px;">
                    <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">⚠️ <strong>Importante:</strong> La cotización actual es <strong>$0</strong>. Por favor, ingresa el monto que se le cobrará al cliente por esta reparación antes de marcarla como lista.</p>
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight: 600;">Monto a cobrar al cliente</label>
                    <input type="number" class="form-input" id="ready-quote-amount" value="0" min="0" step="1000" style="font-size: 18px; font-weight: 600; text-align: center;" placeholder="Ej: 50000">
                    <small style="display: block; margin-top: 6px; color: var(--text-muted);">Este será el precio final de la reparación</small>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" data-action="cancel">Cancelar</button>
                <button class="btn btn-success" data-action="save">Marcar como Lista</button>
            `,
            size: 'small'
        });
        
        const amountInput = quoteModal.element.querySelector('#ready-quote-amount');
        
        quoteModal.element.querySelector('[data-action="cancel"]').onclick = () => {
            quoteModal.destroy();
            resolve(false);
        };
        
        quoteModal.element.querySelector('[data-action="save"]').onclick = async () => {
            const amount = parseFloat(amountInput.value) || 0;
            
            if (amount <= 0) {
                toast.warning('Por favor ingresa un monto válido');
                amountInput.focus();
                return;
            }
            
            try {
                // Update repair with quote and status
                await updateRepair(repair.id, {
                    status: 'ready',
                    quote_amount: amount,
                    quote_status: 'accepted'
                });
                
                // Create stage
                await addRepairStage({
                    repair_id: repair.id,
                    stage_type: 'completed',
                    stage_name: 'Reparación completada',
                    description: `El dispositivo está listo para ser recogido por el cliente. Precio de reparación: ${formatCurrency(amount)}`,
                    is_public: true
                });
                
                toast.success('¡Reparación marcada como lista!');
                quoteModal.destroy();
                modal.close('repair-work-modal');
                await loadDashboardData();
                resolve(true);
                
            } catch (error) {
                console.error('Error marking ready:', error);
                toast.error('Error al actualizar');
                resolve(false);
            }
        };
        
        quoteModal.open();
        
        // Focus and select input
        setTimeout(() => {
            amountInput.focus();
            amountInput.select();
        }, 300);
    });
}

/**
 * Update quote (for technicians)
 */
async function updateQuoteTech(repair) {
    const quoteModal = modal.create({
        title: 'Actualizar Cotización',
        content: `
            <div class="form-group">
                <label class="form-label">Estado de cotización</label>
                <select class="form-select" id="quote-status-select-tech">
                    <option value="pending" ${repair.quote_status === 'pending' ? 'selected' : ''}>Pendiente</option>
                    <option value="approximate" ${repair.quote_status === 'approximate' ? 'selected' : ''}>Aproximada</option>
                    <option value="accepted" ${repair.quote_status === 'accepted' ? 'selected' : ''}>Aceptada</option>
                    <option value="rejected" ${repair.quote_status === 'rejected' ? 'selected' : ''}>Rechazada</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Monto</label>
                <input type="number" class="form-input" id="quote-amount-input-tech" value="${repair.quote_amount || 0}" min="0" step="1000" placeholder="Ej: 50000">
            </div>
            <div class="form-group">
                <label class="form-label">Descripción (opcional)</label>
                <textarea class="form-textarea" id="quote-description-input-tech" rows="3" placeholder="Detalles de la cotización...">${repair.quote_description || ''}</textarea>
            </div>
        `,
        footer: `
            <button class="btn btn-secondary" data-action="cancel">Cancelar</button>
            <button class="btn btn-primary" data-action="save">Guardar</button>
        `,
        size: 'small'
    });
    
    quoteModal.element.querySelector('[data-action="cancel"]').onclick = () => quoteModal.destroy();
    quoteModal.element.querySelector('[data-action="save"]').onclick = async () => {
        try {
            await updateRepair(repair.id, {
                quote_status: quoteModal.element.querySelector('#quote-status-select-tech').value,
                quote_amount: parseFloat(quoteModal.element.querySelector('#quote-amount-input-tech').value) || 0,
                quote_description: quoteModal.element.querySelector('#quote-description-input-tech').value
            });
            toast.success('Cotización actualizada');
            quoteModal.destroy();
            openRepairWorkModal(repair.id);
        } catch (error) {
            toast.error('Error al actualizar');
        }
    };
    
    quoteModal.open();
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
 * Open stage modal
 */
function openStageModal(repairId) {
    selectedRepairId = repairId;
    stagePhotos = [];
    
    resetForm($('#stage-form'));
    $('#stage-repair-id').value = repairId;
    $('#stage-previews').innerHTML = '';
    
    // Reset stage type buttons and filter templates
    $$('.stage-type-btn').forEach(btn => btn.classList.remove('active'));
    $('.stage-type-btn[data-type="diagnostic"]')?.classList.add('active');
    
    // Filter templates to show diagnostic category by default
    filterTemplatesByCategory('diagnostic');
    
    modal.close('repair-work-modal');
    modal.open('stage-modal');
}

/**
 * Get label for stage type
 */
function getStageTypeLabel(type) {
    const labels = {
        diagnostic: 'Diagnóstico',
        repair: 'Reparación',
        testing: 'Pruebas',
        other: 'Otro'
    };
    return labels[type] || type;
}

/**
 * Quick templates for common repairs
 */
const QUICK_TEMPLATES = {
    screen: {
        title: 'Cambio de Pantalla Completo',
        description: 'Se realizó el reemplazo completo de la pantalla del dispositivo. Se verificó el correcto funcionamiento del táctil, brillo, colores y sensibilidad. Pantalla original/compatible instalada y probada exitosamente.'
    },
    battery: {
        title: 'Reemplazo de Batería',
        description: 'Se cambió la batería por una nueva. Se verificó la correcta conexión y funcionamiento. La nueva batería cuenta con certificación de calidad y está funcionando al 100% de su capacidad.'
    },
    opening: {
        title: 'Apertura del Equipo',
        description: 'Se procedió a abrir el dispositivo con las herramientas adecuadas. Se revisó el estado interno de los componentes y se identificaron las piezas que requieren intervención. Todo realizado con precaución para no dañar ningún componente.'
    },
    cleaning: {
        title: 'Limpieza Interna Profunda',
        description: 'Se realizó una limpieza completa del interior del dispositivo. Se removió polvo, residuos y suciedad acumulada en los componentes. Se utilizó aire comprimido y productos especializados. El equipo quedó completamente limpio.'
    },
    thermal: {
        title: 'Cambio de Pasta Térmica',
        description: 'Se removió la pasta térmica antigua y se aplicó pasta térmica de alta calidad en el procesador. Esto mejorará significativamente la disipación de calor y el rendimiento del equipo. Se verificó la correcta aplicación.'
    },
    diagnostic: {
        title: 'Diagnóstico Inicial Completo',
        description: 'Se realizó un diagnóstico exhaustivo del equipo. Se identificaron todos los problemas y fallas presentes. Se verificó el funcionamiento de cada componente hardware y software. Diagnóstico técnico detallado completado.'
    },
    charging: {
        title: 'Reparación de Puerto de Carga',
        description: 'Se reemplazó/reparó el puerto de carga del dispositivo. Se verificó la correcta conexión y detección del cargador. El equipo ahora carga normalmente sin problemas. Se realizaron pruebas de carga completas.'
    },
    speaker: {
        title: 'Reparación de Altavoz/Audio',
        description: 'Se cambió el altavoz defectuoso por uno nuevo. Se verificó la calidad del audio, volumen y claridad del sonido. El audio ahora funciona perfectamente en llamadas, multimedia y notificaciones.'
    },
    camera: {
        title: 'Reemplazo de Cámara',
        description: 'Se instaló una nueva cámara en el dispositivo. Se verificó el correcto funcionamiento del enfoque automático, calidad de imagen, flash y grabación de video. La cámara funciona correctamente.'
    },
    buttons: {
        title: 'Reparación de Botones',
        description: 'Se repararon/reemplazaron los botones físicos del dispositivo (encendido, volumen, inicio). Se verificó la correcta respuesta táctil y funcionamiento de cada botón. Todos los botones operan perfectamente.'
    },
    motherboard: {
        title: 'Reparación de Placa Madre',
        description: 'Se realizó la reparación a nivel de placa madre. Se identificaron y solucionaron los problemas en los circuitos. Se realizó micro soldadura de componentes según fue necesario. La placa madre está funcionando correctamente.'
    },
    testing: {
        title: 'Pruebas Finales Exitosas',
        description: 'Se realizaron exhaustivas pruebas de funcionamiento de todos los componentes del dispositivo. Se verificó táctil, cámara, audio, carga, conectividad, sensores y rendimiento general. El equipo pasó todas las pruebas exitosamente.'
    },
    software: {
        title: 'Reparación de Software/Sistema',
        description: 'Se realizó la reinstalación/actualización del sistema operativo. Se eliminaron virus, malware y archivos basura. Se optimizó el rendimiento del sistema. El software ahora funciona de manera fluida y estable.'
    },
    maintenance: {
        title: 'Mantenimiento Preventivo Completo',
        description: 'Se realizó mantenimiento preventivo completo del equipo. Incluye: limpieza interna profunda, renovación de pasta térmica, lubricación de conectores, revisión de batería, actualización de software, optimización del sistema, verificación de todos los componentes. El equipo queda en óptimas condiciones.'
    },
    water: {
        title: 'Tratamiento por Daño de Líquido',
        description: 'Se realizó el protocolo completo para daño por líquidos. Se desmontó completamente el equipo, se limpió con alcohol isopropílico todas las placas afectadas. Se secó con aire caliente y se verificó oxidación. Se trataron los componentes dañados.'
    },
    assembly: {
        title: 'Ensamblaje Final del Equipo',
        description: 'Se procedió al ensamblaje completo del dispositivo. Se instalaron todas las piezas en su lugar correcto, se verificaron todas las conexiones. Se aseguró que todos los tornillos y clips están correctamente colocados. Equipo ensamblado profesionalmente.'
    },
    custom: {
        title: '',
        description: ''
    }
};

/**
 * Setup quick template buttons
 */
function setupQuickTemplates() {
    const templateBtns = $$('.template-btn');
    const titleInput = $('input[name="title"]');
    const descInput = $('textarea[name="description"]');
    
    templateBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const templateId = btn.dataset.template;
            const template = QUICK_TEMPLATES[templateId];
            
            if (!template) return;
            
            // Remove selected class from all
            templateBtns.forEach(b => b.classList.remove('selected'));
            
            // Add selected to current
            btn.classList.add('selected');
            
            // Fill form
            if (titleInput && descInput) {
                titleInput.value = template.title;
                descInput.value = template.description;
                
                // Focus on title if custom (empty template)
                if (templateId === 'custom') {
                    titleInput.focus();
                } else {
                    // Animate to show values were filled
                    titleInput.classList.add('pulse');
                    descInput.classList.add('pulse');
                    setTimeout(() => {
                        titleInput.classList.remove('pulse');
                        descInput.classList.remove('pulse');
                    }, 500);
                }
            }
        });
    });
}

/**
 * Setup stage type buttons
 */
function setupStageTypeButtons() {
    $$('.stage-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            $$('.stage-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Filter templates by category
            const category = btn.dataset.type;
            filterTemplatesByCategory(category);
        });
    });
}

/**
 * Filter templates by category
 */
function filterTemplatesByCategory(category) {
    const templateBtns = $$('.template-btn');
    
    templateBtns.forEach(btn => {
        const btnCategory = btn.dataset.category;
        
        if (btnCategory === category) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
            // Remove selected state if hidden
            btn.classList.remove('selected');
        }
    });
    
    // Clear form if template was selected from another category
    const titleInput = $('input[name="title"]');
    const descInput = $('textarea[name="description"]');
    
    // Only clear if a template from hidden category was selected
    const selectedTemplate = $('.template-btn.selected');
    if (selectedTemplate && selectedTemplate.classList.contains('hidden')) {
        titleInput.value = '';
        descInput.value = '';
    }
}

/**
 * Setup drag and drop for upload zone
 */
function setupUploadZone() {
    const dropZone = $('#stage-drop-zone');
    const fileInput = $('#stage-file-input');
    
    if (!dropZone || !fileInput) return;
    
    // Click to open file picker
    dropZone.addEventListener('click', () => fileInput.click());
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleStagePhotos(e.target.files);
        }
    });
    
    // Drag events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleStagePhotos(files);
        }
    });
}

/**
 * Handle stage photos
 */
async function handleStagePhotos(files) {
    const container = $('#stage-previews');
    
    for (const file of files) {
        if (stagePhotos.length >= 5) {
            toast.warning('Máximo 5 fotos por avance');
            break;
        }
        
        const preview = await createImagePreview(file);
        stagePhotos.push({ file, element: preview.element });
        
        preview.element.querySelector('.preview-remove').onclick = () => {
            const index = stagePhotos.findIndex(p => p.file === file);
            if (index > -1) {
                stagePhotos.splice(index, 1);
                preview.element.remove();
            }
        };
        
        container.appendChild(preview.element);
    }
}

/**
 * Handle stage form submit
 */
async function handleStageSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = $('#stage-submit-btn');
    const repairId = $('#stage-repair-id').value;
    
    showLoading(submitBtn, { text: 'Guardando...' });
    
    let stage = null;
    
    try {
        const formData = formDataToObject(form);
        
        // Get selected stage type
        const activeTypeBtn = $('.stage-type-btn.active');
        const stageType = activeTypeBtn?.dataset.type || 'other';
        const stageTypeName = getStageTypeLabel(stageType);
        
        // Build stage name with type prefix
        const stageName = formData.title || stageTypeName;
        
        // Create stage
        stage = await addRepairStage({
            repair_id: repairId,
            stage_type: stageType,
            stage_name: stageName,
            description: formData.description || null,
            is_public: formData.is_public === 'on',
            created_by: userId
        });
        
        // Upload photos (don't fail if this fails)
        if (stagePhotos.length > 0) {
            try {
                const photoPaths = [];
                
                for (const photo of stagePhotos) {
                    const evidence = await uploadStageEvidence(shopId, repairId, stage.id, photo.file);
                    photoPaths.push(evidence.file_url);
                }
                
                // Update stage with photo paths
                await getSupabase()
                    .from('repair_stages')
                    .update({ evidence_photos: photoPaths })
                    .eq('id', stage.id);
            } catch (photoError) {
                console.error('Error uploading photos:', photoError);
                // Don't fail the entire operation, just log it
                toast.warning('Avance registrado, pero hubo un problema al subir algunas fotos');
            }
        }
        
        toast.success('Avance registrado');
        modal.close('stage-modal');
        
        // Reopen work modal with updated data (don't fail if this fails)
        try {
            setTimeout(() => openRepairWorkModal(repairId), 300);
        } catch (modalError) {
            console.error('Error reopening modal:', modalError);
        }
        
    } catch (error) {
        console.error('Error creating stage:', error);
        // Only show error if stage creation failed
        if (!stage) {
            toast.error('Error al registrar avance');
        } else {
            toast.warning('Avance registrado, pero hubo un error al actualizar la vista');
        }
    } finally {
        hideLoading(submitBtn);
    }
}

/**
 * Setup realtime subscriptions
 */
function setupRealtime() {
    // Subscribe to repairs assigned to this technician
    realtimeSubscription = getSupabase()
        .channel('tech-repairs')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'repairs',
                filter: `tech_id=eq.${userId}`
            },
            (payload) => {
                console.log('Realtime update:', payload);
                
                // Refresh data
                loadDashboardData();
                if (currentSection === 'repairs') {
                    loadMyRepairs($('#repairs-filter')?.value || 'active');
                }
            }
        )
        .subscribe();
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

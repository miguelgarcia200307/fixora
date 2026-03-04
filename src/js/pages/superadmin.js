/**
 * FIXORA - Superadmin Dashboard
 * Platform management for superadministrators
 */

import { CONFIG } from '../config.js';
import { requireAuth, signOut, getCurrentProfile, isSuperadmin } from '../services/authService.js';
import { 
    getAllShops, 
    createShop, 
    updateShop, 
    getShopStats,
    updateShopSubscription 
} from '../services/shopService.js';
import { uploadShopLogo } from '../services/storageService.js';
import { getSupabase, query } from '../services/supabaseService.js';
import { formatDate, formatCurrency, getInitials, formatRepairStatus } from '../utils/formatters.js';
import { validateShopForm, showValidationErrors, clearValidationErrors } from '../utils/validators.js';
import toast from '../utils/toast.js';
import modal, { initModals } from '../utils/modal.js';
import { $, $$, delegate, debounce, showLoading, hideLoading, resetForm } from '../utils/helpers.js';

// State
let currentSection = 'dashboard';
let shops = [];
let users = [];
let profile = null;

// Element references
const sidebar = $('#sidebar');
const sidebarToggle = $('#sidebar-toggle');
const mobileMenuBtn = $('#mobile-menu-btn');
const logoutBtn = $('#logout-btn');
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
        
        // Check if superadmin
        if (!await isSuperadmin()) {
            toast.error('Acceso denegado. No tienes permisos de superadministrador.');
            window.location.href = 'index.html';
            return;
        }
        
        // Update user info
        updateUserInfo();
        
        // Setup UI
        setupSidebar();
        setupNavigation();
        setupModals();
        setupEventListeners();
        
        // Load initial data
        await loadDashboardData();
        
        // Handle URL hash for section navigation
        handleHashChange();
        window.addEventListener('hashchange', handleHashChange);
        
    } catch (error) {
        console.error('Initialization error:', error);
        toast.error('Error al cargar el panel');
    }
}

/**
 * Update user info in sidebar
 */
function updateUserInfo() {
    if (profile) {
        $('#user-name').textContent = profile.full_name || 'Superadmin';
        $('#user-avatar').textContent = getInitials(profile.full_name || 'SA');
    }
}

/**
 * Setup sidebar toggle
 */
function setupSidebar() {
    sidebarToggle?.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });
    
    mobileMenuBtn?.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
    });
    
    // Close mobile sidebar on outside click
    document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('mobile-open') && 
            !sidebar.contains(e.target) && 
            e.target !== mobileMenuBtn) {
            sidebar.classList.remove('mobile-open');
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
            const section = link.dataset.section;
            navigateToSection(section);
            sidebar.classList.remove('mobile-open');
        });
    });
    
    // Dashboard card links
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
    
    // Update sidebar active state
    $$('.sidebar-link').forEach(link => {
        link.classList.toggle('active', link.dataset.section === section);
    });
    
    // Update sections visibility
    $$('.page-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `section-${section}`);
    });
    
    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        shops: 'Locales',
        users: 'Usuarios',
        subscriptions: 'Suscripciones',
        stats: 'Estadísticas'
    };
    pageTitle.textContent = titles[section] || 'Dashboard';
    
    // Load section data
    loadSectionData(section);
}

/**
 * Handle URL hash change
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
        case 'shops':
            await loadShops();
            break;
        case 'users':
            await loadUsers();
            break;
        case 'subscriptions':
            await loadSubscriptions();
            break;
        case 'stats':
            await loadStats();
            break;
    }
}

/**
 * Load dashboard data
 */
async function loadDashboardData() {
    try {
        // Load shops
        shops = await getAllShops();
        const activeShops = shops.filter(s => s.is_active);
        
        // Update stats
        $('#stat-shops').textContent = activeShops.length;
        $('#total-shops').textContent = activeShops.length;
        
        // Load users count
        const { data: usersData } = await query('profiles', {
            select: 'id'
        });
        $('#stat-users').textContent = usersData?.length || 0;
        
        // Load repairs count
        const { data: repairsData } = await query('repairs', {
            select: 'id, final_amount'
        });
        $('#stat-repairs').textContent = repairsData?.length || 0;
        
        // Calculate total revenue
        const totalRevenue = repairsData?.reduce((sum, r) => sum + (r.final_amount || 0), 0) || 0;
        $('#stat-revenue').textContent = formatCurrency(totalRevenue);
        
        // Render recent shops
        renderRecentShops(shops.slice(0, 5));
        
        // Render subscription overview
        renderSubscriptionOverview(shops);
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        toast.error('Error al cargar dashboard');
    }
}

/**
 * Render recent shops
 */
function renderRecentShops(recentShops) {
    const container = $('#recent-shops');
    
    if (!recentShops.length) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No hay locales registrados</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = recentShops.map(shop => `
        <div class="list-item">
            <div class="list-item-avatar">
                <div class="avatar avatar-sm">${getInitials(shop.name)}</div>
            </div>
            <div class="list-item-content">
                <span class="list-item-title">${shop.name}</span>
                <span class="list-item-subtitle">${formatDate(shop.created_at)}</span>
            </div>
            <span class="badge ${shop.is_active ? 'badge-success' : 'badge-gray'}">
                ${shop.is_active ? 'Activo' : 'Inactivo'}
            </span>
        </div>
    `).join('');
}

/**
 * Render subscription overview
 */
function renderSubscriptionOverview(allShops) {
    const container = $('#subscription-overview');
    
    const planCounts = {
        free: allShops.filter(s => s.subscription_plan === 'free').length,
        pro: allShops.filter(s => s.subscription_plan === 'pro').length,
        premium: allShops.filter(s => s.subscription_plan === 'premium').length
    };
    
    const total = allShops.length || 1;
    
    container.innerHTML = `
        <div class="subscription-bars">
            <div class="sub-bar-item">
                <div class="sub-bar-header">
                    <span>Free</span>
                    <span>${planCounts.free}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(planCounts.free / total) * 100}%"></div>
                </div>
            </div>
            <div class="sub-bar-item">
                <div class="sub-bar-header">
                    <span>Pro</span>
                    <span>${planCounts.pro}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill progress-accent" style="width: ${(planCounts.pro / total) * 100}%"></div>
                </div>
            </div>
            <div class="sub-bar-item">
                <div class="sub-bar-header">
                    <span>Premium</span>
                    <span>${planCounts.premium}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill progress-success" style="width: ${(planCounts.premium / total) * 100}%"></div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Load shops
 */
async function loadShops() {
    try {
        shops = await getAllShops();
        renderShopsTable(shops);
    } catch (error) {
        console.error('Error loading shops:', error);
        toast.error('Error al cargar locales');
    }
}

/**
 * Render shops table
 */
function renderShopsTable(shopsData) {
    const tbody = $('#shops-tbody');
    
    if (!shopsData.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <p>No hay locales registrados</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = shopsData.map(shop => `
        <tr data-id="${shop.id}">
            <td>
                <div class="cell-with-avatar">
                    <div class="avatar avatar-sm">${getInitials(shop.name)}</div>
                    <div>
                        <span class="cell-title">${shop.name}</span>
                        <span class="cell-subtitle">${shop.email || '-'}</span>
                    </div>
                </div>
            </td>
            <td>
                <span class="badge badge-${shop.subscription_plan === 'premium' ? 'success' : shop.subscription_plan === 'pro' ? 'accent' : 'gray'}">
                    ${shop.subscription_plan?.toUpperCase() || 'FREE'}
                </span>
            </td>
            <td>${shop.repairs_count || 0}</td>
            <td>
                <span class="badge ${shop.is_active ? 'badge-success' : 'badge-gray'}">
                    ${shop.is_active ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>${formatDate(shop.created_at)}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-sm btn-edit-shop" title="Editar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn btn-ghost btn-sm btn-manage-sub" title="Suscripción">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                            <line x1="1" y1="10" x2="23" y2="10"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

/**
 * Load users
 */
async function loadUsers() {
    try {
        const { data, error } = await getSupabase()
            .from('profiles')
            .select('*, shops(name)')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        users = data || [];
        renderUsersTable(users);
        
        // Populate shop select for user modal
        await populateShopSelect();
        
    } catch (error) {
        console.error('Error loading users:', error);
        toast.error('Error al cargar usuarios');
    }
}

/**
 * Render users table
 */
function renderUsersTable(usersData) {
    const tbody = $('#users-tbody');
    
    if (!usersData.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <p>No hay usuarios registrados</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    const roleLabels = {
        superadmin: 'Superadmin',
        admin: 'Administrador',
        tech: 'Técnico'
    };
    
    tbody.innerHTML = usersData.map(user => `
        <tr data-id="${user.id}">
            <td>
                <div class="cell-with-avatar">
                    <div class="avatar avatar-sm">${getInitials(user.full_name || user.email)}</div>
                    <span>${user.full_name || '-'}</span>
                </div>
            </td>
            <td>${user.email || '-'}</td>
            <td>
                <span class="badge badge-${user.role === 'superadmin' ? 'accent' : user.role === 'admin' ? 'info' : 'gray'}">
                    ${roleLabels[user.role] || user.role}
                </span>
            </td>
            <td>${user.shops?.name || '-'}</td>
            <td>
                <span class="badge ${user.is_active !== false ? 'badge-success' : 'badge-gray'}">
                    ${user.is_active !== false ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-sm btn-edit-user" title="Editar" ${user.role === 'superadmin' ? 'disabled' : ''}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

/**
 * Populate shop select
 */
async function populateShopSelect() {
    const select = $('#user-shop-select');
    if (!select) return;
    
    if (!shops.length) {
        shops = await getAllShops();
    }
    
    select.innerHTML = `
        <option value="">Seleccionar local</option>
        ${shops.filter(s => s.is_active).map(shop => `
            <option value="${shop.id}">${shop.name}</option>
        `).join('')}
    `;
}

/**
 * Load subscriptions
 */
async function loadSubscriptions() {
    try {
        if (!shops.length) {
            shops = await getAllShops();
        }
        renderSubscriptionsTable(shops);
    } catch (error) {
        console.error('Error loading subscriptions:', error);
    }
}

/**
 * Render subscriptions table
 */
function renderSubscriptionsTable(shopsData) {
    const tbody = $('#subscriptions-tbody');
    
    if (!shopsData.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <p>No hay suscripciones</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    const statusLabels = {
        active: 'Activo',
        trial: 'Prueba',
        expired: 'Vencido',
        cancelled: 'Cancelado'
    };
    
    tbody.innerHTML = shopsData.map(shop => `
        <tr data-id="${shop.id}">
            <td>
                <div class="cell-with-avatar">
                    <div class="avatar avatar-sm">${getInitials(shop.name)}</div>
                    <span>${shop.name}</span>
                </div>
            </td>
            <td>
                <span class="badge badge-${shop.subscription_plan === 'premium' ? 'success' : shop.subscription_plan === 'pro' ? 'accent' : 'gray'}">
                    ${shop.subscription_plan?.toUpperCase() || 'FREE'}
                </span>
            </td>
            <td>
                <span class="badge badge-${shop.subscription_status === 'active' ? 'success' : shop.subscription_status === 'trial' ? 'warning' : 'error'}">
                    ${statusLabels[shop.subscription_status] || 'Activo'}
                </span>
            </td>
            <td>${formatDate(shop.subscription_start)}</td>
            <td>${shop.subscription_end ? formatDate(shop.subscription_end) : '-'}</td>
            <td>
                <button class="btn btn-ghost btn-sm btn-manage-sub" title="Gestionar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                    </svg>
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Load stats
 */
async function loadStats() {
    try {
        // Get current month repairs
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        
        const { data: monthRepairs } = await getSupabase()
            .from('repairs')
            .select('id, status')
            .gte('created_at', startOfMonth);
        
        const delivered = monthRepairs?.filter(r => r.status === 'delivered').length || 0;
        const pending = monthRepairs?.filter(r => !['delivered', 'cancelled'].includes(r.status)).length || 0;
        
        $('#stat-repairs-month').textContent = monthRepairs?.length || 0;
        $('#stat-repairs-delivered').textContent = delivered;
        $('#stat-repairs-pending').textContent = pending;
        
        // Load stats by shop
        if (!shops.length) {
            shops = await getAllShops();
        }
        
        const statsPromises = shops.map(async shop => {
            try {
                const stats = await getShopStats(shop.id);
                return { shop, stats };
            } catch {
                return { shop, stats: null };
            }
        });
        
        const shopStats = await Promise.all(statsPromises);
        renderStatsTable(shopStats);
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

/**
 * Render stats table
 */
function renderStatsTable(shopStats) {
    const tbody = $('#stats-tbody');
    
    tbody.innerHTML = shopStats.map(({ shop, stats }) => `
        <tr>
            <td>${shop.name}</td>
            <td>${stats?.total || 0}</td>
            <td>${stats?.delivered || 0}</td>
            <td>${stats?.pending || 0}</td>
            <td>${formatCurrency(stats?.revenue || 0)}</td>
        </tr>
    `).join('');
}

/**
 * Setup modals
 */
function setupModals() {
    initModals();
    
    // Shop modal
    modal.register('shop-modal', $('#shop-modal'));
    modal.register('user-modal', $('#user-modal'));
    modal.register('subscription-modal', $('#subscription-modal'));
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Logout
    logoutBtn?.addEventListener('click', async () => {
        const confirmed = await modal.confirm({
            title: 'Cerrar Sesión',
            message: '¿Estás seguro de que deseas cerrar sesión?',
            confirmText: 'Cerrar Sesión',
            cancelText: 'Cancelar'
        });
        
        if (confirmed) {
            await signOut();
            window.location.href = 'index.html';
        }
    });
    
    // New shop button
    $('#btn-new-shop')?.addEventListener('click', () => {
        resetForm($('#shop-form'));
        $('#shop-modal-title').textContent = 'Nuevo Local';
        $('#shop-id').value = '';
        modal.open('shop-modal');
    });
    
    // New user button
    $('#btn-new-user')?.addEventListener('click', () => {
        resetForm($('#user-form'));
        $('#user-modal-title').textContent = 'Nuevo Usuario';
        $('#user-id').value = '';
        $('#password-group').style.display = 'block';
        $('#user-submit-btn').textContent = 'Crear Usuario';
        modal.open('user-modal');
    });
    
    // Shop form submit
    $('#shop-form')?.addEventListener('submit', handleShopSubmit);
    
    // Sync country with country code
    $('#shop-country')?.addEventListener('change', (e) => {
        const countrySelect = e.target;
        const selectedCountry = countrySelect.value;
        const countryCodeSelect = $('#shop-country-code');
        
        // Map countries to country codes
        const countryToCode = {
            'United States': '+1',
            'Mexico': '+52',
            'Colombia': '+57',
            'Venezuela': '+58',
            'Argentina': '+54',
            'Chile': '+56',
            'Peru': '+51',
            'Ecuador': '+593',
            'Bolivia': '+591',
            'Paraguay': '+595',
            'Uruguay': '+598',
            'Spain': '+34',
            'United Kingdom': '+44'
        };
        
        if (countryToCode[selectedCountry]) {
            countryCodeSelect.value = countryToCode[selectedCountry];
        }
    });
    
    // Sync country code with country
    $('#shop-country-code')?.addEventListener('change', (e) => {
        const countryCodeSelect = e.target;
        const selectedCode = countryCodeSelect.value;
        const countrySelect = $('#shop-country');
        
        // Get country from selected option's data attribute
        const selectedOption = countryCodeSelect.options[countryCodeSelect.selectedIndex];
        const country = selectedOption.getAttribute('data-country');
        
        if (country && !countrySelect.value) {
            // Only set if country is not already selected
            countrySelect.value = country;
        }
    });
    
    // Logo upload handling
    const logoInput = $('#shop-logo-input');
    const logoPreview = $('#shop-logo-preview');
    const logoImg = $('#shop-logo-img');
    const logoPlaceholder = $('#shop-logo-placeholder');
    const logoRemoveBtn = $('#shop-logo-remove');
    
    logoInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validate file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                toast.error('La imagen no debe superar 2MB');
                logoInput.value = '';
                return;
            }
            
            // Validate file type
            if (!file.type.startsWith('image/')) {
                toast.error('Solo se permiten archivos de imagen');
                logoInput.value = '';
                return;
            }
            
            // Show preview
            const reader = new FileReader();
            reader.onload = (e) => {
                logoImg.src = e.target.result;
                logoImg.style.display = 'block';
                logoPlaceholder.style.display = 'none';
                logoRemoveBtn.style.display = 'inline-flex';
            };
            reader.readAsDataURL(file);
        }
    });
    
    logoRemoveBtn?.addEventListener('click', () => {
        logoInput.value = '';
        logoImg.src = '';
        logoImg.style.display = 'none';
        logoPlaceholder.style.display = 'block';
        logoRemoveBtn.style.display = 'none';
        
        // Mark for removal if editing existing shop
        const shopId = $('#shop-id').value;
        if (shopId) {
            logoInput.dataset.remove = 'true';
        }
    });
    
    // User form submit
    $('#user-form')?.addEventListener('submit', handleUserSubmit);
    
    // User role change
    $('#user-role-select')?.addEventListener('change', (e) => {
        const isTech = e.target.value === 'tech';
        $('#commission-group').style.display = isTech ? 'block' : 'none';
    });
    
    // Subscription form submit
    $('#subscription-form')?.addEventListener('submit', handleSubscriptionSubmit);
    
    // Table row actions
    delegate($('#shops-tbody'), '.btn-edit-shop', 'click', (e, btn) => {
        const row = btn.closest('tr');
        const shopId = row.dataset.id;
        const shop = shops.find(s => s.id === shopId);
        if (shop) openEditShopModal(shop);
    });
    
    delegate($('#shops-tbody'), '.btn-manage-sub', 'click', (e, btn) => {
        const row = btn.closest('tr');
        const shopId = row.dataset.id;
        const shop = shops.find(s => s.id === shopId);
        if (shop) openSubscriptionModal(shop);
    });
    
    delegate($('#subscriptions-tbody'), '.btn-manage-sub', 'click', (e, btn) => {
        const row = btn.closest('tr');
        const shopId = row.dataset.id;
        const shop = shops.find(s => s.id === shopId);
        if (shop) openSubscriptionModal(shop);
    });
    
    delegate($('#users-tbody'), '.btn-edit-user', 'click', (e, btn) => {
        const row = btn.closest('tr');
        const userId = row.dataset.id;
        const user = users.find(u => u.id === userId);
        if (user) openEditUserModal(user);
    });
    
    // Search inputs
    $('#shops-search')?.addEventListener('input', debounce((e) => {
        const term = e.target.value.toLowerCase();
        const filtered = shops.filter(s => 
            s.name.toLowerCase().includes(term) || 
            s.email?.toLowerCase().includes(term)
        );
        renderShopsTable(filtered);
    }, 300));
    
    $('#users-search')?.addEventListener('input', debounce((e) => {
        const term = e.target.value.toLowerCase();
        const filtered = users.filter(u => 
            u.full_name?.toLowerCase().includes(term) || 
            u.email?.toLowerCase().includes(term)
        );
        renderUsersTable(filtered);
    }, 300));
    
    // Filter selects
    $('#users-filter-role')?.addEventListener('change', (e) => {
        const role = e.target.value;
        const filtered = role ? users.filter(u => u.role === role) : users;
        renderUsersTable(filtered);
    });
    
    $('#subs-filter-plan')?.addEventListener('change', filterSubscriptions);
    $('#subs-filter-status')?.addEventListener('change', filterSubscriptions);
}

/**
 * Filter subscriptions
 */
function filterSubscriptions() {
    const plan = $('#subs-filter-plan').value;
    const status = $('#subs-filter-status').value;
    
    let filtered = [...shops];
    if (plan) filtered = filtered.filter(s => s.subscription_plan === plan);
    if (status) filtered = filtered.filter(s => s.subscription_status === status);
    
    renderSubscriptionsTable(filtered);
}

/**
 * Open edit shop modal
 */
function openEditShopModal(shop) {
    const form = $('#shop-form');
    resetForm(form);
    
    $('#shop-modal-title').textContent = 'Editar Local';
    $('#shop-id').value = shop.id;
    
    form.elements.name.value = shop.name || '';
    form.elements.email.value = shop.email || '';
    form.elements.whatsapp.value = shop.whatsapp || '';
    
    // Parse phone number to extract country code and number
    form.elements.country_code.value = shop.country_code || '+1';
    if (shop.phone) {
        const countryCode = shop.country_code || '+1';
        const phoneWithoutCode = shop.phone.startsWith(countryCode) 
            ? shop.phone.substring(countryCode.length) 
            : shop.phone;
        form.elements.phone.value = phoneWithoutCode;
    } else {
        form.elements.phone.value = '';
    }
    
    // Location fields
    form.elements.country.value = shop.country || '';
    form.elements.state.value = shop.state || '';
    form.elements.city.value = shop.city || '';
    form.elements.neighborhood.value = shop.neighborhood || '';
    form.elements.address.value = shop.address || '';
    form.elements.google_maps_url.value = shop.google_maps_url || '';
    
    // Configuration
    form.elements.subscription_plan.value = shop.subscription_plan || 'free';
    form.elements.is_active.value = shop.is_active ? 'true' : 'false';
    
    // Logo preview
    const logoImg = $('#shop-logo-img');
    const logoPlaceholder = $('#shop-logo-placeholder');
    const logoRemoveBtn = $('#shop-logo-remove');
    const logoInput = $('#shop-logo-input');
    
    if (shop.logo_url) {
        logoImg.src = shop.logo_url;
        logoImg.style.display = 'block';
        logoPlaceholder.style.display = 'none';
        logoRemoveBtn.style.display = 'inline-flex';
    } else {
        logoImg.src = '';
        logoImg.style.display = 'none';
        logoPlaceholder.style.display = 'block';
        logoRemoveBtn.style.display = 'none';
    }
    logoInput.value = '';
    logoInput.dataset.remove = '';
    
    modal.open('shop-modal');
}

/**
 * Open subscription modal
 */
function openSubscriptionModal(shop) {
    $('#sub-shop-id').value = shop.id;
    $('#sub-shop-name').textContent = `Local: ${shop.name}`;
    $('#sub-plan-select').value = shop.subscription_plan || 'free';
    $('#sub-status-select').value = shop.subscription_status || 'active';
    
    modal.open('subscription-modal');
}

/**
 * Open edit user modal
 */
function openEditUserModal(user) {
    const form = $('#user-form');
    resetForm(form);
    
    $('#user-modal-title').textContent = 'Editar Usuario';
    $('#user-id').value = user.id;
    $('#password-group').style.display = 'none';
    $('#user-submit-btn').textContent = 'Guardar Cambios';
    
    form.elements.full_name.value = user.full_name || '';
    form.elements.email.value = user.email || '';
    form.elements.role.value = user.role || 'admin';
    form.elements.shop_id.value = user.shop_id || '';
    form.elements.commission_rate.value = user.commission_rate || 10;
    
    $('#commission-group').style.display = user.role === 'tech' ? 'block' : 'none';
    
    modal.open('user-modal');
}

/**
 * Handle shop form submit
 */
async function handleShopSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = $('#shop-submit-btn');
    const shopId = $('#shop-id').value;
    
    // Build phone number with country code
    const countryCode = form.elements.country_code.value.trim();
    const phoneNumber = form.elements.phone.value.trim();
    const fullPhone = phoneNumber ? `${countryCode}${phoneNumber}` : null;
    
    const data = {
        name: form.elements.name.value.trim(),
        phone: fullPhone,
        whatsapp: form.elements.whatsapp?.value.trim() || null,
        email: form.elements.email.value.trim() || null,
        country: form.elements.country.value.trim() || null,
        state: form.elements.state.value.trim() || null,
        city: form.elements.city.value.trim() || null,
        neighborhood: form.elements.neighborhood.value.trim() || null,
        address: form.elements.address.value.trim() || null,
        country_code: countryCode,
        google_maps_url: form.elements.google_maps_url.value.trim() || null,
        subscription_plan: form.elements.subscription_plan.value,
        is_active: form.elements.is_active.value === 'true'
    };
    
    // Validate
    const validation = validateShopForm(data);
    if (validation.hasErrors()) {
        showValidationErrors(form, validation);
        return;
    }
    
    showLoading(submitBtn, { text: 'Guardando...' });
    
    try {
        let savedShop;
        
        if (shopId) {
            // Update existing shop
            savedShop = await updateShop(shopId, data);
            
            // Handle logo upload/removal
            const logoFile = form.elements.logo.files[0];
            const shouldRemoveLogo = form.elements.logo.dataset.remove === 'true';
            
            if (logoFile) {
                // Upload new logo
                const logoUrl = await uploadShopLogo(shopId, logoFile);
                await updateShop(shopId, { logo_url: logoUrl });
            } else if (shouldRemoveLogo) {
                // Remove logo
                await updateShop(shopId, { logo_url: null });
            }
            
            toast.success('Local actualizado');
        } else {
            // Create new shop
            savedShop = await createShop(data);
            
            // Upload logo if provided
            const logoFile = form.elements.logo.files[0];
            if (logoFile && savedShop?.id) {
                const logoUrl = await uploadShopLogo(savedShop.id, logoFile);
                await updateShop(savedShop.id, { logo_url: logoUrl });
            }
            
            toast.success('Local creado');
        }
        
        modal.close('shop-modal');
        await loadShops();
        await loadDashboardData();
        
    } catch (error) {
        console.error('Error saving shop:', error);
        toast.error(error.message || 'Error al guardar el local');
    } finally {
        hideLoading(submitBtn);
    }
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
 * Handle user form submit
 */
async function handleUserSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = $('#user-submit-btn');
    const userId = $('#user-id').value;
    
    showLoading(submitBtn, { text: 'Guardando...' });
    
    try {
        if (userId) {
            // Update existing user - only update fields that exist in profiles
            const updateData = {
                full_name: form.elements.full_name.value.trim(),
                role: form.elements.role.value,
                shop_id: form.elements.shop_id.value || null
            };
            
            const { error } = await getSupabase()
                .from('profiles')
                .update(updateData)
                .eq('id', userId);
            
            if (error) throw error;
            toast.success('Usuario actualizado');
        } else {
            // Create new user with Supabase Auth
            const email = form.elements.email.value.trim();
            const password = form.elements.password.value;
            const fullName = form.elements.full_name.value.trim();
            const role = form.elements.role.value;
            const shopId = form.elements.shop_id.value || null;
            
            if (!email || !password || !fullName) {
                toast.error('Email, contraseña y nombre son requeridos');
                hideLoading(submitBtn);
                return;
            }
            
            if (password.length < 6) {
                toast.error('La contraseña debe tener al menos 6 caracteres');
                hideLoading(submitBtn);
                return;
            }
            
            // 1. Crear usuario en Supabase Auth con signUp
            const { data: authData, error: authError } = await getSupabase().auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: fullName }
                }
            });
            
            if (authError) throw authError;
            
            if (!authData.user) {
                throw new Error('No se pudo crear el usuario');
            }
            
            // 2. Crear el perfil en la tabla profiles (usando upsert por si el trigger lo creó)
            const { error: profileError } = await getSupabase()
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    full_name: fullName,
                    role: role,
                    shop_id: shopId,
                    is_active: true
                }, { onConflict: 'id' });
            
            if (profileError) {
                console.error('Error creating profile:', profileError);
                // El usuario ya se creó en auth, informar al admin
                toast.warning('Usuario creado en Auth pero falló el perfil. Contacta soporte.');
                throw profileError;
            }
            
            toast.success('Usuario creado exitosamente. Ya puede iniciar sesión.');
        }
        
        modal.close('user-modal');
        await loadUsers();
        
    } catch (error) {
        console.error('Error saving user:', error);
        toast.error(error.message || 'Error al guardar el usuario');
    } finally {
        hideLoading(submitBtn);
    }
}

/**
 * Handle subscription form submit
 */
async function handleSubscriptionSubmit(e) {
    e.preventDefault();
    
    const shopId = $('#sub-shop-id').value;
    const plan = $('#sub-plan-select').value;
    const status = $('#sub-status-select').value;
    const days = parseInt($('#subscription-form').elements.days.value) || 30;
    
    // Calculate end date based on days
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    try {
        await updateShopSubscription(shopId, {
            plan,
            status,
            start_date: new Date().toISOString(),
            end_date: endDate.toISOString()
        });
        toast.success('Suscripción actualizada');
        modal.close('subscription-modal');
        await loadShops();
        await loadSubscriptions();
    } catch (error) {
        console.error('Error updating subscription:', error);
        toast.error('Error al actualizar suscripción');
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

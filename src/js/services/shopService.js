/**
 * FIXORA - Shop Service
 * Shop/local management operations
 */

import { query, insert, update, rpc } from './supabaseService.js';
import { CONFIG } from '../config.js';

/**
 * Get all shops (superadmin)
 */
export async function getAllShops(options = {}) {
    const { search, status, plan, page = 1, limit = 20 } = options;

    const filters = [
        { column: 'is_deleted', operator: 'eq', value: false }
    ];

    if (status === 'active') {
        filters.push({ column: 'is_active', operator: 'eq', value: true });
    } else if (status === 'inactive') {
        filters.push({ column: 'is_active', operator: 'eq', value: false });
    }

    if (plan) {
        filters.push({ column: 'subscription_plan', operator: 'eq', value: plan });
    }

    const queryOptions = {
        select: `
            *,
            admin_count:profiles(count),
            tech_count:profiles(count),
            repair_count:repairs(count)
        `,
        filters,
        orderBy: { column: 'created_at', ascending: false },
        limit,
        offset: (page - 1) * limit
    };

    // Note: The counts above need aggregation, simplified version:
    const { data } = await query('shops', {
        filters,
        orderBy: { column: 'created_at', ascending: false },
        limit,
        offset: (page - 1) * limit
    });

    // If search is provided, filter in-memory (for simplicity)
    // In production, use full-text search or ilike
    if (search && data) {
        const searchLower = search.toLowerCase();
        return data.filter(shop => 
            shop.name.toLowerCase().includes(searchLower) ||
            shop.city?.toLowerCase().includes(searchLower) ||
            shop.email?.toLowerCase().includes(searchLower)
        );
    }

    return data;
}

/**
 * Get shop by ID
 */
export async function getShopById(shopId) {
    const { data } = await query('shops', {
        filters: [
            { column: 'id', operator: 'eq', value: shopId },
            { column: 'is_deleted', operator: 'eq', value: false }
        ],
        single: true
    });

    return data;
}

/**
 * Get shop by slug
 */
export async function getShopBySlug(slug) {
    const { data } = await query('shops', {
        filters: [
            { column: 'slug', operator: 'eq', value: slug },
            { column: 'is_deleted', operator: 'eq', value: false }
        ],
        single: true
    });

    return data;
}

/**
 * Create a new shop
 */
export async function createShop(shopData) {
    const {
        name,
        city,
        address,
        phone,
        whatsapp,
        email,
        logo_url,
        default_tech_commission = 30,
        subscription_plan = 'free'
    } = shopData;

    // Generate slug from name
    const slug = generateSlug(name);

    const shop = {
        name,
        slug,
        city,
        address,
        phone,
        whatsapp: whatsapp || phone,
        email,
        logo_url,
        default_tech_commission,
        subscription_plan,
        subscription_status: 'trial',
        subscription_start_date: new Date().toISOString(),
        subscription_end_date: getTrialEndDate(),
        is_active: true
    };

    return insert('shops', shop, { select: '*', single: true });
}

/**
 * Update shop
 */
export async function updateShop(shopId, updates) {
    return update('shops', updates, 
        [{ column: 'id', operator: 'eq', value: shopId }],
        { select: '*', single: true }
    );
}

/**
 * Activate/Deactivate shop
 */
export async function setShopActive(shopId, isActive) {
    return updateShop(shopId, { is_active: isActive });
}

/**
 * Update shop subscription
 */
export async function updateShopSubscription(shopId, subscriptionData) {
    const {
        plan,
        status,
        start_date,
        end_date,
        notes
    } = subscriptionData;

    const updates = {};

    if (plan) updates.subscription_plan = plan;
    if (status) updates.subscription_status = status;
    if (start_date) updates.subscription_start_date = start_date;
    if (end_date) updates.subscription_end_date = end_date;
    if (notes !== undefined) updates.subscription_notes = notes;

    return updateShop(shopId, updates);
}

/**
 * Get shop statistics
 */
export async function getShopStats(shopId) {
    // Get repair stats
    const { data: repairs } = await query('repairs', {
        select: 'status, final_amount, total_profit',
        filters: [
            { column: 'shop_id', operator: 'eq', value: shopId },
            { column: 'is_deleted', operator: 'eq', value: false }
        ]
    });

    // Get tech count
    const { data: techs } = await query('profiles', {
        filters: [
            { column: 'shop_id', operator: 'eq', value: shopId },
            { column: 'role', operator: 'eq', value: 'tech' },
            { column: 'is_active', operator: 'eq', value: true },
            { column: 'is_deleted', operator: 'eq', value: false }
        ]
    });

    // Calculate stats
    const stats = {
        total_repairs: repairs?.length || 0,
        active_repairs: repairs?.filter(r => !['delivered', 'cancelled'].includes(r.status)).length || 0,
        delivered_repairs: repairs?.filter(r => r.status === 'delivered').length || 0,
        total_revenue: repairs?.reduce((sum, r) => sum + (r.final_amount || 0), 0) || 0,
        total_profit: repairs?.reduce((sum, r) => sum + (r.total_profit || 0), 0) || 0,
        tech_count: techs?.length || 0
    };

    return stats;
}

/**
 * Get technicians for a shop
 */
export async function getShopTechnicians(shopId) {
    const { data } = await query('profiles', {
        filters: [
            { column: 'shop_id', operator: 'eq', value: shopId },
            { column: 'role', operator: 'eq', value: 'tech' },
            { column: 'is_deleted', operator: 'eq', value: false }
        ],
        orderBy: { column: 'full_name', ascending: true }
    });

    return data || [];
}

/**
 * Update shop WhatsApp templates
 */
export async function updateShopTemplates(shopId, templates) {
    return updateShop(shopId, { whatsapp_templates: templates });
}

/**
 * Get WhatsApp templates for shop (with defaults)
 */
export async function getShopTemplates(shopId) {
    const shop = await getShopById(shopId);
    
    const customTemplates = shop?.whatsapp_templates || {};
    
    // Merge with defaults
    return {
        admin_to_tech: customTemplates.admin_to_tech || CONFIG.WHATSAPP_TEMPLATES.ADMIN_TO_TECH,
        admin_to_client: customTemplates.admin_to_client || CONFIG.WHATSAPP_TEMPLATES.ADMIN_TO_CLIENT,
        tech_to_admin: customTemplates.tech_to_admin || CONFIG.WHATSAPP_TEMPLATES.TECH_TO_ADMIN,
        tech_to_client: customTemplates.tech_to_client || CONFIG.WHATSAPP_TEMPLATES.TECH_TO_CLIENT
    };
}

/**
 * Check if shop has reached limits based on plan
 */
export async function checkShopLimits(shopId) {
    const shop = await getShopById(shopId);
    if (!shop) return { canAddTech: false, canAddRepair: false };

    const plan = CONFIG.SUBSCRIPTION_PLANS.find(p => p.id === shop.subscription_plan);
    if (!plan) return { canAddTech: true, canAddRepair: true };

    // Get current counts
    const techs = await getShopTechnicians(shopId);
    const { data: repairs } = await query('repairs', {
        filters: [
            { column: 'shop_id', operator: 'eq', value: shopId },
            { column: 'is_deleted', operator: 'eq', value: false }
        ]
    });

    const techCount = techs.length;
    const repairCount = repairs?.length || 0;

    return {
        canAddTech: plan.maxTechs === -1 || techCount < plan.maxTechs,
        canAddRepair: plan.maxRepairs === -1 || repairCount < plan.maxRepairs,
        techCount,
        repairCount,
        maxTechs: plan.maxTechs,
        maxRepairs: plan.maxRepairs
    };
}

// Helper functions

function generateSlug(name) {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .substring(0, 50) + '-' + Date.now().toString(36);
}

function getTrialEndDate() {
    const date = new Date();
    date.setDate(date.getDate() + 14); // 14 day trial
    return date.toISOString();
}

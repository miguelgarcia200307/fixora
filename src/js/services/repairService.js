/**
 * FIXORA - Repair Service
 * Repair/order management operations
 */

import { getSupabase, query, insert, update, rpc, subscribe } from './supabaseService.js';
import { CONFIG } from '../config.js';

/**
 * Get repairs with filters
 */
export async function getRepairs(shopId, options = {}) {
    const { 
        search, 
        status, 
        techId, 
        dateFrom, 
        dateTo, 
        page = 1, 
        limit = 20,
        orderBy = 'intake_date',
        ascending = false
    } = options;

    const filters = [
        { column: 'shop_id', operator: 'eq', value: shopId },
        { column: 'is_deleted', operator: 'eq', value: false }
    ];

    if (status && status !== 'all') {
        filters.push({ column: 'status', operator: 'eq', value: status });
    }

    if (techId) {
        filters.push({ column: 'tech_id', operator: 'eq', value: techId });
    }

    if (dateFrom) {
        filters.push({ column: 'intake_date', operator: 'gte', value: dateFrom });
    }

    if (dateTo) {
        filters.push({ column: 'intake_date', operator: 'lte', value: dateTo });
    }

    let { data } = await query('repairs', {
        select: `
            *,
            client:clients(*),
            tech:profiles(id, full_name, phone, whatsapp)
        `,
        filters,
        orderBy: { column: orderBy, ascending },
        limit,
        offset: (page - 1) * limit
    });

    // Client-side search (for simplicity; use DB search in production)
    if (search && data) {
        const searchLower = search.toLowerCase();
        data = data.filter(repair => 
            repair.code?.toLowerCase().includes(searchLower) ||
            repair.client?.name?.toLowerCase().includes(searchLower) ||
            repair.client?.phone?.includes(search) ||
            repair.device_brand?.toLowerCase().includes(searchLower) ||
            repair.device_model?.toLowerCase().includes(searchLower)
        );
    }

    return data || [];
}

/**
 * Get repairs assigned to a technician
 */
export async function getTechRepairs(techId, options = {}) {
    const { status, page = 1, limit = 20 } = options;

    const filters = [
        { column: 'tech_id', operator: 'eq', value: techId },
        { column: 'is_deleted', operator: 'eq', value: false }
    ];

    if (status && status !== 'all') {
        filters.push({ column: 'status', operator: 'eq', value: status });
    }

    const { data } = await query('repairs', {
        select: `
            *,
            client:clients(*),
            shop:shops(name, whatsapp)
        `,
        filters,
        orderBy: { column: 'priority', ascending: true },
        limit,
        offset: (page - 1) * limit
    });

    return data || [];
}

/**
 * Get repair by ID
 */
export async function getRepairById(repairId) {
    const { data } = await query('repairs', {
        select: `
            *,
            client:clients(*),
            tech:profiles(id, full_name, phone, whatsapp, commission_percentage),
            shop:shops(*)
        `,
        filters: [
            { column: 'id', operator: 'eq', value: repairId },
            { column: 'is_deleted', operator: 'eq', value: false }
        ],
        single: true
    });

    return data;
}

/**
 * Get repair by tracking token (public)
 */
export async function getRepairByToken(token) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    // Use RPC function for public access
    const { data, error } = await client.rpc('get_repair_by_tracking_token', {
        p_token: token
    });

    if (error) {
        console.error('Error fetching repair by token:', error);
        return null;
    }

    if (data && data.length > 0) {
        const repair = data[0];
        
        // Get additional data
        const client_data = await getClientById(repair.client_id);
        const shop_data = await getShopBasicInfo(repair.shop_id);
        
        return {
            ...repair,
            client: client_data,
            shop: shop_data
        };
    }

    return null;
}

/**
 * Get client by ID (basic info for tracking)
 */
async function getClientById(clientId) {
    const { data } = await query('clients', {
        select: 'name',
        filters: [{ column: 'id', operator: 'eq', value: clientId }],
        single: true
    });
    return data;
}

/**
 * Get shop basic info for tracking
 */
async function getShopBasicInfo(shopId) {
    const { data } = await query('shops', {
        select: 'name, phone, whatsapp, logo_url',
        filters: [
            { column: 'id', operator: 'eq', value: shopId },
            { column: 'is_active', operator: 'eq', value: true }
        ],
        single: true
    });
    return data;
}

/**
 * Create a new repair
 */
export async function createRepair(repairData) {
    const {
        shop_id,
        client_id,
        tech_id,
        device_category,
        device_brand,
        device_model,
        device_color,
        device_imei,
        device_accessories,
        intake_reason,
        intake_notes,
        quote_status,
        quote_amount,
        quote_notes,
        priority
    } = repairData;

    const repair = {
        shop_id,
        client_id,
        tech_id: tech_id || null,
        device_category,
        device_brand,
        device_model,
        device_color,
        device_imei,
        device_accessories: JSON.stringify(device_accessories || []),
        intake_reason,
        intake_notes,
        quote_status: quote_status || 'pending',
        quote_amount: quote_amount || null,
        quote_notes,
        priority: priority || 3,
        status: tech_id ? 'assigned' : 'pending'
    };

    // Code and tracking_token are auto-generated by DB trigger
    return insert('repairs', repair, { select: '*', single: true });
}

/**
 * Update repair
 */
export async function updateRepair(repairId, updates) {
    return update('repairs', updates,
        [{ column: 'id', operator: 'eq', value: repairId }],
        { select: '*', single: true }
    );
}

/**
 * Assign technician to repair
 */
export async function assignTechnician(repairId, techId) {
    return updateRepair(repairId, {
        tech_id: techId,
        status: 'assigned',
        assigned_date: new Date().toISOString()
    });
}

/**
 * Update repair status
 */
export async function updateRepairStatus(repairId, status) {
    const updates = { status };

    if (status === 'delivered') {
        updates.delivered_date = new Date().toISOString();
    } else if (['ready', 'delivered'].includes(status)) {
        updates.completed_date = new Date().toISOString();
    }

    return updateRepair(repairId, updates);
}

/**
 * Update repair quote
 */
export async function updateRepairQuote(repairId, quoteStatus, quoteAmount, quoteNotes) {
    return updateRepair(repairId, {
        quote_status: quoteStatus,
        quote_amount: quoteAmount,
        quote_notes: quoteNotes
    });
}

/**
 * Finalize repair with financial data
 */
export async function finalizeRepair(repairId, finalData) {
    const { final_amount, total_cost, tech_commission } = finalData;
    
    const total_profit = (final_amount || 0) - (total_cost || 0);

    return updateRepair(repairId, {
        final_amount,
        total_cost,
        total_profit,
        tech_commission,
        status: 'ready',
        completed_date: new Date().toISOString()
    });
}

/**
 * Mark repair as delivered
 */
export async function markAsDelivered(repairId) {
    return updateRepairStatus(repairId, 'delivered');
}

/**
 * Cancel repair
 */
export async function cancelRepair(repairId) {
    return updateRepairStatus(repairId, 'cancelled');
}

// ==================== REPAIR STAGES ====================

/**
 * Get stages for a repair
 */
export async function getRepairStages(repairId) {
    const { data } = await query('repair_stages', {
        filters: [{ column: 'repair_id', operator: 'eq', value: repairId }],
        orderBy: { column: 'created_at', ascending: false }
    });

    return data || [];
}

/**
 * Get stages for tracking (public, via token)
 */
export async function getPublicStages(repairId, token) {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client.rpc('get_stages_by_repair', {
        p_repair_id: repairId,
        p_token: token
    });

    if (error) {
        console.error('Error fetching stages:', error);
        return [];
    }

    return data || [];
}

/**
 * Add stage to repair
 */
export async function addRepairStage(stageData) {
    const {
        repair_id,
        stage_type,
        stage_name,
        description,
        cost_amount,
        charge_amount,
        is_public,
        created_by
    } = stageData;

    const stage = {
        repair_id,
        stage_type,
        stage_name,
        description,
        cost_amount: cost_amount || 0,
        charge_amount: charge_amount || 0,
        is_public: is_public !== false,
        created_by
    };

    // Also update repair status to in_progress if it's still assigned
    const repair = await getRepairById(repair_id);
    if (repair && repair.status === 'assigned') {
        await updateRepairStatus(repair_id, 'in_progress');
    }

    return insert('repair_stages', stage, { select: '*', single: true });
}

// ==================== CLIENTS ====================

/**
 * Get or create client
 */
export async function getOrCreateClient(shopId, clientData) {
    const { name, phone, whatsapp, email, address } = clientData;

    // Try to find existing client by phone
    const { data: existing } = await query('clients', {
        filters: [
            { column: 'shop_id', operator: 'eq', value: shopId },
            { column: 'phone', operator: 'eq', value: phone },
            { column: 'is_deleted', operator: 'eq', value: false }
        ],
        single: true
    });

    if (existing) {
        // Update if needed
        if (name !== existing.name || email !== existing.email || address !== existing.address) {
            return update('clients', { name, email, address, whatsapp },
                [{ column: 'id', operator: 'eq', value: existing.id }],
                { select: '*', single: true }
            );
        }
        return existing;
    }

    // Create new client
    return insert('clients', {
        shop_id: shopId,
        name,
        phone,
        whatsapp: whatsapp || phone,
        email,
        address
    }, { select: '*', single: true });
}

/**
 * Get shop clients
 */
export async function getShopClients(shopId, search = '') {
    const filters = [
        { column: 'shop_id', operator: 'eq', value: shopId },
        { column: 'is_deleted', operator: 'eq', value: false }
    ];

    let { data } = await query('clients', {
        filters,
        orderBy: { column: 'name', ascending: true },
        limit: 100
    });

    if (search && data) {
        const searchLower = search.toLowerCase();
        data = data.filter(client =>
            client.name.toLowerCase().includes(searchLower) ||
            client.phone.includes(search)
        );
    }

    return data || [];
}

// ==================== STATISTICS ====================

/**
 * Get repair statistics for a shop
 */
export async function getRepairStats(shopId, dateRange = 'month') {
    const filters = [
        { column: 'shop_id', operator: 'eq', value: shopId },
        { column: 'is_deleted', operator: 'eq', value: false }
    ];

    // Add date filter
    const now = new Date();
    let dateFrom;

    switch (dateRange) {
        case 'today':
            dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'week':
            dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'year':
            dateFrom = new Date(now.getFullYear(), 0, 1);
            break;
        default:
            dateFrom = null;
    }

    if (dateFrom) {
        filters.push({ column: 'intake_date', operator: 'gte', value: dateFrom.toISOString() });
    }

    const { data } = await query('repairs', { filters });

    if (!data) return getEmptyStats();

    const stats = {
        total: data.length,
        pending: data.filter(r => r.status === 'pending').length,
        assigned: data.filter(r => r.status === 'assigned').length,
        in_progress: data.filter(r => r.status === 'in_progress').length,
        waiting_parts: data.filter(r => r.status === 'waiting_parts').length,
        ready: data.filter(r => r.status === 'ready').length,
        delivered: data.filter(r => r.status === 'delivered').length,
        cancelled: data.filter(r => r.status === 'cancelled').length,
        pending_quote: data.filter(r => r.quote_status === 'pending').length,
        total_revenue: data.reduce((sum, r) => sum + (r.final_amount || 0), 0),
        total_cost: data.reduce((sum, r) => sum + (r.total_cost || 0), 0),
        total_profit: data.reduce((sum, r) => sum + (r.total_profit || 0), 0),
        active: data.filter(r => !['delivered', 'cancelled'].includes(r.status)).length
    };

    return stats;
}

/**
 * Get technician statistics
 */
export async function getTechStats(techId, dateRange = 'month') {
    const filters = [
        { column: 'tech_id', operator: 'eq', value: techId },
        { column: 'is_deleted', operator: 'eq', value: false }
    ];

    const now = new Date();
    let dateFrom;

    switch (dateRange) {
        case 'today':
            dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'week':
            dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        default:
            dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    filters.push({ column: 'assigned_date', operator: 'gte', value: dateFrom.toISOString() });

    const { data } = await query('repairs', { filters });

    if (!data) return getEmptyTechStats();

    const stats = {
        total_assigned: data.length,
        active: data.filter(r => !['delivered', 'cancelled'].includes(r.status)).length,
        completed: data.filter(r => r.status === 'delivered').length,
        total_charged: data.reduce((sum, r) => sum + (r.final_amount || 0), 0),
        total_cost: data.reduce((sum, r) => sum + (r.total_cost || 0), 0),
        total_profit: data.reduce((sum, r) => sum + (r.total_profit || 0), 0),
        total_commission: data.reduce((sum, r) => sum + (r.tech_commission || 0), 0)
    };

    return stats;
}

function getEmptyStats() {
    return {
        total: 0, pending: 0, assigned: 0, in_progress: 0, waiting_parts: 0,
        ready: 0, delivered: 0, cancelled: 0, pending_quote: 0,
        total_revenue: 0, total_cost: 0, total_profit: 0, active: 0
    };
}

function getEmptyTechStats() {
    return {
        total_assigned: 0, active: 0, completed: 0,
        total_charged: 0, total_cost: 0, total_profit: 0, total_commission: 0
    };
}

/**
 * Update client information
 */
export async function updateClient(clientId, updates) {
    const { name, phone, email } = updates;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) {
        updateData.phone = phone;
        updateData.whatsapp = phone; // También actualizar WhatsApp con el nuevo teléfono
    }
    if (email !== undefined) updateData.email = email;
    
    return update('clients', updateData,
        [{ column: 'id', operator: 'eq', value: clientId }],
        { select: '*', single: true }
    );
}

// ==================== REALTIME ====================

/**
 * Subscribe to repair changes
 */
export function subscribeToRepairs(shopId, callback) {
    return subscribe('repairs', callback, {
        filter: `shop_id=eq.${shopId}`
    });
}

/**
 * Subscribe to stages for a repair (for tracking)
 */
export function subscribeToStages(repairId, callback) {
    return subscribe('repair_stages', callback, {
        filter: `repair_id=eq.${repairId}`
    });
}

/**
 * Generate tracking URL
 */
export function getTrackingUrl(trackingToken) {
    return `${window.location.origin}/track.html?token=${trackingToken}`;
}

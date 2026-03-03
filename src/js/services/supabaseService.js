/**
 * FIXORA - Supabase Service
 * Core service for Supabase client initialization and base operations
 */

import { CONFIG, isConfigValid } from '../config.js';

// Supabase client instance
let supabaseClient = null;

/**
 * Initialize Supabase client
 */
export function initSupabase() {
    if (!isConfigValid()) {
        console.error('Supabase configuration not set. Please update src/js/config.js');
        return null;
    }

    if (!supabaseClient) {
        // Use the global supabase object from CDN
        if (typeof supabase === 'undefined') {
            console.error('Supabase JS library not loaded. Make sure to include the CDN script.');
            return null;
        }

        supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
    }

    return supabaseClient;
}

/**
 * Get Supabase client instance
 */
export function getSupabase() {
    if (!supabaseClient) {
        return initSupabase();
    }
    return supabaseClient;
}

/**
 * Generic query builder wrapper with error handling
 */
export async function query(tableName, options = {}) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    let queryBuilder = client.from(tableName);

    // Select
    if (options.select) {
        queryBuilder = queryBuilder.select(options.select);
    } else {
        queryBuilder = queryBuilder.select('*');
    }

    // Filters
    if (options.filters) {
        for (const filter of options.filters) {
            const { column, operator, value } = filter;
            switch (operator) {
                case 'eq':
                    queryBuilder = queryBuilder.eq(column, value);
                    break;
                case 'neq':
                    queryBuilder = queryBuilder.neq(column, value);
                    break;
                case 'gt':
                    queryBuilder = queryBuilder.gt(column, value);
                    break;
                case 'gte':
                    queryBuilder = queryBuilder.gte(column, value);
                    break;
                case 'lt':
                    queryBuilder = queryBuilder.lt(column, value);
                    break;
                case 'lte':
                    queryBuilder = queryBuilder.lte(column, value);
                    break;
                case 'like':
                    queryBuilder = queryBuilder.like(column, value);
                    break;
                case 'ilike':
                    queryBuilder = queryBuilder.ilike(column, value);
                    break;
                case 'in':
                    queryBuilder = queryBuilder.in(column, value);
                    break;
                case 'is':
                    queryBuilder = queryBuilder.is(column, value);
                    break;
                default:
                    queryBuilder = queryBuilder.eq(column, value);
            }
        }
    }

    // Order
    if (options.orderBy) {
        const { column, ascending = true } = options.orderBy;
        queryBuilder = queryBuilder.order(column, { ascending });
    }

    // Pagination
    if (options.limit) {
        queryBuilder = queryBuilder.limit(options.limit);
    }
    if (options.offset) {
        queryBuilder = queryBuilder.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    // Single row - use maybeSingle to allow 0 rows without error
    if (options.single) {
        queryBuilder = queryBuilder.maybeSingle();
    }

    const { data, error, count } = await queryBuilder;

    if (error) {
        console.error(`Query error on ${tableName}:`, error);
        throw error;
    }

    return { data, count };
}

/**
 * Insert record(s)
 */
export async function insert(tableName, data, options = {}) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    let queryBuilder = client.from(tableName).insert(data);

    if (options.select) {
        queryBuilder = queryBuilder.select(options.select);
    }

    if (options.single) {
        queryBuilder = queryBuilder.single();
    }

    const { data: result, error } = await queryBuilder;

    if (error) {
        console.error(`Insert error on ${tableName}:`, error);
        throw error;
    }

    return result;
}

/**
 * Update record(s)
 */
export async function update(tableName, data, filters, options = {}) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    let queryBuilder = client.from(tableName).update(data);

    // Apply filters
    for (const filter of filters) {
        const { column, operator = 'eq', value } = filter;
        queryBuilder = queryBuilder[operator](column, value);
    }

    if (options.select) {
        queryBuilder = queryBuilder.select(options.select);
    }

    if (options.single) {
        queryBuilder = queryBuilder.single();
    }

    const { data: result, error } = await queryBuilder;

    if (error) {
        console.error(`Update error on ${tableName}:`, error);
        throw error;
    }

    return result;
}

/**
 * Delete record(s) - soft delete by default
 */
export async function remove(tableName, filters, hardDelete = false) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    if (hardDelete) {
        let queryBuilder = client.from(tableName).delete();

        for (const filter of filters) {
            const { column, operator = 'eq', value } = filter;
            queryBuilder = queryBuilder[operator](column, value);
        }

        const { error } = await queryBuilder;

        if (error) {
            console.error(`Delete error on ${tableName}:`, error);
            throw error;
        }
    } else {
        // Soft delete
        return update(tableName, { is_deleted: true }, filters);
    }

    return true;
}

/**
 * Call a stored procedure/function
 */
export async function rpc(functionName, params = {}) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { data, error } = await client.rpc(functionName, params);

    if (error) {
        console.error(`RPC error on ${functionName}:`, error);
        throw error;
    }

    return data;
}

/**
 * Subscribe to realtime changes
 */
export function subscribe(tableName, callback, options = {}) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const channel = client.channel(`${tableName}-changes`);

    let subscription = channel.on(
        'postgres_changes',
        {
            event: options.event || '*',
            schema: 'public',
            table: tableName,
            filter: options.filter
        },
        (payload) => {
            callback(payload);
        }
    );

    subscription.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log(`Subscribed to ${tableName} realtime changes`);
        }
    });

    return subscription;
}

/**
 * Unsubscribe from realtime
 */
export function unsubscribe(subscription) {
    const client = getSupabase();
    if (client && subscription) {
        client.removeChannel(subscription);
    }
}

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured() {
    return isConfigValid();
}

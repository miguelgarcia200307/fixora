/**
 * FIXORA - Auth Service
 * Authentication and session management
 */

import { getSupabase, query, insert, update } from './supabaseService.js';
import { CONFIG } from '../config.js';

/**
 * Sign in with email and password
 */
export async function signIn(email, password) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { data, error } = await client.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        throw error;
    }

    // Update last login
    if (data.user) {
        await updateLastLogin(data.user.id);
    }

    return data;
}

/**
 * Sign out
 */
export async function signOut() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { error } = await client.auth.signOut();

    if (error) {
        throw error;
    }

    return true;
}

/**
 * Get current session
 */
export async function getSession() {
    const client = getSupabase();
    if (!client) return null;

    const { data: { session }, error } = await client.auth.getSession();

    if (error) {
        console.error('Error getting session:', error);
        return null;
    }

    return session;
}

/**
 * Get current user
 */
export async function getCurrentUser() {
    const client = getSupabase();
    if (!client) return null;

    const { data: { user }, error } = await client.auth.getUser();

    if (error) {
        console.error('Error getting user:', error);
        return null;
    }

    return user;
}

/**
 * Get current user profile with role and shop info
 */
export async function getCurrentProfile() {
    const user = await getCurrentUser();
    if (!user) return null;

    try {
        const { data } = await query('profiles', {
            select: `
                *,
                shop:shops(*)
            `,
            filters: [{ column: 'id', operator: 'eq', value: user.id }],
            single: true
        });

        return data;
    } catch (error) {
        console.error('Error getting profile:', error);
        return null;
    }
}

/**
 * Get current user's shop ID
 */
export async function getShopId() {
    const profile = await getCurrentProfile();
    return profile?.shop_id || null;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
    const session = await getSession();
    return !!session;
}

/**
 * Get user role
 */
export async function getUserRole() {
    const profile = await getCurrentProfile();
    return profile?.role || null;
}

/**
 * Check if current user is superadmin
 */
export async function isSuperadmin() {
    const role = await getUserRole();
    return role === CONFIG.ROLES.SUPERADMIN;
}

/**
 * Check if current user is admin
 */
export async function isAdmin() {
    const role = await getUserRole();
    return role === CONFIG.ROLES.ADMIN;
}

/**
 * Check if current user is tech
 */
export async function isTech() {
    const role = await getUserRole();
    return role === CONFIG.ROLES.TECH;
}

/**
 * Create a new user (admin function)
 * Usa una Edge Function de Supabase para crear usuarios con login inmediato
 */
export async function createUser(email, password, profileData) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    // Obtener la sesión actual para autorización
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('No hay sesión activa');

    // Llamar a la Edge Function create-user
    const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': CONFIG.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
            email,
            password,
            full_name: profileData.full_name,
            role: profileData.role,
            shop_id: profileData.shop_id,
            phone: profileData.phone,
            whatsapp: profileData.whatsapp,
            commission_percentage: profileData.commission_percentage
        })
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || 'Error al crear usuario');
    }

    return { user: result.user };
}

/**
 * Create user profile
 */
export async function createProfile(userId, profileData) {
    const { full_name, role, shop_id, phone, whatsapp, commission_percentage } = profileData;

    const profile = {
        id: userId,
        full_name,
        role: role || CONFIG.ROLES.TECH,
        shop_id: shop_id || null,
        phone: phone || null,
        whatsapp: whatsapp || phone || null,
        commission_percentage: commission_percentage || null,
        is_active: true
    };

    return insert('profiles', profile, { single: true });
}

/**
 * Update user profile
 */
export async function updateProfile(userId, updates) {
    return update('profiles', updates, [
        { column: 'id', operator: 'eq', value: userId }
    ], { single: true });
}

/**
 * Update last login timestamp
 */
async function updateLastLogin(userId) {
    try {
        await update('profiles', 
            { last_login_at: new Date().toISOString() },
            [{ column: 'id', operator: 'eq', value: userId }]
        );
    } catch (error) {
        // Non-critical, just log
        console.error('Error updating last login:', error);
    }
}

/**
 * Check if user's shop is active
 */
export async function isShopActive() {
    const profile = await getCurrentProfile();
    
    if (!profile) return false;
    if (profile.role === CONFIG.ROLES.SUPERADMIN) return true;
    if (!profile.shop) return false;

    return profile.shop.is_active && 
           profile.shop.subscription_status !== 'expired' &&
           profile.shop.subscription_status !== 'cancelled';
}

/**
 * Change password
 */
export async function changePassword(newPassword) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { error } = await client.auth.updateUser({
        password: newPassword
    });

    if (error) throw error;

    return true;
}

/**
 * Reset password request
 */
export async function resetPasswordRequest(email) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/index.html`
    });

    if (error) throw error;

    return true;
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback) {
    const client = getSupabase();
    if (!client) return null;

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });

    return subscription;
}

/**
 * Redirect user based on role
 */
export async function redirectByRole() {
    const profile = await getCurrentProfile();
    
    if (!profile) {
        window.location.href = '/index.html';
        return;
    }

    // Check if shop is active (for non-superadmins)
    if (profile.role !== CONFIG.ROLES.SUPERADMIN) {
        if (!profile.shop || !profile.shop.is_active) {
            await signOut();
            window.location.href = '/index.html?error=shop_inactive';
            return;
        }
    }

    switch (profile.role) {
        case CONFIG.ROLES.SUPERADMIN:
            window.location.href = '/superadmin.html';
            break;
        case CONFIG.ROLES.ADMIN:
            window.location.href = '/admin.html';
            break;
        case CONFIG.ROLES.TECH:
            window.location.href = '/tech.html';
            break;
        default:
            window.location.href = '/index.html';
    }
}

/**
 * Check authentication and redirect if needed
 */
export async function requireAuth(allowedRoles = null) {
    const session = await getSession();
    
    if (!session) {
        window.location.href = '/index.html';
        return false;
    }

    const profile = await getCurrentProfile();
    
    if (!profile) {
        window.location.href = '/index.html';
        return false;
    }

    // Check role if specified
    if (allowedRoles && !allowedRoles.includes(profile.role)) {
        await redirectByRole();
        return false;
    }

    // Check shop status for non-superadmins
    if (profile.role !== CONFIG.ROLES.SUPERADMIN) {
        if (!profile.shop || !profile.shop.is_active) {
            await signOut();
            window.location.href = '/index.html?error=shop_inactive';
            return false;
        }
    }

    return profile;
}

/**
 * FIXORA - Public Tracking Page
 * Customer repair tracking with realtime updates
 */

import { CONFIG } from '../config.js';
import { getSupabase } from '../services/supabaseService.js';
import { getEvidenceUrl } from '../services/storageService.js';
import { 
    formatDate, 
    formatDateTime,
    formatDeviceCategory,
    formatRepairStatus
} from '../utils/formatters.js';
import { $ } from '../utils/helpers.js';

// State
let currentRepair = null;
let currentShop = null;
let realtimeChannel = null;
let currentTrackingToken = null;
let pollingInterval = null;
let lastStageSignature = '';

const TRACKING_POLL_MS = 20000;

// Status order for progress bar
const STATUS_ORDER = ['pending', 'assigned', 'in_progress', 'ready', 'delivered'];
const STATUS_MESSAGES = {
    pending: {
        title: 'Recibido',
        description: 'Tu dispositivo ha sido recibido y está en espera de ser asignado a un técnico.'
    },
    assigned: {
        title: 'Asignado',
        description: 'Un técnico ha sido asignado para trabajar en tu dispositivo.'
    },
    in_progress: {
        title: 'En proceso',
        description: 'Tu dispositivo está siendo reparado por nuestro técnico.'
    },
    waiting_parts: {
        title: 'Esperando repuestos',
        description: 'La reparación está pausada mientras esperamos los repuestos necesarios.'
    },
    ready: {
        title: '¡Listo para recoger!',
        description: 'Tu dispositivo está reparado y listo para ser recogido.'
    },
    delivered: {
        title: 'Entregado',
        description: 'Tu dispositivo ha sido entregado exitosamente.'
    },
    cancelled: {
        title: 'Cancelado',
        description: 'Esta reparación ha sido cancelada.'
    }
};

/**
 * Initialize page
 */
function init() {
    // Check URL params
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const code = params.get('code');
    
    if (token) {
        loadByToken(token);
    } else if (code) {
        $('#search-input').value = code;
        searchRepair(code);
    }
    
    // Setup search form
    $('#search-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const code = $('#search-input').value.trim().toUpperCase();
        if (code) {
            searchRepair(code);
        }
    });
}

/**
 * Load repair by tracking token
 */
async function loadByToken(token) {
    showLoading();
    currentTrackingToken = token;
    
    const supabase = getSupabase();
    if (!supabase) {
        showNotFound();
        return;
    }
    
    try {
        // Use RPC function for public access (bypasses RLS)
        const { data: repairData, error: rpcError } = await supabase.rpc('get_repair_by_tracking_token', {
            p_token: token
        });
        
        if (rpcError || !repairData || repairData.length === 0) {
            console.error('RPC error:', rpcError);
            showNotFound();
            return;
        }
        
        const repair = repairData[0];
        
        // Fetch related data
        const [clientRes, shopRes, techRes] = await Promise.all([
            repair.client_id ? supabase.from('clients').select('name, phone').eq('id', repair.client_id).single() : { data: null },
            repair.shop_id ? supabase.from('shops').select('name, phone, email, address, whatsapp').eq('id', repair.shop_id).single() : { data: null },
            repair.tech_id ? supabase.from('profiles').select('full_name').eq('id', repair.tech_id).single() : { data: null }
        ]);
        
        // Attach related data
        repair.clients = clientRes.data;
        repair.shops = shopRes.data;
        repair.profiles = techRes.data;
        
        displayRepair(repair);
        setupRealtimeUpdates(repair.id);
        
    } catch (error) {
        console.error('Error loading repair:', error);
        showNotFound();
    }
}

/**
 * Search repair by code
 */
async function searchRepair(code) {
    showLoading();
    
    const supabase = getSupabase();
    if (!supabase) {
        showNotFound();
        return;
    }
    
    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('code', code);
    window.history.replaceState({}, '', url);
    
    try {
        // Use RPC function for public access (bypasses RLS)
        const { data: repairData, error: rpcError } = await supabase.rpc('get_repair_by_code', {
            p_code: code
        });
        
        if (rpcError || !repairData || repairData.length === 0) {
            console.error('RPC error:', rpcError);
            showNotFound();
            return;
        }
        
        const repair = repairData[0];
        currentTrackingToken = repair.tracking_token || currentTrackingToken;
        
        // Fetch related data
        const [clientRes, shopRes, techRes] = await Promise.all([
            repair.client_id ? supabase.from('clients').select('name, phone').eq('id', repair.client_id).single() : { data: null },
            repair.shop_id ? supabase.from('shops').select('name, phone, email, address, whatsapp').eq('id', repair.shop_id).single() : { data: null },
            repair.tech_id ? supabase.from('profiles').select('full_name').eq('id', repair.tech_id).single() : { data: null }
        ]);
        
        // Attach related data
        repair.clients = clientRes.data;
        repair.shops = shopRes.data;
        repair.profiles = techRes.data;
        
        displayRepair(repair);
        setupRealtimeUpdates(repair.id);
        
    } catch (error) {
        console.error('Error searching repair:', error);
        showNotFound();
    }
}

/**
 * Show loading state
 */
function showLoading() {
    stopTrackingSubscriptions();
    $('#loading-state').classList.add('visible');
    $('#not-found').classList.remove('visible');
    $('#tracking-result').classList.remove('visible');
}

/**
 * Show not found state
 */
function showNotFound() {
    stopTrackingSubscriptions();
    $('#loading-state').classList.remove('visible');
    $('#not-found').classList.add('visible');
    $('#tracking-result').classList.remove('visible');
}

/**
 * Clear active realtime and polling subscriptions
 */
function stopTrackingSubscriptions() {
    if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        realtimeChannel = null;
    }

    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

/**
 * Display repair information
 */
async function displayRepair(repair) {
    currentRepair = repair;
    currentShop = repair.shops;
    
    $('#loading-state').classList.remove('visible');
    $('#not-found').classList.remove('visible');
    $('#tracking-result').classList.add('visible');
    
    // Repair code
    $('#repair-code').textContent = repair.code;
    $('#search-input').value = repair.code;
    
    // Progress steps
    updateProgressSteps(repair.status);
    
    // Status display
    updateStatusDisplay(repair.status);
    
    // Device info
    const deviceInfo = $('#device-info');
    deviceInfo.innerHTML = `
        <div class="info-item">
            <label>Dispositivo</label>
            <span>${formatDeviceCategory(repair.device_category)}</span>
        </div>
        <div class="info-item">
            <label>Marca / Modelo</label>
            <span>${repair.device_brand} ${repair.device_model}</span>
        </div>
        <div class="info-item">
            <label>Fecha de ingreso</label>
            <span>${formatDate(repair.created_at)}</span>
        </div>
        ${repair.profiles?.full_name ? `
            <div class="info-item">
                <label>Técnico asignado</label>
                <span>${repair.profiles.full_name}</span>
            </div>
        ` : ''}
    `;
    
    // Shop info
    const shopInfo = $('#shop-info');
    const shopContact = $('#shop-contact');
    if (currentShop) {
        shopInfo.innerHTML = `
            <div class="info-item">
                <label>Local</label>
                <span>${currentShop.name || '-'}</span>
            </div>
            ${currentShop.address ? `
                <div class="info-item">
                    <label>Dirección</label>
                    <span>${currentShop.address}</span>
                </div>
            ` : ''}
        `;
        
        // Contact buttons
        let contactHtml = '';
        if (currentShop.phone) {
            contactHtml += `
                <a href="tel:${currentShop.phone}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    <span>${currentShop.phone}</span>
                </a>
            `;
        }
        if (currentShop.email) {
            contactHtml += `
                <a href="mailto:${currentShop.email}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <span>Email</span>
                </a>
            `;
        }
        if (currentShop.phone) {
            const waPhone = currentShop.phone.replace(/\D/g, '');
            contactHtml += `
                <a href="https://wa.me/${waPhone}" target="_blank">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    <span>WhatsApp</span>
                </a>
            `;
        }
        shopContact.innerHTML = contactHtml;
    } else {
        shopInfo.innerHTML = '<div class="info-item"><label>Info</label><span>Información no disponible</span></div>';
        shopContact.innerHTML = '';
    }
    
    // Load stages
    await loadStages(repair.id, currentTrackingToken);
}

/**
 * Update progress steps
 */
function updateProgressSteps(currentStatus) {
    const steps = document.querySelectorAll('.progress-step');
    const progressFill = $('#progress-fill');
    
    // Map waiting_parts to in_progress for display
    const displayStatus = currentStatus === 'waiting_parts' ? 'in_progress' : currentStatus;
    const currentIndex = STATUS_ORDER.indexOf(displayStatus);
    
    // Update progress bar fill
    if (progressFill) {
        const percentage = currentIndex >= 0 ? (currentIndex / (STATUS_ORDER.length - 1)) * 100 : 0;
        progressFill.style.width = percentage + '%';
    }
    
    steps.forEach((step, index) => {
        const stepStatus = step.dataset.step;
        const stepIndex = STATUS_ORDER.indexOf(stepStatus);
        
        step.classList.remove('completed', 'active');
        
        if (currentStatus === 'cancelled') {
            // Show cancelled state
            return;
        }
        
        if (stepIndex < currentIndex) {
            step.classList.add('completed');
        } else if (stepIndex === currentIndex) {
            step.classList.add('active');
        }
    });
}

/**
 * Update status display
 */
function updateStatusDisplay(status) {
    const display = $('#status-display');
    const statusInfo = STATUS_MESSAGES[status] || STATUS_MESSAGES.pending;
    
    // Update icon class
    const iconContainer = $('#status-icon-container');
    iconContainer.className = 'status-icon ' + status;
    
    // Update icon SVG based on status
    const iconSvgs = {
        pending: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
        </svg>`,
        assigned: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>`,
        in_progress: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>`,
        waiting_parts: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>`,
        ready: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>`,
        delivered: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>`,
        cancelled: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`
    };
    
    iconContainer.innerHTML = iconSvgs[status] || iconSvgs.pending;
    
    // Update text
    $('#status-title').textContent = statusInfo.title;
    $('#status-description').textContent = statusInfo.description;
}

/**
 * Load repair stages
 */
async function loadStages(repairId, trackingToken = currentTrackingToken) {
    const supabase = getSupabase();
    if (!supabase) return;
    
    try {
        let stages = [];

        if (trackingToken) {
            // Public tracking path: use RPC functions (compatible with anon users / Safari clients)
            const { data: publicStages, error: stagesError } = await supabase.rpc('get_stages_by_repair', {
                p_repair_id: repairId,
                p_token: trackingToken
            });

            if (stagesError) {
                throw stagesError;
            }

            stages = publicStages || [];

            if (stages.length > 0) {
                const evidenceResponses = await Promise.all(
                    stages.map(stage =>
                        supabase
                            .rpc('get_stage_evidence_by_stage', {
                                p_stage_id: stage.id,
                                p_token: trackingToken
                            })
                            .catch(() => ({ data: [] }))
                    )
                );

                stages = stages.map((stage, index) => ({
                    ...stage,
                    evidence: evidenceResponses[index]?.data || []
                }));
            }
        } else {
            // Authenticated fallback path
            const { data: authStages } = await supabase
                .from('repair_stages')
                .select(`
                    *,
                    evidence:stage_evidence(id, file_url, file_name)
                `)
                .eq('repair_id', repairId)
                .eq('is_public', true)
                .order('created_at', { ascending: false });

            stages = authStages || [];
        }
        
        const timelineCard = $('#timeline-card');
        const timeline = $('#timeline');
        const newSignature = stages.map(stage => `${stage.id}:${stage.updated_at || stage.created_at}`).join('|');
        const stagesChanged = newSignature !== lastStageSignature;
        lastStageSignature = newSignature;
        
        if (!stages || stages.length === 0) {
            timelineCard.style.display = 'none';
            return { changed: stagesChanged, count: 0 };
        }
        
        timelineCard.style.display = 'block';
        
        timeline.innerHTML = stages.map(stage => {
            // Las evidencias vienen en stage.evidence como array
            const photos = stage.evidence || [];
            
            return `
            <div class="timeline-item">
                <div class="timeline-dot">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 6L9 17l-5-5"/>
                    </svg>
                </div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <span class="timeline-title">${stage.stage_name}</span>
                        <span class="timeline-date">${formatDateTime(stage.created_at)}</span>
                    </div>
                    ${stage.description ? `<p class="timeline-description">${stage.description}</p>` : ''}
                    ${photos.length > 0 ? `
                        <div class="timeline-evidence">
                            <div class="timeline-evidence-header">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                    <circle cx="8.5" cy="8.5" r="1.5"/>
                                    <polyline points="21 15 16 10 5 21"/>
                                </svg>
                                <span>Evidencia Fotográfica</span>
                                <span class="timeline-evidence-badge">${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}</span>
                            </div>
                            <div class="timeline-photos">
                                ${photos.map(photo => `
                                    <div class="timeline-photo" title="Clic para ampliar">
                                        <img src="${getEvidenceUrl(photo.file_url)}" alt="Evidencia" loading="lazy">
                                        <div class="timeline-photo-overlay">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <circle cx="11" cy="11" r="8"/>
                                                <path d="M21 21l-4.35-4.35"/>
                                                <path d="M11 8v6"/>
                                                <path d="M8 11h6"/>
                                            </svg>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `}).join('');

        return { changed: stagesChanged, count: stages.length };
        
    } catch (error) {
        console.error('Error loading stages:', error);
        return { changed: false, count: 0 };
    }
}

/**
 * Poll tracking data (fallback for browsers/devices where realtime can be limited)
 */
async function pollTrackingUpdates(repairId) {
    const supabase = getSupabase();
    if (!supabase || !currentRepair) return;

    try {
        let repairData = null;

        if (currentTrackingToken) {
            const { data } = await supabase.rpc('get_repair_by_tracking_token', {
                p_token: currentTrackingToken
            });
            repairData = data?.[0] || null;
        } else if (currentRepair.code) {
            const { data } = await supabase.rpc('get_repair_by_code', {
                p_code: currentRepair.code
            });
            repairData = data?.[0] || null;
        }

        if (!repairData) return;

        const statusChanged = repairData.status !== currentRepair.status;
        currentRepair = { ...currentRepair, ...repairData };

        if (statusChanged) {
            updateProgressSteps(repairData.status);
            updateStatusDisplay(repairData.status);
        }

        const stageResult = await loadStages(repairId, currentTrackingToken);

        if (statusChanged || stageResult?.changed) {
            showUpdateNotification();
        }
    } catch (error) {
        console.error('Error polling tracking updates:', error);
    }
}

/**
 * Start fallback polling updates
 */
function startTrackingPolling(repairId) {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }

    pollingInterval = setInterval(() => {
        pollTrackingUpdates(repairId);
    }, TRACKING_POLL_MS);
}

/**
 * Setup realtime updates
 */
function setupRealtimeUpdates(repairId) {
    const supabase = getSupabase();
    if (!supabase) return;
    
    stopTrackingSubscriptions();
    
    // Subscribe to repair changes
    realtimeChannel = supabase
        .channel(`tracking-${repairId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'repairs',
                filter: `id=eq.${repairId}`
            },
            (payload) => {
                console.log('Repair updated:', payload);
                if (payload.new) {
                    currentRepair = { ...currentRepair, ...payload.new };
                    // Update status display
                    updateProgressSteps(payload.new.status);
                    updateStatusDisplay(payload.new.status);
                    
                    // Show notification
                    showUpdateNotification();
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'repair_stages',
                filter: `repair_id=eq.${repairId}`
            },
            (payload) => {
                console.log('New stage:', payload);
                if (payload.new?.is_public) {
                    // Reload stages
                    loadStages(repairId, currentTrackingToken);
                    showUpdateNotification();
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Tracking realtime connected');
            }
        });

    // Fallback for Safari/iOS or restrictive networks where websocket realtime can fail/sleep
    startTrackingPolling(repairId);
}

/**
 * Show update notification
 */
function showUpdateNotification() {
    // Create a subtle notification
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>¡Tu reparación ha sido actualizada!</span>
    `;
    notification.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #10B981, #059669);
        color: white;
        padding: 14px 24px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 8px 32px rgba(16, 185, 129, 0.4);
        z-index: 1000;
        animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { transform: translateX(-50%) translateY(100%); opacity: 0; }
            to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

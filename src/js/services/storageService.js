/**
 * FIXORA - Storage Service
 * File upload and management for evidence photos
 */

import { getSupabase, query, insert } from './supabaseService.js';
import { CONFIG } from '../config.js';

/**
 * Upload file to storage
 */
export async function uploadFile(bucket, path, file, options = {}) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    // Compress image if needed
    let fileToUpload = file;
    if (file.type.startsWith('image/') && !options.skipCompression) {
        fileToUpload = await compressImage(file);
    }

    const { data, error } = await client.storage
        .from(bucket)
        .upload(path, fileToUpload, {
            cacheControl: '3600',
            upsert: options.upsert || false
        });

    if (error) {
        console.error('Upload error:', error);
        throw error;
    }

    // Get public URL
    const { data: urlData } = client.storage
        .from(bucket)
        .getPublicUrl(data.path);

    return {
        path: data.path,
        url: urlData.publicUrl
    };
}

/**
 * Upload intake evidence photo
 */
export async function uploadIntakeEvidence(shopId, repairId, file, evidenceType = 'general') {
    const fileName = generateFileName(file.name);
    const path = `${shopId}/${repairId}/${fileName}`;

    const result = await uploadFile(CONFIG.STORAGE_BUCKETS.INTAKE_EVIDENCE, path, file);

    // Save record to database
    const evidence = await insert('intake_evidence', {
        repair_id: repairId,
        file_url: result.url,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        evidence_type: evidenceType
    }, { select: '*', single: true });

    return evidence;
}

/**
 * Upload stage evidence photo
 */
export async function uploadStageEvidence(shopId, repairId, stageId, file) {
    const fileName = generateFileName(file.name);
    const path = `${shopId}/${repairId}/${stageId}/${fileName}`;

    const result = await uploadFile(CONFIG.STORAGE_BUCKETS.STAGE_EVIDENCE, path, file);

    // Save record to database
    const evidence = await insert('stage_evidence', {
        stage_id: stageId,
        file_url: result.url,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size
    }, { select: '*', single: true });

    return evidence;
}

/**
 * Upload shop logo
 */
export async function uploadShopLogo(shopId, file) {
    const fileName = `logo_${Date.now()}.${getFileExtension(file.name)}`;
    const path = `${shopId}/${fileName}`;

    const result = await uploadFile(CONFIG.STORAGE_BUCKETS.SHOP_LOGOS, path, file, {
        upsert: true
    });

    return result.url;
}

/**
 * Get intake evidence for a repair
 */
export async function getIntakeEvidence(repairId) {
    const { data } = await query('intake_evidence', {
        filters: [{ column: 'repair_id', operator: 'eq', value: repairId }],
        orderBy: { column: 'sort_order', ascending: true }
    });

    return data || [];
}

/**
 * Get intake evidence for tracking (public)
 */
export async function getPublicIntakeEvidence(repairId, token) {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client.rpc('get_intake_evidence_by_repair', {
        p_repair_id: repairId,
        p_token: token
    });

    if (error) {
        console.error('Error fetching intake evidence:', error);
        return [];
    }

    return data || [];
}

/**
 * Get stage evidence
 */
export async function getStageEvidence(stageId) {
    const { data } = await query('stage_evidence', {
        filters: [{ column: 'stage_id', operator: 'eq', value: stageId }],
        orderBy: { column: 'sort_order', ascending: true }
    });

    return data || [];
}

/**
 * Get stage evidence for tracking (public)
 */
export async function getPublicStageEvidence(stageId, token) {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client.rpc('get_stage_evidence_by_stage', {
        p_stage_id: stageId,
        p_token: token
    });

    if (error) {
        console.error('Error fetching stage evidence:', error);
        return [];
    }

    return data || [];
}

/**
 * Delete file from storage
 */
export async function deleteFile(bucket, path) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { error } = await client.storage
        .from(bucket)
        .remove([path]);

    if (error) {
        console.error('Delete error:', error);
        throw error;
    }

    return true;
}

/**
 * Delete all files from a repair folder in storage
 */
export async function deleteRepairStorageFiles(shopId, repairId) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const results = {
        intake: { success: false, files: [] },
        stages: { success: false, files: [] }
    };

    // Delete intake evidence files
    try {
        const intakePath = `${shopId}/${repairId}`;
        const { data: intakeFiles } = await client.storage
            .from(CONFIG.STORAGE_BUCKETS.INTAKE_EVIDENCE)
            .list(intakePath);

        if (intakeFiles && intakeFiles.length > 0) {
            const intakePaths = intakeFiles.map(f => `${intakePath}/${f.name}`);
            await client.storage
                .from(CONFIG.STORAGE_BUCKETS.INTAKE_EVIDENCE)
                .remove(intakePaths);
            results.intake = { success: true, files: intakePaths };
        } else {
            results.intake.success = true; // No files to delete
        }
    } catch (error) {
        console.error('Error deleting intake evidence files:', error);
    }

    // Delete stage evidence files
    try {
        const stagePath = `${shopId}/${repairId}`;
        const { data: stageFiles } = await client.storage
            .from(CONFIG.STORAGE_BUCKETS.STAGE_EVIDENCE)
            .list(stagePath);

        if (stageFiles && stageFiles.length > 0) {
            // Need to list subdirectories (stages)
            const allStagePaths = [];
            for (const stageFolder of stageFiles) {
                if (stageFolder.name) {
                    const { data: files } = await client.storage
                        .from(CONFIG.STORAGE_BUCKETS.STAGE_EVIDENCE)
                        .list(`${stagePath}/${stageFolder.name}`);
                    if (files) {
                        files.forEach(f => {
                            allStagePaths.push(`${stagePath}/${stageFolder.name}/${f.name}`);
                        });
                    }
                }
            }

            if (allStagePaths.length > 0) {
                await client.storage
                    .from(CONFIG.STORAGE_BUCKETS.STAGE_EVIDENCE)
                    .remove(allStagePaths);
                results.stages = { success: true, files: allStagePaths };
            } else {
                results.stages.success = true;
            }
        } else {
            results.stages.success = true;
        }
    } catch (error) {
        console.error('Error deleting stage evidence files:', error);
    }

    return results;
}

/**
 * Compress image before upload
 */
async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                
                // Calculate new dimensions
                const maxWidth = CONFIG.IMAGES.MAX_WIDTH;
                const maxHeight = CONFIG.IMAGES.MAX_HEIGHT;
                
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(
                    (blob) => {
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    },
                    'image/jpeg',
                    CONFIG.IMAGES.QUALITY
                );
            };
            
            img.onerror = reject;
        };
        
        reader.onerror = reject;
    });
}

/**
 * Convert blob to file
 */
export function blobToFile(blob, fileName) {
    return new File([blob], fileName, {
        type: blob.type,
        lastModified: Date.now()
    });
}

/**
 * Convert data URL to blob
 */
export function dataUrlToBlob(dataUrl) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new Blob([u8arr], { type: mime });
}

/**
 * Validate file
 */
export function validateFile(file) {
    const errors = [];

    // Check type
    if (!CONFIG.IMAGES.ALLOWED_TYPES.includes(file.type)) {
        errors.push(`Tipo de archivo no permitido: ${file.type}`);
    }

    // Check size
    const maxSizeBytes = CONFIG.IMAGES.MAX_SIZE_MB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
        errors.push(`El archivo es muy grande. Máximo: ${CONFIG.IMAGES.MAX_SIZE_MB}MB`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Generate unique file name
 */
function generateFileName(originalName) {
    const ext = getFileExtension(originalName);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${random}.${ext}`;
}

/**
 * Get file extension
 */
function getFileExtension(fileName) {
    return fileName.split('.').pop().toLowerCase();
}

/**
 * Get file size in human readable format
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Create image preview from file
 */
export function createImagePreview(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            resolve(e.target.result);
        };
        
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Process multiple files for upload
 */
export async function processFilesForUpload(files, onProgress) {
    const results = [];
    const total = files.length;
    
    for (let i = 0; i < total; i++) {
        const file = files[i];
        
        // Validate
        const validation = validateFile(file);
        if (!validation.valid) {
            results.push({
                file,
                success: false,
                errors: validation.errors
            });
            continue;
        }
        
        // Create preview
        const preview = await createImagePreview(file);
        
        results.push({
            file,
            preview,
            success: true
        });
        
        if (onProgress) {
            onProgress((i + 1) / total * 100, i + 1, total);
        }
    }
    
    return results;
}
/**
 * Get public URL for evidence photo
 */
export function getEvidenceUrl(path) {
    if (!path) return '';
    
    // If it's already a full URL, return it
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }
    
    const client = getSupabase();
    if (!client) return path;
    
    // Try to determine bucket based on path structure
    // Expected path format: shopId/repairId/filename or shopId/repairId/stageId/filename
    let bucket = CONFIG.STORAGE_BUCKETS.STAGE_EVIDENCE;
    
    // If path contains only 3 segments (shop/repair/file), it's intake evidence
    // If path contains 4 segments (shop/repair/stage/file), it's stage evidence
    const pathSegments = path.split('/').filter(s => s);
    if (pathSegments.length === 3) {
        bucket = CONFIG.STORAGE_BUCKETS.INTAKE_EVIDENCE;
    }
    
    try {
        const { data } = client.storage
            .from(bucket)
            .getPublicUrl(path);
        
        return data?.publicUrl || path;
    } catch (error) {
        console.error('Error getting public URL:', error);
        return path;
    }
}
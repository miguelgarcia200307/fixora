/**
 * FIXORA - Camera & Image Capture System
 * Handles camera capture, file selection, and clipboard paste
 */

import { CONFIG } from '../config.js';
import { showError } from './toast.js';

class CameraCapture {
    constructor() {
        this.stream = null;
        this.videoElement = null;
        this.canvasElement = null;
        this.container = null;
        this.isActive = false;
        this.onCapture = null;
        this.facingMode = 'environment'; // 'user' for front camera
    }
    
    /**
     * Check if camera is supported
     */
    isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }
    
    /**
     * Create camera UI
     */
    createUI() {
        if (this.container) return;
        
        const html = `
            <div class="camera-overlay" id="camera-overlay">
                <div class="camera-container">
                    <div class="camera-header">
                        <span class="camera-title">Capturar Foto</span>
                        <button class="camera-close" id="camera-close">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="camera-viewport">
                        <video id="camera-video" autoplay playsinline></video>
                        <canvas id="camera-canvas" style="display: none;"></canvas>
                        <div class="camera-loading" id="camera-loading">
                            <div class="spinner"></div>
                            <span>Iniciando cámara...</span>
                        </div>
                        <div class="camera-error" id="camera-error" style="display: none;">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                            <span>No se pudo acceder a la cámara</span>
                            <button class="btn btn-secondary btn-sm" id="camera-retry">Reintentar</button>
                        </div>
                    </div>
                    <div class="camera-controls">
                        <button class="camera-btn camera-btn-secondary" id="camera-switch" title="Cambiar cámara">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                                <path d="M9 13l3-3 3 3"/>
                                <path d="M15 13l-3 3-3-3"/>
                            </svg>
                        </button>
                        <button class="camera-btn camera-btn-capture" id="camera-capture" disabled>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                            </svg>
                        </button>
                        <button class="camera-btn camera-btn-secondary" id="camera-cancel">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', html);
        
        this.container = document.getElementById('camera-overlay');
        this.videoElement = document.getElementById('camera-video');
        this.canvasElement = document.getElementById('camera-canvas');
        
        // Event listeners
        document.getElementById('camera-close').onclick = () => this.close();
        document.getElementById('camera-cancel').onclick = () => this.close();
        document.getElementById('camera-capture').onclick = () => this.capture();
        document.getElementById('camera-switch').onclick = () => this.switchCamera();
        document.getElementById('camera-retry').onclick = () => this.startStream();
        
        // Close on overlay click
        this.container.onclick = (e) => {
            if (e.target === this.container) {
                this.close();
            }
        };
        
        // ESC to close
        document.addEventListener('keydown', this.handleKeydown.bind(this));
    }
    
    handleKeydown(e) {
        if (e.key === 'Escape' && this.isActive) {
            this.close();
        }
    }
    
    /**
     * Start camera stream
     */
    async startStream() {
        const loading = document.getElementById('camera-loading');
        const error = document.getElementById('camera-error');
        const captureBtn = document.getElementById('camera-capture');
        
        loading.style.display = 'flex';
        error.style.display = 'none';
        captureBtn.disabled = true;
        
        try {
            // Stop existing stream
            this.stopStream();
            
            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;
            
            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = resolve;
            });
            
            loading.style.display = 'none';
            captureBtn.disabled = false;
            
        } catch (err) {
            console.error('Camera error:', err);
            loading.style.display = 'none';
            error.style.display = 'flex';
        }
    }
    
    /**
     * Stop camera stream
     */
    stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
    }
    
    /**
     * Open camera for capture
     */
    async open(callback) {
        if (!this.isSupported()) {
            showError('Tu navegador no soporta acceso a la cámara');
            return false;
        }
        
        this.onCapture = callback;
        this.createUI();
        
        this.container.classList.add('visible');
        this.isActive = true;
        document.body.classList.add('camera-open');
        
        await this.startStream();
        
        return true;
    }
    
    /**
     * Close camera
     */
    close() {
        this.stopStream();
        this.isActive = false;
        
        if (this.container) {
            this.container.classList.remove('visible');
        }
        
        document.body.classList.remove('camera-open');
        this.onCapture = null;
    }
    
    /**
     * Switch between front and back camera
     */
    async switchCamera() {
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        await this.startStream();
    }
    
    /**
     * Capture photo from video
     */
    async capture() {
        if (!this.videoElement || !this.canvasElement) return;
        
        const video = this.videoElement;
        const canvas = this.canvasElement;
        
        // Set canvas size to video dimensions
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Convert to blob
        canvas.toBlob(async (blob) => {
            if (blob && this.onCapture) {
                // Create File object
                const timestamp = Date.now();
                const file = new File([blob], `capture_${timestamp}.jpg`, { type: 'image/jpeg' });
                
                this.onCapture(file);
                this.close();
            }
        }, 'image/jpeg', CONFIG.IMAGES.QUALITY);
    }
}

/**
 * Image Picker - handles file selection and clipboard paste
 */
class ImagePicker {
    constructor() {
        this.input = null;
        this.camera = new CameraCapture();
    }
    
    /**
     * Create hidden file input
     */
    createInput(accept = 'image/*', multiple = true) {
        if (this.input) {
            this.input.remove();
        }
        
        this.input = document.createElement('input');
        this.input.type = 'file';
        this.input.accept = accept;
        this.input.multiple = multiple;
        this.input.style.display = 'none';
        document.body.appendChild(this.input);
        
        return this.input;
    }
    
    /**
     * Pick files from file system
     */
    pickFiles(options = {}) {
        return new Promise((resolve) => {
            const {
                accept = 'image/*',
                multiple = true
            } = options;
            
            const input = this.createInput(accept, multiple);
            
            input.onchange = () => {
                const files = Array.from(input.files || []);
                input.remove();
                resolve(files);
            };
            
            // Handle cancel
            input.oncancel = () => {
                input.remove();
                resolve([]);
            };
            
            // Fallback for browsers without oncancel
            window.addEventListener('focus', function handler() {
                setTimeout(() => {
                    if (input.files?.length === 0) {
                        input.remove();
                        resolve([]);
                    }
                    window.removeEventListener('focus', handler);
                }, 300);
            }, { once: true });
            
            input.click();
        });
    }
    
    /**
     * Capture from camera
     */
    captureFromCamera() {
        return new Promise((resolve) => {
            this.camera.open((file) => {
                resolve(file ? [file] : []);
            });
        });
    }
    
    /**
     * Get image from clipboard
     */
    async getFromClipboard() {
        try {
            const items = await navigator.clipboard.read();
            const files = [];
            
            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        const timestamp = Date.now();
                        const extension = type.split('/')[1] || 'png';
                        const file = new File([blob], `pasted_${timestamp}.${extension}`, { type });
                        files.push(file);
                    }
                }
            }
            
            return files;
        } catch (err) {
            // Clipboard API may not be available or permission denied
            console.log('Clipboard access:', err.message);
            return [];
        }
    }
    
    /**
     * Setup paste listener on an element
     */
    setupPasteListener(element, callback) {
        element.addEventListener('paste', async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            
            const files = [];
            
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) {
                        const timestamp = Date.now();
                        const extension = item.type.split('/')[1] || 'png';
                        const file = new File([blob], `pasted_${timestamp}.${extension}`, { type: item.type });
                        files.push(file);
                    }
                }
            }
            
            if (files.length > 0) {
                e.preventDefault();
                callback(files);
            }
        });
    }
    
    /**
     * Setup drag and drop on an element
     */
    setupDragDrop(element, callback, options = {}) {
        const { 
            acceptTypes = CONFIG.IMAGES.ALLOWED_TYPES,
            hoverClass = 'drag-over'
        } = options;
        
        element.addEventListener('dragenter', (e) => {
            e.preventDefault();
            element.classList.add(hoverClass);
        });
        
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            element.classList.add(hoverClass);
        });
        
        element.addEventListener('dragleave', (e) => {
            e.preventDefault();
            // Only remove class if leaving the element (not entering a child)
            if (!element.contains(e.relatedTarget)) {
                element.classList.remove(hoverClass);
            }
        });
        
        element.addEventListener('drop', (e) => {
            e.preventDefault();
            element.classList.remove(hoverClass);
            
            const files = [];
            const items = e.dataTransfer?.items;
            
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.kind === 'file') {
                        const file = item.getAsFile();
                        if (file && acceptTypes.includes(file.type)) {
                            files.push(file);
                        }
                    }
                }
            } else {
                // Fallback for older browsers
                const dtFiles = e.dataTransfer?.files;
                if (dtFiles) {
                    for (let i = 0; i < dtFiles.length; i++) {
                        if (acceptTypes.includes(dtFiles[i].type)) {
                            files.push(dtFiles[i]);
                        }
                    }
                }
            }
            
            if (files.length > 0) {
                callback(files);
            }
        });
    }
}

/**
 * Image Preview Component
 */
export function createImagePreview(file, options = {}) {
    return new Promise((resolve) => {
        const {
            maxWidth = 200,
            maxHeight = 200,
            className = 'image-preview'
        } = options;
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const container = document.createElement('div');
            container.className = className;
            
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.maxWidth = `${maxWidth}px`;
            img.style.maxHeight = `${maxHeight}px`;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'preview-remove';
            removeBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            `;
            
            const info = document.createElement('div');
            info.className = 'preview-info';
            info.textContent = file.name;
            
            container.appendChild(img);
            container.appendChild(removeBtn);
            container.appendChild(info);
            
            resolve({
                element: container,
                file,
                remove: () => container.remove()
            });
        };
        
        reader.readAsDataURL(file);
    });
}

// Create singleton instances
const camera = new CameraCapture();
const imagePicker = new ImagePicker();

// Export
export { camera, imagePicker, CameraCapture, ImagePicker };
export const openCamera = (callback) => camera.open(callback);
export const closeCamera = () => camera.close();
export const pickImages = (options) => imagePicker.pickFiles(options);
export const capturePhoto = () => imagePicker.captureFromCamera();
export const getClipboardImage = () => imagePicker.getFromClipboard();
export const setupPaste = (element, callback) => imagePicker.setupPasteListener(element, callback);
export const setupDragDrop = (element, callback, options) => imagePicker.setupDragDrop(element, callback, options);

/**
 * FIXORA - Login Page
 * Handles user authentication
 */

import { signIn, getSession, redirectByRole } from '../services/authService.js';
import { validateLoginForm, showValidationErrors, clearValidationErrors } from '../utils/validators.js';
import toast from '../utils/toast.js';
import { $, showLoading, hideLoading, storage } from '../utils/helpers.js';

// Elements
const form = $('#login-form');
const emailInput = $('#email');
const passwordInput = $('#password');
const rememberCheckbox = $('#remember');
const submitBtn = $('#submit-btn');
const togglePasswordBtn = $('#toggle-password');

/**
 * Initialize login page
 */
async function init() {
    // Check if already logged in
    try {
        const session = await getSession();
        if (session) {
            // User is already logged in, redirect based on role
            await redirectByRole();
            return;
        }
    } catch (error) {
        // No session, continue with login page
    }
    
    // Restore remembered email
    const rememberedEmail = storage.get('remembered_email');
    if (rememberedEmail) {
        emailInput.value = rememberedEmail;
        rememberCheckbox.checked = true;
    }
    
    // Setup event listeners
    setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Form submission
    form.addEventListener('submit', handleSubmit);
    
    // Toggle password visibility
    togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
    
    // Clear errors on input
    emailInput.addEventListener('input', () => {
        clearFieldError(emailInput);
    });
    
    passwordInput.addEventListener('input', () => {
        clearFieldError(passwordInput);
    });
    
    // Enter key on password field
    passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            form.requestSubmit();
        }
    });
}

/**
 * Handle form submission
 */
async function handleSubmit(e) {
    e.preventDefault();
    
    // Get form data
    const formData = {
        email: emailInput.value.trim(),
        password: passwordInput.value
    };
    
    // Validate
    const validation = validateLoginForm(formData);
    if (validation.hasErrors()) {
        showValidationErrors(form, validation);
        // Focus first error field
        const firstErrorField = form.querySelector('.has-error input');
        if (firstErrorField) firstErrorField.focus();
        return;
    }
    
    // Clear previous errors
    clearValidationErrors(form);
    
    // Show loading state
    showLoading(submitBtn, { text: 'Iniciando...' });
    
    try {
        // Attempt login
        const { session, profile } = await signIn(formData.email, formData.password);
        
        // Handle remember me
        if (rememberCheckbox.checked) {
            storage.set('remembered_email', formData.email);
        } else {
            storage.remove('remembered_email');
        }
        
        // Success message
        toast.success(`Bienvenido${profile?.full_name ? ', ' + profile.full_name : ''}`);
        
        // Small delay for toast visibility
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Redirect based on role
        await redirectByRole();
        
    } catch (error) {
        console.error('Login error:', error);
        
        // Handle specific errors
        let errorMessage = 'Error al iniciar sesión';
        
        if (error.message.includes('Invalid login credentials')) {
            errorMessage = 'Credenciales incorrectas. Verifica tu email y contraseña.';
        } else if (error.message.includes('Email not confirmed')) {
            errorMessage = 'Tu cuenta no ha sido verificada. Revisa tu correo.';
        } else if (error.message.includes('Too many requests')) {
            errorMessage = 'Demasiados intentos. Por favor espera un momento.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            errorMessage = 'Error de conexión. Verifica tu internet.';
        }
        
        toast.error(errorMessage);
        
        // Focus email field
        emailInput.focus();
        emailInput.select();
    } finally {
        hideLoading(submitBtn);
    }
}

/**
 * Toggle password visibility
 */
function togglePasswordVisibility() {
    const isPassword = passwordInput.type === 'password';
    
    passwordInput.type = isPassword ? 'text' : 'password';
    
    const iconShow = togglePasswordBtn.querySelector('.icon-show');
    const iconHide = togglePasswordBtn.querySelector('.icon-hide');
    
    iconShow.style.display = isPassword ? 'none' : 'block';
    iconHide.style.display = isPassword ? 'block' : 'none';
    
    // Focus password field
    passwordInput.focus();
}

/**
 * Clear error for specific field
 */
function clearFieldError(input) {
    const group = input.closest('.form-group');
    if (group) {
        group.classList.remove('has-error');
        const error = group.querySelector('.form-error');
        if (error) error.remove();
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

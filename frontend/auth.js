// auth.js - Enhanced Authentication Logic with Integration

const API_BASE_URL = 'http://localhost:8000';

// Check if user is already logged in
window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token && (window.location.pathname.includes('index.html') || window.location.pathname.includes('register.html'))) {
        // User is logged in, redirect to dashboard
        window.location.href = 'home.html';
    }
});

// Handle login form
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        try {
            showLoader();
            
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Store authentication data
                localStorage.setItem('token', data.token);
                localStorage.setItem('userId', data.user_id);
                localStorage.setItem('userName', data.name);
                
                // Redirect to dashboard
                window.location.href = 'home.html';
            } else {
                hideLoader();
                showError(data.detail || 'Invalid email or password');
            }
        } catch (error) {
            hideLoader();
            showError('Connection error. Please check if the server is running.');
            console.error('Login error:', error);
        }
    });
}

// Handle registration form
if (document.getElementById('registerForm')) {
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Client-side validation
        if (!validateEmail(email)) {
            showError('Please enter a valid email address');
            return;
        }
        
        if (password.length < 6) {
            showError('Password must be at least 6 characters long');
            return;
        }
        
        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }
        
        try {
            showLoader();
            
            const response = await fetch(`${API_BASE_URL}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, email, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                hideLoader();
                showSuccess('Registration successful! Redirecting to login...');
                
                // Auto-redirect to login after 2 seconds
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                hideLoader();
                showError(data.detail || 'Registration failed');
            }
        } catch (error) {
            hideLoader();
            showError('Connection error. Please check if the server is running.');
            console.error('Registration error:', error);
        }
    });
}

// Utility functions
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    errorDiv.classList.add('error-message');
    
    // Hide after 5 seconds
    setTimeout(() => {
        errorDiv.classList.add('hidden');
    }, 5000);
}

function showSuccess(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden', 'error-message');
    errorDiv.classList.add('success-message');
}

function showLoader() {
    // Create a simple loading indicator
    const button = document.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Please wait...';
}

function hideLoader() {
    const button = document.querySelector('button[type="submit"]');
    button.disabled = false;
    button.textContent = button.textContent.includes('Login') ? 'Login' : 'Create Account';
}

// Auto-logout on token expiry
function checkTokenExpiry() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            // Decode JWT token to check expiry
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expiry = payload.exp * 1000; // Convert to milliseconds
            
            if (Date.now() >= expiry) {
                // Token expired, logout
                localStorage.clear();
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('Token validation error:', error);
        }
    }
}

// Check token expiry every minute
setInterval(checkTokenExpiry, 60000);

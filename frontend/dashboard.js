// dashboard.js - Enhanced Dashboard with Smart Integration

const API_BASE_URL = 'http://localhost:8000';
let currentInventory = [];
let autoRefreshInterval;

// Initialize dashboard on page load
window.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadUserInfo();
    loadInventory();
    setTodayDate();
    startAutoRefresh();
    initializeEventListeners();
});

// Authentication check with redirect
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }
    
    // Verify token is still valid
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiry = payload.exp * 1000;
        
        if (Date.now() >= expiry) {
            localStorage.clear();
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Token validation error:', error);
        localStorage.clear();
        window.location.href = 'index.html';
    }
}

// Load and display user information
function loadUserInfo() {
    const userName = localStorage.getItem('userName');
    document.getElementById('userName').textContent = userName || 'User';
}

// Logout with cleanup
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.clear();
        clearInterval(autoRefreshInterval);
        window.location.href = 'index.html';
    }
}

// Load inventory with smart sorting
async function loadInventory() {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_BASE_URL}/inventory/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentInventory = data.items;
            
            // Smart sorting: expired first, then by days remaining
            currentInventory.sort((a, b) => {
                const daysA = calculateDaysRemaining(a.expiry_date);
                const daysB = calculateDaysRemaining(b.expiry_date);
                
                // Expired items first
                if (daysA <= 0 && daysB > 0) return -1;
                if (daysA > 0 && daysB <= 0) return 1;
                
                // Then by days remaining (ascending)
                return daysA - daysB;
            });
            
            displayItems(currentInventory);
            updateSummary(currentInventory);
        } else if (response.status === 401) {
            // Unauthorized, redirect to login
            localStorage.clear();
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Error loading inventory:', error);
        showNotification('Failed to load inventory. Please refresh the page.', 'error');
    }
}

// Display items with animation
function displayItems(items) {
    const itemsList = document.getElementById('itemsList');
    
    if (items.length === 0) {
        itemsList.innerHTML = `
            <div class="empty-state">
                <p>No items in inventory</p>
                <button class="btn-add" onclick="openAddItemModal()">Add Your First Item</button>
            </div>
        `;
        return;
    }
    
    // Clear and rebuild with fade effect
    itemsList.style.opacity = '0';
    setTimeout(() => {
        itemsList.innerHTML = '';
        items.forEach((item, index) => {
            const itemCard = createItemCard(item);
            itemCard.style.animationDelay = `${index * 0.05}s`;
            itemsList.appendChild(itemCard);
        });
        itemsList.style.opacity = '1';
    }, 200);
}

// Create enhanced item card
function createItemCard(item) {
    const daysRemaining = calculateDaysRemaining(item.expiry_date);
    const status = getItemStatus(daysRemaining);
    
    const card = document.createElement('div');
    card.className = `item-card ${status} fade-in`;
    card.id = `item-card-${item.id}`;
    
    card.innerHTML = `
        <div class="item-info">
            <div class="item-header">
                <span class="item-name">${escapeHtml(item.name)}</span>
                <span class="item-quantity">Qty: ${item.quantity}</span>
            </div>
            <div class="item-details">
                <span class="item-category">${item.category}</span>
                <span>Purchased: ${formatDate(item.purchase_date)}</span>
                <span>Expires: ${formatDate(item.expiry_date)}</span>
            </div>
        </div>
        <div class="item-status">
            <div class="days-remaining">${getDaysDisplay(daysRemaining)}</div>
            <div class="days-label">${getDaysLabel(daysRemaining)}</div>
        </div>
        <div class="item-checkbox">
            <input type="checkbox" 
                   id="checkbox-${item.id}" 
                   onchange="markConsumed(${item.id}, this)"
                   ${item.consumed ? 'checked' : ''}>
            <label for="checkbox-${item.id}">Consumed</label>
        </div>
    `;
    
    // Add warning for expiring items
    if (daysRemaining <= 3 && daysRemaining > 0) {
        card.classList.add('pulse');
    }
    
    return card;
}

// Smart item consumption with optimistic UI update
async function markConsumed(itemId, checkbox) {
    const token = localStorage.getItem('token');
    const itemCard = document.getElementById(`item-card-${itemId}`);
    
    // Optimistic UI update
    itemCard.style.opacity = '0.5';
    itemCard.style.transform = 'scale(0.95)';
    
    try {
        const response = await fetch(`${API_BASE_URL}/inventory/${itemId}/consume`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            // Animate removal
            itemCard.style.transition = 'all 0.5s ease-out';
            itemCard.style.opacity = '0';
            itemCard.style.transform = 'translateX(-100%)';
            
            setTimeout(() => {
                // Remove from current inventory
                currentInventory = currentInventory.filter(item => item.id !== itemId);
                
                // Update display
                displayItems(currentInventory);
                updateSummary(currentInventory);
                
                showNotification('Item marked as consumed', 'success');
            }, 500);
        } else {
            // Revert on error
            checkbox.checked = false;
            itemCard.style.opacity = '1';
            itemCard.style.transform = 'scale(1)';
            showNotification('Failed to update item', 'error');
        }
    } catch (error) {
        // Revert on error
        checkbox.checked = false;
        itemCard.style.opacity = '1';
        itemCard.style.transform = 'scale(1)';
        console.error('Error marking item as consumed:', error);
        showNotification('Connection error', 'error');
    }
}

// Real-time summary update with animation
function updateSummary(items) {
    let fresh = 0;
    let expiring = 0;
    let expired = 0;
    
    items.forEach(item => {
        const days = calculateDaysRemaining(item.expiry_date);
        if (days <= 0) expired++;
        else if (days <= 3) expiring++;
        else fresh++;
    });
    
    // Animate number changes
    animateNumber('freshCount', fresh);
    animateNumber('expiringCount', expiring);
    animateNumber('expiredCount', expired);
}

// Number animation helper
function animateNumber(elementId, newValue) {
    const element = document.getElementById(elementId);
    const oldValue = parseInt(element.textContent) || 0;
    const duration = 500;
    const startTime = Date.now();
    
    const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const current = Math.floor(oldValue + (newValue - oldValue) * progress);
        element.textContent = current;
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    };
    
    animate();
}

// Enhanced add item functionality
async function addItem(event) {
    event.preventDefault();
    
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('token');
    
    const itemData = {
        name: document.getElementById('itemName').value.trim(),
        quantity: parseInt(document.getElementById('itemQuantity').value),
        category: document.getElementById('itemCategory').value,
        purchase_date: document.getElementById('purchaseDate').value
    };
    
    // Validation
    if (!itemData.name || !itemData.category) {
        showNotification('Please fill all required fields', 'error');
        return;
    }
    
    try {
        showButtonLoader('addItemBtn', 'Adding...');
        
        const response = await fetch(`${API_BASE_URL}/inventory/${userId}/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(itemData)
        });
        
        if (response.ok) {
            const newItem = await response.json();
            
            // Add to current inventory
            currentInventory.push(newItem);
            
            // Close modal
            closeAddItemModal();
            
            // Reload inventory to show new item
            await loadInventory();
            
            showNotification(`${itemData.name} added successfully!`, 'success');
            
            // Check if item is expiring soon
            const daysRemaining = calculateDaysRemaining(newItem.expiry_date);
            if (daysRemaining <= 3) {
                showNotification(`Warning: ${itemData.name} expires in ${daysRemaining} days!`, 'warning');
            }
        } else {
            const error = await response.json();
            showNotification(error.detail || 'Failed to add item', 'error');
        }
    } catch (error) {
        console.error('Error adding item:', error);
        showNotification('Connection error', 'error');
    } finally {
        hideButtonLoader('addItemBtn', 'Add Item');
    }
}

// Utility functions
function calculateDaysRemaining(expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const diffTime = expiry - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getItemStatus(days) {
    if (days <= 0) return 'expired';
    if (days <= 3) return 'expiring';
    return 'fresh';
}

function getDaysDisplay(days) {
    if (days < 0) return 'Expired';
    if (days === 0) return 'Today';
    return days;
}

function getDaysLabel(days) {
    if (days < 0) return `${Math.abs(days)} days ago`;
    if (days === 0) return 'Expires today';
    if (days === 1) return 'day left';
    return 'days left';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Modal functions
function openAddItemModal() {
    document.getElementById('addItemModal').classList.remove('hidden');
    document.getElementById('itemName').focus();
}

function closeAddItemModal() {
    document.getElementById('addItemModal').classList.add('hidden');
    document.getElementById('addItemForm').reset();
    setTodayDate();
}

function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('purchaseDate').value = today;
    document.getElementById('purchaseDate').max = today;
}

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Auto remove
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Button loader
function showButtonLoader(buttonId, text) {
    const button = document.getElementById(buttonId);
    button.disabled = true;
    button.textContent = text;
}

function hideButtonLoader(buttonId, text) {
    const button = document.getElementById(buttonId);
    button.disabled = false;
    button.textContent = text;
}

// Auto-refresh functionality
function startAutoRefresh() {
    // Refresh inventory every 30 seconds
    autoRefreshInterval = setInterval(() => {
        loadInventory();
    }, 30000);
}

// Initialize event listeners
function initializeEventListeners() {
    // Add item form
    const addItemForm = document.getElementById('addItemForm');
    if (addItemForm) {
        addItemForm.addEventListener('submit', addItem);
    }
    
    // Modal close on outside click
    window.onclick = function(event) {
        const modal = document.getElementById('addItemModal');
        if (event.target === modal) {
            closeAddItemModal();
        }
    };
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + A to add item
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            openAddItemModal();
        }
        
        // Escape to close modal
        if (e.key === 'Escape') {
            closeAddItemModal();
        }
    });
}

// Handle visibility change for auto-refresh
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        clearInterval(autoRefreshInterval);
    } else {
        startAutoRefresh();
        loadInventory(); // Immediate refresh when page becomes visible
    }
});

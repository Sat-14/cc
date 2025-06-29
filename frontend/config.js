// config.js - Centralized Configuration

// API Configuration
const API_CONFIG = {
    BASE_URL: 'http://localhost:8000',
    TIMEOUT: 10000, // 10 seconds
    RETRY_ATTEMPTS: 3
};

// Auto-refresh Configuration
const REFRESH_CONFIG = {
    INVENTORY_INTERVAL: 30000, // 30 seconds
    TOKEN_CHECK_INTERVAL: 60000, // 1 minute
    NOTIFICATION_DURATION: 3000 // 3 seconds
};

// Expiry Thresholds
const EXPIRY_CONFIG = {
    EXPIRING_SOON_DAYS: 3,
    WARNING_DAYS: 7
};

// UI Configuration
const UI_CONFIG = {
    ANIMATION_DURATION: 300,
    DEBOUNCE_DELAY: 500,
    MAX_ITEM_NAME_LENGTH: 50
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        API_CONFIG,
        REFRESH_CONFIG,
        EXPIRY_CONFIG,
        UI_CONFIG
    };
}
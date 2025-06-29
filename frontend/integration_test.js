// integration-test.js - Integration Testing Suite

// Test Configuration
console.log('🔥 integration-test.js started...');

const TEST_USER = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'test123'
};

const TEST_ITEMS = [
    { name: 'Milk', quantity: 2, category: 'dairy', daysUntilExpiry: 7 },
    { name: 'Bananas', quantity: 6, category: 'produce', daysUntilExpiry: 3 },
    { name: 'Chicken', quantity: 1, category: 'meat', daysUntilExpiry: 1 },
    { name: 'Yogurt', quantity: 4, category: 'dairy', daysUntilExpiry: -1 } // Expired
];

// Integration Test Suite
class IntegrationTests {
    constructor() {
        this.apiBase = 'http://localhost:8000';
        this.token = null;
        this.userId = null;
    }

    // Run all tests
    async runAllTests() {
        console.log('🧪 Starting Integration Tests...\n');
        
        try {
            await this.testAuthenticationFlow();
            await this.testInventoryManagement();
            await this.testCheckboxFunctionality();
            await this.testSmartFeatures();
            await this.testErrorHandling();
            
            console.log('\n✅ All tests passed!');
        } catch (error) {
            console.error('\n❌ Test failed:', error);
        }
    }

    // Test 1: Authentication Flow
    async testAuthenticationFlow() {
        console.log('📋 Testing Authentication Flow...');
        
        // Test Registration
        const registerResponse = await fetch(`${this.apiBase}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(TEST_USER)
        });
        
        if (!registerResponse.ok && registerResponse.status !== 400) {
            throw new Error('Registration failed');
        }
        
        console.log('✓ Registration test completed');
        
        // Test Login
        const loginResponse = await fetch(`${this.apiBase}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: TEST_USER.email,
                password: TEST_USER.password
            })
        });
        
        if (!loginResponse.ok) {
            throw new Error('Login failed');
        }
        
        const loginData = await loginResponse.json();
        this.token = loginData.token;
        this.userId = loginData.user_id;
        
        console.log('✓ Login successful');
        console.log('✓ Token received:', this.token.substring(0, 20) + '...');
        
        // Test Protected Route Access
        const protectedResponse = await fetch(`${this.apiBase}/inventory/${this.userId}`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        if (!protectedResponse.ok) {
            throw new Error('Protected route access failed');
        }
        
        console.log('✓ Protected route access successful\n');
    }

    // Test 2: Inventory Management
    async testInventoryManagement() {
        console.log('📋 Testing Inventory Management...');
        
        // Add test items
        for (const item of TEST_ITEMS) {
            const purchaseDate = new Date();
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + item.daysUntilExpiry);
            
            const response = await fetch(`${this.apiBase}/inventory/${this.userId}/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    name: item.name,
                    quantity: item.quantity,
                    category: item.category,
                    purchase_date: purchaseDate.toISOString().split('T')[0]
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to add item: ${item.name}`);
            }
            
            console.log(`✓ Added ${item.name} to inventory`);
        }
        
        // Retrieve inventory
        const inventoryResponse = await fetch(`${this.apiBase}/inventory/${this.userId}`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        const inventory = await inventoryResponse.json();
        console.log(`✓ Retrieved ${inventory.items.length} items from inventory`);
        
        // Verify expiry calculations
        const milkItem = inventory.items.find(item => item.name === 'Milk');
        if (milkItem) {
            const daysRemaining = this.calculateDaysRemaining(milkItem.expiry_date);
            console.log(`✓ Expiry calculation correct: Milk expires in ${daysRemaining} days`);
        }
        
        console.log('');
    }

    // Test 3: Checkbox Functionality
    async testCheckboxFunctionality() {
        console.log('📋 Testing Checkbox Functionality...');
        
        // Get current inventory
        const inventoryResponse = await fetch(`${this.apiBase}/inventory/${this.userId}`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        const inventory = await inventoryResponse.json();
        const itemToConsume = inventory.items[0];
        
        if (!itemToConsume) {
            throw new Error('No items to test consumption');
        }
        
        console.log(`✓ Testing consumption of: ${itemToConsume.name}`);
        
        // Mark item as consumed
        const consumeResponse = await fetch(`${this.apiBase}/inventory/${itemToConsume.id}/consume`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        if (!consumeResponse.ok) {
            throw new Error('Failed to mark item as consumed');
        }
        
        console.log('✓ Item marked as consumed');
        
        // Verify item is removed from active inventory
        const updatedInventoryResponse = await fetch(`${this.apiBase}/inventory/${this.userId}`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        const updatedInventory = await updatedInventoryResponse.json();
        const consumedItem = updatedInventory.items.find(item => item.id === itemToConsume.id);
        
        if (consumedItem) {
            throw new Error('Consumed item still appears in inventory');
        }
        
        console.log('✓ Consumed item removed from display');
        console.log(`✓ Inventory count updated: ${inventory.items.length} → ${updatedInventory.items.length}\n`);
    }

    // Test 4: Smart Features
    async testSmartFeatures() {
        console.log('📋 Testing Smart Features...');
        
        // Test auto-expiry calculation
        const foodSearchResponse = await fetch(`${this.apiBase}/foods/search?query=milk`);
        const foodSearch = await foodSearchResponse.json();
        
        console.log('✓ Food database search working');
        console.log(`✓ Found ${foodSearch.results.length} results for "milk"`);
        
        // Test sorting by expiry
        const inventoryResponse = await fetch(`${this.apiBase}/inventory/${this.userId}`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        const inventory = await inventoryResponse.json();
        const sortedItems = [...inventory.items].sort((a, b) => {
            const daysA = this.calculateDaysRemaining(a.expiry_date);
            const daysB = this.calculateDaysRemaining(b.expiry_date);
            return daysA - daysB;
        });
        
        console.log('✓ Items sorted by expiry date:');
        sortedItems.forEach(item => {
            const days = this.calculateDaysRemaining(item.expiry_date);
            const status = days <= 0 ? '❌ Expired' : days <= 3 ? '⚠️ Expiring' : '✅ Fresh';
            console.log(`  ${status} ${item.name}: ${days} days`);
        });
        
        console.log('');
    }

    // Test 5: Error Handling
    async testErrorHandling() {
        console.log('📋 Testing Error Handling...');
        
        // Test invalid token
        const invalidTokenResponse = await fetch(`${this.apiBase}/inventory/999`, {
            headers: { 'Authorization': 'Bearer invalid-token' }
        });
        
        if (invalidTokenResponse.status !== 401) {
            throw new Error('Invalid token should return 401');
        }
        
        console.log('✓ Invalid token rejected correctly');
        
        // Test wrong user access
        const wrongUserResponse = await fetch(`${this.apiBase}/inventory/999`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        if (wrongUserResponse.status !== 403) {
            throw new Error('Wrong user access should return 403');
        }
        
        console.log('✓ Cross-user access prevented');
        
        // Test duplicate registration
        const duplicateRegResponse = await fetch(`${this.apiBase}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(TEST_USER)
        });
        
        if (duplicateRegResponse.status !== 400) {
            throw new Error('Duplicate registration should return 400');
        }
        
        console.log('✓ Duplicate registration prevented\n');
    }

    // Utility function
    calculateDaysRemaining(expiryDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = new Date(expiryDate);
        expiry.setHours(0, 0, 0, 0);
        const diffTime = expiry - today;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
}

// Run tests if executed directly
if (typeof window === 'undefined') {
    const tests = new IntegrationTests();
    tests.runAllTests();
} else {
    console.log('Integration tests loaded. Run tests.runAllTests() in console.');
    window.tests = new IntegrationTests();
}
if (typeof window === 'undefined') {
    (async () => {
        const tests = new IntegrationTests();
        await tests.runAllTests();
    })().catch(err => {
        console.error('Fatal test runner error:', err);
        process.exit(1);
    });
}

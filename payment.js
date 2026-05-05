// payment.js - Complete with PawaPay Deposit Integration

const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========================
// CONFIGURATION
// ========================
const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const MERCHANT_PHONE = process.env.MERCHANT_PHONE || '250795305882';
const MERCHANT_NAME = process.env.MERCHANT_NAME || 'NTWARI';

// PawaPay Configuration
const PAWAPAY_API_KEY = process.env.PAYMENT_API_KEY || process.env.API_KEY;
const PAWAPAY_DEPOSIT_URL = process.env.DEPOSIT_API_URL || 'https://api.pawapay.io/v2/deposits';
const PAWAPAY_PAYOUT_URL = process.env.PAYOUT_API_URL || 'https://api.pawapay.io/v1/payouts';
const BASE_URL = process.env.BASE_URL || 'https://your-app.onrender.com';

// ========================
// SERVE STATIC FILES
// ========================
app.use(express.static(path.join(__dirname, 'public')));

// ========================
// IN-MEMORY DATABASE (Fallback)
// ========================
const memoryDB = {
    users: {},
    paymentRequests: {},
    withdrawals: {},
    contacts: {}
};

// Helper functions
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function generateReferralCode(name) {
    const base = name ? name.replace(/\s+/g, '').toUpperCase().substring(0, 4) : 'USER';
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${base}${random}`;
}

// Format phone number for PawaPay (remove + and ensure 250 prefix)
function formatPhoneForPawaPay(phone) {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    // Ensure it starts with 250
    if (cleaned.startsWith('250')) {
        return cleaned;
    }
    if (cleaned.startsWith('0')) {
        return '250' + cleaned.substring(1);
    }
    return '250' + cleaned;
}

// ========================
// HEALTH CHECK
// ========================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: Date.now(),
        pawapayConfigured: !!PAWAPAY_API_KEY,
        message: 'Server is running'
    });
});

// ========================
// USER REGISTRATION
// ========================
app.post('/api/users/register', async (req, res) => {
    console.log('📝 Register endpoint called:', req.body);
    
    try {
        const { fullName, phone, email, password } = req.body;

        if (!fullName || !phone || !password) {
            return res.status(400).json({ error: 'fullName, phone, and password required' });
        }

        // Check if user exists
        let existingUser = null;
        for (const [id, user] of Object.entries(memoryDB.users)) {
            if (user.phone === phone) {
                existingUser = { user, id };
                break;
            }
        }

        if (existingUser) {
            return res.status(409).json({ error: 'Phone number already exists' });
        }

        const userId = generateId('USER');

        const user = {
            fullName,
            phone,
            email: email || null,
            password: password,
            status: 'pending',
            earnings: 0,
            totalAllTimeEarnings: 0,
            referrals: {},
            joinDate: new Date().toISOString(),
            createdAt: Date.now()
        };

        memoryDB.users[userId] = user;

        console.log('✅ User registered:', { userId, fullName, phone });

        res.status(201).json({ 
            success: true, 
            userId, 
            fullName: user.fullName,
            phone: user.phone,
            status: user.status,
            joinDate: user.joinDate,
            earnings: user.earnings,
            totalAllTimeEarnings: user.totalAllTimeEarnings
        });

    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// USER LOGIN
// ========================
app.post('/api/users/login', async (req, res) => {
    console.log('🔐 Login endpoint called:', req.body.phone);
    
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ error: 'Phone and password required' });
        }

        let foundUser = null;
        let userId = null;
        
        for (const [id, user] of Object.entries(memoryDB.users)) {
            if (user.phone === phone) {
                foundUser = user;
                userId = id;
                break;
            }
        }

        if (!foundUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (foundUser.password !== password) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        const { password: _, ...userWithoutPassword } = foundUser;
        
        res.json({ 
            success: true, 
            userId,
            user: userWithoutPassword 
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// PAYMENT REQUEST - PawaPay Integration
// ========================
app.post('/api/payments/request', async (req, res) => {
    console.log('💰 Payment request endpoint called!');
    console.log('Request body:', req.body);
    
    try {
        const { userId, phone, amount = 1500 } = req.body;
        
        if (!userId || !phone) {
            return res.status(400).json({ error: 'userId and phone required' });
        }
        
        // Find user
        let user = null;
        let foundUserId = null;
        
        if (memoryDB.users[userId]) {
            user = memoryDB.users[userId];
            foundUserId = userId;
        } else {
            for (const [id, u] of Object.entries(memoryDB.users)) {
                if (u.phone === phone) {
                    user = u;
                    foundUserId = id;
                    break;
                }
            }
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // If already approved
        if (user.status === 'approved' && user.referralCode) {
            return res.json({ 
                success: true, 
                alreadyApproved: true,
                referralCode: user.referralCode 
            });
        }
        
        // Check for existing pending payment
        let existingRequest = null;
        let existingRequestId = null;
        
        for (const [id, req] of Object.entries(memoryDB.paymentRequests)) {
            if (req.userId === foundUserId && req.status === 'PENDING') {
                existingRequest = req;
                existingRequestId = id;
                break;
            }
        }
        
        if (existingRequest) {
            return res.json({
                success: true,
                paymentRef: existingRequestId,
                manualPayment: !existingRequest.pawaPayInitiated,
                merchantPhone: MERCHANT_PHONE,
                merchantName: MERCHANT_NAME,
                amount: amount,
                message: existingRequest.pawaPayInitiated 
                    ? "Payment initiated. Complete on your phone."
                    : `Send ${amount} RWF to ${MERCHANT_PHONE} (${MERCHANT_NAME}) with ref: ${existingRequestId}`
            });
        }
        
        // Generate payment reference
        const paymentRef = generateId('PAY');
        console.log('📝 Creating new payment request:', paymentRef);
        
        // Try PawaPay deposit
        let pawaPaySuccess = false;
        let pawaPayResponse = null;
        let paymentUrl = null;
        
        if (PAWAPAY_API_KEY && PAWAPAY_API_KEY !== 'your_api_key_here') {
            try {
                const formattedPhone = formatPhoneForPawaPay(phone);
                const depositId = crypto.randomUUID(); // Generate UUID for PawaPay
                
                const depositPayload = {
                    depositId: depositId,
                    amount: String(amount),
                    currency: "RWF",
                    payer: {
                        type: "MMO",
                        accountDetails: {
                            phoneNumber: formattedPhone,
                            provider: "MTN_MOMO_RWA"
                        }
                    }
                };
                
                console.log('📤 Initiating PawaPay deposit with payload:', depositPayload);
                
                const response = await axios.post(PAWAPAY_DEPOSIT_URL, depositPayload, {
                    headers: {
                        'Authorization': `Bearer ${PAWAPAY_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 15000
                });
                
                pawaPayResponse = response.data;
                console.log('✅ PawaPay response:', pawaPayResponse);
                
                // Check if deposit was initiated successfully
                if (pawaPayResponse && pawaPayResponse.status !== 'FAILED') {
                    pawaPaySuccess = true;
                    paymentUrl = pawaPayResponse.paymentUrl || pawaPayResponse.checkoutUrl || null;
                }
                
            } catch (pawaPayError) {
                console.error('❌ PawaPay deposit error:', pawaPayError.response?.data || pawaPayError.message);
                // Fall back to manual payment
            }
        } else {
            console.log('⚠️ PawaPay API key not configured, using manual payment');
        }
        
        // Store payment request
        memoryDB.paymentRequests[paymentRef] = {
            userId: foundUserId,
            phone: phone,
            amount: amount,
            status: 'PENDING',
            createdAt: Date.now(),
            merchantPhone: MERCHANT_PHONE,
            merchantName: MERCHANT_NAME,
            pawaPayInitiated: pawaPaySuccess,
            pawaPayResponse: pawaPayResponse,
            depositId: pawaPayResponse?.depositId || null
        };
        
        console.log('✅ Payment request stored:', { paymentRef, pawaPaySuccess });
        
        if (pawaPaySuccess && paymentUrl) {
            // Return automatic payment URL
            res.json({
                success: true,
                paymentRef,
                paymentUrl: paymentUrl,
                manualPayment: false,
                message: "Click the link to complete payment on your phone"
            });
        } else {
            // Return manual payment instructions
            res.json({
                success: true,
                paymentRef,
                manualPayment: true,
                merchantPhone: MERCHANT_PHONE,
                merchantName: MERCHANT_NAME,
                amount: amount,
                message: `Please send ${amount} RWF to ${MERCHANT_PHONE} (${MERCHANT_NAME}) via MTN MoMo or Airtel Money. Use reference: ${paymentRef}`
            });
        }
        
    } catch (err) {
        console.error('❌ Payment request error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// PawaPay Webhook for Deposit Callbacks
// ========================
app.post('/api/webhook/pawapay', async (req, res) => {
    console.log('📥 PawaPay webhook received:', JSON.stringify(req.body, null, 2));
    
    // Respond immediately to acknowledge receipt
    res.sendStatus(200);
    
    try {
        const { depositId, status, transactionId, amount, phoneNumber, reference } = req.body;
        
        if (!depositId) return;
        
        // Find payment request by depositId
        let foundPaymentRef = null;
        let foundPayment = null;
        
        for (const [ref, payment] of Object.entries(memoryDB.paymentRequests)) {
            if (payment.depositId === depositId || payment.paymentRef === depositId) {
                foundPaymentRef = ref;
                foundPayment = payment;
                break;
            }
        }
        
        if (foundPayment && (status === 'SUCCESS' || status === 'COMPLETED')) {
            // Get user
            const user = memoryDB.users[foundPayment.userId];
            
            if (user && user.status === 'pending') {
                const referralCode = generateReferralCode(user.fullName);
                
                // Update user to approved
                memoryDB.users[foundPayment.userId] = {
                    ...user,
                    status: 'approved',
                    referralCode: referralCode,
                    paymentVerified: true,
                    paymentAmount: foundPayment.amount,
                    paymentDate: Date.now(),
                    paymentTransactionId: transactionId
                };
                
                // Update payment request
                memoryDB.paymentRequests[foundPaymentRef] = {
                    ...foundPayment,
                    status: 'COMPLETED',
                    transactionId: transactionId,
                    completedAt: Date.now(),
                    webhookStatus: status
                };
                
                console.log(`✅ Auto-approved user: ${user.fullName} with code: ${referralCode}`);
            }
        } else if (foundPayment) {
            // Update payment request with status
            memoryDB.paymentRequests[foundPaymentRef] = {
                ...foundPayment,
                webhookStatus: status,
                lastWebhookAt: Date.now()
            };
        }
        
    } catch (err) {
        console.error('Webhook processing error:', err);
    }
});

// ========================
// CHECK PAYMENT STATUS
// ========================
app.get('/api/payments/status/:userId', async (req, res) => {
    console.log('🔍 Payment status check for userId:', req.params.userId);
    
    try {
        const { userId } = req.params;
        
        const user = memoryDB.users[userId];
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.status === 'approved' && user.referralCode) {
            return res.json({
                success: true,
                status: 'approved',
                referralCode: user.referralCode,
                user: user
            });
        }
        
        // Find payment request
        let paymentRequest = null;
        for (const [id, req] of Object.entries(memoryDB.paymentRequests)) {
            if (req.userId === userId) {
                paymentRequest = { id, ...req };
                break;
            }
        }
        
        res.json({
            success: true,
            status: user.status || 'pending',
            paymentRequest: paymentRequest
        });
        
    } catch (err) {
        console.error('Status check error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// GET USER BY PHONE
// ========================
app.get('/api/users/phone/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        
        let foundUser = null;
        let userId = null;
        
        for (const [id, user] of Object.entries(memoryDB.users)) {
            if (user.phone === phone) {
                foundUser = user;
                userId = id;
                break;
            }
        }
        
        if (!foundUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const { password, ...userWithoutPassword } = foundUser;
        
        res.json({
            success: true,
            userId,
            user: userWithoutPassword
        });
        
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// GET ALL USERS
// ========================
app.get('/api/users', async (req, res) => {
    try {
        const safeUsers = {};
        for (const [id, user] of Object.entries(memoryDB.users)) {
            const { password, ...safeUser } = user;
            safeUsers[id] = safeUser;
        }
        
        res.json({ success: true, users: safeUsers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// UPDATE USER
// ========================
app.post('/api/users/:userId/update', async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;
        
        if (memoryDB.users[userId]) {
            memoryDB.users[userId] = { ...memoryDB.users[userId], ...updates };
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// ADMIN LOGIN
// ========================
app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid admin password' });
    }
});

// ========================
// ADMIN VERIFY PAYMENT
// ========================
app.post('/api/admin/verify-payment', async (req, res) => {
    try {
        const { paymentRef, adminKey } = req.body;
        
        if (adminKey !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const payment = memoryDB.paymentRequests[paymentRef];
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment request not found' });
        }
        
        if (payment.status !== 'PENDING') {
            return res.status(400).json({ error: 'Payment already processed' });
        }
        
        const user = memoryDB.users[payment.userId];
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const referralCode = generateReferralCode(user.fullName);
        
        // Update user
        memoryDB.users[payment.userId] = {
            ...user,
            status: 'approved',
            referralCode: referralCode,
            paymentVerified: true,
            paymentAmount: payment.amount,
            paymentDate: Date.now()
        };
        
        // Update payment request
        memoryDB.paymentRequests[paymentRef] = {
            ...payment,
            status: 'COMPLETED',
            verifiedAt: Date.now(),
            verifiedBy: 'admin'
        };
        
        res.json({
            success: true,
            referralCode: referralCode
        });
        
    } catch (err) {
        console.error('Verify payment error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// WITHDRAWAL REQUESTS
// ========================
app.post('/api/withdrawals/request', async (req, res) => {
    try {
        const { userId, phone, amount, userName } = req.body;
        
        if (!userId || !phone || !amount) {
            return res.status(400).json({ error: 'userId, phone, and amount required' });
        }
        
        const withdrawalId = generateId('WITHDRAW');
        
        memoryDB.withdrawals[withdrawalId] = {
            userId,
            userPhone: phone,
            userName: userName || '',
            amount: Number(amount),
            status: 'pending',
            createdAt: Date.now()
        };
        
        // Update user's earnings
        if (memoryDB.users[userId]) {
            const newEarnings = Math.max(0, (memoryDB.users[userId].earnings || 0) - Number(amount));
            memoryDB.users[userId].earnings = newEarnings;
        }
        
        res.json({ success: true, withdrawalId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/withdrawals', async (req, res) => {
    res.json({ success: true, withdrawals: memoryDB.withdrawals });
});

app.post('/api/withdrawals/:id/update', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (memoryDB.withdrawals[id]) {
            memoryDB.withdrawals[id].status = status;
            memoryDB.withdrawals[id].processedAt = Date.now();
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// CONTACT MESSAGES
// ========================
app.post('/api/contacts', async (req, res) => {
    try {
        const { userPhone, userName, message } = req.body;
        
        const contactId = generateId('CONTACT');
        
        memoryDB.contacts[contactId] = {
            userPhone,
            userName,
            message,
            createdAt: Date.now(),
            status: 'unread'
        };
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// CATCH-ALL ROUTE
// ========================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================
// START SERVER
// ========================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║     🚀 REFERRAL PAYMENT SYSTEM WITH PAWAPAY INTEGRATION       ║
╠═══════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                       ║
║  Merchant: ${MERCHANT_PHONE} (${MERCHANT_NAME})                        ║
║  Admin Password: ${ADMIN_PASSWORD}                                   ║
║                                                                       ║
║  PawaPay Status: ${PAWAPAY_API_KEY ? '✅ Configured' : '❌ Not Configured'}                                      ║
║  Deposit URL: ${PAWAPAY_DEPOSIT_URL}                               ║
║                                                                       ║
║  Endpoints:                                                          ║
║  POST   /api/payments/request    - Request payment (PawaPay/Manual)  ║
║  GET    /api/payments/status/:id - Check payment status              ║
║  POST   /api/webhook/pawapay     - PawaPay webhook endpoint          ║
║  POST   /api/users/register      - Register user                     ║
║  POST   /api/users/login         - Login user                        ║
║  POST   /api/admin/login         - Admin login                       ║
╚═══════════════════════════════════════════════════════════════╝
    `);
});

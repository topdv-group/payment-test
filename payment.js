// payment.js - Complete Payment Integration System
// Frontend files are in /public folder

const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

// ========================
// 🔐 FIREBASE INIT
// ========================
let db = null;
let firebaseInitialized = false;

try {
    if (process.env.FIREBASE_KEY) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.DB_URL
        });
        
        db = admin.database();
        firebaseInitialized = true;
        console.log('✅ Firebase initialized successfully');
    } else {
        console.log('⚠️ FIREBASE_KEY not set, using memory storage fallback');
    }
} catch (err) {
    console.error('❌ Firebase init error:', err.message);
}

// ========================
// ⚙️ CONFIG from environment variables
// ========================
const PAYOUT_API_URL = process.env.PAYOUT_API_URL;
const DEPOSIT_API_URL = process.env.DEPOSIT_API_URL;
const PAYMENT_API_URL = process.env.PAYMENT_API_URL;
const API_KEY = process.env.PAYMENT_API_KEY || process.env.API_KEY;
const MERCHANT_PHONE = process.env.MERCHANT_PHONE || '250795305882';
const MERCHANT_NAME = process.env.MERCHANT_NAME || 'NTWARI';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const BASE_URL = process.env.BASE_URL || 'https://your-app.onrender.com';
const PORT = process.env.PORT || 8080;

// In-memory storage for when Firebase is not available
let memoryUsers = {};
let memoryPaymentRequests = {};
let memoryWithdrawals = {};
let memoryContacts = {};

// ========================
// 🌐 STATIC FILES - Serve from /public folder
// ========================
app.use(express.static(path.join(__dirname, 'public')));

// ========================
// 🔧 HELPERS
// ========================
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function generateReferralCode(name) {
    const base = name ? name.replace(/\s+/g, '').toUpperCase().substring(0, 4) : 'USER';
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${base}${random}`;
}

// Database helper functions
async function getUsers() {
    if (firebaseInitialized && db) {
        const snap = await db.ref('users').once('value');
        return snap.val() || {};
    }
    return memoryUsers;
}

async function getUserByPhone(phone) {
    if (firebaseInitialized && db) {
        const snap = await db.ref('users')
            .orderByChild('phone')
            .equalTo(phone)
            .once('value');
        if (snap.exists()) {
            let user = null;
            let userId = null;
            snap.forEach((s) => { user = s.val(); userId = s.key; });
            return { user, userId };
        }
        return null;
    }
    
    for (const [id, user] of Object.entries(memoryUsers)) {
        if (user.phone === phone) {
            return { user, userId: id };
        }
    }
    return null;
}

async function getUserByUserId(userId) {
    if (firebaseInitialized && db) {
        const snap = await db.ref(`users/${userId}`).once('value');
        if (snap.exists()) {
            return { user: snap.val(), userId };
        }
        return null;
    }
    
    if (memoryUsers[userId]) {
        return { user: memoryUsers[userId], userId };
    }
    return null;
}

async function saveUser(userId, userData) {
    if (firebaseInitialized && db) {
        await db.ref(`users/${userId}`).set(userData);
    } else {
        memoryUsers[userId] = userData;
    }
}

async function updateUser(userId, updates) {
    if (firebaseInitialized && db) {
        await db.ref(`users/${userId}`).update(updates);
    } else if (memoryUsers[userId]) {
        memoryUsers[userId] = { ...memoryUsers[userId], ...updates };
    }
}

async function getPaymentRequestByUserId(userId) {
    if (firebaseInitialized && db) {
        const snap = await db.ref('payment_requests')
            .orderByChild('userId')
            .equalTo(userId)
            .once('value');
        if (snap.exists()) {
            let request = null;
            let requestId = null;
            snap.forEach((s) => { request = s.val(); requestId = s.key; });
            return { request, requestId };
        }
        return null;
    }
    
    for (const [id, req] of Object.entries(memoryPaymentRequests)) {
        if (req.userId === userId) {
            return { request: req, requestId: id };
        }
    }
    return null;
}

async function getPaymentRequestByRef(paymentRef) {
    if (firebaseInitialized && db) {
        const snap = await db.ref(`payment_requests/${paymentRef}`).once('value');
        if (snap.exists()) {
            return { request: snap.val(), requestId: paymentRef };
        }
        return null;
    }
    
    if (memoryPaymentRequests[paymentRef]) {
        return { request: memoryPaymentRequests[paymentRef], requestId: paymentRef };
    }
    return null;
}

async function savePaymentRequest(requestId, data) {
    if (firebaseInitialized && db) {
        await db.ref(`payment_requests/${requestId}`).set(data);
    } else {
        memoryPaymentRequests[requestId] = data;
    }
}

async function updatePaymentRequest(requestId, updates) {
    if (firebaseInitialized && db) {
        await db.ref(`payment_requests/${requestId}`).update(updates);
    } else if (memoryPaymentRequests[requestId]) {
        memoryPaymentRequests[requestId] = { ...memoryPaymentRequests[requestId], ...updates };
    }
}

async function saveWithdrawal(withdrawalId, data) {
    if (firebaseInitialized && db) {
        await db.ref(`withdrawals/${withdrawalId}`).set(data);
    } else {
        memoryWithdrawals[withdrawalId] = data;
    }
}

async function getWithdrawals() {
    if (firebaseInitialized && db) {
        const snap = await db.ref('withdrawals').once('value');
        return snap.val() || {};
    }
    return memoryWithdrawals;
}

async function updateWithdrawal(withdrawalId, updates) {
    if (firebaseInitialized && db) {
        await db.ref(`withdrawals/${withdrawalId}`).update(updates);
    } else if (memoryWithdrawals[withdrawalId]) {
        memoryWithdrawals[withdrawalId] = { ...memoryWithdrawals[withdrawalId], ...updates };
    }
}

async function saveContact(contactId, data) {
    if (firebaseInitialized && db) {
        await db.ref(`contacts/${contactId}`).set(data);
    } else {
        memoryContacts[contactId] = data;
    }
}

// ========================
// 👤 USER REGISTRATION
// ========================
app.post('/api/users/register', async (req, res) => {
    try {
        const { fullName, phone, email, password } = req.body;

        if (!fullName || !phone || !password) {
            return res.status(400).json({ error: 'fullName, phone, and password required' });
        }

        // Check if user exists
        const existing = await getUserByPhone(phone);
        if (existing) {
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

        await saveUser(userId, user);

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
// 👤 USER LOGIN
// ========================
app.post('/api/users/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ error: 'Phone and password required' });
        }

        const existing = await getUserByPhone(phone);
        
        if (!existing) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { user, userId } = existing;

        if (user.password !== password) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        const { password: _, ...userWithoutPassword } = user;
        
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
// 💳 PAYMENT REQUEST - User pays to developer's MTN account
// ========================
app.post('/api/payments/request', async (req, res) => {
    try {
        const { userId, phone, amount = 1500 } = req.body;
        
        if (!userId || !phone) {
            return res.status(400).json({ error: 'userId and phone required' });
        }
        
        // Check if user exists
        const userResult = await getUserByUserId(userId);
        if (!userResult) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const { user, userId: foundUserId } = userResult;
        
        // If already approved, return referral code
        if (user.status === 'approved' && user.referralCode) {
            return res.json({ 
                success: true, 
                alreadyApproved: true,
                referralCode: user.referralCode 
            });
        }
        
        // Check if there's already a pending payment request
        const existingRequest = await getPaymentRequestByUserId(foundUserId);
        
        if (existingRequest && existingRequest.request.status === 'PENDING') {
            return res.json({
                success: true,
                paymentRef: existingRequest.requestId,
                manualPayment: true,
                merchantPhone: MERCHANT_PHONE,
                merchantName: MERCHANT_NAME,
                amount: amount,
                message: `Send ${amount} RWF to ${MERCHANT_PHONE} (${MERCHANT_NAME}) with ref: ${existingRequest.requestId}`
            });
        }
        
        // Generate payment reference
        const paymentRef = generateId('PAY');
        
        // Store payment request
        await savePaymentRequest(paymentRef, {
            userId: foundUserId,
            phone: phone,
            amount: amount,
            status: 'PENDING',
            createdAt: Date.now(),
            merchantPhone: MERCHANT_PHONE,
            merchantName: MERCHANT_NAME
        });
        
        // Try to initiate automatic deposit if API is configured
        let paymentInitiated = false;
        let paymentUrl = null;
        
        if (DEPOSIT_API_URL && API_KEY && API_KEY !== 'your_api_key_here') {
            try {
                const depositPayload = {
                    depositId: paymentRef,
                    amount: String(amount),
                    currency: "RWF",
                    payer: {
                        type: "MMO",
                        accountDetails: {
                            phoneNumber: phone.replace(/^\+?250/, '250'),
                            provider: "MTN_MOMO_RWA"
                        }
                    },
                    callbackUrl: `${BASE_URL}/api/webhook/deposit`
                };
                
                console.log('Initiating deposit with PawaPay:', depositPayload);
                
                const response = await axios.post(DEPOSIT_API_URL, depositPayload, {
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                });
                
                if (response.data && response.data.status !== 'FAILED') {
                    paymentInitiated = true;
                    paymentUrl = response.data.paymentUrl || response.data.checkoutUrl || null;
                    await updatePaymentRequest(paymentRef, {
                        providerStatus: response.data.status,
                        providerResponse: response.data
                    });
                    console.log('✅ Deposit initiated successfully');
                }
            } catch (paymentError) {
                console.error('PawaPay deposit error:', paymentError.response?.data || paymentError.message);
                // Fall back to manual payment
            }
        }
        
        if (paymentInitiated && paymentUrl) {
            res.json({
                success: true,
                paymentRef,
                paymentUrl: paymentUrl,
                manualPayment: false,
                message: "Click the link to complete payment on your phone"
            });
        } else {
            // Manual payment - user sends money directly to merchant
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
        console.error('Payment request error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// 🔔 Webhook for Deposit Callbacks
// ========================
app.post('/api/webhook/deposit', async (req, res) => {
    console.log('📥 Deposit webhook received:', JSON.stringify(req.body, null, 2));
    res.sendStatus(200);
    
    try {
        const { depositId, status, transactionId, amount, phoneNumber } = req.body;
        
        if (!depositId) return;
        
        const paymentResult = await getPaymentRequestByRef(depositId);
        
        if (paymentResult && (status === 'SUCCESS' || status === 'COMPLETED')) {
            const payment = paymentResult.request;
            
            // Get user
            const userResult = await getUserByUserId(payment.userId);
            if (userResult && userResult.user.status === 'pending') {
                const user = userResult.user;
                const referralCode = generateReferralCode(user.fullName);
                
                // Update user to approved
                await updateUser(payment.userId, {
                    status: 'approved',
                    referralCode: referralCode,
                    paymentVerified: true,
                    paymentAmount: payment.amount,
                    paymentDate: Date.now(),
                    paymentTransactionId: transactionId
                });
                
                // Update payment request
                await updatePaymentRequest(depositId, {
                    status: 'COMPLETED',
                    transactionId: transactionId,
                    completedAt: Date.now()
                });
                
                console.log(`✅ Auto-approved user: ${user.fullName} with code: ${referralCode}`);
            }
        } else if (paymentResult) {
            await updatePaymentRequest(depositId, {
                providerStatus: status,
                lastWebhook: Date.now()
            });
        }
        
    } catch (err) {
        console.error('Webhook processing error:', err);
    }
});

// ========================
// 🔍 Check Payment Status
// ========================
app.get('/api/payments/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const userResult = await getUserByUserId(userId);
        
        if (!userResult) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = userResult.user;
        
        if (user.status === 'approved' && user.referralCode) {
            return res.json({
                success: true,
                status: 'approved',
                referralCode: user.referralCode,
                user: user
            });
        }
        
        // Check payment requests
        const paymentRequest = await getPaymentRequestByUserId(userId);
        
        res.json({
            success: true,
            status: user.status || 'pending',
            paymentRequest: paymentRequest ? paymentRequest.request : null
        });
        
    } catch (err) {
        console.error('Status check error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// 👤 Get User by Phone
// ========================
app.get('/api/users/phone/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        
        const existing = await getUserByPhone(phone);
        
        if (!existing) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const { user, userId } = existing;
        const { password, ...userWithoutPassword } = user;
        
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
// 👤 Get All Users
// ========================
app.get('/api/users', async (req, res) => {
    try {
        const users = await getUsers();
        
        const safeUsers = {};
        for (const [id, user] of Object.entries(users)) {
            const { password, ...safeUser } = user;
            safeUsers[id] = safeUser;
        }
        
        res.json({ success: true, users: safeUsers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// 👤 Update User
// ========================
app.post('/api/users/:userId/update', async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;
        
        await updateUser(userId, updates);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// 🔐 Admin Login
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
// Admin: Verify Payment Manually
// ========================
app.post('/api/admin/verify-payment', async (req, res) => {
    try {
        const { paymentRef, adminKey } = req.body;
        
        if (adminKey !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const paymentResult = await getPaymentRequestByRef(paymentRef);
        
        if (!paymentResult) {
            return res.status(404).json({ error: 'Payment request not found' });
        }
        
        const payment = paymentResult.request;
        
        if (payment.status !== 'PENDING') {
            return res.status(400).json({ error: 'Payment already processed' });
        }
        
        const userResult = await getUserByUserId(payment.userId);
        if (!userResult) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = userResult.user;
        const referralCode = generateReferralCode(user.fullName);
        
        await updateUser(payment.userId, {
            status: 'approved',
            referralCode: referralCode,
            paymentVerified: true,
            paymentAmount: payment.amount,
            paymentDate: Date.now()
        });
        
        await updatePaymentRequest(paymentRef, {
            status: 'COMPLETED',
            verifiedAt: Date.now(),
            verifiedBy: 'admin'
        });
        
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
// 💸 Withdrawal Requests
// ========================
app.post('/api/withdrawals/request', async (req, res) => {
    try {
        const { userId, phone, amount, userName } = req.body;
        
        if (!userId || !phone || !amount) {
            return res.status(400).json({ error: 'userId, phone, and amount required' });
        }
        
        const withdrawalId = generateId('WITHDRAW');
        
        const withdrawal = {
            userId,
            userPhone: phone,
            userName: userName || '',
            amount: Number(amount),
            status: 'pending',
            createdAt: Date.now()
        };
        
        await saveWithdrawal(withdrawalId, withdrawal);
        
        // Update user's earnings
        const userResult = await getUserByUserId(userId);
        if (userResult) {
            const newEarnings = Math.max(0, (userResult.user.earnings || 0) - Number(amount));
            await updateUser(userId, { earnings: newEarnings });
        }
        
        res.json({ success: true, withdrawalId });
    } catch (err) {
        console.error('Withdrawal request error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// GET Withdrawals
// ========================
app.get('/api/withdrawals', async (req, res) => {
    try {
        const withdrawals = await getWithdrawals();
        res.json({ success: true, withdrawals });
    } catch (err) {
        console.error('Get withdrawals error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// UPDATE Withdrawal
// ========================
app.post('/api/withdrawals/:id/update', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        await updateWithdrawal(id, {
            status: status,
            processedAt: Date.now()
        });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Update withdrawal error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// 📝 Contact Messages
// ========================
app.post('/api/contacts', async (req, res) => {
    try {
        const { userPhone, userName, message } = req.body;
        
        const contactId = generateId('CONTACT');
        const contact = {
            userPhone,
            userName,
            message,
            createdAt: Date.now(),
            status: 'unread'
        };
        
        await saveContact(contactId, contact);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Contact message error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// Admin: Get Payment Requests
// ========================
app.get('/api/admin/payment-requests', async (req, res) => {
    try {
        const { adminKey } = req.query;
        
        if (adminKey !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        let requests = {};
        if (firebaseInitialized && db) {
            const snap = await db.ref('payment_requests').once('value');
            requests = snap.val() || {};
        } else {
            requests = memoryPaymentRequests;
        }
        
        // Get user details for each request
        const requestsWithUsers = {};
        for (const [id, request] of Object.entries(requests)) {
            const userResult = await getUserByUserId(request.userId);
            requestsWithUsers[id] = {
                ...request,
                userFullName: userResult?.user?.fullName || 'Unknown',
                userPhone: userResult?.user?.phone || 'Unknown'
            };
        }
        
        res.json({ success: true, paymentRequests: requestsWithUsers });
    } catch (err) {
        console.error('Get payment requests error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// ❤️ Health Check
// ========================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: Date.now(),
        firebase: firebaseInitialized,
        storage: firebaseInitialized ? 'firebase' : 'memory',
        endpoints: {
            users: '/api/users',
            login: '/api/users/login',
            register: '/api/users/register',
            payments: '/api/payments/request',
            withdrawals: '/api/withdrawals',
            admin: '/api/admin/login'
        }
    });
});

// ========================
// 🚀 START SERVER
// ========================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📱 Merchant Phone: ${MERCHANT_PHONE}`);
    console.log(`👤 Merchant Name: ${MERCHANT_NAME}`);
    console.log(`🔑 Admin Password: ${ADMIN_PASSWORD}`);
    console.log(`🔥 Firebase: ${firebaseInitialized ? 'Connected' : 'Using memory storage'}`);
    console.log(`📁 Static files serving from: ${path.join(__dirname, 'public')}`);
    console.log(`\n✅ Ready to accept requests!\n`);
});

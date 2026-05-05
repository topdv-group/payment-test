// server.js — Unified Payout + Deposit System (Production Ready)

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
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.DB_URL
});

const db = admin.database();

// ========================
// ⚙️ CONFIG
// ========================
const PAYOUT_API_URL = process.env.PAYOUT_API_URL;   // e.g. https://api.pawapay.io/v1/payouts
const DEPOSIT_API_URL = process.env.DEPOSIT_API_URL; // e.g. https://api.pawapay.io/v2/deposits
const API_KEY = process.env.PAYMENT_API_KEY;

// ========================
// 🌐 STATIC FILES
// ========================
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================
// 🔧 HELPERS
// ========================
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

// ========================

// Request payment for referral code
app.post('/api/payments/request', async (req, res) => {
    try {
        const { userId, phone, amount = 1500 } = req.body;
        
        if (!userId || !phone) {
            return res.status(400).json({ error: 'userId and phone required' });
        }
        
        // Check if user exists
        const userSnap = await db.ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = userSnap.val();
        
        // If already approved, don't request payment
        if (user.status === 'approved') {
            return res.json({ 
                success: true, 
                alreadyApproved: true,
                referralCode: user.referralCode 
            });
        }
        
        // Generate payment reference
        const paymentRef = `PAY_${Date.now()}_${userId}`;
        
        // Store payment request
        await db.ref(`payment_requests/${paymentRef}`).set({
            userId,
            phone,
            amount,
            status: 'PENDING',
            createdAt: Date.now()
        });
        
        // If you have PawaPay deposit API configured, initiate payment
        if (DEPOSIT_API_URL && API_KEY) {
            try {
                const payload = {
                    depositId: paymentRef,
                    amount: String(amount),
                    currency: "RWF",
                    payer: {
                        type: "MMO",
                        accountDetails: {
                            phoneNumber: phone,
                            provider: "MTN_MOMO_RWA"
                        }
                    },
                    callbackUrl: `${process.env.BASE_URL}/api/webhook`
                };
                
                const response = await axios.post(DEPOSIT_API_URL, payload, {
                    headers: {
                        Authorization: `Bearer ${API_KEY}`,
                        "Content-Type": "application/json"
                    }
                });
                
                res.json({
                    success: true,
                    paymentRef,
                    paymentUrl: response.data.paymentUrl || null,
                    message: "Payment initiated. Please complete the payment on your phone."
                });
            } catch (paymentError) {
                console.error('Payment initiation error:', paymentError.message);
                res.json({
                    success: false,
                    paymentRef,
                    manualPayment: true,
                    message: "Please send money to +250795305882 (NTWARI) with reference: " + paymentRef
                });
            }
        } else {
            // Manual payment fallback
            res.json({
                success: true,
                paymentRef,
                manualPayment: true,
                message: "Please send 1500 RWF to +250795305882 (NTWARI) with reference: " + paymentRef
            });
        }
        
    } catch (err) {
        console.error('Payment request error:', err);
        res.status(500).json({ error: err.message });
    }
});

//auto give the user referal
app.post('/api/webhook', async (req, res) => {
    // Respond immediately to webhook
    res.sendStatus(200);
    
    try {
        const { depositId, status, transactionId, phoneNumber, amount } = req.body;
        
        console.log(`📥 Webhook received: ${depositId} - ${status}`);
        
        // Store the webhook data
        await db.ref(`webhooks/${depositId}`).set({
            ...req.body,
            receivedAt: Date.now()
        });
        
        // Handle successful payment
        if (status === 'COMPLETED' || status === 'SUCCESS') {
            // Find user by phone number
            const usersSnap = await db.ref('users')
                .orderByChild('phone')
                .equalTo(phoneNumber)
                .once('value');
            
            if (usersSnap.exists()) {
                usersSnap.forEach(async (userSnap) => {
                    const user = userSnap.val();
                    const userId = userSnap.key;
                    
                    // Only auto-approve if user is pending
                    if (user.status === 'pending') {
                        // Generate referral code
                        const base = user.fullName?.replace(/\s+/g, '').toUpperCase().substring(0, 4) || 'USER';
                        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
                        const referralCode = `${base}${random}`;
                        
                        // Update user to approved
                        await db.ref(`users/${userId}`).update({
                            status: 'approved',
                            referralCode: referralCode,
                            paymentVerified: true,
                            paymentAmount: amount,
                            paymentDate: Date.now(),
                            paymentTransactionId: transactionId
                        });
                        
                        console.log(`✅ Auto-approved user: ${user.fullName} (${user.phone}) with code: ${referralCode}`);
                        
                        // TODO: Send SMS notification (can add later)
                        // await sendSMS(user.phone, `Your referral code is: ${referralCode}`);
                    }
                });
            }
        }
        
        // Handle payouts (when users withdraw)
        if (req.body.payoutId && status === 'COMPLETED') {
            await db.ref(`payments/payouts/${req.body.payoutId}`).update({
                status: 'SUCCESS',
                completedAt: Date.now()
            });
        }
        
    } catch (err) {
        console.error('Webhook processing error:', err);
    }
});

// Admin login endpoint
app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
    
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// 👤 USERS
// ========================
// CREATE USER
app.post('/api/users', async (req, res) => {
    try {
        const { fullName, phone, email } = req.body;

        if (!fullName || !phone) {
            return res.status(400).json({ error: 'fullName and phone required' });
        }

        const existing = await db.ref('users')
            .orderByChild('phone')
            .equalTo(phone)
            .once('value');

        if (existing.exists()) {
            return res.status(409).json({ error: 'Phone already exists' });
        }

        const userId = db.ref('users').push().key;

        const user = {
            fullName,
            phone,
            email: email || null,
            createdAt: Date.now()
        };

        await db.ref(`users/${userId}`).set(user);

        res.status(201).json({ success: true, userId, ...user });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET USERS
app.get('/api/users', async (req, res) => {
    try {
        const snap = await db.ref('users').once('value');
        res.json({ success: true, users: snap.val() || {} });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// 💸 PAYOUTS (SEND MONEY)
// ========================

// SEND TO ONE USER
app.post('/api/payouts/send', async (req, res) => {
    try {
        const { userId, amount } = req.body;

        if (!userId || !amount) {
            return res.status(400).json({ error: 'userId and amount required' });
        }

        const userSnap = await db.ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userSnap.val();
        const payoutId = generateId('PAYOUT');

        const payload = {
            payoutId,
            recipient: {
                type: "MMO",
                accountDetails: {
                    phoneNumber: user.phone,
                    provider: "MTN_MOMO_RWA"
                }
            },
            amount: String(amount),
            currency: "RWF",
            clientReferenceId: payoutId,
            customerMessage: "Payment",
            metadata: [{ userId }]
        };

        const response = await axios.post(PAYOUT_API_URL, payload, {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            }
        });

        await db.ref(`payments/payouts/${payoutId}`).set({
            userId,
            amount: Number(amount),
            status: 'PROCESSING',
            createdAt: Date.now()
        });

        res.json({
            success: true,
            payoutId,
            providerStatus: response.data.status
        });

    } catch (err) {
        res.status(500).json({
            error: 'Payout failed',
            details: err.response?.data || err.message
        });
    }
});

// ========================
// 💰 DEPOSITS (COLLECT MONEY)
// ========================

app.post('/api/deposits/create', async (req, res) => {
    try {
        const { phone, amount } = req.body;

        if (!phone || !amount) {
            return res.status(400).json({ error: 'phone and amount required' });
        }

        const depositId = generateId('DEP');

        const payload = {
            depositId,
            amount: String(amount),
            currency: "RWF",
            payer: {
                type: "MMO",
                accountDetails: {
                    phoneNumber: phone,
                    provider: "MTN_MOMO_RWA"
                }
            }
        };

        const response = await axios.post(DEPOSIT_API_URL, payload, {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            }
        });

        await db.ref(`payments/deposits/${depositId}`).set({
            phone,
            amount: Number(amount),
            status: 'PROCESSING',
            createdAt: Date.now()
        });

        res.json({
            success: true,
            depositId,
            providerStatus: response.data.status
        });

    } catch (err) {
        res.status(500).json({
            error: 'Deposit failed',
            details: err.response?.data || err.message
        });
    }
});

// ========================
// 🔄 POLLING
// ========================

// CHECK DEPOSIT
app.get('/api/deposits/:id', async (req, res) => {
    try {
        const response = await axios.get(`${DEPOSIT_API_URL}/${req.params.id}`, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });

        res.json(response.data);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CHECK PAYOUT
app.get('/api/payouts/:id', async (req, res) => {
    try {
        const response = await axios.get(`${PAYOUT_API_URL}/${req.params.id}`, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });

        res.json(response.data);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// 🔔 WEBHOOK
// ========================
app.post('/api/webhook', async (req, res) => {
    res.sendStatus(200);

    try {
        const { payoutId, depositId, status, transactionId } = req.body;

        if (payoutId) {
            await db.ref(`payments/payouts/${payoutId}`).update({
                status,
                transactionId: transactionId || null,
                updatedAt: Date.now()
            });
        }

        if (depositId) {
            await db.ref(`payments/deposits/${depositId}`).update({
                status,
                transactionId: transactionId || null,
                updatedAt: Date.now()
            });
        }

    } catch (err) {
        console.error(err);
    }
});

// ========================
// 📊 STATS
// ========================
app.get('/api/stats', async (req, res) => {
    try {
        const [usersSnap, payoutsSnap, depositsSnap] = await Promise.all([
            db.ref('users').once('value'),
            db.ref('payments/payouts').once('value'),
            db.ref('payments/deposits').once('value')
        ]);

        const users = usersSnap.val() || {};
        const payouts = payoutsSnap.val() || {};
        const deposits = depositsSnap.val() || {};

        const totalUsers = Object.keys(users).length;
        const totalPayouts = Object.keys(payouts).length;
        const totalDeposits = Object.keys(deposits).length;

        res.json({
            success: true,
            stats: {
                totalUsers,
                totalPayouts,
                totalDeposits
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user metadata (for referrals, earnings, etc.)
app.post('/api/users/:userId/metadata', async (req, res) => {
    try {
        const { userId } = req.params;
        const { earnings, referrals, transactions, status, referralCode } = req.body;
        
        const updates = {};
        if (earnings !== undefined) updates.earnings = earnings;
        if (referrals !== undefined) updates.referrals = referrals;
        if (transactions !== undefined) updates.transactions = transactions;
        if (status !== undefined) updates.status = status;
        if (referralCode !== undefined) updates.referralCode = referralCode;
        
        await db.ref(`users/${userId}`).update(updates);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// ❤️ HEALTH
// ========================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: Date.now() });
});

// ========================
// 🚀 START
// ========================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

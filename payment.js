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
// 👤 USERS
// ========================

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

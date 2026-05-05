lets tell railway where the server is through json and also tell me if this server paths are collect {// server.js — Unified Payout + Deposit System (Production Ready)

const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

// ========================
// 🔐 ENVIRONMENT VALIDATION
// ========================
const requiredEnvVars = [
    'FIREBASE_KEY',
    'DB_URL',
    'PAYMENT_API_KEY'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
}

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
// ⚙️ CONFIG - ALL FROM ENV VARS
// ========================
const PAYOUT_API_URL = process.env.PAYOUT_API_URL;
const DEPOSIT_API_URL = process.env.DEPOSIT_API_URL;
const API_KEY = process.env.PAYMENT_API_KEY;

// Log configuration status (without exposing values)
console.log('✅ Configuration loaded:', {
    PAYOUT_API_URL: PAYOUT_API_URL ? 'Set' : 'Not set',
    DEPOSIT_API_URL: DEPOSIT_API_URL ? 'Set' : 'Not set',
    API_KEY: API_KEY ? 'Set' : 'Not set',
    DB_URL: process.env.DB_URL ? 'Set' : 'Not set'
});

// ========================
// 🌐 STATIC FILES
// ========================
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
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
        console.error('Create user error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET USERS
app.get('/api/users', async (req, res) => {
    try {
        const snap = await db.ref('users').once('value');
        res.json({ success: true, users: snap.val() || {} });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// 💸 PAYOUTS (SEND MONEY)
// ========================

// SEND TO ONE USER
app.post('/api/payouts/send', async (req, res) => {
    // Check if payout API is configured
    if (!PAYOUT_API_URL || !API_KEY) {
        return res.status(503).json({ 
            error: 'Payout service not configured',
            details: 'Missing PAYOUT_API_URL or PAYMENT_API_KEY environment variables'
        });
    }

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
        console.error('Payout error:', err.response?.data || err.message);
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
    // Check if deposit API is configured
    if (!DEPOSIT_API_URL || !API_KEY) {
        return res.status(503).json({ 
            error: 'Deposit service not configured',
            details: 'Missing DEPOSIT_API_URL or PAYMENT_API_KEY environment variables'
        });
    }

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
        console.error('Deposit error:', err.response?.data || err.message);
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
    if (!DEPOSIT_API_URL || !API_KEY) {
        return res.status(503).json({ error: 'Deposit service not configured' });
    }

    try {
        const response = await axios.get(`${DEPOSIT_API_URL}/${req.params.id}`, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });
        res.json(response.data);
    } catch (err) {
        console.error('Check deposit error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// CHECK PAYOUT
app.get('/api/payouts/:id', async (req, res) => {
    if (!PAYOUT_API_URL || !API_KEY) {
        return res.status(503).json({ error: 'Payout service not configured' });
    }

    try {
        const response = await axios.get(`${PAYOUT_API_URL}/${req.params.id}`, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });
        res.json(response.data);
    } catch (err) {
        console.error('Check payout error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// 🔔 WEBHOOK
// ========================
app.post('/api/webhook', async (req, res) => {
    // Always respond quickly to webhook
    res.sendStatus(200);

    try {
        const { payoutId, depositId, status, transactionId } = req.body;

        if (payoutId) {
            await db.ref(`payments/payouts/${payoutId}`).update({
                status,
                transactionId: transactionId || null,
                updatedAt: Date.now()
            });
            console.log(`✅ Updated payout ${payoutId} status to ${status}`);
        }

        if (depositId) {
            await db.ref(`payments/deposits/${depositId}`).update({
                status,
                transactionId: transactionId || null,
                updatedAt: Date.now()
            });
            console.log(`✅ Updated deposit ${depositId} status to ${status}`);
        }

    } catch (err) {
        console.error('Webhook processing error:', err);
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
        console.error('Stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// ❤️ HEALTH
// ========================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: Date.now(),
        services: {
            payouts: !!PAYOUT_API_URL,
            deposits: !!DEPOSIT_API_URL
        }
    });
});

// ========================
// 🚀 START
// ========================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Serving static files from: ${path.join(__dirname, '../public')}`);
});}{{
  "name": "referral-payment-system",
  "version": "1.0.0",
  "description": "Referral program with payment integration",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "firebase-admin": "^11.10.1",
    "axios": "^1.5.0",
    "crypto": "^1.0.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}}

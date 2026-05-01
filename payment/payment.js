const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());

// ENV
const API_KEY = process.env.API_KEY;
const PAYMENT_API_URL = process.env.PAYMENT_API_URL;

if (!API_KEY || !PAYMENT_API_URL) {
  console.error("❌ Missing environment variables");
}

// In-memory checkout store (replace with Firebase later)
const checkouts = {};

// =========================
// HEALTH CHECK
// =========================
app.get("/", (req, res) => {
  res.send("Payment service running");
});


// =========================
// 1. TEST PAYOUT (KEEP)
// =========================
app.post("/test-payout", async (req, res) => {
  try {
    const response = await axios.post(
      PAYMENT_API_URL,
      {
        payoutId: uuidv4(),
        amount: "100",
        currency: "RWF",
        correspondent: "MTN_MOMO_RWA",
        recipient: {
          type: "MSISDN",
          address: { value: "250799340639" }
        },
        customerTimestamp: new Date().toISOString(),
        statementDescription: "Sandbox test",
        callbackUrl: "https://webhook.site/your-id"
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    res.json({ success: true, data: response.data });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
});


// =========================
// 2. CREATE CHECKOUT (NEW)
// USER PAYMENT FLOW
// =========================
app.post("/create-checkout", async (req, res) => {
  try {
    const { phone, amount } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({
        success: false,
        message: "phone and amount required"
      });
    }

    const checkoutId = uuidv4();

    const response = await axios.post(
      PAYMENT_API_URL,
      {
        payoutId: checkoutId, // can still be used as transaction ID
        amount: String(amount),
        currency: "RWF",
        correspondent: "MTN_MOMO_RWA",
        recipient: {
          type: "MSISDN",
          address: { value: phone }
        },
        customerTimestamp: new Date().toISOString(),
        statementDescription: "Checkout payment",
        callbackUrl: "https://your-domain.com/webhook"
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    // store checkout locally
    checkouts[checkoutId] = {
      id: checkoutId,
      phone,
      amount,
      status: "PENDING",
      providerResponse: response.data,
      createdAt: Date.now()
    };

    res.json({
      success: true,
      checkoutId,
      status: "PENDING",
      provider: response.data
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
});


// =========================
// 3. CHECK STATUS (NEW)
// =========================
app.get("/payment-status/:id", (req, res) => {
  const checkout = checkouts[req.params.id];

  if (!checkout) {
    return res.status(404).json({
      success: false,
      message: "Checkout not found"
    });
  }

  res.json({
    success: true,
    data: checkout
  });
});


// =========================
// SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log("API_KEY:", API_KEY ? "Loaded" : "Missing");
  console.log("PAYMENT_API_URL:", PAYMENT_API_URL || "Missing");
});

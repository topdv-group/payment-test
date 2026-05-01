const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());

// ENV (must be set in Railway)
const API_KEY = process.env.API_KEY;
const DEPOSITS_API_URL = process.env.DEPOSITS_API_URL || "https://api.sandbox.pawapay.io/deposits";

if (!API_KEY) {
  console.error("❌ Missing API_KEY");
}

// simple memory store (replace with DB later)
const payments = {};

// =========================
// HEALTH CHECK
// =========================
app.get("/", (req, res) => {
  res.json({ status: "Payment service running" });
});


// =========================
// CREATE CHECKOUT (DEPOSIT FLOW)
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

    const depositId = uuidv4();

    const payload = {
      depositId,
      amount: String(amount),
      currency: "RWF",
      correspondent: "MTN_MOMO_RWA",
      payer: {
        type: "MSISDN",
        address: {
          value: phone.replace("+", "") // ensure format 2507...
        }
      },
      customerTimestamp: new Date().toISOString(),
      statementDescription: "Checkout payment",
      country: "RWA"
    };

    const response = await axios.post(DEPOSITS_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    });

    // store transaction
    payments[depositId] = {
      depositId,
      phone,
      amount,
      status: response.data.status || "PENDING",
      providerResponse: response.data,
      createdAt: Date.now()
    };

    res.json({
      success: true,
      depositId,
      status: response.data.status,
      provider: response.data
    });

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
});


// =========================
// CHECK STATUS
// =========================
app.get("/payment/:id", (req, res) => {
  const payment = payments[req.params.id];

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: "Not found"
    });
  }

  res.json({
    success: true,
    data: payment
  });
});


// =========================
// SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
  console.log("DEPOSITS API:", DEPOSITS_API_URL);
  console.log("API KEY:", API_KEY ? "Loaded" : "Missing");
});

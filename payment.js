const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());

// =========================
// ENV
// =========================
const API_KEY = process.env.API_KEY;
const PAYMENT_API_URL = process.env.PAYMENT_API_URL;

if (!API_KEY || !PAYMENT_API_URL) {
  console.error("❌ Missing API_KEY or PAYMENT_API_URL");
}

// =========================
// HEALTH CHECK
// =========================
app.get("/", (req, res) => {
  res.json({ status: "Deposit backend running" });
});

// =========================
// CREATE DEPOSIT
// =========================
app.post("/deposit", async (req, res) => {
  try {
    const { phone, amount } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({
        success: false,
        message: "phone and amount required"
      });
    }

    // ✅ FIXED: always valid UUID v4
    const depositId = uuidv4();

    const payload = {
      depositId,
      amount: String(amount),
      currency: "RWF",
      correspondent: "MTN_MOMO_RWA",
      payer: {
        type: "MSISDN",
        address: {
          value: phone.replace("+", "")
        }
      },
      customerTimestamp: new Date().toISOString(),
      statementDescription: "CLI test deposit"
    };

    const response = await axios.post(PAYMENT_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    res.json({
      success: true,
      depositId,
      status: response.data.status,
      raw: response.data
    });

  } catch (err) {
    console.error("❌ ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Deposit server running on port", PORT);
});

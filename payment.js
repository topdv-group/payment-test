const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());

// Load from environment
const API_KEY = process.env.API_KEY;
const PAYMENT_API_URL = process.env.PAYMENT_API_URL;

// Basic check (important)
if (!API_KEY || !PAYMENT_API_URL) {
  console.error("❌ Missing environment variables:");
  console.error("API_KEY or PAYMENT_API_URL not set");
}

// Health check
app.get("/", (req, res) => {
  res.send("Payment service running");
});

// Test payout endpoint
app.post("/test-payout", async (req, res) => {
  try {
    const response = await axios.post(
      PAYMENT_API_URL, // ✅ from env
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
          Authorization: `Bearer ${API_KEY}`, // ✅ from env
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    res.json({
      success: true,
      data: response.data
    });

  } catch (err) {
    console.error("❌ API ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log("API_KEY:", API_KEY ? "Loaded" : "Missing");
  console.log("PAYMENT_API_URL:", PAYMENT_API_URL || "Missing");
});

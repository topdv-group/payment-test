app.post("/create-checkout", async (req, res) => {
  try {
    const { phone, amount } = req.body;

    const depositId = uuidv4();

    const response = await axios.post(
      "https://api.sandbox.pawapay.io/deposits",
      {
        depositId,
        amount: String(amount),
        currency: "RWF", // or supported currency
        correspondent: "MTN_MOMO_RWA",
        payer: {
          type: "MSISDN",
          address: {
            value: phone
          }
        },
        customerTimestamp: new Date().toISOString(),
        statementDescription: "Checkout payment",
        country: "RWA"
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      success: true,
      depositId,
      provider: response.data
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
});

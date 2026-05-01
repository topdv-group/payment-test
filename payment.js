const axios = require("axios");
const { v4: uuidv4 } = require("uuid");


const API_KEY = "eyJraWQiOiIxIiwiYWxnIjoiRVMyNTYifQ.eyJ0dCI6IkFBVCIsInN1YiI6IjIwMjcwIiwibWF2IjoiMSIsImV4cCI6MjA5MjgyNDUzMywiaWF0IjoxNzc3MjA1MzMzLCJwbSI6IkRBRixQQUYiLCJqdGkiOiJlMGVkZjg4OC0wZGVkLTQ1MTgtOTMzZi01OGRmMGY4ZDUxN2UifQ.m6a0jggZpXV-TiE7yzycqgMGhE22b4Op9Tw36iM3fUeur7mz3J-cTvuhDX0HHNUMhUFVrri1mYU_nK12U7hiNw";


async function testPayment() {
  try {
    const response = await axios.post(
      "https://api.sandbox.pawapay.io/v1/payouts",
      {
        payoutId: uuidv4(), // ✅ ONLY THIS ONE
        amount: "100",
        currency: "RWF",
        correspondent: "MTN_MOMO_RWA",
        recipient: {
          type: "MSISDN",
          address: {
            value: "250799340639"
          }
        },
        customerTimestamp: new Date().toISOString(),
        statementDescription: "Sandbox test",
        callbackUrl: "https://webhook.site/e1c5d437-e768-48c9-9420-ba205263dcc3"
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );


    console.log("API response:", response.data);
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
  }
}


testPayment();

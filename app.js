async function createDeposit() {
    const phone = document.getElementById("dep-phone").value;
    const amount = document.getElementById("dep-amount").value;

    const res = await fetch("/api/deposits/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, amount })
    });

    const data = await res.json();

    document.getElementById("dep-result").innerText =
        data.success ? "Deposit request sent ✅ ID: " + data.depositId : "Error ❌";
}

async function sendPayout() {
    const userId = document.getElementById("userId").value;
    const amount = document.getElementById("pay-amount").value;

    const res = await fetch("/api/payouts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, amount })
    });

    const data = await res.json();

    document.getElementById("pay-result").innerText =
        data.success ? "Payout sent ✅ ID: " + data.payoutId : "Error ❌";
}

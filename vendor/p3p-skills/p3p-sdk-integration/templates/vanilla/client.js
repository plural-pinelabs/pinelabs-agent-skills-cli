// Vanilla JS / Plain fetch - P3P x402 browser client
// Browser code must not hold Pine Labs client credentials.
// Send payment context to your backend; the backend owns p3p-client-sdk setup.

const P3P_PROXY_PATH = "/api/p3p/proxy";

// Call a P3P-protected API endpoint
async function fetchWithP3P(url, customerReference, mobileNumber) {
  const response = await fetch(P3P_PROXY_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUrl: url,
      init: {
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": crypto.randomUUID(),
        },
      },
      context: {
        customerReference,
        mobileNumber,
        paymentMethod: "RESERVE_PAY",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Example: browser button click
document.getElementById("pay-button")?.addEventListener("click", async () => {
  try {
    const data = await fetchWithP3P(
      "https://your-server.com/api/premium",
      "customer-ref-123",          // your user/customer ID
      "9876543210"                 // customer's UPI-registered mobile number
    );
    document.getElementById("result")?.replaceChildren(
      document.createTextNode(JSON.stringify(data))
    );
  } catch (err) {
    document.getElementById("result")?.replaceChildren(
      document.createTextNode(`Payment failed: ${err.message}`)
    );
  }
});

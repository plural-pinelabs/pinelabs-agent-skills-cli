// Express.js — P3P Client-side usage (Node.js service calling a P3P-protected server)
// Use this when your Node.js service acts as the CLIENT calling a protected resource
// Adjust: target URL, customer context, and payment method

import {
  P3PEnvironment,
  PaymentMethod,
  PineLabsOnlineClient,
} from "p3p-client-sdk";

// Singleton — one instance per service, long-lived
// Auth tokens are cached and refreshed automatically
const p3pClient = PineLabsOnlineClient.create({
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
  env:
    process.env.PINE_LABS_ENV === "PRODUCTION"
      ? P3PEnvironment.PRODUCTION
      : P3PEnvironment.SANDBOX,
});

// Make a request to a P3P-protected resource
// The SDK automatically handles 402: creates mandate → mints token → retries
export async function callProtectedResource<T>(
  url: string,
  customerReference: string,
  mobileNumber: string,
  init?: RequestInit
): Promise<T> {
  const response = await p3pClient.get(
    url,
    init ?? {},
    {
      customerReference,
      mobileNumber,
      paymentMethod: PaymentMethod.RESERVE_PAY,  // adjust as needed
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Protected resource request failed (${response.status}): ${errorBody}`);
  }

  // Keep any Payment-Receipt header server-side for reconciliation; do not log token values.

  return response.json() as Promise<T>;
}

// Example usage:
//
// const data = await callProtectedResource<{ message: string }>(
//   "https://api-server.com/api/premium",
//   "customer-ref-123",
//   "9876543210"
// );
// console.log(data.message);

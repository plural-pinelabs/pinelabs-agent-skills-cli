// Next.js App Router — Protected API Route with P3P x402
// Place this file at: app/api/premium/route.ts
// Adjust: amount, resource path, and your handler logic

import { NextRequest, NextResponse } from "next/server";
import {
  Amount,
  ChargeOptions,
  P3PEnvironment,
  PaymentGateway,
  PaymentMethod,
  PineLabsOnlineP3P,
  decidePayment,
} from "p3p-server-sdk";

// Singleton — reuse across requests (caches bearer tokens internally)
const p3pConfig = {
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
  paymentGateway: PaymentGateway.PineLabsOnline,
  availablePaymentMethods: [PaymentMethod.RESERVE_PAY, PaymentMethod.OTM],
  env:
    process.env.PINE_LABS_ENV === "PRODUCTION"
      ? P3PEnvironment.PRODUCTION
      : P3PEnvironment.SANDBOX,
};

export async function GET(request: NextRequest) {
  const decision = await decidePayment({
    credentialHeader:
      request.headers.get("P3P-Credential") ?? undefined,
    grantexTokenHeader:
      request.headers.get("X-Grantex-Token") ?? undefined,
    config: p3pConfig,
    chargeOptions: new ChargeOptions(
      new Amount(50000, "INR"),   // ₹500.00 in paise — adjust to your price
      "/api/premium"              // resource path for challenge signing
    ),
  });

  if (decision.action !== "proceed") {
    return NextResponse.json(decision.problemDetails, {
      status: decision.status,
      headers: decision.headers,
    });
  }

  // decision.action === "pending" (202): debit processing — withhold resource
  // Store decision.problemDetails.idempotencyKey and poll p3p.getDebitStatus(key)

  // Payment verified — run your protected logic here
  const responseData = {
    message: "Access granted",
    data: "Your premium content here",
  };

  const response = NextResponse.json(responseData, { status: 200 });

  // Always attach the settlement receipt
  if (decision.headers["Payment-Receipt"]) {
    response.headers.set("Payment-Receipt", decision.headers["Payment-Receipt"]);
  }

  return response;
}

// Express.js — P3P x402 Payment Middleware
// Usage: apply `p3pMiddleware` to any route you want to protect
// Adjust: CHARGE_AMOUNT_PAISE, RESOURCE_PATH, and your protected handler

import express, { Request, Response, NextFunction, RequestHandler } from "express";
import {
  Amount,
  ChargeOptions,
  P3PEnvironment,
  PaymentGateway,
  PaymentMethod,
  decidePayment,
} from "p3p-server-sdk";

const app = express();
app.use(express.json());

// SDK config — shared across requests (singleton)
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

// Reusable middleware factory — pass amount and resource path per route
function p3pMiddleware(amountPaise: number, resourcePath: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const decision = await decidePayment({
      credentialHeader: req.headers["p3p-credential"] as string | undefined,
      grantexTokenHeader: req.headers["x-grantex-token"] as string | undefined,
      config: p3pConfig,
      chargeOptions: new ChargeOptions(
        new Amount(amountPaise, "INR"),
        resourcePath
      ),
    });

    if (decision.action !== "proceed") {
      // Set all challenge/error headers
      for (const [key, value] of Object.entries(decision.headers)) {
        res.setHeader(key, value as string);
      }
      return res.status(decision.status).json(decision.problemDetails);
    }

    // decision.action === "pending" (202): debit processing — withhold resource
    // Store decision.problemDetails.idempotencyKey and poll p3p.getDebitStatus(key)

    // Payment verified — attach receipt header and continue
    if (decision.headers["Payment-Receipt"]) {
      res.setHeader("Payment-Receipt", decision.headers["Payment-Receipt"]);
    }

    // Make decision available to the route handler if needed
    (req as any).p3pDecision = decision;

    next();
  };
}

// Protected route — ₹500.00 (50000 paise)
app.get(
  "/api/premium",
  p3pMiddleware(50000, "/api/premium"),
  (req: Request, res: Response) => {
    res.json({
      message: "Access granted",
      data: "Your premium content here",
    });
  }
);

// Protected route — different price point
app.post(
  "/api/generate",
  p3pMiddleware(10000, "/api/generate"),   // ₹100.00
  (req: Request, res: Response) => {
    res.json({
      result: "Generated content here",
    });
  }
);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT);

export default app;

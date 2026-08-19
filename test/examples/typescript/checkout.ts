export interface CheckoutSession {
  merchantReference: string;
  redirectUrl: string;
}

export interface PaymentBackend {
  reconcileOrder(merchantReference: string): Promise<"pending" | "succeeded" | "failed" | "cancelled">;
}

// The frontend receives only this backend-created session, never OAuth credentials.
export async function handleCheckoutReturn(
  session: CheckoutSession,
  backend: PaymentBackend,
): Promise<"pending" | "succeeded" | "failed" | "cancelled"> {
  if (!session.redirectUrl.startsWith("https://")) throw new Error("Expected a backend-created HTTPS checkout URL.");
  return backend.reconcileOrder(session.merchantReference);
}

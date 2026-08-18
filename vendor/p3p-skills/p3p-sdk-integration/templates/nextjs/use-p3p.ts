// Next.js - Client-side hook for P3P-protected API calls
// Place this file at: hooks/use-p3p.ts
// Adjust: your backend proxy URL, customer reference, and mobile number source

"use client";

import { useCallback, useState } from "react";

type PaymentMethod = "RESERVE_PAY" | "OTM" | "Crypto";

interface UseP3POptions {
  customerReference: string;
  mobileNumber: string;
  paymentMethod?: PaymentMethod;
  proxyPath?: string;
}

export function useP3P({
  customerReference,
  mobileNumber,
  paymentMethod = "RESERVE_PAY",
  proxyPath = "/api/p3p/proxy",
}: UseP3POptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProtected = useCallback(
    async <T>(url: string, init?: RequestInit): Promise<T> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(proxyPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUrl: url,
            init: init ?? {},
            context: {
              customerReference,
              mobileNumber,
              paymentMethod,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        return response.json() as Promise<T>;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [customerReference, mobileNumber, paymentMethod, proxyPath]
  );

  return { fetchProtected, loading, error };
}

// Usage example:
//
// const { fetchProtected, loading, error } = useP3P({
//   customerReference: user.id,
//   mobileNumber: user.mobileNumber,
// });
//
// const data = await fetchProtected<{ message: string }>(
//   "https://your-server.com/api/premium"
// );

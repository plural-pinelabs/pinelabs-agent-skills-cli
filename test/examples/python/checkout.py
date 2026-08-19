from typing import Literal, Protocol

PaymentState = Literal["pending", "succeeded", "failed", "cancelled"]


class PaymentBackend(Protocol):
    def reconcile_order(self, merchant_reference: str) -> PaymentState: ...


def handle_checkout_return(merchant_reference: str, redirect_url: str, backend: PaymentBackend) -> PaymentState:
    """Reconcile a backend-created checkout session; callbacks never fulfill an order directly."""
    if not redirect_url.startswith("https://"):
        raise ValueError("Expected a backend-created HTTPS checkout URL")
    return backend.reconcile_order(merchant_reference)

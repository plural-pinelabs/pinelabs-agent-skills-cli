package examples

private const val OFFICIAL_SOURCE = "https://www.pinelabs.com/docs/online-payments/sdks/mobile-sdks/android"

interface PaymentBackend {
  suspend fun reconcileOrder(merchantReference: String): PaymentState
}

enum class PaymentState { PENDING, SUCCEEDED, FAILED, CANCELLED }

// SDK callbacks are reconciled by the backend before the application fulfills an order.
suspend fun handleSdkCallback(merchantReference: String, backend: PaymentBackend): PaymentState =
  backend.reconcileOrder(merchantReference)

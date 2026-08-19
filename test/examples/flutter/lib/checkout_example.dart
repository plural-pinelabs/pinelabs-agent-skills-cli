import 'package:pine_payment_sdk/pine_payment_sdk.dart';

abstract class PaymentBackend {
  Future<String> reconcileOrder(String merchantReference);
}

Future<String> beginCheckout(
  String redirectUrl,
  String merchantReference,
  PaymentBackend backend,
) async {
  try {
    final PaymentResult result = await PinePaymentSdk.startPaymentFromRedirectUrl(
      redirectUrl: redirectUrl,
      appBarTitle: 'Complete Payment',
    );
    if (!result.success) return backend.reconcileOrder(merchantReference);
    return backend.reconcileOrder(merchantReference);
  } catch (_) {
    return backend.reconcileOrder(merchantReference);
  }
}

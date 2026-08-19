import UIKit
import PineLabsOnline_IOS_SDK

final class CheckoutViewController: UIViewController {
  private let manager = PineLabsOnlineSDKManager()
  private let callback = MerchantCallbackResponse()

  func beginCheckout(orderToken: String) {
    manager.startPayment(
      from: self,
      orderToken: orderToken,
      environment: .uat,
      MerchantCallbackResponse: callback
    )
  }
}

final class MerchantCallbackResponse: UIViewController, ResponseCallback {
  func onFailureResponse(orderID: String, status: String, code: String, message: String) {
    // Reconcile orderID with the app backend; do not fulfill here.
  }

  func onSuccessResponse(orderId: String, status: String) {
    // Reconcile orderId with the app backend; do not fulfill here.
  }

  func onCancelTxn(orderId: String, code: Int, message: String) {
    // Preserve pending state and reconcile orderId with the backend.
  }

  func onPressedBackButton(code: Int, message: String) {
    // Keep the checkout pending until backend status is known.
  }
}

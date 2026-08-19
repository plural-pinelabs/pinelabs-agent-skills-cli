// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "PineLabsAgentSkillsIOSExample",
  platforms: [.iOS(.v16)],
  products: [.library(name: "CheckoutExample", targets: ["CheckoutExample"])],
  dependencies: [
    // The official Pine Labs iOS Native SDK source is resolved in CI.
    .package(url: "https://github.com/plural-pinelabs/Infinity_Checkout_iOS_SDK", exact: "1.1.1"),
  ],
  targets: [
    .target(
      name: "CheckoutExample",
      dependencies: [
        .product(name: "PineLabsOnline_IOS_SDK", package: "Infinity_Checkout_iOS_SDK"),
      ],
    ),
  ],
)

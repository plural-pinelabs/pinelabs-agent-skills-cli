# Changelog

All notable changes to `pinelabs-agent-skills-cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-08-19

### Added

- Added workflow skills for validation/testing, go-live readiness, webhooks, common mistakes, upgrade guidance, and provider migration.
- Added provider-specific migration guides for common payment stack transitions.
- Added installed `.pinelabs-skills-version.json` markers for stale, legacy, and current install detection.
- Added richer mobile and web SDK guidance for setup, callback handling, backend verification, and failure handling.
- Added focused validation guides for checkout/orders, refunds, webhooks, mobile/web SDKs, subscriptions, and settlements.
- Added a detailed Razorpay migration reference, feature-flagged cutover workflow, processor-aware routing, dual-run reconciliation, and rollback gates.
- Added separate installer and integration upgrade routes, backed by a reviewed official-source registry.
- Added root workflow eval assets and CI fixtures for TypeScript, Python, Android/Kotlin, Flutter/Dart, and iOS/Swift examples.
- Added a scheduled/manual official-source verification workflow that is separate from deterministic generation.

### Changed

- `doctor` now reports install status plus installed/current version details.
- Release provenance now syncs the stamped `pinelabs-agent-skills-cli` package directly to the public mirror main branch and release tag.
- Package metadata now includes richer discoverability keywords and a clearer package description.

## [0.4.0] - 2026-08-18

### Added

- Added Kiro framework support with native `.kiro/skills/` installation and steering manifest routing.
- Added Kiro aliases for `kiro-ide` and `kiro-cli`.

## [0.3.0] - 2026-08-18

### Added

- Added curated P3P x402 and UPI ReservePay guidance, references, templates, and eval assets.
- Added P3P pay and SDK integration routing while keeping runtime package installation separate from the skills installer.

## [0.2.0] - 2026-08-18

### Added

- Added Dashboard signup, UAT API key setup, and OAuth token guidance.
- Added safe credential placeholder handling for generated authentication examples.

## [0.1.0] - 2026-07-04

### Added

- Initial Pine Labs agent skills installer package.

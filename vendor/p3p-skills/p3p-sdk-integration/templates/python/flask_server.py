# Python / Flask — P3P x402 Protected Server Endpoint
# Usage: run with `flask run` or `python flask_server.py`
# Adjust: CHARGE_AMOUNT_VALUE, resource path, and your protected handler

import os
from flask import Flask, jsonify, request, Response
from pinelabs_p3p_server import (
    Amount,
    ChargeOptions,
    P3PEnvironment,
    PaymentGateway,
    PaymentMethod,
    PineLabsOnlineP3P,
    PineLabsOnlineServerConfig,
)
from pinelabs_p3p_server.flask_mw import payment_required
from pinelabs_p3p_server.server.middleware import decide_payment

app = Flask(__name__)

# Singleton config — shared across all requests
config = PineLabsOnlineServerConfig(
    clientId=os.environ["PINELABS_CLIENT_ID"],
    clientSecret=os.environ["PINELABS_CLIENT_SECRET"],
    paymentGateway=PaymentGateway.PineLabsOnline,
    availablePaymentMethods=[PaymentMethod.RESERVE_PAY, PaymentMethod.OTM],
    env=(
        P3PEnvironment.PRODUCTION
        if os.environ.get("PINE_LABS_ENV") == "PRODUCTION"
        else P3PEnvironment.SANDBOX
    ),
)

p3p = PineLabsOnlineP3P.create(config)


# --- Option A: Flask decorator (simplest) ---
# The decorator handles 402 challenge, credential verification, and debit automatically.
@app.get("/api/premium")
@payment_required(config, ChargeOptions(
    amount=Amount(value=50000, currency="INR"),   # ₹500.00 in paise — adjust to your price
    resource="/api/premium",
))
def premium():
    return jsonify({
        "message": "Access granted",
        "data": "Your premium content here",
    })


# --- Option B: Generic decide_payment helper (full control) ---
# Use this when you need access to decision.capture_result or pending handling.
@app.get("/api/generate")
def generate():
    decision = decide_payment(
        credential_header=request.headers.get("P3P-Credential"),
        grantex_token_header=request.headers.get("X-Grantex-Token"),
        config=config,
        charge_options=ChargeOptions(
            amount=Amount(value=10000, currency="INR"),   # ₹100.00
            resource="/api/generate",
        ),
    )

    if decision.action != "proceed":
        # decision.action == "pending" (202): debit processing — withhold resource
        # Store decision.problem_details["idempotencyKey"] and poll later
        resp = jsonify(decision.problem_details or {"status": decision.status})
        resp.status_code = decision.status
        for key, value in (decision.headers or {}).items():
            resp.headers[key] = value
        return resp

    # Payment captured — return resource + receipt
    response_data = {
        "result": "Generated content here",
        "capture": decision.capture_result,   # debit details
    }
    resp = jsonify(response_data)
    if decision.headers.get("Payment-Receipt"):
        resp.headers["Payment-Receipt"] = decision.headers["Payment-Receipt"]
    return resp


# --- Server-side mandate creation (for server-to-agent setup flows) ---
@app.post("/api/setup-mandate")
def setup_mandate():
    body = request.get_json()
    mandate = p3p.create_mandate({
        "mobileNumber": body["mobileNumber"],
        "customerReference": body["customerReference"],
        "amount": Amount(value=body.get("amountPaise", 100000), currency="INR"),
        "paymentMethod": PaymentMethod.RESERVE_PAY,
        "validityInDays": 20,
    })
    return jsonify({
        "mandateId": mandate.payment_method_id,
        "deepLink": mandate.deep_link,
        "status": mandate.order_status,
    })


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))

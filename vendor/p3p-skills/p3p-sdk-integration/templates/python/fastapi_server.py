# Python / FastAPI — P3P x402 Protected Server Endpoint
# Usage: run with `uvicorn fastapi_server:app --reload`
# Adjust: CHARGE_AMOUNT_VALUE, resource path, and your protected handler

import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pinelabs_p3p_server import (
    Amount,
    ChargeOptions,
    P3PEnvironment,
    PaymentGateway,
    PaymentMethod,
    PineLabsOnlineP3P,
    PineLabsOnlineServerConfig,
)
from pinelabs_p3p_server.server.middleware import decide_payment

app = FastAPI()

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


@app.on_event("shutdown")
async def shutdown():
    # Clean up SDK resources on app shutdown
    pass


@app.get("/api/premium")
async def premium(request: Request):
    decision = decide_payment(
        credential_header=request.headers.get("P3P-Credential"),
        grantex_token_header=request.headers.get("X-Grantex-Token"),
        config=config,
        charge_options=ChargeOptions(
            amount=Amount(value=50000, currency="INR"),   # ₹500.00 in paise
            resource="/api/premium",
        ),
    )

    if decision.action != "proceed":
        # decision.action == "pending" (202): debit processing — withhold resource
        # Store decision.problem_details["idempotencyKey"] and poll later:
        #   p3p.get_debit_status(idempotency_key)
        return JSONResponse(
            content=decision.problem_details or {"status": decision.status},
            status_code=decision.status,
            headers=decision.headers or {},
        )

    # Payment captured — return resource + receipt header
    headers = {}
    if decision.headers and decision.headers.get("Payment-Receipt"):
        headers["Payment-Receipt"] = decision.headers["Payment-Receipt"]

    return JSONResponse(
        content={
            "message": "Access granted",
            "data": "Your premium content here",
        },
        headers=headers,
    )


@app.get("/api/generate")
async def generate(request: Request):
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
        return JSONResponse(
            content=decision.problem_details or {"status": decision.status},
            status_code=decision.status,
            headers=decision.headers or {},
        )

    headers = {}
    if decision.headers and decision.headers.get("Payment-Receipt"):
        headers["Payment-Receipt"] = decision.headers["Payment-Receipt"]

    return JSONResponse(
        content={"result": "Generated content here"},
        headers=headers,
    )


# Server-side mandate creation endpoint
@app.post("/api/setup-mandate")
async def setup_mandate(request: Request):
    body = await request.json()
    mandate = p3p.create_mandate({
        "mobileNumber": body["mobileNumber"],
        "customerReference": body["customerReference"],
        "amount": Amount(value=body.get("amountPaise", 100000), currency="INR"),
        "paymentMethod": PaymentMethod.RESERVE_PAY,
        "validityInDays": 20,
    })
    return JSONResponse({
        "mandateId": mandate.payment_method_id,
        "deepLink": mandate.deep_link,
        "status": mandate.order_status,
    })

# Python — P3P Client SDK Usage
# Use this when your Python service/agent calls a P3P-protected resource
# The SDK automatically handles 402: decodes challenge → creates token → retries
# Adjust: target URL, customer context, and payment method

import os
from pinelabs_p3p_client import (
    ClientRuntimeContext,
    P3PEnvironment,
    PaymentMethod,
    PineLabsOnlineClient,
    PineLabsOnlineClientConfig,
)

# Singleton — one instance per service, long-lived
# Auth tokens are cached per instance; call client.close() on shutdown
client = PineLabsOnlineClient.create(PineLabsOnlineClientConfig(
    env=(
        P3PEnvironment.PRODUCTION
        if os.environ.get("PINE_LABS_ENV") == "PRODUCTION"
        else P3PEnvironment.SANDBOX
    ),
    clientId=os.environ["PINELABS_CLIENT_ID"],
    clientSecret=os.environ["PINELABS_CLIENT_SECRET"],
))


def call_protected_resource(
    url: str,
    customer_reference: str,
    mobile_number: str,
    grantex_token: str | None = None,
):
    """
    Call a P3P-protected resource. The SDK handles the full 402 loop:
    no credential → creates mandate + token → retries with P3P-Credential.
    """
    response = client.get(
        url,
        context=ClientRuntimeContext(
            customerReference=customer_reference,
            mobileNumber=mobile_number,
            paymentMethod=PaymentMethod.RESERVE_PAY,  # adjust as needed
            grantexToken=grantex_token,
        ),
    )

    if not response.ok:
        raise RuntimeError(
            f"Protected resource request failed ({response.status_code}): {response.text}"
        )

    # Keep any Payment-Receipt header server-side for reconciliation; do not log token values.

    return response.json()


# --- Customer-Key Auth Mode ---
# Use when your customers have their own Pine Labs API tokens
from pinelabs_p3p_client import P3PCustomerAuthMode

customer_key_client = PineLabsOnlineClient.create(PineLabsOnlineClientConfig(
    env=P3PEnvironment.SANDBOX,
    customerAuthMode=P3PCustomerAuthMode.CustomerKey,
    clientId=os.environ["PINELABS_CLIENT_ID"],
    clientSecret=os.environ["PINELABS_CLIENT_SECRET"],
))


def call_with_customer_key(url: str, mobile_number: str, customer_key: str):
    response = customer_key_client.get(
        url,
        context=ClientRuntimeContext(
            mobileNumber=mobile_number,
            customerKey=customer_key,
            paymentMethod=PaymentMethod.RESERVE_PAY,
        ),
    )
    return response.json()


# --- Direct token creation (without automatic 402 loop) ---
from pinelabs_p3p_client import Amount, CreateTokenOptions

def create_token_directly(
    challenge_id: str,
    customer_reference: str,
    mobile_number: str,
    amount_paise: int,
):
    token = client.methods.create_token(CreateTokenOptions(
        customerReference=customer_reference,
        mobileNumber=mobile_number,
        challengeId=challenge_id,
        paymentAmount=Amount(value=amount_paise, currency="INR"),
        paymentMethod=PaymentMethod.RESERVE_PAY,
    ))
    return token


# --- Cleanup ---
import atexit
atexit.register(client.close)
atexit.register(customer_key_client.close)


# --- Example usage ---
if __name__ == "__main__":
    data = call_protected_resource(
        url="https://your-server.com/api/premium",
        customer_reference="customer-ref-123",
        mobile_number="9876543210",
    )
    print(data)

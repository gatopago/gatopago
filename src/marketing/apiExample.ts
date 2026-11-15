/** Creating a charge from a server, as the landing and `/flow` show it. */
export const API_EXAMPLE = `const response = await fetch(
  API_ORIGIN + "/v1/payment_intents",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + API_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": "order-001"
    },
    body: JSON.stringify({
      amount: "18.00",
      description: "Order 1042",
      metadata: { order_id: "1042" }
    })
  }
);
const intent = await response.json();`;

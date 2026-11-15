/** Creating a charge from a server, as the landing and `/cascabel` show it, in the page's language. */
export const apiExample = (amount: string, description: string) => `const response = await fetch(
  API_ORIGIN + "/v1/payment_intents",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + API_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": "order-1042"
    },
    body: JSON.stringify({
      amount: "${amount}",
      description: "${description}",
      metadata: { order_id: "1042" }
    })
  }
);
const intent = await response.json();`;

/** What the API answers: a new charge waits for its payment (see `/docs`). */
export const API_RESPONSE = '{ status: "requires_payment" }';

const PAYSTACK_BASE = 'https://api.paystack.co';

// Starts a transaction and returns the checkout link to send the parent to.
// amountKobo must already be in kobo (Fee.amount is stored that way for exactly this reason).
async function initializeTransaction({ email, amountKobo, reference, callbackUrl }) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amountKobo,
      reference,
      callback_url: callbackUrl || process.env.PAYSTACK_CALLBACK_URL,
    }),
  });
  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || 'Paystack could not start this transaction.');
  }
  return data.data; // { authorization_url, access_code, reference }
}

// Server-to-server confirmation — never trust a client redirect or webhook body alone.
async function verifyTransaction(reference) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || 'Paystack could not verify this transaction.');
  }
  return data.data; // { status: 'success' | 'failed' | 'abandoned', amount, reference, ... }
}

module.exports = { initializeTransaction, verifyTransaction };

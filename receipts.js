const prisma = require('./prisma');
const { verifyTransaction } = require('./paystack');

// Confirms a payment by its gateway reference. Idempotent and safe to call from
// both the Paystack webhook and the browser-redirect verify endpoint — whichever
// arrives first does the work; the other just gets back the same result.
async function confirmPayment(reference) {
  const payment = await prisma.payment.findUnique({ where: { gatewayReference: reference } });
  if (!payment) return { found: false };

  if (payment.status === 'successful') {
    const receipt = await prisma.receipt.findUnique({ where: { paymentId: payment.id } });
    return { found: true, payment, receipt, alreadyProcessed: true, success: true };
  }

  const verified = await verifyTransaction(reference);

  if (verified.status !== 'success') {
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: verified.status },
    });
    return { found: true, payment: updated, alreadyProcessed: false, success: false };
  }

  const receiptNumber = `DFA-${payment.id.slice(-8).toUpperCase()}`;

  const [updatedPayment, , receipt] = await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: 'successful' } }),
    prisma.fee.update({ where: { id: payment.feeId }, data: { status: 'PAID' } }),
    prisma.receipt.create({ data: { paymentId: payment.id, receiptNumber } }),
  ]);

  return { found: true, payment: updatedPayment, receipt, alreadyProcessed: false, success: true };
}

module.exports = { confirmPayment };

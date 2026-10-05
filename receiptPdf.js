const PDFDocument = require('pdfkit');

// Streams a simple receipt PDF to res. `receipt` must include payment -> fee -> student.
function streamReceiptPdf(res, receipt) {
  const { payment } = receipt;
  const { fee } = payment;
  const { student } = fee;
  const nairaAmount = (payment.amount / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${receipt.receiptNumber}.pdf"`);

  const doc = new PDFDocument({ size: 'A5', margin: 40 });
  doc.pipe(res);

  doc.fontSize(16).text('De Fountain of Knowledge Academy', { align: 'center' });
  doc.fontSize(10).fillColor('#666666').text('Wudil, Kano State, Nigeria', { align: 'center' });
  doc.moveDown(1.5);

  doc.fillColor('#000000').fontSize(13).text('Payment Receipt', { align: 'center' });
  doc.moveDown(1);

  const row = (label, value) => {
    doc.fontSize(10).fillColor('#666666').text(label, { continued: true });
    doc.fillColor('#000000').text(`  ${value}`);
  };

  row('Receipt No:', receipt.receiptNumber);
  row('Date:', receipt.issuedAt.toDateString());
  row('Student:', student.name);
  row('Class:', `${student.className} (${student.section})`);
  row('Description:', fee.description);
  row('Term:', fee.term);
  row('Reference:', payment.gatewayReference);
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('#000000').text(`Amount Paid: NGN ${nairaAmount}`, { underline: true });

  doc.moveDown(2);
  doc.fontSize(9).fillColor('#888888')
    .text('This receipt was generated automatically on successful payment.', { align: 'center' });

  doc.end();
}

module.exports = { streamReceiptPdf };

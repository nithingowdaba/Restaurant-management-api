// Convert decimal currency to integer paise to avoid floating-point arithmetic.
function toPaise(value) {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Money must have at most two decimal places');
  const [rupees, fraction = ''] = text.split('.');
  return Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
}

function fromPaise(paise) {
  return (paise / 100).toFixed(2);
}

module.exports = { toPaise, fromPaise };

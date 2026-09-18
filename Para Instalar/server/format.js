/** Formato colombiano: miles con punto (1.234.567). */
function formatNumber(n, decimals = 0) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  let intPart;
  let decPart = '';
  if (decimals > 0) {
    const fixed = abs.toFixed(decimals);
    const parts = fixed.split('.');
    intPart = parts[0];
    decPart = parts[1] || '';
  } else {
    intPart = String(Math.round(abs));
  }
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = decPart ? `${grouped},${decPart}` : grouped;
  return v < 0 ? `-${body}` : body;
}

function money(n) {
  return '$ ' + formatNumber(n);
}

function formatQty(n) {
  const v = Number(n) || 0;
  if (Math.abs(v - Math.round(v)) < 0.001) return formatNumber(v);
  return formatNumber(v, 2);
}

module.exports = { formatNumber, money, formatQty };

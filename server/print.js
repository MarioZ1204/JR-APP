const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getDb, getSetting } = require('./db');
const { parseRemoved, parseAdded } = require('./inventory');

function money(n) {
  return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO');
}

function pad(left, right, width) {
  const l = ascii(left);
  const r = ascii(right);
  const space = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(space) + r;
}

function removedLine(it) {
  const list = parseRemoved(it.removed_json);
  if (!list.length) return '';
  const names = list.map((x) => x.name).filter(Boolean);
  return names.length ? 'Sin ' + names.join(', ') : '';
}

function addedLine(it) {
  const list = parseAdded(it.added_json);
  if (!list.length) return '';
  const names = list.map((x) => x.name).filter(Boolean);
  return names.length ? 'Extra ' + names.join(', ') : '';
}

function itemNotesLines(it) {
  return [removedLine(it), addedLine(it)].filter(Boolean);
}

function wrap(text, width) {
  const words = ascii(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function ascii(text) {
  return String(text || '')
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i').replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .replace(/¡/g, '').replace(/¿/g, '').replace(/[ÁÀÄÂ]/g, 'A')
    .replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U');
}

function invoicePayload(invoiceId) {
  const db = getDb();
  const inv = db.prepare(`
    SELECT i.*, t.name AS table_name, u.name AS cashier_name, o.id AS order_id
    FROM invoices i
    JOIN restaurant_tables t ON t.id = i.table_id
    JOIN users u ON u.id = i.cashier_id
    JOIN orders o ON o.id = i.order_id
    WHERE i.id = ?
  `).get(invoiceId);
  if (!inv) return null;

  const items = db.prepare(`
    SELECT product_name, quantity, unit_price, notes, removed_json, added_json
    FROM order_items
    WHERE order_id = ? AND status != 'cancelled'
    ORDER BY id
  `).all(inv.order_id);

  const payments = db.prepare('SELECT method, amount FROM payments WHERE invoice_id = ?').all(inv.id);
  return { inv, items, payments };
}

function ticketLines(payload) {
  const widthMm = Number(getSetting('printer_width', '80')) === 58 ? 58 : 80;
  const cols = widthMm === 58 ? 32 : 48;
  const { inv, items, payments } = payload;
  const lines = [];
  const push = (s) => lines.push(s);

  push(getSetting('business_name', 'JR Burger'));
  const nit = getSetting('business_nit', '');
  const address = getSetting('business_address', '');
  const phone = getSetting('business_phone', '');
  if (nit) push('NIT ' + nit);
  if (address) wrap(address, cols).forEach(push);
  if (phone) push(phone);
  push('-'.repeat(cols));
  push(`Ticket #${String(inv.number).padStart(5, '0')}`);
  push(`Fecha: ${inv.created_at}`);
  push(`Mesa: ${inv.table_name}`);
  push(`Cajero: ${inv.cashier_name}`);
  push('-'.repeat(cols));
  for (const it of items) {
    push(pad(`${it.quantity}x ${it.product_name}`, money(it.quantity * it.unit_price), cols));
    if (it.notes) wrap('  * ' + it.notes, cols).forEach(push);
    itemNotesLines(it).forEach((line) => wrap('  * ' + line, cols).forEach(push));
  }
  push('-'.repeat(cols));
  push(pad('Subtotal', money(inv.subtotal), cols));
  if (Number(inv.discount) > 0) push(pad('Descuento', '-' + money(inv.discount), cols));
  if (Number(inv.tax) > 0) push(pad(`IVA ${inv.tax_rate}%`, money(inv.tax), cols));
  if (Number(inv.tip) > 0) push(pad('Propina', money(inv.tip), cols));
  push(pad('TOTAL', money(inv.total), cols));
  push('-'.repeat(cols));
  for (const p of payments) {
    const label = p.method === 'efectivo' ? 'Efectivo' : p.method === 'nequi' ? 'Nequi' : 'Daviplata';
    push(pad(label, money(p.amount), cols));
  }
  if (Number(payload.change) > 0) push(pad('Vuelto', money(payload.change), cols));
  push('-'.repeat(cols));
  wrap(getSetting('ticket_footer', 'Gracias por su visita'), cols).forEach(push);
  push('');
  push('');
  return { lines, cols, widthMm };
}

function buildEscPos(payload) {
  const { lines } = ticketLines(payload);
  const chunks = [Buffer.from([0x1b, 0x40])];
  chunks.push(Buffer.from([0x1b, 0x61, 0x01]));
  let centered = true;
  for (let i = 0; i < lines.length; i++) {
    if (i === 4 && centered) {
      chunks.push(Buffer.from([0x1b, 0x61, 0x00]));
      centered = false;
    }
    chunks.push(Buffer.from(ascii(lines[i]) + '\n', 'latin1'));
  }
  chunks.push(Buffer.from([0x1d, 0x56, 0x00]));
  return Buffer.concat(chunks);
}

function ticketHtml(payload) {
  const { inv, items, payments } = payload;
  const widthMm = Number(getSetting('printer_width', '80')) === 58 ? 58 : 80;
  const name = getSetting('business_name', 'JR Burger');
  const nit = getSetting('business_nit', '');
  const address = getSetting('business_address', '');
  const phone = getSetting('business_phone', '');
  const footer = getSetting('ticket_footer', '¡Gracias por su visita!');
  const methodLabel = (m) => (m === 'efectivo' ? 'Efectivo' : m === 'nequi' ? 'Nequi' : 'Daviplata');

  const rows = items.map((it) => `
    <tr>
      <td>${it.quantity}x ${escapeHtml(it.product_name)}${it.notes ? `<div class="note">${escapeHtml(it.notes)}</div>` : ''}${itemNotesLines(it).map((line) => `<div class="note">${escapeHtml(line)}</div>`).join('')}</td>
      <td class="r">${money(it.quantity * it.unit_price)}</td>
    </tr>`).join('');

  const pays = payments.map((p) => `
    <tr><td>${methodLabel(p.method)}</td><td class="r">${money(p.amount)}</td></tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Ticket ${inv.number}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: ${widthMm}mm; margin: 0 auto; color: #000; }
  h1 { font-size: 12px; margin: 0 0 4px; text-align: center; }
  .c { text-align: center; }
  .muted { font-size: 12px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 2px 0; }
  .r { text-align: right; white-space: nowrap; }
  .note { font-size: 12px; }
  .total { font-weight: bold; font-size: 12px; }
  @media print { body { width: ${widthMm}mm; } }
</style></head>
<body>
  <h1><img src="/logo.png" alt="" width="56" height="56" style="display:block;margin:0 auto 6px;object-fit:contain">
  ${escapeHtml(name)}</h1>
  <div class="c muted">${nit ? 'NIT ' + escapeHtml(nit) + '<br>' : ''}${escapeHtml(address)}${phone ? '<br>' + escapeHtml(phone) : ''}</div>
  <hr>
  <div>Ticket #${String(inv.number).padStart(5, '0')}</div>
  <div>Fecha: ${escapeHtml(inv.created_at)}</div>
  <div>Mesa: ${escapeHtml(inv.table_name)}</div>
  <div>Cajero: ${escapeHtml(inv.cashier_name)}</div>
  <hr>
  <table>${rows}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${money(inv.subtotal)}</td></tr>
    ${Number(inv.discount) > 0 ? `<tr><td>Descuento</td><td class="r">-${money(inv.discount)}</td></tr>` : ''}
    ${Number(inv.tax) > 0 ? `<tr><td>IVA ${inv.tax_rate}%</td><td class="r">${money(inv.tax)}</td></tr>` : ''}
    ${Number(inv.tip) > 0 ? `<tr><td>Propina</td><td class="r">${money(inv.tip)}</td></tr>` : ''}
    <tr class="total"><td>TOTAL</td><td class="r">${money(inv.total)}</td></tr>
  </table>
  <hr>
  <table>${pays}</table>
  ${Number(payload.change) > 0 ? `<table><tr class="total"><td>Vuelto</td><td class="r">${money(payload.change)}</td></tr></table>` : ''}
  <hr>
  <p class="c">${escapeHtml(footer)}</p>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function kitchenPayload(order, items, stationLabel, extraRound) {
  const widthMm = Number(getSetting('printer_width', '80')) === 58 ? 58 : 80;
  const cols = widthMm === 58 ? 32 : 48;
  const name = getSetting('business_name', 'JR Burger');
  const when = new Date().toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  const lines = [];
  const push = (s) => lines.push(s);
  push(name);
  push('*** ' + stationLabel + ' ***');
  push(order.table_name || 'Mesa');
  if (extraRound) push('*** NUEVO ***');
  push('-'.repeat(cols));
  push('Pedido #' + order.id);
  push(when);
  if (order.waiter_name) push('Mesero: ' + order.waiter_name);
  push('-'.repeat(cols));
  for (const it of items) {
    wrap(`${it.quantity}x ${it.product_name}`, cols).forEach(push);
    if (it.notes) wrap('  * ' + it.notes, cols).forEach(push);
    itemNotesLines(it).forEach((line) => wrap('  * ' + line, cols).forEach(push));
    push('');
  }
  push('-'.repeat(cols));
  return { lines, cols, widthMm, name, stationLabel, extraRound, order, items, when };
}

function buildKitchenEscPos(payload) {
  const { order, items, extraRound, stationLabel, cols, when } = payload;
  const dash = '-'.repeat(cols);
  const chunks = [Buffer.from([0x1b, 0x40])];
  chunks.push(Buffer.from([0x1b, 0x61, 0x01]));
  chunks.push(Buffer.from(ascii(getSetting('business_name', 'JR Burger')) + '\n', 'latin1'));
  chunks.push(Buffer.from([0x1b, 0x45, 0x01]));
  chunks.push(Buffer.from('*** ' + ascii(stationLabel) + ' ***\n', 'latin1'));
  chunks.push(Buffer.from(ascii(order.table_name || 'Mesa') + '\n', 'latin1'));
  chunks.push(Buffer.from([0x1b, 0x45, 0x00]));
  if (extraRound) chunks.push(Buffer.from('*** NUEVO ***\n', 'latin1'));
  chunks.push(Buffer.from([0x1b, 0x61, 0x00]));
  chunks.push(Buffer.from(dash + '\n', 'latin1'));
  chunks.push(Buffer.from('Pedido #' + order.id + '\n', 'latin1'));
  chunks.push(Buffer.from(ascii(when) + '\n', 'latin1'));
  if (order.waiter_name) chunks.push(Buffer.from(ascii('Mesero: ' + order.waiter_name) + '\n', 'latin1'));
  chunks.push(Buffer.from(dash + '\n', 'latin1'));
  for (const it of items) {
    wrap(`${it.quantity}x ${it.product_name}`, cols).forEach((l) => {
      chunks.push(Buffer.from(ascii(l) + '\n', 'latin1'));
    });
    if (it.notes) {
      wrap('  * ' + it.notes, cols).forEach((l) => {
        chunks.push(Buffer.from(ascii(l) + '\n', 'latin1'));
      });
    }
    itemNotesLines(it).forEach((line) => {
      wrap('  * ' + line, cols).forEach((l) => {
        chunks.push(Buffer.from(ascii(l) + '\n', 'latin1'));
      });
    });
    chunks.push(Buffer.from('\n'));
  }
  chunks.push(Buffer.from(dash + '\n\n\n', 'latin1'));
  chunks.push(Buffer.from([0x1d, 0x56, 0x00]));
  return Buffer.concat(chunks);
}

function kitchenHtml(payload) {
  const { order, items, stationLabel, extraRound, when, widthMm, name } = payload;
  const rows = items.map((it) => `
    <div class="item">${it.quantity}x ${escapeHtml(it.product_name)}
      ${it.notes ? `<div class="note">* ${escapeHtml(it.notes)}</div>` : ''}
      ${itemNotesLines(it).map((line) => `<div class="note">* ${escapeHtml(line)}</div>`).join('')}
    </div>`).join('');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>${escapeHtml(stationLabel)} ${escapeHtml(order.table_name || '')}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 2mm; }
  body { font-family: 'Courier New', monospace; font-size: 13px; width: ${widthMm}mm; margin: 0 auto; color: #000; }
  h1 { font-size: 13px; margin: 0; text-align: center; }
  h2 { font-size: 13px; margin: 6px 0 4px; text-align: center; font-weight: bold; }
  .c { text-align: center; }
  .nuevo { font-weight: bold; text-align: center; margin: 4px 0; font-size: 13px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .item { font-size: 13px; font-weight: bold; margin: 8px 0; }
  .note { font-size: 13px; font-weight: normal; }
</style></head>
<body>
  <h1>${escapeHtml(name)}</h1>
  <div class="c">*** ${escapeHtml(stationLabel)} ***</div>
  <h2>${escapeHtml(order.table_name || 'Mesa')}</h2>
  ${extraRound ? '<div class="nuevo">*** NUEVO ***</div>' : ''}
  <hr>
  <div>Pedido #${order.id}</div>
  <div>${escapeHtml(when)}</div>
  ${order.waiter_name ? `<div>Mesero: ${escapeHtml(order.waiter_name)}</div>` : ''}
  <hr>
  ${rows}
  <hr>
</body></html>`;
}

function printRawWindows(buffer, printerName) {
  return new Promise((resolve) => {
    const tmp = path.join(__dirname, '..', 'data', `ticket-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
    fs.writeFileSync(tmp, buffer);
    const dest = printerName.includes('\\') ? printerName : `\\\\localhost\\${printerName}`;
    const child = spawn('cmd.exe', ['/c', 'copy', '/b', tmp, dest], { windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: err || 'No se pudo enviar a la impresora' });
    });
    child.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

async function printInvoice(invoiceId, extra = {}) {
  const payload = invoicePayload(invoiceId);
  if (!payload) return { ok: false, error: 'Cuenta no encontrada', html: null };
  if (Number(extra.change) > 0) payload.change = Number(extra.change);

  const html = ticketHtml(payload);
  const enabled = getSetting('printer_enabled', '0') === '1';
  const printerName = getSetting('printer_name', '').trim();

  if (!enabled || !printerName) {
    return {
      ok: true,
      mode: 'browser',
      html,
      message: 'Se abre el recibo para imprimir. Si no hay impresora, el cobro ya quedó guardado.'
    };
  }

  try {
    const buf = buildEscPos(payload);
    const sent = await printRawWindows(buf, printerName);
    if (sent.ok) return { ok: true, mode: 'usb', html, message: 'Recibo enviado a la impresora' };
    return {
      ok: false,
      mode: 'browser',
      html,
      error: sent.error,
      message: 'No se pudo imprimir directo. Puede imprimir desde el computador. El cobro ya quedó.'
    };
  } catch (e) {
    return {
      ok: false,
      mode: 'browser',
      html,
      error: e.message,
      message: 'No se pudo imprimir. El cobro ya quedó: imprima desde el computador.'
    };
  }
}

async function printTest() {
  const db = getDb();
  const last = db.prepare('SELECT id FROM invoices ORDER BY id DESC LIMIT 1').get();
  if (last) return printInvoice(last.id);
  const name = getSetting('business_name', 'JR Burger');
  const widthMm = Number(getSetting('printer_width', '80')) === 58 ? 58 : 80;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${widthMm}mm auto; margin: 2mm; }
    body { font-family: 'Courier New', monospace; font-size: 13px; width: ${widthMm}mm; text-align:center; }
  </style></head><body><h2>${escapeHtml(name)}</h2><p>Prueba de impresion</p><p>${new Date().toLocaleString('es-CO')}</p></body></html>`;
  return { ok: true, mode: 'browser', html, message: 'Todavía no hay cuentas cobradas. Esta es una prueba de impresión.' };
}

async function printKitchenOrder({ order, items, extraRound }) {
  const kitchen = items.filter((i) => i.station !== 'bar');
  const bar = items.filter((i) => i.station === 'bar');
  const jobs = [];
  if (kitchen.length) {
    const payload = kitchenPayload(order, kitchen, 'COCINA', extraRound);
    jobs.push({ buffer: buildKitchenEscPos(payload), html: kitchenHtml(payload) });
  }
  if (bar.length) {
    const payload = kitchenPayload(order, bar, 'BARRA', extraRound);
    jobs.push({ buffer: buildKitchenEscPos(payload), html: kitchenHtml(payload) });
  }
  if (!jobs.length) return { ok: true, mode: 'usb', html: null, message: '' };

  const html = jobs.map((j) => j.html).join('<div style="page-break-after:always"></div>');
  const enabled = getSetting('printer_enabled', '0') === '1';
  const printerName = getSetting('printer_name', '').trim();

  if (!enabled || !printerName) {
    return {
      ok: true,
      mode: 'browser',
      html,
      message: 'Se abre el ticket de cocina. El pedido ya quedó enviado.'
    };
  }

  try {
    let allOk = true;
    let lastErr = '';
    for (const job of jobs) {
      const sent = await printRawWindows(job.buffer, printerName);
      if (!sent.ok) {
        allOk = false;
        lastErr = sent.error || '';
      }
    }
    if (allOk) return { ok: true, mode: 'usb', html, message: 'Ticket de cocina impreso' };
    return {
      ok: false,
      mode: 'browser',
      html,
      error: lastErr,
      message: 'El pedido ya fue a cocina. No se pudo imprimir directo.'
    };
  } catch (e) {
    return {
      ok: false,
      mode: 'browser',
      html,
      error: e.message,
      message: 'El pedido ya fue a cocina. No se pudo imprimir directo.'
    };
  }
}

function paperSize() {
  const widthMm = Number(getSetting('printer_width', '80')) === 58 ? 58 : 80;
  const cols = widthMm === 58 ? 32 : 48;
  return { widthMm, cols };
}

function nowLocal() {
  return new Date().toLocaleString('es-CO');
}

function headerLines(cols) {
  const lines = [getSetting('business_name', 'JR Burger')];
  const nit = getSetting('business_nit', '');
  const address = getSetting('business_address', '');
  const phone = getSetting('business_phone', '');
  if (nit) lines.push('NIT ' + nit);
  if (address) wrap(address, cols).forEach((l) => lines.push(l));
  if (phone) lines.push(phone);
  lines.push('-'.repeat(cols));
  return lines;
}

function htmlFromLines(title, lines) {
  const { widthMm } = paperSize();
  const name = getSetting('business_name', 'JR Burger');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 2mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: ${widthMm}mm; margin: 0 auto; color: #000; }
  h1 { font-size: 12px; margin: 0 0 4px; text-align: center; }
  pre { font-family: inherit; font-size: 12px; white-space: pre-wrap; margin: 0; }
</style></head>
<body>
  <h1><img src="/logo.png" alt="" width="56" height="56" style="display:block;margin:0 auto 6px;object-fit:contain">${escapeHtml(name)}</h1>
  <pre>${escapeHtml(lines.join('\n'))}</pre>
</body></html>`;
}

function buildLinesEscPos(lines) {
  const chunks = [Buffer.from([0x1b, 0x40])];
  chunks.push(Buffer.from([0x1b, 0x61, 0x01]));
  let centered = true;
  for (let i = 0; i < lines.length; i++) {
    if (i === 3 && centered) {
      chunks.push(Buffer.from([0x1b, 0x61, 0x00]));
      centered = false;
    }
    chunks.push(Buffer.from(ascii(lines[i]) + '\n', 'latin1'));
  }
  chunks.push(Buffer.from('\n\n'));
  chunks.push(Buffer.from([0x1d, 0x56, 0x00]));
  return Buffer.concat(chunks);
}

async function printLines(title, lines, { savedMsg, failMsg }) {
  const html = htmlFromLines(title, lines);
  const enabled = getSetting('printer_enabled', '0') === '1';
  const printerName = getSetting('printer_name', '').trim();
  if (!enabled || !printerName) {
    return { ok: true, mode: 'browser', html, message: savedMsg };
  }
  try {
    const sent = await printRawWindows(buildLinesEscPos(lines), printerName);
    if (sent.ok) return { ok: true, mode: 'usb', html, message: 'Ticket enviado a la impresora' };
    return { ok: false, mode: 'browser', html, error: sent.error, message: failMsg };
  } catch (e) {
    return { ok: false, mode: 'browser', html, error: e.message, message: failMsg };
  }
}

function cashDiffText(n) {
  const v = Number(n) || 0;
  if (Math.round(v) === 0) return 'Cuadro';
  if (v > 0) return 'Sobra ' + money(v);
  return 'Falta ' + money(-v);
}

function methodLabel(m) {
  if (m === 'efectivo') return 'Efectivo';
  if (m === 'nequi') return 'Nequi';
  if (m === 'daviplata') return 'Daviplata';
  return m || '';
}

function loadRegister(registerId) {
  const db = getDb();
  const register = db.prepare(`
    SELECT r.*, ou.name AS opened_by_name, cu.name AS closed_by_name
    FROM cash_registers r
    JOIN users ou ON ou.id = r.opened_by
    LEFT JOIN users cu ON cu.id = r.closed_by
    WHERE r.id = ?
  `).get(registerId);
  if (!register) return null;
  const moves = db.prepare(
    'SELECT * FROM cash_movements WHERE register_id = ? ORDER BY id'
  ).all(registerId);
  const byMethod = { efectivo: 0, nequi: 0, daviplata: 0 };
  let sales = 0;
  let expenses = 0;
  for (const m of moves) {
    if (m.type === 'sale') {
      sales += m.amount;
      if (byMethod[m.method] != null) byMethod[m.method] += m.amount;
    } else if (m.type === 'expense' || m.type === 'withdrawal') {
      expenses += m.amount;
    }
  }
  const expected_cash = register.opening_amount + byMethod.efectivo - expenses;
  return { register, moves, sales, expenses, byMethod, expected_cash };
}

function cashOpenLines(pack) {
  const { cols } = paperSize();
  const r = pack.register;
  const lines = headerLines(cols);
  lines.push('APERTURA DE CAJA');
  lines.push('-'.repeat(cols));
  lines.push('Fecha: ' + (r.opened_at || nowLocal()));
  lines.push('Cajero: ' + (r.opened_by_name || ''));
  lines.push(pad('Base', money(r.opening_amount), cols));
  lines.push('-'.repeat(cols));
  wrap('Conserve este ticket para el cierre.', cols).forEach((l) => lines.push(l));
  lines.push('');
  return lines;
}

function cashExpenseLines({ userName, amount, description, expected }) {
  const { cols } = paperSize();
  const lines = headerLines(cols);
  lines.push('GASTO DE CAJA');
  lines.push('-'.repeat(cols));
  lines.push('Fecha: ' + nowLocal());
  if (userName) lines.push('Cajero: ' + userName);
  if (description) wrap(description, cols).forEach((l) => lines.push(l));
  lines.push(pad('Valor', money(amount), cols));
  if (expected != null) lines.push(pad('Queda en caja', money(expected), cols));
  lines.push('-'.repeat(cols));
  lines.push('');
  return lines;
}

function cashCloseLines(pack) {
  const { cols } = paperSize();
  const r = pack.register;
  const lines = headerLines(cols);
  lines.push('CIERRE DE CAJA');
  lines.push('-'.repeat(cols));
  lines.push('Abrio: ' + (r.opened_at || ''));
  lines.push('Cerro: ' + (r.closed_at || nowLocal()));
  if (r.opened_by_name) lines.push('Por: ' + r.opened_by_name);
  if (r.closed_by_name) lines.push('Cierre: ' + r.closed_by_name);
  lines.push('-'.repeat(cols));
  lines.push(pad('Base', money(r.opening_amount), cols));
  lines.push(pad('Ventas', money(pack.sales), cols));
  lines.push(pad('Efectivo', money(pack.byMethod.efectivo), cols));
  lines.push(pad('Nequi', money(pack.byMethod.nequi), cols));
  lines.push(pad('Daviplata', money(pack.byMethod.daviplata), cols));
  lines.push(pad('Gastos', money(pack.expenses), cols));
  lines.push('-'.repeat(cols));
  const expected = r.expected_cash != null ? r.expected_cash : pack.expected_cash;
  const counted = r.closing_counted;
  const diff = r.difference != null ? r.difference : (counted != null ? counted - expected : 0);
  lines.push(pad('Deberia haber', money(expected), cols));
  if (counted != null) lines.push(pad('Contado', money(counted), cols));
  lines.push(pad(cashDiffText(diff), money(Math.abs(diff)), cols));
  if (r.notes) {
    lines.push('-'.repeat(cols));
    wrap('Nota: ' + r.notes, cols).forEach((l) => lines.push(l));
  }
  const gastos = pack.moves.filter((m) => m.type === 'expense' || m.type === 'withdrawal');
  if (gastos.length) {
    lines.push('-'.repeat(cols));
    lines.push('Gastos:');
    for (const m of gastos) {
      wrap((m.description || 'Gasto') + ' ' + money(m.amount), cols).forEach((l) => lines.push(l));
    }
  }
  lines.push('-'.repeat(cols));
  lines.push('');
  return lines;
}

async function printCashOpen(registerId, { reprint } = {}) {
  const pack = loadRegister(registerId);
  if (!pack) return { ok: false, error: 'Caja no encontrada', html: null };
  return printLines('Apertura de caja', cashOpenLines(pack), {
    savedMsg: reprint
      ? 'Se abre el ticket de apertura.'
      : 'Se abre el ticket de apertura. La caja ya quedó abierta.',
    failMsg: reprint
      ? 'No se pudo imprimir. Puede imprimir el ticket desde el computador.'
      : 'La caja ya quedó abierta. Puede imprimir el ticket desde el computador.'
  });
}

async function printCashExpense(info) {
  return printLines('Gasto de caja', cashExpenseLines(info), {
    savedMsg: 'Se abre el ticket del gasto. Ya quedó anotado.',
    failMsg: 'El gasto ya quedó. Puede imprimir el ticket desde el computador.'
  });
}

async function printCashClose(registerId, { reprint } = {}) {
  const pack = loadRegister(registerId);
  if (!pack) return { ok: false, error: 'Caja no encontrada', html: null };
  return printLines('Cierre de caja', cashCloseLines(pack), {
    savedMsg: reprint
      ? 'Se abre el ticket de cierre.'
      : 'Se abre el ticket de cierre. La caja ya quedó cerrada.',
    failMsg: reprint
      ? 'No se pudo imprimir. Puede imprimir el ticket desde el computador.'
      : 'La caja ya quedó cerrada. Puede imprimir el ticket desde el computador.'
  });
}

module.exports = {
  printInvoice,
  printTest,
  printKitchenOrder,
  printCashOpen,
  printCashExpense,
  printCashClose,
  invoicePayload,
  ticketHtml
};

export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
      body: options.body != null ? JSON.stringify(options.body) : undefined
    });
  } catch {
    const err = new Error('No hay conexión con el servidor. ¿Está prendido JR Burger?');
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'No se pudo completar. Intente de nuevo.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Formato colombiano: miles con punto ($ 1.234.567). */
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

export const money = (n) => '$ ' + formatNumber(n);
export const formatQty = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v - Math.round(v)) < 0.001) return formatNumber(v);
  return formatNumber(v, 2);
};

export const ROLE = {
  admin: 'Jefe',
  waiter: 'Mesero',
  kitchen: 'Cocina',
  cashier: 'Cajero'
};

export const TABLE_STATUS = {
  free: 'Libre',
  occupied: 'Ocupada',
  waiting_payment: 'Por cobrar',
  reserved: 'Reservada'
};

export const ITEM_STATUS = {
  pending: 'Por hacer',
  preparing: 'Cocinando',
  ready: 'Listo',
  delivered: 'Servido',
  cancelled: 'Cancelado'
};

export const ORDER_STATUS = {
  open: 'Abierto',
  sent: 'En cocina',
  preparing: 'Cocinando',
  ready: 'Listo',
  delivered: 'Servido',
  billed: 'Pagado',
  cancelled: 'Cancelado'
};

export const MOVE_TYPE = {
  purchase: 'Entrada',
  sale: 'Venta',
  adjustment: 'Corrección',
  waste: 'Se desechó'
};

export const UNIT_KIND_LABELS = {
  count: 'Por piezas',
  weight: 'Por peso',
  volume: 'Por volumen',
  portion: 'Por porción de cocina'
};

export const UNITS_BY_KIND = {
  count: ['unidad', 'rodaja', 'loncha', 'rebanada', 'pieza', 'hoja'],
  weight: ['g', 'kg'],
  volume: ['ml', 'L'],
  portion: ['porción']
};

export function inferUnitKind(unit) {
  const u = String(unit || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['g', 'kg', 'gramo', 'gramos', 'kilogramo', 'kilogramos'].includes(u)) return 'weight';
  if (['ml', 'l', 'litro', 'litros', 'cc'].includes(u)) return 'volume';
  if (['porcion', 'porciones'].includes(u)) return 'portion';
  return 'count';
}

export function unitKindLabel(kind) {
  return UNIT_KIND_LABELS[kind] || UNIT_KIND_LABELS.count;
}

export const PAY = {
  efectivo: 'Efectivo',
  nequi: 'Nequi',
  daviplata: 'Daviplata'
};

function localDateStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function today() {
  return localDateStr(new Date());
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - Number(n) || 0);
  return localDateStr(d);
}

export function navFor(role) {
  const all = [
    { id: 'panel', label: 'Panel', ico: 'panel', roles: ['admin'] },
    { id: 'mesas', label: 'Mesas', ico: 'mesas', roles: ['admin', 'waiter', 'cashier'] },
    { id: 'cocina', label: 'Cocina', ico: 'cocina', roles: ['admin', 'kitchen'] },
    { id: 'facturar', label: 'Cobrar', ico: 'cobrar', roles: ['admin', 'cashier'] },
    { id: 'caja', label: 'Caja', ico: 'caja', roles: ['admin', 'cashier'] },
    { id: 'inventario', label: 'Inventario', ico: 'insumos', roles: ['admin'] },
    { id: 'productos', label: 'Menú', ico: 'carta', roles: ['admin'] },
    { id: 'reportes', label: 'Informes', ico: 'reportes', roles: ['admin'] },
    { id: 'usuarios', label: 'Personal', ico: 'equipo', roles: ['admin'] },
    { id: 'config', label: 'Ajustes', ico: 'ajustes', roles: ['admin'] }
  ];
  return all.filter((i) => i.roles.includes(role));
}

export function allowedViews(role) {
  return [...navFor(role).map((i) => i.id), 'comanda'];
}

export function homeFor(role) {
  if (role === 'admin') return 'panel';
  if (role === 'kitchen') return 'cocina';
  if (role === 'cashier') return 'facturar';
  return 'mesas';
}

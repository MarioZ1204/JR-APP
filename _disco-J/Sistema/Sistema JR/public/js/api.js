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

export const money = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO');

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
  purchase: 'Compra',
  sale: 'Venta',
  adjustment: 'Corrección',
  waste: 'Se botó'
};

export const PAY = {
  efectivo: 'Efectivo',
  nequi: 'Nequi',
  daviplata: 'Daviplata'
};

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
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

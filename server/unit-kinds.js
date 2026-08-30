const UNIT_KINDS = ['count', 'weight', 'volume', 'portion'];

const UNIT_KIND_LABELS = {
  count: 'Por piezas',
  weight: 'Por peso',
  volume: 'Por volumen',
  portion: 'Por porción de cocina'
};

const UNITS_BY_KIND = {
  count: ['unidad', 'rodaja', 'loncha', 'rebanada', 'pieza', 'hoja'],
  weight: ['g', 'kg'],
  volume: ['ml', 'L'],
  portion: ['porción']
};

function inferUnitKind(unit) {
  const u = String(unit || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['g', 'kg', 'gramo', 'gramos', 'kilogramo', 'kilogramos'].includes(u)) return 'weight';
  if (['ml', 'l', 'litro', 'litros', 'cc'].includes(u)) return 'volume';
  if (['porcion', 'porciones'].includes(u)) return 'portion';
  return 'count';
}

function normalizeUnitKind(kind, unit) {
  const k = String(kind || '').trim();
  if (UNIT_KINDS.includes(k)) return k;
  return inferUnitKind(unit);
}

function defaultUnitForKind(kind) {
  const list = UNITS_BY_KIND[kind];
  return list ? list[0] : 'unidad';
}

function normalizeUnit(kind, unit) {
  const u = String(unit || '').trim();
  if (u) return u;
  return defaultUnitForKind(normalizeUnitKind(kind, u));
}

module.exports = {
  UNIT_KINDS,
  UNIT_KIND_LABELS,
  UNITS_BY_KIND,
  inferUnitKind,
  normalizeUnitKind,
  normalizeUnit,
  defaultUnitForKind
};

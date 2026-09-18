function fold(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Ingredientes estructurales o base: no se ofrecen como extra en el picker. */
const NON_ADDABLE_PATTERNS = [
  /^pan(\s|$| de)/,
  /^carne molida$/,
  /^carne de hamburguesa$/,
  /^aceite$/,
  /^papa(\s|$| a la)/,
  /^mezcla brownie$/,
  /^arepa$/,
  /^patacon$/,
  /^filete de (cerdo|pollo)$/,
  /^costilla ahumada$/,
  /^alitas de pollo$/,
  /^salchicha americana$/,
  /^salchicha$/,
  /^chorizo$/
];

function productIsSimpleOrder(product) {
  const cat = fold(product?.category_name || '');
  if (/adicional/.test(cat)) return true;
  if (/bebida/.test(cat)) return true;
  if (product?.station === 'bar') return true;
  return false;
}

function isIngredientAddable(ing) {
  const name = String(ing?.name || '').trim();
  if (!name) return false;
  const n = fold(name);
  return !NON_ADDABLE_PATTERNS.some((re) => re.test(n));
}

function productAllowsIngredientExtras(product) {
  return !productIsSimpleOrder(product);
}

function productAllowsCustomNotes(product) {
  return !productIsSimpleOrder(product);
}

function productHasChoices(product) {
  try {
    const groups = JSON.parse(product?.choices_json || '[]');
    return Array.isArray(groups) && groups.some((g) => g && Array.isArray(g.options) && g.options.length);
  } catch {
    return false;
  }
}

module.exports = {
  fold,
  isIngredientAddable,
  productAllowsIngredientExtras,
  productAllowsCustomNotes,
  productHasChoices
};

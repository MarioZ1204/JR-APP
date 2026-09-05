import { isIngredientAddable, productAllowsIngredientExtras } from './ingredient-rules.js?v=56';

function fold(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Lo más específico va primero. */
const KIND_RULES = [
  [/salsa|aderezo/, 'sauce'],
  [/ripio|fosforito|fosforo/, 'ripio'],
  [/maduro|platano maduro/, 'maduro'],
  [/patacon|toston/, 'patacon'],
  [/costill/, 'ribs'],
  [/alitas/, 'wings'],
  [/filete de cerdo|lomo de cerdo/, 'pork'],
  [/desmechad\w* de res|ropa vieja/, 'shredded-beef'],
  [/pollo desmechad|desmechad\w* de pollo/, 'shredded-chicken'],
  [/cerdo desmechad|desmechad\w* de cerdo/, 'shredded-pork'],
  [/pepinillo|pepinillos|pickle|encurtido/, 'pickle'],
  [/pepino/, 'cucumber'],
  [/rucula|arugula|berro/, 'arugula'],
  [/espinaca|spinach/, 'spinach'],
  [/lechuga/, 'lettuce'],
  [/tomate cherry|cherry|tomatito/, 'cherry'],
  [/tomate|jitomate/, 'tomato'],
  [/mozzarella|mozarela|mozzarela/, 'mozzarella'],
  [/azul|roquefort|blue cheese|cabra/, 'bluecheese'],
  [/queso|cheddar|americano|suizo/, 'cheese'],
  [/cebolla morada|cebolla lila|cebolla roja|morada/, 'redonion'],
  [/aros de cebolla|caramelizada|crispy onion|onion ring/, 'friedonion'],
  [/cebolla/, 'onion'],
  [/tocin|bacon|tocino|panceta|tocineta/, 'bacon'],
  [/jalapen|jalapeno|chile|aji|habanero|serrano|picante|rajas|sriracha|tabasco/, 'jalapeno'],
  [/aguacate|palta/, 'avocado'],
  [/guacamole|\bguac\b/, 'guacamole'],
  [/huevo/, 'egg'],
  [/jamon|mortadela/, 'ham'],
  [/salchicha/, 'sausage'],
  [/chorizo/, 'chorizo'],
  [/\bpapas?\b|fritas|french/, 'fries'],
  [/arepa/, 'arepa'],
  [/pepperoni|peperoni|salami/, 'pepperoni'],
  [/champinon|champignon|hongo|mushroom/, 'mushroom'],
  [/pimenton|pimiento|morron|capsicum/, 'pepper'],
  [/pina|pineapple|anana/, 'pineapple'],
  [/aceituna|oliva/, 'olive'],
  [/cilantro|coriandro/, 'cilantro'],
  [/coleslaw|repollo|col blanca|col morada/, 'coleslaw'],
  [/maiz|elote|choclo|maicit/, 'corn'],
  [/frijol|caraota|alubia/, 'beans'],
  [/ketchup|catsup|salsa de tomate/, 'ketchup'],
  [/mostaza|mustard/, 'mustard'],
  [/miel|honey/, 'honey'],
  [/vegetal|veggie|lenteja|falafel|tofu/, 'veggie'],
  [/ranch|ranchera/, 'ranch'],
  [/bbq|barbacoa|barbecue/, 'bbq'],
  [/pesto|chimichurri/, 'guacamole'],
  [/mayonesa|\bmayo\b/, 'mayo'],
  [/crema agria|sour cream|crema de leche/, 'cream'],
  [/camaron|shrimp|langostino/, 'shrimp'],
  [/pescado|salmon|atun|filete de pescado/, 'fish'],
  [/pollo|pechuga|nugget|pavo/, 'chicken'],
  [/aceite/, 'oil'],
  [/pan perro|pan de perro/, 'hotdog-bun'],
  [/\bpan\b|brioche|ciabatta|baguette/, 'bun'],
  [/carne|res|patty|molida|hamburguesa/, 'patty']
];

export function layerKind(name) {
  const n = fold(name);
  for (const [re, kind] of KIND_RULES) {
    if (re.test(n)) return kind;
  }
  return 'extra';
}

const PROTEIN = new Set(['patty', 'chicken', 'fish', 'veggie']);

export function dishShape(p) {
  const n = fold(p?.name);
  if (/hamburg|burger/.test(n)) return 'burger';
  if (/perro|hot.?dog|hotdog/.test(n)) return 'hotdog';
  if (/salchi/.test(n)) return 'salchipapa';
  if (/mazorc/.test(n)) return 'mazorca';
  if (/arepa/.test(n)) return 'arepa';
  if (/pizza/.test(n)) return 'pizza';
  if (/pepito|sandwich|s[aá]ndwich/.test(n)) return 'hotdog';
  if (/toston|patacon/.test(n)) return 'patacon';
  const rec = p?.recipe || [];
  const kinds = new Set(rec.map((r) => layerKind(r.ingredient_name)));
  if (kinds.has('bun') && [...PROTEIN].some((k) => kinds.has(k))) return 'burger';
  if (kinds.has('fries')) return 'salchipapa';
  if (kinds.has('corn') && !kinds.has('bun')) return 'mazorca';
  if (kinds.has('arepa')) return 'arepa';
  return 'bowl';
}

const SHAPE_PHOTO = {
  burger: 'hamburguesa',
  hotdog: 'perro',
  salchipapa: 'salchipapa',
  fries: 'salchipapa',
  mazorca: 'mazorca',
  arepa: 'arepa',
  patacon: 'especial',
  pizza: 'especial',
  bowl: 'especial'
};

function ingSrc(kind) {
  const k = kind || 'extra';
  if (k === 'hotdog-bun') {
    const path = '/icons/cats/perro.webp?v=64';
    return { path, fallback: path };
  }
  return {
    path: `/icons/ings/${k}.webp?v=64`,
    fallback: `/icons/ings/extra.webp?v=64`
  };
}

function dishPhoto(shape, p) {
  const cat = fold(p?.category_name || '');
  if (/bebida/.test(cat)) return '/icons/cats/bebida.webp?v=64';
  if (/adicional/.test(cat)) return '/icons/cats/adicional.webp?v=64';
  const key = SHAPE_PHOTO[shape] || 'especial';
  return `/icons/cats/${key}.webp?v=64`;
}

const SKIP_KINDS = new Set(['ketchup', 'mustard', 'mayo', 'ranch', 'bbq', 'cream', 'sauce', 'honey', 'garlic']);

function chipBtn(r, mode) {
  const kind = layerKind(r.ingredient_name || r.name);
  const { path, fallback } = ingSrc(kind);
  const id = r.ingredient_id || r.id;
  const name = r.ingredient_name || r.name;
  const on = mode === 'remove';
  return `
    <button type="button" class="ing-chip ${on ? 'on' : 'off'} ${mode === 'add' ? 'ing-chip-add' : ''}"
      data-id="${id}" data-mode="${mode}" aria-pressed="${on ? 'true' : 'false'}">
      <img class="ing-chip-img" src="${path}" alt="" width="36" height="36" decoding="async"
        onerror="this.onerror=null;this.src='${fallback}'" />
      <span class="ing-chip-txt">${name}</span>
      <span class="ing-chip-state"
        data-on="${mode === 'add' ? 'Extra' : 'Con'}"
        data-off="${mode === 'add' ? 'No' : 'Sin'}"></span>
    </button>`;
}

export function burgerPickerHtml(p, choosable, esc, allIngredients = []) {
  const recipe = p.recipe || [];
  const shape = dishShape(p);
  const photo = dishPhoto(shape, p);
  const inRecipe = new Set(recipe.map((r) => Number(r.ingredient_id)));
  const allowAdd = productAllowsIngredientExtras(p);

  const fixed = recipe.filter((r) => {
    if (Number(r.removable) === 0) return true;
    const kind = layerKind(r.ingredient_name);
    return SKIP_KINDS.has(kind) || /salsa|aderezo/i.test(r.ingredient_name);
  });

  const toggles = choosable.filter((r) => {
    const kind = layerKind(r.ingredient_name);
    return !SKIP_KINDS.has(kind) && !/salsa|aderezo/i.test(r.ingredient_name);
  });

  const addable = allowAdd
    ? (allIngredients || [])
      .filter((i) => !inRecipe.has(Number(i.id)))
      .filter((i) => isIngredientAddable(i))
      .filter((i) => {
        const kind = layerKind(i.name);
        return !SKIP_KINDS.has(kind) && !/salsa|aderezo/i.test(i.name);
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))
    : [];

  const fixedHtml = fixed.length
    ? `<div class="ing-fixed">
        <span class="ing-sec-label">Lleva siempre</span>
        <div class="ing-fixed-list">
          ${fixed.map((r) => {
            const kind = layerKind(r.ingredient_name);
            const { path, fallback } = ingSrc(kind);
            return `<span class="ing-fixed-pill" title="${esc(r.ingredient_name)}">
              <img src="${path}" alt="" width="28" height="28" decoding="async"
                onerror="this.onerror=null;this.src='${fallback}'" />
              ${esc(r.ingredient_name)}
            </span>`;
          }).join('')}
        </div>
      </div>`
    : '';

  const removeBlock = toggles.length
    ? `<div class="ing-toggle-block" data-list="remove">
        <div class="ing-sec-head">
          <span class="ing-sec-label">Puede quitar</span>
          <input type="search" class="ing-search" data-filter="remove" placeholder="Buscar…" autocomplete="off" />
        </div>
        <div class="ing-chips" data-chips="remove">${toggles.map((r) => chipBtn(r, 'remove')).join('')}</div>
      </div>`
    : '';

  const addBlock = addable.length
    ? `<div class="ing-toggle-block" data-list="add">
        <div class="ing-sec-head">
          <span class="ing-sec-label">Puede añadir</span>
          <input type="search" class="ing-search" data-filter="add" placeholder="Buscar…" autocomplete="off" />
        </div>
        <div class="ing-chips" data-chips="add">${addable.map((i) => chipBtn({ id: i.id, name: i.name }, 'add')).join('')}</div>
      </div>`
    : '';

  const boxesRemove = toggles.map((r) =>
    `<input type="checkbox" class="sr-only" name="ing" value="${r.ingredient_id}" checked id="ing-${r.ingredient_id}" />`
  ).join('');
  const boxesAdd = addable.map((i) =>
    `<input type="checkbox" class="sr-only" name="add" value="${i.id}" id="add-${i.id}" />`
  ).join('');

  return `
    <div class="dish-pick">
      <div class="dish-hero">
        <img class="dish-hero-img" src="${photo}" alt="" width="120" height="120" decoding="async" />
        <div class="dish-hero-copy">
          <strong>${esc(p.name)}</strong>
          <span class="dish-hero-hint">${allowAdd
    ? 'Quite o añada ingredientes. Use el buscador en cada lista.'
    : 'Revise los ingredientes incluidos y confirme el pedido.'}</span>
        </div>
      </div>
      ${fixedHtml}
      ${removeBlock}
      ${addBlock}
      ${!toggles.length && !addable.length ? '<p class="hint">No hay ingredientes opcionales en este producto.</p>' : ''}
      <p class="ing-summary" id="ing-summary" hidden></p>
      ${boxesRemove}
      ${boxesAdd}
    </div>`;
}

export function bindBurgerPicker(form) {
  const summary = form.querySelector('#ing-summary');

  function refreshSummary() {
    if (!summary) return;
    const off = [...form.querySelectorAll('.ing-chip[data-mode="remove"].off .ing-chip-txt')].map((el) => el.textContent.trim());
    const extras = [...form.querySelectorAll('.ing-chip[data-mode="add"].on .ing-chip-txt')].map((el) => el.textContent.trim());
    const parts = [];
    if (off.length) parts.push('Sin ' + off.join(', '));
    if (extras.length) parts.push('Extra ' + extras.join(', '));
    if (!parts.length) {
      summary.hidden = true;
      summary.textContent = '';
      return;
    }
    summary.hidden = false;
    summary.textContent = parts.join(' · ');
  }

  function setChip(el, on) {
    const id = el.dataset.id;
    const mode = el.dataset.mode;
    const box = form.querySelector(mode === 'add' ? `#add-${id}` : `#ing-${id}`);
    if (box) box.checked = on;
    el.classList.toggle('off', !on);
    el.classList.toggle('on', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
    refreshSummary();
  }

  form.addEventListener('click', (ev) => {
    const el = ev.target.closest('.ing-chip[data-id]');
    if (!el || !form.contains(el)) return;
    const id = el.dataset.id;
    const mode = el.dataset.mode;
    const box = form.querySelector(mode === 'add' ? `#add-${id}` : `#ing-${id}`);
    if (!box) return;
    ev.preventDefault();
    setChip(el, !box.checked);
  });

  form.addEventListener('input', (ev) => {
    const input = ev.target.closest('.ing-search');
    if (!input || !form.contains(input)) return;
    const key = fold(input.value);
    const list = input.dataset.filter;
    form.querySelectorAll(`.ing-chips[data-chips="${list}"] .ing-chip`).forEach((chip) => {
      const txt = fold(chip.querySelector('.ing-chip-txt')?.textContent || '');
      chip.hidden = key ? !txt.includes(key) : false;
    });
  });
}

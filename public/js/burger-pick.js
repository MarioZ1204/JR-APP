function fold(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Lo más específico va primero: “cebolla morada” no debe dibujarse como cebolla blanca. */
const KIND_RULES = [
  [/salsa|aderezo/, 'sauce'],
  [/ripio|fosforito|fosforo/, 'ripio'],
  [/maduro|platano maduro/, 'maduro'],
  [/patacon|toston/, 'patacon'],
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
const DOG_MEAT = new Set(['sausage', 'chorizo', 'ham']);
const CHOPPED_SHAPES = new Set(['salchipapa', 'fries', 'mazorca', 'patacon', 'bowl', 'arepa']);

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

function svgFor(kind, shape, main = false) {
  if (kind === 'sausage' || kind === 'chorizo') {
    const chopped = CHOPPED_SHAPES.has(shape) || (shape === 'hotdog' && !main);
    if (chopped) return SVGS[`${kind}-bits`] || SVGS[kind];
  }
  return SVGS[kind];
}

function dogInBun(meat) {
  const m = {
    sausage: { a: '#f07858', b: '#d44838', c: '#9a2820', s: '#f4b0a0' },
    chorizo: { a: '#e06040', b: '#c44028', c: '#8a2818', s: '#f09870' },
    ham: { a: '#f6c8cc', b: '#e89098', c: '#c86870', s: '#ffe8ea' }
  }[meat] || { a: '#f07858', b: '#d44838', c: '#9a2820', s: '#f4b0a0' };
  const specks = meat === 'chorizo'
    ? `<circle cx="70" cy="48" r="1.4" fill="#f0d090"/><circle cx="96" cy="52" r="1.2" fill="#f0d090"/><circle cx="128" cy="47" r="1.3" fill="#f0d090"/><circle cx="152" cy="51" r="1.1" fill="#f0d090"/>`
    : '';
  const marks = meat === 'ham'
    ? `<path d="M50 46h120" stroke="#f6c8cc" stroke-width="2.5" opacity=".7"/>`
    : `<path d="M58 42l8 14M88 40l9 16M118 40l9 16M148 42l8 14" stroke="#7a2018" stroke-width="1.4" opacity=".28"/>`;
  return `<svg viewBox="0 0 220 100" aria-hidden="true">
    <defs>
      <linearGradient id="hdb-${meat}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4cc7a"/><stop offset=".5" stop-color="#e09a40"/><stop offset="1" stop-color="#c47a28"/></linearGradient>
      <linearGradient id="hdc-${meat}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4d0"/><stop offset="1" stop-color="#f0c878"/></linearGradient>
      <linearGradient id="hdm-${meat}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.a}"/><stop offset=".45" stop-color="${m.b}"/><stop offset="1" stop-color="${m.c}"/></linearGradient>
    </defs>
    <ellipse cx="110" cy="90" rx="96" ry="8" fill="#c4a070" opacity=".35"/>
    <path d="M16 50c10-28 40-38 94-38s84 10 94 38c-8 12-40 18-94 18S24 62 16 50z" fill="url(#hdb-${meat})"/>
    <path d="M30 48c10-18 36-24 80-24s70 6 80 24c-8 8-34 12-80 12s-72-4-80-12z" fill="url(#hdc-${meat})"/>
    <path d="M28 52c14-16 160-16 164 0 0 12-18 18-82 18S28 64 28 52z" fill="url(#hdm-${meat})"/>
    <path d="M42 48c26-8 110-8 136 0" stroke="${m.s}" stroke-width="3.2" fill="none" opacity=".55"/>
    ${marks}${specks}
    <path d="M14 62c12 22 40 30 96 30s84-8 96-30c-10 8-40 14-96 14S24 70 14 62z" fill="url(#hdb-${meat})"/>
    <path d="M32 62c12 8 40 12 78 12s66-4 78-12" stroke="#ffe8b0" stroke-width="3" fill="none" opacity=".4"/>
    <path d="M26 60c16 10 48 14 84 14s68-4 84-14" stroke="#c47a28" stroke-width="2" fill="none" opacity=".35"/>
  </svg>`;
}

const SVGS = {
  'bun-bot': `<svg viewBox="0 0 220 52" aria-hidden="true">
    <defs>
      <linearGradient id="bb-crust" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2c56a"/><stop offset=".55" stop-color="#e09a3e"/><stop offset="1" stop-color="#c47a28"/></linearGradient>
      <linearGradient id="bb-crumb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe8b4"/><stop offset="1" stop-color="#f0c878"/></linearGradient>
    </defs>
    <ellipse cx="110" cy="40" rx="94" ry="10" fill="#b88848" opacity=".35"/>
    <path d="M16 28c8 18 180 18 188 0 0 14-22 22-94 22S16 42 16 28z" fill="url(#bb-crust)"/>
    <ellipse cx="110" cy="26" rx="90" ry="14" fill="url(#bb-crumb)"/>
    <ellipse cx="110" cy="24" rx="78" ry="8" fill="#fff3cc" opacity=".55"/>
    <path d="M30 26c20 8 140 8 160 0" stroke="#d49238" stroke-width="2" fill="none" opacity=".45"/>
  </svg>`,

  patty: `<svg viewBox="0 0 220 40" aria-hidden="true">
    <defs><linearGradient id="pt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5030"/><stop offset="1" stop-color="#4a2418"/></linearGradient></defs>
    <ellipse cx="110" cy="26" rx="88" ry="12" fill="#3a1c12" opacity=".35"/>
    <path d="M24 18c6-8 28-12 86-12s80 4 86 12c2 6-8 14-86 14S22 24 24 18z" fill="url(#pt)"/>
    <path d="M40 16c18-4 40-2 70 2 28 4 50 4 72-1" stroke="#c47848" stroke-width="2" fill="none" opacity=".45"/>
    <path d="M48 20l18 4M90 14l8 10M128 16l14 6M160 18l12 4" stroke="#2e160e" stroke-width="1.6" fill="none" opacity=".4"/>
    <ellipse cx="78" cy="16" rx="16" ry="4" fill="#a86840" opacity=".35"/>
  </svg>`,

  chicken: `<svg viewBox="0 0 220 38" aria-hidden="true">
    <defs><linearGradient id="ck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0c888"/><stop offset="1" stop-color="#c48a48"/></linearGradient></defs>
    <ellipse cx="110" cy="24" rx="86" ry="11" fill="#a07038" opacity=".3"/>
    <path d="M28 18c10-10 40-12 82-12s72 2 82 12c2 6-12 14-82 14S26 24 28 18z" fill="url(#ck)"/>
    <path d="M50 16c20-4 50-4 80 0 22 2 40 4 52 0" stroke="#ffe0b0" stroke-width="2.5" fill="none" opacity=".55"/>
    <path d="M70 20c16 2 36 2 54 0" stroke="#a07038" stroke-width="1.2" fill="none" opacity=".4"/>
  </svg>`,

  fish: `<svg viewBox="0 0 220 34" aria-hidden="true">
    <ellipse cx="110" cy="22" rx="84" ry="10" fill="#b8a078" opacity=".3"/>
    <ellipse cx="110" cy="16" rx="84" ry="12" fill="#e8d4a8"/>
    <ellipse cx="110" cy="14" rx="76" ry="8" fill="#f6ead0"/>
    <path d="M46 14c22 7 42-5 64 1s42 7 64-2" stroke="#c8b088" stroke-width="1.8" fill="none"/>
    <path d="M70 12l8 8M110 10l6 10M148 12l8 7" stroke="#d8c4a0" stroke-width="1.2" fill="none" opacity=".6"/>
  </svg>`,

  ham: `<svg viewBox="0 0 220 28" aria-hidden="true">
    <path d="M28 8h164c8 0 12 5 12 10s-4 10-12 10H28c-8 0-12-5-12-10s4-10 12-10z" fill="#e89098"/>
    <path d="M32 11h156" stroke="#f6c8cc" stroke-width="3"/>
    <path d="M36 18h148" stroke="#c86870" stroke-width="1.2" opacity=".35"/>
    <ellipse cx="70" cy="16" rx="10" ry="4" fill="#f8d0d4" opacity=".6"/>
  </svg>`,

  chorizo: `<svg viewBox="0 0 220 32" aria-hidden="true">
    <defs><linearGradient id="chz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e06040"/><stop offset="1" stop-color="#8a2818"/></linearGradient></defs>
    <path d="M22 16c10-12 166-12 176 0 0 11-14 14-88 14S22 27 22 16z" fill="url(#chz)"/>
    <path d="M36 13c24-5 124-5 148 0" stroke="#f09870" stroke-width="3" fill="none" opacity=".5"/>
    <ellipse cx="30" cy="16" rx="10" ry="8" fill="#a03020"/>
    <ellipse cx="190" cy="16" rx="10" ry="8" fill="#a03020"/>
    <circle cx="70" cy="15" r="1.6" fill="#f0d090"/><circle cx="96" cy="18" r="1.3" fill="#f0d090"/>
    <circle cx="124" cy="14" r="1.5" fill="#f0d090"/><circle cx="152" cy="17" r="1.2" fill="#f0d090"/>
  </svg>`,

  'chorizo-bits': `<svg viewBox="0 0 220 52" aria-hidden="true">
    <g transform="translate(46,28) rotate(-22)">
      <rect x="-16" y="-11" width="32" height="22" rx="7" fill="#7a2418"/>
      <rect x="-15" y="-12" width="30" height="20" rx="6" fill="#c44028"/>
      <rect x="-11" y="-9" width="22" height="12" rx="4" fill="#e06038"/>
      <circle cx="-4" cy="-2" r="1.4" fill="#f4d6a0"/><circle cx="5" cy="2" r="1.2" fill="#f4d6a0"/>
    </g>
    <g transform="translate(86,22) rotate(12)">
      <rect x="-15" y="-12" width="30" height="24" rx="8" fill="#8a2818"/>
      <rect x="-14" y="-13" width="28" height="21" rx="7" fill="#d44a30"/>
      <ellipse cx="0" cy="-2" rx="10" ry="7" fill="#ec7050"/>
      <circle cx="-5" cy="-3" r="1.3" fill="#f8e0b0"/><circle cx="4" cy="1" r="1.1" fill="#f8e0b0"/>
    </g>
    <g transform="translate(124,30) rotate(-8)">
      <rect x="-17" y="-11" width="34" height="22" rx="7" fill="#7a2018"/>
      <rect x="-16" y="-12" width="32" height="20" rx="6" fill="#c43828"/>
      <circle cx="-6" cy="-2" r="1.4" fill="#f0d090"/><circle cx="3" cy="3" r="1.5" fill="#f0d090"/><circle cx="8" cy="-4" r="1.1" fill="#f0d090"/>
    </g>
    <g transform="translate(162,24) rotate(18)">
      <rect x="-14" y="-10" width="28" height="20" rx="6" fill="#8a2c1c"/>
      <rect x="-13" y="-11" width="26" height="18" rx="5" fill="#d45032"/>
      <circle cx="-3" cy="-1" r="1.2" fill="#f4d6a0"/><circle cx="6" cy="2" r="1.3" fill="#f4d6a0"/>
    </g>
    <g transform="translate(68,38) rotate(8)">
      <ellipse rx="16" ry="13" fill="#7a2418"/><ellipse cy="-1" rx="14" ry="11" fill="#e05838"/>
      <ellipse cy="-2" rx="9" ry="7" fill="#f07858"/><circle cx="-3" cy="-2" r="1.2" fill="#f8e0b0"/>
    </g>
    <g transform="translate(110,40) rotate(-14)">
      <ellipse rx="15" ry="12" fill="#6a1c14"/><ellipse cy="-1" rx="13" ry="10" fill="#c44028"/>
      <circle cx="2" cy="-2" r="1.3" fill="#f4d6a0"/>
    </g>
    <g transform="translate(148,38) rotate(10)">
      <rect x="-13" y="-9" width="26" height="18" rx="6" fill="#8a2818"/>
      <rect x="-12" y="-10" width="24" height="16" rx="5" fill="#d44830"/>
      <circle cx="-2" cy="0" r="1.2" fill="#f0d090"/>
    </g>
  </svg>`,

  pepperoni: `<svg viewBox="0 0 220 30" aria-hidden="true">
    <circle cx="68" cy="15" r="13" fill="#a83020"/><circle cx="68" cy="14" r="11" fill="#d44a32"/><circle cx="64" cy="11" r="3" fill="#f08068" opacity=".5"/><circle cx="72" cy="16" r="1.6" fill="#6a8a28"/>
    <circle cx="110" cy="14" r="14" fill="#98281c"/><circle cx="110" cy="13" r="12" fill="#c4402c"/><circle cx="106" cy="10" r="3" fill="#e87058" opacity=".5"/><circle cx="114" cy="15" r="1.5" fill="#6a8a28"/>
    <circle cx="152" cy="16" r="13" fill="#a83020"/><circle cx="152" cy="15" r="11" fill="#d44a32"/><circle cx="148" cy="12" r="3" fill="#f08068" opacity=".5"/>
  </svg>`,

  cheese: `<svg viewBox="0 0 220 36" aria-hidden="true">
    <defs><linearGradient id="ch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#e8a820"/></linearGradient></defs>
    <path d="M18 8c20-4 50-6 92-6s72 2 92 6c4 4 8 12-4 18-20 8-50 12-88 12S30 28 22 22C10 16 14 12 18 8z" fill="url(#ch)"/>
    <path d="M28 10c24-3 56-4 84-2 26 2 52 4 72 8" stroke="#fff3b0" stroke-width="3" fill="none" opacity=".5"/>
    <circle cx="70" cy="16" r="3.2" fill="#f0c040" opacity=".55"/><circle cx="118" cy="20" r="2.6" fill="#f0c040" opacity=".5"/><circle cx="154" cy="14" r="2.4" fill="#f0c040" opacity=".45"/>
  </svg>`,

  mozzarella: `<svg viewBox="0 0 220 30" aria-hidden="true">
    <path d="M24 8c22-4 60-6 86-6s64 2 86 6c6 4 8 10 0 14-18 8-52 12-86 12S36 24 24 22C14 18 16 12 24 8z" fill="#f7f2e6"/>
    <path d="M36 11c20-2 50-3 74-1" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/>
    <circle cx="72" cy="18" r="2.2" fill="#e6dcc8"/><circle cx="120" cy="16" r="2" fill="#e6dcc8"/>
  </svg>`,

  bluecheese: `<svg viewBox="0 0 220 28" aria-hidden="true">
    <path d="M26 8c20-4 58-6 84-6s64 2 84 6c6 4 8 10 0 14-16 8-50 12-84 12S36 24 26 22C16 18 18 12 26 8z" fill="#eef2f4"/>
    <circle cx="64" cy="14" r="3.2" fill="#6a9ad8"/><circle cx="92" cy="18" r="2.4" fill="#4f7fb8"/><circle cx="128" cy="13" r="3" fill="#7aa8dc"/><circle cx="156" cy="17" r="2.2" fill="#5a88c0"/>
  </svg>`,

  bacon: `<svg viewBox="0 0 220 34" aria-hidden="true">
    <path d="M18 10c28 12 52-10 92-3 36 6 62 14 94 3l4 12c-40 12-70-4-102-7-38-3-62 12-90 5z" fill="#b83228"/>
    <path d="M22 14c26 10 48-8 86-2 34 5 58 12 90 3" stroke="#f4d2b0" stroke-width="4.5" fill="none"/>
    <path d="M20 20c28 10 52-6 88-1 32 4 58 10 86 2" stroke="#7a1c14" stroke-width="2" fill="none" opacity=".45"/>
    <path d="M30 12c20 6 40-4 70 0" stroke="#e8a090" stroke-width="1.5" fill="none" opacity=".4"/>
  </svg>`,

  mushroom: `<svg viewBox="0 0 220 32" aria-hidden="true">
    <ellipse cx="78" cy="20" rx="24" ry="9" fill="#b89068"/><path d="M56 18c8-14 36-14 44 0" fill="#d8c09a"/><path d="M62 17c10-4 24-4 34 0" stroke="#f0e0c4" stroke-width="2" fill="none" opacity=".5"/>
    <ellipse cx="142" cy="21" rx="22" ry="8" fill="#a88058"/><path d="M122 19c7-12 32-12 40 0" fill="#cbb08a"/>
  </svg>`,

  pineapple: `<svg viewBox="0 0 220 32" aria-hidden="true">
    <path d="M50 10l20 18H40z" fill="#f0c44a"/><path d="M58 8l5-8 5 8" fill="#4c9a32"/>
    <path d="M96 8l22 20H82z" fill="#e8b030"/><path d="M106 6l6-8 6 8" fill="#4c9a32"/>
    <path d="M142 10l20 18h-32z" fill="#f0c44a"/><path d="M150 8l5-8 5 8" fill="#4c9a32"/>
  </svg>`,

  pickle: `<svg viewBox="0 0 220 26" aria-hidden="true">
    <ellipse cx="70" cy="13" rx="30" ry="9" fill="#6a9a32"/><ellipse cx="70" cy="12" rx="22" ry="5" fill="#8cbc4a" opacity=".5"/>
    <circle cx="58" cy="12" r="1.5" fill="#e8f0b0"/><circle cx="78" cy="14" r="1.4" fill="#e8f0b0"/><circle cx="68" cy="11" r="1.2" fill="#e8f0b0"/>
    <ellipse cx="148" cy="14" rx="32" ry="9" fill="#5e8c2c"/><circle cx="136" cy="13" r="1.5" fill="#e8f0b0"/><circle cx="156" cy="15" r="1.4" fill="#e8f0b0"/>
  </svg>`,

  cucumber: `<svg viewBox="0 0 220 24" aria-hidden="true">
    <ellipse cx="74" cy="12" rx="34" ry="9" fill="#6aaa3c"/><ellipse cx="74" cy="12" rx="20" ry="4" fill="#e8f4d0" opacity=".75"/>
    <ellipse cx="146" cy="13" rx="32" ry="9" fill="#5e9a34"/><ellipse cx="146" cy="13" rx="18" ry="4" fill="#e8f4d0" opacity=".7"/>
  </svg>`,

  tomato: `<svg viewBox="0 0 220 40" aria-hidden="true">
    <ellipse cx="68" cy="22" rx="40" ry="15" fill="#b82820"/><ellipse cx="68" cy="20" rx="36" ry="12" fill="#e03a32"/>
    <path d="M48 20c8 6 24 8 40 0" stroke="#a02018" stroke-width="1.4" fill="none" opacity=".5"/>
    <ellipse cx="56" cy="16" rx="10" ry="4" fill="#f09088" opacity=".55"/>
    <ellipse cx="110" cy="20" rx="42" ry="16" fill="#c43028"/><ellipse cx="110" cy="18" rx="38" ry="13" fill="#ee4a3c"/>
    <ellipse cx="98" cy="14" rx="12" ry="5" fill="#f4a098" opacity=".6"/>
    <ellipse cx="154" cy="22" rx="38" ry="15" fill="#b82820"/><ellipse cx="154" cy="20" rx="34" ry="12" fill="#e03a32"/>
    <ellipse cx="142" cy="16" rx="10" ry="4" fill="#f09088" opacity=".5"/>
  </svg>`,

  cherry: `<svg viewBox="0 0 220 28" aria-hidden="true">
    <circle cx="70" cy="15" r="11" fill="#c82020"/><circle cx="67" cy="12" r="3.5" fill="#f08080" opacity=".55"/>
    <circle cx="110" cy="14" r="10" fill="#d02824"/><circle cx="107" cy="11" r="3" fill="#f08080" opacity=".5"/>
    <circle cx="148" cy="16" r="11" fill="#c82020"/><circle cx="145" cy="13" r="3.2" fill="#f08080" opacity=".5"/>
  </svg>`,

  pepper: `<svg viewBox="0 0 220 28" aria-hidden="true">
    <path d="M46 9c14 0 18 15 8 17-12 2-20-7-18-13 1-3 5-4 10-4z" fill="#e24"/><path d="M54 8v-5" stroke="#3a8a32" stroke-width="2"/>
    <path d="M98 8c16 0 20 17 8 19-14 2-22-8-20-15 1-3 6-4 12-4z" fill="#f5c542"/><path d="M108 7v-5" stroke="#3a8a32" stroke-width="2"/>
    <path d="M150 9c14 0 18 15 8 17-12 2-20-7-18-13 1-3 5-4 10-4z" fill="#3a8"/><path d="M158 8v-5" stroke="#2a6a28" stroke-width="2"/>
  </svg>`,

  jalapeno: `<svg viewBox="0 0 220 28" aria-hidden="true">
    <path d="M48 15c8-13 30-15 42-4 6 6 3 14-5 14-17 0-30-2-37-10z" fill="#2f8a30"/>
    <path d="M56 7l4-6" stroke="#5dad3c" stroke-width="2"/>
    <path d="M118 13c10-11 32-13 44-2 6 6 2 14-6 14-17 0-30-4-38-12z" fill="#267828"/>
    <path d="M128 6l5-6" stroke="#5dad3c" stroke-width="2"/>
  </svg>`,

  onion: `<svg viewBox="0 0 220 26" aria-hidden="true">
    <ellipse cx="78" cy="13" rx="32" ry="8" fill="#f6ead4" stroke="#d4b48a" stroke-width="1.6"/>
    <ellipse cx="78" cy="13" rx="18" ry="4" fill="none" stroke="#e8d0a8" stroke-width="1"/>
    <ellipse cx="144" cy="14" rx="30" ry="8" fill="#f8eedc" stroke="#d4b48a" stroke-width="1.6"/>
  </svg>`,

  redonion: `<svg viewBox="0 0 220 26" aria-hidden="true">
    <ellipse cx="78" cy="13" rx="32" ry="8" fill="#e8c4dc" stroke="#c088b8" stroke-width="1.6"/>
    <ellipse cx="78" cy="13" rx="18" ry="4" fill="none" stroke="#d4a0c8" stroke-width="1"/>
    <ellipse cx="144" cy="14" rx="30" ry="8" fill="#f0d0e6" stroke="#c088b8" stroke-width="1.6"/>
  </svg>`,

  friedonion: `<svg viewBox="0 0 220 28" aria-hidden="true">
    <ellipse cx="68" cy="15" rx="24" ry="10" fill="none" stroke="#d4a03a" stroke-width="3.5"/>
    <ellipse cx="110" cy="14" rx="22" ry="9" fill="none" stroke="#c49028" stroke-width="3.5"/>
    <ellipse cx="152" cy="16" rx="24" ry="10" fill="none" stroke="#e0b050" stroke-width="3.5"/>
  </svg>`,

  avocado: `<svg viewBox="0 0 220 32" aria-hidden="true">
    <ellipse cx="76" cy="16" rx="30" ry="12" fill="#5e9a32"/><ellipse cx="76" cy="16" rx="18" ry="7" fill="#d4e878"/><circle cx="76" cy="16" r="5" fill="#6a3a14"/>
    <ellipse cx="144" cy="17" rx="28" ry="11" fill="#6aaa3c"/><ellipse cx="144" cy="17" rx="16" ry="6" fill="#d0e070"/><circle cx="144" cy="17" r="4.5" fill="#6a3a14"/>
  </svg>`,

  guacamole: `<svg viewBox="0 0 220 22" aria-hidden="true">
    <path d="M28 10c28 10 56-6 82 2 28 8 52 10 82-2" stroke="#6aaa3c" stroke-width="9" stroke-linecap="round" fill="none"/>
    <path d="M44 12c22 6 44-2 68 2" stroke="#c8e878" stroke-width="3" fill="none"/>
  </svg>`,

  egg: `<svg viewBox="0 0 220 36" aria-hidden="true">
    <ellipse cx="110" cy="20" rx="56" ry="15" fill="#fff8ee" stroke="#e0d4c0" stroke-width="1.6"/>
    <circle cx="108" cy="20" r="11" fill="#f0b820"/><circle cx="104" cy="16" r="3.5" fill="#ffe070"/>
  </svg>`,

  corn: `<svg viewBox="0 0 220 64" aria-hidden="true">
    <ellipse cx="110" cy="56" rx="88" ry="10" fill="#d8c4a0"/>
    <ellipse cx="110" cy="50" rx="80" ry="9" fill="#fff8ee"/>
    <g transform="translate(62,28) rotate(-22)">
      <ellipse rx="46" ry="16" fill="#c49020"/>
      <ellipse ry="14" rx="43" fill="#e8b028"/>
      <g fill="#f5d24a">
        <ellipse cx="-32" cy="-6" rx="5" ry="6.2"/><ellipse cx="-22" cy="-6" rx="5" ry="6.2"/><ellipse cx="-12" cy="-6" rx="5" ry="6.2"/><ellipse cx="-2" cy="-6" rx="5" ry="6.2"/><ellipse cx="8" cy="-6" rx="5" ry="6.2"/><ellipse cx="18" cy="-6" rx="5" ry="6.2"/><ellipse cx="28" cy="-6" rx="5" ry="6.2"/>
        <ellipse cx="-28" cy="1" rx="5" ry="6.2" fill="#ffe07a"/><ellipse cx="-18" cy="1" rx="5" ry="6.2"/><ellipse cx="-8" cy="1" rx="5" ry="6.2" fill="#ffe07a"/><ellipse cx="2" cy="1" rx="5" ry="6.2"/><ellipse cx="12" cy="1" rx="5" ry="6.2" fill="#ffe07a"/><ellipse cx="22" cy="1" rx="5" ry="6.2"/>
        <ellipse cx="-32" cy="8" rx="5" ry="6"/><ellipse cx="-22" cy="8" rx="5" ry="6" fill="#e0a820"/><ellipse cx="-12" cy="8" rx="5" ry="6"/><ellipse cx="-2" cy="8" rx="5" ry="6" fill="#e0a820"/><ellipse cx="8" cy="8" rx="5" ry="6"/><ellipse cx="18" cy="8" rx="5" ry="6"/><ellipse cx="28" cy="8" rx="5" ry="6"/>
      </g>
    </g>
    <g transform="translate(148,30) rotate(18)">
      <ellipse rx="40" ry="14" fill="#c49020"/>
      <ellipse ry="12" rx="37" fill="#f0c440"/>
      <g fill="#ffe07a">
        <ellipse cx="-26" cy="-5" rx="4.6" ry="5.6"/><ellipse cx="-16" cy="-5" rx="4.6" ry="5.6"/><ellipse cx="-6" cy="-5" rx="4.6" ry="5.6"/><ellipse cx="4" cy="-5" rx="4.6" ry="5.6"/><ellipse cx="14" cy="-5" rx="4.6" ry="5.6"/><ellipse cx="24" cy="-5" rx="4.6" ry="5.6"/>
        <ellipse cx="-22" cy="2" rx="4.6" ry="5.6" fill="#e8b028"/><ellipse cx="-12" cy="2" rx="4.6" ry="5.6"/><ellipse cx="-2" cy="2" rx="4.6" ry="5.6" fill="#e8b028"/><ellipse cx="8" cy="2" rx="4.6" ry="5.6"/><ellipse cx="18" cy="2" rx="4.6" ry="5.6"/>
        <ellipse cx="-26" cy="8" rx="4.6" ry="5.4"/><ellipse cx="-16" cy="8" rx="4.6" ry="5.4" fill="#dca020"/><ellipse cx="-6" cy="8" rx="4.6" ry="5.4"/><ellipse cx="4" cy="8" rx="4.6" ry="5.4"/><ellipse cx="14" cy="8" rx="4.6" ry="5.4"/><ellipse cx="24" cy="8" rx="4.6" ry="5.4"/>
      </g>
    </g>
    <g fill="#f5d24a">
      <ellipse cx="40" cy="42" rx="6" ry="7.5" transform="rotate(-20 40 42)"/>
      <ellipse cx="58" cy="46" rx="5.5" ry="7" transform="rotate(12 58 46)" fill="#ffe07a"/>
      <ellipse cx="96" cy="48" rx="6" ry="7.2" transform="rotate(-8 96 48)"/>
      <ellipse cx="118" cy="44" rx="5.6" ry="7" transform="rotate(16 118 44)" fill="#e8b028"/>
      <ellipse cx="168" cy="46" rx="6" ry="7.4" transform="rotate(-14 168 46)"/>
      <ellipse cx="186" cy="40" rx="5.4" ry="6.8" transform="rotate(10 186 40)" fill="#ffe07a"/>
    </g>
  </svg>`,

  olive: `<svg viewBox="0 0 220 24" aria-hidden="true">
    <ellipse cx="68" cy="12" rx="13" ry="9" fill="#3d5c38"/><circle cx="68" cy="12" r="3.4" fill="#c43"/>
    <ellipse cx="110" cy="13" rx="12" ry="8" fill="#2f4a2c"/><circle cx="110" cy="13" r="3.2" fill="#c43"/>
    <ellipse cx="152" cy="12" rx="13" ry="9" fill="#3d5c38"/><circle cx="152" cy="12" r="3.4" fill="#c43"/>
  </svg>`,

  beans: `<svg viewBox="0 0 220 24" aria-hidden="true">
    <ellipse cx="68" cy="13" rx="11" ry="8" fill="#6b3a24"/><ellipse cx="98" cy="12" rx="12" ry="8" fill="#7a452c"/>
    <ellipse cx="130" cy="14" rx="11" ry="7" fill="#5c321c"/><ellipse cx="158" cy="13" rx="10" ry="7" fill="#6b3a24"/>
  </svg>`,

  coleslaw: `<svg viewBox="0 0 220 26" aria-hidden="true">
    <path d="M32 14c22-12 44 8 66 0s44-12 66 2 30 10 26-2" stroke="#f2e4cc" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M44 16c18-8 36 6 54 0" stroke="#c8e090" stroke-width="3.5" fill="none"/>
  </svg>`,

  arugula: `<svg viewBox="0 0 220 34" aria-hidden="true">
    <path d="M36 20c8-16 30-18 40-4 10-14 32-16 44-2 12-14 36-14 46 4 8 14-8 18-22 13-18 9-40 4-56-1-18 7-40 7-52-10z" fill="#2c7a28"/>
    <path d="M72 18c12-8 26-4 34 5" stroke="#6aaa40" stroke-width="2" fill="none"/>
  </svg>`,

  lettuce: `<svg viewBox="0 0 220 46" aria-hidden="true">
    <path d="M12 24c14-20 42-24 70-12 16-16 48-20 84-6 22 8 42 20 40 28-10 12-40 14-68 8-26 10-56 8-82 0-24 8-52 6-44-18z" fill="#3e9a30"/>
    <path d="M24 22c22-14 52-12 76 4 22-14 56-16 90 0" stroke="#8fd46a" stroke-width="5" fill="none"/>
    <path d="M40 26c20-10 44-8 64 4" stroke="#c8f098" stroke-width="2.5" fill="none" opacity=".8"/>
    <path d="M86 20c12-8 30-6 42 2" stroke="#6aaa40" stroke-width="2" fill="none" opacity=".6"/>
  </svg>`,

  spinach: `<svg viewBox="0 0 220 30" aria-hidden="true">
    <path d="M46 18c10-15 34-17 44-2 12-15 36-15 46 1 10 13-6 17-20 13-16 7-34 4-46 0-14 5-32 5-24-12z" fill="#2a6a30"/>
    <path d="M70 16c10-6 22-2 28 5" stroke="#5dad3c" stroke-width="2" fill="none"/>
  </svg>`,

  cilantro: `<svg viewBox="0 0 220 26" aria-hidden="true">
    <path d="M54 20c0-12 9-18 9-18s9 6 9 18" fill="#348a30"/>
    <path d="M96 20c0-12 9-18 9-18s9 6 9 18" fill="#2c7a28"/>
    <path d="M138 20c0-12 9-18 9-18s9 6 9 18" fill="#348a30"/>
    <circle cx="63" cy="8" r="3.4" fill="#5dad3c"/><circle cx="105" cy="7" r="3.4" fill="#4c9a38"/><circle cx="147" cy="8" r="3.4" fill="#5dad3c"/>
  </svg>`,

  ketchup: `<svg viewBox="0 0 220 16" aria-hidden="true"><path d="M42 8c22 8 44-4 68 2s48 7 72-2" stroke="#c0392b" stroke-width="6" stroke-linecap="round" fill="none"/></svg>`,
  mustard: `<svg viewBox="0 0 220 16" aria-hidden="true"><path d="M42 8c22 8 44-4 68 2s48 7 72-2" stroke="#e0b000" stroke-width="6" stroke-linecap="round" fill="none"/></svg>`,
  mayo: `<svg viewBox="0 0 220 16" aria-hidden="true"><path d="M42 8c22 8 44-4 68 2s48 7 72-2" stroke="#f4ead0" stroke-width="6" stroke-linecap="round" fill="none"/></svg>`,
  ranch: `<svg viewBox="0 0 220 16" aria-hidden="true"><path d="M42 8c22 8 44-4 68 2s48 7 72-2" stroke="#e8e0c8" stroke-width="6" stroke-linecap="round" fill="none"/></svg>`,
  bbq: `<svg viewBox="0 0 220 16" aria-hidden="true"><path d="M42 8c22 8 44-4 68 2s48 7 72-2" stroke="#6b2a18" stroke-width="6" stroke-linecap="round" fill="none"/></svg>`,
  cream: `<svg viewBox="0 0 220 16" aria-hidden="true"><path d="M42 8c22 8 44-4 68 2s48 7 72-2" stroke="#fff8f0" stroke-width="7" stroke-linecap="round" fill="none"/></svg>`,
  sauce: `<svg viewBox="0 0 220 16" aria-hidden="true"><path d="M40 8c20 10 40-4 70 2s50 8 78-2" stroke="#f3d7a0" stroke-width="6" stroke-linecap="round" fill="none"/></svg>`,
  honey: `<svg viewBox="0 0 220 16" aria-hidden="true"><path d="M42 8c22 8 44-4 68 2s48 7 72-2" stroke="#d4a017" stroke-width="6" stroke-linecap="round" fill="none"/></svg>`,
  garlic: `<svg viewBox="0 0 220 22" aria-hidden="true">
    <ellipse cx="70" cy="12" rx="14" ry="8" fill="#f4eedc" stroke="#d8d0b8"/><ellipse cx="110" cy="11" rx="13" ry="8" fill="#f7f2e4" stroke="#d8d0b8"/><ellipse cx="150" cy="12" rx="14" ry="8" fill="#f4eedc" stroke="#d8d0b8"/>
  </svg>`,

  shrimp: `<svg viewBox="0 0 220 28" aria-hidden="true">
    <path d="M48 18c8-14 30-18 44-6 8 8-4 15-14 12-8 9-24 9-30-6z" fill="#f08060"/><circle cx="82" cy="10" r="1.6" fill="#1c1714"/>
    <path d="M122 17c8-14 30-18 44-6 8 8-4 15-14 12-8 9-24 9-30-6z" fill="#e87050"/><circle cx="156" cy="9" r="1.6" fill="#1c1714"/>
  </svg>`,

  veggie: `<svg viewBox="0 0 220 36" aria-hidden="true">
    <ellipse cx="110" cy="20" rx="86" ry="14" fill="#4e7a30"/><ellipse cx="110" cy="16" rx="82" ry="11" fill="#6aaa40"/>
    <path d="M48 16h124" stroke="#c8e878" stroke-width="2.5" opacity=".5"/>
  </svg>`,

  sausage: `<svg viewBox="0 0 220 34" aria-hidden="true">
    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f07858"/><stop offset=".45" stop-color="#d44838"/><stop offset="1" stop-color="#9a2820"/></linearGradient></defs>
    <ellipse cx="110" cy="26" rx="90" ry="7" fill="#8a3028" opacity=".25"/>
    <path d="M18 16c12-12 172-12 184 0 0 11-16 14-92 14S18 27 18 16z" fill="url(#sg)"/>
    <path d="M34 13c28-6 124-6 152 0" stroke="#f4a090" stroke-width="3.5" fill="none" opacity=".55"/>
    <ellipse cx="24" cy="16" rx="10" ry="8" fill="#c43830"/>
    <ellipse cx="196" cy="16" rx="10" ry="8" fill="#c43830"/>
    <path d="M58 12l6 10M90 10l7 12M124 10l7 12M158 12l6 10" stroke="#7a2018" stroke-width="1.5" opacity=".35"/>
  </svg>`,

  'sausage-bits': `<svg viewBox="0 0 220 50" aria-hidden="true">
    <g transform="translate(48,24)">
      <ellipse rx="17" ry="14" fill="#8a2820"/><ellipse cy="-1.5" rx="15" ry="12" fill="#e05840"/>
      <ellipse cy="-3" rx="10" ry="7" fill="#f08068"/><ellipse cx="-4" cy="-5" rx="4" ry="2.2" fill="#f8c0b0" opacity=".7"/>
    </g>
    <g transform="translate(86,18) rotate(-12)">
      <ellipse rx="16" ry="13" fill="#7a2018"/><ellipse cy="-1" rx="14" ry="11" fill="#d44838"/>
      <ellipse cy="-2.5" rx="9" ry="6.5" fill="#ec7060"/><ellipse cx="-3" cy="-4" rx="3.5" ry="2" fill="#f8c0b0" opacity=".65"/>
    </g>
    <g transform="translate(122,22) rotate(8)">
      <ellipse rx="17" ry="14" fill="#8a2820"/><ellipse cy="-1.5" rx="15" ry="12" fill="#e05038"/>
      <ellipse cy="-3" rx="10" ry="7" fill="#f07860"/>
    </g>
    <g transform="translate(158,20) rotate(-6)">
      <ellipse rx="16" ry="13" fill="#7a2018"/><ellipse cy="-1" rx="14" ry="11" fill="#d44030"/>
      <ellipse cy="-2.5" rx="9" ry="6" fill="#ec6858"/><ellipse cx="-4" cy="-4" rx="3.5" ry="2" fill="#f8c0b0" opacity=".6"/>
    </g>
    <g transform="translate(70,36) rotate(14)">
      <ellipse rx="16" ry="13" fill="#6a1c14"/><ellipse cy="-1" rx="14" ry="11" fill="#dc4c38"/>
      <ellipse cy="-2.5" rx="9" ry="6.5" fill="#f07058"/>
    </g>
    <g transform="translate(108,38) rotate(-10)">
      <ellipse rx="17" ry="14" fill="#8a2820"/><ellipse cy="-1.5" rx="15" ry="12" fill="#e05840"/>
      <ellipse cy="-3" rx="10" ry="7" fill="#f08068"/><ellipse cx="-3" cy="-5" rx="4" ry="2" fill="#f8c0b0" opacity=".7"/>
    </g>
    <g transform="translate(146,36) rotate(6)">
      <ellipse rx="15" ry="12" fill="#7a2018"/><ellipse cy="-1" rx="13" ry="10" fill="#d44838"/>
      <ellipse cy="-2" rx="8" ry="6" fill="#ec7060"/>
    </g>
  </svg>`,

  fries: `<svg viewBox="0 0 220 78" aria-hidden="true">
    <ellipse cx="110" cy="64" rx="102" ry="14" fill="#d8c4a0"/>
    <ellipse cx="110" cy="58" rx="96" ry="12" fill="#f4ece0"/>
    <g transform="translate(46,50) rotate(-18)"><rect x="-32" y="-5" width="64" height="10" rx="5" fill="#e8a830"/><rect x="-30" y="-3.5" width="22" height="5" rx="2.5" fill="#fff3c0" opacity=".35"/></g>
    <g transform="translate(92,44) rotate(12)"><rect x="-36" y="-5.5" width="72" height="11" rx="5.5" fill="#f5c542"/><rect x="-34" y="-4" width="24" height="5" rx="2.5" fill="#fff3c0" opacity=".35"/></g>
    <g transform="translate(138,48) rotate(-8)"><rect x="-34" y="-5" width="68" height="10" rx="5" fill="#e0a028"/><rect x="-32" y="-3.5" width="20" height="5" rx="2.5" fill="#fff3c0" opacity=".3"/></g>
    <g transform="translate(172,52) rotate(22)"><rect x="-30" y="-4.5" width="60" height="9" rx="4.5" fill="#f0c94a"/></g>
    <g transform="translate(64,58) rotate(8)"><rect x="-34" y="-5" width="68" height="10" rx="5" fill="#ffe07a"/><rect x="-32" y="-3.5" width="18" height="5" rx="2.5" fill="#fff8d0" opacity=".4"/></g>
    <g transform="translate(110,56) rotate(-14)"><rect x="-38" y="-5.5" width="76" height="11" rx="5.5" fill="#e8b03a"/></g>
    <g transform="translate(148,60) rotate(6)"><rect x="-32" y="-5" width="64" height="10" rx="5" fill="#f5c542"/></g>
    <g transform="translate(38,42) rotate(-28)"><rect x="-26" y="-4" width="52" height="8" rx="4" fill="#d49420"/></g>
    <g transform="translate(78,38) rotate(16)"><rect x="-28" y="-4.5" width="56" height="9" rx="4.5" fill="#f8d060"/></g>
    <g transform="translate(124,38) rotate(-20)"><rect x="-30" y="-4.5" width="60" height="9" rx="4.5" fill="#e0a028"/></g>
    <g transform="translate(160,40) rotate(10)"><rect x="-26" y="-4" width="52" height="8" rx="4" fill="#ffe07a"/></g>
    <g transform="translate(100,62) rotate(18)"><rect x="-30" y="-4.5" width="60" height="9" rx="4.5" fill="#c88820"/></g>
    <g transform="translate(54,36) rotate(4)"><rect x="-24" y="-4" width="48" height="8" rx="4" fill="#f0c94a"/></g>
    <g transform="translate(186,46) rotate(-16)"><rect x="-22" y="-4" width="44" height="8" rx="4" fill="#e8b03a"/></g>
  </svg>`,

  'dog-bun': dogInBun('sausage'),
  'dog-sausage': dogInBun('sausage'),
  'dog-chorizo': dogInBun('chorizo'),
  'dog-ham': dogInBun('ham'),

  bowl: `<svg viewBox="0 0 220 58" aria-hidden="true">
    <path d="M18 22c8 30 42 36 92 36s84-6 92-36" fill="#d8c4a0"/>
    <path d="M28 24c8 24 38 30 82 30s74-6 82-30" fill="#fff8ee"/>
    <ellipse cx="110" cy="22" rx="92" ry="13" fill="#f4ece0"/>
    <ellipse cx="110" cy="20" rx="78" ry="8" fill="#fff" opacity=".35"/>
  </svg>`,

  arepa: `<svg viewBox="0 0 220 44" aria-hidden="true">
    <defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe8b0"/><stop offset="1" stop-color="#d4a048"/></linearGradient></defs>
    <ellipse cx="110" cy="26" rx="90" ry="16" fill="#c49038"/>
    <ellipse cx="110" cy="20" rx="88" ry="16" fill="url(#ar)"/>
    <ellipse cx="110" cy="16" rx="70" ry="8" fill="#fff3c8" opacity=".5"/>
    <path d="M50 18c20 6 40-4 60 0s40 6 60-1" stroke="#e8c060" stroke-width="2" fill="none" opacity=".5"/>
  </svg>`,

  pizza: `<svg viewBox="0 0 220 72" aria-hidden="true">
    <ellipse cx="110" cy="42" rx="98" ry="28" fill="#d4a04a"/>
    <ellipse cx="110" cy="38" rx="88" ry="24" fill="#e24a40"/>
    <ellipse cx="110" cy="36" rx="78" ry="20" fill="#f0c94a" opacity=".4"/>
    <circle cx="78" cy="34" r="8" fill="#c43020"/><circle cx="118" cy="30" r="7" fill="#c43020"/><circle cx="148" cy="38" r="8" fill="#c43020"/>
  </svg>`,

  ripio: `<svg viewBox="0 0 220 40" aria-hidden="true">
    <g transform="translate(48,22) rotate(-28)"><rect x="-18" y="-2" width="36" height="4" rx="2" fill="#e8b03a"/></g>
    <g transform="translate(78,16) rotate(16)"><rect x="-20" y="-2" width="40" height="4" rx="2" fill="#f5c542"/></g>
    <g transform="translate(112,18) rotate(-10)"><rect x="-22" y="-2" width="44" height="4" rx="2" fill="#ffe07a"/></g>
    <g transform="translate(146,20) rotate(22)"><rect x="-18" y="-2" width="36" height="4" rx="2" fill="#e8b03a"/></g>
    <g transform="translate(64,26) rotate(8)"><rect x="-16" y="-1.8" width="32" height="3.6" rx="1.8" fill="#d4a028"/></g>
    <g transform="translate(98,24) rotate(-22)"><rect x="-18" y="-1.8" width="36" height="3.6" rx="1.8" fill="#fff0a8"/></g>
    <g transform="translate(132,26) rotate(12)"><rect x="-16" y="-1.8" width="32" height="3.6" rx="1.8" fill="#f0c94a"/></g>
    <g transform="translate(168,22) rotate(-18)"><rect x="-14" y="-1.8" width="28" height="3.6" rx="1.8" fill="#e8b03a"/></g>
    <g transform="translate(88,30) rotate(18)"><rect x="-14" y="-1.6" width="28" height="3.2" rx="1.6" fill="#c49020"/></g>
    <g transform="translate(122,32) rotate(-8)"><rect x="-16" y="-1.6" width="32" height="3.2" rx="1.6" fill="#ffe07a"/></g>
    <g transform="translate(40,18) rotate(30)"><rect x="-12" y="-1.6" width="24" height="3.2" rx="1.6" fill="#f5c542"/></g>
    <g transform="translate(176,28) rotate(6)"><rect x="-12" y="-1.6" width="24" height="3.2" rx="1.6" fill="#d4a028"/></g>
  </svg>`,

  'shredded-beef': `<svg viewBox="0 0 220 40" aria-hidden="true">
    <path d="M24 12c36 14 70-10 108 4 30 10 52 14 70 2" stroke="#5a2e1c" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M22 20c40 12 78-8 116 6 26 8 48 10 64 2" stroke="#8a4a2c" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    <path d="M28 28c34 10 74-6 110 4 24 6 46 8 60 0" stroke="#4a2014" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M36 16c28 8 60-6 90 3 22 6 40 8 56 1" stroke="#c47850" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="M40 24c24 6 56-4 84 2" stroke="#6b3a24" stroke-width="4" fill="none" stroke-linecap="round"/>
  </svg>`,

  'shredded-chicken': `<svg viewBox="0 0 220 40" aria-hidden="true">
    <path d="M24 12c36 14 70-10 108 4 30 10 52 14 70 2" stroke="#c49050" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M22 20c40 12 78-8 116 6 26 8 48 10 64 2" stroke="#f0c890" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    <path d="M28 28c34 10 74-6 110 4 24 6 46 8 60 0" stroke="#b07840" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M36 16c28 8 60-6 90 3 22 6 40 8 56 1" stroke="#fff0d0" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
    <path d="M40 24c24 6 56-4 84 2" stroke="#d4a060" stroke-width="4" fill="none" stroke-linecap="round"/>
  </svg>`,

  'shredded-pork': `<svg viewBox="0 0 220 40" aria-hidden="true">
    <path d="M24 12c36 14 70-10 108 4 30 10 52 14 70 2" stroke="#b06048" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M22 20c40 12 78-8 116 6 26 8 48 10 64 2" stroke="#e0a090" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    <path d="M28 28c34 10 74-6 110 4 24 6 46 8 60 0" stroke="#8a4034" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M36 16c28 8 60-6 90 3 22 6 40 8 56 1" stroke="#f0c0b0" stroke-width="3" fill="none" stroke-linecap="round" opacity=".75"/>
    <path d="M40 24c24 6 56-4 84 2" stroke="#c47860" stroke-width="4" fill="none" stroke-linecap="round"/>
  </svg>`,

  patacon: `<svg viewBox="0 0 220 50" aria-hidden="true">
    <defs><linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5e08a"/><stop offset="1" stop-color="#c49028"/></linearGradient></defs>
    <ellipse cx="110" cy="32" rx="90" ry="16" fill="#a07820" opacity=".35"/>
    <ellipse cx="110" cy="24" rx="88" ry="18" fill="#c4a038"/>
    <ellipse cx="110" cy="22" rx="82" ry="15" fill="url(#pc)"/>
    <path d="M48 20c22 10 42-6 72 2s52 10 62-2" stroke="#b89028" stroke-width="2.4" fill="none" opacity=".5"/>
    <ellipse cx="86" cy="18" rx="16" ry="5" fill="#fff3c0" opacity=".35"/>
    <path d="M70 26c8 4 14 0 18-6" stroke="#8a6818" stroke-width="1.4" fill="none" opacity=".35"/>
  </svg>`,

  maduro: `<svg viewBox="0 0 220 34" aria-hidden="true">
    <g transform="translate(52,18) rotate(-18)">
      <rect x="-22" y="-8" width="44" height="16" rx="8" fill="#c49020"/>
      <rect x="-20" y="-9" width="40" height="14" rx="7" fill="#f0c040"/>
      <path d="M-12 0h24" stroke="#6a3a10" stroke-width="1.4" opacity=".4"/>
    </g>
    <g transform="translate(110,16) rotate(8)">
      <rect x="-24" y="-9" width="48" height="18" rx="9" fill="#b88018"/>
      <rect x="-22" y="-10" width="44" height="16" rx="8" fill="#e8b028"/>
      <path d="M-10 0h22" stroke="#5a3010" stroke-width="1.4" opacity=".4"/>
    </g>
    <g transform="translate(166,20) rotate(22)">
      <rect x="-20" y="-8" width="40" height="16" rx="8" fill="#c49020"/>
      <rect x="-18" y="-9" width="36" height="14" rx="7" fill="#f5c848"/>
      <path d="M-8 0h18" stroke="#6a3a10" stroke-width="1.3" opacity=".4"/>
    </g>
  </svg>`,

  'bun-top': `<svg viewBox="0 0 220 72" aria-hidden="true">
    <defs>
      <linearGradient id="bt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4cc7a"/><stop offset=".55" stop-color="#e09a40"/><stop offset="1" stop-color="#c47a28"/></linearGradient>
    </defs>
    <ellipse cx="110" cy="56" rx="96" ry="12" fill="#c47a2a"/>
    <path d="M14 50c10-38 48-48 96-48s86 10 96 48c-8 12-42 18-96 18S22 62 14 50z" fill="url(#bt)"/>
    <path d="M36 30c22-20 126-20 148 0" stroke="#ffe8b0" stroke-width="6" fill="none" opacity=".4"/>
    <circle cx="68" cy="32" r="3.2" fill="#f4e0b5"/><circle cx="108" cy="20" r="3.2" fill="#f4e0b5"/>
    <circle cx="148" cy="30" r="3.2" fill="#f4e0b5"/><circle cx="88" cy="24" r="2.4" fill="#f4e0b5"/>
    <circle cx="128" cy="26" r="2.4" fill="#f4e0b5"/><circle cx="168" cy="38" r="2.2" fill="#f4e0b5"/>
  </svg>`
};

const ORDER = [
  'bowl', 'patacon', 'fries', 'dog-bun', 'pizza', 'arepa', 'bun-bot',
  'patty', 'veggie', 'chicken', 'fish', 'sausage', 'ham', 'chorizo', 'pepperoni', 'bacon', 'mushroom',
  'shredded-beef', 'shredded-pork', 'shredded-chicken',
  'cheese', 'mozzarella', 'bluecheese', 'pineapple', 'pickle', 'cucumber', 'tomato', 'cherry',
  'pepper', 'jalapeno', 'onion', 'redonion', 'friedonion', 'avocado', 'egg', 'olive', 'corn', 'maduro',
  'beans', 'coleslaw', 'spinach', 'arugula', 'lettuce', 'cilantro', 'guacamole', 'ripio',
  'shrimp', 'extra', 'bun-top'
];

const SKIP_KINDS = new Set(['ketchup', 'mustard', 'mayo', 'ranch', 'bbq', 'cream', 'sauce', 'honey', 'garlic']);

function extraSvg(label, hue) {
  const t = String(label || '?').slice(0, 14);
  return `<svg viewBox="0 0 220 32" aria-hidden="true">
    <rect x="28" y="6" width="164" height="20" rx="10" fill="hsl(${hue} 52% 58%)"/>
    <text x="110" y="20" text-anchor="middle" font-size="11" font-family="DM Sans,sans-serif" font-weight="700" fill="#1c1714">${t}</text>
  </svg>`;
}

function hueOf(s) {
  let h = 0;
  for (const c of String(s)) h = (h + c.charCodeAt(0) * 17) % 360;
  return h;
}

function firstOf(recipe, kinds) {
  const set = kinds instanceof Set ? kinds : new Set(kinds);
  return recipe.find((r) => set.has(layerKind(r.ingredient_name)));
}

export function burgerPickerHtml(p, choosable, esc) {
  const recipe = p.recipe || [];
  const shape = dishShape(p);
  const tapIds = new Set(choosable.map((r) => r.ingredient_id));
  const layers = [];
  const seen = {};
  const skipIds = new Set();
  const proteinLine = firstOf(recipe, PROTEIN);
  const dogLine = firstOf(recipe, DOG_MEAT);
  const cornLine = firstOf(recipe, ['corn']);
  const friesLine = firstOf(recipe, ['fries']);

  if (shape === 'burger') {
    layers.push({ kind: 'bun-bot', id: null, tap: false, html: SVGS['bun-bot'] });
    const pk = proteinLine ? layerKind(proteinLine.ingredient_name) : 'patty';
    layers.push({
      kind: pk, id: null, tap: false,
      html: svgFor(pk, shape, true) || SVGS.patty,
      title: proteinLine?.ingredient_name || 'Carne'
    });
    if (proteinLine) skipIds.add(proteinLine.ingredient_id);
  } else if (shape === 'hotdog') {
    const mk = dogLine ? layerKind(dogLine.ingredient_name) : 'sausage';
    layers.push({
      kind: 'dog-bun', id: null, tap: false,
      html: SVGS[`dog-${mk}`] || SVGS['dog-sausage'],
      title: dogLine?.ingredient_name || 'Salchicha'
    });
    if (dogLine) skipIds.add(dogLine.ingredient_id);
  } else if (shape === 'patacon') {
    layers.push({ kind: 'patacon', id: null, tap: false, html: SVGS.patacon, title: 'Patacón' });
    const pata = firstOf(recipe, ['patacon']);
    if (pata) skipIds.add(pata.ingredient_id);
  } else if (shape === 'salchipapa' || shape === 'fries') {
    layers.push({ kind: 'fries', id: null, tap: false, html: SVGS.fries, title: friesLine?.ingredient_name || 'Papas' });
    if (friesLine) skipIds.add(friesLine.ingredient_id);
  } else if (shape === 'mazorca') {
    layers.push({ kind: 'corn', id: null, tap: false, html: SVGS.corn, title: cornLine?.ingredient_name || 'Mazorca' });
    if (cornLine) skipIds.add(cornLine.ingredient_id);
  } else if (shape === 'arepa') {
    layers.push({ kind: 'arepa', id: null, tap: false, html: SVGS.arepa });
  } else if (shape === 'pizza') {
    layers.push({ kind: 'pizza', id: null, tap: false, html: SVGS.pizza });
  } else {
    layers.push({ kind: 'bowl', id: null, tap: false, html: SVGS.bowl });
  }

  let extraN = 0;
  for (const r of recipe) {
    const kind = layerKind(r.ingredient_name);
    if ((shape === 'burger' || shape === 'hotdog') && kind === 'bun') continue;
    if (skipIds.has(r.ingredient_id)) continue;
    if (SKIP_KINDS.has(kind) || /salsa|aderezo/i.test(r.ingredient_name)) continue;
    const tap = tapIds.has(r.ingredient_id);
    if (kind === 'extra' || !SVGS[kind]) {
      extraN += 1;
      layers.push({
        kind: 'extra', id: r.ingredient_id, tap,
        html: extraSvg(esc(r.ingredient_name), hueOf(r.ingredient_name)),
        title: r.ingredient_name, shift: extraN
      });
      continue;
    }
    seen[kind] = (seen[kind] || 0) + 1;
    layers.push({
      kind, id: r.ingredient_id, tap,
      html: svgFor(kind, shape, false),
      title: r.ingredient_name,
      shift: seen[kind] > 1 ? seen[kind] : 0
    });
  }

  if (shape === 'burger') layers.push({ kind: 'bun-top', id: null, tap: false, html: SVGS['bun-top'] });

  layers.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

  const gap = (shape === 'hotdog' || shape === 'salchipapa' || shape === 'fries' || shape === 'mazorca' || shape === 'patacon') ? 14 : 22;
  const base = shape === 'hotdog' ? 186 : 208;
  const build = layers.map((lay, i) => {
    const top = base - i * gap - (lay.shift ? lay.shift * 6 : 0);
    const z = i + 1;
    const cls = `lay ${lay.kind}${lay.tap ? ' tap' : ' locked'}`;
    const idAttr = lay.id != null ? `data-id="${lay.id}"` : '';
    return `<div class="${cls}" ${idAttr} style="top:${top}px;z-index:${z};animation-delay:${i * 45}ms" title="${esc(lay.title || '')}">${lay.html}</div>`;
  }).join('');

  const chips = choosable.filter((r) => {
    const kind = layerKind(r.ingredient_name);
    return !SKIP_KINDS.has(kind) && !/salsa|aderezo/i.test(r.ingredient_name);
  }).map((r) => `
    <button type="button" class="ing-chip on" data-id="${r.ingredient_id}">
      <span class="ing-chip-dot ${layerKind(r.ingredient_name)}"></span>
      ${esc(r.ingredient_name)}
    </button>`).join('');

  const boxes = choosable.map((r) =>
    `<input type="checkbox" class="sr-only" name="ing" value="${r.ingredient_id}" checked id="ing-${r.ingredient_id}" />`
  ).join('');

  return `
    <div class="burger-stage shape-${shape}">
      <div class="burger-steam" aria-hidden="true"></div>
      <div class="burger-build" id="burger-build">${build || '<p class="hint">Toque abajo para armar el producto.</p>'}</div>
    </div>
    <p class="hint burger-hint">Toque el dibujo o el nombre para quitar un ingrediente. Si no quiere salsas, anótelo abajo como observación.</p>
    <div class="ing-chips">${chips}</div>
    ${boxes}`;
}

export function bindBurgerPicker(form) {
  const build = form.querySelector('#burger-build');

  function setOn(id, on) {
    const box = form.querySelector(`#ing-${id}`);
    if (box) box.checked = on;
    form.querySelectorAll(`[data-id="${id}"]`).forEach((el) => {
      el.classList.toggle('off', !on);
      el.classList.toggle('on', on);
    });
    const gone = form.querySelectorAll('.lay.tap.off').length;
    if (build) build.style.setProperty('--gone', String(gone));
  }

  form.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-id]');
    if (!el || !form.contains(el)) return;
    if (el.classList.contains('locked')) return;
    const id = el.dataset.id;
    const box = form.querySelector(`#ing-${id}`);
    if (!box) return;
    ev.preventDefault();
    setOn(id, !box.checked);
  });
}

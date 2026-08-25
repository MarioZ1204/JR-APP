const SODA = [
  'Coca-Cola', 'Coca-Cola Zero', 'Sprite', 'Quatro',
  'Postobón Colombiana', 'Postobón Manzana', 'Postobón Uva', 'Postobón Naranja',
  'Pepsi', '7UP'
];

const HIT = ['Mora', 'Lulo', 'Mango', 'Naranja', 'Tropical', 'Piña', 'Durazno'];

const FRUITS = [
  'Mora', 'Lulo', 'Mango', 'Maracuyá', 'Guanábana', 'Piña', 'Fresa',
  'Mango biche', 'Tomate de árbol', 'Guayaba', 'Naranja', 'Limón',
  'Papaya', 'Banano', 'Zapote', 'Corozo', 'Mandarina', 'Sandía'
];

const BEER = ['Poker', 'Budweiser', 'Club Colombia', 'Heineken'];

function choice(label, options) {
  return JSON.stringify([{ id: 'opcion', label, required: true, options }]);
}

const INGREDIENTS = [
  ['Pan hamburguesa', 'unidad', 80, 20],
  ['Pan perro', 'unidad', 80, 20],
  ['Arepa', 'unidad', 60, 15],
  ['Patacón', 'unidad', 40, 10],
  ['Papa a la francesa', 'porción', 80, 20],
  ['Carne de hamburguesa', 'unidad', 80, 20],
  ['Carne desmechada de res', 'porción', 40, 10],
  ['Pollo desmechado', 'porción', 40, 10],
  ['Cerdo desmechado', 'porción', 40, 10],
  ['Filete de cerdo', 'unidad', 30, 8],
  ['Filete de pollo', 'unidad', 30, 8],
  ['Costilla ahumada', 'g', 8000, 1500],
  ['Alitas de pollo', 'unidad', 80, 20],
  ['Chorizo', 'unidad', 40, 10],
  ['Salchicha americana', 'unidad', 50, 12],
  ['Salchicha', 'unidad', 50, 12],
  ['Tocineta', 'porción', 50, 12],
  ['Queso', 'porción', 80, 20],
  ['Huevo', 'unidad', 40, 10],
  ['Maduro', 'porción', 30, 8],
  ['Maicitos', 'porción', 40, 10],
  ['Ripio', 'porción', 50, 12],
  ['Lechuga', 'porción', 50, 12],
  ['Tomate', 'porción', 50, 12],
  ['Salsa tocineta', 'porción', 40, 10],
  ['Salsa de ajo', 'porción', 40, 10],
  ['Cerdo desmechado en miel', 'porción', 20, 5]
];

const H_BASE = [
  ['Pan hamburguesa', 1, 0],
  ['Ripio', 1, 1],
  ['Lechuga', 1, 1],
  ['Tomate', 1, 1]
];

const D_BASE = [
  ['Pan perro', 1, 0],
  ['Ripio', 1, 1]
];

const FRY = [['Papa a la francesa', 1, 0]];
const AREPA_SIDE = [['Arepa', 1, 0], ['Papa a la francesa', 1, 0]];

const PRODUCTS = [
  {
    cat: 'Especiales', station: 'kitchen', sort: 1,
    items: [
      { name: 'Alitas BBQ', price: 25000, rec: [['Alitas de pollo', 6, 0], ...FRY] },
      { name: 'Costillas BBQ', price: 25000, rec: [['Costilla ahumada', 350, 0], ...FRY] },
      { name: 'Tostón de la Casa', price: 16000, rec: [
        ['Patacón', 1, 0], ['Carne desmechada de res', 1, 1], ['Cerdo desmechado', 1, 1],
        ['Chorizo', 1, 1], ['Queso', 1, 1]
      ] },
      { name: 'Super Tostón', price: 24000, rec: [
        ['Patacón', 1, 0], ['Pollo desmechado', 1, 1], ['Cerdo desmechado', 1, 1],
        ['Carne desmechada de res', 1, 1], ['Costilla ahumada', 80, 1],
        ['Maicitos', 1, 1], ['Queso', 1, 1]
      ] }
    ]
  },
  {
    cat: 'Carnes', station: 'kitchen', sort: 2,
    items: [
      { name: 'Filete de cerdo', price: 17000, rec: [['Filete de cerdo', 1, 0], ...AREPA_SIDE] },
      { name: 'Filete de pollo', price: 17000, rec: [['Filete de pollo', 1, 0], ...AREPA_SIDE] },
      { name: 'Carne Mixta', price: 23000, rec: [['Filete de cerdo', 1, 0], ['Filete de pollo', 1, 0], ...AREPA_SIDE] },
      { name: 'Super Mixta', price: 28000, rec: [
        ['Filete de cerdo', 1, 0], ['Filete de pollo', 1, 0], ['Costilla ahumada', 80, 0],
        ['Chorizo', 1, 0], ...AREPA_SIDE
      ] }
    ]
  },
  {
    cat: 'Arepas', station: 'kitchen', sort: 3,
    items: [
      { name: 'Arepa rellena con queso', price: 8000, rec: [['Arepa', 1, 0], ['Queso', 1, 1]] },
      { name: 'Arepa rellena con carne', price: 11000, rec: [['Arepa', 1, 0], ['Carne desmechada de res', 1, 1]] },
      { name: 'Arepa Mixta 1', price: 16000, rec: [
        ['Arepa', 1, 0], ['Carne desmechada de res', 1, 1], ['Pollo desmechado', 1, 1],
        ['Chorizo', 1, 1], ['Maduro', 1, 1], ['Queso', 1, 1]
      ] },
      { name: 'Arepa Mixta 2', price: 16000, rec: [
        ['Arepa', 1, 0], ['Carne desmechada de res', 1, 1], ['Cerdo desmechado', 1, 1],
        ['Costilla ahumada', 80, 1], ['Queso', 1, 1]
      ] },
      { name: 'Arepa Burger', price: 17000, rec: [
        ['Arepa', 2, 0], ['Carne de hamburguesa', 1, 0], ['Pollo desmechado', 1, 1],
        ['Tocineta', 1, 1], ['Queso', 1, 1], ['Ripio', 1, 1], ['Lechuga', 1, 1], ['Tomate', 1, 1]
      ] }
    ]
  },
  {
    cat: 'Hamburguesas', station: 'kitchen', sort: 4,
    items: [
      { name: 'Hamburguesa Sencilla', price: 14000, rec: [...H_BASE, ['Carne de hamburguesa', 1, 0], ['Queso', 1, 1]] },
      { name: 'Hamburguesa Pollo', price: 14000, rec: [...H_BASE, ['Filete de pollo', 1, 0], ['Queso', 1, 1]] },
      { name: 'Hamburguesa de la Casa', price: 17000, rec: [
        ...H_BASE, ['Carne de hamburguesa', 1, 0], ['Pollo desmechado', 1, 1],
        ['Tocineta', 1, 1], ['Queso', 1, 1]
      ] },
      { name: 'Hamburguesa Pork', price: 17000, rec: [
        ...H_BASE, ['Filete de pollo', 1, 0], ['Cerdo desmechado en miel', 1, 1],
        ['Tocineta', 1, 1], ['Queso', 1, 1]
      ] },
      { name: 'Hamburguesa Ranchera', price: 18000, rec: [
        ...H_BASE, ['Carne de hamburguesa', 1, 0], ['Chorizo', 1, 1],
        ['Huevo', 1, 1], ['Tocineta', 1, 1], ['Queso', 1, 1]
      ] },
      { name: 'Hamburguesa Dan', price: 19000, rec: [
        ...H_BASE, ['Carne de hamburguesa', 1, 0], ['Maduro', 1, 1],
        ['Carne desmechada de res', 1, 1], ['Tocineta', 1, 1], ['Queso', 1, 1]
      ] },
      { name: 'Hamburguesa Mixta', price: 19000, rec: [
        ...H_BASE, ['Carne de hamburguesa', 1, 0], ['Filete de pollo', 1, 1],
        ['Tocineta', 1, 1], ['Queso', 1, 1]
      ] },
      { name: 'Hamburguesa Doble', price: 21000, rec: [
        ...H_BASE, ['Carne de hamburguesa', 2, 0], ['Tocineta', 2, 1], ['Queso', 2, 1]
      ] },
      { name: 'Hamburguesa Super', price: 25000, rec: [
        ...H_BASE, ['Carne de hamburguesa', 2, 0], ['Filete de pollo', 1, 1],
        ['Tocineta', 1, 1], ['Queso', 2, 1]
      ] },
      { name: 'Hamburguesa Ultra', price: 35000, rec: [
        ...H_BASE, ['Carne de hamburguesa', 3, 0], ['Filete de pollo', 1, 1],
        ['Pollo desmechado', 1, 1], ['Tocineta', 2, 1], ['Queso', 3, 1]
      ] }
    ]
  },
  {
    cat: 'Perros calientes', station: 'kitchen', sort: 5,
    items: [
      { name: 'Perro Sencillo', price: 10000, rec: [...D_BASE, ['Salchicha americana', 1, 0], ['Queso', 1, 1]] },
      { name: 'Perro Ranchero', price: 12000, rec: [...D_BASE, ['Salchicha americana', 1, 0], ['Tocineta', 1, 1], ['Queso', 1, 1]] },
      { name: 'Perro de la Casa', price: 14000, rec: [
        ...D_BASE, ['Salchicha americana', 1, 0], ['Pollo desmechado', 1, 1],
        ['Tocineta', 1, 1]
      ] },
      { name: 'Choriperro', price: 13000, rec: [...D_BASE, ['Chorizo', 1, 0], ['Queso', 1, 1]] },
      { name: 'Perra', price: 18000, rec: [
        ...D_BASE, ['Carne desmechada de res', 1, 1], ['Cerdo desmechado', 1, 1],
        ['Pollo desmechado', 1, 1], ['Tocineta', 1, 1], ['Maicitos', 1, 1], ['Queso', 1, 1]
      ] }
    ]
  },
  {
    cat: 'Salchipapas', station: 'kitchen', sort: 6,
    items: [
      { name: 'Salchipapa Sencilla', price: 10000, rec: [...FRY, ['Salchicha', 1, 0]] },
      { name: 'Salchicarne', price: 15000, rec: [...FRY, ['Carne desmechada de res', 1, 1], ['Queso', 1, 1], ['Salchicha', 1, 0]] },
      { name: 'Salchipollo', price: 15000, rec: [...FRY, ['Pollo desmechado', 1, 1], ['Queso', 1, 1], ['Salchicha', 1, 0]] },
      { name: 'Salchipapa Ranchera', price: 17000, rec: [
        ...FRY, ['Chorizo', 1, 1], ['Tocineta', 1, 1], ['Queso', 1, 1], ['Salchicha', 1, 0]
      ] },
      { name: 'Salchipapa Mixta', price: 19000, rec: [
        ...FRY, ['Carne desmechada de res', 1, 1], ['Pollo desmechado', 1, 1],
        ['Queso', 1, 1], ['Salchicha', 1, 0]
      ] }
    ]
  },
  {
    cat: 'Mazorcadas', station: 'kitchen', sort: 7,
    items: [
      { name: 'Mazorcada', price: 30000, rec: [
        ...FRY, ['Carne desmechada de res', 1, 1], ['Cerdo desmechado', 1, 1],
        ['Pollo desmechado', 1, 1], ['Chorizo', 1, 1], ['Maicitos', 1, 0],
        ['Queso', 1, 1], ['Salchicha', 1, 1]
      ] },
      { name: 'Mazorcada Familiar', price: 50000, rec: [
        ['Papa a la francesa', 2, 0], ['Carne desmechada de res', 2, 1], ['Cerdo desmechado', 2, 1],
        ['Pollo desmechado', 2, 1], ['Chorizo', 2, 1], ['Maicitos', 2, 0],
        ['Queso', 2, 1], ['Salchicha', 2, 1], ['Tocineta', 1, 1]
      ] }
    ]
  },
  {
    cat: 'Adicionales', station: 'kitchen', sort: 8,
    items: [
      { name: 'Porción de Papas', price: 5000, rec: FRY },
      { name: 'Porción de Maicitos', price: 3000, rec: [['Maicitos', 1, 0]] },
      { name: 'Porción de Queso', price: 3000, rec: [['Queso', 1, 0]] },
      { name: 'Porción de Tocineta', price: 3000, rec: [['Tocineta', 1, 0]] },
      { name: 'Carne desmechada extra', price: 5000, rec: [], choices: choice('Cuál carne', ['Pollo', 'Cerdo', 'Res']) },
      { name: 'Salchicha o Chorizo extra', price: 3000, rec: [], choices: choice('Cuál', ['Salchicha', 'Chorizo']) }
    ]
  },
  {
    cat: 'Bebidas', station: 'bar', sort: 9,
    items: [
      { name: 'Agua', price: 3000, rec: [] },
      { name: 'Gaseosa 400ml', price: 4500, rec: [], choices: choice('Marca y sabor', SODA) },
      { name: 'Gaseosa 1L', price: 7000, rec: [], choices: choice('Marca y sabor', SODA) },
      { name: 'Gaseosa 2.5L', price: 10000, rec: [], choices: choice('Marca y sabor', SODA) },
      { name: 'Jugo HIT', price: 5000, rec: [], choices: choice('Sabor HIT', HIT) },
      { name: 'Jugo HIT 1.5L', price: 7000, rec: [], choices: choice('Sabor HIT', HIT) },
      { name: 'Limonada Natural', price: 5000, rec: [] },
      { name: 'Jugo Natural', price: 5000, rec: [], choices: choice('Fruta', FRUITS) },
      { name: 'Jugo en Leche', price: 6500, rec: [], choices: choice('Fruta', FRUITS) },
      { name: 'Cerveza en lata', price: 5000, rec: [], choices: choice('Marca', BEER) },
      { name: 'Coronita', price: 6000, rec: [] }
    ]
  }
];

const HIDE = [
  'Hamburguesa clásica', 'Papas fritas', 'Gaseosa 350ml', 'Jugo natural', 'Café', 'Brownie'
];

function ensureCat(db, name, sort, station) {
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (row) {
    db.prepare('UPDATE categories SET sort_order = ?, station = ? WHERE id = ?').run(sort, station, row.id);
    return row.id;
  }
  return db.prepare('INSERT INTO categories (name, sort_order, station) VALUES (?, ?, ?)')
    .run(name, sort, station).lastInsertRowid;
}

function ensureIng(db, name, unit, stock, min) {
  const row = db.prepare('SELECT id FROM ingredients WHERE name = ?').get(name);
  if (row) return row.id;
  return db.prepare('INSERT INTO ingredients (name, unit, stock, min_stock) VALUES (?, ?, ?, ?)')
    .run(name, unit, stock, min).lastInsertRowid;
}

function seedCatalog(db) {
  const done = db.prepare("SELECT value FROM settings WHERE key = 'jr_menu_v1'").get();
  if (!done) {

  const hide = db.prepare('UPDATE products SET active = 0 WHERE name = ?');
  for (const name of HIDE) hide.run(name);

  const ings = {};
  for (const [name, unit, stock, min] of INGREDIENTS) {
    ings[name] = ensureIng(db, name, unit, stock, min);
  }

  const insProd = db.prepare(`
    INSERT INTO products (category_id, name, price, station, active, sort_order, choices_json)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `);
  const delRec = db.prepare('DELETE FROM recipes WHERE product_id = ?');
  const insRec = db.prepare(
    'INSERT INTO recipes (product_id, ingredient_id, quantity, removable) VALUES (?, ?, ?, ?)'
  );

  let n = 0;
  for (const group of PRODUCTS) {
    const catId = ensureCat(db, group.cat, group.sort, group.station);
    let i = 0;
    for (const p of group.items) {
      i += 1;
      n += 1;
      const exists = db.prepare('SELECT id FROM products WHERE name = ?').get(p.name);
      let id;
      if (exists) {
        id = exists.id;
        db.prepare(`
          UPDATE products SET category_id = ?, price = ?, station = ?, active = 1, sort_order = ?, choices_json = ?
          WHERE id = ?
        `).run(catId, p.price, group.station, i, p.choices || '[]', id);
      } else {
        id = insProd.run(catId, p.name, p.price, group.station, i, p.choices || '[]').lastInsertRowid;
      }
      delRec.run(id);
      for (const [ingName, qty, rem] of (p.rec || [])) {
        const ingId = ings[ingName];
        if (!ingId || !(qty > 0)) continue;
        insRec.run(id, ingId, qty, rem ? 1 : 0);
      }
    }
  }

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('jr_menu_v1', ?)").run(String(n));
  }

  db.prepare("UPDATE products SET name = 'Gaseosa 1L' WHERE name = 'Gaseosa 1.5L'").run();
  patchRipioAndSauces(db);
}

function patchRipioAndSauces(db) {
  // Renombrar "Papas fosforito" → "Ripio" (mismo ítem / icono)
  const fosfo = db.prepare("SELECT id FROM ingredients WHERE name = 'Papas fosforito'").get();
  const ripio = db.prepare("SELECT id FROM ingredients WHERE name = 'Ripio'").get();
  if (fosfo && !ripio) {
    db.prepare("UPDATE ingredients SET name = 'Ripio' WHERE id = ?").run(fosfo.id);
  } else if (fosfo && ripio && fosfo.id !== ripio.id) {
    db.prepare('UPDATE recipes SET ingredient_id = ? WHERE ingredient_id = ?').run(ripio.id, fosfo.id);
    db.prepare('DELETE FROM ingredients WHERE id = ?').run(fosfo.id);
  } else if (!ripio && !fosfo) {
    ensureIng(db, 'Ripio', 'porción', 50, 12);
  }

  const done = db.prepare("SELECT value FROM settings WHERE key = 'jr_visual_v2'").get();
  if (done) return;

  db.prepare(`
    DELETE FROM recipes WHERE ingredient_id IN (
      SELECT id FROM ingredients WHERE name IN ('Salsa tocineta', 'Salsa de ajo')
        OR lower(name) LIKE 'salsa %'
    )
  `).run();

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('jr_visual_v2', '1')").run();
}

module.exports = { seedCatalog };

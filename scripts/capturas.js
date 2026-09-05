/* Toma capturas de las pantallas principales para revisar el diseno en tablet y
   en celular. Sirve para comparar un antes y un despues al cambiar estilos.

   Requiere Playwright, que no es dependencia del sistema (solo se usa aqui):
     npm install --no-save playwright
     npx playwright install chromium

   Uso, con el servidor ya levantado en ese puerto:
     node scripts/capturas.js 3000 capturas-antes */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PUERTO = process.argv[2] || '3199';
const SALIDA = path.join(__dirname, '..', process.argv[3] || 'capturas');
const BASE = `http://localhost:${PUERTO}`;

const DISPOSITIVOS = [
  { nombre: 'tablet', viewport: { width: 1024, height: 1366 }, dsf: 2 },
  { nombre: 'celular', viewport: { width: 390, height: 844 }, dsf: 3 }
];

const VISTAS = ['panel', 'mesas', 'comanda', 'cocina', 'facturar', 'inventario'];

async function esperarCalma(page) {
  await page.waitForTimeout(900);
  // Espera a que terminen las fuentes y las imagenes visibles.
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(
    Array.from(document.images)
      .filter((img) => !img.complete)
      .map((img) => new Promise((r) => { img.onload = img.onerror = r; }))
  ));
  await page.waitForTimeout(400);
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();

  for (const disp of DISPOSITIVOS) {
    const context = await browser.newContext({
      viewport: disp.viewport,
      deviceScaleFactor: disp.dsf,
      locale: 'es-CO'
    });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') console.log(`  [consola ${disp.nombre}] ${m.text()}`);
    });
    page.on('requestfailed', (r) => console.log(`  [falla ${disp.nombre}] ${r.url()}`));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await esperarCalma(page);
    await page.screenshot({ path: path.join(SALIDA, `${disp.nombre}-login.png`), fullPage: true });
    console.log(`${disp.nombre}: login`);

    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await esperarCalma(page);

    for (const vista of VISTAS) {
      await page.evaluate((v) => {
        location.hash = '#' + v;
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }, vista);
      await page.waitForTimeout(1600);
      await esperarCalma(page);
      await page.screenshot({ path: path.join(SALIDA, `${disp.nombre}-${vista}.png`), fullPage: true });
      console.log(`${disp.nombre}: ${vista}`);
    }

    await context.close();
  }

  await browser.close();
  console.log('\nCapturas en', SALIDA);
})().catch((e) => { console.error(e); process.exit(1); });

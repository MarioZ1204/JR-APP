const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { PNG } = require("pngjs");
const sharp = require("sharp");
const jsQR = require("jsqr");

const URL =
  "https://drive.google.com/file/d/1dXOWIW4FQupfIh_IMV0UFaxsnNp1aG90/view";

const SIZE = 1200;
const PADDING = 118;
const MODULE_SCALE = 0.94;
const MODULE_RADIUS = 0.28;
const FINDER_OUTER_R = 0.62;
const FINDER_INNER_R = 0.48;
const FINDER_CORE_R = 0.38;
const LOGO_HOLE = 17;

const BG_A = [252, 247, 241, 255];
const BG_B = [245, 232, 214, 255];
const INK = [52, 44, 38, 255];
const INK_HEX = "#342C26";
const ORANGE = [154, 84, 28, 255];
const ORANGE_HEX = "#9A541C";
const PAPER_HEX = "#FCF7F1";
const BORDER = [232, 196, 148, 255];
const BORDER_HEX = "#E8C494";

const ROOT = path.resolve(__dirname, "..");
const LOGO_SRC = path.join(ROOT, "assets", "logo-star-books.webp");

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mix(c1, c2, t) {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
    Math.round(lerp(c1[3], c2[3], t)),
  ];
}

function sdRoundedBox(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - r;
}

function cover(sdf) {
  return Math.max(0, Math.min(1, 0.5 - sdf));
}

function isFinder(r, c, n) {
  return (
    (r < 7 && c < 7) ||
    (r < 7 && c >= n - 7) ||
    (r >= n - 7 && c < 7)
  );
}

function logoStart(n) {
  return Math.floor((n - LOGO_HOLE) / 2);
}

function isLogoArea(r, c, n) {
  const start = logoStart(n);
  return (
    r >= start &&
    r < start + LOGO_HOLE &&
    c >= start &&
    c < start + LOGO_HOLE
  );
}

function logoGeometry(n, cell) {
  const start = logoStart(n);
  const pad = cell * 0.35;
  const x = PADDING + start * cell - pad;
  const y = PADDING + start * cell - pad;
  const size = LOGO_HOLE * cell + pad * 2;
  return { x, y, size };
}

async function prepareLogo(sizePx) {
  const { data, info } = await sharp(LOGO_SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    const avg = (r + g + b) / 3;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);

    if (avg > 238 && spread < 22) {
      data[i + 3] = Math.round(
        data[i + 3] * Math.max(0, (252 - avg) / 14)
      );
      continue;
    }

    if (avg < 48 && spread < 28) {
      data[i] = 52;
      data[i + 1] = 44;
      data[i + 2] = 38;
      continue;
    }

    if (r > 170 && g > 70 && g < 190 && b < 100) {
      data[i] = Math.round(r * 0.72 + 214 * 0.28);
      data[i + 1] = Math.round(g * 0.72 + 142 * 0.28);
      data[i + 2] = Math.round(b * 0.72 + 58 * 0.28);
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(sizePx, sizePx, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

function finderMarkup(originR, originC, cell) {
  const x = PADDING + originC * cell;
  const y = PADDING + originR * cell;
  const outer = 7 * cell;
  const inner = 5 * cell;
  const core = 3 * cell;
  return `
    <rect x="${x}" y="${y}" width="${outer}" height="${outer}" rx="${cell * FINDER_OUTER_R}" fill="${INK_HEX}"/>
    <rect x="${x + cell}" y="${y + cell}" width="${inner}" height="${inner}" rx="${cell * FINDER_INNER_R}" fill="${PAPER_HEX}"/>
    <rect x="${x + cell * 2}" y="${y + cell * 2}" width="${core}" height="${core}" rx="${cell * FINDER_CORE_R}" fill="${ORANGE_HEX}"/>
  `;
}

function buildSvg(qr, n, cell, logoHref, logoBox) {
  let modules = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isFinder(r, c, n) || isLogoArea(r, c, n) || !qr.modules.get(r, c)) {
        continue;
      }
      const s = cell * MODULE_SCALE;
      const x = PADDING + c * cell + (cell - s) / 2;
      const y = PADDING + r * cell + (cell - s) / 2;
      modules += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${s.toFixed(2)}" height="${s.toFixed(2)}" rx="${(s * MODULE_RADIUS).toFixed(2)}" fill="${INK_HEX}"/>\n`;
    }
  }

  const badge = logoBox.size;
  const inset = badge * 0.07;
  const logoSize = badge - inset * 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FCF7F1"/>
      <stop offset="100%" stop-color="#F5E8D6"/>
    </linearGradient>
    <filter id="softShadow" x="-8%" y="-8%" width="116%" height="116%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#342C26" flood-opacity="0.10"/>
    </filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="84" fill="url(#paper)" filter="url(#softShadow)"/>
  <rect x="36" y="36" width="${SIZE - 72}" height="${SIZE - 72}" rx="68" fill="none" stroke="${BORDER_HEX}" stroke-width="2.5"/>
  ${finderMarkup(0, 0, cell)}
  ${finderMarkup(0, n - 7, cell)}
  ${finderMarkup(n - 7, 0, cell)}
  ${modules}
  <rect x="${logoBox.x.toFixed(2)}" y="${logoBox.y.toFixed(2)}" width="${badge.toFixed(2)}" height="${badge.toFixed(2)}" rx="${(badge * 0.22).toFixed(2)}" fill="${PAPER_HEX}"/>
  <rect x="${(logoBox.x + 3).toFixed(2)}" y="${(logoBox.y + 3).toFixed(2)}" width="${(badge - 6).toFixed(2)}" height="${(badge - 6).toFixed(2)}" rx="${(badge * 0.2).toFixed(2)}" fill="none" stroke="${BORDER_HEX}" stroke-width="2"/>
  <image x="${(logoBox.x + inset).toFixed(2)}" y="${(logoBox.y + inset).toFixed(2)}" width="${logoSize.toFixed(2)}" height="${logoSize.toFixed(2)}" href="${logoHref}" xlink:href="${logoHref}" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
}

function addFinderShapes(shapes, originR, originC, cell) {
  const x = PADDING + originC * cell;
  const y = PADDING + originR * cell;
  const outer = 7 * cell;
  const inner = 5 * cell;
  const core = 3 * cell;
  shapes.push({
    cx: x + outer / 2,
    cy: y + outer / 2,
    hw: outer / 2,
    hh: outer / 2,
    r: cell * FINDER_OUTER_R,
    color: INK,
  });
  shapes.push({
    cx: x + cell + inner / 2,
    cy: y + cell + inner / 2,
    hw: inner / 2,
    hh: inner / 2,
    r: cell * FINDER_INNER_R,
    color: BG_A,
  });
  shapes.push({
    cx: x + cell * 2 + core / 2,
    cy: y + cell * 2 + core / 2,
    hw: core / 2,
    hh: core / 2,
    r: cell * FINDER_CORE_R,
    color: ORANGE,
  });
}

function paintShape(buffer, shape) {
  const pad = 2;
  const minX = Math.max(0, Math.floor(shape.cx - shape.hw - pad));
  const maxX = Math.min(SIZE - 1, Math.ceil(shape.cx + shape.hw + pad));
  const minY = Math.max(0, Math.floor(shape.cy - shape.hh - pad));
  const maxY = Math.min(SIZE - 1, Math.ceil(shape.cy + shape.hh + pad));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = cover(
        sdRoundedBox(x, y, shape.cx, shape.cy, shape.hw, shape.hh, shape.r)
      );
      if (a <= 0) continue;
      const idx = (SIZE * y + x) << 2;
      const dest = [buffer[idx], buffer[idx + 1], buffer[idx + 2], buffer[idx + 3]];
      const mixed = mix(dest, shape.color, a);
      buffer[idx] = mixed[0];
      buffer[idx + 1] = mixed[1];
      buffer[idx + 2] = mixed[2];
      buffer[idx + 3] = dest[3];
    }
  }
}

function buildQrPng(qr, n, cell, logoBox) {
  const png = new PNG({ width: SIZE, height: SIZE });
  const cardRadius = 84;
  const borderInset = 36;
  const borderRadius = 68;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = (x / (SIZE - 1) + y / (SIZE - 1)) / 2;
      const cardSd = sdRoundedBox(
        x,
        y,
        SIZE / 2,
        SIZE / 2,
        SIZE / 2,
        SIZE / 2,
        cardRadius
      );
      const idx = (SIZE * y + x) << 2;
      let color = mix(BG_A, BG_B, t);
      if (cardSd > 0) color = mix(color, BG_A, Math.min(1, cardSd / 3));

      const borderOuter = sdRoundedBox(
        x,
        y,
        SIZE / 2,
        SIZE / 2,
        SIZE / 2 - borderInset,
        SIZE / 2 - borderInset,
        borderRadius
      );
      const borderAlpha = Math.max(0, cover(borderOuter) - cover(borderOuter + 2.4));
      if (borderAlpha > 0) color = mix(color, BORDER, borderAlpha);

      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = color[3];
    }
  }

  const shapes = [];
  addFinderShapes(shapes, 0, 0, cell);
  addFinderShapes(shapes, 0, n - 7, cell);
  addFinderShapes(shapes, n - 7, 0, cell);

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isFinder(r, c, n) || isLogoArea(r, c, n) || !qr.modules.get(r, c)) {
        continue;
      }
      const s = cell * MODULE_SCALE;
      const x = PADDING + c * cell + (cell - s) / 2;
      const y = PADDING + r * cell + (cell - s) / 2;
      shapes.push({
        cx: x + s / 2,
        cy: y + s / 2,
        hw: s / 2,
        hh: s / 2,
        r: s * MODULE_RADIUS,
        color: INK,
      });
    }
  }

  const badge = logoBox.size;
  shapes.push({
    cx: logoBox.x + badge / 2,
    cy: logoBox.y + badge / 2,
    hw: badge / 2,
    hh: badge / 2,
    r: badge * 0.22,
    color: BG_A,
  });
  shapes.push({
    cx: logoBox.x + badge / 2,
    cy: logoBox.y + badge / 2,
    hw: badge / 2 - 3,
    hh: badge / 2 - 3,
    r: badge * 0.2,
    color: BORDER,
  });
  shapes.push({
    cx: logoBox.x + badge / 2,
    cy: logoBox.y + badge / 2,
    hw: badge / 2 - 5.4,
    hh: badge / 2 - 5.4,
    r: badge * 0.185,
    color: BG_A,
  });

  for (const shape of shapes) paintShape(png.data, shape);
  return png;
}

async function main() {
  const qr = QRCode.create(URL, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const area = SIZE - PADDING * 2;
  const cell = area / n;
  const logoBox = logoGeometry(n, cell);
  const logoSize = Math.round(logoBox.size * 0.84);
  const logoPng = await prepareLogo(logoSize);
  const logoHref = `data:image/png;base64,${logoPng.toString("base64")}`;

  const svgPath = path.join(ROOT, "qr-carta-star-books.svg");
  const pngPath = path.join(ROOT, "qr-carta-star-books.png");

  fs.writeFileSync(svgPath, buildSvg(qr, n, cell, logoHref, logoBox), "utf8");

  const qrPng = buildQrPng(qr, n, cell, logoBox);
  const composed = await sharp(PNG.sync.write(qrPng))
    .composite([
      {
        input: logoPng,
        left: Math.round(logoBox.x + (logoBox.size - logoSize) / 2),
        top: Math.round(logoBox.y + (logoBox.size - logoSize) / 2),
      },
    ])
    .png()
    .toBuffer();

  fs.writeFileSync(pngPath, composed);

  const decodedPng = PNG.sync.read(composed);
  const decoded = jsQR(
    Uint8ClampedArray.from(decodedPng.data),
    decodedPng.width,
    decodedPng.height
  );

  console.log(`SVG: ${svgPath}`);
  console.log(`PNG: ${pngPath}`);
  console.log(`Módulos: ${n}x${n}`);
  console.log(decoded ? `Escaneo OK: ${decoded.data}` : "Escaneo FALLÓ");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

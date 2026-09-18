const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = require('./paths').DATA_DIR;

const CUSTOM_LOGO = () => path.join(DATA_DIR, 'logo-print.png');

const DEFAULT_CANDIDATES = [
  path.join(__dirname, '..', 'public', 'logo-print.png'),
  path.join(__dirname, '..', 'public', 'icon-512.png'),
  path.join(__dirname, '..', 'public', 'logo-256.png'),
  path.join(__dirname, '..', 'public', 'logo.png')
];

let logoRgba = null;
let logoDataUrl = null;
let logoSource = null;

function readChunk(buf, offset) {
  const len = buf.readUInt32BE(offset);
  const type = buf.toString('ascii', offset + 4, offset + 8);
  const data = buf.subarray(offset + 8, offset + 8 + len);
  return { len, type, data, next: offset + 12 + len };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let src = 0;
  let dst = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? out[dst + x - bpp] : 0;
      const up = y > 0 ? out[dst - stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? out[dst - stride + x - bpp] : 0;
      let v = raw[src++];
      if (filter === 1) v = (v + left) & 0xff;
      else if (filter === 2) v = (v + up) & 0xff;
      else if (filter === 3) v = (v + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) v = (v + paeth(left, up, upLeft)) & 0xff;
      out[dst + x] = v;
    }
    dst += stride;
  }
  return out;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePngRgbaFromBuffer(buf) {
  if (!buf || buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const c = readChunk(buf, off);
    if (c.type === 'IHDR') {
      width = c.data.readUInt32BE(0);
      height = c.data.readUInt32BE(4);
      bitDepth = c.data[8];
      colorType = c.data[9];
    } else if (c.type === 'IDAT') {
      idat.push(c.data);
    } else if (c.type === 'IEND') {
      break;
    }
    off = c.next;
  }
  if (!width || !height || bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) return null;
  const bpp = colorType === 6 ? 4 : 3;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const pixels = unfilter(inflated, width, height, bpp);
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += bpp, j += 4) {
    rgba[j] = pixels[i];
    rgba[j + 1] = pixels[i + 1];
    rgba[j + 2] = pixels[i + 2];
    rgba[j + 3] = colorType === 6 ? pixels[i + 3] : 255;
  }
  return { width, height, data: rgba };
}

function decodePngRgba(filePath) {
  return decodePngRgbaFromBuffer(fs.readFileSync(filePath));
}

function clearLogoCache() {
  logoRgba = null;
  logoDataUrl = null;
  logoSource = null;
}

function resolveLogoFile() {
  const custom = CUSTOM_LOGO();
  if (fs.existsSync(custom)) return { file: custom, custom: true };
  const file = DEFAULT_CANDIDATES.find((p) => fs.existsSync(p));
  return file ? { file, custom: false } : null;
}

function loadLogoAssets() {
  if (logoRgba) return logoRgba;
  const found = resolveLogoFile();
  if (!found) return null;
  logoRgba = decodePngRgba(found.file);
  if (logoRgba) {
    logoDataUrl = `data:image/png;base64,${fs.readFileSync(found.file).toString('base64')}`;
    logoSource = found;
  }
  return logoRgba;
}

function getLogoDataUrl() {
  loadLogoAssets();
  return logoDataUrl;
}

function hasCustomLogo() {
  return fs.existsSync(CUSTOM_LOGO());
}

function logoInfo() {
  loadLogoAssets();
  const found = resolveLogoFile();
  return {
    has_logo: Boolean(logoRgba),
    custom: Boolean(found?.custom),
    preview_url: found ? `/api/receipt-logo?t=${fs.statSync(found.file).mtimeMs}` : null,
    width: logoRgba?.width || null,
    height: logoRgba?.height || null
  };
}

function saveCustomLogo(pngBuffer) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length < 24) {
    const err = new Error('Archivo de imagen inválido');
    err.http = 400;
    throw err;
  }
  if (!pngBuffer.subarray(0, 8).equals(PNG_SIG)) {
    const err = new Error('El logo debe ser PNG (use PNG o convierta la imagen)');
    err.http = 400;
    throw err;
  }
  const decoded = decodePngRgbaFromBuffer(pngBuffer);
  if (!decoded) {
    const err = new Error('No se pudo leer el PNG. Use PNG de 8 bits (RGB o RGBA).');
    err.http = 400;
    throw err;
  }
  if (pngBuffer.length > 2.5 * 1024 * 1024) {
    const err = new Error('La imagen es muy pesada (máx. 2,5 MB)');
    err.http = 400;
    throw err;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CUSTOM_LOGO(), pngBuffer);
  clearLogoCache();
  return logoInfo();
}

function removeCustomLogo() {
  const custom = CUSTOM_LOGO();
  if (fs.existsSync(custom)) fs.unlinkSync(custom);
  clearLogoCache();
  return logoInfo();
}

function readCustomLogoFile() {
  const found = resolveLogoFile();
  if (!found) return null;
  return { buffer: fs.readFileSync(found.file), mtimeMs: fs.statSync(found.file).mtimeMs };
}

function pngToRaster(png, targetWidth) {
  const scale = targetWidth / png.width;
  const height = Math.max(1, Math.round(png.height * scale));
  const bytesPerRow = Math.ceil(targetWidth / 8);
  const data = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(png.width - 1, Math.floor(x / scale));
      const sy = Math.min(png.height - 1, Math.floor(y / scale));
      const idx = (sy * png.width + sx) << 2;
      // Fondo transparente = papel blanco (antes a=0 se imprimía negro).
      const a = png.data[idx + 3] / 255;
      const r = png.data[idx] * a + 255 * (1 - a);
      const g = png.data[idx + 1] * a + 255 * (1 - a);
      const b = png.data[idx + 2] * a + 255 * (1 - a);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 160) {
        const byteIdx = y * bytesPerRow + (x >> 3);
        data[byteIdx] |= (0x80 >> (x & 7));
      }
    }
  }

  return { height, bytesPerRow, data };
}

function escPosImageRaster(raster) {
  const { height, bytesPerRow, data } = raster;
  const header = Buffer.from([
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff
  ]);
  return Buffer.concat([header, data]);
}

function logoDotWidth(widthMm, size = 'md') {
  const narrow = widthMm === 58;
  if (size === 'sm') return narrow ? 120 : 160;
  if (size === 'lg') return narrow ? 256 : 384;
  return narrow ? 168 : 216;
}

function logoHtmlWidth(widthMm, size = 'md') {
  const narrow = widthMm === 58;
  if (size === 'sm') return narrow ? 64 : 80;
  if (size === 'lg') return narrow ? 120 : 168;
  return narrow ? 88 : 108;
}

function logoEscPos(widthMm, size = 'md') {
  const png = loadLogoAssets();
  if (!png) return Buffer.alloc(0);
  const targetWidth = logoDotWidth(widthMm, size);
  const raster = pngToRaster(png, targetWidth);
  return Buffer.concat([
    Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0x01]),
    escPosImageRaster(raster),
    Buffer.from('\n', 'latin1'),
    Buffer.from([0x1b, 0x61, 0x00])
  ]);
}

function ticketLogoHtml(widthMm, size = 'md') {
  const src = getLogoDataUrl();
  if (!src) return '';
  const w = logoHtmlWidth(widthMm, size);
  return `<div class="ticket-logo"><img src="${src}" alt="" width="${w}" /></div>`;
}

module.exports = {
  getLogoDataUrl,
  logoEscPos,
  ticketLogoHtml,
  clearLogoCache,
  hasCustomLogo,
  logoInfo,
  saveCustomLogo,
  removeCustomLogo,
  readCustomLogoFile
};

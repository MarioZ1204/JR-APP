const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LOGO_CANDIDATES = [
  path.join(__dirname, '..', 'public', 'logo-256.png'),
  path.join(__dirname, '..', 'public', 'logo.png')
];

let logoRgba = null;
let logoDataUrl = null;

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

function decodePngRgba(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
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

function loadLogoAssets() {
  if (logoRgba) return logoRgba;
  const file = LOGO_CANDIDATES.find((p) => fs.existsSync(p));
  if (!file) return null;
  logoRgba = decodePngRgba(file);
  if (logoRgba) {
    logoDataUrl = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  }
  return logoRgba;
}

function getLogoDataUrl() {
  loadLogoAssets();
  return logoDataUrl;
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
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) * (a / 255);
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

function logoEscPos(widthMm) {
  const png = loadLogoAssets();
  if (!png) return Buffer.alloc(0);
  const targetWidth = widthMm === 58 ? 256 : 384;
  const raster = pngToRaster(png, targetWidth);
  return Buffer.concat([
    Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0x01]),
    escPosImageRaster(raster),
    Buffer.from('\n', 'latin1'),
    Buffer.from([0x1b, 0x61, 0x00])
  ]);
}

function ticketLogoHtml(widthMm) {
  const src = getLogoDataUrl();
  if (!src) return '';
  const w = widthMm === 58 ? 120 : 168;
  return `<div class="ticket-logo"><img src="${src}" alt="" width="${w}" /></div>`;
}

module.exports = {
  getLogoDataUrl,
  logoEscPos,
  ticketLogoHtml
};

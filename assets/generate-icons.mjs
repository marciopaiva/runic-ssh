// Generates the application icon set from the logo.
//
// The icons are derived from assets/logo.png, not designed as icons: the mark
// is cropped out of the banner and scaled. That is a placeholder standing in
// until #40 produces a real set, and it exists because Windows cannot build
// without icons/icon.ico at all.
//
//   node assets/generate-icons.mjs assets/logo.png src-tauri/icons
//
// No image library is used. Adding one to crop a logo would be a dependency
// bought for a job that runs by hand, twice a year.

import fs from 'fs';
import zlib from 'zlib';

// --- decode ---------------------------------------------------------------
function decodePng(file) {
  const b = fs.readFileSync(file);
  let p = 8, idat = [], w, h, bd, ct;
  while (p < b.length) {
    const len = b.readUInt32BE(p);
    const type = b.toString('ascii', p + 4, p + 8);
    const data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8) throw new Error('only 8-bit depth supported, got ' + bd);
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : null;
  if (!ch) throw new Error('unsupported color type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[o++];
    const line = raw.subarray(o, o + stride);
    o += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const bb = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += bb;
      else if (f === 3) v += (a + bb) >> 1;
      else if (f === 4) {
        const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, ch, px: out };
}

// --- crop + bilinear resize to a square RGBA ------------------------------
function squareResize(src, cx, cy, side, size) {
  const { w, h, ch, px } = src;
  const x0 = cx - side / 2, y0 = cy - side / 2;
  const dst = Buffer.alloc(size * size * 4);
  const at = (x, y, c) => {
    const xi = Math.min(w - 1, Math.max(0, x));
    const yi = Math.min(h - 1, Math.max(0, y));
    const i = (yi * w + xi) * ch;
    if (c === 3) return ch === 4 ? px[i + 3] : 255;
    return px[i + Math.min(c, ch - 1)];
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = x0 + ((x + 0.5) * side) / size - 0.5;
      const sy = y0 + ((y + 0.5) * side) / size - 0.5;
      const fx = Math.floor(sx), fy = Math.floor(sy);
      const tx = sx - fx, ty = sy - fy;
      for (let c = 0; c < 4; c++) {
        const v =
          at(fx, fy, c) * (1 - tx) * (1 - ty) +
          at(fx + 1, fy, c) * tx * (1 - ty) +
          at(fx, fy + 1, c) * (1 - tx) * ty +
          at(fx + 1, fy + 1, c) * tx * ty;
        dst[(y * size + x) * 4 + c] = Math.round(v);
      }
    }
  }
  return dst;
}

// --- encode ---------------------------------------------------------------
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePng(rgba, size) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- run ------------------------------------------------------------------
const [, , inFile, outDir] = process.argv;
const src = decodePng(inFile);
// The mark sits left of the wordmark in the banner. Centre and crop tight
// enough that the rune fills the tile without touching its edges.
const CX = 276, CY = 217, SIDE = 208;

const rendered = new Map();
for (const size of [512, 256, 128, 64, 48, 32, 16]) {
  rendered.set(size, squareResize(src, CX, CY, SIDE, size));
}

for (const size of [512, 256, 128, 64, 32]) {
  const name = size === 512 ? 'icon.png' : `${size}x${size}.png`;
  fs.writeFileSync(`${outDir}/${name}`, encodePng(rendered.get(size), size));
  console.log(`  ${name}  ${size}x${size}`);
}

// --- Windows .ico -------------------------------------------------------
// tauri-build compiles a Windows Resource file and needs icons/icon.ico to
// exist, so this is a build requirement rather than a packaging nicety.
// Entries are written as BMP (BITMAPINFOHEADER + bottom-up BGRA + AND mask),
// which every Windows version reads; PNG-compressed entries are only reliably
// supported for the 256px slot.
function icoEntry(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR image plus AND mask
  header.writeUInt16LE(1, 12);      // planes
  header.writeUInt16LE(32, 14);     // bits per pixel
  header.writeUInt32LE(0, 16);      // BI_RGB, uncompressed

  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const srcRow = (size - 1 - y) * size * 4; // BMP rows run bottom-up
    for (let x = 0; x < size; x++) {
      const s = srcRow + x * 4;
      const d = (y * size + x) * 4;
      xor[d] = rgba[s + 2];     // B
      xor[d + 1] = rgba[s + 1]; // G
      xor[d + 2] = rgba[s];     // R
      xor[d + 3] = rgba[s + 3]; // A
    }
  }

  // Alpha in the XOR image carries transparency; the mask stays clear.
  const maskRow = ((size + 31) >> 5) * 4;
  const mask = Buffer.alloc(maskRow * size);

  return Buffer.concat([header, xor, mask]);
}

{
  const sizes = [16, 32, 48, 64, 128, 256];
  const images = sizes.map((s) => icoEntry(rendered.get(s), s));
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2); // 1 = icon
  dir.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = sizes.map((size, i) => {
    const e = Buffer.alloc(16);
    e[0] = size === 256 ? 0 : size; // 0 means 256
    e[1] = size === 256 ? 0 : size;
    e[2] = 0; // colour count, 0 for true colour
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return e;
  });

  const ico = Buffer.concat([dir, ...entries, ...images]);
  fs.writeFileSync(`${outDir}/icon.ico`, ico);
  console.log(`  icon.ico  ${sizes.join(', ')}  ${ico.length} bytes`);
}

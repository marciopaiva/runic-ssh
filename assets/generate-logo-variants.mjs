// Generates the README logo variants from the master banner.
//
// The banner in logo.png is artwork on a solid navy plate. Dropped into a
// README it reads as a dark card floating on the page, in either GitHub theme.
// These variants lift the artwork off that plate: the background is reversed
// out to transparency, and the wordmark is recoloured for a light page.
//
//   node assets/generate-logo-variants.mjs assets/logo.png assets
//
// No image library. Reversing a composite and recolouring by saturation is a
// dozen lines of arithmetic, and a dependency for it would outlive the job.

import fs from 'fs';
import zlib from 'zlib';

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
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1;
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
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePng(rgba, w, h) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const [, , inFile, outDir] = process.argv;
const src = decodePng(inFile);
const { w, h, ch, px } = src;
const at = (x, y, c) => px[(y * w + x) * ch + c];

// The plate is textured, so take the median of a border frame rather than one
// corner pixel: a single sample lands on a scratch and skews every alpha.
const frame = [[], [], []];
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (x > 24 && x < w - 24 && y > 24 && y < h - 24) continue;
    for (let c = 0; c < 3; c++) frame[c].push(at(x, y, c));
  }
}
const bg = frame.map((v) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]);
console.log(`  plate colour  #${bg.map((v) => v.toString(16).padStart(2, '0')).join('')}`);

// Reverse the composite: every pixel is artwork laid over the plate, so the
// alpha is how far it travels from the plate towards full intensity.
const rgba = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    let alpha = 0;
    for (let c = 0; c < 3; c++) {
      const denom = 255 - bg[c];
      if (denom > 0) alpha = Math.max(alpha, (at(x, y, c) - bg[c]) / denom);
    }
    alpha = Math.min(1, Math.max(0, alpha));
    // Below this the pixel is plate texture, not artwork.
    if (alpha < 0.08) alpha = 0;

    const i = (y * w + x) * 4;
    if (alpha === 0) { rgba[i + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) {
      const v = (at(x, y, c) - bg[c] * (1 - alpha)) / alpha;
      rgba[i + c] = Math.min(255, Math.max(0, Math.round(v)));
    }
    rgba[i + 3] = Math.round(alpha * 255);
  }
}

// Trim to the artwork.
//
// A brightness threshold alone does not find it: the plate carries scratches
// that are genuinely brighter than the plate, scattered to the edges of the
// frame. The artwork is distinguished by density instead — the rows and
// columns where many bright pixels line up, rather than the ones where any do.
const bright = (x, y) => rgba[(y * w + x) * 4 + 3] >= 128;
const cols = new Array(w).fill(0);
const rows = new Array(h).fill(0);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (bright(x, y)) { cols[x] += 1; rows[y] += 1; }
  }
}
const MIN_PER_LINE = 4;
const span = (counts) => {
  const first = counts.findIndex((v) => v >= MIN_PER_LINE);
  let last = first;
  for (let i = counts.length - 1; i >= 0; i--) {
    if (counts[i] >= MIN_PER_LINE) { last = i; break; }
  }
  return [first, last];
};
const [x0, x1] = span(cols);
const [y0, y1] = span(rows);

const PAD = 26;
const minX = Math.max(0, x0 - PAD);
const minY = Math.max(0, y0 - PAD);
const maxX = Math.min(w - 1, x1 + PAD);
const maxY = Math.min(h - 1, y1 + PAD);
const cw = maxX - minX + 1;
const chh = maxY - minY + 1;

// Lift the crop out, dropping the faintest pixels: inside the artwork box they
// are plate texture rather than anything drawn.
const cut = Buffer.alloc(cw * chh * 4);
for (let y = 0; y < chh; y++) {
  for (let x = 0; x < cw; x++) {
    const s = ((y + minY) * w + (x + minX)) * 4;
    const d = (y * cw + x) * 4;
    if (rgba[s + 3] < 31) continue;
    cut[d] = rgba[s];
    cut[d + 1] = rgba[s + 1];
    cut[d + 2] = rgba[s + 2];
    cut[d + 3] = rgba[s + 3];
  }
}

// Whatever survived that and is still tiny is a speck of texture, not a glyph.
const MIN_BLOB = 24;
const seen = new Uint8Array(cw * chh);
for (let i = 0; i < cw * chh; i++) {
  if (seen[i] || cut[i * 4 + 3] === 0) continue;
  const blob = [];
  const stack = [i];
  seen[i] = 1;
  while (stack.length > 0) {
    const at = stack.pop();
    blob.push(at);
    const bx = at % cw;
    const by = (at - bx) / cw;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = bx + dx;
      const ny = by + dy;
      if (nx < 0 || ny < 0 || nx >= cw || ny >= chh) continue;
      const n = ny * cw + nx;
      if (seen[n] || cut[n * 4 + 3] === 0) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  if (blob.length < MIN_BLOB) {
    for (const at of blob) cut[at * 4 + 3] = 0;
  }
}

/**
 * The light variant.
 *
 * Two changes, both about contrast against a white page. The wordmark and the
 * rune strokes are near-white, so they become ink. The ring keeps its hue but
 * is darkened: artwork drawn to sit on navy is pale on paper, and the
 * anti-aliased edges wash out further as they blend towards white.
 */
const INK = [0x1a, 0x27, 0x35];
const RING_DARKEN = 0.72;

function recoloured() {
  const out = Buffer.from(cut);
  for (let i = 0; i < cw * chh; i++) {
    const d = i * 4;
    if (out[d + 3] === 0) continue;
    const r = out[d];
    const g = out[d + 1];
    const b = out[d + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;

    if (sat < 0.22 && mx > 120) {
      [out[d], out[d + 1], out[d + 2]] = INK;
      continue;
    }
    out[d] = Math.round(r * RING_DARKEN);
    out[d + 1] = Math.round(g * RING_DARKEN);
    out[d + 2] = Math.round(b * RING_DARKEN);
  }
  return out;
}

fs.writeFileSync(`${outDir}/logo-dark.png`, encodePng(cut, cw, chh));
fs.writeFileSync(`${outDir}/logo-light.png`, encodePng(recoloured(), cw, chh));
console.log(`  artwork found  x[${x0}..${x1}] y[${y0}..${y1}]`);
console.log(`  logo-dark.png   ${cw}x${chh}`);
console.log(`  logo-light.png  ${cw}x${chh}  wordmark recoloured for a light page`);

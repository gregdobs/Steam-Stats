// Generator for the installable-app icons in public/ (icon-192, icon-512 and
// their maskable variants), run via `npm run build:icons`.
//
// Deliberately dependency-free — it encodes PNG by hand on top of Node's
// built-in zlib rather than pulling in sharp/jimp/canvas, because the entire
// job is "emit four flat-colour images, rarely". Adding an image library to
// the tree for that would cost more than this file does. If the icon artwork
// needs changing, edit drawIcon() below and re-run; don't reach for a
// dependency.
//
// The committed PNGs in public/ are the build output — this script only needs
// running when the artwork itself changes.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(__dirname, '..', 'public');

// ── PNG encoding ──────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  // 10,11,12 = compression/filter/interlace, all 0
  // Each scanline gets a leading filter byte (0 = None); simple and it
  // compresses fine for flat art like this.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (width * 4 + 1);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── drawing ───────────────────────────────────────────────────
const SS = 4; // supersample factor — downsampled at the end for clean edges

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

const BG_TOP = hex('#101a29');
const BG_BOT = hex('#06080c');
const ACCENT = hex('#6fc8f7');

// Rounded-rect coverage test in supersampled space.
function insideRoundedRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * @param size    final pixel size
 * @param maskable when true: full-bleed square (no corner rounding) and the
 *                 glyph is inset into the 80% safe zone, per the maskable spec
 */
function drawIcon(size, maskable) {
  const S = size * SS;
  const big = Buffer.alloc(S * S * 4);

  const radius = maskable ? 0 : S * 0.22;

  // Glyph geometry: three ascending bars sitting on a baseline.
  // Safe zone for maskable = centre 80%, so shrink the glyph box there.
  const glyphScale = maskable ? 0.8 : 1;
  const boxW = S * 0.52 * glyphScale;
  const boxH = S * 0.40 * glyphScale;
  const boxX = (S - boxW) / 2;
  const boxY = (S - boxH) / 2 + S * 0.02;

  const gap = boxW * 0.14;
  const barW = (boxW - gap * 2) / 3;
  const barR = barW * 0.28;
  const heights = [0.46, 0.72, 1.0]; // ascending — "stats going up"
  const bars = heights.map((hFrac, i) => ({
    x: boxX + i * (barW + gap),
    y: boxY + boxH * (1 - hFrac),
    w: barW,
    h: boxH * hFrac,
    // Dim the shorter bars so the tallest reads as the focal point.
    tint: 0.45 + 0.275 * i,
  }));

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4;

      if (!insideRoundedRect(x, y, S, S, radius)) {
        big[o] = big[o + 1] = big[o + 2] = big[o + 3] = 0;
        continue;
      }

      // Diagonal background gradient, matching the app's dark theme swatch.
      const t = Math.min(1, Math.max(0, (x * 0.35 + y * 0.85) / S));
      let [r, g, b] = mix(BG_TOP, BG_BOT, t);

      for (const bar of bars) {
        if (insideRoundedRect(x - bar.x, y - bar.y, bar.w, bar.h, barR)) {
          const shade = mix([r, g, b], ACCENT, bar.tint);
          r = shade[0]; g = shade[1]; b = shade[2];
          break;
        }
      }

      big[o] = r;
      big[o + 1] = g;
      big[o + 2] = b;
      big[o + 3] = 255;
    }
  }

  // Box-downsample SS×SS blocks → antialiased edges without a graphics lib.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          const av = big[o + 3] / 255;
          r += big[o] * av; g += big[o + 1] * av; b += big[o + 2] * av; a += big[o + 3];
        }
      }
      const n = SS * SS;
      const aOut = a / n;
      const cover = aOut / 255 || 1;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n / cover);
      out[o + 1] = Math.round(g / n / cover);
      out[o + 2] = Math.round(b / n / cover);
      out[o + 3] = Math.round(aOut);
    }
  }
  return encodePNG(size, size, out);
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
];

for (const [name, size, maskable] of targets) {
  const buf = drawIcon(size, maskable);
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`${name.padEnd(24)} ${String(buf.length).padStart(7)} bytes`);
}

'use strict';
/* Генерирует иконки PWA без зависимостей:  node make_icons.js   → icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png */
const fs = require('fs'), zlib = require('zlib');
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(size, pix) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; pix.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(size, 0); ih.writeUInt32BE(size, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
/* фон #134E3A со скруглением (если round), белая «искра» — четырёхконечная звезда, как значок AI в приложении */
function icon(size, opt) {
  const pix = Buffer.alloc(size * size * 4), S = 3, bg = [0x13, 0x4E, 0x3A], R = size * (opt.round ? 0.22 : 0), r = size * opt.star;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0, st = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const px = x + (sx + .5) / S, py = y + (sy + .5) / S;
      let inside = 1;
      if (R) { const cx = Math.min(Math.max(px, R), size - R), cy = Math.min(Math.max(py, R), size - R); inside = (px - cx) ** 2 + (py - cy) ** 2 <= R * R ? 1 : 0; }
      a += inside;
      const dx = Math.abs(px - size / 2) / r, dy = Math.abs(py - size / 2) / r;
      if (inside && dx ** 0.62 + dy ** 0.62 <= 1) st++;
    }
    const n = S * S, o = (y * size + x) * 4, t = st / n;
    pix[o] = Math.round(bg[0] * (1 - t) + 255 * t); pix[o + 1] = Math.round(bg[1] * (1 - t) + 255 * t); pix[o + 2] = Math.round(bg[2] * (1 - t) + 255 * t); pix[o + 3] = Math.round(255 * a / n);
  }
  return png(size, pix);
}
const out = (f, b) => { fs.writeFileSync(f, b); console.log(f, b.length + ' байт'); };
out('icon-192.png', icon(192, { round: true, star: 0.30 }));
out('icon-512.png', icon(512, { round: true, star: 0.30 }));
out('icon-maskable-512.png', icon(512, { round: false, star: 0.22 })); // запас под обрезку маски
out('apple-touch-icon.png', icon(180, { round: false, star: 0.28 }));

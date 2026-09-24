// Gera build/icon.ico + build/icon.png a partir da marca da identidade
// visual (v1.0.4): quadrado volt com o corte chanfrado no canto superior
// direito (mesmo `bevel` do index.css) e um "T" void — o mesmo logo da
// LoginPage e da TitleBar. Só geometria, rasterizada aqui mesmo (sem
// navegador nem dependência): cada tamanho é desenhado separadamente, com
// as bordas alinhadas ao pixel, pra continuar nítido em 16px.
//
// Uso: node scripts/make-icon.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const VOLT = [0xd6, 0xff, 0x3f]
const VOID = [0x0a, 0x0a, 0x10]

// Proporções em relação ao tamanho do ícone.
const SQUARE = [0.03, 0.97]
const BEVEL = 0.21
const BAR = { top: 0.25, thickness: 0.125, left: 0.27, right: 0.73 }
const STEM = { width: 0.125, bottom: 0.75 }

function render(size) {
  const px = (f) => Math.round(f * size)
  const [x0, x1] = [px(SQUARE[0]), px(SQUARE[1])]
  const [y0, y1] = [x0, x1]
  const bevel = px(BEVEL)
  const barY0 = px(BAR.top)
  const barY1 = px(BAR.top + BAR.thickness)
  const barX0 = px(BAR.left)
  const barX1 = px(BAR.right)
  const stemX0 = Math.round(size / 2 - (STEM.width * size) / 2)
  const stemX1 = Math.round(size / 2 + (STEM.width * size) / 2)
  const stemY1 = px(STEM.bottom)

  const ss = size >= 256 ? 4 : 8
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let volt = 0
      let dark = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = x + (sx + 0.5) / ss
          const v = y + (sy + 0.5) / ss
          const inSquare = u >= x0 && u < x1 && v >= y0 && v < y1 && x1 - u + (v - y0) >= bevel
          if (!inSquare) continue
          const inBar = v >= barY0 && v < barY1 && u >= barX0 && u < barX1
          const inStem = u >= stemX0 && u < stemX1 && v >= barY0 && v < stemY1
          if (inBar || inStem) dark++
          else volt++
        }
      }
      const covered = volt + dark
      const i = (y * size + x) * 4
      if (covered === 0) continue
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round((VOLT[c] * volt + VOID[c] * dark) / covered)
      rgba[i + 3] = Math.round((255 * covered) / (ss * ss))
    }
  }
  return rgba
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// Entrada BMP (DIB 32bpp + máscara AND), o mesmo formato do icon.ico
// anterior — mais compatível que PNG dentro do .ico (NSIS incluído).
function encodeBmpEntry(size, rgba) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  const pixels = Buffer.alloc(size * size * 4)
  const maskStride = Math.ceil(size / 32) * 4
  const mask = Buffer.alloc(maskStride * size)
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y // BMP é de baixo pra cima
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4
      const dst = (row * size + x) * 4
      pixels[dst] = rgba[src + 2]
      pixels[dst + 1] = rgba[src + 1]
      pixels[dst + 2] = rgba[src]
      pixels[dst + 3] = rgba[src + 3]
      if (rgba[src + 3] === 0) mask[row * maskStride + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return Buffer.concat([header, pixels, mask])
}

function encodeIco(sizes) {
  const images = sizes.map((size) => encodeBmpEntry(size, render(size)))
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  sizes.forEach((size, i) => {
    const o = 6 + i * 16
    header[o] = size >= 256 ? 0 : size
    header[o + 1] = size >= 256 ? 0 : size
    header.writeUInt16LE(1, o + 4)
    header.writeUInt16LE(32, o + 6)
    header.writeUInt32LE(images[i].length, o + 8)
    header.writeUInt32LE(offset, o + 12)
    offset += images[i].length
  })
  return Buffer.concat([header, ...images])
}

const buildDir = new URL('../build/', import.meta.url)
writeFileSync(new URL('icon.ico', buildDir), encodeIco([16, 24, 32, 48, 64, 128, 256]))
writeFileSync(new URL('icon.png', buildDir), encodePng(1024, render(1024)))
console.log('build/icon.ico e build/icon.png gerados')

/**
 * Minimal zero-dependency QR Code (Byte mode, ECC Level L, Versions 1..6) SVG generator.
 * Covers up to 134 UTF-8 bytes — plenty for local / tunnel phone-chat URLs with 48-hex keys.
 */

// GF(256) tables with primitive polynomial 0x11d
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]
}

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}

function rsGenerator(degree) {
  let poly = [1]
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen)
  const buf = new Uint8Array(data.length + ecLen)
  buf.set(data, 0)
  for (let i = 0; i < data.length; i += 1) {
    const coef = buf[i]
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j += 1) {
        buf[i + j] ^= gfMul(gen[j], coef)
      }
    }
  }
  return buf.slice(data.length)
}

// Version 1..6 Level L parameters: [version, size, totalDataBytes, ecBytesPerBlock, blocks, alignCenters]
const VERSIONS = [
  [1, 21, 19, 7, 1, []],
  [2, 25, 34, 10, 1, [6, 18]],
  [3, 29, 55, 15, 1, [6, 22]],
  [4, 33, 80, 20, 1, [6, 26]],
  [5, 37, 108, 26, 1, [6, 30]],
  [6, 41, 136, 18, 2, [6, 34]],
]

function encodeQrMatrix(text) {
  const bytes = Buffer.from(String(text ?? ''), 'utf8')
  const spec = VERSIONS.find((v) => bytes.length + 2 <= v[2])
  if (!spec) return null
  const [, size, dataCap, ecLen, blocks, aligns] = spec

  // Build bitstream: 0100 (Byte) + 8-bit length + data + terminator + padding
  const bits = []
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >> i) & 1)
  }
  pushBits(0b0100, 4)
  pushBits(bytes.length, 8)
  for (const b of bytes) pushBits(b, 8)
  const maxBits = dataCap * 8
  pushBits(0, Math.min(4, maxBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)
  const pads = [0xec, 0x11]
  let pi = 0
  while (bits.length < maxBits) {
    pushBits(pads[pi % 2], 8)
    pi += 1
  }

  const data = new Uint8Array(dataCap)
  for (let i = 0; i < dataCap; i += 1) {
    let v = 0
    for (let b = 0; b < 8; b += 1) v = (v << 1) | bits[i * 8 + b]
    data[i] = v
  }

  // Split into blocks & interleave
  const blockSize = Math.floor(dataCap / blocks)
  const dBlocks = []
  const eBlocks = []
  for (let b = 0; b < blocks; b += 1) {
    const slice = data.slice(b * blockSize, (b + 1) * blockSize)
    dBlocks.push(slice)
    eBlocks.push(rsEncode(slice, ecLen))
  }
  const codewords = []
  for (let i = 0; i < blockSize; i += 1) {
    for (let b = 0; b < blocks; b += 1) codewords.push(dBlocks[b][i])
  }
  for (let i = 0; i < ecLen; i += 1) {
    for (let b = 0; b < blocks; b += 1) codewords.push(eBlocks[b][i])
  }

  // Matrix: -1 = empty, 0 = light, 1 = dark; reserved tracks function patterns
  const mat = Array.from({ length: size }, () => new Int8Array(size).fill(-1))
  const res = Array.from({ length: size }, () => new Uint8Array(size))

  const setFn = (r, c, v) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return
    mat[r][c] = v ? 1 : 0
    res[r][c] = 1
  }

  // Finder patterns + separators
  const drawFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = r0 + r
        const cc = c0 + c
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6
        const border = r === 0 || r === 6 || c === 0 || c === 6
        const center = r >= 2 && r <= 4 && c >= 2 && c <= 4
        setFn(rr, cc, inOuter && (border || center))
      }
    }
  }
  drawFinder(0, 0)
  drawFinder(0, size - 7)
  drawFinder(size - 7, 0)

  // Timing patterns
  for (let i = 8; i < size - 8; i += 1) {
    setFn(6, i, i % 2 === 0)
    setFn(i, 6, i % 2 === 0)
  }

  // Alignment patterns
  for (const r of aligns) {
    for (const c of aligns) {
      if (res[r][c]) continue
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1
          setFn(r + dr, c + dc, on)
        }
      }
    }
  }

  // Reserve format info areas + dark module
  for (let i = 0; i < 9; i += 1) {
    if (!res[8][i]) setFn(8, i, 0)
    if (!res[i][8]) setFn(i, 8, 0)
  }
  for (let i = 0; i < 8; i += 1) {
    setFn(8, size - 1 - i, 0)
    setFn(size - 1 - i, 8, 0)
  }
  setFn(size - 8, 8, 1)

  // Place data bits with mask 0 ((r + c) % 2 === 0)
  let bitIdx = 0
  const totalBits = codewords.length * 8
  let dirUp = true
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col -= 1
    for (let step = 0; step < size; step += 1) {
      const row = dirUp ? size - 1 - step : step
      for (const c of [col, col - 1]) {
        if (res[row][c]) continue
        let bit = 0
        if (bitIdx < totalBits) {
          bit = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1
          bitIdx += 1
        }
        if ((row + c) % 2 === 0) bit ^= 1
        mat[row][c] = bit
      }
    }
    dirUp = !dirUp
  }

  // Format bits for ECC Level L (01) + Mask 0 (000) -> 0b01000 -> BCH+XOR = 0x77c4
  const fmt = 0x77c4
  const fmtBit = (i) => (fmt >> (14 - i)) & 1
  const coords1 = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ]
  const coords2 = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5],
    [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ]
  for (let i = 0; i < 15; i += 1) {
    const v = fmtBit(i)
    mat[coords1[i][0]][coords1[i][1]] = v
    mat[coords2[i][0]][coords2[i][1]] = v
  }

  return mat
}

export function renderQrSvg(text, quietZone = 2) {
  const mat = encodeQrMatrix(text)
  if (!mat) return null
  const n = mat.length
  const total = n + quietZone * 2
  const rects = []
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (mat[r][c] === 1) {
        rects.push(`M${c + quietZone},${r + quietZone}h1v1h-1z`)
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${rects.join('')}" fill="#000"/></svg>`
}

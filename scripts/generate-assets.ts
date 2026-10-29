import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const ASSETS_DIR = fileURLToPath(new URL('../assets', import.meta.url))
const SEED = 20261028
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const GRAY = 0
const GRAY_ALPHA = 4

type Manifest = {
	file: string
	kind: 'texture' | 'svg'
	width: number
	height: number
	description: string
}

function random(seed: number): () => number {
	let state = seed
	return () => {
		state = (state + 0x6d2b79f5) | 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function chunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4)
	length.writeUInt32BE(data.length)
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
	const checksum = Buffer.alloc(4)
	checksum.writeUInt32BE(crc32(body))
	return Buffer.concat([length, body, checksum])
}

function png(width: number, height: number, colorType: number, pixels: Uint8Array): Buffer {
	const channels = colorType === GRAY_ALPHA ? 2 : 1
	const header = Buffer.alloc(13)
	header.writeUInt32BE(width, 0)
	header.writeUInt32BE(height, 4)
	header[8] = 8
	header[9] = colorType
	const rowBytes = width * channels
	const raw = Buffer.alloc((rowBytes + 1) * height)
	for (let y = 0; y < height; y++) {
		raw.set(pixels.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1)
	}
	return Buffer.concat([
		PNG_SIGNATURE,
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	])
}

// Value noise on a lattice that wraps at the tile edge, so the texture repeats without a seam.
function tilingNoise(size: number, octaves: number, basePeriod: number, next: () => number): Float32Array {
	const out = new Float32Array(size * size)
	let amplitude = 1
	let total = 0
	for (let octave = 0; octave < octaves; octave++) {
		const period = basePeriod * 2 ** octave
		const lattice = Array.from({ length: period * period }, next)
		const cell = size / period
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const gx = x / cell
				const gy = y / cell
				const x0 = Math.floor(gx)
				const y0 = Math.floor(gy)
				const sx = smooth(gx - x0)
				const sy = smooth(gy - y0)
				const at = (i: number, j: number) => lattice[(j % period) * period + (i % period)]
				const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
				const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
				out[y * size + x] += (top + (bottom - top) * sy) * amplitude
			}
		}
		total += amplitude
		amplitude /= 2
	}
	return out.map(value => value / total)
}

function smooth(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10)
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

function grain(size: number): Uint8Array {
	const next = random(SEED)
	return Uint8Array.from({ length: size * size }, () => clamp(Math.round(128 + (next() - 0.5) * 90), 0, 255))
}

function paper(size: number): Uint8Array {
	const fibres = tilingNoise(size, 6, 8, random(SEED + 1))
	const fine = random(SEED + 2)
	return Uint8Array.from(fibres, value => clamp(Math.round(128 + (value - 0.5) * 70 + (fine() - 0.5) * 14), 0, 255))
}

// Lines sit where the noise crosses each level. Dividing by the slope keeps them the same width on steep and flat ground.
function contours(size: number, levels: number, lineWidth: number): Uint8Array {
	const height = tilingNoise(size, 3, 3, random(SEED + 3)).map(value => value * levels)
	const pixels = new Uint8Array(size * size * 2)
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const value = height[y * size + x]
			const dx = height[y * size + ((x + 1) % size)] - height[y * size + ((x - 1 + size) % size)]
			const dy = height[((y + 1) % size) * size + x] - height[((y - 1 + size) % size) * size + x]
			const slope = Math.hypot(dx, dy) / 2 || 1e-6
			const fraction = value - Math.floor(value)
			const distance = Math.min(fraction, 1 - fraction) / slope
			const index = (y * size + x) * 2
			pixels[index] = 255
			pixels[index + 1] = Math.round(clamp(lineWidth / 2 + 0.5 - distance, 0, 1) * 255)
		}
	}
	return pixels
}

type LeafShape = {
	name: string
	length: number
	width: number
	shape: (t: number) => number
	teeth: number
	bend: number
	veins: number
	light: [string, string]
	dark: [string, string]
	rib: string
	vein: string
	spots: number
	description: string
}

const ovate = (t: number) => Math.sin(Math.PI * t ** 0.85) ** 0.9 * (1 - 0.15 * t)
const lanceolate = (t: number) => Math.sin(Math.PI * t ** 0.7) ** 1.2

const LEAVES: LeafShape[] = [
	{
		name: 'leaf-broad-green',
		length: 400,
		width: 0.42,
		shape: ovate,
		teeth: 0,
		bend: 0.04,
		veins: 9,
		light: ['#8DBE78', '#5E9A57'],
		dark: ['#4E8350', '#2F5E3A'],
		rib: '#C9E3B5',
		vein: '#B5D6A0',
		spots: 0,
		description: 'Broad green leaf with a lit left half and a shaded right half.',
	},
	{
		name: 'leaf-narrow-green',
		length: 400,
		width: 0.24,
		shape: lanceolate,
		teeth: 0,
		bend: -0.06,
		veins: 11,
		light: ['#76A86A', '#4A7F4B'],
		dark: ['#3D6E44', '#244B30'],
		rib: '#B9D8A6',
		vein: '#A5C996',
		spots: 0,
		description: 'Long narrow green leaf, like eucalyptus or willow, with a slight curve.',
	},
	{
		name: 'leaf-serrated-brown',
		length: 400,
		width: 0.46,
		shape: ovate,
		teeth: 22,
		bend: 0.03,
		veins: 12,
		light: ['#D9C2A0', '#B39373'],
		dark: ['#A6855F', '#7D5E42'],
		rib: '#F0E2CC',
		vein: '#E6D3B6',
		spots: 7,
		description: 'Dry brown leaf with a serrated edge, like elm or beech, with faint spots.',
	},
	{
		name: 'leaf-dry-tan',
		length: 400,
		width: 0.3,
		shape: lanceolate,
		teeth: 0,
		bend: 0.05,
		veins: 9,
		light: ['#F0DDB7', '#D2AE7D'],
		dark: ['#C99F6A', '#A27B4E'],
		rib: '#FBF0DC',
		vein: '#F4E4C6',
		spots: 4,
		description: 'Pale tan dried leaf, narrow, with faint spots.',
	},
	{
		name: 'leaf-bright-green',
		length: 400,
		width: 0.36,
		shape: ovate,
		teeth: 0,
		bend: -0.03,
		veins: 8,
		light: ['#A3D486', '#6DAE5C'],
		dark: ['#5C9E50', '#3B7A3D'],
		rib: '#DDF0CC',
		vein: '#C8E6B2',
		spots: 0,
		description: 'Fresh bright green leaf for a highlight or a leaf floating on its own.',
	},
]

const SAMPLES = 90
const STEM_LENGTH = 50
const MARGIN = 6

function point(x: number, y: number): string {
	return `${x.toFixed(1)},${y.toFixed(1)}`
}

// The leaf points up with its stem at the bottom centre, so rotation turns it about a predictable axis.
function leafSvg(leaf: LeafShape): { svg: string; width: number; height: number } {
	const halfWidth = (leaf.length * leaf.width) / 2
	const width = Math.ceil(halfWidth * 2 * 1.15 + MARGIN * 2)
	const height = leaf.length + STEM_LENGTH + MARGIN * 2
	const centre = width / 2
	const base = MARGIN + leaf.length
	const next = random(SEED + leaf.name.length * 31)

	const ribX = (t: number) => centre + leaf.bend * leaf.length * Math.sin(Math.PI * t)
	const ribY = (t: number) => base - leaf.length * t
	const edge = (t: number) => {
		let w = leaf.shape(t) * halfWidth
		if (leaf.teeth) {
			const tooth = (t * leaf.teeth) % 1
			w *= 1 + 0.05 * (tooth < 0.8 ? tooth / 0.8 : (1 - tooth) / 0.2) * Math.sin(Math.PI * t)
		}
		return w
	}

	const rib: string[] = []
	const left: string[] = []
	const right: string[] = []
	for (let i = 0; i <= SAMPLES; i++) {
		const t = i / SAMPLES
		rib.push(point(ribX(t), ribY(t)))
		left.push(point(ribX(t) - edge(t), ribY(t)))
		right.push(point(ribX(t) + edge(t), ribY(t)))
	}
	const ribBack = [...rib].reverse()
	const leftHalf = `M${left.join(' L')} L${ribBack.join(' L')} Z`
	const rightHalf = `M${right.join(' L')} L${ribBack.join(' L')} Z`

	const ribWidth = leaf.length * 0.012
	const ribEdge: string[] = []
	const ribOther: string[] = []
	for (let i = 0; i <= SAMPLES; i++) {
		const t = i / SAMPLES
		const w = ribWidth * (1 - t) + 0.3
		ribEdge.push(point(ribX(t) - w, ribY(t)))
		ribOther.push(point(ribX(t) + w, ribY(t)))
	}
	const midrib = `M${ribEdge.join(' L')} L${ribOther.reverse().join(' L')} Z`

	const veins: string[] = []
	for (let i = 0; i < leaf.veins; i++) {
		const start = 0.08 + (i / leaf.veins) * 0.8
		const reach = start + 0.12 + 0.05 * (1 - start)
		const strokeWidth = (2.6 * (1 - start * 0.7)).toFixed(2)
		for (const side of [-1, 1]) {
			const sx = ribX(start)
			const sy = ribY(start)
			const ex = ribX(reach) + side * edge(reach) * 0.88
			const ey = ribY(reach)
			const cx = ribX(start + 0.03) + side * edge(start + 0.03) * 0.55
			const cy = ribY(start + 0.03)
			veins.push(`<path d="M${point(sx, sy)} Q${point(cx, cy)} ${point(ex, ey)}" stroke-width="${strokeWidth}"/>`)
		}
	}

	const spots: string[] = []
	for (let i = 0; i < leaf.spots; i++) {
		const t = 0.15 + next() * 0.7
		const offset = (next() * 2 - 1) * edge(t) * 0.7
		const r = 3 + next() * 7
		spots.push(
			`<ellipse cx="${(ribX(t) + offset).toFixed(1)}" cy="${ribY(t).toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.7).toFixed(1)}" opacity="${(0.15 + next() * 0.2).toFixed(2)}"/>`
		)
	}

	const stemEnd = base + STEM_LENGTH
	const top = ribY(1)
	const svg = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
		`<defs>`,
		`<linearGradient id="light" gradientUnits="userSpaceOnUse" x1="${centre}" y1="${top}" x2="${centre - halfWidth}" y2="${base}"><stop offset="0" stop-color="${leaf.light[0]}"/><stop offset="1" stop-color="${leaf.light[1]}"/></linearGradient>`,
		`<linearGradient id="dark" gradientUnits="userSpaceOnUse" x1="${centre}" y1="${top}" x2="${centre + halfWidth}" y2="${base}"><stop offset="0" stop-color="${leaf.dark[0]}"/><stop offset="1" stop-color="${leaf.dark[1]}"/></linearGradient>`,
		`</defs>`,
		`<path d="M${point(centre, base)} Q${point(centre + 4, base + STEM_LENGTH * 0.6)} ${point(centre + 8, stemEnd)}" fill="none" stroke="${leaf.dark[1]}" stroke-width="${(ribWidth * 1.6).toFixed(1)}" stroke-linecap="round"/>`,
		`<path d="${leftHalf}" fill="url(#light)"/>`,
		`<path d="${rightHalf}" fill="url(#dark)"/>`,
		spots.length ? `<g fill="${leaf.dark[1]}">${spots.join('')}</g>` : '',
		`<g fill="none" stroke="${leaf.vein}" stroke-linecap="round" opacity="0.6">${veins.join('')}</g>`,
		`<path d="${midrib}" fill="${leaf.rib}"/>`,
		`</svg>`,
	].join('')
	return { svg, width, height }
}

const TEXTURE_SIZE = 512
const CONTOUR_SIZE = 1024

mkdirSync(path.join(ASSETS_DIR, 'textures'), { recursive: true })
mkdirSync(path.join(ASSETS_DIR, 'leaves'), { recursive: true })

const manifest: Manifest[] = []

function writeTexture(name: string, size: number, colorType: number, pixels: Uint8Array, description: string) {
	const file = `textures/${name}.png`
	writeFileSync(path.join(ASSETS_DIR, file), png(size, size, colorType, pixels))
	manifest.push({ file, kind: 'texture', width: size, height: size, description })
}

writeTexture(
	'grain',
	TEXTURE_SIZE,
	GRAY,
	grain(TEXTURE_SIZE),
	'Fine film grain on mid gray. Fill a rectangle with it in tile mode and set blendingMode Overlay or SoftLight with opacity 0.1 to 0.3.'
)
writeTexture(
	'paper',
	TEXTURE_SIZE,
	GRAY,
	paper(TEXTURE_SIZE),
	'Soft paper or felt texture on mid gray. Fill a rectangle with it in tile mode and set blendingMode Overlay or SoftLight with opacity 0.2 to 0.5.'
)
writeTexture(
	'contours',
	CONTOUR_SIZE,
	GRAY_ALPHA,
	contours(CONTOUR_SIZE, 18, 2),
	'White topographic contour lines on a clear background. Fill a rectangle with it in tile mode and set opacity 0.05 to 0.2.'
)

for (const leaf of LEAVES) {
	const { svg, width, height } = leafSvg(leaf)
	const file = `leaves/${leaf.name}.svg`
	writeFileSync(path.join(ASSETS_DIR, file), svg)
	manifest.push({
		file,
		kind: 'svg',
		width,
		height,
		description: `${leaf.description} Points up with the stem at the bottom. Place it with svgFile and turn it with rotation.`,
	})
}

writeFileSync(path.join(ASSETS_DIR, 'manifest.json'), JSON.stringify(manifest, null, '\t') + '\n')
console.log(`Wrote ${manifest.length} assets to ${ASSETS_DIR}`)

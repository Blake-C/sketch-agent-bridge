import { access, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { FETCH_TIMEOUT_MS, networkError, readLimited } from './http.ts'
import { BridgeError } from './sketch.ts'

export const FONTS_DIR = path.join(homedir(), 'Library', 'Fonts')
export const CSS_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export const FAMILY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/

const CSS_URL = 'https://fonts.googleapis.com/css2'
const FONT_HOST = 'fonts.gstatic.com'
const MAX_CSS_BYTES = 256 * 1024
const MAX_FONT_BYTES = 20 * 1024 * 1024
const HTTP_BAD_REQUEST = 400
// TrueType files start with version 1.0 or "true", and OpenType files with CFF outlines start with "OTTO".
const FONT_SIGNATURES = ['00010000', '74727565', '4f54544f']
const FACE_PATTERN = /@font-face\s*\{([^}]*)\}/g

export type FontStyle = { weight: number; italic: boolean }
export type Face = FontStyle & { url: string }
export type FontRequest = { family: string; weights?: number[]; italic?: boolean }
export type InstalledFace = FontStyle & { path: string; status: 'installed' | 'already installed' }
export type FontDeps = { fetch: typeof globalThis.fetch }

export const defaultFontDeps: FontDeps = { fetch: globalThis.fetch }

export function cssUrl(family: string, styles: FontStyle[]): URL {
	// The CSS API needs the tuples sorted numerically.
	const tuples = [...styles]
		.sort((a, b) => Number(a.italic) - Number(b.italic) || a.weight - b.weight)
		.map(style => `${style.italic ? 1 : 0},${style.weight}`)
		.join(';')
	const url = new URL(CSS_URL)
	url.searchParams.set('family', `${family}:ital,wght@${tuples}`)
	return url
}

export function parseFaces(css: string): Face[] {
	const faces: Face[] = []
	for (const [, body] of css.matchAll(FACE_PATTERN)) {
		const weight = Number(body.match(/font-weight:\s*(\d+)/)?.[1])
		const italic = body.match(/font-style:\s*(\w+)/)?.[1] === 'italic'
		const url = body.match(/src:\s*url\(([^)]+)\)/)?.[1]
		if (url && weight) faces.push({ weight, italic, url })
	}
	return faces
}

export function fileNameFor(family: string, style: FontStyle): string {
	return `${family.replaceAll(' ', '')}-${style.weight}${style.italic ? 'Italic' : ''}.ttf`
}

function isFont(data: Buffer): boolean {
	return data.byteLength > 4 && FONT_SIGNATURES.includes(data.subarray(0, 4).toString('hex'))
}

// Google answers HTTP 400 when the family does not exist or lacks one of the asked-for styles.
async function fetchFaces(deps: FontDeps, family: string, styles: FontStyle[]): Promise<Face[] | null> {
	const response = await deps
		.fetch(cssUrl(family, styles), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
		.catch(error => Promise.reject(networkError('Asking Google Fonts for a font', error)))
	if (response.status === HTTP_BAD_REQUEST) return null
	if (!response.ok) throw new BridgeError(`Google Fonts answered with HTTP ${response.status}`)
	const tooLarge = () => new BridgeError('Google Fonts sent a stylesheet larger than expected')
	return parseFaces((await readLimited(response, MAX_CSS_BYTES, tooLarge)).toString('utf8'))
}

function describe(style: FontStyle): string {
	return `${style.weight}${style.italic ? ' italic' : ''}`
}

// A weight range that goes past the family's weights fails as a whole, so each style is asked for on its own.
async function availableFaces(deps: FontDeps, family: string, styles: FontStyle[]): Promise<Face[]> {
	const found = await Promise.all(styles.map(style => fetchFaces(deps, family, [style])))
	return found.flatMap(faces => faces ?? [])
}

export function stylesFor(request: FontRequest): FontStyle[] {
	const weights = request.weights?.length ? [...new Set(request.weights)] : [...CSS_WEIGHTS]
	const styles = weights.map(weight => ({ weight, italic: false }))
	if (request.italic) styles.push(...weights.map(weight => ({ weight, italic: true })))
	return styles
}

function sameStyle(a: FontStyle, b: FontStyle): boolean {
	return a.weight === b.weight && a.italic === b.italic
}

export async function findFaces(request: FontRequest, deps: FontDeps = defaultFontDeps): Promise<Face[]> {
	const styles = stylesFor(request)
	const faces = await availableFaces(deps, request.family, styles)
	const missing = styles.filter(style => !faces.some(face => sameStyle(face, style)))
	if (faces.length > 0 && (!request.weights?.length || missing.length === 0)) return faces
	const every = await availableFaces(deps, request.family, stylesFor({ family: request.family, italic: true }))
	if (every.length === 0) {
		throw new BridgeError(
			`Google Fonts has no family named "${request.family}". Names are case-sensitive, so use the name as written on fonts.google.com, such as "Playfair Display".`
		)
	}
	throw new BridgeError(
		`${request.family} has no ${missing.map(describe).join(', ')}. Its styles are ${every.map(describe).join(', ')}.`
	)
}

async function downloadFace(deps: FontDeps, face: Face): Promise<Buffer> {
	const url = new URL(face.url)
	if (url.protocol !== 'https:' || url.hostname !== FONT_HOST) {
		throw new BridgeError(`Google Fonts linked to ${url.hostname} instead of ${FONT_HOST}`)
	}
	const response = await deps
		.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
		.catch(error => Promise.reject(networkError('Downloading a font', error)))
	if (!response.ok) throw new BridgeError(`Downloading a font failed with HTTP ${response.status}`)
	if (response.url && new URL(response.url).hostname !== FONT_HOST) {
		throw new BridgeError(`Downloading a font was redirected to ${new URL(response.url).hostname}`)
	}
	const tooLarge = () => new BridgeError(`Google Fonts sent a font larger than ${MAX_FONT_BYTES / 1024 / 1024} MB`)
	const data = await readLimited(response, MAX_FONT_BYTES, tooLarge)
	if (!isFont(data)) throw new BridgeError('Google Fonts sent a file that is not a TrueType or OpenType font')
	return data
}

async function exists(file: string): Promise<boolean> {
	return access(file).then(
		() => true,
		() => false
	)
}

// The "wx" flag refuses to replace a file that is already there, so an installed font is never overwritten.
export async function installFaces(
	family: string,
	faces: Face[],
	fontsDir: string = FONTS_DIR,
	deps: FontDeps = defaultFontDeps
): Promise<InstalledFace[]> {
	return Promise.all(
		faces.map(async face => {
			const file = path.join(fontsDir, fileNameFor(family, face))
			const style = { weight: face.weight, italic: face.italic }
			if (await exists(file)) return { ...style, path: file, status: 'already installed' }
			try {
				await writeFile(file, await downloadFace(deps, face), { flag: 'wx', mode: 0o644 })
			} catch (error) {
				if ((error as { code?: string }).code === 'EEXIST')
					return { ...style, path: file, status: 'already installed' }
				throw error
			}
			return { ...style, path: file, status: 'installed' }
		})
	)
}

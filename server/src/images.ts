import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net'
import path from 'node:path'
import { BridgeError } from './sketch.ts'

const FETCH_TIMEOUT_MS = 120_000
const CONNECT_ATTEMPT_TIMEOUT_MS = 1000
const KEY_TIMEOUT_MS = 10_000
const MAX_ERROR_CHARS = 300
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const JPEG_QUALITY = '80'
const KEYCHAIN_SERVICE = 'unsplash_access_key'
const KEY_ENV = 'UNSPLASH_ACCESS_KEY'
const SEARCH_URL = 'https://api.unsplash.com/search/photos'
const API_HOST = 'api.unsplash.com'
const IMAGE_HOST = 'images.unsplash.com'
const UNSPLASH_URL = 'https://unsplash.com/'
const UTM = { utm_source: 'sketch_agent_bridge', utm_medium: 'referral' }
// Unsplash sometimes sends raw control characters inside strings, which JSON.parse rejects.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f]/g

// Node 24 gives each address 250 ms before trying the next. An IPv4 connection to images.unsplash.com can take about 240 ms, and on a network with no working IPv6 route the IPv6 attempt then fails with UND_ERR_CONNECT_TIMEOUT.
setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS)

export const ORIENTATIONS = ['landscape', 'portrait', 'squarish', 'any'] as const
export const COLORS = [
	'black_and_white',
	'black',
	'white',
	'yellow',
	'orange',
	'red',
	'purple',
	'magenta',
	'green',
	'teal',
	'blue',
] as const

export type FetchRequest = {
	query: string
	count: number
	width: number
	height: number
	orientation?: (typeof ORIENTATIONS)[number]
	color?: (typeof COLORS)[number]
}

export type Credit = { photographer: string; profileUrl: string; text: string }
export type FetchedImage = { path: string; credit: Credit }
export type FetchResult = { images: FetchedImage[]; warnings: string[] }

export type FetchDeps = {
	fetch: typeof globalThis.fetch
	readKey: () => Promise<string>
}

type Photo = {
	urls: { raw: string }
	links: { download_location: string }
	user: { name: string; username: string }
}

function readKeychainKey(): Promise<string> {
	return new Promise(resolve => {
		execFile(
			'/usr/bin/security',
			['find-generic-password', '-a', process.env.USER ?? '', '-s', KEYCHAIN_SERVICE, '-w'],
			{ timeout: KEY_TIMEOUT_MS },
			(error, stdout) => resolve(error ? '' : stdout.trim())
		)
	})
}

export async function readAccessKey(): Promise<string> {
	const key = (await readKeychainKey()) || (process.env[KEY_ENV] ?? '').trim()
	if (!key) {
		throw new BridgeError(
			`Image fetching needs an Unsplash access key from https://unsplash.com/developers. Add it to the login keychain with: security add-generic-password -a "$USER" -s ${KEYCHAIN_SERVICE} -w, or register the server with -e ${KEY_ENV}=<key>.`
		)
	}
	return key
}

export const defaultDeps: FetchDeps = { fetch: globalThis.fetch, readKey: readAccessKey }

export function slug(text: string): string {
	return (
		text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 40) || 'image'
	)
}

export function orientationFor(width: number, height: number): (typeof ORIENTATIONS)[number] {
	if (width > height) return 'landscape'
	if (width < height) return 'portrait'
	return 'squarish'
}

function withUtm(url: string): string {
	const parsed = new URL(url)
	for (const [name, value] of Object.entries(UTM)) parsed.searchParams.set(name, value)
	return parsed.toString()
}

function creditFor(photo: Photo): Credit {
	const photographer = photo.user.name || photo.user.username
	return {
		photographer,
		profileUrl: withUtm(`${UNSPLASH_URL}@${encodeURIComponent(photo.user.username)}`),
		text: `Photo by ${photographer} on Unsplash`,
	}
}

function requireHost(url: string, host: string): URL {
	let parsed: URL
	try {
		parsed = new URL(url)
	} catch {
		throw new BridgeError('Unsplash returned a link that is not a URL')
	}
	if (parsed.protocol !== 'https:' || parsed.hostname !== host) {
		throw new BridgeError(`Unsplash returned a link to ${parsed.hostname} instead of ${host}`)
	}
	return parsed
}

function apiHeaders(key: string): Record<string, string> {
	return { 'Accept-Version': 'v1', 'Authorization': `Client-ID ${key}` }
}

// fetch rejects with the message "fetch failed" and puts the reason, such as ECONNRESET, in cause.
function networkError(action: string, error: unknown): BridgeError {
	if (error instanceof BridgeError) return error
	const cause = error instanceof Error && error.cause instanceof Error ? error.cause : undefined
	const reason = (cause as { code?: string } | undefined)?.code ?? cause?.message
	const message = error instanceof Error ? error.message : String(error)
	return new BridgeError(`${action} failed: ${reason ? `${message} (${reason})` : message}`)
}

// Unsplash sends JSON with an errors list for most failures, and may send plain text for others.
async function errorDetail(response: Response, key: string): Promise<string> {
	const text = await response.text().catch(() => '')
	let detail: string
	try {
		const body = JSON.parse(text.replace(CONTROL_CHARS, ' '))
		detail = Array.isArray(body?.errors) ? String(body.errors[0] ?? '') : ''
	} catch {
		detail = text.split('\n')[0].replace(CONTROL_CHARS, ' ')
	}
	return detail.trim().replaceAll(key, '<key>').slice(0, MAX_ERROR_CHARS)
}

async function apiError(response: Response, key: string): Promise<BridgeError> {
	const detail = await errorDetail(response, key)
	return new BridgeError(`Unsplash search failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
}

async function search(
	deps: FetchDeps,
	key: string,
	request: FetchRequest,
	color: string | undefined,
	orientation: string
): Promise<{ total: number; results: Photo[] }> {
	const url = new URL(SEARCH_URL)
	url.searchParams.set('query', request.query)
	url.searchParams.set('per_page', String(request.count))
	url.searchParams.set('order_by', 'relevant')
	if (color) url.searchParams.set('color', color)
	if (orientation !== 'any') url.searchParams.set('orientation', orientation)
	const response = await deps
		.fetch(url, { headers: apiHeaders(key), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
		.catch(error => Promise.reject(networkError('Searching Unsplash', error)))
	if (!response.ok) throw await apiError(response, key)
	const body = JSON.parse((await response.text()).replace(CONTROL_CHARS, ' '))
	return { total: Number(body.total ?? 0), results: Array.isArray(body.results) ? body.results : [] }
}

// An empty search drops color first, then orientation, because the crop to width and height sets the photo's shape.
async function searchWithFallback(
	deps: FetchDeps,
	key: string,
	request: FetchRequest
): Promise<{ photos: Photo[]; warnings: string[] }> {
	const warnings: string[] = []
	let color: string | undefined = request.color
	let orientation: string = request.orientation ?? orientationFor(request.width, request.height)
	for (;;) {
		const { total, results } = await search(deps, key, request, color, orientation)
		if (total > 0 && results.length > 0) {
			if (results.length < request.count) {
				warnings.push(
					`Unsplash returned only ${results.length} of ${request.count} photos for "${request.query}".`
				)
			}
			return { photos: results.slice(0, request.count), warnings }
		}
		if (color) {
			warnings.push(`No ${color} photos matched "${request.query}", so the search ran again without color.`)
			color = undefined
		} else if (orientation !== 'any') {
			warnings.push(
				`No ${orientation} photos matched "${request.query}", so the search ran again without orientation.`
			)
			orientation = 'any'
		} else {
			throw new BridgeError(`No photos matched "${request.query}"`)
		}
	}
}

async function download(deps: FetchDeps, photo: Photo, request: FetchRequest, file: string): Promise<void> {
	const url = requireHost(photo.urls.raw, IMAGE_HOST)
	url.searchParams.set('w', String(request.width))
	url.searchParams.set('h', String(request.height))
	url.searchParams.set('fit', 'crop')
	url.searchParams.set('q', JPEG_QUALITY)
	url.searchParams.set('fm', 'jpg')
	const response = await deps
		.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
		.catch(error => Promise.reject(networkError('Downloading a photo', error)))
	if (!response.ok) throw new BridgeError(`Downloading a photo failed with HTTP ${response.status}`)
	const type = response.headers.get('content-type') ?? ''
	if (!type.startsWith('image/'))
		throw new BridgeError(`Unsplash sent ${type || 'no content type'} instead of an image`)
	if (response.url && new URL(response.url).hostname !== IMAGE_HOST) {
		throw new BridgeError(`Downloading a photo was redirected to ${new URL(response.url).hostname}`)
	}
	await writeFile(file, await readLimited(response, MAX_IMAGE_BYTES), { mode: 0o600 })
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
	const tooLarge = () => new BridgeError(`Unsplash sent a photo larger than ${maxBytes / 1024 / 1024} MB`)
	if (Number(response.headers.get('content-length') ?? 0) > maxBytes) throw tooLarge()
	const chunks: Uint8Array[] = []
	let total = 0
	if (response.body) {
		for await (const chunk of response.body) {
			total += chunk.byteLength
			if (total > maxBytes) throw tooLarge()
			chunks.push(chunk)
		}
	}
	return Buffer.concat(chunks)
}

// Unsplash's API guidelines require a request to download_location for each photo the app uses.
async function trackDownload(deps: FetchDeps, key: string, photo: Photo): Promise<string | undefined> {
	try {
		const url = requireHost(photo.links.download_location, API_HOST)
		const response = await deps.fetch(url, {
			headers: apiHeaders(key),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		})
		if (!response.ok) {
			const detail = await errorDetail(response, key)
			return `Unsplash did not record a download (HTTP ${response.status}${detail ? `: ${detail}` : ''}).`
		}
	} catch (error) {
		return `Unsplash did not record a download: ${error instanceof Error ? error.message : String(error)}`
	}
	return undefined
}

export async function fetchImages(
	bridgeDir: string,
	request: FetchRequest,
	deps: FetchDeps = defaultDeps
): Promise<FetchResult> {
	const key = await deps.readKey()
	const { photos, warnings } = await searchWithFallback(deps, key, request)
	const dir = path.join(bridgeDir, 'images', randomUUID())
	await mkdir(dir, { recursive: true, mode: 0o700 })
	const name = slug(request.query)
	const settled = await Promise.allSettled(
		photos.map(async (photo, index) => {
			const file = path.join(dir, photos.length > 1 ? `${name}-${index + 1}.jpg` : `${name}.jpg`)
			await download(deps, photo, request, file)
			const trackWarning = await trackDownload(deps, key, photo)
			if (trackWarning) warnings.push(trackWarning)
			return { path: file, credit: creditFor(photo) }
		})
	)
	const images: FetchedImage[] = []
	const failures: unknown[] = []
	for (const outcome of settled) {
		if (outcome.status === 'fulfilled') images.push(outcome.value)
		else failures.push(outcome.reason)
	}
	if (images.length === 0) throw failures[0]
	for (const failure of failures) {
		warnings.push(`${failure instanceof Error ? failure.message : String(failure)}, so one photo is missing.`)
	}
	return { images, warnings }
}

import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fetchImages, orientationFor, slug, type FetchDeps } from '../src/images.ts'

const KEY = 'secret-test-key'
const request = { query: 'sea; rm -rf ~', count: 2, width: 800, height: 600 }

function photo(id: string, raw = `https://images.unsplash.com/photo-${id}?ixid=abc`) {
	return {
		urls: { raw },
		links: { download_location: `https://api.unsplash.com/photos/${id}/download?ixid=abc` },
		user: { name: `Name ${id}`, username: `user${id}` },
	}
}

type Call = { url: URL; headers: Record<string, string> }

function fakeFetch(searchReplies: object[], options: { imageType?: string; searchStatus?: number } = {}) {
	const calls: Call[] = []
	let searches = 0
	const fetch = (async (input: URL | string, init?: RequestInit) => {
		const url = new URL(String(input))
		calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
		if (url.pathname === '/search/photos') {
			const body = searchReplies[Math.min(searches++, searchReplies.length - 1)]
			return new Response(JSON.stringify(body), { status: options.searchStatus ?? 200 })
		}
		if (url.hostname === 'images.unsplash.com') {
			return new Response(`jpeg ${url.pathname}`, {
				headers: { 'content-type': options.imageType ?? 'image/jpeg' },
			})
		}
		return new Response('{}')
	}) as typeof globalThis.fetch
	return { fetch, calls, searchCalls: () => calls.filter(call => call.url.pathname === '/search/photos') }
}

function deps(fetch: typeof globalThis.fetch, key = KEY): FetchDeps {
	return { fetch, readKey: async () => key }
}

async function bridgeDir() {
	return mkdtemp(path.join(tmpdir(), 'images-test-'))
}

test('fetchImages searches, downloads cropped JPEGs, records downloads, and credits photographers', async () => {
	const fake = fakeFetch([{ total: 2, results: [photo('1'), photo('2')] }])
	const dir = await bridgeDir()

	const { images, warnings } = await fetchImages(dir, request, deps(fake.fetch))

	const [search] = fake.searchCalls()
	assert.equal(search.url.searchParams.get('query'), 'sea; rm -rf ~')
	assert.equal(search.url.searchParams.get('per_page'), '2')
	assert.equal(search.url.searchParams.get('orientation'), 'landscape')
	assert.equal(search.url.searchParams.has('color'), false)
	assert.equal(search.headers['Authorization'], `Client-ID ${KEY}`)

	const download = fake.calls.find(call => call.url.hostname === 'images.unsplash.com')
	assert.equal(download?.url.searchParams.get('w'), '800')
	assert.equal(download?.url.searchParams.get('h'), '600')
	assert.equal(download?.url.searchParams.get('fit'), 'crop')
	assert.equal(download?.url.searchParams.get('fm'), 'jpg')
	assert.equal(download?.headers['Authorization'], undefined)

	const tracked = fake.calls.filter(call => call.url.pathname.endsWith('/download'))
	assert.equal(tracked.length, 2)

	assert.deepEqual(warnings, [])
	assert.deepEqual(
		images.map(image => path.basename(image.path)),
		['sea-rm-rf-1.jpg', 'sea-rm-rf-2.jpg']
	)
	assert.ok(images[0].path.startsWith(path.join(dir, 'images')))
	assert.equal(await readFile(images[0].path, 'utf8'), 'jpeg /photo-1')
	assert.equal((await stat(images[0].path)).mode & 0o777, 0o600)
	assert.deepEqual(images[0].credit, {
		photographer: 'Name 1',
		profileUrl: 'https://unsplash.com/@user1?utm_source=sketch_agent_bridge&utm_medium=referral',
		text: 'Photo by Name 1 on Unsplash',
	})
})

test('fetchImages names a single photo without a number', async () => {
	const fake = fakeFetch([{ total: 1, results: [photo('1')] }])
	const { images } = await fetchImages(await bridgeDir(), { ...request, count: 1 }, deps(fake.fetch))
	assert.equal(path.basename(images[0].path), 'sea-rm-rf.jpg')
})

test('fetchImages warns when fewer photos match than were asked for', async () => {
	const fake = fakeFetch([{ total: 1, results: [photo('1')] }])
	const { images, warnings } = await fetchImages(await bridgeDir(), request, deps(fake.fetch))
	assert.equal(images.length, 1)
	assert.deepEqual(warnings, ['Unsplash returned only 1 of 2 photos for "sea; rm -rf ~".'])
})

test('fetchImages drops color first, then orientation, and warns about each', async () => {
	const empty = { total: 0, results: [] }
	const fake = fakeFetch([empty, empty, { total: 1, results: [photo('1')] }])

	const { warnings } = await fetchImages(
		await bridgeDir(),
		{ ...request, count: 1, orientation: 'portrait', color: 'orange' },
		deps(fake.fetch)
	)

	const searches = fake.searchCalls().map(call => call.url.searchParams)
	assert.deepEqual(
		searches.map(params => [params.get('color'), params.get('orientation')]),
		[
			['orange', 'portrait'],
			[null, 'portrait'],
			[null, null],
		]
	)
	assert.equal(warnings.length, 2)
	assert.match(warnings[0], /orange.*without color/)
	assert.match(warnings[1], /portrait.*without orientation/)
})

test('fetchImages reports when no photo matches', async () => {
	const fake = fakeFetch([{ total: 0, results: [] }])
	await assert.rejects(
		fetchImages(await bridgeDir(), { ...request, orientation: 'any' }, deps(fake.fetch)),
		/No photos matched "sea; rm -rf ~"/
	)
	assert.equal(fake.searchCalls().length, 1)
})

test('fetchImages refuses image links outside images.unsplash.com', async () => {
	for (const raw of ['https://evil.example/photo.jpg', 'http://images.unsplash.com/photo-1', 'not a url']) {
		const fake = fakeFetch([{ total: 1, results: [photo('1', raw)] }])
		await assert.rejects(fetchImages(await bridgeDir(), request, deps(fake.fetch)), /Unsplash returned a link/)
		assert.equal(
			fake.calls.some(call => call.url.hostname !== 'api.unsplash.com'),
			false
		)
	}
})

test('fetchImages refuses a download that is not an image', async () => {
	const fake = fakeFetch([{ total: 1, results: [photo('1')] }], { imageType: 'text/html' })
	await assert.rejects(fetchImages(await bridgeDir(), request, deps(fake.fetch)), /text\/html instead of an image/)
})

test('fetchImages keeps the photos that downloaded and warns about one that failed', async () => {
	const fake = fakeFetch([{ total: 2, results: [photo('1'), photo('2')] }])
	const reset = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' })
	const fetch = (async (input: URL | string, init?: RequestInit) => {
		if (new URL(String(input)).pathname === '/photo-2') throw new TypeError('fetch failed', { cause: reset })
		return fake.fetch(input, init)
	}) as typeof globalThis.fetch

	const { images, warnings } = await fetchImages(await bridgeDir(), request, deps(fetch))

	assert.deepEqual(
		images.map(image => path.basename(image.path)),
		['sea-rm-rf-1.jpg']
	)
	assert.deepEqual(warnings, ['Downloading a photo failed: fetch failed (ECONNRESET), so one photo is missing.'])
})

test('fetchImages reports the first Unsplash error and never the key', async () => {
	const fake = fakeFetch([{ errors: [`OAuth error: The access token is invalid (${KEY})`, 'second'] }], {
		searchStatus: 401,
	})
	await assert.rejects(fetchImages(await bridgeDir(), request, deps(fake.fetch)), (error: Error) => {
		assert.match(error.message, /HTTP 401: OAuth error/)
		assert.doesNotMatch(error.message, /second/)
		assert.equal(error.message.includes(KEY), false)
		return true
	})
})

test('fetchImages keeps the photo and gives the Unsplash text when the download request fails', async () => {
	const fake = fakeFetch([{ total: 1, results: [photo('1')] }])
	const fetch = (async (input: URL | string, init?: RequestInit) => {
		if (new URL(String(input)).pathname.endsWith('/download')) {
			return new Response(`Rate Limit Exceeded\nkey ${KEY}`, { status: 403 })
		}
		return fake.fetch(input, init)
	}) as typeof globalThis.fetch

	const { images, warnings } = await fetchImages(await bridgeDir(), { ...request, count: 1 }, deps(fetch))

	assert.equal(images.length, 1)
	assert.deepEqual(warnings, ['Unsplash did not record a download (HTTP 403: Rate Limit Exceeded).'])
})

test('fetchImages reports a plain text search error', async () => {
	const fetch = (async () => new Response(`Rate Limit Exceeded ${KEY}`, { status: 403 })) as typeof globalThis.fetch
	await assert.rejects(fetchImages(await bridgeDir(), request, deps(fetch)), (error: Error) => {
		assert.equal(error.message, 'Unsplash search failed with HTTP 403: Rate Limit Exceeded <key>')
		return true
	})
})

test('fetchImages passes the setup message through when there is no key', async () => {
	const fake = fakeFetch([])
	const missing: FetchDeps = {
		fetch: fake.fetch,
		readKey: async () => {
			throw new Error('needs an Unsplash access key')
		},
	}
	await assert.rejects(fetchImages(await bridgeDir(), request, missing), /needs an Unsplash access key/)
	assert.equal(fake.calls.length, 0)
})

test('fetchImages parses replies with raw control characters', async () => {
	const fake = fakeFetch([])
	const body = JSON.stringify({ total: 1, results: [photo('1')] }).replace('Name 1', 'Name\n1')
	const fetch = (async (input: URL | string, init?: RequestInit) => {
		if (new URL(String(input)).pathname === '/search/photos') return new Response(body)
		return fake.fetch(input, init)
	}) as typeof globalThis.fetch
	const { images } = await fetchImages(await bridgeDir(), { ...request, count: 1 }, deps(fetch))
	assert.equal(images[0].credit.photographer, 'Name 1')
})

test('orientationFor follows the shape of width and height', () => {
	assert.equal(orientationFor(1600, 900), 'landscape')
	assert.equal(orientationFor(900, 1600), 'portrait')
	assert.equal(orientationFor(500, 500), 'squarish')
})

test('slug keeps file names to letters, numbers, and dashes', () => {
	assert.equal(slug('Team Photo / Office!'), 'team-photo-office')
	assert.equal(slug('***'), 'image')
})

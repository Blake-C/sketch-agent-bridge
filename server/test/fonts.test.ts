import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { installGoogleFont } from '../src/font-tools.ts'
import { cssUrl, fileNameFor, findFaces, installFaces, parseFaces, type FontDeps } from '../src/fonts.ts'
import { SketchBridge, type Runner } from '../src/sketch.ts'
import { requestFrom } from './helpers.ts'

const TTF = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x0a])
const CATALOG: Record<string, string[]> = { 'Playfair Display': ['0,400', '0,700', '1,400'] }

type Options = { fontHost?: string; fontBody?: Buffer }

function fakeGoogle(options: Options = {}) {
	const cssCalls: string[] = []
	const downloads: string[] = []
	const fetch = (async (input: URL | string) => {
		const url = new URL(String(input))
		if (url.hostname === 'fonts.googleapis.com') {
			const query = url.searchParams.get('family') ?? ''
			cssCalls.push(query)
			const [family, axes] = query.split(':')
			const tuples = axes.split('@')[1].split(';')
			const known = CATALOG[family]
			if (!known || tuples.some(tuple => !known.includes(tuple))) return new Response('<html>', { status: 400 })
			const css = tuples
				.map(tuple => {
					const [ital, weight] = tuple.split(',')
					const host = options.fontHost ?? 'fonts.gstatic.com'
					return `@font-face {\n  font-family: '${family}';\n  font-style: ${ital === '1' ? 'italic' : 'normal'};\n  font-weight: ${weight};\n  src: url(https://${host}/s/f/${ital}-${weight}.ttf) format('truetype');\n}`
				})
				.join('\n')
			return new Response(css, { headers: { 'content-type': 'text/css' } })
		}
		downloads.push(url.pathname)
		return new Response(new Uint8Array(options.fontBody ?? TTF), { headers: { 'content-type': 'font/ttf' } })
	}) as typeof globalThis.fetch
	const deps: FontDeps = { fetch }
	return { deps, cssCalls, downloads }
}

async function fontsDir() {
	return mkdtemp(path.join(tmpdir(), 'fonts-test-'))
}

test('cssUrl asks for each style as an ital,wght tuple', () => {
	const url = cssUrl('Playfair Display', [
		{ weight: 400, italic: false },
		{ weight: 700, italic: true },
	])
	assert.equal(url.hostname, 'fonts.googleapis.com')
	assert.equal(url.searchParams.get('family'), 'Playfair Display:ital,wght@0,400;1,700')
})

test('parseFaces reads the style, weight, and file of each @font-face block', () => {
	const css = `@font-face {
  font-family: 'Inter';
  font-style: italic;
  font-weight: 300;
  src: url(https://fonts.gstatic.com/s/inter/a.ttf) format('truetype');
}`
	assert.deepEqual(parseFaces(css), [{ weight: 300, italic: true, url: 'https://fonts.gstatic.com/s/inter/a.ttf' }])
})

test('findFaces asks for each weight on its own and keeps the ones the family has', async () => {
	const google = fakeGoogle()
	const faces = await findFaces({ family: 'Playfair Display' }, google.deps)
	assert.deepEqual(
		faces.map(face => [face.weight, face.italic]),
		[
			[400, false],
			[700, false],
		]
	)
	assert.equal(google.cssCalls.length, 9)
})

test('findFaces adds italics when asked', async () => {
	const faces = await findFaces({ family: 'Playfair Display', italic: true }, fakeGoogle().deps)
	assert.deepEqual(
		faces.map(face => [face.weight, face.italic]),
		[
			[400, false],
			[700, false],
			[400, true],
		]
	)
})

test('findFaces names the missing weights and the styles the family has', async () => {
	await assert.rejects(
		findFaces({ family: 'Playfair Display', weights: [400, 900] }, fakeGoogle().deps),
		/has no 900\. Its styles are 400, 700, 400 italic\./
	)
})

test('findFaces says family names are case-sensitive when no family matches', async () => {
	await assert.rejects(
		findFaces({ family: 'playfair display' }, fakeGoogle().deps),
		/no family named "playfair display"\. Names are case-sensitive/
	)
})

test('installFaces writes one TrueType file per face', async () => {
	const google = fakeGoogle()
	const dir = await fontsDir()
	const faces = await findFaces({ family: 'Playfair Display', weights: [700] }, google.deps)

	const installed = await installFaces('Playfair Display', faces, dir, google.deps)

	const file = path.join(dir, 'PlayfairDisplay-700.ttf')
	assert.deepEqual(installed, [{ weight: 700, italic: false, path: file, status: 'installed' }])
	assert.deepEqual(await readFile(file), TTF)
	assert.equal((await stat(file)).mode & 0o777, 0o644)
})

test('installFaces keeps a file that is already there and does not download it', async () => {
	const google = fakeGoogle()
	const dir = await fontsDir()
	const file = path.join(dir, fileNameFor('Playfair Display', { weight: 400, italic: true }))
	await writeFile(file, 'existing')
	const faces = await findFaces({ family: 'Playfair Display', weights: [400], italic: true }, google.deps)

	const installed = await installFaces('Playfair Display', faces, dir, google.deps)

	assert.deepEqual(
		installed.map(face => face.status),
		['installed', 'already installed']
	)
	assert.equal(await readFile(file, 'utf8'), 'existing')
	assert.deepEqual(google.downloads, ['/s/f/0-400.ttf'])
})

test('installFaces refuses font links outside fonts.gstatic.com', async () => {
	const google = fakeGoogle({ fontHost: 'evil.example.com' })
	const faces = await findFaces({ family: 'Playfair Display', weights: [400] }, google.deps)
	await assert.rejects(
		installFaces('Playfair Display', faces, await fontsDir(), google.deps),
		/linked to evil\.example\.com instead of fonts\.gstatic\.com/
	)
})

test('installFaces refuses a download that is not a font', async () => {
	const google = fakeGoogle({ fontBody: Buffer.from('<html>not a font</html>') })
	const faces = await findFaces({ family: 'Playfair Display', weights: [400] }, google.deps)
	await assert.rejects(
		installFaces('Playfair Display', faces, await fontsDir(), google.deps),
		/not a TrueType or OpenType font/
	)
})

async function fontBridge(listed: object) {
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'font-bridge-'))
	const ops: { op: string; args: Record<string, unknown> }[] = []
	const run: Runner = async (_file, args) => {
		const request = requestFrom(args)
		ops.push({ op: request.op, args: request.args })
		const result = request.op === 'fonts' ? listed : { family: request.args.family, faces: [] }
		await writeFile(path.join(request.replyDir, 'reply.json'), JSON.stringify({ ok: true, result }))
	}
	return { bridge: new SketchBridge({ bridgeDir, run, isRunning: async () => true }), ops }
}

test('installGoogleFont installs the files and adds the family to the collection', async () => {
	const { bridge, ops } = await fontBridge({ families: [] })
	const dir = await fontsDir()

	const result = await installGoogleFont(
		bridge,
		{ family: 'Playfair Display', weights: [400] },
		{ fontsDir: dir, deps: fakeGoogle().deps, faceWait: { timeoutMs: 0, intervalMs: 0 } }
	)

	assert.equal(result.isError, undefined)
	assert.deepEqual(
		ops.map(call => call.op),
		['fonts', 'collectFonts', 'fonts']
	)
	assert.deepEqual(ops[1].args, {
		family: 'Playfair Display',
		files: [path.join(dir, 'PlayfairDisplay-400.ttf')],
	})
})

test('installGoogleFont refuses a family installed outside the Google Fonts collection', async () => {
	const { bridge, ops } = await fontBridge({ families: [{ family: 'Playfair Display', faces: [{ weight: 5 }] }] })
	const google = fakeGoogle()

	const result = await installGoogleFont(
		bridge,
		{ family: 'Playfair Display' },
		{ fontsDir: await fontsDir(), deps: google.deps, faceWait: { timeoutMs: 0, intervalMs: 0 } }
	)

	assert.equal(result.isError, true)
	assert.match(result.content[0].type === 'text' ? result.content[0].text : '', /already installed outside/)
	assert.deepEqual(google.cssCalls, [])
	assert.deepEqual(
		ops.map(call => call.op),
		['fonts']
	)
})

test('installGoogleFont waits until Sketch lists the new faces', async () => {
	let listings = 0
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'font-bridge-'))
	const run: Runner = async (_file, args) => {
		const request = requestFrom(args)
		const faces = listings++ >= 2 ? [{ weight: 5 }] : []
		const result =
			request.op === 'fonts'
				? { families: listings === 1 ? [] : [{ family: 'Playfair Display', googleFonts: true, faces }] }
				: { family: 'Playfair Display', faces: [] }
		await writeFile(path.join(request.replyDir, 'reply.json'), JSON.stringify({ ok: true, result }))
	}
	const bridge = new SketchBridge({ bridgeDir, run, isRunning: async () => true })

	const result = await installGoogleFont(
		bridge,
		{ family: 'Playfair Display', weights: [400] },
		{ fontsDir: await fontsDir(), deps: fakeGoogle().deps, faceWait: { timeoutMs: 1000, intervalMs: 1 } }
	)

	const text = result.content.map(block => (block.type === 'text' ? block.text : '')).join('\n')
	assert.doesNotMatch(text, /Warning/)
	assert.match(text, /"faces":\[\{"weight":5\}\]/)
})

test('installGoogleFont warns when Sketch has not listed every face yet', async () => {
	const { bridge } = await fontBridge({ families: [] })

	const result = await installGoogleFont(
		bridge,
		{ family: 'Playfair Display', weights: [400, 700] },
		{ fontsDir: await fontsDir(), deps: fakeGoogle().deps, faceWait: { timeoutMs: 0, intervalMs: 0 } }
	)

	const first = result.content[0]
	assert.match(first.type === 'text' ? first.text : '', /^Warning: Sketch lists 0 of the 2 faces so far/)
})

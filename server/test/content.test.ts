import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { replyResult } from '../src/content.ts'

test('replyResult inlines PNGs and only inlines SVGs when asked', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'content-test-'))
	const png = path.join(dir, 'a.png')
	const svg = path.join(dir, 'a.svg')
	await writeFile(png, Buffer.from([1, 2, 3]))
	await writeFile(svg, '<svg/>')
	const reply = {
		ok: true as const,
		result: { name: 'Card' },
		files: [
			{ layerId: 'A', format: 'png', path: png },
			{ layerId: 'A', format: 'svg', path: svg },
		],
	}

	const plain = await replyResult(reply)
	assert.equal(plain.content.length, 2)
	assert.deepEqual(plain.content[1], { type: 'image', data: 'AQID', mimeType: 'image/png' })

	const withSvg = await replyResult(reply, { inlineSvg: true })
	assert.equal(withSvg.content.length, 3)
	assert.deepEqual(withSvg.content[2], { type: 'text', text: 'SVG for A:\n<svg/>' })
})

test('replyResult puts plugin warnings before the result', async () => {
	const result = await replyResult({
		ok: true,
		result: { id: 'A' },
		files: [],
		warnings: ['Title: Avenir Next has no weight 7, so Sketch used 6.'],
	})
	assert.deepEqual(result.content, [
		{ type: 'text', text: 'Warning: Title: Avenir Next has no weight 7, so Sketch used 6.' },
		{ type: 'text', text: '{"result":{"id":"A"},"files":[]}' },
	])
})

test('replyResult marks plugin errors', async () => {
	const result = await replyResult({ ok: false, error: 'No layer has id X' })
	assert.equal(result.isError, true)
	assert.deepEqual(result.content, [{ type: 'text', text: 'No layer has id X' }])
})

test('replyResult inlines JSON exports and gives the path of large ones', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'content-test-'))
	const small = path.join(dir, 'a.json')
	const large = path.join(dir, 'b.json')
	await writeFile(small, '{"_class":"text"}')
	await writeFile(large, JSON.stringify({ name: 'x'.repeat(200 * 1024) }))

	const result = await replyResult({
		ok: true,
		result: {},
		files: [
			{ layerId: 'A', format: 'json', path: small },
			{ layerId: 'B', format: 'json', path: large },
		],
	})

	assert.deepEqual(result.content[1], { type: 'text', text: 'JSON for A:\n{"_class":"text"}' })
	assert.deepEqual(result.content[2], { type: 'text', text: `JSON for B is too large to show inline: ${large}` })
})

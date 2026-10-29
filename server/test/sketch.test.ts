import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { BridgeError, SketchBridge, isInside, parseReply, type Runner } from '../src/sketch.ts'
import { requestFrom } from './helpers.ts'

async function tempBridgeDir() {
	return mkdtemp(path.join(tmpdir(), 'bridge-test-'))
}

test('parseReply accepts success and error replies', () => {
	assert.deepEqual(parseReply('{"ok":true,"result":{"a":1}}'), { ok: true, result: { a: 1 }, files: [] })
	assert.deepEqual(parseReply('{"ok":false,"error":"nope"}'), { ok: false, error: 'nope' })
	assert.deepEqual(parseReply('{"ok":true,"result":{},"warnings":["Font swapped"]}'), {
		ok: true,
		result: {},
		files: [],
		warnings: ['Font swapped'],
	})
})

test('parseReply rejects bad JSON and bad shapes', () => {
	assert.throws(() => parseReply('{'), BridgeError)
	assert.throws(() => parseReply('{"ok":"yes"}'), BridgeError)
	assert.throws(() => parseReply('{"ok":false}'), BridgeError)
})

test('isInside only accepts paths below the parent', () => {
	assert.equal(isInside('/a/b/c.png', '/a/b'), true)
	assert.equal(isInside('/a/b', '/a/b'), false)
	assert.equal(isInside('/a/bc/c.png', '/a/b'), false)
	assert.equal(isInside('/a/b/../c.png', '/a/b'), false)
	assert.equal(isInside('/etc/passwd', '/a/b'), false)
})

test('call runs sketchtool with an argument array and reads the reply', async () => {
	const bridgeDir = await tempBridgeDir()
	let seen: { file: string; args: string[] } | undefined
	const run: Runner = async (file, args) => {
		seen = { file, args }
		const request = requestFrom(args)
		await writeFile(path.join(request.replyDir, 'inside.png'), 'png')
		await writeFile(
			path.join(request.replyDir, 'reply.json'),
			JSON.stringify({
				ok: true,
				result: { op: request.op, args: request.args },
				files: [
					{ layerId: 'A', format: 'png', path: path.join(request.replyDir, 'inside.png') },
					{ layerId: 'B', format: 'png', path: '/etc/passwd' },
				],
			})
		)
	}
	const bridge = new SketchBridge({
		bridgeDir,
		pluginPath: '/plugin.sketchplugin',
		sketchtool: '/bin/sketchtool',
		run,
		isRunning: async () => true,
	})
	const { reply, dir } = await bridge.call('layer', { id: 'X' })

	assert.equal(seen?.file, '/bin/sketchtool')
	assert.deepEqual(seen?.args.slice(0, 3), ['run', '/plugin.sketchplugin', 'bridge'])
	assert.equal(seen?.args.at(-1), '--without-activating')
	assert.equal(seen?.args.join(' ').includes('"X"'), false)
	assert.equal((await stat(path.join(dir, 'request.json'))).mode & 0o777, 0o600)
	assert.ok(isInside(dir, path.join(bridgeDir, 'requests')))
	assert.ok(reply.ok)
	assert.deepEqual(reply.result, { op: 'layer', args: { id: 'X' } })
	assert.deepEqual(
		reply.files.map(file => file.layerId),
		['A']
	)
})

test('call refuses when Sketch is not running', async () => {
	const bridge = new SketchBridge({
		bridgeDir: await tempBridgeDir(),
		run: async () => assert.fail('should not run'),
		isRunning: async () => false,
	})
	await assert.rejects(bridge.call('status'), /not running/)
})

test('call reports a missing reply', async () => {
	const bridge = new SketchBridge({
		bridgeDir: await tempBridgeDir(),
		run: async () => {},
		isRunning: async () => true,
	})
	await assert.rejects(bridge.call('status'), /did not write a reply/)
})

test('call passes runner failures through', async () => {
	const bridge = new SketchBridge({
		bridgeDir: await tempBridgeDir(),
		run: async () => {
			throw new BridgeError('sketchtool failed: timed out')
		},
		isRunning: async () => true,
	})
	await assert.rejects(bridge.call('status'), /timed out/)
})

test('pruneRequests removes request folders older than a day', async () => {
	const bridgeDir = await tempBridgeDir()
	const bridge = new SketchBridge({ bridgeDir })
	const oldDir = path.join(bridge.requestsDir, 'old')
	const newDir = path.join(bridge.requestsDir, 'new')
	await mkdir(oldDir, { recursive: true })
	await mkdir(newDir, { recursive: true })
	const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
	await utimes(oldDir, twoDaysAgo, twoDaysAgo)

	await bridge.pruneRequests()

	assert.deepEqual(await readdir(bridge.requestsDir), ['new'])
})

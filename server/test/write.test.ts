import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Backups } from '../src/backup.ts'
import { SketchBridge, type Runner } from '../src/sketch.ts'
import { callWrite } from '../src/write-tools.ts'

type Document = { id: string; name: string; path: string | null }

async function setup(documents: Document[]) {
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'write-test-'))
	const calls: { op: string; args: Record<string, unknown> }[] = []
	const run: Runner = async (_file, args) => {
		const context = args.find(arg => arg.startsWith('--context=')) ?? ''
		const request = JSON.parse(JSON.parse(context.slice('--context='.length)).request)
		calls.push({ op: request.op, args: request.args })
		const result =
			request.op === 'status' ? { selectedDocumentId: documents[0]?.id ?? null, documents } : { done: true }
		await writeFile(path.join(request.replyDir, 'reply.json'), JSON.stringify({ ok: true, result }))
	}
	const bridge = new SketchBridge({ bridgeDir, run, isRunning: async () => true })
	return { bridge, backups: new Backups(bridgeDir), calls, bridgeDir }
}

function firstText(result: Awaited<ReturnType<typeof callWrite>>) {
	const block = result.content[0]
	return block.type === 'text' ? block.text : ''
}

async function sketchFile(contents = 'zip') {
	const file = path.join(await mkdtemp(path.join(tmpdir(), 'doc-')), 'System.sketch')
	await writeFile(file, contents)
	return file
}

test('callWrite backs up the document once, then runs the op on that document', async () => {
	const documentPath = await sketchFile()
	const { bridge, backups, calls, bridgeDir } = await setup([{ id: 'D1', name: 'System', path: documentPath }])

	const first = await callWrite(bridge, backups, 'createArtboard', { width: 100, height: 100 })
	const second = await callWrite(bridge, backups, 'createArtboard', { width: 100, height: 100 })

	assert.equal(first.isError, undefined)
	assert.match(firstText(first), /^Backed up /)
	assert.doesNotMatch(firstText(second), /^Backed up /)
	const backupsMade = await readdir(path.join(bridgeDir, 'backups'))
	assert.equal(backupsMade.length, 1)
	assert.equal(await readFile(path.join(bridgeDir, 'backups', backupsMade[0]), 'utf8'), 'zip')
	assert.deepEqual(calls[1], { op: 'createArtboard', args: { width: 100, height: 100, documentId: 'D1' } })
})

test('callWrite refuses unsaved documents without running the op', async () => {
	const { bridge, backups, calls } = await setup([{ id: 'D1', name: 'Untitled', path: null }])

	const result = await callWrite(bridge, backups, 'deleteLayer', { id: 'X' })

	assert.equal(result.isError, true)
	assert.match(firstText(result), /Save "Untitled"/)
	assert.deepEqual(
		calls.map(call => call.op),
		['status']
	)
})

test('callWrite reports when the requested document is not open', async () => {
	const { bridge, backups } = await setup([{ id: 'D1', name: 'System', path: '/tmp/System.sketch' }])
	const result = await callWrite(bridge, backups, 'updateLayer', { documentId: 'D2', id: 'X' })
	assert.equal(result.isError, true)
	assert.match(firstText(result), /No matching document/)
})

test('Backups refuses paths that are not .sketch files', async () => {
	const backups = new Backups(await mkdtemp(path.join(tmpdir(), 'backup-test-')))
	await assert.rejects(backups.ensure('/etc/passwd'), /not a .sketch file/)
	await assert.rejects(backups.ensure('relative/System.sketch'), /not a .sketch file/)
})

test('callWrite renders in a second call when the plugin asks for it', async () => {
	const documentPath = await sketchFile()
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'write-test-'))
	const ops: string[] = []
	const run: Runner = async (_file, args) => {
		const context = args.find(arg => arg.startsWith('--context=')) ?? ''
		const request = JSON.parse(JSON.parse(context.slice('--context='.length)).request)
		ops.push(request.op)
		let reply: unknown = { ok: true, result: { id: 'L1' }, render: { ids: ['L1'], scale: 1 } }
		if (request.op === 'status') {
			reply = {
				ok: true,
				result: { selectedDocumentId: 'D1', documents: [{ id: 'D1', name: 'S', path: documentPath }] },
			}
		}
		if (request.op === 'export') {
			const png = path.join(request.replyDir, 'L1.png')
			await writeFile(png, 'png')
			reply = { ok: true, result: {}, files: [{ layerId: 'L1', format: 'png', path: png }] }
		}
		await writeFile(path.join(request.replyDir, 'reply.json'), JSON.stringify(reply))
	}
	const bridge = new SketchBridge({ bridgeDir, run, isRunning: async () => true })

	const result = await callWrite(bridge, new Backups(bridgeDir), 'updateLayer', { id: 'L1' })

	assert.deepEqual(ops, ['status', 'updateLayer', 'export'])
	assert.equal(result.content.at(-1)?.type, 'image')
})

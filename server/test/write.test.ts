import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Backups } from '../src/backup.ts'
import { SketchBridge, type Runner } from '../src/sketch.ts'
import { UNDO_STUCK_WARNING, callWrite } from '../src/write-tools.ts'
import { requestFrom } from './helpers.ts'

const QUICK_SAVE_WAIT = { timeoutMs: 200, intervalMs: 10 }

type Document = { id: string; name: string; path: string | null; undoStuck?: boolean }

async function setup(documents: Document[], onOp?: (op: string) => Promise<void>) {
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'write-test-'))
	const calls: { op: string; args: Record<string, unknown> }[] = []
	const run: Runner = async (_file, args) => {
		const request = requestFrom(args)
		calls.push({ op: request.op, args: request.args })
		await onOp?.(request.op)
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

test('callWrite warns when Sketch has stopped recording undo history', async () => {
	const documentPath = await sketchFile()
	const stuck = await setup([{ id: 'D1', name: 'System', path: documentPath, undoStuck: true }])
	const healthy = await setup([{ id: 'D1', name: 'System', path: documentPath }])

	const warned = await callWrite(stuck.bridge, stuck.backups, 'createPage', { name: 'P' })
	const quiet = await callWrite(healthy.bridge, healthy.backups, 'createPage', { name: 'P' })

	assert.equal(firstText(warned), UNDO_STUCK_WARNING)
	assert.ok(quiet.content.every(block => block.type !== 'text' || block.text !== UNDO_STUCK_WARNING))
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
	const result = await callWrite(bridge, backups, 'updateLayers', { documentId: 'D2', id: 'X' })
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
		const request = requestFrom(args)
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

	const result = await callWrite(bridge, new Backups(bridgeDir), 'updateLayers', { id: 'L1' })

	assert.deepEqual(ops, ['status', 'updateLayers', 'export'])
	assert.equal(result.content.at(-1)?.type, 'image')
})

test('callWrite backs up the file before saving and waits for Sketch to write it', async () => {
	const documentPath = await sketchFile('before save')
	const { bridge, backups, bridgeDir } = await setup([{ id: 'D1', name: 'System', path: documentPath }], async op => {
		if (op !== 'save') return
		setTimeout(() => {
			const later = new Date(Date.now() + 60_000)
			void utimes(documentPath, later, later)
		}, 30)
	})

	const result = await callWrite(bridge, backups, 'save', {}, { saveWait: QUICK_SAVE_WAIT })

	assert.equal(result.isError, undefined)
	const [backup] = await readdir(path.join(bridgeDir, 'backups'))
	assert.equal(await readFile(path.join(bridgeDir, 'backups', backup), 'utf8'), 'before save')
})

test('callWrite reports a save that Sketch never wrote', async () => {
	const documentPath = await sketchFile()
	const { bridge, backups } = await setup([{ id: 'D1', name: 'System', path: documentPath }])

	const result = await callWrite(bridge, backups, 'save', {}, { saveWait: QUICK_SAVE_WAIT })

	assert.equal(result.isError, true)
	assert.match(firstText(result), /did not write/)
})

test('Backups keeps the newest backups of each document', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'backup-test-'))
	const documentPath = path.join(root, 'System.sketch')
	await writeFile(documentPath, 'zip')
	const backups = new Backups(root)
	await mkdir(backups.dir, { recursive: true })
	const older = Array.from(
		{ length: 10 },
		(_, day) => `System-2026-01-${String(day + 1).padStart(2, '0')}T00-00-00-000Z.sketch`
	)
	const otherDocument = 'System-old-2026-01-01T00-00-00-000Z.sketch'
	for (const name of [...older, otherDocument]) await writeFile(path.join(backups.dir, name), 'zip')

	const made = await backups.ensure(documentPath, new Date('2026-02-01T00:00:00.000Z'))

	const left = await readdir(backups.dir)
	assert.equal(left.includes(older[0]), false)
	assert.ok(made && left.includes(path.basename(made)))
	assert.ok(left.includes(otherDocument))
	assert.equal(left.length, 11)
})

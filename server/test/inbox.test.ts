import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { listInbox, readInboxItem } from '../src/inbox.ts'

async function addItem(bridgeDir: string, name: string, files: { layerId: string; format: string; path: string }[]) {
	const dir = path.join(bridgeDir, 'inbox', name)
	await mkdir(dir, { recursive: true })
	await writeFile(
		path.join(dir, 'spec.json'),
		JSON.stringify({ page: 'Page 1', sentAt: name, layers: [{ name: 'Card' }], files })
	)
	return dir
}

test('listInbox returns newest items first', async () => {
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'inbox-test-'))
	await addItem(bridgeDir, '2026-10-01-card', [])
	await addItem(bridgeDir, '2026-10-02-card', [])

	const items = await listInbox(bridgeDir)

	assert.deepEqual(
		items.map(item => item.name),
		['2026-10-02-card', '2026-10-01-card']
	)
	assert.deepEqual(items[0].layers, ['Card'])
})

test('readInboxItem rejects names that leave the inbox', async () => {
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'inbox-test-'))
	await assert.rejects(readInboxItem(bridgeDir, '../requests'), /Not a valid inbox item name/)
})

test('readInboxItem drops files outside the item folder', async () => {
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'inbox-test-'))
	const dir = path.join(bridgeDir, 'inbox', 'item')
	await addItem(bridgeDir, 'item', [
		{ layerId: 'A', format: 'png', path: path.join(dir, 'A', 'a.png') },
		{ layerId: 'B', format: 'png', path: '/etc/passwd' },
	])

	const reply = await readInboxItem(bridgeDir, 'item')

	assert.ok(reply.ok)
	assert.deepEqual(
		reply.files.map(file => file.layerId),
		['A']
	)
})

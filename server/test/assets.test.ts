import assert from 'node:assert/strict'
import { access, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { ASSETS_DIR, listAssets } from '../src/assets.ts'

test('every asset in the manifest exists', async () => {
	const assets = await listAssets(ASSETS_DIR)
	assert.ok(assets.some(asset => asset.kind === 'texture'))
	assert.ok(assets.some(asset => asset.kind === 'svg'))
	for (const asset of assets) await access(asset.path)
})

test('listAssets filters by kind and drops paths outside the assets folder', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'assets-test-'))
	const entry = { width: 10, height: 10, description: 'd' }
	await writeFile(
		path.join(dir, 'manifest.json'),
		JSON.stringify([
			{ file: 'textures/grain.png', kind: 'texture', ...entry },
			{ file: 'leaves/leaf.svg', kind: 'svg', ...entry },
			{ file: '../outside.svg', kind: 'svg', ...entry },
		])
	)
	assert.deepEqual(
		(await listAssets(dir)).map(asset => asset.path),
		[path.join(dir, 'textures/grain.png'), path.join(dir, 'leaves/leaf.svg')]
	)
	assert.deepEqual(
		(await listAssets(dir, 'svg')).map(asset => asset.path),
		[path.join(dir, 'leaves/leaf.svg')]
	)
})

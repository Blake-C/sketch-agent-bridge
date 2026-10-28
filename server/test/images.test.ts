import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { errorDetail, fetchImages, slug, type ShellRunner } from '../src/images.ts'

const request = { query: 'sea; rm -rf ~', count: 2, width: 800, height: 600 }

test('fetchImages passes each value as its own shell argument and returns the saved files', async () => {
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'images-test-'))
	let seen: { args: string[]; cwd: string } | undefined
	const run: ShellRunner = async (args, cwd) => {
		seen = { args, cwd }
		await writeFile(path.join(cwd, 'sea-rm-rf-1.jpg'), 'a')
		await writeFile(path.join(cwd, 'sea-rm-rf-2.jpg'), 'b')
		await writeFile(path.join(cwd, 'notes.txt'), 'c')
	}

	const files = await fetchImages(bridgeDir, '/scripts/get-images.sh', request, run)

	assert.deepEqual(seen?.args, ['/scripts/get-images.sh', '2', 'sea; rm -rf ~', '800x600', 'jpg', 'sea-rm-rf'])
	assert.ok(seen?.cwd.startsWith(path.join(bridgeDir, 'images')))
	assert.deepEqual(
		files.map(file => path.basename(file)),
		['sea-rm-rf-1.jpg', 'sea-rm-rf-2.jpg']
	)
})

test('fetchImages explains how to set up the script path', async () => {
	await assert.rejects(
		fetchImages('/tmp', undefined, request, async () => {}),
		/SKETCH_AGENT_BRIDGE_GET_IMAGES/
	)
})

test('fetchImages reports when nothing was saved', async () => {
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'images-test-'))
	await assert.rejects(
		fetchImages(bridgeDir, '/scripts/get-images.sh', request, async () => {}),
		/saved no images/
	)
})

test('slug keeps file names to letters, numbers, and dashes', () => {
	assert.equal(slug('Team Photo / Office!'), 'team-photo-office')
	assert.equal(slug('***'), 'image')
})

test('errorDetail keeps only the first stderr line, up to 300 characters', () => {
	assert.equal(errorDetail('Error: no URLs\n[{"id":"x"}]', 'exit 1'), 'Error: no URLs')
	assert.equal(errorDetail('', 'exit 1'), 'exit 1')
	assert.equal(errorDetail('x'.repeat(500), '').length, 300)
})

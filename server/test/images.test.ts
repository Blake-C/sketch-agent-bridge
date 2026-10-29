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
		return ''
	}

	const { files, warnings } = await fetchImages(bridgeDir, '/scripts/get-images.sh', request, run)

	assert.deepEqual(seen?.args, [
		'/scripts/get-images.sh',
		'2',
		'sea; rm -rf ~',
		'800x600',
		'jpg',
		'sea-rm-rf',
		'',
		'',
	])
	assert.deepEqual(warnings, [])
	assert.ok(seen?.cwd.startsWith(path.join(bridgeDir, 'images')))
	assert.deepEqual(
		files.map(file => path.basename(file)),
		['sea-rm-rf-1.jpg', 'sea-rm-rf-2.jpg']
	)
})

test('fetchImages explains how to set up the script path', async () => {
	await assert.rejects(
		fetchImages('/tmp', undefined, request, async () => ''),
		/SKETCH_AGENT_BRIDGE_GET_IMAGES/
	)
})

test('fetchImages reports when nothing was saved', async () => {
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'images-test-'))
	await assert.rejects(
		fetchImages(bridgeDir, '/scripts/get-images.sh', request, async () => ''),
		/saved no images/
	)
})

test('fetchImages passes orientation and color, and returns get_images warnings', async () => {
	const bridgeDir = await mkdtemp(path.join(tmpdir(), 'images-test-'))
	let args: string[] = []
	const run: ShellRunner = async (given, cwd) => {
		args = given
		await writeFile(path.join(cwd, 'sea-1.jpg'), 'a')
		return 'Downloading 1 image\nWarning: no orange photos matched "sea", searching without --color.\n'
	}

	const { warnings } = await fetchImages(
		bridgeDir,
		'/scripts/get-images.sh',
		{ ...request, orientation: 'portrait', color: 'orange' },
		run
	)

	assert.deepEqual(args.slice(-2), ['portrait', 'orange'])
	assert.deepEqual(warnings, ['Warning: no orange photos matched "sea", searching without --color.'])
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

test('errorDetail skips the warnings get_images prints before the failure', () => {
	const stderr = [
		'Warning: no black_and_white photos matched "zzqx", searching without --color.',
		'Warning: no landscape photos matched "zzqx", searching without --orientation.',
		'No photos matched "zzqx".',
	].join('\n')
	assert.equal(errorDetail(stderr, 'exit 1'), 'No photos matched "zzqx".')
	assert.equal(errorDetail('Warning: no red photos matched "zzqx", searching without --color.\n', 'exit 1'), 'exit 1')
})

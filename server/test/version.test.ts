import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

function readJson(relative: string) {
	return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

test('the plugin manifest has the same version as package.json', () => {
	const manifest = readJson('../../plugin/sketch-agent-bridge.sketchplugin/Contents/Sketch/manifest.json')
	assert.equal(manifest.version, readJson('../../package.json').version)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// The plugin is CommonJS that Sketch runs, and the repo is an ES module package, so the file is evaluated with a module shim.
function loadPluginModule(relative: string) {
	const source = readFileSync(
		new URL('../../plugin/sketch-agent-bridge.sketchplugin/Contents/Sketch/' + relative, import.meta.url),
		'utf8'
	)
	const module = { exports: {} as Record<string, unknown> }
	new Function('module', 'exports', source)(module, module.exports)
	return module.exports
}

const { splitSubpaths } = loadPluginModule('path.js') as { splitSubpaths: (d: string) => string[] }

test('splitSubpaths keeps a single subpath as one entry', () => {
	assert.deepEqual(splitSubpaths('M 0 0 L 10 0'), ['M0 0 L10 0'])
})

test('splitSubpaths splits at each absolute moveto', () => {
	assert.deepEqual(splitSubpaths('M 243 485 L 674 485 M 243 515 L 674 515'), [
		'M243 485 L674 485',
		'M243 515 L674 515',
	])
})

test('splitSubpaths makes a relative moveto absolute from where the previous subpath ended', () => {
	assert.deepEqual(splitSubpaths('M10 10 l5 0 m0 10 l-5 0'), ['M10 10 l5 0', 'M15 20 l-5 0'])
})

test('splitSubpaths starts a relative moveto after closepath from the subpath start', () => {
	assert.deepEqual(splitSubpaths('M10 10 h20 v20 z m5 5 h10'), ['M10 10 h20 v20 z', 'M15 15 h10'])
})

test('splitSubpaths turns extra moveto pairs into linetos of the same kind', () => {
	assert.deepEqual(splitSubpaths('M0 0 5 5 m1 1 2 2'), ['M0 0 L5 5', 'M6 6 l2 2'])
})

test('splitSubpaths tracks the end of curves and arcs with compact flags', () => {
	assert.deepEqual(splitSubpaths('M0 0 c1 1 2 2 3 3 a1 1 0 011 1 m1 0 h1'), [
		'M0 0 c1 1 2 2 3 3 a1 1 0 0 1 1 1',
		'M5 4 h1',
	])
})

test('splitSubpaths reads numbers without separators', () => {
	assert.deepEqual(splitSubpaths('M1.5-2L.5.5M3,4l-1-1'), ['M1.5 -2 L0.5 0.5', 'M3 4 l-1 -1'])
})

test('splitSubpaths refuses data that does not start with a moveto', () => {
	assert.throws(() => splitSubpaths('L 1 1'), /must start with a moveto/)
})

test('splitSubpaths refuses unknown commands', () => {
	assert.throws(() => splitSubpaths('M0 0 X 1 1'), /Unknown path command "X"/)
})

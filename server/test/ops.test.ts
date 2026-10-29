import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'

const ROOT = new URL('../../', import.meta.url)
const SERVER_SRC = new URL('server/src/', ROOT)
const PLUGIN_OPS = new URL('plugin/sketch-agent-bridge.sketchplugin/Contents/Sketch/ops/', ROOT)

function readAll(dir: URL, extension: string): string[] {
	return readdirSync(dir)
		.filter(name => name.endsWith(extension))
		.map(name => readFileSync(new URL(name, dir), 'utf8'))
}

function matches(sources: string[], pattern: RegExp): Set<string> {
	return new Set(sources.flatMap(source => [...source.matchAll(pattern)].map(match => match[1])))
}

function pluginOps(): Set<string> {
	const names = new Set<string>()
	for (const source of readAll(PLUGIN_OPS, '.js')) {
		const body = source.match(/module\.exports = \{([^}]*)\}/)
		assert.ok(body, 'Each ops file ends with a module.exports object')
		for (const entry of body[1].split(',')) {
			const key = entry.split(':')[0].trim()
			if (key) names.add(key)
		}
	}
	return names
}

const serverSources = readAll(SERVER_SRC, '.ts')
const protocol = readFileSync(new URL('docs/protocol.md', ROOT), 'utf8')

test('every op the server sends is handled by the plugin', () => {
	const sent = matches(serverSources, /(?:callOp|\.call|write|callWrite)\(\s*(?:bridge,\s*)?(?:backups,\s*)?'(\w+)'/g)
	assert.ok(sent.size > 0)
	const handled = pluginOps()
	assert.deepEqual(
		[...sent].filter(op => !handled.has(op)),
		[]
	)
})

test('every plugin op is in the ops table in docs/protocol.md', () => {
	const documented = matches([protocol], /^\| `(\w+)` /gm)
	assert.deepEqual(
		[...pluginOps()].filter(op => !documented.has(op)),
		[]
	)
})

test('every MCP tool is named in docs/protocol.md', () => {
	const tools = matches(serverSources, /registerTool\(\s*'(\w+)'/g)
	assert.ok(tools.size > 0)
	assert.deepEqual(
		[...tools].filter(tool => !protocol.includes('`' + tool + '`')),
		[]
	)
})

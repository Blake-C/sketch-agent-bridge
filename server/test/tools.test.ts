import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Backups } from '../src/backup.ts'
import { registerFontTools } from '../src/font-tools.ts'
import { registerImageTools } from '../src/image-tools.ts'
import { registerReadTools } from '../src/read-tools.ts'
import { SketchBridge } from '../src/sketch.ts'
import { registerWriteTools } from '../src/write-tools.ts'

// Every session loads these definitions, so growth here costs tokens in every session. Raise the limit only on purpose.
const MAX_TOOLS_LIST_CHARS = 80_000

test('tools/list stays under its size limit', async () => {
	const server = new McpServer({ name: 'test', version: '0' })
	const bridge = new SketchBridge()
	registerReadTools(server, bridge)
	registerWriteTools(server, bridge, new Backups(bridge.bridgeDir))
	registerImageTools(server, bridge)
	registerFontTools(server, bridge)
	const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
	await server.connect(serverSide)
	const client = new Client({ name: 'test', version: '0' })
	await client.connect(clientSide)
	const { tools } = await client.listTools()
	await client.close()
	const size = JSON.stringify(tools).length
	assert.ok(size <= MAX_TOOLS_LIST_CHARS, `tools/list is ${size} characters`)
})

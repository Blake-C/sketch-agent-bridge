import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Backups } from './backup.ts'
import { registerReadTools } from './read-tools.ts'
import { SketchBridge } from './sketch.ts'
import { registerWriteTools } from './write-tools.ts'

const server = new McpServer({ name: 'sketch-agent-bridge', version: '0.1.0' })
const bridge = new SketchBridge()

registerReadTools(server, bridge)
registerWriteTools(server, bridge, new Backups(bridge.bridgeDir))

await server.connect(new StdioServerTransport())

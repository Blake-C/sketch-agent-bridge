import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerReadTools } from './read-tools.ts'
import { SketchBridge } from './sketch.ts'

const server = new McpServer({ name: 'sketch-agent-bridge', version: '0.1.0' })
const bridge = new SketchBridge()

registerReadTools(server, bridge)

await server.connect(new StdioServerTransport())

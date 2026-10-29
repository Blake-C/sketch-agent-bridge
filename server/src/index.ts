import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import packageJson from '../../package.json' with { type: 'json' }
import { Backups } from './backup.ts'
import { registerImageTools } from './image-tools.ts'
import { registerReadTools } from './read-tools.ts'
import { SketchBridge } from './sketch.ts'
import { registerWriteTools } from './write-tools.ts'

const server = new McpServer({ name: 'sketch-agent-bridge', version: packageJson.version })
const bridge = new SketchBridge()

registerReadTools(server, bridge)
registerWriteTools(server, bridge, new Backups(bridge.bridgeDir))
registerImageTools(server, bridge)

await server.connect(new StdioServerTransport())

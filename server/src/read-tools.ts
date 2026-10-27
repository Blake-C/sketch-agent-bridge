import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { errorResult, replyResult } from './content.ts'
import { listInbox, readInboxItem } from './inbox.ts'
import type { SketchBridge } from './sketch.ts'

const documentId = z.string().optional().describe('Document id from sketch_status. Defaults to the front document.')
const depth = z.number().int().min(0).max(20).optional().describe('How many levels of children to include. Default 8.')
const includeHidden = z.boolean().optional().describe('Include hidden layers. Default false.')
const scale = z.number().min(0.25).max(4).optional().describe('PNG scale. Default 2.')
const readOnly = { readOnlyHint: true, openWorldHint: false }

export async function callOp(
	bridge: SketchBridge,
	op: string,
	args: Record<string, unknown>,
	options: { inlineSvg?: boolean } = {}
) {
	try {
		const { reply } = await bridge.call(op, args)
		return await replyResult(reply, options)
	} catch (error) {
		return errorResult(error)
	}
}

export function registerReadTools(server: McpServer, bridge: SketchBridge) {
	server.registerTool(
		'sketch_status',
		{
			title: 'Sketch status',
			description:
				'Shows whether Sketch is running, the open documents, the current page, and the selection count.',
			annotations: readOnly,
		},
		async () => {
			if (!(await bridge.isRunning())) {
				return { content: [{ type: 'text', text: JSON.stringify({ running: false }) }] }
			}
			return callOp(bridge, 'status', {})
		}
	)

	server.registerTool(
		'get_selection',
		{
			title: 'Get selection',
			description:
				'Returns a JSON spec of the selected layers (frames, text, fills, borders, shadows, shared styles, symbols) and a PNG of each.',
			inputSchema: {
				documentId,
				depth,
				includeHidden,
				scale,
				svg: z.boolean().optional().describe('Also export and return SVG markup.'),
				export: z.boolean().optional().describe('Set false to skip image export and return only the spec.'),
			},
			annotations: readOnly,
		},
		async args => callOp(bridge, 'selection', args, { inlineSvg: args.svg })
	)

	server.registerTool(
		'list_pages',
		{
			title: 'List pages',
			description: 'Lists the pages in a document.',
			inputSchema: { documentId },
			annotations: readOnly,
		},
		async args => callOp(bridge, 'pages', args)
	)

	server.registerTool(
		'list_artboards',
		{
			title: 'List artboards',
			description: 'Lists the artboards and symbol masters on a page.',
			inputSchema: {
				documentId,
				pageId: z.string().optional().describe('Page id from list_pages. Defaults to the current page.'),
			},
			annotations: readOnly,
		},
		async args => callOp(bridge, 'artboards', args)
	)

	server.registerTool(
		'get_layer',
		{
			title: 'Get layer',
			description: 'Returns the JSON spec of one layer and its children.',
			inputSchema: { documentId, id: z.string().describe('Layer id.'), depth, includeHidden },
			annotations: readOnly,
		},
		async args => callOp(bridge, 'layer', args)
	)

	server.registerTool(
		'export_layers',
		{
			title: 'Export layers',
			description:
				'Exports layers as PNG and/or SVG. PNGs are returned as images and SVGs as markup. Files stay on disk for 24 hours at the returned paths.',
			inputSchema: {
				documentId,
				ids: z.array(z.string()).min(1).max(50).describe('Layer ids.'),
				formats: z
					.array(z.enum(['png', 'svg']))
					.optional()
					.describe('Default png.'),
				scale,
			},
			annotations: readOnly,
		},
		async args => callOp(bridge, 'export', args, { inlineSvg: args.formats?.includes('svg') })
	)

	server.registerTool(
		'get_design_tokens',
		{
			title: 'Get design tokens',
			description:
				"Returns the document's swatches, document colors, shared text styles, shared layer styles, and symbol masters.",
			inputSchema: { documentId },
			annotations: readOnly,
		},
		async args => callOp(bridge, 'tokens', args)
	)

	server.registerTool(
		'list_inbox',
		{
			title: 'List inbox',
			description:
				'Lists selections sent from Sketch with Plugins > Agent Bridge > Send Selection to Agent, newest first.',
			inputSchema: { limit: z.number().int().min(1).max(100).optional() },
			annotations: readOnly,
		},
		async args => {
			try {
				const items = await listInbox(bridge.bridgeDir, args.limit)
				return { content: [{ type: 'text', text: JSON.stringify(items, null, '\t') }] }
			} catch (error) {
				return errorResult(error)
			}
		}
	)

	server.registerTool(
		'get_inbox_item',
		{
			title: 'Get inbox item',
			description: 'Returns the spec and images of one item from list_inbox.',
			inputSchema: {
				name: z.string().describe('Item name from list_inbox.'),
				svg: z.boolean().optional().describe('Also return SVG markup.'),
			},
			annotations: readOnly,
		},
		async args => {
			try {
				return await replyResult(await readInboxItem(bridge.bridgeDir, args.name), { inlineSvg: args.svg })
			} catch (error) {
				return errorResult(error)
			}
		}
	)
}

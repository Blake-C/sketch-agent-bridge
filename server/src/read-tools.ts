import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { errorResult, replyResult } from './content.ts'
import { findInput, hex } from './schemas.ts'
import { listInbox, readInboxItem } from './inbox.ts'
import type { SketchBridge } from './sketch.ts'

const documentId = z.string().optional().describe('Document id from sketch_status. Defaults to the front document.')
const depth = z.number().int().min(0).max(20).optional().describe('How many levels of children to include. Default 8.')
const includeHidden = z.boolean().optional().describe('Include hidden layers. Default false.')
const textLines = z
	.boolean()
	.optional()
	.describe(
		'Also return each line a text layer wraps into, and overflows: true when the text is taller than its frame. Slow on large trees, about 30 ms per text layer.'
	)
const scale = z.number().min(0.25).max(4).optional().describe('PNG scale. Default 1.')
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
				textLines,
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
			inputSchema: {
				documentId,
				id: z.string().describe('Layer id.'),
				depth,
				includeHidden,
				textLines,
				summary: z
					.boolean()
					.optional()
					.describe(
						'Return only the id, name, type, frame, and text of each layer, and childCount where depth stops. Use it to find ids without reading styles and paths.'
					),
			},
			annotations: readOnly,
		},
		async args => callOp(bridge, 'layer', args)
	)

	server.registerTool(
		'find_overlaps',
		{
			title: 'Find overlaps',
			description:
				'Lists each visible text layer in an artboard or group whose lines are crossed by another visible layer, such as a shape drawn over a heading. A layer that holds the whole text, such as a button or a card behind it, does not count, and neither does anything hidden behind such a layer. Shapes are tested against their outlines and other layers against their frames, after masks clip them. Shapes from one SVG drawing are reported once as their group, with the number of shapes that cross the text. Check this after placing text near artwork.',
			inputSchema: { documentId, id: z.string().describe('Artboard, symbol master, or group id.') },
			annotations: readOnly,
		},
		async args => callOp(bridge, 'overlaps', args)
	)

	server.registerTool(
		'find_layers',
		{
			title: 'Find layers',
			description:
				'Searches every page, or one page, for layers by type, name, text, symbol, shared style, or swatch, and returns each match with its page and artboard. Use it to locate layers without reading whole trees.',
			inputSchema: {
				documentId,
				...findInput,
			},
			annotations: readOnly,
		},
		async args => callOp(bridge, 'find', args)
	)

	server.registerTool(
		'list_symbols',
		{
			title: 'List symbols',
			description:
				'Lists every symbol master with its page, how many instances use it, its smart layout, and the library it came from.',
			inputSchema: {
				documentId,
				includeOverrides: z
					.boolean()
					.optional()
					.describe("Also list each master's overrides and whether each is editable."),
			},
			annotations: readOnly,
		},
		async args => callOp(bridge, 'symbols', args)
	)

	server.registerTool(
		'list_libraries',
		{
			title: 'List libraries',
			description:
				'Lists the enabled Sketch libraries, or every library with includeDisabled. With libraryId, also counts and lists the names of its symbols, layer styles, text styles, and swatches. Large libraries have thousands of names, so narrow the list with search and kind. Use those names anywhere a symbol, shared style, or swatch is asked for, and the item is imported from the library when it is used.',
			inputSchema: {
				documentId,
				libraryId: z.string().optional().describe('Library id or name.'),
				includeDisabled: z
					.boolean()
					.optional()
					.describe('Also list disabled libraries, with enabled for each.'),
				kind: z
					.enum(['symbol', 'layerStyle', 'textStyle', 'swatch'])
					.optional()
					.describe('List only this kind of item. Counts for every kind are always returned.'),
				search: z
					.string()
					.optional()
					.describe('Words that each listed name must contain, case-insensitive, such as "toggle light".'),
				limit: z.number().int().min(1).max(500).optional().describe('Most names per kind. Default 50.'),
			},
			annotations: readOnly,
		},
		async args => callOp(bridge, 'libraries', args)
	)

	server.registerTool(
		'update_library',
		{
			title: 'Update library',
			description:
				"Adds a .sketch file to Sketch's libraries, or turns a library on or off. This changes Sketch's library list for every document, and Cmd+Z does not undo it. There is no remove: turn a library off instead.",
			inputSchema: {
				path: z
					.string()
					.optional()
					.describe('Absolute path to a .sketch file to add as a library. Use this or libraryId.'),
				libraryId: z
					.string()
					.optional()
					.describe('Library id or name from list_libraries with includeDisabled.'),
				enabled: z.boolean().optional().describe('With libraryId, turns the library on or off.'),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		async args => callOp(bridge, 'updateLibrary', args)
	)

	server.registerTool(
		'reveal_layer',
		{
			title: 'Reveal layer',
			description:
				"Switches to the layer's page in Sketch, selects the layer, and scrolls the canvas to it. Changes only the selection and view.",
			inputSchema: { documentId, id: z.string().describe('Layer id.') },
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		async args => callOp(bridge, 'reveal', args)
	)

	server.registerTool(
		'select_layers',
		{
			title: 'Select layers',
			description:
				'Selects layers in Sketch, switching to their page. All layers must be on one page. An empty list clears the selection. Changes only the selection and view.',
			inputSchema: {
				documentId,
				ids: z.array(z.string()).max(500).describe('Layer ids. [] clears the selection.'),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		async args => callOp(bridge, 'select', args)
	)

	server.registerTool(
		'export_layers',
		{
			title: 'Export layers',
			description:
				"Exports layers as PNG, SVG, or JSON. PNGs are returned as images, and SVG and JSON as text. The JSON is the layer in Sketch's file format, which is longer and more detailed than the spec from get_layer. Files stay on disk for 24 hours at the returned paths.",
			inputSchema: {
				documentId,
				ids: z.array(z.string()).min(1).max(50).describe('Layer ids.'),
				formats: z
					.array(z.enum(['png', 'svg', 'json']))
					.optional()
					.describe('Default png.'),
				scale,
				trimmed: z
					.boolean()
					.optional()
					.describe(
						'Crops a PNG to its visible content. Default true. false keeps the transparent space of the full frame.'
					),
				background: hex
					.optional()
					.describe('Color painted behind the content of a PNG. SVG and JSON ignore it.'),
				region: z
					.object({
						x: z.number(),
						y: z.number(),
						width: z.number().positive(),
						height: z.number().positive(),
					})
					.optional()
					.describe(
						"Crops each PNG to this rectangle, measured from the layer's top-left corner, so one section of a tall artboard can be checked at full scale. It turns trimmed off."
					),
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
				return { content: [{ type: 'text', text: JSON.stringify(items) }] }
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

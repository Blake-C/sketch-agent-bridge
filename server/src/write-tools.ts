import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { Backups } from './backup.ts'
import { errorResult, replyResult } from './content.ts'
import {
	buildNode,
	documentId,
	fixedWidth,
	frame,
	hex,
	layerInput,
	layout,
	lineSpacing,
	order,
	overrides,
	prototypeAndExport,
	relativeTo,
	render,
	style,
	svgPath,
	textStyle,
} from './schemas.ts'
import { BridgeError, type SketchBridge } from './sketch.ts'

const statusSchema = z.object({
	selectedDocumentId: z.string().nullable(),
	documents: z.array(
		z.object({ id: z.string(), name: z.string(), path: z.string().nullable(), undoStuck: z.boolean().optional() })
	),
})

export const UNDO_STUCK_WARNING =
	'Warning: Sketch has stopped recording undo history for this document, so Cmd+Z cannot undo this edit. Restart Sketch to fix it.'

export async function callWrite(
	bridge: SketchBridge,
	backups: Backups,
	op: string,
	args: Record<string, unknown>
): Promise<CallToolResult> {
	try {
		const { reply: statusReply } = await bridge.call('status', {})
		if (!statusReply.ok) return errorResult(statusReply.error)
		const status = statusSchema.parse(statusReply.result)
		const targetId = (args.documentId as string | undefined) ?? status.selectedDocumentId ?? status.documents[0]?.id
		const document = status.documents.find(candidate => candidate.id === targetId)
		if (!document) throw new BridgeError('No matching document is open in Sketch')
		if (!document.path) {
			throw new BridgeError(`Save "${document.name}" before an agent edits it, so a backup can be made first.`)
		}
		const backup = await backups.ensure(document.path)
		const { reply } = await bridge.call(op, { ...args, documentId: document.id })
		if (reply.ok && reply.render) {
			const { reply: rendered } = await bridge.call('export', {
				...reply.render,
				formats: ['png'],
				documentId: document.id,
			})
			if (rendered.ok) reply.files = rendered.files
		}
		const result = await replyResult(reply)
		if (backup) result.content.unshift({ type: 'text', text: `Backed up ${document.path} to ${backup}` })
		if (document.undoStuck) result.content.unshift({ type: 'text', text: UNDO_STUCK_WARNING })
		return result
	} catch (error) {
		return errorResult(error)
	}
}

export function registerWriteTools(server: McpServer, bridge: SketchBridge, backups: Backups) {
	const write = (op: string) => (args: Record<string, unknown>) => callWrite(bridge, backups, op, args)
	const additive = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
	const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }

	server.registerTool(
		'build_layers',
		{
			title: 'Build layers',
			description:
				'Creates a whole tree of layers in one call: artboards, groups, shapes, paths, text, SVG, images, and symbol instances, with children nested inside groups and artboards. Prefer this over create_layer for anything with more than a few layers. Child frames are relative to the frame given for their parent. Groups shrink to fit their children, so the reply lists each group with its final frame, and later frames inside a group are relative to that final frame. A path with several subpaths becomes a Shape with one part per subpath. Renders once at the end. If any layer fails, nothing is kept.',
			inputSchema: {
				documentId,
				parentId: z
					.string()
					.optional()
					.describe('Artboard, group, or page id. Defaults to the "Agent Drafts" page.'),
				relativeTo: relativeTo.describe(
					'What the root nodes\' frames and paths are measured from. "artboard" uses the artboard or symbol master holding parentId, or the page when there is none. Children of a group node stay relative to that group\'s requested frame. Default parent.'
				),
				nodes: z.array(buildNode).min(1),
				...render,
			},
			annotations: additive,
		},
		write('build')
	)

	server.registerTool(
		'create_artboard',
		{
			title: 'Create artboard',
			description:
				'Creates an artboard. It goes on the "Agent Drafts" page unless pageId is given, placed right of existing content unless x is given.',
			inputSchema: {
				documentId,
				pageId: z.string().optional(),
				name: z.string().optional(),
				x: z.number().optional(),
				y: z.number().optional(),
				width: z.number().positive(),
				height: z.number().positive(),
				style,
				...render,
			},
			annotations: additive,
		},
		write('createArtboard')
	)

	server.registerTool(
		'create_layer',
		{
			title: 'Create layer',
			description:
				'Creates one layer inside an artboard, group, or page. Use build_layers for more than a few layers.',
			inputSchema: {
				documentId,
				parentId: z
					.string()
					.describe(
						"Id of an artboard, group, or page. Inside a group, frame is relative to the group's current frame, which moves when the group shrinks to fit, unless relativeTo is artboard."
					),
				...layerInput.shape,
				relativeTo,
				...render,
			},
			annotations: additive,
		},
		write('createLayer')
	)

	server.registerTool(
		'update_layer',
		{
			title: 'Update layer',
			description:
				'Changes an existing layer: parent, name, visibility, lock, frame, text, line spacing, corner radius, path, which symbol an instance uses, symbol overrides, style, text style, smart layout, rotation, flips, masks, stacking order, prototype links, and export presets.',
			inputSchema: {
				documentId,
				id: z.string(),
				parentId: z
					.string()
					.optional()
					.describe(
						'Move the layer into this artboard, group, or page. It keeps its place on the canvas, and frame is then relative to the new parent. Artboards move only between pages.'
					),
				name: z.string().optional(),
				hidden: z.boolean().optional(),
				locked: z.boolean().optional(),
				frame: frame.optional().describe('Only the given keys change.'),
				relativeTo,
				text: z.string().optional(),
				fixedWidth: fixedWidth.optional(),
				lineSpacing: lineSpacing.optional(),
				cornerRadius: z.number().min(0).optional(),
				path: svgPath
					.optional()
					.describe(
						'Replaces the points of a path layer, or the parts of a Shape. Coordinates are in the parent. A single path layer refuses data with several subpaths.'
					),
				symbol: z
					.string()
					.optional()
					.describe(
						'Swap a symbol instance to another master, by name or id. Library symbol names work too.'
					),
				overrides: overrides.optional(),
				style,
				textStyle,
				...layout,
				...prototypeAndExport,
				order: order.optional(),
				...render,
			},
			annotations: destructive,
		},
		write('updateLayer')
	)

	server.registerTool(
		'group_layers',
		{
			title: 'Group layers',
			description: 'Puts layers that share a parent into a new named group, keeping their positions.',
			inputSchema: {
				documentId,
				ids: z.array(z.string()).min(1),
				name: z.string(),
				...render,
			},
			annotations: additive,
		},
		write('groupLayers')
	)

	server.registerTool(
		'ungroup_layer',
		{
			title: 'Ungroup layer',
			description:
				"Moves a group's children into the group's parent, keeping their positions, and removes the group.",
			inputSchema: { documentId, id: z.string(), ...render },
			annotations: destructive,
		},
		write('ungroupLayer')
	)

	server.registerTool(
		'duplicate_layer',
		{
			title: 'Duplicate layers',
			description:
				'Copies layers, placing each copy above its original in the same parent, moved by offset. Duplicate an artboard with an offset so the copy does not cover it.',
			inputSchema: {
				documentId,
				ids: z.array(z.string()).min(1).max(50),
				offset: z
					.object({ x: z.number().optional(), y: z.number().optional() })
					.optional()
					.describe('How far to move each copy from its original. Default 0, 0.'),
				name: z.string().optional().describe('Name for the copies. Defaults to the original names.'),
				...render,
			},
			annotations: additive,
		},
		write('duplicate')
	)

	server.registerTool(
		'detach_symbol',
		{
			title: 'Detach symbol',
			description:
				'Replaces a symbol instance with a group of its layers, keeping its overrides. Instances an agent did not create need force: true.',
			inputSchema: {
				documentId,
				id: z.string(),
				recursively: z.boolean().optional().describe('Also detach symbol instances nested inside it.'),
				force: z.boolean().optional(),
				...render,
			},
			annotations: destructive,
		},
		write('detach')
	)

	server.registerTool(
		'create_symbol',
		{
			title: 'Create symbol',
			description:
				'Turns layers that share a parent into a symbol master on the Symbols page. By default the layers are replaced with an instance of the new symbol. Name variants with slashes, such as "Feature Row/Left" and "Feature Row/Right", so they can be swapped with update_layer. The reply lists the overrides the symbol exposes.',
			inputSchema: {
				documentId,
				ids: z.array(z.string()).min(1),
				name: z.string(),
				replace: z.boolean().optional().describe('Replace the layers with an instance. Default true.'),
				...render,
			},
			annotations: destructive,
		},
		write('createSymbol')
	)

	server.registerTool(
		'convert_symbol',
		{
			title: 'Convert symbol',
			description:
				'Turns an artboard into a symbol master in place, or a symbol master into an artboard. A master that becomes an artboard detaches its instances into groups, so a master with instances, or one an agent did not create, needs force: true. Library masters must be unlinked with sync_library_item first.',
			inputSchema: {
				documentId,
				id: z.string().describe('Artboard or symbol master id.'),
				to: z.enum(['symbol', 'artboard']),
				force: z.boolean().optional(),
				...render,
			},
			annotations: destructive,
		},
		write('convertSymbol')
	)

	server.registerTool(
		'sync_library_item',
		{
			title: 'Sync or unlink a library item',
			description:
				"Updates a symbol or shared style that came from a library to the library's current version, or unlinks it so it becomes a local item with a new id.",
			inputSchema: {
				documentId,
				kind: z.enum(['symbol', 'layerStyle', 'textStyle']),
				id: z.string().describe('Id, symbolId, or name of the symbol or shared style in this document.'),
				action: z.enum(['sync', 'unlink']),
			},
			annotations: destructive,
		},
		write('syncLibraryItem')
	)

	server.registerTool(
		'apply_shared_style',
		{
			title: 'Apply shared style',
			description: 'Links a layer to a shared layer style, or a text layer to a shared text style.',
			inputSchema: {
				documentId,
				id: z.string(),
				sharedStyle: z.string().describe('Shared style name or id.'),
				...render,
			},
			annotations: destructive,
		},
		write('applySharedStyle')
	)

	server.registerTool(
		'upsert_swatch',
		{
			title: 'Add or change a swatch',
			description:
				'Adds a swatch, or changes the color of the swatch with this name. Changing a swatch updates every layer that uses it.',
			inputSchema: { documentId, name: z.string(), color: hex },
			annotations: destructive,
		},
		write('upsertSwatch')
	)

	server.registerTool(
		'upsert_shared_style',
		{
			title: 'Add or change a shared style',
			description:
				'Adds a shared style, or replaces the style with this name. Replacing a style updates every layer linked to it. The style comes from fromLayerId, or from style and textStyle.',
			inputSchema: {
				documentId,
				kind: z.enum(['layer', 'text']),
				name: z.string(),
				fromLayerId: z.string().optional(),
				style,
				textStyle,
			},
			annotations: destructive,
		},
		write('upsertSharedStyle')
	)

	server.registerTool(
		'create_page',
		{
			title: 'Create page',
			description: 'Adds a page at the end of the document.',
			inputSchema: { documentId, name: z.string() },
			annotations: additive,
		},
		write('createPage')
	)

	server.registerTool(
		'update_page',
		{
			title: 'Update page',
			description: 'Renames a page. Use reveal_layer with a page id to switch to it.',
			inputSchema: { documentId, id: z.string(), name: z.string() },
			annotations: destructive,
		},
		write('updatePage')
	)

	server.registerTool(
		'delete_page',
		{
			title: 'Delete page',
			description:
				'Deletes a page and every layer on it. Pages an agent did not create, and the Symbols page, need force: true. The last page cannot be deleted.',
			inputSchema: { documentId, id: z.string(), force: z.boolean().optional() },
			annotations: destructive,
		},
		write('deletePage')
	)

	server.registerTool(
		'delete_layer',
		{
			title: 'Delete layers',
			description: 'Deletes layers an agent created. Layers made by hand need force: true.',
			inputSchema: {
				documentId,
				id: z.string().optional(),
				ids: z.array(z.string()).optional(),
				force: z.boolean().optional(),
			},
			annotations: destructive,
		},
		write('deleteLayer')
	)
}

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { Backups } from './backup.ts'
import { errorResult, replyResult } from './content.ts'
import { BridgeError, type SketchBridge } from './sketch.ts'

const statusSchema = z.object({
	selectedDocumentId: z.string().nullable(),
	documents: z.array(z.object({ id: z.string(), name: z.string(), path: z.string().nullable() })),
})

const hex = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Use #rrggbb or #rrggbbaa')
const color = z
	.union([hex, z.object({ swatch: z.string().describe('Swatch name or id.') })])
	.describe('A hex color, or { "swatch": "<name>" } to link a swatch from get_design_tokens.')
const style = z
	.object({
		fills: z.array(color).optional(),
		borders: z
			.array(
				z.object({
					color,
					thickness: z.number().min(0).optional(),
					position: z.enum(['Inside', 'Center', 'Outside']).optional(),
				})
			)
			.optional(),
		shadows: z
			.array(
				z.object({
					color,
					x: z.number().optional(),
					y: z.number().optional(),
					blur: z.number().min(0).optional(),
					spread: z.number().optional(),
				})
			)
			.optional(),
		opacity: z.number().min(0).max(1).optional(),
	})
	.optional()
	.describe('Replaces the listed style parts. Parts left out are unchanged.')
const textStyle = z
	.object({
		fontFamily: z.string().optional(),
		fontSize: z.number().positive().optional(),
		fontWeight: z
			.number()
			.int()
			.min(0)
			.max(12)
			.optional()
			.describe('Sketch weight scale, 5 is regular, 9 is bold.'),
		fontStyle: z.enum(['italic']).optional(),
		lineHeight: z.number().positive().optional(),
		kerning: z.number().optional(),
		paragraphSpacing: z.number().optional(),
		alignment: z.enum(['left', 'right', 'center', 'justified']).optional(),
		verticalAlignment: z.enum(['top', 'center', 'bottom']).optional(),
		textTransform: z.enum(['none', 'uppercase', 'lowercase']).optional(),
		textColor: color.optional(),
	})
	.optional()
const frame = z.object({
	x: z.number().optional(),
	y: z.number().optional(),
	width: z.number().positive().optional(),
	height: z.number().positive().optional(),
})
const documentId = z.string().optional().describe('Document id from sketch_status. Defaults to the front document.')

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
		const result = await replyResult(reply)
		if (backup) result.content.unshift({ type: 'text', text: `Backed up ${document.path} to ${backup}` })
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
		'create_artboard',
		{
			title: 'Create artboard',
			description:
				'Creates an artboard. It goes on the "Agent Drafts" page unless pageId is given, placed right of existing content unless x is given. Returns its spec and a PNG.',
			inputSchema: {
				documentId,
				pageId: z.string().optional(),
				name: z.string().optional(),
				x: z.number().optional(),
				y: z.number().optional(),
				width: z.number().positive(),
				height: z.number().positive(),
				style,
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
				'Creates a rectangle, oval, text, group, or symbol instance inside an artboard, group, or page. Returns its spec and a PNG of its artboard.',
			inputSchema: {
				documentId,
				parentId: z.string().describe('Id of an artboard, group, or page.'),
				kind: z.enum(['rectangle', 'oval', 'text', 'group', 'symbol']),
				name: z.string().optional(),
				frame: frame.optional().describe('Relative to the parent. Text with a width gets a fixed width.'),
				cornerRadius: z.number().min(0).optional(),
				text: z.string().optional(),
				symbol: z.string().optional().describe('Symbol master name, id, or symbolId, for kind "symbol".'),
				sharedStyle: z.string().optional().describe('Shared layer or text style name or id to link.'),
				style,
				textStyle,
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
				'Changes an existing layer: name, visibility, frame, text, corner radius, symbol overrides, style, and text style. Returns its spec and a PNG of its artboard.',
			inputSchema: {
				documentId,
				id: z.string(),
				name: z.string().optional(),
				hidden: z.boolean().optional(),
				frame: frame.optional().describe('Only the given keys change.'),
				text: z.string().optional(),
				cornerRadius: z.number().min(0).optional(),
				overrides: z
					.array(z.object({ id: z.string().describe('Override id from get_layer.'), value: z.string() }))
					.optional(),
				style,
				textStyle,
			},
			annotations: destructive,
		},
		write('updateLayer')
	)

	server.registerTool(
		'apply_shared_style',
		{
			title: 'Apply shared style',
			description: 'Links a layer to a shared layer style, or a text layer to a shared text style.',
			inputSchema: { documentId, id: z.string(), sharedStyle: z.string().describe('Shared style name or id.') },
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
		'delete_layer',
		{
			title: 'Delete layer',
			description: 'Deletes a layer an agent created. Layers made by hand need force: true.',
			inputSchema: { documentId, id: z.string(), force: z.boolean().optional() },
			annotations: destructive,
		},
		write('deleteLayer')
	)
}

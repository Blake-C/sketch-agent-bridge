import { readFile } from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { errorResult } from './content.ts'
import { COLORS, ORIENTATIONS, fetchImages } from './images.ts'
import type { SketchBridge } from './sketch.ts'

export function registerImageTools(server: McpServer, bridge: SketchBridge) {
	server.registerTool(
		'fetch_images',
		{
			title: 'Fetch images',
			description:
				'Downloads the most relevant Unsplash photos for a query, using the get_images shell function and the Unsplash key in the login keychain. Returns local file paths to use as image layers or image fills. When picking a hero or other prominent image, ask for count 3 or 4 with preview: true and choose one. Leave preview off otherwise, because each preview costs tokens.',
			inputSchema: {
				query: z.string().min(1).max(100),
				count: z.number().int().min(1).max(10).optional().describe('Default 1.'),
				width: z.number().int().min(100).max(4000).optional().describe('Default 1600.'),
				height: z.number().int().min(100).max(4000).optional().describe('Default 900.'),
				orientation: z
					.enum(ORIENTATIONS)
					.optional()
					.describe('Photo orientation to search for. Defaults to the shape of width and height.'),
				color: z
					.enum(COLORS)
					.optional()
					.describe(
						'Dominant color to search for. When no photo matches, the search runs again without it and the reply says so.'
					),
				preview: z
					.boolean()
					.optional()
					.describe('Also return the images so they can be looked at. Costs tokens.'),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		},
		async (args): Promise<CallToolResult> => {
			try {
				const { files, warnings } = await fetchImages(
					bridge.bridgeDir,
					process.env.SKETCH_AGENT_BRIDGE_GET_IMAGES,
					{
						query: args.query,
						count: args.count ?? 1,
						width: args.width ?? 1600,
						height: args.height ?? 900,
						orientation: args.orientation,
						color: args.color,
					}
				)
				const content: CallToolResult['content'] = [
					{
						type: 'text',
						text: JSON.stringify({ images: files, warnings: warnings.length ? warnings : undefined }),
					},
				]
				if (args.preview) {
					for (const file of files) {
						content.push({
							type: 'image',
							data: (await readFile(file)).toString('base64'),
							mimeType: 'image/jpeg',
						})
					}
				}
				return { content }
			} catch (error) {
				return errorResult(error)
			}
		}
	)
}

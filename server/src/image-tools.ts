import { readFile } from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { ASSETS_DIR, ASSET_KINDS, listAssets } from './assets.ts'
import { errorResult } from './content.ts'
import { COLORS, ORIENTATIONS, fetchImages } from './images.ts'
import type { SketchBridge } from './sketch.ts'

export function registerImageTools(server: McpServer, bridge: SketchBridge, assetsDir = ASSETS_DIR) {
	server.registerTool(
		'list_assets',
		{
			title: 'List assets',
			description:
				'Lists the textures and SVG drawings that come with the bridge, with absolute paths and how to use each one. Textures are tiling PNGs for an image fill in tile mode. SVG drawings go in an svg layer through svgFile.',
			inputSchema: {
				kind: z.enum(ASSET_KINDS).optional().describe('Only list this kind.'),
			},
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async (args): Promise<CallToolResult> => {
			try {
				return {
					content: [
						{ type: 'text', text: JSON.stringify({ assets: await listAssets(assetsDir, args.kind) }) },
					],
				}
			} catch (error) {
				return errorResult(error)
			}
		}
	)

	server.registerTool(
		'fetch_images',
		{
			title: 'Fetch images',
			description:
				'Downloads the most relevant Unsplash photos for a query as JPEGs cropped to width and height. Returns each local file path to use as an image layer or image fill, with a credit for the photographer. Unsplash requires that credit wherever the photo is shown, so put credit.text near the photo or in the design notes. When picking a hero or other prominent image, ask for count 3 or 4 with preview: true and choose one. Leave preview off otherwise, because each preview costs tokens.',
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
						'Dominant color to search for. When no photo matches, the search runs again without it and the reply says so. It favors heavily tinted photos, so for a natural scene such as a sunset, put the color words in the query instead.'
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
				const { images, warnings } = await fetchImages(bridge.bridgeDir, {
					query: args.query,
					count: args.count ?? 1,
					width: args.width ?? 1600,
					height: args.height ?? 900,
					orientation: args.orientation,
					color: args.color,
				})
				const content: CallToolResult['content'] = [
					{
						type: 'text',
						text: JSON.stringify({ images, warnings: warnings.length ? warnings : undefined }),
					},
				]
				if (args.preview) {
					for (const image of images) {
						content.push({
							type: 'image',
							data: (await readFile(image.path)).toString('base64'),
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

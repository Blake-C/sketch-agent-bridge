import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { setTimeout as sleep } from 'node:timers/promises'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { errorResult, replyResult } from './content.ts'
import {
	CSS_WEIGHTS,
	FAMILY_PATTERN,
	FONTS_DIR,
	type FontDeps,
	defaultFontDeps,
	findFaces,
	installFaces,
} from './fonts.ts'
import { BridgeError, type SketchBridge } from './sketch.ts'

const installedSchema = z.object({
	families: z.array(
		z.object({ family: z.string(), googleFonts: z.boolean().optional(), faces: z.array(z.unknown()) })
	),
})

export type InstallArgs = { family: string; weights?: number[]; italic?: boolean }
export type FaceWait = { timeoutMs: number; intervalMs: number }

const FACE_WAIT: FaceWait = { timeoutMs: 10_000, intervalMs: 1000 }

async function listedFaces(bridge: SketchBridge, family: string): Promise<unknown[]> {
	const { reply } = await bridge.call('fonts', { family })
	if (!reply.ok) throw new BridgeError(reply.error)
	return installedSchema.parse(reply.result).families.find(entry => entry.family === family)?.faces ?? []
}

// Sketch lists newly registered faces a few seconds after the plugin run that registered them has ended.
async function waitForFaces(bridge: SketchBridge, family: string, count: number, wait: FaceWait): Promise<unknown[]> {
	const deadline = Date.now() + wait.timeoutMs
	let faces = await listedFaces(bridge, family)
	while (faces.length < count && Date.now() < deadline) {
		await sleep(wait.intervalMs)
		faces = await listedFaces(bridge, family)
	}
	return faces
}

export async function installGoogleFont(
	bridge: SketchBridge,
	args: InstallArgs,
	options: { fontsDir?: string; deps?: FontDeps; faceWait?: FaceWait } = {}
): Promise<CallToolResult> {
	try {
		if (!(await bridge.isRunning()))
			throw new BridgeError('Sketch is not running. Open Sketch and a document first.')
		const { reply: listed } = await bridge.call('fonts', { family: args.family })
		if (!listed.ok) return errorResult(listed.error)
		const existing = installedSchema.parse(listed.result).families.find(entry => entry.family === args.family)
		// A family installed some other way would end up with two copies of each face, which Font Book flags as duplicates.
		if (existing && !existing.googleFonts) {
			throw new BridgeError(
				`${args.family} is already installed outside the Google Fonts collection, so it was not downloaded again. Its faces are ${JSON.stringify(existing.faces)}.`
			)
		}
		const faces = await findFaces(args, options.deps ?? defaultFontDeps)
		const files = await installFaces(
			args.family,
			faces,
			options.fontsDir ?? FONTS_DIR,
			options.deps ?? defaultFontDeps
		)
		const { reply } = await bridge.call('collectFonts', {
			family: args.family,
			files: files.map(file => file.path),
		})
		if (!reply.ok) return errorResult(reply.error)
		const shown = await waitForFaces(bridge, args.family, files.length, options.faceWait ?? FACE_WAIT)
		reply.result = { ...(reply.result as object), faces: shown, files }
		if (shown.length < files.length) {
			reply.warnings = [
				`Sketch lists ${shown.length} of the ${files.length} faces so far. Run list_fonts again in a few seconds before using the rest.`,
			]
		}
		return await replyResult(reply)
	} catch (error) {
		return errorResult(error)
	}
}

export function registerFontTools(server: McpServer, bridge: SketchBridge) {
	server.registerTool(
		'list_fonts',
		{
			title: 'List fonts',
			description:
				'Lists the font families installed on the Mac, and the families in the "Google Fonts" collection that install_google_font made. With family, returns each family whose name contains it, with every face\'s style, italic flag, and weight on the Sketch scale, where 5 is regular and 9 is bold. fontWeight in a text style goes up to 12, and Sketch uses the closest weight the family has, so 12 sets a 14 Black face when the family\'s next weight is 9 Bold. Check a family here before using it in text.',
			inputSchema: {
				family: z.string().min(1).optional().describe('Part of a family name, matched without case.'),
			},
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async args => {
			try {
				const { reply } = await bridge.call('fonts', args)
				return await replyResult(reply)
			} catch (error) {
				return errorResult(error)
			}
		}
	)

	server.registerTool(
		'install_google_font',
		{
			title: 'Install a Google Font',
			description:
				'Downloads a font family from Google Fonts into ~/Library/Fonts as static TrueType files, one per weight and style, and adds the family to the "Google Fonts" collection in Font Book. Sketch can use it right away. Only install a family the user asked for, after list_fonts shows it is missing. Files that are already there are kept as they are. A family installed some other way is refused, so it does not get two copies.',
			inputSchema: {
				family: z
					.string()
					.regex(FAMILY_PATTERN)
					.describe('Family name exactly as written on fonts.google.com, such as "Playfair Display".'),
				weights: z
					.array(
						z
							.number()
							.int()
							.min(CSS_WEIGHTS[0])
							.max(CSS_WEIGHTS[CSS_WEIGHTS.length - 1])
							.multipleOf(100)
					)
					.optional()
					.describe(
						'CSS weights to install, where 400 is regular and 700 is bold. Default every weight the family has.'
					),
				italic: z.boolean().optional().describe('Also install the italic of each weight. Default false.'),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		},
		args => installGoogleFont(bridge, args)
	)
}

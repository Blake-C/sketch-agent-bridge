import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

export const ASSETS_DIR = fileURLToPath(new URL('../../assets', import.meta.url))
export const ASSET_KINDS = ['texture', 'svg'] as const

const manifestSchema = z.array(
	z.object({
		file: z.string(),
		kind: z.enum(ASSET_KINDS),
		width: z.number(),
		height: z.number(),
		description: z.string(),
	})
)

export type Asset = {
	path: string
	kind: (typeof ASSET_KINDS)[number]
	width: number
	height: number
	description: string
}

export async function listAssets(dir: string, kind?: Asset['kind']): Promise<Asset[]> {
	const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')))
	return manifest
		.filter(entry => !kind || entry.kind === kind)
		.map(({ file, ...entry }) => ({ path: path.join(dir, file), ...entry }))
		.filter(entry => entry.path.startsWith(dir + path.sep))
}

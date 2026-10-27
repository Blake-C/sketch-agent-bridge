import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { BridgeError, isInside, type Reply } from './sketch.ts'

const ITEM_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const specSchema = z.looseObject({
	page: z.string().optional(),
	sentAt: z.string().optional(),
	layers: z.array(z.looseObject({ name: z.string().optional() })).default([]),
	files: z.array(z.object({ layerId: z.string(), format: z.string(), path: z.string() })).default([]),
})

export function inboxDir(bridgeDir: string): string {
	return path.join(bridgeDir, 'inbox')
}

async function readSpec(itemDir: string) {
	const text = await readFile(path.join(itemDir, 'spec.json'), 'utf8')
	return specSchema.parse(JSON.parse(text))
}

export async function listInbox(bridgeDir: string, limit = 20) {
	const names = await readdir(inboxDir(bridgeDir)).catch(() => [] as string[])
	const items = []
	for (const name of names
		.filter(entry => ITEM_NAME.test(entry))
		.sort()
		.reverse()) {
		if (items.length >= limit) break
		const spec = await readSpec(path.join(inboxDir(bridgeDir), name)).catch(() => null)
		if (!spec) continue
		items.push({ name, sentAt: spec.sentAt, page: spec.page, layers: spec.layers.map(layer => layer.name) })
	}
	return items
}

export async function readInboxItem(bridgeDir: string, name: string): Promise<Reply> {
	if (!ITEM_NAME.test(name)) throw new BridgeError(`Not a valid inbox item name: ${name}`)
	const itemDir = path.join(inboxDir(bridgeDir), name)
	const spec = await readSpec(itemDir).catch(() => {
		throw new BridgeError(`No inbox item named ${name}`)
	})
	return { ok: true, result: spec, files: spec.files.filter(file => isInside(file.path, itemDir)) }
}

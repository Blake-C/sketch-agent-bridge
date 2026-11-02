import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { errorResult } from './content.ts'
import { BridgeError, isInside, type SketchBridge } from './sketch.ts'
import { diffSnapshots, snapshotFromExport, type Snapshot } from './snapshots.ts'

const documentId = z.string().optional().describe('Document id from sketch_status. Defaults to the front document.')
const snapshotRef = z
	.string()
	.min(1)
	.describe('Snapshot name, or an absolute .json path in the bridge folder or an asset folder.')
const NAME = /^[a-z0-9][a-z0-9-]{0,79}$/

export function snapshotsDir(bridgeDir: string): string {
	return path.join(bridgeDir, 'snapshots')
}

function snapshotPath(bridge: SketchBridge, ref: string): string {
	if (NAME.test(ref)) return path.join(snapshotsDir(bridge.bridgeDir), ref + '.json')
	const file = path.resolve(ref)
	if (!path.isAbsolute(ref) || !file.endsWith('.json')) {
		throw new BridgeError(
			`${ref} is not a snapshot name (lowercase letters, digits, and dashes) or an absolute .json path`
		)
	}
	if (![bridge.bridgeDir, ...bridge.assetDirs].some(dir => isInside(file, dir))) {
		throw new BridgeError(
			`${file} is outside ~/.sketch-agent-bridge and the folders in SKETCH_AGENT_BRIDGE_ASSET_DIRS`
		)
	}
	return file
}

async function readSnapshot(bridge: SketchBridge, ref: string): Promise<Snapshot> {
	const file = snapshotPath(bridge, ref)
	const snapshot = JSON.parse(
		await readFile(file, 'utf8').catch(() => {
			throw new BridgeError(`No snapshot at ${file}`)
		})
	) as Snapshot
	if (!snapshot.layers) throw new BridgeError(`${file} is not a snapshot`)
	return snapshot
}

function report(lines: string[]): string {
	return lines.length > 0 ? lines.join('\n') : 'No changes.'
}

export function registerSnapshotTools(server: McpServer, bridge: SketchBridge) {
	server.registerTool(
		'snapshot_artboard',
		{
			title: 'Snapshot artboard',
			description:
				'Saves a snapshot of every layer of an artboard to ~/.sketch-agent-bridge/snapshots/<name>.json, replacing one with that name. Take one before a hand edit and one after, then diff them. compareTo also returns the diff.',
			inputSchema: {
				documentId,
				id: z.string().describe('Artboard id.'),
				name: z.string().regex(NAME).describe('Lowercase letters, digits, and dashes.'),
				compareTo: snapshotRef.optional(),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		},
		async ({ documentId, id, name, compareTo }) => {
			try {
				const earlier = compareTo === undefined ? null : await readSnapshot(bridge, compareTo)
				const { reply } = await bridge.call('export', { documentId, ids: [id], formats: ['json'] })
				if (!reply.ok) return errorResult(reply.error)
				const file = reply.files.find(f => f.format === 'json')
				if (!file) throw new BridgeError('Sketch exported no JSON for ' + id)
				const snapshot = snapshotFromExport(JSON.parse(await readFile(file.path, 'utf8')))
				if (snapshot.layers[id]?.class !== 'artboard') throw new BridgeError(`${id} is not an artboard`)
				const dir = snapshotsDir(bridge.bridgeDir)
				await mkdir(dir, { recursive: true, mode: 0o700 })
				const out = path.join(dir, name + '.json')
				await writeFile(out, JSON.stringify(snapshot), { mode: 0o600 })
				const summary = { path: out, artboard: snapshot.name, layers: Object.keys(snapshot.layers).length }
				const content = [{ type: 'text' as const, text: JSON.stringify(summary) }]
				if (earlier) content.push({ type: 'text', text: report(diffSnapshots(earlier, snapshot)) })
				return { content }
			} catch (error) {
				return errorResult(error)
			}
		}
	)

	server.registerTool(
		'diff_snapshots',
		{
			title: 'Diff snapshots',
			description:
				'Lists what changed between two artboard snapshots, matched by layer id: added, deleted, renamed, regrouped, moved, resized, reshaped, restyled, hidden, retexted, and restacked layers.',
			inputSchema: { from: snapshotRef, to: snapshotRef },
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ from, to }) => {
			try {
				const lines = diffSnapshots(await readSnapshot(bridge, from), await readSnapshot(bridge, to))
				return { content: [{ type: 'text', text: report(lines) }] }
			} catch (error) {
				return errorResult(error)
			}
		}
	)
}

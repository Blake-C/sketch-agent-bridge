import { createHash } from 'node:crypto'

// A snapshot keeps what a hand edit can change on each layer of an artboard, keyed by layer id, so two snapshots show
// what was edited between them. The format matches music-vizualizr's Tools/sketch-sync/sketch_sync.py, except for
// `version`: the shape hash is computed differently there, so shapes are only compared between snapshots of the same
// version.
export const SNAPSHOT_VERSION = 2

const NUMBER = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g
const MOVE_EPS = 0.5
const SIZE_EPS = 0.5
const OPACITY_EPS = 0.005

type Json = Record<string, unknown>

export type Paint = {
	opacity: number
	color?: string
	gradient?: { type: string; from: number[]; to: number[]; stops: [number, string][] }
	image?: true
	thickness?: number
}

export type LayerRecord = {
	name: string
	path: string[]
	class: string
	parent: string | null
	index: number
	frame: [number, number, number, number]
	rotation: number
	flip: [boolean, boolean]
	visible: boolean
	locked: boolean
	opacity: number
	fills: Paint[]
	borders: Paint[]
	mask: boolean
	shape?: string
	text?: string
}

export type Snapshot = { version?: number; artboard: string; name: string; layers: Record<string, LayerRecord> }

function round(value: number, places: number): number {
	const k = 10 ** places
	return Math.round(value * k) / k
}

function point(text: string): [number, number] {
	const [x, y] = (text.match(NUMBER) ?? []).slice(0, 2).map(Number)
	return [x ?? 0, y ?? 0]
}

function hexColor(color: Json): string {
	const [r, g, b, a] = (['red', 'green', 'blue', 'alpha'] as const).map(k => Math.round(Number(color[k] ?? 0) * 255))
	const hex = (v: number) => v.toString(16).toUpperCase().padStart(2, '0')
	return '#' + hex(r) + hex(g) + hex(b) + (a === 255 ? '' : hex(a))
}

function paint(p: Json): Paint | null {
	if (p.isEnabled === false) return null
	const settings = (p.contextSettings ?? {}) as Json
	const out: Paint = { opacity: round(Number(settings.opacity ?? 1), 3) }
	const kind = Number(p.fillType ?? 0)
	if (kind === 0) {
		out.color = hexColor(p.color as Json)
	} else if (kind === 1) {
		const gradient = p.gradient as Json
		out.gradient = {
			type: ['linear', 'radial', 'angular'][Number(gradient.gradientType ?? 0)] ?? 'linear',
			from: point(String(gradient.from)).map(v => round(v, 3)),
			to: point(String(gradient.to)).map(v => round(v, 3)),
			stops: ((gradient.stops ?? []) as Json[]).map(s => [
				round(Number(s.position), 3),
				hexColor(s.color as Json),
			]),
		}
	} else {
		out.image = true
	}
	if (p.thickness !== undefined) out.thickness = round(Number(p.thickness), 2)
	return out
}

function shapeSignature(layer: Json): string | undefined {
	const points = layer.points as Json[] | undefined
	if (!points || points.length === 0) return undefined
	const flat = points.flatMap(q =>
		(['point', 'curveFrom', 'curveTo'] as const).flatMap(k => point(String(q[k])).map(v => round(v, 4)))
	)
	return createHash('sha1').update(JSON.stringify(flat)).digest('hex').slice(0, 12)
}

function walk(
	layer: Json,
	ox: number,
	oy: number,
	path: string[],
	parent: string | null,
	index: number,
	out: Record<string, LayerRecord>
) {
	const frame = (layer.frame ?? {}) as Json
	const x = ox + Number(frame.x ?? 0)
	const y = oy + Number(frame.y ?? 0)
	const id = String(layer.do_objectID)
	const style = (layer.style ?? {}) as Json
	const paints = (key: string) => ((style[key] ?? []) as Json[]).map(paint).filter((p): p is Paint => p !== null)
	const record: LayerRecord = {
		name: String(layer.name ?? ''),
		path,
		class: String(layer._class),
		parent,
		index,
		frame: [round(x, 2), round(y, 2), round(Number(frame.width ?? 0), 2), round(Number(frame.height ?? 0), 2)],
		rotation: round(Number(layer.rotation ?? 0), 2),
		flip: [layer.isFlippedHorizontal === true, layer.isFlippedVertical === true],
		visible: layer.isVisible !== false,
		locked: layer.isLocked === true,
		opacity: round(Number(((style.contextSettings ?? {}) as Json).opacity ?? 1), 3),
		fills: paints('fills'),
		borders: paints('borders'),
		mask: layer.hasClippingMask === true,
	}
	const shape = shapeSignature(layer)
	if (shape) record.shape = shape
	const text = (layer.attributedString as Json | undefined)?.string
	if (typeof text === 'string') record.text = text
	out[id] = record
	// Children of an artboard are placed relative to the artboard, and children of a group relative to the group.
	const isArtboard = layer._class === 'artboard'
	const children = (layer.layers ?? []) as Json[]
	children.forEach((child, i) =>
		walk(child, isArtboard ? 0 : x, isArtboard ? 0 : y, [...path, String(child.name ?? '')], id, i, out)
	)
}

/** Reduces an artboard in Sketch's file format, as export_layers writes it, to a snapshot. */
export function snapshotFromExport(root: Json): Snapshot {
	const layers: Record<string, LayerRecord> = {}
	walk(root, 0, 0, [], null, 0, layers)
	return { version: SNAPSHOT_VERSION, artboard: String(root.do_objectID), name: String(root.name ?? ''), layers }
}

function label(record: LayerRecord): string {
	return record.path.join(' / ') || record.name
}

/** True when the layer moved by the same amount as its parent, so only the parent is reported. */
function movedWithParent(a: Snapshot['layers'], b: Snapshot['layers'], id: string): boolean {
	const parent = b[id].parent
	if (parent === null || parent !== a[id].parent || !a[parent] || !b[parent]) return false
	const dx = b[id].frame[0] - a[id].frame[0]
	const dy = b[id].frame[1] - a[id].frame[1]
	const pdx = b[parent].frame[0] - a[parent].frame[0]
	const pdy = b[parent].frame[1] - a[parent].frame[1]
	return Math.abs(dx - pdx) <= MOVE_EPS && Math.abs(dy - pdy) <= MOVE_EPS
}

const signed = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1)
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y)

/** Lists what changed from snapshot `from` to snapshot `to`, one line per change, matched by layer id. */
export function diffSnapshots(from: Snapshot, to: Snapshot): string[] {
	const a = from.layers
	const b = to.layers
	const lines: string[] = []
	const say = (record: LayerRecord, message: string) => lines.push(`${label(record)}: ${message}`)
	const compareShapes = (from.version ?? 1) === (to.version ?? 1)
	if (!compareShapes) {
		lines.push('Note: the snapshots have different versions, so point edits inside shapes are not compared.')
	}

	for (const id of Object.keys(b)) {
		if (a[id]) continue
		const [x, y, w, h] = b[id].frame
		say(b[id], `added (${b[id].class}) at ${x.toFixed(0)},${y.toFixed(0)} size ${w.toFixed(0)}x${h.toFixed(0)}`)
	}
	for (const id of Object.keys(a)) if (!b[id]) say(a[id], 'deleted')

	for (const id of Object.keys(a)) {
		const o = a[id]
		const n = b[id]
		if (!n) continue
		if (o.name !== n.name) lines.push(`${label(o)}: renamed to '${n.name}'`)
		if (o.parent !== n.parent) say(n, `moved from group ${o.path.slice(0, -1).join(' / ') || 'artboard'}`)
		const [ox, oy, ow, oh] = o.frame
		const [nx, ny, nw, nh] = n.frame
		const sized = Math.abs(ow - nw) > SIZE_EPS || Math.abs(oh - nh) > SIZE_EPS
		const moved = Math.abs(ox - nx) > MOVE_EPS || Math.abs(oy - ny) > MOVE_EPS
		if (sized) {
			const sx = ow ? nw / ow : 0
			const sy = oh ? nh / oh : 0
			say(
				n,
				`resized ${ow.toFixed(1)}x${oh.toFixed(1)} -> ${nw.toFixed(1)}x${nh.toFixed(1)} (scale ${sx.toFixed(3)}, ${sy.toFixed(3)}), origin ${ox.toFixed(1)},${oy.toFixed(1)} -> ${nx.toFixed(1)},${ny.toFixed(1)}`
			)
		} else if (moved && !movedWithParent(a, b, id)) {
			say(n, `moved by ${signed(nx - ox)},${signed(ny - oy)} (now at ${nx.toFixed(1)},${ny.toFixed(1)})`)
		}
		if (compareShapes && o.shape !== n.shape) say(n, 'reshaped (points edited)')
		if (o.rotation !== n.rotation) say(n, `rotation ${o.rotation} -> ${n.rotation}`)
		if (!same(o.flip, n.flip)) say(n, `flip ${JSON.stringify(o.flip)} -> ${JSON.stringify(n.flip)}`)
		if (o.visible !== n.visible) say(n, n.visible ? 'shown' : 'hidden')
		if (o.locked !== n.locked) say(n, n.locked ? 'locked' : 'unlocked')
		if (Math.abs(o.opacity - n.opacity) > OPACITY_EPS) say(n, `opacity ${o.opacity} -> ${n.opacity}`)
		for (const key of ['fills', 'borders'] as const) {
			if (!same(o[key], n[key])) say(n, `${key} ${JSON.stringify(o[key])} -> ${JSON.stringify(n[key])}`)
		}
		if ((o.mask ?? false) !== (n.mask ?? false)) say(n, `mask ${o.mask} -> ${n.mask}`)
		if (o.text !== n.text) say(n, `text ${JSON.stringify(o.text)} -> ${JSON.stringify(n.text)}`)
	}

	const byParent = new Map<string | null, string[]>()
	for (const [id, record] of Object.entries(b)) {
		if (a[id] && a[id].parent === record.parent)
			byParent.set(record.parent, [...(byParent.get(record.parent) ?? []), id])
	}
	for (const ids of byParent.values()) {
		const oldOrder = [...ids].sort((x, y) => a[x].index - a[y].index)
		const newOrder = [...ids].sort((x, y) => b[x].index - b[y].index)
		if (same(oldOrder, newOrder)) continue
		const moved = newOrder.filter((id, k) => oldOrder.indexOf(id) !== k).map(id => b[id].name)
		const where = b[ids[0]].path.slice(0, -1).join(' / ') || 'artboard'
		lines.push(`${where}: stacking order changed (${moved.slice(0, 8).join(', ')}${moved.length > 8 ? '...' : ''})`)
	}
	return lines
}

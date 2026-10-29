const { resolveDocument, findLayer } = require('../document.js')

const ROOT_TYPES = ['Artboard', 'SymbolMaster', 'Group']
const GROUP_TYPES = ['Group']
const PAINTED_SHAPES = ['ShapePath', 'Shape']
const SOLID_TYPES = ['Text', 'Image', 'SymbolInstance']
const MIN_AREA = 1
const SAMPLE_COLUMNS = 12
const SAMPLE_ROWS = 6
const USES_DEVICE_METRICS = 1 << 3
const MEASURE_LIMIT = 100000

function rectIn(root, layer) {
	const frame = layer.frame.changeBasis({ from: layer.parent, to: root })
	return { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
}

function intersect(a, b) {
	const x = Math.max(a.x, b.x)
	const y = Math.max(a.y, b.y)
	const right = Math.min(a.x + a.width, b.x + b.width)
	const bottom = Math.min(a.y + a.height, b.y + b.height)
	return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

// A null clip means nothing clips the layer.
function clipTo(rect, clip) {
	return clip ? intersect(rect, clip) : rect
}

function contains(outer, inner) {
	return (
		outer.x <= inner.x &&
		outer.y <= inner.y &&
		outer.x + outer.width >= inner.x + inner.width &&
		outer.y + outer.height >= inner.y + inner.height
	)
}

function isPainted(layer) {
	if (SOLID_TYPES.includes(layer.type)) return true
	if (!PAINTED_SHAPES.includes(layer.type) || !layer.style) return false
	const enabled = list => (list || []).some(item => item.enabled !== false)
	return enabled(layer.style.fills) || enabled(layer.style.borders)
}

// A mask clips the siblings above it until a sibling breaks the mask chain, so each leaf carries the clip it is drawn with.
function collect(root, container, clip, leaves) {
	let masked = false
	let maskRect = null
	container.layers.forEach(layer => {
		if (layer.hidden) return
		const native = layer.sketchObject
		if (masked && native.shouldBreakMaskChain()) masked = false
		if (native.hasClippingMask()) {
			masked = true
			maskRect = clipTo(rectIn(root, layer), clip)
			return
		}
		const layerClip = masked ? maskRect : clip
		if (masked && !layerClip) return
		if (GROUP_TYPES.includes(layer.type)) {
			collect(root, layer, layerClip, leaves)
			return
		}
		if (!isPainted(layer)) return
		const frame = rectIn(root, layer)
		const visible = clipTo(frame, layerClip)
		if (visible)
			leaves.push({ layer, rect: visible, offset: { x: frame.x - layer.frame.x, y: frame.y - layer.frame.y } })
	})
}

function outline(leaf) {
	if (!PAINTED_SHAPES.includes(leaf.layer.type)) return null
	if (leaf.path === undefined) {
		try {
			leaf.path = leaf.layer.sketchObject.pathInFrameWithTransforms()
		} catch {
			leaf.path = null
		}
	}
	return leaf.path
}

// A rotated or curved shape's frame is larger than the shape, so points across the shared area are tested against the shape's outline, which is in its parent's coordinates.
function touches(leaf, area) {
	const path = outline(leaf)
	if (!path) return true
	for (let column = 0; column <= SAMPLE_COLUMNS; column++) {
		for (let row = 0; row <= SAMPLE_ROWS; row++) {
			const x = area.x + (area.width * column) / SAMPLE_COLUMNS - leaf.offset.x
			const y = area.y + (area.height * row) / SAMPLE_ROWS - leaf.offset.y
			if (path.containsPoint(NSMakePoint(x, y))) return true
		}
	}
	return false
}

// A shape with a border and no fill is drawn as its outline, so text inside the outline does not touch it.
function isOutlineOnly(layer) {
	if (!PAINTED_SHAPES.includes(layer.type) || layer.closed === false) return false
	return !(layer.style.fills || []).some(fill => fill.enabled !== false)
}

// A line crosses the outline when part of it is inside the shape and part of it is not.
function outlineCrosses(leaf, line, shared) {
	const path = outline(leaf)
	if (!path) return true
	let inside = 0
	let total = 0
	for (let column = 0; column <= SAMPLE_COLUMNS; column++) {
		for (let row = 0; row <= SAMPLE_ROWS; row++) {
			const x = shared.x + (shared.width * column) / SAMPLE_COLUMNS - leaf.offset.x
			const y = shared.y + (shared.height * row) / SAMPLE_ROWS - leaf.offset.y
			total++
			if (path.containsPoint(NSMakePoint(x, y))) inside++
		}
	}
	return inside > 0 && (inside < total || !contains(leaf.rect, line))
}

// A line's box also holds the space above and below its letters, so two stacked lines can touch when their letters do not.
// Device metrics give the bounds of the ink, measured from the baseline, which baselineOffset gives up from the bottom of the line.
function letterBox(fragment, font) {
	const rect = fragment.rect
	const text = String(fragment.text).replace(/\s+$/, '')
	if (!font || !text) return rect
	const ink = NSString.stringWithString(text).boundingRectWithSize_options_attributes(
		NSMakeSize(MEASURE_LIMIT, MEASURE_LIMIT),
		USES_DEVICE_METRICS,
		{ [NSFontAttributeName]: font }
	)
	const above = ink.origin.y + ink.size.height
	const baseline = rect.y + rect.height - fragment.baselineOffset
	return { x: rect.x, y: baseline - above, width: rect.width, height: ink.size.height }
}

// A fixed-width text frame can be much wider than its words, so each wrapped line is checked on its own.
function lineRects(text) {
	const font = text.layer.sketchObject.font()
	const rects = text.layer.fragments
		.map(fragment => letterBox(fragment, font))
		.map(rect => ({
			x: rect.x + text.layer.frame.x + text.offset.x,
			y: rect.y + text.layer.frame.y + text.offset.y,
			width: rect.width,
			height: rect.height,
		}))
		.map(rect => intersect(rect, text.rect))
		.filter(Boolean)
	return rects.length ? rects : [text.rect]
}

function linesOf(leaf) {
	if (!leaf.lines) leaf.lines = lineRects(leaf)
	return leaf.lines
}

// Layers below a painted layer that covers the whole text are hidden behind it, such as art behind a card.
function coverIndex(leaves, textIndex) {
	for (let index = textIndex - 1; index >= 0; index--) {
		const leaf = leaves[index]
		if (leaf.layer.type !== 'Text' && contains(leaf.rect, leaves[textIndex].rect)) return index
	}
	return -1
}

function isAncestor(candidate, layer) {
	for (let parent = layer.parent; parent; parent = parent.parent) {
		if (parent.id === candidate.id) return true
		if (parent.type === 'Page') return false
	}
	return false
}

// A drawing imported from SVG is many small shapes, so hits inside a group that does not hold the text are reported once for that group.
function reportedLayer(leaf, text) {
	const parent = leaf.layer.parent
	if (GROUP_TYPES.includes(parent.type) && !isAncestor(parent, text)) return parent
	return leaf.layer
}

function overlaps(args) {
	const document = resolveDocument(args)
	const root = findLayer(document, args.id)
	if (!ROOT_TYPES.includes(root.type)) throw new Error('find_overlaps needs an artboard, symbol master, or group')
	const leaves = []
	collect(root, root, null, leaves)
	const texts = leaves.filter(leaf => leaf.layer.type === 'Text')
	const report = []
	texts.forEach(text => {
		const hits = new Map()
		const cover = coverIndex(leaves, leaves.indexOf(text))
		const lines = linesOf(text)
		leaves.forEach((other, index) => {
			if (other.layer.id === text.layer.id || index <= cover || contains(other.rect, text.rect)) return
			const crossed = lines.some(line => {
				if (other.layer.type === 'Text') {
					return linesOf(other).some(otherLine => {
						const shared = intersect(line, otherLine)
						return shared && shared.width * shared.height >= MIN_AREA
					})
				}
				const shared = intersect(line, other.rect)
				if (!shared || shared.width * shared.height < MIN_AREA) return false
				return isOutlineOnly(other.layer) ? outlineCrosses(other, line, shared) : touches(other, shared)
			})
			if (!crossed) return
			const shown = reportedLayer(other, text.layer)
			const entry = hits.get(shown.id) || { id: shown.id, name: shown.name, type: shown.type, layers: 0 }
			entry.layers += 1
			hits.set(shown.id, entry)
		})
		if (hits.size === 0) return
		report.push({
			text: { id: text.layer.id, name: text.layer.name },
			overlaps: Array.from(hits.values()).map(entry =>
				entry.layers > 1 ? entry : { id: entry.id, name: entry.name, type: entry.type }
			),
		})
	})
	return { result: { checked: { texts: texts.length, layers: leaves.length }, overlaps: report } }
}

module.exports = { overlaps }

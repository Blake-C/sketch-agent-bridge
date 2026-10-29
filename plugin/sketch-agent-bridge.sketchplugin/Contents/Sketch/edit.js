const sketch = require('sketch')
const Settings = require('sketch/settings')
const { resolveDocument, findLayer } = require('./document.js')
const { layerSpec, swatchNames, frameSpec } = require('./spec.js')
const { exportLayers } = require('./export.js')
const { applyStyle, loadImage, nativeColor, isColorValue } = require('./style.js')
const { findLocalOrImport } = require('./libraries.js')

const DRAFTS_PAGE = 'Agent Drafts'
const CREATED_KEY = 'createdByAgent'
const ARTBOARD_GAP = 100
const VERBOSE_DEPTH = 3
const CONTAINER_TYPES = ['Artboard', 'Group', 'SymbolMaster', 'Page']
const STYLE_OVERRIDES = ['textStyle', 'layerStyle']
const SMART_LAYOUT_TYPES = ['Group', 'SymbolMaster']
const SHAPE_KINDS = { rectangle: 'Rectangle', oval: 'Oval', triangle: 'Triangle', polygon: 'Polygon', star: 'Star' }
const LINE_SPACINGS = ['natural', 'system', 'variable', 'constantBaseline']
const ORDER_MOVES = { front: 'moveToFront', back: 'moveToBack', forward: 'moveForward', backward: 'moveBackward' }
const SVG_BOUNDS_NAME = 'sketch-agent-bridge-svg-bounds'

function editableDocument(args) {
	const document = resolveDocument(args)
	if (!document.path) throw new Error('Save the document before an agent edits it, so a backup can be made first.')
	return document
}

function draftsPage(document) {
	const existing = document.pages.find(page => page.name === DRAFTS_PAGE)
	return existing || new sketch.Page({ name: DRAFTS_PAGE, parent: document })
}

function symbolsPage(document) {
	const existing = sketch.Page.getSymbolsPage(document)
	if (existing) return existing
	const page = sketch.Page.createSymbolsPage()
	page.parent = document
	return page
}

function rightOfContent(container) {
	const edges = container.layers.map(layer => layer.frame.x + layer.frame.width)
	return edges.length ? Math.max.apply(null, edges) + ARTBOARD_GAP : 0
}

function assertContainer(layer) {
	if (!CONTAINER_TYPES.includes(layer.type))
		throw new Error('Layers can only be added to an artboard, group, or page')
}

function tagCreated(layer) {
	Settings.setLayerSettingForKey(layer, CREATED_KEY, true)
}

function wasCreatedByAgent(layer) {
	return Boolean(Settings.layerSettingForKey(layer, CREATED_KEY))
}

function setParent(document, layer, parentId) {
	const parent = findLayer(document, parentId)
	assertContainer(parent)
	if (layer.type === 'Artboard' && parent.type !== 'Page') throw new Error('Artboards can only be moved to a page')
	for (let node = parent; node && node.type !== 'Document'; node = node.parent) {
		if (node.id === layer.id) throw new Error('A layer cannot move into itself or one of its children')
	}
	const previous = layer.parent
	const frame = layer.frame.changeBasis({ from: previous, to: parent })
	layer.parent = parent
	layer.frame = frame
	;[previous, parent].forEach(group => {
		if (group.type === 'Group' && group.layers.length > 0) group.adjustToFit()
	})
}

function setFrame(layer, frame) {
	const next = layer.frame
	;['x', 'y', 'width', 'height'].forEach(key => {
		if (frame[key] !== undefined) next[key] = frame[key]
	})
	layer.frame = next
}

function setCornerRadius(layer, radius) {
	if (layer.type !== 'ShapePath') throw new Error('Corner radius only applies to rectangles and shapes')
	layer.points.forEach(point => {
		point.cornerRadius = radius
	})
}

function setSmartLayout(layer, name) {
	if (!SMART_LAYOUT_TYPES.includes(layer.type))
		throw new Error('Smart layout only applies to groups and symbol masters')
	if (name !== null && !sketch.SmartLayout[name]) throw new Error('Unknown smart layout: ' + name)
	layer.smartLayout = name === null ? null : sketch.SmartLayout[name]
}

function setFixedWidth(layer, fixed) {
	if (layer.type !== 'Text') throw new Error('Only text layers have a fixed width')
	layer.fixedWidth = fixed
}

function setLineSpacing(layer, lineSpacing) {
	if (layer.type !== 'Text') throw new Error('Only text layers have line spacing')
	if (!LINE_SPACINGS.includes(lineSpacing)) throw new Error('Unknown line spacing: ' + lineSpacing)
	layer.lineSpacing = lineSpacing
}

function setPath(layer, path) {
	if (layer.type !== 'ShapePath' || layer.shapeType !== 'Custom') {
		throw new Error('Only custom shape paths, such as path layers, can take a new path')
	}
	const next = sketch.ShapePath.fromSVGPath(path)
	layer.points = next.points
	layer.closed = next.closed
	layer.frame = next.frame
}

function setOrder(layer, order) {
	if (typeof order === 'number') layer.index = order
	else if (ORDER_MOVES[order]) layer[ORDER_MOVES[order]]()
	else throw new Error('Unknown order: ' + order)
}

function bounds(layers) {
	const left = Math.min.apply(
		null,
		layers.map(layer => layer.frame.x)
	)
	const top = Math.min.apply(
		null,
		layers.map(layer => layer.frame.y)
	)
	const right = Math.max.apply(
		null,
		layers.map(layer => layer.frame.x + layer.frame.width)
	)
	const bottom = Math.max.apply(
		null,
		layers.map(layer => layer.frame.y + layer.frame.height)
	)
	return new sketch.Rectangle(left, top, right - left, bottom - top)
}

function moveInto(layer, container, offsetX, offsetY) {
	const frame = layer.frame
	layer.parent = container
	layer.frame = new sketch.Rectangle(frame.x - offsetX, frame.y - offsetY, frame.width, frame.height)
}

// The group is sized to its children before they move in, so Sketch has no reason to refit it and shift them.
function fillGroup(group, layers) {
	if (layers.length === 0) return
	const box = bounds(layers)
	group.frame = box
	layers.forEach(layer => moveInto(layer, group, box.x, box.y))
	group.adjustToFit()
}

function applyLayout(layer, input) {
	if (input.smartLayout !== undefined) setSmartLayout(layer, input.smartLayout)
	if (input.rotation !== undefined) layer.transform.rotation = input.rotation
	if (input.flipHorizontal !== undefined) layer.transform.flippedHorizontally = input.flipHorizontal
	if (input.flipVertical !== undefined) layer.transform.flippedVertically = input.flipVertical
}

function setFlow(document, layer, flow) {
	if (flow === null) {
		layer.flow = null
		return
	}
	const back = flow.target === 'back'
	const target = back ? sketch.Flow.BackTarget : findLayer(document, flow.target)
	if (!back && target.type !== 'Artboard') throw new Error('A flow target must be an artboard or "back"')
	layer.flow = { target, animationType: flow.animation || 'slideFromRight' }
}

function exportFormatFromInput(format) {
	const out = { fileFormat: format.fileFormat, size: format.size || '1x' }
	if (format.prefix !== undefined) out.prefix = format.prefix
	if (format.suffix !== undefined) out.suffix = format.suffix
	return out
}

function applyPrototypeAndExport(document, layer, input) {
	if (input.flow !== undefined) setFlow(document, layer, input.flow)
	if (input.flowStartPoint !== undefined) {
		if (layer.type !== 'Artboard') throw new Error('Only artboards can be a flow start point')
		layer.flowStartPoint = input.flowStartPoint
	}
	if (input.exportFormats !== undefined) layer.exportFormats = input.exportFormats.map(exportFormatFromInput)
}

function linkSharedStyle(document, layer, key) {
	const isText = layer.type === 'Text'
	const list = isText ? document.sharedTextStyles : document.sharedLayerStyles
	const shared = isText
		? findLocalOrImport(document, list, key, 'textStyle', 'text style')
		: findLocalOrImport(document, list, key, 'layerStyle', 'layer style')
	// syncWithSharedStyle leaves a text layer's font unchanged when the text style comes from a library, so the style is copied first.
	if (isText) layer.style = shared.style
	layer.sharedStyle = shared
	layer.style.syncWithSharedStyle(shared)
}

function findSymbolMaster(document, key) {
	const masters = document.getSymbols()
	return (
		masters.find(master => master.symbolId === key) || findLocalOrImport(document, masters, key, 'symbol', 'symbol')
	)
}

function overrideValue(document, override, value) {
	if (override.property === 'symbolID') return findSymbolMaster(document, value).symbolId
	if (override.property === 'image') return loadImage(value)
	if (override.property === 'fillColor') return nativeColor(document, value)
	if (typeof value !== 'string') throw new Error('Only fillColor overrides take a swatch')
	return value
}

function isLocked(instance, override) {
	if (override.editable === false) return true
	const master = instance.master
	const masterOverride = master && master.overrides.find(item => item.id === override.id)
	return Boolean(masterOverride) && masterOverride.editable === false
}

// A layer can have several overrides, such as a nested symbol's locked symbolID and its fillColor, so a color value picks fillColor and other values prefer content overrides that are not locked.
function pickOverride(instance, candidates, value) {
	if (isColorValue(value)) {
		const color = candidates.find(item => item.property === 'fillColor')
		if (color) return color
	}
	const content = candidates.filter(item => !STYLE_OVERRIDES.includes(item.property) && item.property !== 'fillColor')
	return content.find(item => !isLocked(instance, item)) || content[0] || candidates[0]
}

function setOverrides(document, instance, changes) {
	if (instance.type !== 'SymbolInstance') throw new Error('Only symbol instances have overrides')
	changes.forEach(change => {
		const candidates = instance.overrides.filter(
			item =>
				(change.id && item.id === change.id) ||
				(!change.id &&
					item.affectedLayer &&
					item.affectedLayer.name === change.layer &&
					(!change.property || item.property === change.property))
		)
		const override = pickOverride(instance, candidates, change.value)
		if (!override) throw new Error('No override matches ' + (change.id || change.layer))
		if (isLocked(instance, override)) {
			const name = override.affectedLayer ? override.affectedLayer.name : override.id
			throw new Error('The symbol master does not allow the ' + override.property + ' override on ' + name)
		}
		instance.setOverrideValue(override, overrideValue(document, override, change.value))
	})
	if (instance.master && instance.master.smartLayout) instance.resizeWithSmartLayout()
}

function svgAttribute(tag, name) {
	const match = tag.match(new RegExp('\\s' + name + '\\s*=\\s*["\']([^"\']*)["\']'))
	return match ? match[1] : undefined
}

function svgViewBox(tag) {
	const viewBox = svgAttribute(tag, 'viewBox')
	const numbers = viewBox
		? viewBox
				.trim()
				.split(/[\s,]+/)
				.map(Number)
		: []
	if (numbers.length === 4 && numbers.every(isFinite) && numbers[2] > 0 && numbers[3] > 0) return numbers
	const width = parseFloat(svgAttribute(tag, 'width'))
	const height = parseFloat(svgAttribute(tag, 'height'))
	return width > 0 && height > 0 ? [0, 0, width, height] : null
}

function svgWithSize(svg, width, height) {
	return svg.replace(/<svg\b[^>]*>/, tag => {
		const box = svgViewBox(tag)
		let next = tag
		if (width !== undefined)
			next = next.replace(/\swidth\s*=\s*["'][^"']*["']/, '').replace('<svg', '<svg width="' + width + '"')
		if (height !== undefined)
			next = next.replace(/\sheight\s*=\s*["'][^"']*["']/, '').replace('<svg', '<svg height="' + height + '"')
		if (!box) return next
		return (
			next +
			'<rect id="' +
			SVG_BOUNDS_NAME +
			'" x="' +
			box[0] +
			'" y="' +
			box[1] +
			'" width="' +
			box[2] +
			'" height="' +
			box[3] +
			'" fill="none"/>'
		)
	})
}

function findByName(layer, name) {
	if (layer.name === name) return layer
	const children = layer.layers || []
	for (let i = 0; i < children.length; i++) {
		const match = findByName(children[i], name)
		if (match) return match
	}
	return null
}

// Sketch trims the empty space around imported SVG content, so a marker rect the size of the viewBox shows where the content sat in the frame.
function createSvgLayer(parent, svg, frame) {
	const layer = sketch.createLayerFromData(svgWithSize(svg, frame.width, frame.height), 'svg')
	layer.parent = parent
	setFrame(layer, { x: frame.x || 0, y: frame.y || 0 })
	const marker = findByName(layer, SVG_BOUNDS_NAME)
	if (!marker) return layer
	const origin = marker.frame.changeBasis({ from: marker.parent, to: layer })
	setFrame(layer, { x: (frame.x || 0) - origin.x, y: (frame.y || 0) - origin.y })
	marker.remove()
	if (layer.type === 'Group' && layer.layers.length > 0) layer.adjustToFit()
	return layer
}

function createNode(document, parent, node) {
	const frame = node.frame || {}
	const rectangle = new sketch.Rectangle(frame.x || 0, frame.y || 0, frame.width || 100, frame.height || 100)
	let layer

	if (node.kind === 'artboard') {
		if (parent.type !== 'Page') throw new Error('Artboards can only be added to a page')
		rectangle.x = frame.x === undefined ? rightOfContent(parent) : frame.x
		layer = new sketch.Artboard({ name: node.name || 'Artboard', parent, frame: rectangle })
	} else if (SHAPE_KINDS[node.kind]) {
		layer = new sketch.ShapePath({
			parent,
			frame: rectangle,
			shapeType: sketch.ShapePath.ShapeType[SHAPE_KINDS[node.kind]],
		})
		if (node.kind === 'rectangle' && node.cornerRadius) setCornerRadius(layer, node.cornerRadius)
	} else if (node.kind === 'path') {
		if (!node.path) throw new Error('A path layer needs SVG path data')
		layer = sketch.ShapePath.fromSVGPath(node.path)
		layer.parent = parent
		setFrame(layer, frame)
	} else if (node.kind === 'text') {
		layer = new sketch.Text({ parent, text: node.text || '', frame: rectangle })
		if (frame.width !== undefined) layer.fixedWidth = true
	} else if (node.kind === 'group') {
		layer = new sketch.Group({ parent, frame: rectangle })
	} else if (node.kind === 'image') {
		layer = new sketch.Image({ parent, image: loadImage(node.image), frame: rectangle })
	} else if (node.kind === 'svg') {
		if (!node.svg) throw new Error('An svg layer needs svg markup')
		layer = createSvgLayer(parent, node.svg, frame)
	} else if (node.kind === 'symbol') {
		const master = findSymbolMaster(document, node.symbol)
		layer = master.createNewInstance()
		layer.parent = parent
		layer.frame = new sketch.Rectangle(
			rectangle.x,
			rectangle.y,
			frame.width || master.frame.width,
			frame.height || master.frame.height
		)
	} else {
		throw new Error('Unknown layer kind: ' + node.kind)
	}

	try {
		if (node.name) layer.name = node.name
		if (node.sharedStyle) linkSharedStyle(document, layer, node.sharedStyle)
		applyStyle(document, layer, node.style, node.textStyle)
		applyLayout(layer, node)
		applyPrototypeAndExport(document, layer, node)
		if (node.fixedWidth !== undefined) setFixedWidth(layer, node.fixedWidth)
		if (node.lineSpacing !== undefined) setLineSpacing(layer, node.lineSpacing)
		if (node.overrides) setOverrides(document, layer, node.overrides)
		if (node.hidden) layer.hidden = true
	} catch (error) {
		layer.remove()
		throw error
	}
	tagCreated(layer)
	return layer
}

function summary(layer) {
	return { id: layer.id, name: layer.name, type: layer.type, frame: frameSpec(layer.frame) }
}

function renderTarget(layer, render) {
	if (render === 'none') return null
	if (render === 'layer' || layer.type === 'Artboard' || layer.type === 'SymbolMaster') return layer
	return layer.getParentArtboard() || layer
}

function renderFiles(layer, args, request) {
	const target = renderTarget(layer, args.render || 'layer')
	return target ? exportLayers([target], request.replyDir + '/exports', ['png'], args.scale || 1) : []
}

function result(document, layer, args, request) {
	return {
		result: args.verbose
			? layerSpec(layer, { document, swatches: swatchNames(document), depth: VERBOSE_DEPTH })
			: summary(layer),
		files: renderFiles(layer, args, request),
	}
}

// An export in the same plugin run still shows an instance's previous overrides and size, and leaves out symbols imported from a library in that run, so the server renders it in a second run.
function renderRequest(layer, args) {
	const target = renderTarget(layer, args.render || 'layer')
	return target ? { ids: [target.id], scale: args.scale || 1 } : undefined
}

function deferredResult(document, layer, args) {
	return {
		result: result(document, layer, Object.assign({}, args, { render: 'none' }), null).result,
		files: [],
		render: renderRequest(layer, args),
	}
}

module.exports = {
	editableDocument,
	draftsPage,
	symbolsPage,
	rightOfContent,
	assertContainer,
	tagCreated,
	wasCreatedByAgent,
	setParent,
	setFrame,
	setCornerRadius,
	setOrder,
	bounds,
	moveInto,
	fillGroup,
	setFixedWidth,
	setLineSpacing,
	setPath,
	applyLayout,
	applyPrototypeAndExport,
	linkSharedStyle,
	findSymbolMaster,
	setOverrides,
	createNode,
	summary,
	renderFiles,
	renderRequest,
	result,
	deferredResult,
}

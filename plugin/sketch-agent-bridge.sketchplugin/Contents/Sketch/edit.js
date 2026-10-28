const sketch = require('sketch')
const Settings = require('sketch/settings')
const { resolveDocument } = require('./document.js')
const { layerSpec, swatchNames, frameSpec } = require('./spec.js')
const { exportLayers } = require('./export.js')
const { applyStyle, findByIdOrName, loadImage } = require('./style.js')

const DRAFTS_PAGE = 'Agent Drafts'
const CREATED_KEY = 'createdByAgent'
const ARTBOARD_GAP = 100
const VERBOSE_DEPTH = 3
const CONTAINER_TYPES = ['Artboard', 'Group', 'SymbolMaster', 'Page']
const STYLE_OVERRIDES = ['textStyle', 'layerStyle']
const SMART_LAYOUT_TYPES = ['Group', 'SymbolMaster']
const ORDER_MOVES = { front: 'moveToFront', back: 'moveToBack', forward: 'moveForward', backward: 'moveBackward' }

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

function setOrder(layer, order) {
	if (typeof order === 'number') layer.index = order
	else if (ORDER_MOVES[order]) layer[ORDER_MOVES[order]]()
	else throw new Error('Unknown order: ' + order)
}

function applyLayout(layer, input) {
	if (input.smartLayout !== undefined) setSmartLayout(layer, input.smartLayout)
	if (input.rotation !== undefined) layer.transform.rotation = input.rotation
	if (input.flipHorizontal !== undefined) layer.transform.flippedHorizontally = input.flipHorizontal
	if (input.flipVertical !== undefined) layer.transform.flippedVertically = input.flipVertical
}

function linkSharedStyle(document, layer, key) {
	const list = layer.type === 'Text' ? document.sharedTextStyles : document.sharedLayerStyles
	const shared = findByIdOrName(list, key, layer.type === 'Text' ? 'text style' : 'layer style')
	layer.sharedStyle = shared
	layer.style.syncWithSharedStyle(shared)
}

function findSymbolMaster(document, key) {
	const masters = document.getSymbols()
	return masters.find(master => master.symbolId === key) || findByIdOrName(masters, key, 'symbol')
}

function overrideValue(document, override, value) {
	if (override.property === 'symbolID') return findSymbolMaster(document, value).symbolId
	if (override.property === 'image') return loadImage(value)
	return value
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
		const override = candidates.find(item => !STYLE_OVERRIDES.includes(item.property)) || candidates[0]
		if (!override) throw new Error('No override matches ' + (change.id || change.layer))
		instance.setOverrideValue(override, overrideValue(document, override, change.value))
	})
	if (instance.master && instance.master.smartLayout) instance.resizeWithSmartLayout()
}

function svgWithSize(svg, width, height) {
	return svg.replace(/<svg\b[^>]*>/, tag => {
		let next = tag
		if (width !== undefined)
			next = next.replace(/\swidth="[^"]*"/, '').replace('<svg', '<svg width="' + width + '"')
		if (height !== undefined)
			next = next.replace(/\sheight="[^"]*"/, '').replace('<svg', '<svg height="' + height + '"')
		return next
	})
}

function createNode(document, parent, node) {
	const frame = node.frame || {}
	const rectangle = new sketch.Rectangle(frame.x || 0, frame.y || 0, frame.width || 100, frame.height || 100)
	let layer

	if (node.kind === 'artboard') {
		if (parent.type !== 'Page') throw new Error('Artboards can only be added to a page')
		rectangle.x = frame.x === undefined ? rightOfContent(parent) : frame.x
		layer = new sketch.Artboard({ name: node.name || 'Artboard', parent, frame: rectangle })
	} else if (node.kind === 'rectangle' || node.kind === 'oval') {
		layer = new sketch.ShapePath({
			parent,
			frame: rectangle,
			shapeType: node.kind === 'oval' ? sketch.ShapePath.ShapeType.Oval : sketch.ShapePath.ShapeType.Rectangle,
		})
		if (node.kind === 'rectangle' && node.cornerRadius) setCornerRadius(layer, node.cornerRadius)
	} else if (node.kind === 'text') {
		layer = new sketch.Text({ parent, text: node.text || '', frame: rectangle })
		if (frame.width !== undefined) layer.fixedWidth = true
	} else if (node.kind === 'group') {
		layer = new sketch.Group({ parent, frame: rectangle })
	} else if (node.kind === 'image') {
		layer = new sketch.Image({ parent, image: loadImage(node.image), frame: rectangle })
	} else if (node.kind === 'svg') {
		if (!node.svg) throw new Error('An svg layer needs svg markup')
		layer = sketch.createLayerFromData(svgWithSize(node.svg, frame.width, frame.height), 'svg')
		layer.parent = parent
		setFrame(layer, { x: rectangle.x, y: rectangle.y })
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

// An export in the same plugin run still shows an instance's previous overrides, so the server renders it in a second run.
function deferredResult(document, layer, args) {
	const target = renderTarget(layer, args.render || 'layer')
	return {
		result: result(document, layer, Object.assign({}, args, { render: 'none' }), null).result,
		files: [],
		render: target ? { ids: [target.id], scale: args.scale || 1 } : undefined,
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
	setFrame,
	setCornerRadius,
	setOrder,
	applyLayout,
	linkSharedStyle,
	findSymbolMaster,
	setOverrides,
	createNode,
	summary,
	renderFiles,
	result,
	deferredResult,
}

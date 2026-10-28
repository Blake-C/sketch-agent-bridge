const sketch = require('sketch')
const Settings = require('sketch/settings')
const { resolveDocument, findLayer } = require('./document.js')
const { layerSpec, swatchNames, frameSpec } = require('./spec.js')
const { exportLayers } = require('./export.js')
const { applyStyle, loadImage } = require('./style.js')
const { findLocalOrImport } = require('./libraries.js')

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

function setFixedWidth(layer, fixed) {
	if (layer.type !== 'Text') throw new Error('Only text layers have a fixed width')
	layer.fixedWidth = fixed
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
	return value
}

function isLocked(instance, override) {
	if (override.editable === false) return true
	const master = instance.master
	const masterOverride = master && master.overrides.find(item => item.id === override.id)
	return Boolean(masterOverride) && masterOverride.editable === false
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
		if (isLocked(instance, override)) {
			const name = override.affectedLayer ? override.affectedLayer.name : override.id
			throw new Error('The symbol master does not allow the ' + override.property + ' override on ' + name)
		}
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
		applyPrototypeAndExport(document, layer, node)
		if (node.fixedWidth !== undefined) setFixedWidth(layer, node.fixedWidth)
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

// An export in the same plugin run still shows an instance's previous overrides and size, so the server renders it in a second run.
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
	setFrame,
	setCornerRadius,
	setOrder,
	setFixedWidth,
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

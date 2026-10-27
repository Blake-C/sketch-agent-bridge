const sketch = require('sketch')
const Settings = require('sketch/settings')
const { resolveDocument, findLayer, findPage } = require('../document.js')
const { layerSpec, swatchNames } = require('../spec.js')
const { exportLayers } = require('../export.js')

const DRAFTS_PAGE = 'Agent Drafts'
const CREATED_KEY = 'createdByAgent'
const ARTBOARD_GAP = 100
const CONTAINER_TYPES = ['Artboard', 'Group', 'SymbolMaster', 'Page']
const TEXT_PROPERTIES = [
	'fontFamily',
	'fontSize',
	'fontWeight',
	'fontStyle',
	'lineHeight',
	'kerning',
	'paragraphSpacing',
	'alignment',
	'verticalAlignment',
	'textTransform',
]

function editableDocument(args) {
	const document = resolveDocument(args)
	if (!document.path) throw new Error('Save the document before an agent edits it, so a backup can be made first.')
	return document
}

function draftsPage(document) {
	const existing = document.pages.find(page => page.name === DRAFTS_PAGE)
	return existing || new sketch.Page({ name: DRAFTS_PAGE, parent: document })
}

function findByIdOrName(list, key, kind) {
	const match = list.find(item => item.id === key) || list.find(item => item.name === key)
	if (!match) throw new Error('No ' + kind + ' has id or name ' + key)
	return match
}

function resolveColor(document, value) {
	if (typeof value === 'string') return value
	if (value && value.swatch) return findByIdOrName(document.swatches, value.swatch, 'swatch').referencingColor
	throw new Error('A color must be a hex string or { "swatch": "<name>" }')
}

function applyStyle(document, layer, style, textStyle) {
	if (style) {
		if (style.fills) {
			layer.style.fills = style.fills.map(color => ({ fillType: 'Color', color: resolveColor(document, color) }))
		}
		if (style.borders) {
			layer.style.borders = style.borders.map(border => ({
				color: resolveColor(document, border.color),
				thickness: border.thickness === undefined ? 1 : border.thickness,
				position: border.position || 'Inside',
			}))
		}
		if (style.shadows) {
			layer.style.shadows = style.shadows.map(shadow => ({
				color: resolveColor(document, shadow.color),
				x: shadow.x || 0,
				y: shadow.y || 0,
				blur: shadow.blur || 0,
				spread: shadow.spread || 0,
			}))
		}
		if (style.opacity !== undefined) layer.style.opacity = style.opacity
	}
	if (textStyle) {
		TEXT_PROPERTIES.forEach(property => {
			if (textStyle[property] !== undefined) layer.style[property] = textStyle[property]
		})
		if (textStyle.textColor !== undefined) layer.style.textColor = resolveColor(document, textStyle.textColor)
	}
}

function linkSharedStyle(document, layer, key) {
	const list = layer.type === 'Text' ? document.sharedTextStyles : document.sharedLayerStyles
	const shared = findByIdOrName(list, key, layer.type === 'Text' ? 'text style' : 'layer style')
	layer.sharedStyle = shared
	layer.style.syncWithSharedStyle(shared)
}

function setCornerRadius(layer, radius) {
	if (layer.type !== 'ShapePath') throw new Error('Corner radius only applies to rectangles and shapes')
	layer.points.forEach(point => {
		point.cornerRadius = radius
	})
}

function setFrame(layer, frame) {
	const next = layer.frame
	;['x', 'y', 'width', 'height'].forEach(key => {
		if (frame[key] !== undefined) next[key] = frame[key]
	})
	layer.frame = next
}

function tagCreated(layer) {
	Settings.setLayerSettingForKey(layer, CREATED_KEY, true)
}

function result(document, layer, request) {
	const shown = layer.type === 'Artboard' ? layer : layer.getParentArtboard() || layer
	return {
		result: layerSpec(layer, { document, swatches: swatchNames(document), depth: 3 }),
		files: exportLayers([shown], request.replyDir + '/exports', ['png'], 1),
	}
}

function rightOfContent(page) {
	const edges = page.layers.map(layer => layer.frame.x + layer.frame.width)
	return edges.length ? Math.max.apply(null, edges) + ARTBOARD_GAP : 0
}

function createArtboard(args, request) {
	const document = editableDocument(args)
	const page = args.pageId ? findPage(document, args.pageId) : draftsPage(document)
	const artboard = new sketch.Artboard({
		name: args.name || 'Artboard',
		parent: page,
		frame: new sketch.Rectangle(
			args.x === undefined ? rightOfContent(page) : args.x,
			args.y || 0,
			args.width,
			args.height
		),
	})
	applyStyle(document, artboard, args.style)
	tagCreated(artboard)
	return result(document, artboard, request)
}

function createLayer(args, request) {
	const document = editableDocument(args)
	const parent = findLayer(document, args.parentId)
	if (!CONTAINER_TYPES.includes(parent.type))
		throw new Error('Layers can only be added to an artboard, group, or page')
	const frame = args.frame || {}
	const rectangle = new sketch.Rectangle(frame.x || 0, frame.y || 0, frame.width || 100, frame.height || 100)
	let layer

	if (args.kind === 'rectangle' || args.kind === 'oval') {
		layer = new sketch.ShapePath({
			name: args.name,
			parent,
			frame: rectangle,
			shapeType: args.kind === 'oval' ? sketch.ShapePath.ShapeType.Oval : sketch.ShapePath.ShapeType.Rectangle,
		})
		if (args.kind === 'rectangle' && args.cornerRadius) setCornerRadius(layer, args.cornerRadius)
	} else if (args.kind === 'text') {
		layer = new sketch.Text({ name: args.name, parent, text: args.text || '', frame: rectangle })
		if (frame.width !== undefined) layer.fixedWidth = true
	} else if (args.kind === 'group') {
		layer = new sketch.Group({ name: args.name, parent, frame: rectangle })
	} else if (args.kind === 'symbol') {
		const masters = document.getSymbols()
		const master =
			masters.find(item => item.symbolId === args.symbol) || findByIdOrName(masters, args.symbol, 'symbol')
		layer = master.createNewInstance()
		layer.parent = parent
		layer.frame = new sketch.Rectangle(
			rectangle.x,
			rectangle.y,
			frame.width || master.frame.width,
			frame.height || master.frame.height
		)
		if (args.name) layer.name = args.name
	} else {
		throw new Error('Unknown layer kind: ' + args.kind)
	}

	if (args.sharedStyle) linkSharedStyle(document, layer, args.sharedStyle)
	applyStyle(document, layer, args.style, args.textStyle)
	tagCreated(layer)
	return result(document, layer, request)
}

function updateLayer(args, request) {
	const document = editableDocument(args)
	const layer = findLayer(document, args.id)
	if (args.name !== undefined) layer.name = args.name
	if (args.hidden !== undefined) layer.hidden = args.hidden
	if (args.frame) setFrame(layer, args.frame)
	if (args.text !== undefined) {
		if (layer.type !== 'Text') throw new Error('Only text layers have text')
		layer.text = args.text
	}
	if (args.cornerRadius !== undefined) setCornerRadius(layer, args.cornerRadius)
	if (args.overrides) {
		if (layer.type !== 'SymbolInstance') throw new Error('Only symbol instances have overrides')
		args.overrides.forEach(change => {
			const override = layer.overrides.find(item => item.id === change.id)
			if (!override) throw new Error('No override has id ' + change.id)
			layer.setOverrideValue(override, change.value)
		})
	}
	applyStyle(document, layer, args.style, args.textStyle)
	return result(document, layer, request)
}

function applySharedStyle(args, request) {
	const document = editableDocument(args)
	const layer = findLayer(document, args.id)
	linkSharedStyle(document, layer, args.sharedStyle)
	return result(document, layer, request)
}

function hexToMSColor(hex) {
	const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex)
	if (!match) throw new Error('Swatch colors must be #rrggbb or #rrggbbaa')
	const value = parseInt(match[1], 16)
	const alpha = match[2] ? parseInt(match[2], 16) / 255 : 1
	return MSColor.colorWithRed_green_blue_alpha(
		((value >> 16) & 255) / 255,
		((value >> 8) & 255) / 255,
		(value & 255) / 255,
		alpha
	)
}

function upsertSwatch(args) {
	const document = editableDocument(args)
	const existing = document.swatches.find(swatch => swatch.name === args.name)
	if (!existing) {
		document.swatches.push(sketch.Swatch.from({ name: args.name, color: args.color }))
		return { result: { created: true, name: args.name, color: args.color } }
	}
	existing.sketchObject.updateWithColor(hexToMSColor(args.color))
	document.sketchObject.documentData().sharedSwatches().updateReferencesToSwatch(existing.sketchObject)
	return { result: { created: false, name: args.name, color: args.color } }
}

function styleFromInput(document, args) {
	if (args.fromLayerId) return findLayer(document, args.fromLayerId).style
	const template =
		args.kind === 'text'
			? new sketch.Text({ text: 'Style' })
			: new sketch.ShapePath({ shapeType: sketch.ShapePath.ShapeType.Rectangle })
	applyStyle(document, template, args.style, args.textStyle)
	return template.style
}

function upsertSharedStyle(args) {
	const document = editableDocument(args)
	const list = args.kind === 'text' ? document.sharedTextStyles : document.sharedLayerStyles
	const style = styleFromInput(document, args)
	const existing = list.find(shared => shared.name === args.name)
	if (!existing) {
		list.push({ name: args.name, style })
		return { result: { created: true, name: args.name } }
	}
	existing.style = style
	const instances = existing.getAllInstancesLayers()
	instances.forEach(layer => layer.style.syncWithSharedStyle(existing))
	return { result: { created: false, name: args.name, updatedLayers: instances.length } }
}

function deleteLayer(args) {
	const document = editableDocument(args)
	const layer = findLayer(document, args.id)
	if (!args.force && !Settings.layerSettingForKey(layer, CREATED_KEY)) {
		throw new Error('This layer was not created by an agent. Pass force: true to delete it anyway.')
	}
	const removed = { id: layer.id, name: layer.name, type: layer.type }
	layer.remove()
	return { result: { removed } }
}

module.exports = {
	createArtboard,
	createLayer,
	updateLayer,
	applySharedStyle,
	upsertSwatch,
	upsertSharedStyle,
	deleteLayer,
}

const sketch = require('sketch')
const { findLayer, findPage } = require('../document.js')
const { applyStyle, hexToMSColor } = require('../style.js')
const {
	editableDocument,
	draftsPage,
	wasCreatedByAgent,
	setParent,
	setFrame,
	setCornerRadius,
	setOrder,
	setFixedWidth,
	setLineSpacing,
	applyTextRuns,
	setPath,
	setBooleanOperation,
	applyLayout,
	applyPrototypeAndExport,
	linkSharedStyle,
	findSymbolMaster,
	setOverrides,
	setEditableOverrides,
	createNode,
	artboardOf,
	originIn,
	fromArtboardCoordinates,
	createSvgLayer,
	readSvgFile,
	tagCreated,
	summary,
	renderFiles,
	renderRequest,
	result,
} = require('../edit.js')

// Only the keys given change, so an artboard position converts x and y on their own.
function frameInParent(layer, args) {
	if (args.relativeTo !== 'artboard') return args.frame
	const origin = originIn(artboardOf(layer.parent), layer.parent)
	const frame = Object.assign({}, args.frame)
	if (frame.x !== undefined) frame.x -= origin.x
	if (frame.y !== undefined) frame.y -= origin.y
	return frame
}

function createArtboard(args, request) {
	const document = editableDocument(args)
	const page = args.pageId ? findPage(document, args.pageId) : draftsPage(document)
	const artboard = createNode(document, page, {
		kind: 'artboard',
		name: args.name,
		frame: { x: args.x, y: args.y, width: args.width, height: args.height },
		style: args.style,
	})
	return result(document, artboard, args, request)
}

const SVG_SOURCE_TYPES = ['Group', 'Shape', 'ShapePath']

// The new drawing is a new layer, so it takes the old layer's place, name, and style, and the old layer is removed.
function replaceSvg(document, layer, args) {
	if (!SVG_SOURCE_TYPES.includes(layer.type)) {
		throw new Error('Only a group, shape, or shape path can take a new SVG drawing')
	}
	if (!wasCreatedByAgent(layer)) {
		throw new Error(
			layer.name +
				' was not created by an agent, so its drawing is not replaced. Delete it with force: true and build a new svg layer instead.'
		)
	}
	const frame = Object.assign(
		{ x: layer.frame.x, y: layer.frame.y, width: layer.frame.width, height: layer.frame.height },
		args.frame ? frameInParent(layer, args) : {}
	)
	const parent = layer.parent
	const next = createSvgLayer(parent, args.svgFile ? readSvgFile(args.svgFile) : args.svg, frame)
	next.name = layer.name
	next.hidden = layer.hidden
	next.sketchObject.setStyle(layer.sketchObject.style().copy())
	setOrder(document, next, { above: layer.id })
	next.locked = layer.locked
	tagCreated(next)
	layer.remove()
	if (parent.type === 'Group') parent.adjustToFit()
	return next
}

function applyUpdate(document, found, args) {
	const replacing = args.svg !== undefined || args.svgFile !== undefined
	const layer = replacing ? replaceSvg(document, found, args) : found
	if (args.parentId !== undefined) setParent(document, layer, args.parentId)
	if (args.hidden !== undefined) layer.hidden = args.hidden
	if (args.locked !== undefined) layer.locked = args.locked
	if (args.path !== undefined) {
		setPath(layer, args.path)
		fromArtboardCoordinates(layer, args)
	}
	if (args.frame && !replacing) setFrame(layer, frameInParent(layer, args))
	if (args.text !== undefined) {
		if (layer.type !== 'Text') throw new Error('Only text layers have text')
		const customName = layer.name !== layer.text ? layer.name : undefined
		layer.text = args.text
		if (customName !== undefined && args.name === undefined) layer.name = customName
	}
	if (args.name !== undefined) layer.name = args.name
	if (args.cornerRadius !== undefined) setCornerRadius(layer, args.cornerRadius)
	if (args.symbol !== undefined) {
		if (layer.type !== 'SymbolInstance') throw new Error('Only symbol instances can swap symbols')
		const master = findSymbolMaster(document, args.symbol)
		const keepsMasterName = layer.master && layer.name === layer.master.name
		layer.symbolId = master.symbolId
		if (keepsMasterName && args.name === undefined) layer.name = master.name
	}
	if (args.overrides) setOverrides(document, layer, args.overrides)
	if (args.editableOverrides) setEditableOverrides(layer, args.editableOverrides)
	applyStyle(document, layer, args.style, args.textStyle)
	applyLayout(layer, args)
	if (args.booleanOperation !== undefined) setBooleanOperation(layer, args.booleanOperation)
	applyPrototypeAndExport(document, layer, args)
	if (args.fixedWidth !== undefined) setFixedWidth(layer, args.fixedWidth)
	if (args.lineSpacing !== undefined) setLineSpacing(layer, args.lineSpacing)
	if (args.textRuns) applyTextRuns(document, layer, args.textRuns)
	if (args.order !== undefined) setOrder(document, layer, args.order)
	return { layer, deferRender: args.overrides !== undefined || args.symbol !== undefined }
}

// Updates that ran before a failed one are not rolled back, so every id is checked before the first change.
function updateLayers(args, request) {
	const document = editableDocument(args)
	const updates = args.updates || []
	updates.forEach(update => findLayer(document, update.id))
	const updated = []
	let deferRender = false
	updates.forEach((update, index) => {
		try {
			const outcome = applyUpdate(document, findLayer(document, update.id), update)
			updated.push(outcome.layer)
			deferRender = deferRender || outcome.deferRender
		} catch (error) {
			throw new Error(
				'Update ' +
					index +
					' for ' +
					update.id +
					' failed, and the ' +
					index +
					' updates before it stay applied: ' +
					String(error.message || error),
				{ cause: error }
			)
		}
	})
	const options = Object.assign({ render: 'artboard' }, args)
	const reply = { result: { updated: updated.map(summary) } }
	if (deferRender) return Object.assign(reply, { files: [], render: renderRequest(updated[0], options) })
	return Object.assign(reply, { files: renderFiles(updated[0], options, request) })
}

function applySharedStyle(args, request) {
	const document = editableDocument(args)
	const layer = findLayer(document, args.id)
	linkSharedStyle(document, layer, args.sharedStyle)
	return result(document, layer, args, request)
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
	const ids = args.ids || [args.id]
	const layers = ids.map(id => findLayer(document, id))
	const handMade = layers.filter(layer => !wasCreatedByAgent(layer))
	if (!args.force && handMade.length > 0) {
		throw new Error(
			'These layers were not created by an agent: ' +
				handMade.map(layer => layer.name).join(', ') +
				'. Pass force: true to delete them anyway.'
		)
	}
	const removed = layers.map(layer => ({ id: layer.id, name: layer.name, type: layer.type }))
	layers.forEach(layer => layer.remove())
	return { result: { removed } }
}

module.exports = {
	createArtboard,
	updateLayers,
	applySharedStyle,
	upsertSwatch,
	upsertSharedStyle,
	deleteLayer,
}

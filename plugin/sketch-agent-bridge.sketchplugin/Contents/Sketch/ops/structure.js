const sketch = require('sketch')
const { findLayer } = require('../document.js')
const {
	editableDocument,
	symbolsPage,
	assertContainer,
	SHAPE_PART_TYPES,
	rightOfContent,
	tagCreated,
	setFrame,
	bounds,
	moveInto,
	fillGroup,
	summary,
	renderFiles,
	result,
} = require('../edit.js')
const { BOOLEAN_OPERATIONS } = require('../spec.js')

const MIN_SHAPE_PARTS = 2

function siblings(document, ids) {
	if (!ids || ids.length === 0) throw new Error('Pass at least one layer id')
	const layers = ids.map(id => findLayer(document, id))
	const parent = layers[0].parent
	if (layers.some(layer => layer.parent.id !== parent.id)) throw new Error('All layers must share the same parent')
	return { layers: layers.sort((a, b) => a.index - b.index), parent }
}

function groupLayers(args, request) {
	const document = editableDocument(args)
	const { layers, parent } = siblings(document, args.ids)
	const group = new sketch.Group({ name: args.name || 'Group', parent, frame: bounds(layers) })
	group.index = layers[layers.length - 1].index
	fillGroup(group, layers)
	tagCreated(group)
	return result(document, group, args, request)
}

// Sketch draws a combined shape with the Shape's own style, so the Shape takes the style of the bottom part.
function combineShapes(args, request) {
	const document = editableDocument(args)
	const { layers, parent } = siblings(document, args.ids)
	if (layers.length < MIN_SHAPE_PARTS) throw new Error('Pass at least two shape layers')
	const others = layers.filter(layer => !SHAPE_PART_TYPES.includes(layer.type))
	if (others.length > 0) {
		throw new Error('Only shapes and paths can be combined: ' + others.map(layer => layer.name).join(', '))
	}
	assertContainer(parent)
	const operation = BOOLEAN_OPERATIONS[args.operation]
	if (operation === undefined) throw new Error('Unknown boolean operation: ' + args.operation)
	const shape = new sketch.Shape({ name: args.name || layers[0].name, layers: [] })
	shape.parent = parent
	shape.frame = bounds(layers)
	shape.style = layers[0].style
	shape.index = layers[layers.length - 1].index
	fillGroup(shape, layers)
	layers.forEach(layer => layer.sketchObject.setBooleanOperation(operation))
	shape.adjustToFit()
	tagCreated(shape)
	return result(document, shape, args, request)
}

function ungroupLayer(args, request) {
	const document = editableDocument(args)
	const group = findLayer(document, args.id)
	if (group.type !== 'Group') throw new Error('Only groups can be ungrouped')
	const parent = group.parent
	const origin = group.frame
	const children = group.layers.slice()
	children.forEach(child => moveInto(child, parent, -origin.x, -origin.y))
	group.remove()
	return {
		result: { ungrouped: children.map(summary) },
		files: renderFiles(children[0] || parent, args, request),
	}
}

function overrideList(instance) {
	return instance.overrides
		.filter(override => override.editable !== false)
		.map(override => ({
			id: override.id,
			layer: override.affectedLayer ? override.affectedLayer.name : undefined,
			property: override.property,
		}))
}

function createSymbol(args, request) {
	const document = editableDocument(args)
	const { layers, parent } = siblings(document, args.ids)
	const box = bounds(layers)
	const page = symbolsPage(document)
	const master = new sketch.SymbolMaster({
		name: args.name,
		parent: page,
		frame: new sketch.Rectangle(rightOfContent(page), 0, box.width, box.height),
	})
	const replace = args.replace !== false
	const index = layers[layers.length - 1].index
	layers.forEach(layer => moveInto(replace ? layer : layer.duplicate(), master, box.x, box.y))
	tagCreated(master)

	let instance = null
	if (replace) {
		instance = master.createNewInstance()
		instance.parent = parent
		instance.frame = box
		instance.index = index - layers.length + 1
		tagCreated(instance)
	}
	return {
		result: {
			master: Object.assign(summary(master), { symbolId: master.symbolId }),
			instance: instance ? summary(instance) : null,
			overrides: overrideList(instance || master.createNewInstance()),
		},
		files: renderFiles(instance || master, Object.assign({ render: 'layer' }, args), request),
	}
}

function duplicateLayers(args, request) {
	const document = editableDocument(args)
	const ids = args.ids || []
	if (ids.length === 0) throw new Error('Pass at least one layer id')
	const layers = ids.map(id => findLayer(document, id))
	if (layers.some(layer => layer.type === 'Page')) throw new Error('Pages cannot be duplicated')
	const offset = args.offset || {}
	const copies = layers.map(layer => {
		const copy = layer.duplicate()
		setFrame(copy, { x: layer.frame.x + (offset.x || 0), y: layer.frame.y + (offset.y || 0) })
		if (args.name) copy.name = args.name
		tagCreated(copy)
		return copy
	})
	return {
		result: { duplicated: copies.map(summary) },
		files: renderFiles(copies[0], args, request),
	}
}

module.exports = { groupLayers, combineShapes, ungroupLayer, createSymbol, duplicate: duplicateLayers }

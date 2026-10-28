const sketch = require('sketch')
const { findLayer } = require('../document.js')
const {
	editableDocument,
	symbolsPage,
	rightOfContent,
	tagCreated,
	summary,
	renderFiles,
	result,
} = require('../edit.js')

function siblings(document, ids) {
	if (!ids || ids.length === 0) throw new Error('Pass at least one layer id')
	const layers = ids.map(id => findLayer(document, id))
	const parent = layers[0].parent
	if (layers.some(layer => layer.parent.id !== parent.id)) throw new Error('All layers must share the same parent')
	return { layers: layers.sort((a, b) => a.index - b.index), parent }
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

function groupLayers(args, request) {
	const document = editableDocument(args)
	const { layers, parent } = siblings(document, args.ids)
	const box = bounds(layers)
	const group = new sketch.Group({ name: args.name || 'Group', parent, frame: box })
	group.index = layers[layers.length - 1].index
	layers.forEach(layer => moveInto(layer, group, box.x, box.y))
	group.adjustToFit()
	tagCreated(group)
	return result(document, group, args, request)
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

module.exports = { groupLayers, ungroupLayer, createSymbol }

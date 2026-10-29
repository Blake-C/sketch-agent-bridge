const sketch = require('sketch')
const { resolveDocument, findPage, findLayer } = require('../document.js')
const { frameSpec, smartLayoutName, swatchId } = require('../spec.js')
const { allSwatches, findByIdOrName } = require('../style.js')

const DEFAULT_LIMIT = 50

function includes(value, search) {
	return String(value || '')
		.toLowerCase()
		.includes(String(search).toLowerCase())
}

function matchesSymbol(layer, key) {
	const master = layer.type === 'SymbolInstance' ? layer.master : null
	return Boolean(master) && [master.name, master.id, master.symbolId].includes(key)
}

function matchesSharedStyle(layer, key) {
	const shared = layer.sharedStyle
	return Boolean(shared) && (shared.id === key || shared.name === key)
}

function referencedSwatchIds(layer, data) {
	const list = layer.sketchObject.swatchesReferencedInDocument(data)
	const ids = []
	for (let index = 0; index < list.count(); index++) {
		const swatch = list.objectAtIndex(index)
		const local = swatch.respondsToSelector(NSSelectorFromString('localSwatch')) ? swatch.localSwatch() : swatch
		ids.push(String(local.objectID()))
	}
	return ids
}

function countOf(ids, id) {
	return ids.filter(item => item === id).length
}

function overridesUseSwatch(layer, id) {
	if (layer.type !== 'SymbolInstance') return false
	return layer.overrides.some(override => {
		if (override.property !== 'fillColor' || override.isDefault) return false
		const color = override.sketchObject.currentValue()
		return Boolean(color && color.swatchID && String(color.swatchID()) === id)
	})
}

// swatchesReferencedInDocument also lists every swatch the children use, so a layer uses the swatch itself only when it lists it more times than its children do.
function usesSwatch(layer, id, data) {
	const own = countOf(referencedSwatchIds(layer, data), id)
	const inChildren = (layer.layers || []).reduce(
		(total, child) => total + countOf(referencedSwatchIds(child, data), id),
		0
	)
	return own > inChildren || overridesUseSwatch(layer, id)
}

function matcher(args, document) {
	const swatch =
		args.swatch !== undefined ? swatchId(findByIdOrName(allSwatches(document), args.swatch, 'swatch')) : null
	const data = document.sketchObject.documentData()
	return layer => {
		if (layer.type === 'Page') return false
		if (args.name !== undefined) {
			const nameMatches = args.nameMatch === 'exact' ? layer.name === args.name : includes(layer.name, args.name)
			if (!nameMatches) return false
		}
		if (args.text !== undefined && !(layer.type === 'Text' && includes(layer.text, args.text))) return false
		if (args.symbol !== undefined && !matchesSymbol(layer, args.symbol)) return false
		if (args.sharedStyle !== undefined && !matchesSharedStyle(layer, args.sharedStyle)) return false
		if (swatch && !usesSwatch(layer, swatch, data)) return false
		return true
	}
}

function location(layer) {
	const page = layer.getParentPage()
	const artboard = layer.getParentArtboard()
	return {
		page: page ? page.name : undefined,
		artboard: artboard && artboard.id !== layer.id ? artboard.name : undefined,
	}
}

function find(args) {
	const document = resolveDocument(args)
	const scope = args.parentId
		? findLayer(document, args.parentId)
		: args.pageId
			? findPage(document, args.pageId)
			: document
	if (args.parentId && !scope.layers) throw new Error(scope.name + ' is not an artboard or group')
	const matches = sketch
		.find(args.type || '*', scope)
		.filter(layer => layer.id !== scope.id)
		.filter(matcher(args, document))
	const limit = args.limit || DEFAULT_LIMIT
	return {
		result: {
			total: matches.length,
			truncated: matches.length > limit || undefined,
			layers: matches
				.slice(0, limit)
				.map(layer =>
					Object.assign(
						{ id: layer.id, name: layer.name, type: layer.type, frame: frameSpec(layer.frame) },
						location(layer),
						layer.hidden ? { hidden: true } : {}
					)
				),
		},
	}
}

function libraryName(master) {
	const library = master.getLibrary()
	return library ? library.name : undefined
}

function masterOverrides(master) {
	return master.overrides.map(override => ({
		id: override.id,
		layer: override.affectedLayer ? override.affectedLayer.name : undefined,
		property: override.property,
		editable: override.editable,
	}))
}

function symbols(args) {
	const document = resolveDocument(args)
	return {
		result: document.getSymbols().map(master => {
			const page = master.getParentPage()
			return Object.assign(
				{
					id: master.id,
					name: master.name,
					symbolId: master.symbolId,
					page: page ? page.name : undefined,
					instanceCount: master.getAllInstances().length,
					library: libraryName(master),
					smartLayout: smartLayoutName(master),
				},
				args.includeOverrides ? { overrides: masterOverrides(master) } : {}
			)
		}),
	}
}

module.exports = { find, symbols }

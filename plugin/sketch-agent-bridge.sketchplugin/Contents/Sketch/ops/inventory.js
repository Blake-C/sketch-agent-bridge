const sketch = require('sketch')
const { resolveDocument, findPage } = require('../document.js')
const { frameSpec, smartLayoutName } = require('../spec.js')

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

function matcher(args) {
	return layer => {
		if (layer.type === 'Page') return false
		if (args.name !== undefined) {
			const nameMatches = args.nameMatch === 'exact' ? layer.name === args.name : includes(layer.name, args.name)
			if (!nameMatches) return false
		}
		if (args.text !== undefined && !(layer.type === 'Text' && includes(layer.text, args.text))) return false
		if (args.symbol !== undefined && !matchesSymbol(layer, args.symbol)) return false
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
	const scope = args.pageId ? findPage(document, args.pageId) : document
	const matches = sketch.find(args.type || '*', scope).filter(matcher(args))
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

const sketch = require('sketch')
const { resolveDocument, findLayer } = require('../document.js')
const { findByIdOrName } = require('../style.js')
const { editableDocument, tagCreated, wasCreatedByAgent, result } = require('../edit.js')
const { REFERENCE_GETTERS, enabledLibraries, librarySummary, references, byIdOrName } = require('../libraries.js')

const DEFAULT_ITEM_LIMIT = 50

function findLibrary(key) {
	return findByIdOrName(enabledLibraries(), key, 'enabled library')
}

function libraries(args) {
	const document = resolveDocument(args)
	const shown = args.includeDisabled ? sketch.getLibraries() : enabledLibraries()
	const list = shown.map(library =>
		Object.assign(librarySummary(library), args.includeDisabled ? { enabled: library.enabled } : {})
	)
	if (!args.libraryId) return { result: { libraries: list } }
	const library = findLibrary(args.libraryId)
	const words = String(args.search || '')
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
	const limit = args.limit || DEFAULT_ITEM_LIMIT
	const counts = {}
	const matches = {}
	const items = {}
	Object.keys(REFERENCE_GETTERS).forEach(kind => {
		const names = references(library, document, kind).map(reference => reference.name)
		counts[kind] = names.length
		if (args.kind && args.kind !== kind) return
		const found = names.filter(name => words.every(word => name.toLowerCase().includes(word)))
		matches[kind] = found.length
		items[kind] = found.slice(0, limit)
	})
	return { result: { libraries: list, library: { id: library.id, name: library.name, counts, matches, items } } }
}

function detach(args, request) {
	const document = editableDocument(args)
	const instance = findLayer(document, args.id)
	if (instance.type !== 'SymbolInstance') throw new Error('Only symbol instances can be detached')
	const byAgent = wasCreatedByAgent(instance)
	if (!byAgent && !args.force) {
		throw new Error(instance.name + ' was not created by an agent. Pass force: true to detach it anyway.')
	}
	const group = instance.detach({ recursively: Boolean(args.recursively) })
	if (!group) throw new Error('Sketch could not detach ' + instance.name)
	if (byAgent) tagCreated(group)
	return result(document, group, args, request)
}

function convertSymbol(args, request) {
	const document = editableDocument(args)
	const foreign = document.getSymbols().find(master => master.id === args.id && master.getLibrary())
	if (foreign) throw new Error(foreign.name + ' comes from a library. Unlink it with sync_library_item first.')
	const layer = findLayer(document, args.id)
	if (args.to === 'symbol') {
		if (layer.type !== 'Artboard') throw new Error('Only artboards can become symbols')
		const byAgent = wasCreatedByAgent(layer)
		const master = sketch.SymbolMaster.fromArtboard(layer)
		if (byAgent) tagCreated(master)
		const converted = result(document, master, args, request)
		converted.result = Object.assign({}, converted.result, { symbolId: master.symbolId })
		return converted
	}
	if (args.to !== 'artboard') throw new Error('to must be "symbol" or "artboard"')
	if (layer.type !== 'SymbolMaster') throw new Error('Only symbol masters can become artboards')
	const instances = layer.getAllInstances().length
	const byAgent = wasCreatedByAgent(layer)
	if (!args.force && instances > 0) {
		throw new Error(
			layer.name +
				' has ' +
				instances +
				' instances, which would become groups. Pass force: true to convert it anyway.'
		)
	}
	if (!args.force && !byAgent) {
		throw new Error(layer.name + ' was not created by an agent. Pass force: true to convert it anyway.')
	}
	const artboard = layer.toArtboard()
	if (byAgent) tagCreated(artboard)
	const converted = result(document, artboard, args, request)
	converted.result = Object.assign({}, converted.result, { detachedInstances: instances })
	return converted
}

const LIBRARY_ITEM_LISTS = {
	symbol: document => document.getSymbols(),
	layerStyle: document => document.sharedLayerStyles,
	textStyle: document => document.sharedTextStyles,
}

function syncLibraryItem(args) {
	const document = editableDocument(args)
	const lists = LIBRARY_ITEM_LISTS[args.kind]
	if (!lists) throw new Error('kind must be symbol, layerStyle, or textStyle')
	const items = lists(document)
	const item = items.find(candidate => candidate.symbolId === args.id) || byIdOrName(items, args.id)
	if (!item) throw new Error('No ' + args.kind + ' has id or name ' + args.id)
	const library = item.getLibrary()
	if (!library) throw new Error(item.name + ' does not come from a library')
	let done
	if (args.action === 'sync') done = item.syncWithLibrary()
	else if (args.action === 'unlink') done = item.unlinkFromLibrary()
	else throw new Error('action must be "sync" or "unlink"')
	if (!done) throw new Error('Sketch could not ' + args.action + ' ' + item.name + ' with ' + library.name)
	return { result: { id: item.id, name: item.name, library: library.name, action: args.action } }
}

const SKETCH_FILE = /^\/.+\.sketch$/

function updateLibrary(args) {
	if (args.path !== undefined) {
		if (!SKETCH_FILE.test(String(args.path))) throw new Error('path must be an absolute path to a .sketch file')
		if (!NSFileManager.defaultManager().fileExistsAtPath(args.path)) throw new Error('No file at ' + args.path)
		const added = sketch.Library.getLibraryForDocumentAtPath(args.path)
		if (!added) throw new Error('Sketch could not add ' + args.path + ' as a library')
		return { result: Object.assign(librarySummary(added), { enabled: added.enabled }) }
	}
	const library = findByIdOrName(sketch.getLibraries(), args.libraryId, 'library')
	if (args.enabled !== undefined) library.enabled = args.enabled
	return { result: Object.assign(librarySummary(library), { enabled: library.enabled }) }
}

function centerOn(document, layer) {
	try {
		document.centerOnLayer(layer)
		return true
	} catch {
		return false
	}
}

function reveal(args) {
	const document = resolveDocument(args)
	const layer = findLayer(document, args.id)
	const isPage = layer.type === 'Page'
	const page = isPage ? layer : layer.getParentPage()
	page.selected = true
	document.selectedLayers.clear()
	if (isPage) return { result: { id: layer.id, name: layer.name, page: page.name, selected: false, centered: false } }
	layer.selected = true
	return {
		result: {
			id: layer.id,
			name: layer.name,
			page: page.name,
			selected: true,
			centered: centerOn(document, layer),
		},
	}
}

function select(args) {
	const document = resolveDocument(args)
	const layers = (args.ids || []).map(id => findLayer(document, id))
	if (layers.some(layer => layer.type === 'Page'))
		throw new Error('Pages cannot be selected. Use reveal_layer to switch pages.')
	const pages = layers.map(layer => layer.getParentPage())
	if (pages.some(page => page.id !== pages[0].id)) throw new Error('All layers must be on the same page')
	if (pages.length) pages[0].selected = true
	document.selectedLayers.clear()
	layers.forEach(layer => {
		layer.selected = true
	})
	return {
		result: {
			page: document.selectedPage.name,
			selected: document.selectedLayers.layers.map(layer => ({ id: layer.id, name: layer.name })),
		},
	}
}

module.exports = { libraries, detach, reveal, select, convertSymbol, syncLibraryItem, updateLibrary }

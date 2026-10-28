const { resolveDocument, findLayer } = require('../document.js')
const { findByIdOrName } = require('../style.js')
const { editableDocument, tagCreated, wasCreatedByAgent, result } = require('../edit.js')
const { REFERENCE_GETTERS, enabledLibraries, references } = require('../libraries.js')

const DEFAULT_ITEM_LIMIT = 50

function findLibrary(key) {
	return findByIdOrName(enabledLibraries(), key, 'enabled library')
}

function libraries(args) {
	const document = resolveDocument(args)
	const list = enabledLibraries().map(library => ({
		id: library.id,
		name: library.name,
		libraryType: library.libraryType,
		valid: library.valid,
	}))
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

module.exports = { libraries, detach, reveal }

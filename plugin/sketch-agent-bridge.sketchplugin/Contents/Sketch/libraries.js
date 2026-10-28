const sketch = require('sketch')

const REFERENCE_GETTERS = {
	symbol: 'getImportableSymbolReferencesForDocument',
	layerStyle: 'getImportableLayerStyleReferencesForDocument',
	textStyle: 'getImportableTextStyleReferencesForDocument',
	swatch: 'getImportableSwatchReferencesForDocument',
}

function enabledLibraries() {
	return sketch.getLibraries().filter(library => library.enabled && library.valid)
}

function references(library, document, kind) {
	return library[REFERENCE_GETTERS[kind]](document)
}

function byIdOrName(list, key) {
	return list.find(item => item.id === key) || list.find(item => item.name === key)
}

// Sketch drops an imported library item that nothing in the document uses, so items are imported in the run that uses them.
function findLocalOrImport(document, list, key, kind, label) {
	const local = byIdOrName(list, key)
	if (local) return local
	for (const library of enabledLibraries()) {
		const reference = byIdOrName(references(library, document, kind), key)
		const imported = reference && reference.import()
		if (imported) return imported
	}
	throw new Error('No ' + label + ' has id or name ' + key + ' in the document or its enabled libraries')
}

module.exports = { REFERENCE_GETTERS, enabledLibraries, references, findLocalOrImport }

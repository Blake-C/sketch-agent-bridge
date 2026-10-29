const sketch = require('sketch')

function resolveDocument(args) {
	const documents = sketch.getDocuments()
	if (args && args.documentId) {
		const match = documents.find(document => document.id === args.documentId)
		if (!match) throw new Error('No open document has id ' + args.documentId)
		return match
	}
	const document = sketch.getSelectedDocument() || documents[0]
	if (!document) throw new Error('No document is open in Sketch')
	return document
}

// A symbol master imported from a library sits on no page, so getLayerWithID does not find it.
function findLayer(document, id) {
	const layer = document.getLayerWithID(id)
	if (layer) return layer
	const master = document.getSymbols().find(candidate => candidate.id === id && candidate.getLibrary())
	if (master) {
		throw new Error(
			master.name +
				' is a symbol master from the ' +
				master.getLibrary().name +
				' library and is on no page, so it cannot be read or changed by id. sync_library_item with action unlink makes it a local master.'
		)
	}
	throw new Error('No layer has id ' + id)
}

function findPage(document, pageId) {
	if (!pageId) return document.selectedPage
	const page = document.pages.find(candidate => candidate.id === pageId)
	if (!page) throw new Error('No page has id ' + pageId)
	return page
}

function documentName(document) {
	return String(document.sketchObject.displayName())
}

// Sketch 88.1 can leave a document's history maker partway through a moment, and then no edit becomes an undo step until Sketch restarts.
function undoIsStuck(document) {
	try {
		return Boolean(document.sketchObject.historyMaker().isMakingHistory())
	} catch {
		return false
	}
}

module.exports = { resolveDocument, findLayer, findPage, documentName, undoIsStuck }

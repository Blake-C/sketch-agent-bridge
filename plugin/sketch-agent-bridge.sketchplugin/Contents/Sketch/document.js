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

function findLayer(document, id) {
	const layer = document.getLayerWithID(id)
	if (!layer) throw new Error('No layer has id ' + id)
	return layer
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

module.exports = { resolveDocument, findLayer, findPage, documentName }

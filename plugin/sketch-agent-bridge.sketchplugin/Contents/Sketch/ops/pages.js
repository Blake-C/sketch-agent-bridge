const sketch = require('sketch')
const { findPage } = require('../document.js')
const { editableDocument, tagCreated, wasCreatedByAgent } = require('../edit.js')

function pageSummary(page) {
	return { id: page.id, name: page.name }
}

// Sketch's JavaScript API cannot reorder pages, and taking a page out of the document can change which page is selected.
function movePage(document, page, index) {
	const selected = document.selectedPage
	const data = document.sketchObject.documentData()
	const target = Math.min(index, document.pages.length - 1)
	data.removePage(page.sketchObject)
	data.insertPage_atIndex(page.sketchObject, target)
	if (selected) selected.selected = true
}

function existingPage(document, id) {
	if (!id) throw new Error('Pass a page id')
	return findPage(document, id)
}

function createPage(args) {
	const document = editableDocument(args)
	const page = new sketch.Page({ name: args.name || 'Page', parent: document })
	tagCreated(page)
	return { result: pageSummary(page) }
}

function updatePage(args) {
	const document = editableDocument(args)
	const page = existingPage(document, args.id)
	if (args.name !== undefined) page.name = args.name
	if (args.index !== undefined) movePage(document, page, args.index)
	const index = document.pages.findIndex(candidate => candidate.id === page.id)
	return { result: Object.assign(pageSummary(page), { index }) }
}

function deletePage(args) {
	const document = editableDocument(args)
	const page = existingPage(document, args.id)
	if (document.pages.length === 1) throw new Error('A document needs at least one page')
	if (!args.force && page.isSymbolsPage()) {
		throw new Error('This is the Symbols page. Pass force: true to delete it and every symbol master on it.')
	}
	if (!args.force && !wasCreatedByAgent(page)) {
		throw new Error(page.name + ' was not created by an agent. Pass force: true to delete it anyway.')
	}
	const removed = Object.assign(pageSummary(page), { layers: page.layers.length })
	page.remove()
	return { result: { removed } }
}

module.exports = { createPage, updatePage, deletePage }

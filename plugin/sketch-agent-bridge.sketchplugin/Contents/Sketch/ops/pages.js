const sketch = require('sketch')
const { findPage } = require('../document.js')
const { editableDocument, tagCreated, wasCreatedByAgent } = require('../edit.js')

function pageSummary(page) {
	return { id: page.id, name: page.name }
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
	return { result: pageSummary(page) }
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

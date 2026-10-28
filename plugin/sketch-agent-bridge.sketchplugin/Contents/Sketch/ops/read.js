const sketch = require('sketch')
const { resolveDocument, findLayer, findPage, documentName } = require('../document.js')
const { layerSpec, swatchNames, frameSpec } = require('../spec.js')
const { exportLayers } = require('../export.js')

function status() {
	const selected = sketch.getSelectedDocument()
	return {
		result: {
			sketchVersion: String(sketch.version.sketch),
			selectedDocumentId: selected ? selected.id : null,
			documents: sketch.getDocuments().map(document => ({
				id: document.id,
				name: documentName(document),
				path: document.path ? String(document.path) : null,
				selectedPage: document.selectedPage ? document.selectedPage.name : null,
				selectionCount: document.selectedLayers.length,
			})),
		},
	}
}

function pages(args) {
	const document = resolveDocument(args)
	return {
		result: document.pages.map(page => ({
			id: page.id,
			name: page.name,
			selected: page.selected,
			layerCount: page.layers.length,
		})),
	}
}

function artboards(args) {
	const document = resolveDocument(args)
	const page = findPage(document, args.pageId)
	return {
		result: {
			page: { id: page.id, name: page.name },
			artboards: page.layers
				.filter(layer => layer.type === 'Artboard' || layer.type === 'SymbolMaster')
				.map(layer => ({ id: layer.id, name: layer.name, type: layer.type, frame: frameSpec(layer.frame) })),
		},
	}
}

function specOptions(document, args) {
	return { document, swatches: swatchNames(document), depth: args.depth, includeHidden: args.includeHidden }
}

function layer(args) {
	const document = resolveDocument(args)
	return { result: layerSpec(findLayer(document, args.id), specOptions(document, args)) }
}

function selection(args, request) {
	const document = resolveDocument(args)
	const layers = document.selectedLayers.layers
	const options = specOptions(document, args)
	const formats = args.export === false ? [] : args.svg ? ['png', 'svg'] : ['png']
	return {
		result: {
			page: { id: document.selectedPage.id, name: document.selectedPage.name },
			layers: layers.map(selected => layerSpec(selected, options)),
		},
		files: exportLayers(layers, request.replyDir + '/exports', formats, args.scale || 1),
	}
}

function exportOp(args, request) {
	const document = resolveDocument(args)
	const layers = (args.ids || []).map(id => findLayer(document, id))
	return {
		result: { exported: layers.map(found => ({ id: found.id, name: found.name })) },
		files: exportLayers(layers, request.replyDir + '/exports', args.formats, args.scale || 1),
	}
}

module.exports = { status, pages, artboards, layer, selection, export: exportOp }

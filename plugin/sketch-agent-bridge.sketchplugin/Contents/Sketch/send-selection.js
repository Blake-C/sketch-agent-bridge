const sketch = require('sketch')
const { BRIDGE_DIR, makeDir, writeText } = require('./files.js')
const { layerSpec, swatchNames } = require('./spec.js')
const { exportLayers } = require('./export.js')

function slug(text) {
	return (
		String(text)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 40) || 'selection'
	)
}

function copyToClipboard(text) {
	const pasteboard = NSPasteboard.generalPasteboard()
	pasteboard.clearContents()
	pasteboard.setString_forType(text, NSPasteboardTypeString)
}

function onSendSelection() {
	const document = sketch.getSelectedDocument()
	const layers = document ? document.selectedLayers.layers : []
	if (layers.length === 0) {
		sketch.UI.message('Select one or more layers to send')
		return
	}
	const stamp = new Date().toISOString().replace(/[:.]/g, '-')
	const dir = BRIDGE_DIR + '/inbox/' + stamp + '-' + slug(layers[0].name)
	makeDir(dir)
	const options = { document, swatches: swatchNames(document) }
	const files = exportLayers(layers, dir, ['png', 'svg'], 2)
	const spec = {
		document: document.path ? String(document.path) : null,
		page: document.selectedPage.name,
		sentAt: new Date().toISOString(),
		layers: layers.map(layer => layerSpec(layer, options)),
		files: files.map(file => ({ layerId: file.layerId, format: file.format, path: file.path })),
	}
	writeText(dir + '/spec.json', JSON.stringify(spec, null, '\t'))
	copyToClipboard(dir)
	sketch.UI.message('Sent ' + layers.length + ' layer(s). Folder path copied to the clipboard.')
}

globalThis.onSendSelection = onSendSelection

const sketch = require('sketch')
const { editableDocument } = require('../edit.js')

// Sketch writes the file after the plugin run ends, and the callback fires before the write, so the server confirms the save from the file's modification time.
function save(args) {
	const document = editableDocument(args)
	document.save()
	return { result: { path: String(document.path) } }
}

function updateDocument(args) {
	const document = editableDocument(args)
	if (args.colorSpace !== undefined) {
		if (!sketch.Document.ColorSpace[args.colorSpace]) throw new Error('Unknown color space: ' + args.colorSpace)
		if (typeof args.convert !== 'boolean') throw new Error('Pass convert: true or false with colorSpace')
		document.changeColorSpace(sketch.Document.ColorSpace[args.colorSpace], args.convert)
	}
	return { result: { colorSpace: String(document.colorSpace) } }
}

module.exports = { save, updateDocument }

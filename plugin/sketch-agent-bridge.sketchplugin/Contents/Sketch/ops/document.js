const { editableDocument } = require('../edit.js')

// Sketch writes the file after the plugin run ends, and the callback fires before the write, so the server confirms the save from the file's modification time.
function save(args) {
	const document = editableDocument(args)
	document.save()
	return { result: { path: String(document.path) } }
}

module.exports = { save }

const { findLayer } = require('../document.js')
const {
	editableDocument,
	draftsPage,
	assertContainer,
	createNode,
	summary,
	renderFiles,
	renderRequest,
} = require('../edit.js')

const MAX_BUILD_NODES = 2000
const PARENT_KINDS = ['group', 'artboard']

function build(args, request) {
	const document = editableDocument(args)
	const parent = args.parentId ? findLayer(document, args.parentId) : draftsPage(document)
	assertContainer(parent)
	const refs = {}
	const roots = []
	let count = 0
	let setOverrides = false

	function make(container, node, isRoot) {
		count++
		if (count > MAX_BUILD_NODES) throw new Error('A build can create at most ' + MAX_BUILD_NODES + ' layers')
		const layer = createNode(document, container, node)
		if (isRoot) roots.push(layer)
		if (node.ref) refs[node.ref] = layer.id
		if (node.overrides) setOverrides = true
		const children = node.children || []
		if (children.length > 0) {
			if (!PARENT_KINDS.includes(node.kind)) throw new Error('Only groups and artboards can have children')
			children.forEach(child => make(layer, child, false))
			if (node.kind === 'group') layer.adjustToFit()
		}
		return layer
	}

	try {
		args.nodes.forEach(node => make(parent, node, true))
	} catch (error) {
		roots.forEach(root => root.remove())
		throw error
	}

	const shown = roots.length === 1 || parent.type === 'Page' ? roots[0] : parent
	const options = Object.assign({ render: 'artboard' }, args)
	const reply = { result: { created: count, roots: roots.map(summary), refs } }
	if (setOverrides) return Object.assign(reply, { files: [], render: renderRequest(shown, options) })
	return Object.assign(reply, { files: renderFiles(shown, options, request) })
}

module.exports = { build }

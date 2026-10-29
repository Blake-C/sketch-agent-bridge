const { findLayer } = require('../document.js')
const {
	editableDocument,
	draftsPage,
	assertContainer,
	createNode,
	moveInto,
	fillGroup,
	artboardOf,
	originIn,
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
	// Sketch refits a group as soon as a styled text layer inside it changes size, which shifts every sibling built after it.
	// So layers are built in the nearest artboard or page, offset to where their group will be, and moved into groups at the end.
	const stage = artboardOf(parent)
	const parentOrigin = originIn(stage, parent)
	const rootOffset = args.relativeTo === 'artboard' ? { x: 0, y: 0 } : parentOrigin
	const refs = {}
	const roots = []
	const created = []
	const groups = []
	let deferRender = false

	function make(container, node, offset) {
		if (created.length >= MAX_BUILD_NODES)
			throw new Error('A build can create at most ' + MAX_BUILD_NODES + ' layers')
		const layer = createNode(document, container, node)
		created.push(layer)
		if (offset.x || offset.y) {
			const frame = layer.frame
			frame.x += offset.x
			frame.y += offset.y
			layer.frame = frame
		}
		if (node.ref) refs[node.ref] = layer.id
		if (node.kind === 'group') groups.push(layer)
		if (node.overrides || node.kind === 'symbol') deferRender = true
		const children = node.children || []
		if (children.length > 0) {
			if (!PARENT_KINDS.includes(node.kind)) throw new Error('Only groups and artboards can have children')
			if (node.kind === 'artboard') {
				children.forEach(child => make(layer, child, { x: 0, y: 0 }))
			} else {
				const origin = { x: layer.frame.x, y: layer.frame.y }
				fillGroup(
					layer,
					children.map(child => make(container, child, origin))
				)
			}
		}
		return layer
	}

	try {
		args.nodes.forEach(node => roots.push(make(stage, node, rootOffset)))
		if (parent.id !== stage.id) {
			roots.forEach(root => moveInto(root, parent, parentOrigin.x, parentOrigin.y))
			parent.adjustToFit()
		}
	} catch (error) {
		created.reverse().forEach(layer => layer.remove())
		throw error
	}

	const shown = roots.length === 1 || parent.type === 'Page' ? roots[0] : parent
	const options = Object.assign({ render: 'artboard' }, args)
	// Groups shrink to fit their children, so their final frames can differ from the requested ones.
	const reply = { result: { created: created.length, roots: roots.map(summary), groups: groups.map(summary), refs } }
	if (deferRender) return Object.assign(reply, { files: [], render: renderRequest(shown, options) })
	return Object.assign(reply, { files: renderFiles(shown, options, request) })
}

module.exports = { build }

const sketch = require('sketch')
const Settings = require('sketch/settings')
const { resolveDocument, findLayer } = require('./document.js')
const { layerSpec, swatchNames, frameSpec, resizingOf, RESIZING_EDGES, BOOLEAN_OPERATIONS } = require('./spec.js')
const { exportLayers } = require('./export.js')
const { applyStyle, assertHasStyle, loadImage, nativeColor, isColorValue } = require('./style.js')
const { findLocalOrImport } = require('./libraries.js')
const { splitSubpaths } = require('./path.js')
const { setLayoutGrid, setGrid } = require('./grids.js')
const { applyTextRuns } = require('./text.js')

const DRAFTS_PAGE = 'Agent Drafts'
const CREATED_KEY = 'createdByAgent'
const ARTBOARD_GAP = 100
const VERBOSE_DEPTH = 3
const CONTAINER_TYPES = ['Artboard', 'Group', 'SymbolMaster', 'Page']
const GROUP_TYPES = ['Group', 'Shape']
const STYLE_OVERRIDES = ['textStyle', 'layerStyle']
const SMART_LAYOUT_TYPES = ['Group', 'SymbolMaster']
const MASK_TYPES = ['ShapePath', 'Shape', 'Image']
const SHAPE_PART_TYPES = ['ShapePath', 'Shape']
const SHAPE_KINDS = { rectangle: 'Rectangle', oval: 'Oval', triangle: 'Triangle', polygon: 'Polygon', star: 'Star' }
const LINE_SPACINGS = ['natural', 'system', 'variable', 'constantBaseline']
const ORDER_MOVES = { front: 'moveToFront', back: 'moveToBack', forward: 'moveForward', backward: 'moveBackward' }
const SVG_BOUNDS_NAME = 'sketch-agent-bridge-svg-bounds'
const NO_BOOLEAN_OPERATION = -1
const NONZERO_WINDING = 0

function editableDocument(args) {
	const document = resolveDocument(args)
	if (!document.path) throw new Error('Save the document before an agent edits it, so a backup can be made first.')
	return document
}

function draftsPage(document) {
	const existing = document.pages.find(page => page.name === DRAFTS_PAGE)
	return existing || new sketch.Page({ name: DRAFTS_PAGE, parent: document })
}

function symbolsPage(document) {
	const existing = sketch.Page.getSymbolsPage(document)
	if (existing) return existing
	const page = sketch.Page.createSymbolsPage()
	page.parent = document
	return page
}

function rightOfContent(container) {
	const edges = container.layers.map(layer => layer.frame.x + layer.frame.width)
	return edges.length ? Math.max.apply(null, edges) + ARTBOARD_GAP : 0
}

function assertContainer(layer) {
	if (!CONTAINER_TYPES.includes(layer.type))
		throw new Error('Layers can only be added to an artboard, group, or page')
}

function tagCreated(layer) {
	Settings.setLayerSettingForKey(layer, CREATED_KEY, true)
}

function wasCreatedByAgent(layer) {
	return Boolean(Settings.layerSettingForKey(layer, CREATED_KEY))
}

function setParent(document, layer, parentId) {
	const parent = findLayer(document, parentId)
	assertContainer(parent)
	if (layer.type === 'Artboard' && parent.type !== 'Page') throw new Error('Artboards can only be moved to a page')
	for (let node = parent; node && node.type !== 'Document'; node = node.parent) {
		if (node.id === layer.id) throw new Error('A layer cannot move into itself or one of its children')
	}
	const previous = layer.parent
	const frame = layer.frame.changeBasis({ from: previous, to: parent })
	layer.parent = parent
	layer.frame = frame
	;[previous, parent].forEach(group => {
		if (group.type === 'Group' && group.layers.length > 0) group.adjustToFit()
	})
}

function setFrame(layer, frame) {
	const next = layer.frame
	;['x', 'y', 'width', 'height'].forEach(key => {
		if (frame[key] !== undefined) next[key] = frame[key]
	})
	layer.frame = next
}

function setCornerRadius(layer, radius) {
	if (layer.type !== 'ShapePath') throw new Error('Corner radius only applies to rectangles and shapes')
	layer.points.forEach(point => {
		point.cornerRadius = radius
	})
}

function setSmartLayout(layer, name) {
	if (!SMART_LAYOUT_TYPES.includes(layer.type))
		throw new Error('Smart layout only applies to groups and symbol masters')
	if (name !== null && !sketch.SmartLayout[name]) throw new Error('Unknown smart layout: ' + name)
	layer.smartLayout = name === null ? null : sketch.SmartLayout[name]
}

function setFixedWidth(layer, fixed) {
	if (layer.type !== 'Text') throw new Error('Only text layers have a fixed width')
	layer.fixedWidth = fixed
}

function setLineSpacing(layer, lineSpacing) {
	if (layer.type !== 'Text') throw new Error('Only text layers have line spacing')
	if (!LINE_SPACINGS.includes(lineSpacing)) throw new Error('Unknown line spacing: ' + lineSpacing)
	layer.lineSpacing = lineSpacing
}

function subpathLayers(path) {
	return splitSubpaths(path).map(subpath => {
		const part = sketch.ShapePath.fromSVGPath(subpath)
		part.sketchObject.setBooleanOperation(NO_BOOLEAN_OPERATION)
		return part
	})
}

// A path with several subpaths becomes a Shape holding one shape path per subpath, the way Sketch imports SVG.
function createPathLayer(parent, path) {
	const parts = subpathLayers(path)
	if (parts.length === 1) {
		parts[0].parent = parent
		return parts[0]
	}
	const shape = new sketch.Shape({ layers: [] })
	shape.parent = parent
	shape.style.sketchObject.setWindingRule(NONZERO_WINDING)
	fillGroup(shape, parts)
	return shape
}

function setPath(layer, path) {
	if (layer.type === 'Shape') {
		const origin = layer.frame
		const previous = layer.layers.slice()
		const parts = subpathLayers(path)
		// Sketch deletes a group once its last child is removed, so the new parts go in before the old ones come out.
		parts.forEach(part => moveInto(part, layer, origin.x, origin.y))
		previous.forEach(child => child.remove())
		layer.adjustToFit()
		return
	}
	if (layer.type !== 'ShapePath' || layer.shapeType !== 'Custom') {
		throw new Error('Only custom shape paths and compound shapes, such as path layers, can take a new path')
	}
	const parts = subpathLayers(path)
	if (parts.length > 1) {
		throw new Error(
			'This layer holds one subpath, so it cannot take path data with ' +
				parts.length +
				' subpaths. Create a new path layer instead.'
		)
	}
	layer.points = parts[0].points
	layer.closed = parts[0].closed
	layer.frame = parts[0].frame
}

function setOrder(document, layer, order) {
	if (typeof order === 'number') layer.index = order
	else if (typeof order === 'string' && ORDER_MOVES[order]) layer[ORDER_MOVES[order]]()
	else if (order && (order.above || order.below)) placeNextTo(document, layer, order)
	else throw new Error('Unknown order: ' + JSON.stringify(order))
}

function placeNextTo(document, layer, order) {
	const sibling = findLayer(document, order.above || order.below)
	if (sibling.id === layer.id) throw new Error('A layer cannot be ordered against itself')
	if (!sibling.parent || !layer.parent || sibling.parent.id !== layer.parent.id) {
		throw new Error('The layer and ' + sibling.name + ' must share the same parent')
	}
	// Taking the layer out first shifts every sibling above it down by one.
	const target = layer.index < sibling.index ? sibling.index - 1 : sibling.index
	layer.index = order.above ? target + 1 : target
}

function bounds(layers) {
	const left = Math.min.apply(
		null,
		layers.map(layer => layer.frame.x)
	)
	const top = Math.min.apply(
		null,
		layers.map(layer => layer.frame.y)
	)
	const right = Math.max.apply(
		null,
		layers.map(layer => layer.frame.x + layer.frame.width)
	)
	const bottom = Math.max.apply(
		null,
		layers.map(layer => layer.frame.y + layer.frame.height)
	)
	return new sketch.Rectangle(left, top, right - left, bottom - top)
}

function moveInto(layer, container, offsetX, offsetY) {
	const frame = layer.frame
	layer.parent = container
	layer.frame = new sketch.Rectangle(frame.x - offsetX, frame.y - offsetY, frame.width, frame.height)
}

// The group is sized to its children before they move in, so Sketch has no reason to refit it and shift them.
function fillGroup(group, layers) {
	if (layers.length === 0) return
	const box = bounds(layers)
	group.frame = box
	layers.forEach(layer => moveInto(layer, group, box.x, box.y))
	group.adjustToFit()
}

function setMask(layer, mask) {
	if (mask && !MASK_TYPES.includes(layer.type)) throw new Error('Only shapes and images can be masks')
	layer.sketchObject.setHasClippingMask(mask)
}

function setResizing(layer, resizing) {
	if (layer.type === 'Page') throw new Error('Pages have no resizing constraints')
	const next = resizingOf(layer)
	Object.keys(RESIZING_EDGES).forEach(key => {
		if (resizing[key] !== undefined) next[key] = resizing[key]
	})
	if (next.pinLeft && next.pinRight && next.fixWidth) {
		throw new Error('A layer pinned to the left and right cannot also have a fixed width')
	}
	if (next.pinTop && next.pinBottom && next.fixHeight) {
		throw new Error('A layer pinned to the top and bottom cannot also have a fixed height')
	}
	Object.keys(RESIZING_EDGES).forEach(key => {
		if (resizing[key] !== undefined) layer.sketchObject['setHasFixed' + RESIZING_EDGES[key]](resizing[key])
	})
}

// A Shape is sized to the result of its boolean operations, which Sketch only recalculates on a refit.
function setBooleanOperation(layer, name) {
	if (!layer.parent || layer.parent.type !== 'Shape') {
		throw new Error('Only a part of a combined shape has a boolean operation')
	}
	if (!SHAPE_PART_TYPES.includes(layer.type)) throw new Error('Only shapes and paths can be part of a combined shape')
	if (BOOLEAN_OPERATIONS[name] === undefined) throw new Error('Unknown boolean operation: ' + name)
	layer.sketchObject.setBooleanOperation(BOOLEAN_OPERATIONS[name])
	layer.parent.adjustToFit()
}

function applyLayout(layer, input) {
	if (input.smartLayout !== undefined) setSmartLayout(layer, input.smartLayout)
	if (input.resizing !== undefined) setResizing(layer, input.resizing)
	if (input.layoutGrid !== undefined) setLayoutGrid(layer, input.layoutGrid)
	if (input.grid !== undefined) setGrid(layer, input.grid)
	if (input.rotation !== undefined) layer.transform.rotation = input.rotation
	if (input.flipHorizontal !== undefined) layer.transform.flippedHorizontally = input.flipHorizontal
	if (input.flipVertical !== undefined) layer.transform.flippedVertically = input.flipVertical
	if (input.mask !== undefined) setMask(layer, input.mask)
	if (input.breaksMask !== undefined) layer.sketchObject.setShouldBreakMaskChain(input.breaksMask)
	// A group holding a mask is sized to the mask, which Sketch only recalculates on a refit.
	if ((input.mask !== undefined || input.breaksMask !== undefined) && layer.parent.type === 'Group') {
		layer.parent.adjustToFit()
	}
}

function setFlow(document, layer, flow) {
	if (flow === null) {
		layer.flow = null
		return
	}
	const back = flow.target === 'back'
	const target = back ? sketch.Flow.BackTarget : findLayer(document, flow.target)
	if (!back && target.type !== 'Artboard') throw new Error('A flow target must be an artboard or "back"')
	layer.flow = { target, animationType: flow.animation || 'slideFromRight' }
}

function exportFormatFromInput(format) {
	const out = { fileFormat: format.fileFormat, size: format.size || '1x' }
	if (format.prefix !== undefined) out.prefix = format.prefix
	if (format.suffix !== undefined) out.suffix = format.suffix
	return out
}

function applyPrototypeAndExport(document, layer, input) {
	if (input.flow !== undefined) setFlow(document, layer, input.flow)
	if (input.flowStartPoint !== undefined) {
		if (layer.type !== 'Artboard') throw new Error('Only artboards can be a flow start point')
		layer.flowStartPoint = input.flowStartPoint
	}
	if (input.exportFormats !== undefined) layer.exportFormats = input.exportFormats.map(exportFormatFromInput)
}

function linkSharedStyle(document, layer, key) {
	assertHasStyle(layer)
	const isText = layer.type === 'Text'
	const list = isText ? document.sharedTextStyles : document.sharedLayerStyles
	const shared = isText
		? findLocalOrImport(document, list, key, 'textStyle', 'text style')
		: findLocalOrImport(document, list, key, 'layerStyle', 'layer style')
	// syncWithSharedStyle leaves a text layer's font unchanged when the text style comes from a library, so the style is copied first.
	if (isText) layer.style = shared.style
	layer.sharedStyle = shared
	layer.style.syncWithSharedStyle(shared)
}

function findSymbolMaster(document, key) {
	const masters = document.getSymbols()
	return (
		masters.find(master => master.symbolId === key) || findLocalOrImport(document, masters, key, 'symbol', 'symbol')
	)
}

function overrideValue(document, override, value) {
	if (override.property === 'symbolID') return findSymbolMaster(document, value).symbolId
	if (override.property === 'image') return loadImage(value)
	if (override.property === 'fillColor') return nativeColor(document, value)
	if (typeof value !== 'string') throw new Error('Only fillColor overrides take a swatch')
	return value
}

function isLocked(instance, override) {
	if (override.editable === false) return true
	const master = instance.master
	const masterOverride = master && master.overrides.find(item => item.id === override.id)
	return Boolean(masterOverride) && masterOverride.editable === false
}

// A layer can have several overrides, such as a nested symbol's locked symbolID and its fillColor, so a color value picks fillColor and other values prefer content overrides that are not locked.
function pickOverride(instance, candidates, value) {
	if (isColorValue(value)) {
		const color = candidates.find(item => item.property === 'fillColor')
		if (color) return color
	}
	const content = candidates.filter(item => !STYLE_OVERRIDES.includes(item.property) && item.property !== 'fillColor')
	return content.find(item => !isLocked(instance, item)) || content[0] || candidates[0]
}

function matchesOverride(item, change) {
	if (change.id) return item.id === change.id
	return (
		Boolean(item.affectedLayer) &&
		item.affectedLayer.name === change.layer &&
		(!change.property || item.property === change.property)
	)
}

function setOverrides(document, instance, changes) {
	if (instance.type !== 'SymbolInstance') throw new Error('Only symbol instances have overrides')
	// A change can swap a nested symbol that later changes match inside, so changes apply in order and a failure restores the values from before.
	// overrideValues returns the live mutable array, so the snapshot copies it and its items.
	const before = NSArray.alloc().initWithArray_copyItems(instance.sketchObject.overrideValues(), true)
	try {
		changes.forEach(change => {
			if (!change.id && !change.layer) throw new Error('Each override needs an id or a layer')
			const candidates = instance.overrides.filter(item => matchesOverride(item, change))
			const override = pickOverride(instance, candidates, change.value)
			if (!override) throw new Error('No override matches ' + (change.id || change.layer))
			if (isLocked(instance, override)) {
				const name = override.affectedLayer ? override.affectedLayer.name : override.id
				throw new Error('The symbol master does not allow the ' + override.property + ' override on ' + name)
			}
			instance.setOverrideValue(override, overrideValue(document, override, change.value))
		})
	} catch (error) {
		instance.sketchObject.setOverrideValues(before)
		throw error
	}
	if (instance.master && instance.master.smartLayout) instance.resizeWithSmartLayout()
}

function setEditableOverrides(master, changes) {
	if (master.type !== 'SymbolMaster') throw new Error('Only symbol masters set which overrides are editable')
	if (master.getLibrary()) {
		throw new Error(master.name + ' comes from a library. Unlink it with sync_library_item first.')
	}
	// Every change is matched before any is applied, so a change that matches nothing leaves the master unchanged.
	const matched = changes.map(change => {
		if (!change.id && !change.layer) throw new Error('Each editableOverrides entry needs an id or a layer')
		const overrides = master.overrides.filter(item => matchesOverride(item, change))
		if (!overrides.length) throw new Error('No override matches ' + (change.id || change.layer))
		return { overrides, editable: change.editable }
	})
	matched.forEach(match => {
		match.overrides.forEach(override => {
			override.editable = match.editable
		})
	})
}

function svgAttribute(tag, name) {
	const match = tag.match(new RegExp('\\s' + name + '\\s*=\\s*["\']([^"\']*)["\']'))
	return match ? match[1] : undefined
}

function svgViewBox(tag) {
	const viewBox = svgAttribute(tag, 'viewBox')
	const numbers = viewBox
		? viewBox
				.trim()
				.split(/[\s,]+/)
				.map(Number)
		: []
	if (numbers.length === 4 && numbers.every(isFinite) && numbers[2] > 0 && numbers[3] > 0) return numbers
	const width = parseFloat(svgAttribute(tag, 'width'))
	const height = parseFloat(svgAttribute(tag, 'height'))
	return width > 0 && height > 0 ? [0, 0, width, height] : null
}

function readSvgFile(path) {
	if (!String(path).startsWith('/') || !/\.svg$/i.test(path)) {
		throw new Error('svgFile must be an absolute path to a .svg file')
	}
	const svg = NSString.stringWithContentsOfFile_encoding_error(path, NSUTF8StringEncoding, null)
	if (!svg) throw new Error('Could not read the SVG at ' + path)
	return String(svg)
}

function svgWithSize(svg, givenWidth, givenHeight) {
	return svg.replace(/<svg\b[^>]*>/, tag => {
		const box = svgViewBox(tag)
		let width = givenWidth
		let height = givenHeight
		if (box && width !== undefined && height === undefined) height = (width * box[3]) / box[2]
		if (box && height !== undefined && width === undefined) width = (height * box[2]) / box[3]
		let next = tag
		if (width !== undefined)
			next = next.replace(/\swidth\s*=\s*["'][^"']*["']/, '').replace('<svg', '<svg width="' + width + '"')
		if (height !== undefined)
			next = next.replace(/\sheight\s*=\s*["'][^"']*["']/, '').replace('<svg', '<svg height="' + height + '"')
		if (!box) return next
		return (
			next +
			'<rect id="' +
			SVG_BOUNDS_NAME +
			'" x="' +
			box[0] +
			'" y="' +
			box[1] +
			'" width="' +
			box[2] +
			'" height="' +
			box[3] +
			'" fill="none"/>'
		)
	})
}

function findByName(layer, name) {
	if (layer.name === name) return layer
	const children = layer.layers || []
	for (let i = 0; i < children.length; i++) {
		const match = findByName(children[i], name)
		if (match) return match
	}
	return null
}

// Sketch trims the empty space around imported SVG content, so a marker rect the size of the viewBox shows where the content sat in the frame.
function createSvgLayer(parent, svg, frame) {
	const layer = sketch.createLayerFromData(svgWithSize(svg, frame.width, frame.height), 'svg')
	layer.parent = parent
	setFrame(layer, { x: frame.x || 0, y: frame.y || 0 })
	const marker = findByName(layer, SVG_BOUNDS_NAME)
	if (!marker) return layer
	const origin = marker.frame.changeBasis({ from: marker.parent, to: layer })
	setFrame(layer, { x: (frame.x || 0) - origin.x, y: (frame.y || 0) - origin.y })
	marker.remove()
	if (layer.type === 'Group' && layer.layers.length > 0) layer.adjustToFit()
	return layer
}

function createNode(document, parent, node) {
	const frame = node.frame || {}
	const rectangle = new sketch.Rectangle(frame.x || 0, frame.y || 0, frame.width || 100, frame.height || 100)
	let layer

	if (node.kind === 'artboard') {
		if (parent.type !== 'Page') throw new Error('Artboards can only be added to a page')
		rectangle.x = frame.x === undefined ? rightOfContent(parent) : frame.x
		layer = new sketch.Artboard({ name: node.name || 'Artboard', parent, frame: rectangle })
	} else if (SHAPE_KINDS[node.kind]) {
		layer = new sketch.ShapePath({
			parent,
			frame: rectangle,
			shapeType: sketch.ShapePath.ShapeType[SHAPE_KINDS[node.kind]],
		})
		if (node.kind === 'rectangle' && node.cornerRadius) setCornerRadius(layer, node.cornerRadius)
	} else if (node.kind === 'path') {
		if (!node.path) throw new Error('A path layer needs SVG path data')
		layer = createPathLayer(parent, node.path)
		setFrame(layer, frame)
	} else if (node.kind === 'text') {
		layer = new sketch.Text({ parent, text: node.text || '', frame: rectangle })
		if (frame.width !== undefined) layer.fixedWidth = true
	} else if (node.kind === 'group') {
		layer = new sketch.Group({ parent, frame: rectangle })
	} else if (node.kind === 'shape') {
		// Sketch deletes a Shape at the end of the plugin run when it gets its parent and an empty layers list in the constructor, so the parent is set after.
		layer = new sketch.Shape({ layers: [] })
		layer.parent = parent
		layer.frame = rectangle
	} else if (node.kind === 'hotspot') {
		if (!node.flow) throw new Error('A hotspot needs a flow to an artboard or "back"')
		layer = new sketch.HotSpot({ parent, frame: rectangle })
	} else if (node.kind === 'slice') {
		layer = new sketch.Slice({ parent, frame: rectangle })
	} else if (node.kind === 'image') {
		layer = new sketch.Image({ parent, image: loadImage(node.image), frame: rectangle })
	} else if (node.kind === 'svg') {
		if (!node.svg && !node.svgFile) throw new Error('An svg layer needs svg markup or svgFile')
		layer = createSvgLayer(parent, node.svgFile ? readSvgFile(node.svgFile) : node.svg, frame)
	} else if (node.kind === 'symbol') {
		const master = findSymbolMaster(document, node.symbol)
		layer = master.createNewInstance()
		layer.parent = parent
		layer.frame = new sketch.Rectangle(
			rectangle.x,
			rectangle.y,
			frame.width || master.frame.width,
			frame.height || master.frame.height
		)
	} else {
		throw new Error('Unknown layer kind: ' + node.kind)
	}

	try {
		if (node.name) layer.name = node.name
		if (node.sharedStyle) linkSharedStyle(document, layer, node.sharedStyle)
		applyStyle(document, layer, node.style, node.textStyle)
		applyLayout(layer, node)
		applyPrototypeAndExport(document, layer, node)
		if (node.fixedWidth !== undefined) setFixedWidth(layer, node.fixedWidth)
		if (node.lineSpacing !== undefined) setLineSpacing(layer, node.lineSpacing)
		if (node.textRuns) applyTextRuns(document, layer, node.textRuns)
		if (node.overrides) setOverrides(document, layer, node.overrides)
		if (node.hidden) layer.hidden = true
	} catch (error) {
		layer.remove()
		throw error
	}
	tagCreated(layer)
	return layer
}

// The nearest container whose children are not refit around them: an artboard, symbol master, or page.
function artboardOf(container) {
	let space = container
	while (GROUP_TYPES.includes(space.type)) space = space.parent
	return space
}

function originIn(space, layer) {
	if (layer.id === space.id) return { x: 0, y: 0 }
	const frame = layer.frame.changeBasis({ from: layer.parent, to: space })
	return { x: frame.x, y: frame.y }
}

function artboardFrame(layer) {
	return frameSpec(layer.frame.changeBasis({ from: layer.parent, to: artboardOf(layer.parent) }))
}

function insideGroup(layer) {
	return Boolean(layer.parent) && GROUP_TYPES.includes(layer.parent.type)
}

// With relativeTo "artboard", positions were given in the artboard's coordinates, so the layer moves back by its parent's origin there.
function fromArtboardCoordinates(layer, args) {
	if (args.relativeTo !== 'artboard' || !insideGroup(layer)) return
	const origin = originIn(artboardOf(layer.parent), layer.parent)
	const frame = layer.frame
	frame.x -= origin.x
	frame.y -= origin.y
	layer.frame = frame
}

function summary(layer) {
	const spec = { id: layer.id, name: layer.name, type: layer.type, frame: frameSpec(layer.frame) }
	if (insideGroup(layer)) spec.artboardFrame = artboardFrame(layer)
	return spec
}

function parentSummary(layer) {
	if (!insideGroup(layer)) return undefined
	const parent = layer.parent
	return { id: parent.id, name: parent.name, type: parent.type, artboardFrame: artboardFrame(parent) }
}

function renderTarget(layer, render) {
	if (render === 'none') return null
	if (render === 'layer' || layer.type === 'Artboard' || layer.type === 'SymbolMaster') return layer
	return layer.getParentArtboard() || layer
}

function renderFiles(layer, args, request) {
	const target = renderTarget(layer, args.render || 'layer')
	return target ? exportLayers([target], request.replyDir + '/exports', ['png'], args.scale || 1) : []
}

function result(document, layer, args, request) {
	return {
		result: args.verbose
			? layerSpec(layer, { document, swatches: swatchNames(document), depth: VERBOSE_DEPTH })
			: Object.assign(summary(layer), { parent: parentSummary(layer) }),
		files: renderFiles(layer, args, request),
	}
}

// An export in the same plugin run still shows an instance's previous overrides and size, and leaves out symbols imported from a library in that run, so the server renders it in a second run.
function renderRequest(layer, args) {
	const target = renderTarget(layer, args.render || 'layer')
	return target ? { ids: [target.id], scale: args.scale || 1 } : undefined
}

function deferredResult(document, layer, args) {
	return {
		result: result(document, layer, Object.assign({}, args, { render: 'none' }), null).result,
		files: [],
		render: renderRequest(layer, args),
	}
}

module.exports = {
	editableDocument,
	draftsPage,
	symbolsPage,
	rightOfContent,
	assertContainer,
	tagCreated,
	wasCreatedByAgent,
	SHAPE_PART_TYPES,
	setParent,
	setFrame,
	setCornerRadius,
	setOrder,
	bounds,
	moveInto,
	fillGroup,
	setFixedWidth,
	setLineSpacing,
	applyTextRuns,
	setPath,
	setBooleanOperation,
	applyLayout,
	applyPrototypeAndExport,
	linkSharedStyle,
	findSymbolMaster,
	setOverrides,
	setEditableOverrides,
	createNode,
	artboardOf,
	originIn,
	fromArtboardCoordinates,
	summary,
	renderFiles,
	renderRequest,
	result,
	deferredResult,
}

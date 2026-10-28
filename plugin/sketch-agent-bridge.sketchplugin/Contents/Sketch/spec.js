const sketch = require('sketch')
const { fromSketchAlignment } = require('./style.js')

const DEFAULT_DEPTH = 8
const MAX_NODES = 2000

function swatchNames(document) {
	const names = {}
	if (!document || !document.swatches) return names
	document.swatches.forEach(swatch => {
		names[swatchId(swatch)] = swatch.name
	})
	return names
}

function swatchId(swatch) {
	return String(swatch.sketchObject.objectID())
}

function linkedSwatch(fill, swatches) {
	try {
		const id = fill.sketchObject.color().swatchID()
		return id ? swatches[String(id)] : undefined
	} catch {
		return undefined
	}
}

function compact(object) {
	const out = {}
	Object.keys(object).forEach(key => {
		const value = object[key]
		if (value === undefined || value === null) return
		if (Array.isArray(value) && value.length === 0) return
		out[key] = value
	})
	return out
}

function fillSpec(fill, swatches) {
	if (!fill.enabled) return null
	if (fill.fillType === 'Gradient') {
		return compact({
			gradient: fill.gradient.gradientType,
			stops: fill.gradient.stops.map(stop => ({ position: stop.position, color: stop.color })),
		})
	}
	if (fill.fillType === 'Pattern') return { image: true }
	return compact({ color: fill.color, swatch: linkedSwatch(fill, swatches) })
}

function blurSpec(blur) {
	return compact({
		type: blur.blurType,
		radius: blur.radius,
		motionAngle: blur.blurType === 'Motion' ? blur.motionAngle : undefined,
	})
}

function borderOptionsSpec(options) {
	if (!options) return undefined
	const spec = compact({
		dashPattern: options.dashPattern,
		lineEnd: options.lineEnd !== 'Butt' ? options.lineEnd : undefined,
		lineJoin: options.lineJoin !== 'Miter' ? options.lineJoin : undefined,
		startArrowhead: options.startArrowhead !== 'None' ? options.startArrowhead : undefined,
		endArrowhead: options.endArrowhead !== 'None' ? options.endArrowhead : undefined,
	})
	return Object.keys(spec).length ? spec : undefined
}

function styleSpec(style, swatches) {
	if (!style) return {}
	const enabled = list => (list || []).filter(item => item.enabled)
	const spec = {
		opacity: style.opacity !== 1 ? style.opacity : undefined,
		fills: (style.fills || []).map(fill => fillSpec(fill, swatches)).filter(Boolean),
		borders: enabled(style.borders).map(border =>
			compact({
				color: border.color,
				thickness: border.thickness,
				position: border.position,
				swatch: linkedSwatch(border, swatches),
			})
		),
		shadows: enabled(style.shadows).map(shadow => ({
			color: shadow.color,
			x: shadow.x,
			y: shadow.y,
			blur: shadow.blur,
			spread: shadow.spread,
		})),
		innerShadows: enabled(style.innerShadows).map(shadow => ({
			color: shadow.color,
			x: shadow.x,
			y: shadow.y,
			blur: shadow.blur,
			spread: shadow.spread,
		})),
		blur: style.blur && style.blur.enabled ? blurSpec(style.blur) : undefined,
		blendingMode: style.blendingMode !== 'Normal' ? style.blendingMode : undefined,
		borderOptions: borderOptionsSpec(style.borderOptions),
	}
	return compact(spec)
}

function textStyleSpec(style) {
	if (!style) return undefined
	return compact({
		fontFamily: style.fontFamily,
		fontSize: style.fontSize,
		fontWeight: style.fontWeight,
		fontStyle: style.fontStyle,
		lineHeight: style.lineHeight,
		kerning: style.kerning,
		paragraphSpacing: style.paragraphSpacing || undefined,
		alignment: fromSketchAlignment(style.alignment) !== 'left' ? fromSketchAlignment(style.alignment) : undefined,
		verticalAlignment: style.verticalAlignment !== 'top' ? style.verticalAlignment : undefined,
		textColor: style.textColor,
		textTransform: style.textTransform !== 'none' ? style.textTransform : undefined,
		textUnderline: style.textUnderline || undefined,
		textStrikethrough: style.textStrikethrough || undefined,
	})
}

function cornerRadius(layer) {
	if (layer.type !== 'ShapePath' || !layer.points || layer.points.length === 0) return undefined
	const radii = layer.points.map(point => point.cornerRadius)
	if (radii.every(radius => radius === 0)) return undefined
	return radii.every(radius => radius === radii[0]) ? radii[0] : radii
}

function overridesSpec(layer) {
	return (layer.overrides || [])
		.filter(override => !override.isDefault && typeof override.value !== 'object')
		.map(override => ({
			id: override.id,
			property: override.property,
			layer: override.affectedLayer ? override.affectedLayer.name : undefined,
			value: override.value,
		}))
}

function smartLayoutName(layer) {
	const layout = layer.smartLayout
	if (!layout) return undefined
	return Object.keys(sketch.SmartLayout).find(
		name =>
			sketch.SmartLayout[name].axis === layout.axis &&
			sketch.SmartLayout[name].layoutAnchor === layout.layoutAnchor
	)
}

function frameSpec(frame) {
	return { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
}

function layerSpec(layer, options) {
	const document = options.document
	const swatches = options.swatches || swatchNames(document)
	const depth = options.depth === undefined ? DEFAULT_DEPTH : options.depth
	const includeHidden = Boolean(options.includeHidden)
	const counter = { nodes: 0, truncated: false }

	function walk(node, level) {
		counter.nodes++
		const isText = node.type === 'Text'
		const spec = {
			id: node.id,
			name: node.name,
			type: node.type,
			frame: frameSpec(node.frame),
			hidden: node.hidden || undefined,
			locked: node.locked || undefined,
			rotation: node.transform && node.transform.rotation ? node.transform.rotation : undefined,
			flippedHorizontally: node.transform && node.transform.flippedHorizontally ? true : undefined,
			flippedVertically: node.transform && node.transform.flippedVertically ? true : undefined,
			smartLayout: node.type === 'Group' || node.type === 'SymbolMaster' ? smartLayoutName(node) : undefined,
			shapeType: node.type === 'ShapePath' ? node.shapeType : undefined,
			cornerRadius: cornerRadius(node),
			text: isText ? node.text : undefined,
			textStyle: isText ? textStyleSpec(node.style) : undefined,
			fixedWidth: isText && node.fixedWidth ? true : undefined,
			style: styleSpec(node.style, swatches),
			sharedStyle: node.sharedStyle ? node.sharedStyle.name : undefined,
			symbol: node.type === 'SymbolInstance' && node.master ? node.master.name : undefined,
			symbolId: node.type === 'SymbolInstance' || node.type === 'SymbolMaster' ? node.symbolId : undefined,
			overrides: node.type === 'SymbolInstance' ? overridesSpec(node) : undefined,
		}
		if (Object.keys(spec.style).length === 0) delete spec.style
		const children = (node.layers || []).filter(child => includeHidden || !child.hidden)
		if (children.length > 0) {
			if (level >= depth || counter.nodes >= MAX_NODES) {
				spec.childCount = children.length
				counter.truncated = true
			} else {
				spec.children = children.map(child => walk(child, level + 1))
			}
		}
		return compact(spec)
	}

	const spec = walk(layer, 0)
	if (counter.truncated) spec.truncated = true
	return spec
}

module.exports = { layerSpec, styleSpec, textStyleSpec, swatchNames, swatchId, frameSpec, smartLayoutName }

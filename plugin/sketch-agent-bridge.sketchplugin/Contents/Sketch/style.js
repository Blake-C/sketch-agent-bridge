const sketch = require('sketch')
const { findLocalOrImport } = require('./libraries.js')
const { warn } = require('./warnings.js')

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'webp', 'heic', 'bmp']
const GRADIENT_TYPES = { linear: 'Linear', radial: 'Radial', angular: 'Angular' }
const PATTERN_MODES = { fill: 'Fill', fit: 'Fit', tile: 'Tile', stretch: 'Stretch' }
const TEXT_PROPERTIES = [
	'fontFamily',
	'fontSize',
	'fontWeight',
	'fontStyle',
	'fontStretch',
	'lineHeight',
	'kerning',
	'paragraphSpacing',
	'verticalAlignment',
	'textTransform',
	'textUnderline',
	'textStrikethrough',
]
const BORDER_OPTIONS = ['dashPattern', 'lineEnd', 'lineJoin', 'startArrowhead', 'endArrowhead']
const SWAPPED_ALIGNMENTS = { center: 'right', right: 'center' }

// Sketch 88.1 writes Intel AppKit alignment values, and arm64 AppKit swaps the raw values for center and right.
function alignmentIsSwapped() {
	return Number(NSTextAlignmentCenter) === 1
}

function toSketchAlignment(alignment) {
	return alignmentIsSwapped() ? SWAPPED_ALIGNMENTS[alignment] || alignment : alignment
}

function fromSketchAlignment(alignment) {
	return toSketchAlignment(alignment)
}

function findByIdOrName(list, key, kind) {
	const match = list.find(item => item.id === key) || list.find(item => item.name === key)
	if (!match) throw new Error('No ' + kind + ' has id or name ' + key)
	return match
}

function loadImage(path) {
	const extension = String(path).split('.').pop().toLowerCase()
	if (!String(path).startsWith('/') || !IMAGE_EXTENSIONS.includes(extension)) {
		throw new Error('Images must be an absolute path to a ' + IMAGE_EXTENSIONS.join(', ') + ' file')
	}
	const image = NSImage.alloc().initWithContentsOfFile(path)
	if (!image) throw new Error('Could not read the image at ' + path)
	return image
}

// document.swatches lists only local swatches, so swatches imported from a library are added from foreignSwatches.
function allSwatches(document) {
	const foreign = document.sketchObject.documentData().foreignSwatches()
	const imported = []
	for (let index = 0; index < foreign.count(); index++) {
		imported.push(sketch.Swatch.fromNative(foreign.objectAtIndex(index).localSwatch()))
	}
	return document.swatches.concat(imported)
}

function resolveColor(document, value) {
	if (typeof value === 'string') return value
	if (value && value.swatch) {
		return findLocalOrImport(document, allSwatches(document), value.swatch, 'swatch', 'swatch').referencingColor
	}
	throw new Error('A color must be a hex string or { "swatch": "<name>" }')
}

function hexToMSColor(hex) {
	const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex)
	if (!match) throw new Error('Colors must be #rrggbb or #rrggbbaa')
	const value = parseInt(match[1], 16)
	const alpha = match[2] ? parseInt(match[2], 16) / 255 : 1
	return MSColor.colorWithRed_green_blue_alpha(
		((value >> 16) & 255) / 255,
		((value >> 8) & 255) / 255,
		(value & 255) / 255,
		alpha
	)
}

function nativeColor(document, value) {
	return typeof value === 'string' ? hexToMSColor(value) : resolveColor(document, value)
}

function isColorValue(value) {
	return (typeof value === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) || Boolean(value && value.swatch)
}

function hexFromNative(color) {
	return (
		'#' +
		[color.red(), color.green(), color.blue(), color.alpha()]
			.map(channel => ('0' + Math.round(Number(channel) * 255).toString(16)).slice(-2))
			.join('')
	)
}

function fillFromInput(document, value) {
	if (value && value.gradient) {
		const gradient = value.gradient
		return {
			fillType: 'Gradient',
			gradient: {
				gradientType: GRADIENT_TYPES[gradient.type || 'linear'],
				from: gradient.from || { x: 0.5, y: 0 },
				to: gradient.to || { x: 0.5, y: 1 },
				stops: gradient.stops.map(stop => ({
					position: stop.position,
					color: resolveColor(document, stop.color),
				})),
			},
		}
	}
	if (value && value.image) {
		return {
			fillType: 'Pattern',
			pattern: { patternType: PATTERN_MODES[value.mode || 'fill'], image: loadImage(value.image) },
		}
	}
	return { fillType: 'Color', color: resolveColor(document, value) }
}

// Artboards draw their background color property and ignore style fills.
function setArtboardBackground(document, artboard, fills) {
	const colors = fills.filter(fill => typeof fill === 'string' || (fill && fill.swatch))
	if (colors.length !== fills.length || colors.length > 1) {
		throw new Error('An artboard takes one color fill. Put gradients and images on a rectangle inside it.')
	}
	artboard.background = colors.length
		? { enabled: true, includedInExport: true, color: resolveColor(document, colors[0]) }
		: { enabled: false }
}

function shadowFromInput(document, shadow) {
	return {
		color: resolveColor(document, shadow.color),
		x: shadow.x || 0,
		y: shadow.y || 0,
		blur: shadow.blur || 0,
		spread: shadow.spread || 0,
	}
}

// Assigning style.borderOptions resets every key left out to its default, so each option is set on its own.
function setBorderOptions(layer, options) {
	const target = layer.style.borderOptions
	BORDER_OPTIONS.forEach(key => {
		if (options[key] !== undefined) target[key] = options[key]
	})
}

function blurFromInput(blur) {
	if (blur === null) return { enabled: false }
	return {
		enabled: true,
		blurType: blur.type || 'Gaussian',
		radius: blur.radius === undefined ? 10 : blur.radius,
		motionAngle: blur.motionAngle || 0,
	}
}

function setFontAxes(layer, values) {
	const axes = layer.style.fontAxes
	if (!axes) throw new Error(layer.style.fontFamily + ' is not a variable font')
	Object.keys(values).forEach(name => {
		const axis = axes[name]
		if (!axis) throw new Error('No font axis is named ' + name + '. This font has ' + Object.keys(axes).join(', '))
		const value = values[name]
		if (value < Number(axis.min) || value > Number(axis.max)) {
			throw new Error(name + ' must be from ' + Number(axis.min) + ' to ' + Number(axis.max))
		}
		axis.value = value
	})
	layer.style.fontAxes = axes
}

function familyWeights(family) {
	const members = NSFontManager.sharedFontManager().availableMembersOfFontFamily(family)
	if (!members) return []
	const weights = []
	for (let index = 0; index < members.count(); index++) {
		const member = members.objectAtIndex(index)
		if (Number(member.objectAtIndex(3)) & NSFontItalicTrait) continue
		weights.push({ weight: Number(member.objectAtIndex(2)), name: String(member.objectAtIndex(1)) })
	}
	return weights.sort((a, b) => a.weight - b.weight).map(face => face.weight + ' ' + face.name)
}

// Sketch quietly swaps in the closest font it has, so the applied family and weight are read back.
function warnOnFontSubstitution(layer, textStyle) {
	const family = String(layer.style.fontFamily)
	if (textStyle.fontFamily !== undefined && family.toLowerCase() !== textStyle.fontFamily.toLowerCase()) {
		warn(layer.name + ': font family ' + textStyle.fontFamily + ' is not installed, so Sketch used ' + family + '.')
		return
	}
	const weight = Number(layer.style.fontWeight)
	if (textStyle.fontWeight !== undefined && weight !== textStyle.fontWeight) {
		warn(
			layer.name +
				': ' +
				family +
				' has no weight ' +
				textStyle.fontWeight +
				', so Sketch used ' +
				weight +
				'. Its weights are ' +
				familyWeights(family).join(', ') +
				'.'
		)
	}
}

function applyStyle(document, layer, style, textStyle) {
	if (style) {
		if (style.fills && layer.type === 'Artboard') {
			setArtboardBackground(document, layer, style.fills)
		} else if (style.fills) {
			layer.style.fills = style.fills.map(fill => fillFromInput(document, fill))
		}
		if (style.borders) {
			layer.style.borders = style.borders.map(border => ({
				color: resolveColor(document, border.color),
				thickness: border.thickness === undefined ? 1 : border.thickness,
				position: border.position || 'Inside',
			}))
		}
		if (style.shadows) layer.style.shadows = style.shadows.map(shadow => shadowFromInput(document, shadow))
		if (style.innerShadows) {
			layer.style.innerShadows = style.innerShadows.map(shadow => shadowFromInput(document, shadow))
		}
		if (style.blur !== undefined) layer.style.blur = blurFromInput(style.blur)
		if (style.borderOptions) setBorderOptions(layer, style.borderOptions)
		if (style.blendingMode !== undefined) layer.style.blendingMode = style.blendingMode
		if (style.opacity !== undefined) layer.style.opacity = style.opacity
	}
	if (textStyle) {
		TEXT_PROPERTIES.forEach(property => {
			if (textStyle[property] !== undefined) layer.style[property] = textStyle[property]
		})
		if (textStyle.alignment !== undefined) layer.style.alignment = toSketchAlignment(textStyle.alignment)
		if (textStyle.textColor !== undefined) layer.style.textColor = resolveColor(document, textStyle.textColor)
		if (textStyle.fontAxes !== undefined) setFontAxes(layer, textStyle.fontAxes)
		if (textStyle.fontFamily !== undefined || textStyle.fontWeight !== undefined) {
			warnOnFontSubstitution(layer, textStyle)
		}
	}
}

module.exports = {
	applyStyle,
	resolveColor,
	hexToMSColor,
	nativeColor,
	isColorValue,
	hexFromNative,
	allSwatches,
	fromSketchAlignment,
	findByIdOrName,
	loadImage,
	familyWeights,
}

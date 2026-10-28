const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'webp', 'heic', 'bmp']
const GRADIENT_TYPES = { linear: 'Linear', radial: 'Radial', angular: 'Angular' }
const PATTERN_MODES = { fill: 'Fill', fit: 'Fit', tile: 'Tile', stretch: 'Stretch' }
const TEXT_PROPERTIES = [
	'fontFamily',
	'fontSize',
	'fontWeight',
	'fontStyle',
	'lineHeight',
	'kerning',
	'paragraphSpacing',
	'verticalAlignment',
	'textTransform',
]
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

function resolveColor(document, value) {
	if (typeof value === 'string') return value
	if (value && value.swatch) return findByIdOrName(document.swatches, value.swatch, 'swatch').referencingColor
	throw new Error('A color must be a hex string or { "swatch": "<name>" }')
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

function applyStyle(document, layer, style, textStyle) {
	if (style) {
		if (style.fills) layer.style.fills = style.fills.map(fill => fillFromInput(document, fill))
		if (style.borders) {
			layer.style.borders = style.borders.map(border => ({
				color: resolveColor(document, border.color),
				thickness: border.thickness === undefined ? 1 : border.thickness,
				position: border.position || 'Inside',
			}))
		}
		if (style.shadows) {
			layer.style.shadows = style.shadows.map(shadow => ({
				color: resolveColor(document, shadow.color),
				x: shadow.x || 0,
				y: shadow.y || 0,
				blur: shadow.blur || 0,
				spread: shadow.spread || 0,
			}))
		}
		if (style.opacity !== undefined) layer.style.opacity = style.opacity
	}
	if (textStyle) {
		TEXT_PROPERTIES.forEach(property => {
			if (textStyle[property] !== undefined) layer.style[property] = textStyle[property]
		})
		if (textStyle.alignment !== undefined) layer.style.alignment = toSketchAlignment(textStyle.alignment)
		if (textStyle.textColor !== undefined) layer.style.textColor = resolveColor(document, textStyle.textColor)
	}
}

module.exports = { applyStyle, resolveColor, fromSketchAlignment, findByIdOrName, loadImage }

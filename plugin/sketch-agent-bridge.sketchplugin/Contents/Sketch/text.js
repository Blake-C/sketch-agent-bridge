const { nativeColor, hexFromNative, familyWeights } = require('./style.js')
const { warn } = require('./warnings.js')

const OVERFLOW_TOLERANCE = 0.5
const FONT_KEY = 'NSFont'
const COLOR_KEY = 'MSAttributedStringColorAttribute'
const UNDERLINE_KEY = 'NSUnderline'
const STRIKETHROUGH_KEY = 'NSStrikethrough'
const LINE_STYLES = { none: 0, single: 1, thick: 2, double: 9 }
const RUN_KEYS = [
	'fontFamily',
	'fontWeight',
	'fontSize',
	'fontStyle',
	'textColor',
	'swatch',
	'textUnderline',
	'textStrikethrough',
]

function lineFrame(rect) {
	return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

function textLinesSpec(layer) {
	const lines = layer.fragments.map(fragment => ({
		text: String(fragment.text).replace(/\s+$/, ''),
		frame: lineFrame(fragment.rect),
	}))
	const last = lines[lines.length - 1]
	const overflows = Boolean(last) && last.frame.y + last.frame.height > layer.frame.height + OVERFLOW_TOLERANCE
	return { lines, overflows: overflows || undefined }
}

function lineStyleName(value) {
	const number = Number(value || 0)
	return Object.keys(LINE_STYLES).find(name => LINE_STYLES[name] === number) || 'single'
}

function runStyle(attributes, swatches) {
	const font = attributes.objectForKey(FONT_KEY)
	const color = attributes.objectForKey(COLOR_KEY)
	const manager = NSFontManager.sharedFontManager()
	const swatchId = color && color.swatchID ? color.swatchID() : null
	return {
		fontFamily: font ? String(font.familyName()) : undefined,
		fontWeight: font ? Number(manager.weightOfFont(font)) : undefined,
		fontSize: font ? Number(font.pointSize()) : undefined,
		fontStyle: font && Number(manager.traitsOfFont(font)) & NSItalicFontMask ? 'italic' : 'normal',
		textColor: color ? hexFromNative(color) : undefined,
		swatch: swatchId ? swatches[String(swatchId)] : undefined,
		textUnderline: lineStyleName(attributes.objectForKey(UNDERLINE_KEY)),
		textStrikethrough: lineStyleName(attributes.objectForKey(STRIKETHROUGH_KEY)),
	}
}

function sameStyle(a, b) {
	return RUN_KEYS.every(key => a[key] === b[key])
}

function readRuns(attributed, swatches) {
	const runs = []
	const length = Number(attributed.length())
	let index = 0
	while (index < length) {
		const pointer = MOPointer.alloc().initWithValue(NSMakeRange(0, 0))
		const attributes = attributed.attributesAtIndex_effectiveRange(index, pointer)
		const range = pointer.value()
		const end = Number(range.location) + Number(range.length)
		const style = runStyle(attributes, swatches)
		const previous = runs[runs.length - 1]
		if (previous && sameStyle(previous.style, style)) previous.length = end - previous.start
		else runs.push({ start: index, length: end - index, style })
		index = end
	}
	return runs
}

// The layer's textStyle describes the first run, so only runs styled differently from it are listed.
function textRunsSpec(layer, swatches) {
	const text = String(layer.text)
	const runs = readRuns(layer.sketchObject.attributedStringValue(), swatches)
	if (runs.length < 2) return undefined
	const base = runs[0].style
	return runs
		.filter(run => !sameStyle(run.style, base))
		.map(run => {
			const spec = { text: text.substr(run.start, run.length), start: run.start, length: run.length }
			RUN_KEYS.forEach(key => {
				if (run.style[key] !== base[key] && run.style[key] !== undefined) spec[key] = run.style[key]
			})
			return spec
		})
}

function runRange(text, run) {
	const byText = run.text !== undefined
	const byIndex = run.start !== undefined || run.length !== undefined
	if (byText === byIndex) throw new Error('A text run takes text, or start and length')
	if (byText) {
		const start = text.indexOf(run.text)
		if (start < 0 || run.text.length === 0) throw new Error('The text does not contain "' + run.text + '"')
		return NSMakeRange(start, run.text.length)
	}
	if (run.start === undefined || run.length === undefined || run.start + run.length > text.length) {
		throw new Error('A text run with start and length must fall inside the ' + text.length + ' characters of text')
	}
	return NSMakeRange(run.start, run.length)
}

function runFont(font, run) {
	const manager = NSFontManager.sharedFontManager()
	const family = run.fontFamily !== undefined ? run.fontFamily : String(font.familyName())
	const weight = run.fontWeight !== undefined ? run.fontWeight : Number(manager.weightOfFont(font))
	const italic =
		run.fontStyle !== undefined ? run.fontStyle === 'italic' : Number(manager.traitsOfFont(font)) & NSItalicFontMask
	const size = run.fontSize !== undefined ? run.fontSize : Number(font.pointSize())
	const next = manager.fontWithFamily_traits_weight_size(family, italic ? NSItalicFontMask : 0, weight, size)
	if (!next) throw new Error('Font family ' + family + ' is not installed')
	if (run.fontWeight !== undefined && Number(manager.weightOfFont(next)) !== run.fontWeight) {
		warn(
			family +
				' has no weight ' +
				run.fontWeight +
				', so Sketch used ' +
				Number(manager.weightOfFont(next)) +
				'. Its weights are ' +
				familyWeights(family).join(', ') +
				'.'
		)
	}
	return next
}

// A run can cover text in several fonts, so each font in the range is changed on its own.
function setRunFonts(attributed, range, run) {
	const end = Number(range.location) + Number(range.length)
	let index = Number(range.location)
	while (index < end) {
		const pointer = MOPointer.alloc().initWithValue(NSMakeRange(0, 0))
		const font = attributed.attribute_atIndex_longestEffectiveRange_inRange(FONT_KEY, index, pointer, range)
		const part = pointer.value()
		const partEnd = Number(part.location) + Number(part.length)
		attributed.addAttribute_value_range(FONT_KEY, runFont(font, run), NSMakeRange(index, partEnd - index))
		index = partEnd
	}
}

const FONT_FIELDS = ['fontFamily', 'fontWeight', 'fontSize', 'fontStyle']

// Sketch's JavaScript API styles the whole text, so runs are written to the native attributed string.
function applyTextRuns(document, layer, runs) {
	if (layer.type !== 'Text') throw new Error('Only text layers have text runs')
	const text = String(layer.text)
	const attributed = layer.sketchObject.attributedStringValue().mutableCopy()
	runs.forEach(run => {
		const range = runRange(text, run)
		if (FONT_FIELDS.some(key => run[key] !== undefined)) setRunFonts(attributed, range, run)
		if (run.textColor !== undefined) {
			attributed.addAttribute_value_range(
				COLOR_KEY,
				nativeColor(document, run.textColor).immutableModelObject(),
				range
			)
		}
		if (run.textUnderline !== undefined) {
			attributed.addAttribute_value_range(UNDERLINE_KEY, LINE_STYLES[run.textUnderline], range)
		}
		if (run.textStrikethrough !== undefined) {
			attributed.addAttribute_value_range(STRIKETHROUGH_KEY, LINE_STYLES[run.textStrikethrough], range)
		}
	})
	layer.sketchObject.setAttributedStringValue(attributed)
}

module.exports = { textLinesSpec, textRunsSpec, applyTextRuns }

const OVERFLOW_TOLERANCE = 0.5

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

module.exports = { textLinesSpec }

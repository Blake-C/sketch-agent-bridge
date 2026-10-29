const ARITY = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }
const ARC_FLAGS = [3, 4]
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/
const SEPARATOR = /^[\s,]+/

function readNumber(text, at) {
	const match = text.slice(at).match(NUMBER)
	return match ? { value: Number(match[0]), end: at + match[0].length } : null
}

// Arc flags are single digits that SVG allows without separators, as in "a1 1 0 011 1".
function readFlag(text, at) {
	const char = text[at]
	return char === '0' || char === '1' ? { value: Number(char), end: at + 1 } : null
}

function skipSeparators(text, at) {
	const match = text.slice(at).match(SEPARATOR)
	return match ? at + match[0].length : at
}

function parseCommands(d) {
	const commands = []
	let at = skipSeparators(d, 0)
	while (at < d.length) {
		const letter = d[at]
		const lower = letter.toLowerCase()
		if (ARITY[lower] === undefined) throw new Error('Unknown path command "' + letter + '" in path data')
		at = skipSeparators(d, at + 1)
		const groups = []
		do {
			const group = []
			for (let i = 0; i < ARITY[lower]; i++) {
				at = skipSeparators(d, at)
				const read = lower === 'a' && ARC_FLAGS.includes(i) ? readFlag(d, at) : readNumber(d, at)
				if (!read) {
					if (i === 0 && groups.length > 0) break
					throw new Error('Path command "' + letter + '" is missing a number')
				}
				group.push(read.value)
				at = read.end
			}
			if (group.length === ARITY[lower]) groups.push(group)
			else break
			at = skipSeparators(d, at)
		} while (ARITY[lower] > 0 && at < d.length && !/[a-zA-Z]/.test(d[at]))
		commands.push({ letter, groups: ARITY[lower] === 0 ? [[]] : groups })
	}
	return commands
}

function endPoint(lower, group, relative, current) {
	const base = relative ? current : { x: 0, y: 0 }
	if (lower === 'h') return { x: base.x + group[0], y: current.y }
	if (lower === 'v') return { x: current.x, y: base.y + group[0] }
	const n = group.length
	return { x: base.x + group[n - 2], y: base.y + group[n - 1] }
}

function format(letter, groups) {
	return letter + groups.map(group => group.join(' ')).join(' ')
}

// Sketch's ShapePath.fromSVGPath keeps only the first subpath, so path data is split at each moveto
// and a relative moveto is made absolute, since it depends on where the previous subpath ended.
function splitSubpaths(d) {
	const subpaths = []
	let current = { x: 0, y: 0 }
	let start = { x: 0, y: 0 }
	parseCommands(String(d)).forEach((command, index) => {
		const lower = command.letter.toLowerCase()
		const relative = command.letter === lower && index > 0
		if (lower === 'm') {
			const [first, ...rest] = command.groups
			current = endPoint('m', first, relative, current)
			start = current
			let text = 'M' + current.x + ' ' + current.y
			if (rest.length > 0) text += ' ' + format(relative ? 'l' : 'L', rest)
			rest.forEach(group => {
				current = endPoint('l', group, relative, current)
			})
			subpaths.push(text)
			return
		}
		if (subpaths.length === 0) throw new Error('Path data must start with a moveto (M or m)')
		if (lower === 'z') current = start
		else
			command.groups.forEach(group => {
				current = endPoint(lower, group, command.letter === lower, current)
			})
		subpaths[subpaths.length - 1] += ' ' + format(command.letter, lower === 'z' ? [] : command.groups)
	})
	return subpaths
}

module.exports = { splitSubpaths }

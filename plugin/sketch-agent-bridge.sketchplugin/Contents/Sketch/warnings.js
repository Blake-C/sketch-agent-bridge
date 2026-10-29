let pending = []

function warn(message) {
	if (!pending.includes(message)) pending.push(message)
}

function takeWarnings() {
	const taken = pending
	pending = []
	return taken
}

module.exports = { warn, takeWarnings }

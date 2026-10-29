const { isInsideBridgeDir, readText, standardize, writeText } = require('./files.js')
const { takeWarnings } = require('./warnings.js')

// Sketch 88.1 cannot build a CGRect on macOS 27 until CoreFoundation's BridgeSupport metadata is loaded. See CHALLENGES.md.
const FRAMEWORKS = ['CoreFoundation', 'Foundation', 'CoreGraphics', 'AppKit']

const ops = Object.assign(
	{},
	require('./ops/read.js'),
	require('./ops/tokens.js'),
	require('./ops/write.js'),
	require('./ops/build.js'),
	require('./ops/structure.js'),
	require('./ops/inventory.js'),
	require('./ops/library.js'),
	require('./ops/pages.js'),
	require('./ops/document.js')
)

function requestDirFrom(context) {
	const dir = context.requestDir || (context.context && context.context.requestDir)
	if (!dir) throw new Error('The bridge command needs a "requestDir" value in --context')
	return String(dir)
}

function errorMessage(error) {
	if (!error) return 'Unknown error'
	const parts = [String(error.message || error)]
	if (!error.nativeException) return parts[0]
	parts.push(String(error.nativeException.reason()))
	if (error.stack) parts.push(String(error.stack).split('\n').slice(0, 3).join(' < '))
	return parts.join(' | ')
}

function onBridge(context) {
	let replyDir
	try {
		replyDir = requestDirFrom(context)
	} catch (error) {
		console.error(error)
		return
	}
	if (!isInsideBridgeDir(replyDir)) {
		console.error('Refused requestDir outside ~/.sketch-agent-bridge: ' + replyDir)
		return
	}
	replyDir = standardize(replyDir)
	FRAMEWORKS.forEach(name => framework(name))

	let reply
	takeWarnings()
	try {
		const request = Object.assign(JSON.parse(readText(replyDir + '/request.json')), { replyDir })
		const op = Object.prototype.hasOwnProperty.call(ops, request.op) ? ops[request.op] : null
		if (!op) throw new Error('Unknown op: ' + request.op)
		const outcome = op(request.args || {}, request)
		const warnings = takeWarnings()
		reply = { ok: true, result: outcome.result, files: outcome.files || [], render: outcome.render }
		if (warnings.length) reply.warnings = warnings
	} catch (error) {
		reply = { ok: false, error: errorMessage(error) }
	}
	writeText(replyDir + '/reply.json', JSON.stringify(reply))
}

globalThis.onBridge = onBridge

const { isInsideBridgeDir, standardize, writeText } = require('./files.js')

const ops = Object.assign({}, require('./ops/read.js'), require('./ops/tokens.js'), require('./ops/write.js'))

function readRequest(context) {
	const raw = context.request || (context.context && context.context.request)
	if (!raw) throw new Error('The bridge command needs a "request" value in --context')
	return JSON.parse(String(raw))
}

function onBridge(context) {
	let request
	try {
		request = readRequest(context)
	} catch (error) {
		console.error(error)
		return
	}
	if (!request.replyDir || !isInsideBridgeDir(request.replyDir)) {
		console.error('Refused replyDir outside ~/.sketch-agent-bridge: ' + request.replyDir)
		return
	}
	request.replyDir = standardize(request.replyDir)

	let reply
	try {
		const op = Object.prototype.hasOwnProperty.call(ops, request.op) ? ops[request.op] : null
		if (!op) throw new Error('Unknown op: ' + request.op)
		const outcome = op(request.args || {}, request)
		reply = { ok: true, result: outcome.result, files: outcome.files || [] }
	} catch (error) {
		reply = { ok: false, error: String(error && error.message ? error.message : error) }
	}
	writeText(request.replyDir + '/reply.json', JSON.stringify(reply))
}

globalThis.onBridge = onBridge

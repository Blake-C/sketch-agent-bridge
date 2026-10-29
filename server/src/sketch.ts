import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

export const BRIDGE_DIR = path.join(homedir(), '.sketch-agent-bridge')
export const SKETCHTOOL = '/Applications/Sketch.app/Contents/MacOS/sketchtool'
export const PLUGIN_PATH =
	process.env.SKETCH_AGENT_BRIDGE_PLUGIN ??
	fileURLToPath(new URL('../../plugin/sketch-agent-bridge.sketchplugin', import.meta.url))

const DEFAULT_TIMEOUT_MS = 60_000
const REQUEST_MAX_AGE_MS = 24 * 60 * 60 * 1000

const fileSchema = z.object({ layerId: z.string(), format: z.string(), path: z.string() })
const replySchema = z.discriminatedUnion('ok', [
	z.object({
		ok: z.literal(true),
		result: z.unknown(),
		files: z.array(fileSchema).default([]),
		render: z.object({ ids: z.array(z.string()), scale: z.number() }).optional(),
		warnings: z.array(z.string()).optional(),
	}),
	z.object({ ok: z.literal(false), error: z.string() }),
])

export type ExportedFile = z.infer<typeof fileSchema>
export type Reply = z.infer<typeof replySchema>
export type Runner = (file: string, args: string[], timeoutMs: number) => Promise<void>
export type RunningCheck = () => Promise<boolean>

export class BridgeError extends Error {}

export function parseReply(text: string): Reply {
	let json: unknown
	try {
		json = JSON.parse(text)
	} catch {
		throw new BridgeError('The plugin wrote a reply that is not valid JSON')
	}
	const parsed = replySchema.safeParse(json)
	if (!parsed.success) throw new BridgeError('The plugin wrote a reply in an unexpected shape')
	return parsed.data
}

export function isInside(child: string, parent: string): boolean {
	const relative = path.relative(path.resolve(parent), path.resolve(child))
	return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export const execRunner: Runner = (file, args, timeoutMs) =>
	new Promise((resolve, reject) => {
		execFile(file, args, { timeout: timeoutMs }, (error, _stdout, stderr) => {
			if (!error) return resolve()
			const detail = stderr
				.split('\n')
				.filter(line => line && !line.startsWith('objc['))
				.slice(-5)
				.join('\n')
			reject(new BridgeError(`sketchtool failed: ${error.message}${detail ? `\n${detail}` : ''}`))
		})
	})

export const pgrepRunning: RunningCheck = () =>
	new Promise(resolve => {
		execFile('/usr/bin/pgrep', ['-x', 'Sketch'], error => resolve(!error))
	})

export type BridgeOptions = {
	bridgeDir?: string
	pluginPath?: string
	sketchtool?: string
	run?: Runner
	isRunning?: RunningCheck
	timeoutMs?: number
}

export type CallResult = { reply: Reply; dir: string }

export class SketchBridge {
	readonly bridgeDir: string
	readonly pluginPath: string
	readonly sketchtool: string
	readonly run: Runner
	readonly isRunning: RunningCheck
	readonly timeoutMs: number

	constructor(options: BridgeOptions = {}) {
		this.bridgeDir = options.bridgeDir ?? BRIDGE_DIR
		this.pluginPath = options.pluginPath ?? PLUGIN_PATH
		this.sketchtool = options.sketchtool ?? SKETCHTOOL
		this.run = options.run ?? execRunner
		this.isRunning = options.isRunning ?? pgrepRunning
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
	}

	get requestsDir(): string {
		return path.join(this.bridgeDir, 'requests')
	}

	async call(op: string, args: Record<string, unknown> = {}): Promise<CallResult> {
		if (!(await this.isRunning())) throw new BridgeError('Sketch is not running. Open Sketch and a document first.')
		await this.pruneRequests()
		const dir = path.join(this.requestsDir, randomUUID())
		await mkdir(dir, { recursive: true, mode: 0o700 })
		// The plugin's Send Selection command can create the bridge folder before the server ever runs.
		await chmod(this.bridgeDir, 0o700)
		await writeFile(path.join(dir, 'request.json'), JSON.stringify({ op, args }), { mode: 0o600 })
		await this.run(
			this.sketchtool,
			[
				'run',
				this.pluginPath,
				'bridge',
				`--context=${JSON.stringify({ requestDir: dir })}`,
				'--without-activating',
			],
			this.timeoutMs
		)
		let text: string
		try {
			text = await readFile(path.join(dir, 'reply.json'), 'utf8')
		} catch {
			throw new BridgeError(
				`Sketch did not write a reply. Check that the plugin bundle exists at ${this.pluginPath} and that Sketch 88 is running.`
			)
		}
		const reply = parseReply(text)
		if (reply.ok) reply.files = reply.files.filter(file => isInside(file.path, dir))
		return { reply, dir }
	}

	async pruneRequests(now = Date.now()): Promise<void> {
		let names: string[]
		try {
			names = await readdir(this.requestsDir)
		} catch {
			return
		}
		await Promise.all(
			names.map(async name => {
				const dir = path.join(this.requestsDir, name)
				const info = await stat(dir).catch(() => null)
				if (info && now - info.mtimeMs > REQUEST_MAX_AGE_MS) await rm(dir, { recursive: true, force: true })
			})
		)
	}
}

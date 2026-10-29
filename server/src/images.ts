import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { BridgeError } from './sketch.ts'

const FETCH_TIMEOUT_MS = 120_000
const IMAGE_FILE = /\.(jpg|jpeg|png|webp)$/i
const MAX_ERROR_CHARS = 300
const SEARCH_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'

// get_images reads its key with _keychain_secret, which is defined in the system setup repo's functions.sh. functions.sh also sources every other topic file, so _keychain_secret is copied here instead of sourcing functions.sh.
const SHELL_SCRIPT = [
	'_keychain_secret() { security find-generic-password -a "$USER" -s "$1" -w 2>/dev/null | tr -d \'[:space:]\'; }',
	'source "$0" || exit 1',
	'filters=()',
	'[[ -n "$6" ]] && filters+=(-o "$6")',
	'[[ -n "$7" ]] && filters+=(-c "$7")',
	'get_images -g "$1" -sr "$2" -s "$3" -t "$4" -n "$5" "${filters[@]}"',
].join('\n')
const WARNING_LINE = /^Warning: /

export const ORIENTATIONS = ['landscape', 'portrait', 'squarish', 'any'] as const
export const COLORS = [
	'black_and_white',
	'black',
	'white',
	'yellow',
	'orange',
	'red',
	'purple',
	'magenta',
	'green',
	'teal',
	'blue',
] as const

// get_images prints a warning for each filter it drops before the line that says why it failed.
export function errorDetail(stderr: string, fallback: string): string {
	const reason = stderr
		.split('\n')
		.map(line => line.trim())
		.find(line => line && !WARNING_LINE.test(line))
	return (reason || fallback).slice(0, MAX_ERROR_CHARS)
}

export type FetchRequest = {
	query: string
	count: number
	width: number
	height: number
	orientation?: (typeof ORIENTATIONS)[number]
	color?: (typeof COLORS)[number]
}

export type FetchResult = { files: string[]; warnings: string[] }

// Resolves with stderr, which carries get_images warnings such as a color filter dropped because nothing matched.
export type ShellRunner = (args: string[], cwd: string) => Promise<string>

export const zshRunner: ShellRunner = (args, cwd) =>
	new Promise((resolve, reject) => {
		execFile(
			'/bin/zsh',
			['-f', '-c', SHELL_SCRIPT, ...args],
			{
				cwd,
				timeout: FETCH_TIMEOUT_MS,
				env: { HOME: homedir(), USER: process.env.USER ?? '', PATH: SEARCH_PATH },
			},
			(error, _stdout, stderr) => {
				if (!error) return resolve(stderr)
				reject(new BridgeError(`get_images failed: ${errorDetail(stderr, error.message)}`))
			}
		)
	})

export function slug(text: string): string {
	return (
		text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 40) || 'image'
	)
}

export async function fetchImages(
	bridgeDir: string,
	scriptPath: string | undefined,
	request: FetchRequest,
	run: ShellRunner = zshRunner
): Promise<FetchResult> {
	if (!scriptPath) {
		throw new BridgeError(
			'Image fetching is not set up. Register the server with -e SKETCH_AGENT_BRIDGE_GET_IMAGES=<path to get-images.sh>.'
		)
	}
	const dir = path.join(bridgeDir, 'images', randomUUID())
	await mkdir(dir, { recursive: true, mode: 0o700 })
	const stderr = await run(
		[
			scriptPath,
			String(request.count),
			request.query,
			`${request.width}x${request.height}`,
			'jpg',
			slug(request.query),
			request.orientation ?? '',
			request.color ?? '',
		],
		dir
	)
	const files = (await readdir(dir)).filter(name => IMAGE_FILE.test(name)).sort()
	if (files.length === 0) throw new BridgeError('get_images finished but saved no images')
	const warnings = stderr
		.split('\n')
		.map(line => line.trim())
		.filter(line => WARNING_LINE.test(line))
	return { files: files.map(name => path.join(dir, name)), warnings }
}

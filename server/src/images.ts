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
	'get_images -g "$1" -sr "$2" -s "$3" -t "$4" -n "$5"',
].join('\n')

export function errorDetail(stderr: string, fallback: string): string {
	return (stderr.trim().split('\n')[0] || fallback).slice(0, MAX_ERROR_CHARS)
}

export type FetchRequest = { query: string; count: number; width: number; height: number }

export type ShellRunner = (args: string[], cwd: string) => Promise<void>

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
				if (!error) return resolve()
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
): Promise<string[]> {
	if (!scriptPath) {
		throw new BridgeError(
			'Image fetching is not set up. Register the server with -e SKETCH_AGENT_BRIDGE_GET_IMAGES=<path to get-images.sh>.'
		)
	}
	const dir = path.join(bridgeDir, 'images', randomUUID())
	await mkdir(dir, { recursive: true, mode: 0o700 })
	await run(
		[
			scriptPath,
			String(request.count),
			request.query,
			`${request.width}x${request.height}`,
			'jpg',
			slug(request.query),
		],
		dir
	)
	const files = (await readdir(dir)).filter(name => IMAGE_FILE.test(name)).sort()
	if (files.length === 0) throw new BridgeError('get_images finished but saved no images')
	return files.map(name => path.join(dir, name))
}

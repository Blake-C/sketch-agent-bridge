import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { BridgeError } from './sketch.ts'

const BACKUPS_PER_DOCUMENT = 10
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sketch$/

export class Backups {
	readonly dir: string
	readonly done = new Set<string>()

	constructor(bridgeDir: string) {
		this.dir = path.join(bridgeDir, 'backups')
	}

	async ensure(documentPath: string, now = new Date()): Promise<string | null> {
		if (this.done.has(documentPath)) return null
		if (!path.isAbsolute(documentPath) || path.extname(documentPath) !== '.sketch') {
			throw new BridgeError(`Refusing to back up a path that is not a .sketch file: ${documentPath}`)
		}
		const name = path.basename(documentPath, '.sketch')
		const stamp = now.toISOString().replace(/[:.]/g, '-')
		const target = path.join(this.dir, `${name}-${stamp}.sketch`)
		await mkdir(this.dir, { recursive: true, mode: 0o700 })
		await cp(documentPath, target, { recursive: true, errorOnExist: true, force: false })
		this.done.add(documentPath)
		await this.pruneOldest(name)
		return target
	}

	async pruneOldest(name: string): Promise<void> {
		const prefix = `${name}-`
		const backups = (await readdir(this.dir))
			.filter(entry => entry.startsWith(prefix) && STAMP.test(entry.slice(prefix.length)))
			.sort()
		await Promise.all(
			backups
				.slice(0, -BACKUPS_PER_DOCUMENT)
				.map(entry => rm(path.join(this.dir, entry), { recursive: true, force: true }))
		)
	}
}

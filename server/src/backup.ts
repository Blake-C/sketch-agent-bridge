import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { BridgeError } from './sketch.ts'

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
		const stamp = now.toISOString().replace(/[:.]/g, '-')
		const target = path.join(this.dir, `${path.basename(documentPath, '.sketch')}-${stamp}.sketch`)
		await mkdir(this.dir, { recursive: true, mode: 0o700 })
		await cp(documentPath, target, { recursive: true, errorOnExist: true, force: false })
		this.done.add(documentPath)
		return target
	}
}

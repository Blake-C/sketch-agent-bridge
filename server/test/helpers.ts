import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export function requestFrom(args: string[]): { op: string; args: Record<string, unknown>; replyDir: string } {
	const context = args.find(arg => arg.startsWith('--context='))
	assert.ok(context)
	const replyDir = JSON.parse(context.slice('--context='.length)).requestDir
	return { ...JSON.parse(readFileSync(path.join(replyDir, 'request.json'), 'utf8')), replyDir }
}

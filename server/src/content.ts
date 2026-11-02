import { readFile } from 'node:fs/promises'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Reply } from './sketch.ts'

const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_INLINE_TEXT_BYTES = 100 * 1024
// Hosts refuse a tool result much over 1 MB, so a reply stops inlining once these totals are spent and lists the
// remaining files by path.
const MAX_REPLY_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_REPLY_TEXT_BYTES = 200 * 1024

type Content = CallToolResult['content'][number]

export function errorResult(error: unknown): CallToolResult {
	const message = error instanceof Error ? error.message : String(error)
	return { isError: true, content: [{ type: 'text', text: message }] }
}

export async function replyResult(
	reply: Reply,
	options: { inlineSvg?: boolean; inline?: boolean } = {}
): Promise<CallToolResult> {
	if (!reply.ok) return errorResult(reply.error)
	const content: Content[] = (reply.warnings ?? []).map(warning => ({ type: 'text', text: `Warning: ${warning}` }))
	content.push({ type: 'text', text: JSON.stringify({ result: reply.result, files: reply.files }) })
	if (options.inline === false) return { content }
	let imageBytes = 0
	let textBytes = 0
	const skipped: string[] = []
	for (const file of reply.files) {
		if (file.format === 'png') {
			const data = await readFile(file.path)
			if (data.byteLength > MAX_INLINE_IMAGE_BYTES) {
				content.push({
					type: 'text',
					text: `PNG for ${file.layerId} is too large to show inline: ${file.path}`,
				})
			} else if (imageBytes + data.byteLength > MAX_REPLY_IMAGE_BYTES) {
				skipped.push(file.path)
			} else {
				imageBytes += data.byteLength
				content.push({ type: 'image', data: data.toString('base64'), mimeType: 'image/png' })
			}
		} else if ((file.format === 'svg' && options.inlineSvg) || file.format === 'json') {
			const label = file.format.toUpperCase()
			const text = await readFile(file.path, 'utf8')
			if (text.length > MAX_INLINE_TEXT_BYTES) {
				content.push({
					type: 'text',
					text: `${label} for ${file.layerId} is too large to show inline: ${file.path}`,
				})
			} else if (textBytes + text.length > MAX_REPLY_TEXT_BYTES) {
				skipped.push(file.path)
			} else {
				textBytes += text.length
				content.push({ type: 'text', text: `${label} for ${file.layerId}:\n${text}` })
			}
		}
	}
	if (skipped.length > 0) {
		content.push({
			type: 'text',
			text: `${skipped.length} more files are not shown inline, to keep the reply small. They are on disk:\n${skipped.join('\n')}`,
		})
	}
	return { content }
}

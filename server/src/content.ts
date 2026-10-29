import { readFile } from 'node:fs/promises'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Reply } from './sketch.ts'

const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_INLINE_SVG_BYTES = 100 * 1024

type Content = CallToolResult['content'][number]

export function errorResult(error: unknown): CallToolResult {
	const message = error instanceof Error ? error.message : String(error)
	return { isError: true, content: [{ type: 'text', text: message }] }
}

export async function replyResult(reply: Reply, options: { inlineSvg?: boolean } = {}): Promise<CallToolResult> {
	if (!reply.ok) return errorResult(reply.error)
	const content: Content[] = (reply.warnings ?? []).map(warning => ({ type: 'text', text: `Warning: ${warning}` }))
	content.push({ type: 'text', text: JSON.stringify({ result: reply.result, files: reply.files }) })
	for (const file of reply.files) {
		if (file.format === 'png') {
			const data = await readFile(file.path)
			if (data.byteLength > MAX_INLINE_IMAGE_BYTES) {
				content.push({
					type: 'text',
					text: `PNG for ${file.layerId} is too large to show inline: ${file.path}`,
				})
			} else {
				content.push({ type: 'image', data: data.toString('base64'), mimeType: 'image/png' })
			}
		} else if (file.format === 'svg' && options.inlineSvg) {
			const svg = await readFile(file.path, 'utf8')
			content.push({
				type: 'text',
				text:
					svg.length > MAX_INLINE_SVG_BYTES
						? `SVG for ${file.layerId} is too large to show inline: ${file.path}`
						: `SVG for ${file.layerId}:\n${svg}`,
			})
		}
	}
	return { content }
}

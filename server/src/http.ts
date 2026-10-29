import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net'
import { BridgeError } from './sketch.ts'

export const FETCH_TIMEOUT_MS = 120_000
const CONNECT_ATTEMPT_TIMEOUT_MS = 1000

// Node 24 gives each address 250 ms before trying the next. An IPv4 connection to images.unsplash.com can take about 240 ms, and on a network with no working IPv6 route the IPv6 attempt then fails with UND_ERR_CONNECT_TIMEOUT.
setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS)

// fetch rejects with the message "fetch failed" and puts the reason, such as ECONNRESET, in cause.
export function networkError(action: string, error: unknown): BridgeError {
	if (error instanceof BridgeError) return error
	const cause = error instanceof Error && error.cause instanceof Error ? error.cause : undefined
	const reason = (cause as { code?: string } | undefined)?.code ?? cause?.message
	const message = error instanceof Error ? error.message : String(error)
	return new BridgeError(`${action} failed: ${reason ? `${message} (${reason})` : message}`)
}

export async function readLimited(response: Response, maxBytes: number, tooLarge: () => Error): Promise<Buffer> {
	if (Number(response.headers.get('content-length') ?? 0) > maxBytes) throw tooLarge()
	const chunks: Uint8Array[] = []
	let total = 0
	if (response.body) {
		for await (const chunk of response.body) {
			total += chunk.byteLength
			if (total > maxBytes) throw tooLarge()
			chunks.push(chunk)
		}
	}
	return Buffer.concat(chunks)
}

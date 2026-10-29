import type { BuildNode } from './schemas.ts'

type TextStyle = NonNullable<BuildNode['textStyle']>

const MERGED_FIELDS = new Set(['frame', 'style', 'textStyle'])
const CASCADING_KINDS = new Set(['group', 'artboard'])

function withoutRefs(node: BuildNode): BuildNode {
	const copy = { ...node }
	delete copy.ref
	return copy.children ? { ...copy, children: copy.children.map(withoutRefs) } : copy
}

function mergeNode(source: BuildNode, patch: BuildNode): BuildNode {
	const merged: Record<string, unknown> = { ...source }
	for (const [key, value] of Object.entries(patch)) {
		if (key === 'copyOf' || key === 'children') continue
		const base = merged[key]
		merged[key] = MERGED_FIELDS.has(key) && base && value ? { ...(base as object), ...(value as object) } : value
	}
	if (patch.children) merged.children = mergeChildren(source.children ?? [], patch.children)
	return merged as BuildNode
}

function mergeChildren(sources: BuildNode[], patches: BuildNode[]): BuildNode[] {
	const result = [...sources]
	const used = new Set<number>()
	for (const patch of patches) {
		const index = result.findIndex(
			(child, at) => !used.has(at) && child.name !== undefined && child.name === patch.name
		)
		if (index === -1) {
			result.push(patch)
			used.add(result.length - 1)
		} else {
			result[index] = mergeNode(result[index], patch)
			used.add(index)
		}
	}
	return result
}

function resolveCopies(nodes: BuildNode[], sources: Map<string, BuildNode>): BuildNode[] {
	return nodes.map(node => {
		let resolved = node
		if (node.copyOf !== undefined) {
			const source = sources.get(node.copyOf)
			if (!source) {
				throw new Error(
					`copyOf "${node.copyOf}" does not match the ref of an earlier node in this call. A node cannot copy itself or a node that holds it.`
				)
			}
			resolved = mergeNode(withoutRefs(source), node)
		}
		if (resolved.children) resolved = { ...resolved, children: resolveCopies(resolved.children, sources) }
		if (!resolved.kind) throw new Error(`Node "${resolved.name ?? resolved.ref ?? '?'}" needs a kind or a copyOf`)
		if (resolved.ref !== undefined) {
			if (sources.has(resolved.ref)) throw new Error(`The ref "${resolved.ref}" is used by two nodes`)
			sources.set(resolved.ref, resolved)
		}
		return resolved
	})
}

function cascadeTextStyle(node: BuildNode, inherited: TextStyle | undefined): BuildNode {
	if (node.kind === 'text') {
		return inherited ? { ...node, textStyle: { ...inherited, ...node.textStyle } } : node
	}
	if (!CASCADING_KINDS.has(node.kind as string)) return node
	const { textStyle, ...rest } = node
	const passed = inherited || textStyle ? { ...inherited, ...textStyle } : undefined
	return rest.children ? { ...rest, children: rest.children.map(child => cascadeTextStyle(child, passed)) } : rest
}

// copyOf and inherited text styles are resolved here, so the plugin only ever receives complete nodes.
export function expandBuild(nodes: BuildNode[], textStyle?: TextStyle): BuildNode[] {
	return resolveCopies(nodes, new Map()).map(node => cascadeTextStyle(node, textStyle))
}

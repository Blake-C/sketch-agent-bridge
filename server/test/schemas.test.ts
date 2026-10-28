import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { layerInput, order } from '../src/schemas.ts'

const node = (fields: Record<string, unknown>) => layerInput.safeParse({ kind: 'group', ...fields })

test('layer nodes accept the six smart layouts and null', () => {
	const layouts = [
		'LeftToRight',
		'HorizontallyCenter',
		'RightToLeft',
		'TopToBottom',
		'VerticallyCenter',
		'BottomToTop',
	]
	for (const smartLayout of [...layouts, null]) {
		assert.ok(node({ smartLayout }).success, String(smartLayout))
	}
	assert.equal(node({ smartLayout: 'Grid' }).success, false)
})

test('layer nodes take rotation and flips', () => {
	assert.ok(node({ rotation: 15, flipHorizontal: true, flipVertical: false }).success)
	assert.equal(node({ rotation: '15' }).success, false)
})

test('order takes a named move or a non-negative index', () => {
	const schema = z.object({ order })
	for (const value of ['front', 'back', 'forward', 'backward', 0, 3]) {
		assert.ok(schema.safeParse({ order: value }).success, String(value))
	}
	assert.equal(schema.safeParse({ order: 'top' }).success, false)
	assert.equal(schema.safeParse({ order: -1 }).success, false)
	assert.equal(schema.safeParse({ order: 1.5 }).success, false)
})

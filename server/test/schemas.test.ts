import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { findInput, layerInput, order } from '../src/schemas.ts'

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

test('style takes inner shadows, blur, blending, and border options', () => {
	const result = node({
		style: {
			innerShadows: [{ color: '#00000040', y: 2, blur: 4 }],
			blur: { type: 'Background', radius: 20 },
			blendingMode: 'Multiply',
			borderOptions: { dashPattern: [4, 2], lineEnd: 'Round', lineJoin: 'Miter', endArrowhead: 'FilledArrow' },
		},
	})
	assert.ok(result.success)
	assert.ok(node({ style: { blur: null } }).success)
	assert.equal(node({ style: { blendingMode: 'multiply' } }).success, false)
	assert.equal(node({ style: { borderOptions: { lineJoin: 'Mitter' } } }).success, false)
	assert.equal(node({ style: { blur: { type: 'Box' } } }).success, false)
})

test('text takes underline, strikethrough, and fixed width', () => {
	assert.ok(node({ kind: 'text', fixedWidth: false, textStyle: { textUnderline: 'single' } }).success)
	assert.ok(node({ textStyle: { textStrikethrough: 'none' } }).success)
	assert.equal(node({ textStyle: { textUnderline: 'wavy' } }).success, false)
})

test('find_layers takes known layer types and caps the limit at 500', () => {
	const schema = z.object(findInput)
	assert.ok(schema.safeParse({ type: 'SymbolInstance', name: 'Row', nameMatch: 'exact', limit: 500 }).success)
	assert.equal(schema.safeParse({ limit: 501 }).success, false)
	assert.equal(schema.safeParse({ type: 'Bogus' }).success, false)
})

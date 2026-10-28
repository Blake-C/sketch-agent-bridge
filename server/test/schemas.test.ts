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

test('layer nodes take shape kinds, paths, line spacing, and font axes', () => {
	for (const kind of ['triangle', 'polygon', 'star']) assert.ok(node({ kind }).success, kind)
	assert.ok(node({ kind: 'path', path: 'M0 0 L10 10' }).success)
	assert.ok(node({ kind: 'text', lineSpacing: 'constantBaseline' }).success)
	assert.equal(node({ kind: 'text', lineSpacing: 'loose' }).success, false)
	assert.ok(node({ textStyle: { fontStretch: 'condensed', fontAxes: { Weight: 700, Width: 80 } } }).success)
	assert.equal(node({ textStyle: { fontAxes: { Weight: 'bold' } } }).success, false)
	assert.equal(node({ textStyle: { fontStretch: 'wide' } }).success, false)
})

test('find_layers takes known layer types and caps the limit at 500', () => {
	const schema = z.object(findInput)
	assert.ok(schema.safeParse({ type: 'SymbolInstance', name: 'Row', nameMatch: 'exact', limit: 500 }).success)
	assert.equal(schema.safeParse({ limit: 501 }).success, false)
	assert.equal(schema.safeParse({ type: 'Bogus' }).success, false)
})

test('flows target an artboard id or back, and null removes them', () => {
	assert.ok(node({ flow: { target: 'A1', animation: 'slideFromLeft' } }).success)
	assert.ok(node({ flow: { target: 'back' } }).success)
	assert.ok(node({ flow: null }).success)
	assert.equal(node({ flow: { target: 'A1', animation: 'dissolve' } }).success, false)
	assert.equal(node({ flow: {} }).success, false)
})

test('export presets take known formats and sizes', () => {
	const formats = [
		{ fileFormat: 'png', size: '2x', suffix: '@2x' },
		{ fileFormat: 'jpg', size: '300w', prefix: 'thumb-' },
		{ fileFormat: 'svg' },
		{ fileFormat: 'pdf', size: '0.5x' },
	]
	assert.ok(node({ exportFormats: formats }).success)
	assert.ok(node({ exportFormats: [] }).success)
	assert.equal(node({ exportFormats: [{ fileFormat: 'bmp' }] }).success, false)
	assert.equal(node({ exportFormats: [{ fileFormat: 'png', size: 'large' }] }).success, false)
})

test('overrides take a hex color or swatch for fillColor', () => {
	const overrides = [
		{ layer: 'Accent Color', value: '#ff3b30' },
		{ layer: 'Accent Color', property: 'fillColor', value: { swatch: 'System Colors/systemGreen - Light' } },
		{ id: 'A_stringValue', value: 'Week' },
	]
	assert.ok(node({ kind: 'symbol', overrides }).success)
	assert.equal(node({ kind: 'symbol', overrides: [{ layer: 'X', value: { color: '#fff' } }] }).success, false)
	assert.equal(node({ kind: 'symbol', overrides: [{ layer: 'X', property: 'fill', value: '#fff' }] }).success, false)
})

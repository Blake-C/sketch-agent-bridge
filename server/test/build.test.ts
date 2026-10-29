import assert from 'node:assert/strict'
import { test } from 'node:test'
import { expandBuild } from '../src/build.ts'
import type { BuildNode } from '../src/schemas.ts'

test('expandBuild gives every text node the call textStyle, with group and node keys winning', () => {
	const nodes: BuildNode[] = [
		{
			kind: 'group',
			textStyle: { textColor: '#ffffff', fontSize: 14 },
			children: [
				{ kind: 'text', text: 'A' },
				{ kind: 'text', text: 'B', textStyle: { fontSize: 30 } },
				{ kind: 'rectangle', textStyle: { fontSize: 9 } },
			],
		},
		{ kind: 'text', text: 'C' },
	]
	const [group, outside] = expandBuild(nodes, { fontFamily: 'Avenir', fontSize: 12 })
	assert.equal(group.textStyle, undefined)
	assert.deepEqual(group.children?.[0].textStyle, { fontFamily: 'Avenir', fontSize: 14, textColor: '#ffffff' })
	assert.deepEqual(group.children?.[1].textStyle, { fontFamily: 'Avenir', fontSize: 30, textColor: '#ffffff' })
	assert.deepEqual(group.children?.[2].textStyle, { fontSize: 9 })
	assert.deepEqual(outside.textStyle, { fontFamily: 'Avenir', fontSize: 12 })
})

test('expandBuild leaves nodes alone when no text style is given', () => {
	const nodes: BuildNode[] = [{ kind: 'group', children: [{ kind: 'text', text: 'A' }] }]
	assert.deepEqual(expandBuild(nodes), nodes)
})

test('copyOf copies an earlier node, merges frame and style, and drops the refs inside the source', () => {
	const nodes: BuildNode[] = [
		{
			kind: 'group',
			ref: 'nav',
			name: 'Nav',
			frame: { x: 10, y: 20, width: 30, height: 40 },
			children: [
				{
					kind: 'path',
					name: 'Dot',
					ref: 'dot',
					path: 'M0 0 L1 1',
					style: { fills: ['#ffffff'], opacity: 0.5 },
				},
				{ kind: 'text', name: 'Label', text: 'H' },
			],
		},
		{
			copyOf: 'nav',
			ref: 'nav2',
			name: 'Nav 2',
			frame: { y: 200 },
			children: [
				{ name: 'Dot', style: { fills: ['#000000'] } },
				{ kind: 'text', name: 'Extra', text: 'X' },
			],
		},
	]
	const [, copy] = expandBuild(nodes)
	assert.equal(copy.kind, 'group')
	assert.equal(copy.ref, 'nav2')
	assert.equal(copy.name, 'Nav 2')
	assert.deepEqual(copy.frame, { x: 10, y: 200, width: 30, height: 40 })
	assert.deepEqual(
		copy.children?.map(child => child.name),
		['Dot', 'Label', 'Extra']
	)
	assert.equal(copy.children?.[0].ref, undefined)
	assert.deepEqual(copy.children?.[0].style, { fills: ['#000000'], opacity: 0.5 })
	assert.equal(copy.children?.[0].path, 'M0 0 L1 1')
	assert.equal('copyOf' in copy, false)
})

test('copyOf refuses unknown refs, its own ancestors, and nodes without a kind', () => {
	assert.throws(() => expandBuild([{ copyOf: 'missing' }]), /does not match the ref of an earlier node/)
	assert.throws(
		() => expandBuild([{ kind: 'group', ref: 'outer', children: [{ copyOf: 'outer' }] }]),
		/does not match the ref of an earlier node/
	)
	assert.throws(() => expandBuild([{ name: 'Nothing' }]), /needs a kind or a copyOf/)
	assert.throws(
		() =>
			expandBuild([
				{ kind: 'rectangle', ref: 'a' },
				{ kind: 'oval', ref: 'a' },
			]),
		/used by two nodes/
	)
})

test('a copy of a copy gets the first copy’s changes', () => {
	const [, , third] = expandBuild([
		{ kind: 'rectangle', ref: 'a', frame: { x: 0, y: 0, width: 10, height: 10 } },
		{ copyOf: 'a', ref: 'b', frame: { x: 20 } },
		{ copyOf: 'b', frame: { y: 30 } },
	])
	assert.deepEqual(third.frame, { x: 20, y: 30, width: 10, height: 10 })
})

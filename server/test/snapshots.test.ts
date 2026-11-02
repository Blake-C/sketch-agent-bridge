import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSnapshots, snapshotFromExport, SNAPSHOT_VERSION, type Snapshot } from '../src/snapshots.ts'

const color = (red: number, green: number, blue: number) => ({ red, green, blue, alpha: 1 })

function artboard(
	overrides: { star?: Record<string, unknown>; group?: Record<string, unknown>; label?: Record<string, unknown> } = {}
) {
	return {
		_class: 'artboard',
		do_objectID: 'A',
		name: 'Scene',
		frame: { x: 500, y: 500, width: 200, height: 100 },
		layers: [
			{
				_class: 'group',
				do_objectID: 'G',
				name: 'Group',
				frame: { x: 10, y: 20, width: 50, height: 50 },
				...overrides.group,
				layers: [
					{
						_class: 'shapePath',
						do_objectID: 'S',
						name: 'Star',
						frame: { x: 5, y: 5, width: 10, height: 10 },
						style: { fills: [{ fillType: 0, color: color(1, 0, 0) }] },
						points: [{ point: '{0, 0}', curveFrom: '{0, 0}', curveTo: '{0, 0}' }],
						...overrides.star,
					},
				],
			},
			{
				_class: 'text',
				do_objectID: 'T',
				name: 'Label',
				frame: { x: 0, y: 80, width: 40, height: 10 },
				attributedString: { string: 'Hello' },
				...overrides.label,
			},
		],
	}
}

test('snapshotFromExport places children in artboard coordinates and records their group path', () => {
	const snapshot = snapshotFromExport(artboard())
	assert.equal(snapshot.version, SNAPSHOT_VERSION)
	assert.equal(snapshot.artboard, 'A')
	assert.deepEqual(snapshot.layers.A.frame, [500, 500, 200, 100])
	assert.deepEqual(snapshot.layers.S.frame, [15, 25, 10, 10])
	assert.deepEqual(snapshot.layers.S.path, ['Group', 'Star'])
	assert.deepEqual(snapshot.layers.S.fills, [{ opacity: 1, color: '#FF0000' }])
	assert.equal(snapshot.layers.T.text, 'Hello')
	assert.match(snapshot.layers.S.shape ?? '', /^[0-9a-f]{12}$/)
})

test('diffSnapshots reports no changes for the same artboard', () => {
	assert.deepEqual(diffSnapshots(snapshotFromExport(artboard()), snapshotFromExport(artboard())), [])
})

test('diffSnapshots reports a group move once, on the group', () => {
	const after = snapshotFromExport(artboard({ group: { frame: { x: 40, y: 20, width: 50, height: 50 } } }))
	assert.deepEqual(diffSnapshots(snapshotFromExport(artboard()), after), [
		'Group: moved by +30.0,+0.0 (now at 40.0,20.0)',
	])
})

test('diffSnapshots reports fills, visibility, text, and point edits', () => {
	const after = snapshotFromExport(
		artboard({
			star: {
				style: { fills: [{ fillType: 0, color: color(0, 0, 1) }] },
				isVisible: false,
				points: [{ point: '{1, 0}', curveFrom: '{1, 0}', curveTo: '{1, 0}' }],
			},
			label: { attributedString: { string: 'Bye' } },
		})
	)
	const lines = diffSnapshots(snapshotFromExport(artboard()), after)
	assert.ok(lines.includes('Group / Star: reshaped (points edited)'))
	assert.ok(lines.includes('Group / Star: hidden'))
	assert.ok(
		lines.includes('Group / Star: fills [{"opacity":1,"color":"#FF0000"}] -> [{"opacity":1,"color":"#0000FF"}]')
	)
	assert.ok(lines.includes('Label: text "Hello" -> "Bye"'))
})

test('diffSnapshots reports added layers and stacking order changes', () => {
	const before = snapshotFromExport(artboard())
	const after = snapshotFromExport(artboard())
	after.layers.G.index = 1
	after.layers.T.index = 0
	after.layers.N = { ...after.layers.T, name: 'New', path: ['New'], index: 2 }
	const lines = diffSnapshots(before, after)
	assert.ok(lines.includes('New: added (text) at 0,80 size 40x10'))
	assert.ok(lines.includes('artboard: stacking order changed (Label, Group)'))
})

test('diffSnapshots skips point edits between snapshots of different versions', () => {
	const old: Snapshot = { ...snapshotFromExport(artboard()), version: undefined }
	old.layers.S = { ...old.layers.S, shape: 'aaaaaaaaaaaa' }
	const lines = diffSnapshots(old, snapshotFromExport(artboard()))
	assert.equal(lines.length, 1)
	assert.match(lines[0], /different versions/)
})

test('snapshotFromExport rounds color halves to even, like sketch_sync.py', () => {
	const board = artboard({
		star: { style: { fills: [{ fillType: 0, color: { red: 1, green: 0, blue: 0, alpha: 0.7 } }] } },
	})
	assert.deepEqual(snapshotFromExport(board).layers.S.fills, [{ opacity: 1, color: '#FF0000B2' }])
})

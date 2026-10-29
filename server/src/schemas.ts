import { z } from 'zod'

const ASSET_PATH_RULE =
	'The file must be inside ~/.sketch-agent-bridge or a folder listed in SKETCH_AGENT_BRIDGE_ASSET_DIRS.'

export const documentId = z
	.string()
	.optional()
	.describe('Document id from sketch_status. Defaults to the front document.')

export const hex = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Use #rrggbb or #rrggbbaa')

export const color = z
	.union([
		hex,
		z.object({ swatch: z.string().describe('Swatch name or id, from the document or an enabled library.') }),
	])
	.describe('A hex color, or { "swatch": "<name>" } to link a swatch from get_design_tokens.')
	.meta({ id: 'color' })

const point = z.object({ x: z.number(), y: z.number() })

export const fill = z
	.union([
		color,
		z.object({
			gradient: z.object({
				type: z.enum(['linear', 'radial', 'angular']).optional(),
				from: point
					.optional()
					.describe('Start point as a fraction of the layer size. Default { x: 0.5, y: 0 }.'),
				to: point.optional().describe('End point as a fraction of the layer size. Default { x: 0.5, y: 1 }.'),
				stops: z.array(z.object({ position: z.number().min(0).max(1), color })).min(2),
			}),
		}),
		z.object({
			image: z
				.string()
				.describe(`Absolute path to an image file, such as one from fetch_images. ${ASSET_PATH_RULE}`),
			mode: z.enum(['fill', 'fit', 'tile', 'stretch']).optional(),
		}),
	])
	.describe('A color, a gradient, or an image fill.')
	.meta({ id: 'fill' })

const shadow = z
	.object({
		color,
		x: z.number().optional(),
		y: z.number().optional(),
		blur: z.number().min(0).optional(),
		spread: z.number().optional(),
	})
	.meta({ id: 'shadow' })

const blendingModes = [
	'Normal',
	'Darken',
	'Multiply',
	'ColorBurn',
	'Lighten',
	'Screen',
	'ColorDodge',
	'Overlay',
	'SoftLight',
	'HardLight',
	'Difference',
	'Exclusion',
	'Hue',
	'Saturation',
	'Color',
	'Luminosity',
] as const

const arrowhead = z.enum([
	'None',
	'OpenArrow',
	'FilledArrow',
	'Line',
	'OpenCircle',
	'FilledCircle',
	'OpenSquare',
	'FilledSquare',
])

const lineDecoration = z.enum(['none', 'single', 'double', 'thick'])

export const style = z
	.object({
		fills: z.array(fill).optional(),
		borders: z
			.array(
				z.object({
					color,
					thickness: z.number().min(0).optional(),
					position: z.enum(['Inside', 'Center', 'Outside']).optional(),
				})
			)
			.optional(),
		shadows: z.array(shadow).optional(),
		innerShadows: z.array(shadow).optional(),
		blur: z
			.object({
				type: z.enum(['Gaussian', 'Motion', 'Zoom', 'Background']).optional().describe('Default Gaussian.'),
				radius: z.number().min(0).optional().describe('Default 10.'),
				motionAngle: z.number().optional().describe('Angle in degrees, for Motion blur.'),
			})
			.nullable()
			.optional()
			.describe('Layer blur. Background blurs what is behind the layer. null turns blur off.'),
		colorControls: z
			.object({
				hue: z.number().min(-180).max(180).optional().describe('Hue rotation in degrees. Default 0.'),
				saturation: z.number().min(0).max(2).optional().describe('0 is gray, 1 is unchanged. Default 1.'),
				brightness: z.number().min(-1).max(1).optional().describe('-1 is black, 0 is unchanged. Default 0.'),
				contrast: z.number().min(0).max(4).optional().describe('1 is unchanged. Default 1.'),
			})
			.nullable()
			.optional()
			.describe(
				"Sketch's Color Adjust, for image layers only. It stays editable in Sketch. Keys left out are reset to their defaults, and null turns it off."
			),
		blendingMode: z.enum(blendingModes).optional(),
		borderOptions: z
			.object({
				dashPattern: z
					.array(z.number().min(0))
					.max(4)
					.optional()
					.describe('Dash and gap lengths, such as [4, 2]. An empty list draws a solid line.'),
				lineEnd: z.enum(['Butt', 'Round', 'Projecting']).optional(),
				lineJoin: z.enum(['Miter', 'Round', 'Bevel']).optional(),
				startArrowhead: arrowhead.optional(),
				endArrowhead: arrowhead.optional(),
			})
			.optional()
			.describe('Dashes, line caps, joins, and arrowheads for every border. Keys left out are unchanged.'),
		opacity: z.number().min(0).max(1).optional(),
	})
	.meta({ id: 'style' })
	.optional()
	.describe('Replaces the listed style parts. Parts left out are unchanged.')

export const textStyle = z
	.object({
		fontFamily: z.string().optional(),
		fontSize: z.number().positive().optional(),
		fontWeight: z
			.number()
			.int()
			.min(0)
			.max(12)
			.optional()
			.describe('Sketch weight scale, 5 is regular, 9 is bold.'),
		fontStyle: z.enum(['italic']).optional(),
		fontStretch: z.enum(['compressed', 'condensed', 'narrow', 'expanded', 'poster']).optional(),
		fontAxes: z
			.record(z.string(), z.number())
			.optional()
			.describe(
				'Variable font axes by name, such as { "Weight": 700, "Width": 80 }. get_layer shows the axes a text layer has.'
			),
		lineHeight: z.number().positive().optional(),
		kerning: z.number().optional(),
		paragraphSpacing: z.number().optional(),
		alignment: z.enum(['left', 'right', 'center', 'justified']).optional(),
		verticalAlignment: z.enum(['top', 'center', 'bottom']).optional(),
		textTransform: z.enum(['none', 'uppercase', 'lowercase']).optional(),
		textColor: color.optional(),
		textUnderline: lineDecoration.optional(),
		textStrikethrough: lineDecoration.optional(),
	})
	.meta({ id: 'textStyle' })
	.optional()

export const textRuns = z
	.array(
		z.object({
			text: z
				.string()
				.optional()
				.describe('The first place this text appears is styled. Use this, or start and length.'),
			start: z.number().int().min(0).optional().describe('Index of the first character to style.'),
			length: z.number().int().min(1).optional(),
			fontFamily: z.string().optional(),
			fontWeight: z
				.number()
				.int()
				.min(0)
				.max(12)
				.optional()
				.describe('Sketch weight scale, 5 is regular, 9 is bold.'),
			fontSize: z.number().positive().optional(),
			fontStyle: z.enum(['italic', 'normal']).optional(),
			textColor: color.optional(),
			textUnderline: lineDecoration.optional(),
			textStrikethrough: lineDecoration.optional(),
		})
	)
	.describe(
		'For text. Styles part of the text, such as one bold word. Setting text or textStyle restyles the whole text, so runs in the same request are applied after them.'
	)
	.meta({ id: 'textRuns' })

export const frame = z.object({
	x: z.number().optional(),
	y: z.number().optional(),
	width: z.number().positive().optional(),
	height: z.number().positive().optional(),
})

export const overrides = z
	.array(
		z.object({
			id: z.string().optional().describe('Override id. Use this or layer.'),
			layer: z.string().optional().describe('Name of the layer inside the symbol.'),
			property: z
				.enum(['stringValue', 'symbolID', 'image', 'layerStyle', 'textStyle', 'fillColor'])
				.optional()
				.describe('Needed only when one layer has several overridable properties.'),
			value: z
				.union([z.string(), z.object({ swatch: z.string() })])
				.describe(
					'Text, a symbol name for symbolID, an absolute image path for image, or a hex color or { "swatch": "<name>" } for fillColor. A color value picks the fillColor override when matching by layer name.'
				),
		})
	)
	.describe('Overrides on a symbol instance, matched by override id or by layer name.')

export const editableOverrides = z
	.array(
		z.object({
			id: z.string().optional().describe('Override id. Use this or layer.'),
			layer: z.string().optional().describe('Name of the layer inside the symbol master.'),
			property: z
				.enum(['stringValue', 'symbolID', 'image', 'layerStyle', 'textStyle', 'fillColor'])
				.optional()
				.describe('Without it, every override on the layer changes.'),
			editable: z.boolean(),
		})
	)
	.describe(
		'For a symbol master. Sets whether instances can change each override, matched by override id or by layer name. list_symbols with includeOverrides lists the overrides.'
	)

export const render = {
	render: z
		.enum(['none', 'layer', 'artboard'])
		.optional()
		.describe('What to render as a PNG in the reply. "none" saves the most tokens.'),
	scale: z.number().min(0.25).max(2).optional().describe('PNG scale. Default 1.'),
	verbose: z.boolean().optional().describe('Return the full layer spec instead of id, name, type, and frame.'),
}

export const relativeTo = z
	.enum(['parent', 'artboard'])
	.optional()
	.describe(
		'What frame positions and path coordinates are measured from. "artboard" uses the artboard or symbol master holding the parent, or the page when there is none, so nested group origins do not need adding up. Default parent.'
	)

export const layout = {
	smartLayout: z
		.enum(['LeftToRight', 'HorizontallyCenter', 'RightToLeft', 'TopToBottom', 'VerticallyCenter', 'BottomToTop'])
		.nullable()
		.optional()
		.describe(
			'Smart layout for a group or symbol master, so it resizes around its content. null turns it off. A symbol instance resizes when its overrides change.'
		),
	rotation: z.number().optional().describe('Rotation in degrees.'),
	flipHorizontal: z.boolean().optional(),
	flipVertical: z.boolean().optional(),
	mask: z
		.boolean()
		.optional()
		.describe(
			"For a shape or image. Clips the layers above it in the same group or artboard to its shape. Put the mask first in a group with the layers it clips, so it clips nothing else. Sketch also draws the mask's fill, so give it fills: [] when it should only clip. false removes the mask."
		),
	breaksMask: z
		.boolean()
		.optional()
		.describe('Stops a mask lower in the same group from clipping this layer and the layers above it.'),
	resizing: z
		.object({
			pinLeft: z.boolean().optional(),
			pinRight: z.boolean().optional(),
			pinTop: z.boolean().optional(),
			pinBottom: z.boolean().optional(),
			fixWidth: z.boolean().optional(),
			fixHeight: z.boolean().optional(),
		})
		.optional()
		.describe(
			'How the layer resizes when its group, artboard, or symbol instance is resized. pin keeps the distance to that edge, and fix keeps the size. A layer pinned to both sides cannot also fix that size. Keys left out are unchanged.'
		),
	layoutGrid: z
		.object({
			columns: z
				.object({
					count: z.number().int().min(1),
					gutterWidth: z.number().min(0),
					columnWidth: z
						.number()
						.positive()
						.optional()
						.describe('Give this or totalWidth. Without either, the columns fill the artboard width.'),
					totalWidth: z.number().positive().optional(),
					offset: z.number().optional().describe('Distance from the left edge. Default centers the columns.'),
					guttersOutside: z
						.boolean()
						.optional()
						.describe('Adds half a gutter outside the first and last columns. Default false.'),
				})
				.optional(),
			rows: z
				.object({
					gutterHeight: z.number().positive(),
					rowHeightMultiplier: z.number().int().min(1).describe('Each row is this many gutter heights tall.'),
				})
				.optional(),
		})
		.nullable()
		.optional()
		.describe(
			'For artboards and symbol masters. The column and row layout grid shown in Sketch. Replaces the whole layout grid, and null turns it off.'
		),
	grid: z
		.object({
			size: z.number().positive(),
			thickEvery: z.number().int().min(0).optional().describe('Draws a thick line every this many cells.'),
		})
		.nullable()
		.optional()
		.describe('For artboards and symbol masters. The square grid shown in Sketch. null turns it off.'),
}

export const booleanOperation = z
	.enum(['none', 'union', 'subtract', 'intersect', 'difference'])
	.describe(
		'How a part of a combined shape joins the parts below it. The bottom part is the base, so subtract cuts each part from the parts below it.'
	)

export const order = z
	.union([
		z.enum(['front', 'back', 'forward', 'backward']),
		z.number().int().min(0),
		z.object({ above: z.string() }).strict(),
		z.object({ below: z.string() }).strict(),
	])
	.describe(
		'Move the layer within its parent: front, back, forward, backward, an index where 0 is the back, or { above: id } or { below: id } to sit next to a sibling.'
	)

export const buildOrder = z
	.union([
		z.enum(['front', 'back']),
		z.number().int().min(0),
		z.object({ above: z.string() }).strict(),
		z.object({ below: z.string() }).strict(),
	])
	.describe(
		'Where the root nodes go in the parent: front, back, an index where 0 is the back, or { above: id } or { below: id } to sit next to a sibling. The roots keep their order among themselves. Default front.'
	)

export const prototypeAndExport = {
	flow: z
		.object({
			target: z.string().describe('Artboard id to go to, or "back" to return to the previous artboard.'),
			animation: z
				.enum(['none', 'slideFromRight', 'slideFromLeft', 'slideFromBottom', 'slideFromTop'])
				.optional()
				.describe('Default slideFromRight.'),
		})
		.nullable()
		.optional()
		.describe('Prototype link from this layer. null removes it.'),
	flowStartPoint: z.boolean().optional().describe('For artboards. Marks the artboard as a prototype start point.'),
	exportFormats: z
		.array(
			z.object({
				fileFormat: z.enum(['png', 'jpg', 'tiff', 'webp', 'gif', 'pdf', 'eps', 'svg']),
				size: z
					.string()
					.regex(
						/^\d+(\.\d+)?(x|w|h)$/,
						'Use a scale such as "2x", a width such as "300w", or a height such as "200h"'
					)
					.optional()
					.describe('Default "1x".'),
				prefix: z.string().optional(),
				suffix: z.string().optional(),
			})
		)
		.optional()
		.describe("Export presets shown in Sketch's export panel. Replaces the layer's presets, and [] removes them."),
}

export const lineSpacing = z
	.enum(['natural', 'system', 'variable', 'constantBaseline'])
	.describe('For text. How Sketch spaces lines. Default natural.')

export const svgPath = z
	.string()
	.describe(
		'SVG path data, such as "M0 0 L100 0 L50 80 Z", in the coordinates of the parent. The layer frame fits the path.'
	)

export const fixedWidth = z
	.boolean()
	.describe('For text. true wraps text at the frame width, false makes the layer grow with its text.')

const layerKinds = [
	'artboard',
	'rectangle',
	'oval',
	'triangle',
	'polygon',
	'star',
	'path',
	'text',
	'group',
	'symbol',
	'svg',
	'image',
	'hotspot',
	'slice',
] as const

const layerFields = {
	kind: z
		.enum(layerKinds)
		.describe(
			'"hotspot" is an invisible clickable area for a prototype, and it needs a flow. "slice" marks an area of the canvas to export, set with exportFormats, and has no style.'
		),
	name: z.string().optional(),
	frame: frame
		.optional()
		.describe(
			'Relative to the parent. Text with a width gets a fixed width. For kind "path", only the given keys move or resize the path.'
		),
	fixedWidth: fixedWidth.optional(),
	lineSpacing: lineSpacing.optional(),
	path: svgPath
		.optional()
		.describe(
			'SVG path data, for kind "path". Coordinates are in the parent. Several subpaths make a Shape with one part per subpath.'
		),
	cornerRadius: z.number().min(0).optional(),
	text: z.string().optional(),
	textRuns: textRuns.optional(),
	svg: z
		.string()
		.optional()
		.describe(
			'SVG markup, for kind "svg". The viewBox maps onto the frame. Given only a width or only a height, the other follows the viewBox shape. Sketch trims empty space, so the layer ends up the size of the drawing, placed where the drawing sits in the viewBox.'
		),
	svgFile: z
		.string()
		.optional()
		.describe(`Absolute path to a .svg file, for kind "svg", used in place of svg. ${ASSET_PATH_RULE}`),
	image: z.string().optional().describe(`Absolute path to an image file, for kind "image". ${ASSET_PATH_RULE}`),
	symbol: z
		.string()
		.optional()
		.describe('Symbol master name, id, or symbolId, for kind "symbol". Names from list_libraries work too.'),
	overrides: overrides.optional(),
	sharedStyle: z
		.string()
		.optional()
		.describe('Shared layer or text style name or id to link. Names from list_libraries work too.'),
	style,
	textStyle,
	hidden: z.boolean().optional(),
	...layout,
	...prototypeAndExport,
}

export const layerInput = z.object(layerFields)

export const MAX_UPDATES = 200

export const updateFields = {
	id: z.string(),
	parentId: z
		.string()
		.optional()
		.describe(
			'Move the layer into this artboard, group, or page. It keeps its place on the canvas, and frame is then relative to the new parent. Artboards move only between pages.'
		),
	name: z.string().optional(),
	hidden: z.boolean().optional(),
	locked: z.boolean().optional(),
	frame: frame
		.optional()
		.describe('Only the given keys change. With svg or svgFile, it is the frame the new viewBox maps onto.'),
	relativeTo,
	text: z.string().optional(),
	textRuns: textRuns.optional(),
	fixedWidth: fixedWidth.optional(),
	lineSpacing: lineSpacing.optional(),
	cornerRadius: z.number().min(0).optional(),
	path: svgPath
		.optional()
		.describe(
			'Replaces the points of a path layer, or the parts of a Shape. Coordinates are in the parent. A single path layer refuses data with several subpaths.'
		),
	svg: z
		.string()
		.optional()
		.describe(
			"Replaces the drawing of a layer made from SVG with new markup. The new layer takes the old one's place in the layer list, name, visibility, lock, and its own style, such as shadows, and gets a new id, which the reply gives. The viewBox maps onto the old layer's frame unless frame is given, and Sketch trims empty space the same way it does for a new svg layer."
		),
	svgFile: z.string().optional().describe(`Absolute path to a .svg file, used in place of svg. ${ASSET_PATH_RULE}`),
	symbol: z
		.string()
		.optional()
		.describe('Swap a symbol instance to another master, by name or id. Library symbol names work too.'),
	overrides: overrides.optional(),
	editableOverrides: editableOverrides.optional(),
	style,
	textStyle,
	...layout,
	booleanOperation: booleanOperation.optional().describe('For a part of a combined shape.'),
	...prototypeAndExport,
	order: order.optional(),
}

export type BuildNode = Omit<z.infer<typeof layerInput>, 'kind'> & {
	kind?: (typeof layerKinds)[number] | 'shape'
	ref?: string
	copyOf?: string
	booleanOperation?: z.infer<typeof booleanOperation>
	children?: BuildNode[]
}

export const buildNode: z.ZodType<BuildNode> = z.lazy(() =>
	z.object({
		...layerFields,
		kind: z
			.enum([...layerKinds, 'shape'])
			.optional()
			.describe(
				'"hotspot" is an invisible clickable area for a prototype, and it needs a flow. "slice" marks an area of the canvas to export, set with exportFormats, and has no style. "shape" combines its children, which must be shapes or paths, into one shape with boolean operations. Needed unless copyOf is given.'
			),
		ref: z
			.string()
			.optional()
			.describe(
				'A label. The reply maps each ref to the created layer id. Set it on any layer a later call may change, because the reply gives no other ids below the roots.'
			),
		copyOf: z
			.string()
			.optional()
			.describe(
				"The ref of an earlier node in this call to copy, with its children. Fields given here replace the source's, and frame, style, and textStyle are merged key by key. Children given here are merged into the source child with the same name, or added after the source's children when no name matches. Refs inside the source are not copied."
			),
		textStyle: textStyle.describe(
			"For text. On a group or artboard node, the default text style for the text nodes inside it, where a text node's own keys win."
		),
		booleanOperation: booleanOperation.optional().describe('For a child of a shape node. Default none.'),
		children: z.array(buildNode).optional().describe('Child layers, for kind "group", "artboard", or "shape".'),
	})
)

export const findInput = {
	pageId: z.string().optional().describe('Search only this page. Defaults to every page.'),
	parentId: z
		.string()
		.optional()
		.describe('Search only inside this artboard or group, at any depth. Used in place of pageId.'),
	type: z
		.enum([
			'Artboard',
			'Group',
			'Text',
			'ShapePath',
			'Shape',
			'Image',
			'SymbolInstance',
			'SymbolMaster',
			'HotSpot',
			'Slice',
		])
		.optional(),
	name: z.string().optional().describe('Layer name to match. Case-insensitive unless nameMatch is exact.'),
	nameMatch: z.enum(['contains', 'exact']).optional().describe('Default contains.'),
	text: z.string().optional().describe('Text that a text layer contains, case-insensitive.'),
	symbol: z.string().optional().describe('Symbol master name, id, or symbolId, to find its instances.'),
	sharedStyle: z
		.string()
		.optional()
		.describe('Shared layer or text style name or id, to find the layers linked to it.'),
	swatch: z
		.string()
		.optional()
		.describe(
			'Swatch name or id, to find the layers whose fills, borders, shadows, text color, artboard background, or color overrides use it.'
		),
	limit: z.number().int().min(1).max(500).optional().describe('Most layers to return. Default 50.'),
}

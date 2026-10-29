const GRID_TYPES = ['Artboard', 'SymbolMaster']

function assertGridLayer(layer) {
	if (!GRID_TYPES.includes(layer.type)) throw new Error('Only artboards and symbol masters have grids')
}

function gutterCount(columns) {
	return columns.guttersOutside ? columns.count : columns.count - 1
}

function totalWidth(layer, columns) {
	if (columns.columnWidth !== undefined && columns.totalWidth !== undefined) {
		throw new Error('Give columnWidth or totalWidth, not both')
	}
	if (columns.columnWidth !== undefined) {
		return columns.count * columns.columnWidth + gutterCount(columns) * columns.gutterWidth
	}
	return columns.totalWidth !== undefined ? columns.totalWidth : layer.frame.width
}

// Sketch's layout grid setters recalculate the values that were not set, so the total width is set before the gutter width, and Sketch works out the column width from the number of columns, the total width, and the gutter width.
function setColumns(layer, grid, columns) {
	const total = totalWidth(layer, columns)
	if (total - gutterCount(columns) * columns.gutterWidth <= 0) {
		throw new Error('The gutters take up the whole width, so the columns would have no width')
	}
	grid.setGuttersOutside(Boolean(columns.guttersOutside))
	grid.setNumberOfColumns(columns.count)
	grid.setTotalWidth(total)
	grid.setGutterWidth(columns.gutterWidth)
	grid.setHorizontalOffset(columns.offset !== undefined ? columns.offset : (layer.frame.width - total) / 2)
}

function setLayoutGrid(layer, input) {
	assertGridLayer(layer)
	const native = layer.sketchObject
	if (input === null) {
		if (native.layout()) native.layout().setIsEnabled(false)
		return
	}
	const grid = MSLayoutGrid.alloc().init()
	grid.setIsEnabled(true)
	grid.setDrawVertical(Boolean(input.columns))
	if (input.columns) setColumns(layer, grid, input.columns)
	grid.setDrawHorizontal(Boolean(input.rows))
	if (input.rows) {
		grid.setGutterHeight(input.rows.gutterHeight)
		grid.setRowHeightMultiplication(input.rows.rowHeightMultiplier)
	}
	native.setLayout(grid)
}

function setGrid(layer, input) {
	assertGridLayer(layer)
	const native = layer.sketchObject
	if (input === null) {
		if (native.grid()) native.grid().setIsEnabled(false)
		return
	}
	const grid = MSSimpleGrid.alloc().init()
	grid.setIsEnabled(true)
	grid.setGridSize(input.size)
	grid.setThickGridTimes(input.thickEvery || 0)
	native.setGrid(grid)
}

function layoutGridSpec(layer) {
	if (!GRID_TYPES.includes(layer.type)) return undefined
	const grid = layer.sketchObject.layout()
	if (!grid || !grid.isEnabled()) return undefined
	const spec = {}
	if (grid.drawVertical()) {
		spec.columns = {
			count: Number(grid.numberOfColumns()),
			columnWidth: Number(grid.columnWidth()),
			gutterWidth: Number(grid.gutterWidth()),
			totalWidth: Number(grid.totalWidth()),
			offset: Number(grid.horizontalOffset()),
		}
		if (grid.guttersOutside()) spec.columns.guttersOutside = true
	}
	if (grid.drawHorizontal()) {
		spec.rows = {
			gutterHeight: Number(grid.gutterHeight()),
			rowHeightMultiplier: Number(grid.rowHeightMultiplication()),
		}
	}
	return Object.keys(spec).length ? spec : undefined
}

function gridSpec(layer) {
	if (!GRID_TYPES.includes(layer.type)) return undefined
	const grid = layer.sketchObject.grid()
	if (!grid || !grid.isEnabled()) return undefined
	const spec = { size: Number(grid.gridSize()) }
	if (Number(grid.thickGridTimes()) > 0) spec.thickEvery = Number(grid.thickGridTimes())
	return spec
}

module.exports = { setLayoutGrid, setGrid, layoutGridSpec, gridSpec }

const sketch = require('sketch')
const { makeDir, listDir, moveFile } = require('./files.js')

const FORMATS = ['png', 'svg', 'json']

// CGImageCreateWithImageInRect measures from the top-left corner in pixels, the same way Sketch lays out a frame.
function cropPng(path, region, scale) {
	const bitmap = NSBitmapImageRep.imageRepWithData(NSData.dataWithContentsOfFile(path))
	if (!bitmap) throw new Error('Could not read the exported PNG at ' + path)
	const cropped = CGImageCreateWithImageInRect(
		bitmap.CGImage(),
		CGRectMake(region.x * scale, region.y * scale, region.width * scale, region.height * scale)
	)
	if (!cropped) throw new Error('The region does not overlap the layer')
	const png = NSBitmapImageRep.alloc().initWithCGImage(cropped).representationUsingType_properties(NSPNGFileType, {})
	png.writeToFile_atomically(path, true)
}

function exportLayers(layers, dir, formats, scale, options) {
	const extra = options || {}
	const wanted = (formats || ['png']).filter(format => FORMATS.includes(format))
	const pngScale = scale || 2
	const exported = []
	layers.forEach(layer => {
		if (layer.type === 'Page') return
		const layerDir = dir + '/' + layer.id
		makeDir(layerDir)
		wanted.forEach(format => {
			const settings = {
				'formats': format,
				'scales': format === 'png' ? String(pngScale) : '1',
				'output': layerDir,
				'overwriting': true,
				'use-id-for-name': true,
				'save-for-web': true,
			}
			if (extra.trimmed !== undefined) settings.trimmed = extra.trimmed
			if (extra.region) settings.trimmed = false
			if (extra.background !== undefined) settings.background = extra.background
			sketch.export(layer, settings)
		})
		listDir(layerDir).forEach(name => {
			const format = name.split('.').pop().toLowerCase()
			if (!wanted.includes(format)) return
			let path = layerDir + '/' + name
			// Sketch's file name can show another scale than the one used, such as @1x for 1.5.
			if (format === 'png') {
				const named = layerDir + '/' + layer.id + '@' + pngScale + 'x.png'
				if (named !== path) moveFile(path, named)
				path = named
				if (extra.region) cropPng(path, extra.region, pngScale)
			}
			exported.push({ layerId: layer.id, format, path })
		})
	})
	return exported
}

module.exports = { exportLayers }

const sketch = require('sketch')
const { makeDir, listDir } = require('./files.js')

const FORMATS = ['png', 'svg']

function exportLayers(layers, dir, formats, scale) {
	const wanted = (formats || ['png']).filter(format => FORMATS.includes(format))
	const exported = []
	layers.forEach(layer => {
		if (layer.type === 'Page') return
		const layerDir = dir + '/' + layer.id
		makeDir(layerDir)
		wanted.forEach(format => {
			sketch.export(layer, {
				'formats': format,
				'scales': format === 'png' ? String(scale || 2) : '1',
				'output': layerDir,
				'overwriting': true,
				'use-id-for-name': true,
				'save-for-web': true,
			})
		})
		listDir(layerDir).forEach(name => {
			const format = name.split('.').pop().toLowerCase()
			if (wanted.includes(format)) exported.push({ layerId: layer.id, format, path: layerDir + '/' + name })
		})
	})
	return exported
}

module.exports = { exportLayers }

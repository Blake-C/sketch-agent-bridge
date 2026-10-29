const sketch = require('sketch')
const { makeDir, listDir } = require('./files.js')

const FORMATS = ['png', 'svg', 'json']

function exportLayers(layers, dir, formats, scale, options) {
	const extra = options || {}
	const wanted = (formats || ['png']).filter(format => FORMATS.includes(format))
	const exported = []
	layers.forEach(layer => {
		if (layer.type === 'Page') return
		const layerDir = dir + '/' + layer.id
		makeDir(layerDir)
		wanted.forEach(format => {
			const settings = {
				'formats': format,
				'scales': format === 'png' ? String(scale || 2) : '1',
				'output': layerDir,
				'overwriting': true,
				'use-id-for-name': true,
				'save-for-web': true,
			}
			if (extra.trimmed !== undefined) settings.trimmed = extra.trimmed
			if (extra.background !== undefined) settings.background = extra.background
			sketch.export(layer, settings)
		})
		listDir(layerDir).forEach(name => {
			const format = name.split('.').pop().toLowerCase()
			if (wanted.includes(format)) exported.push({ layerId: layer.id, format, path: layerDir + '/' + name })
		})
	})
	return exported
}

module.exports = { exportLayers }

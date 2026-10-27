const { resolveDocument } = require('../document.js')
const { styleSpec, textStyleSpec, swatchNames, swatchId } = require('../spec.js')

function tokens(args) {
	const document = resolveDocument(args)
	const swatches = swatchNames(document)
	return {
		result: {
			swatches: (document.swatches || []).map(swatch => ({
				id: swatchId(swatch),
				name: swatch.name,
				color: swatch.color,
			})),
			documentColors: (document.colors || []).map(asset => ({
				name: asset.name || undefined,
				color: asset.color,
			})),
			textStyles: document.sharedTextStyles.map(shared => ({
				id: shared.id,
				name: shared.name,
				textStyle: textStyleSpec(shared.style),
			})),
			layerStyles: document.sharedLayerStyles.map(shared => ({
				id: shared.id,
				name: shared.name,
				style: styleSpec(shared.style, swatches),
			})),
			symbols: document.getSymbols().map(master => ({
				id: master.id,
				symbolId: master.symbolId,
				name: master.name,
				width: master.frame.width,
				height: master.frame.height,
			})),
		},
	}
}

module.exports = { tokens }

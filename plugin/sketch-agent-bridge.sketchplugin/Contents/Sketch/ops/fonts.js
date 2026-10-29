const { standardize } = require('../files.js')

const COLLECTION_NAME = 'Google Fonts'
const FONTS_DIR = standardize('~/Library/Fonts')
const USER_VISIBILITY = 2
const PROCESS_SCOPE = 1
const FAMILY_ATTRIBUTE = 'NSFontFamilyAttribute'
const STYLE_NAME = 1
const WEIGHT = 2
const TRAITS = 3

function toArray(list) {
	const items = []
	if (!list) return items
	for (let index = 0; index < list.count(); index++) items.push(list.objectAtIndex(index))
	return items
}

function faces(family) {
	return toArray(NSFontManager.sharedFontManager().availableMembersOfFontFamily(family))
		.map(member => ({
			style: String(member.objectAtIndex(STYLE_NAME)),
			weight: Number(member.objectAtIndex(WEIGHT)),
			italic: Boolean(Number(member.objectAtIndex(TRAITS)) & NSFontItalicTrait) || undefined,
		}))
		.sort((a, b) => a.weight - b.weight || Number(Boolean(a.italic)) - Number(Boolean(b.italic)))
}

function collectionFamilies() {
	const collection = NSFontCollection.fontCollectionWithName_visibility(COLLECTION_NAME, USER_VISIBILITY)
	if (!collection) return []
	return toArray(collection.queryDescriptors())
		.map(descriptor => descriptor.objectForKey(FAMILY_ATTRIBUTE))
		.filter(Boolean)
		.map(String)
}

function fonts(args) {
	const families = toArray(NSFontManager.sharedFontManager().availableFontFamilies()).map(String)
	const collected = collectionFamilies()
	if (!args.family) return { result: { families, googleFonts: collected } }
	const query = String(args.family).toLowerCase()
	return {
		result: {
			families: families
				.filter(family => family.toLowerCase().includes(query))
				.map(family => ({
					family,
					googleFonts: collected.includes(family) || undefined,
					faces: faces(family),
				})),
		},
	}
}

// macOS activates new files in ~/Library/Fonts on its own, but a running Sketch can take a while to list them, so they are also registered for Sketch's process.
// Registering fails harmlessly when macOS has already activated the file.
function activate(path) {
	framework('CoreText')
	CTFontManagerRegisterFontsForURL(NSURL.fileURLWithPath(path), PROCESS_SCOPE, null)
}

function collectFonts(args) {
	const family = String(args.family || '')
	if (!family) throw new Error('collectFonts needs a family')
	const files = (args.files || []).map(String)
	files.forEach(file => {
		const path = standardize(file)
		if (!path.startsWith(FONTS_DIR + '/') || !/\.(ttf|otf)$/i.test(path)) {
			throw new Error(file + ' is not a font file in ~/Library/Fonts')
		}
		activate(path)
	})
	// Saving replaces the whole collection, so the families already in it are written back with the new one.
	const descriptors = collectionFamilies()
		.filter(name => name !== family)
		.concat([family])
		.map(name => NSFontDescriptor.fontDescriptorWithFontAttributes({ [FAMILY_ATTRIBUTE]: name }))
	const error = MOPointer.alloc().init()
	const saved = NSFontCollection.showFontCollection_withName_visibility_error(
		NSFontCollection.fontCollectionWithDescriptors(descriptors),
		COLLECTION_NAME,
		USER_VISIBILITY,
		error
	)
	if (!saved || error.value()) {
		const reason = error.value() ? ': ' + String(error.value().localizedDescription()) : ''
		throw new Error('macOS did not save the ' + COLLECTION_NAME + ' font collection' + reason)
	}
	return { result: { family, collection: COLLECTION_NAME, faces: faces(family) } }
}

module.exports = { fonts, collectFonts }

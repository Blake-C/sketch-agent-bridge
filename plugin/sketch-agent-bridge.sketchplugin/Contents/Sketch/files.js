const BRIDGE_DIR = String(
	NSString.stringWithString(NSHomeDirectory() + '/.sketch-agent-bridge').stringByStandardizingPath()
)

function standardize(path) {
	return String(NSString.stringWithString(path).stringByExpandingTildeInPath().stringByStandardizingPath())
}

function isInsideBridgeDir(path) {
	return standardize(path).startsWith(BRIDGE_DIR + '/')
}

function makeDir(path) {
	NSFileManager.defaultManager().createDirectoryAtPath_withIntermediateDirectories_attributes_error(
		path,
		true,
		null,
		null
	)
}

function writeText(path, text) {
	NSString.stringWithString(text).writeToFile_atomically_encoding_error(path, true, NSUTF8StringEncoding, null)
}

function listDir(path) {
	const names = NSFileManager.defaultManager().contentsOfDirectoryAtPath_error(path, null)
	if (!names) return []
	const result = []
	for (let i = 0; i < names.count(); i++) result.push(String(names.objectAtIndex(i)))
	return result
}

module.exports = { BRIDGE_DIR, standardize, isInsideBridgeDir, makeDir, writeText, listDir }

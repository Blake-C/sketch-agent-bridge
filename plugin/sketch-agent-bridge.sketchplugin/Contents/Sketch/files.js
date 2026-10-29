const BRIDGE_DIR = String(
	NSString.stringWithString(NSHomeDirectory() + '/.sketch-agent-bridge').stringByStandardizingPath()
)

function standardize(path) {
	return String(NSString.stringWithString(path).stringByExpandingTildeInPath().stringByStandardizingPath())
}

// Only the current user's home is expanded, so ~otheruser/ stays a relative path and is refused.
function expandHome(path) {
	const text = String(path)
	return text.startsWith('~/') ? String(NSString.stringWithString(text).stringByExpandingTildeInPath()) : text
}

function isInsideBridgeDir(path) {
	return standardize(path).startsWith(BRIDGE_DIR + '/')
}

let assetDirs = []

function resolveLinks(path) {
	return String(NSString.stringWithString(path).stringByResolvingSymlinksInPath())
}

function setAssetDirs(dirs) {
	assetDirs = (Array.isArray(dirs) ? dirs : [])
		.map(String)
		.filter(dir => dir.startsWith('/'))
		.map(resolveLinks)
}

function assertAllowedAsset(path) {
	const resolved = resolveLinks(String(path))
	const allowed = [resolveLinks(BRIDGE_DIR), ...assetDirs]
	if (!allowed.some(dir => resolved.startsWith(dir + '/'))) {
		throw new Error(
			path +
				' is outside ~/.sketch-agent-bridge and the folders in SKETCH_AGENT_BRIDGE_ASSET_DIRS. Add its folder to SKETCH_AGENT_BRIDGE_ASSET_DIRS where the MCP server is registered.'
		)
	}
}

const PRIVATE_DIR = { NSFilePosixPermissions: 0o700 }
const PRIVATE_FILE = { NSFilePosixPermissions: 0o600 }

function makeDir(path) {
	NSFileManager.defaultManager().createDirectoryAtPath_withIntermediateDirectories_attributes_error(
		path,
		true,
		PRIVATE_DIR,
		null
	)
}

function writeText(path, text) {
	NSString.stringWithString(text).writeToFile_atomically_encoding_error(path, true, NSUTF8StringEncoding, null)
	NSFileManager.defaultManager().setAttributes_ofItemAtPath_error(PRIVATE_FILE, path, null)
}

function readText(path) {
	const text = NSString.stringWithContentsOfFile_encoding_error(path, NSUTF8StringEncoding, null)
	if (!text) throw new Error('Could not read ' + path)
	return String(text)
}

function listDir(path) {
	const names = NSFileManager.defaultManager().contentsOfDirectoryAtPath_error(path, null)
	if (!names) return []
	const result = []
	for (let i = 0; i < names.count(); i++) result.push(String(names.objectAtIndex(i)))
	return result
}

function moveFile(from, to) {
	const manager = NSFileManager.defaultManager()
	if (manager.fileExistsAtPath(to)) manager.removeItemAtPath_error(to, null)
	if (!manager.moveItemAtPath_toPath_error(from, to, null)) throw new Error('Could not move ' + from + ' to ' + to)
}

module.exports = {
	expandHome,
	moveFile,
	BRIDGE_DIR,
	standardize,
	isInsideBridgeDir,
	setAssetDirs,
	assertAllowedAsset,
	makeDir,
	readText,
	writeText,
	listDir,
}

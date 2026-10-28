import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const cocoaGlobals = {
	framework: 'readonly',
	MSColor: 'readonly',
	NSImage: 'readonly',
	NSTextAlignmentCenter: 'readonly',
	NSFileManager: 'readonly',
	NSHomeDirectory: 'readonly',
	NSPasteboard: 'readonly',
	NSPasteboardTypeString: 'readonly',
	NSString: 'readonly',
	NSURL: 'readonly',
	NSUTF8StringEncoding: 'readonly',
	NSWorkspace: 'readonly',
}

export default tseslint.config(
	{ ignores: ['node_modules', 'server/dist'] },
	js.configs.recommended,
	{
		files: ['plugin/**/*.js'],
		languageOptions: {
			sourceType: 'commonjs',
			ecmaVersion: 2022,
			globals: { ...globals.commonjs, ...cocoaGlobals, console: 'readonly', log: 'readonly' },
		},
	},
	{
		files: ['server/**/*.ts'],
		extends: [tseslint.configs.recommended],
		languageOptions: { globals: globals.node },
	},
	{
		files: ['*.js'],
		languageOptions: { globals: globals.node },
	}
)

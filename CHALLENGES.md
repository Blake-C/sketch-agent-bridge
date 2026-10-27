# Challenges

All notable challenges occurred on the project will be documented in this file.

## Creating layers failed with "No structure encoding found for CGRect"

Date: 2026-10-27, Sketch 88.1 on macOS 27.2.

Every Sketch API constructor that creates a layer, such as `new sketch.Artboard()` or `new sketch.Text()`, calls `initWithFrame(new Rectangle(0, 0, 100, 100).asCGRect())`, and `asCGRect()` calls `CGRectMake`. In the plugin, that call threw an Obj-C exception with the reason "No structure encoding found for CGRect". Reading layer frames and exporting worked, so only the code that builds a new `CGRect` struct failed.

Sketch's JavaScript bridge reads struct layouts from Apple's `.bridgesupport` metadata files. On macOS 27.2, the `CGRect` struct is defined in `CoreFoundation.framework/Resources/BridgeSupport/CoreFoundation.bridgesupport`, and `CoreGraphics.bridgesupport` no longer defines it. Sketch 88.1 was built in 2022 and does not load the CoreFoundation file for that struct.

The fix is in `bridge.js`. Before each op, the plugin calls `framework()` for CoreFoundation, Foundation, CoreGraphics, and AppKit, which loads the CoreFoundation metadata, and after that `CGRectMake` works.

Two attempts did not work:

- Removing `disableCocoaScriptPreprocessor` from the manifest stopped the plugin from loading at all, because the CocoaScript preprocessor cannot parse the modern JavaScript the plugin uses.
- Calling `framework()` for Foundation, CoreGraphics, and AppKit without CoreFoundation did not change the error.

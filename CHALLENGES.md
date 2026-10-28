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

## Center and right text alignment were swapped on Apple Silicon

Date: 2026-10-27, Sketch 88.1 on an arm64 Mac running macOS 27.2.

Text set to `center` through Sketch's JavaScript API rendered right-aligned, and text set to `right` rendered centered. A probe plugin set each alignment on a new text layer and read back the raw value from `textAlignment()`. Sketch wrote 2 for center and 1 for right, which are the Intel AppKit values. On arm64, `NSTextAlignmentCenter` is 1 and `NSTextAlignmentRight` is 2, so AppKit drew the swapped alignment. Sketch's API reads the raw value back with the same Intel mapping, so the API reported the value that was set even though the render did not match.

The plugin now swaps `center` and `right` on both write and read when `NSTextAlignmentCenter` is 1.

## Renders after an override change showed the old overrides

Date: 2026-10-27, Sketch 88.1.

After `update_layer` changed the text and image overrides on an existing symbol instance, the PNG in the same reply showed the overrides from the call before. A probe read the new image size back from the instance, and a separate export showed the new values, so the overrides themselves were set. New instances created with overrides in `build_layers` rendered correctly.

Two attempts did not change the render:

- Calling `invalidateImmutableObject()` on the instance after setting the overrides.
- Calling `invalidateAffectedSymbolInstances()` on the document data as well.

The plugin now skips the render when an update changes overrides, and returns the id of the layer to render in a `render` field. Swapping an instance to another symbol rendered correctly in the same run, so a swap alone does not skip the render. The server then runs the `export` op in a second plugin run, which shows the new values.

## Artboard fills did not draw

Date: 2026-10-27, Sketch 88.1.

Artboards built with a white fill exported with a transparent background, and a yellow test fill did not show either, in the same plugin run or in a later export. The layer spec still listed the fill, because Sketch stores it in the artboard's style. Sketch draws an artboard's background from a separate background color property, so the plugin now writes an artboard's color fill to that property.

## get_images fails on some Unsplash responses

Date: 2026-10-27.

Two of eight `fetch_images` calls failed with "Could not extract image URLs from Unsplash response (HTTP 200)". In both responses the photographer's bio held a literal newline, and `jq` rejects a string with a raw control character, so `get_images` found no URLs. Retrying with a different query worked. The fix belongs in `get_images` in the system setup repo. The bridge now returns only the first line of the error so the full response does not land in the agent's context.

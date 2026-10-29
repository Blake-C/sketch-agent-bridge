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

Update, 2026-10-29: `fetch_images` now calls the Unsplash API from the server and no longer uses `get_images`. Before parsing a reply, the server replaces each raw control character with a space.

## Imported library swatches disappeared before they were used

Date: 2026-10-27, Sketch 88.1 on macOS 27.2.

The first version of library support had an `import_from_library` op that called `import()` on a library reference and returned the local id. Importing the swatch "7. Sapphire" returned an id, but in the next plugin run the document's `foreignSwatches()` was empty and a fill set to that swatch failed with "No swatch has id or name 7. Sapphire". A second import made "7. Sapphire" stay for one more run, and importing "4. Emerald" after that left only "4. Emerald" in `foreignSwatches()`. After a layer used "7. Sapphire" and "9. Amethyst" as its fill and border, both swatches stayed through later write ops, and the unused "4. Emerald" was gone.

Sketch removes an imported library swatch that no layer uses, so an import that runs on its own is not kept. The plugin now has no import op. When a write op names a symbol, shared style, or swatch that the document does not have, `findLocalOrImport` in `libraries.js` imports it from the first enabled library that has it, in the same run that uses it.

`document.swatches` lists only the document's local swatches, so a swatch imported from a library could not be found by name even while it was in the document. `allSwatches` in `style.js` adds the local swatch of each entry in `foreignSwatches()`.

The only enabled library on the test Mac had swatches and no symbols or styles, so importing symbols and shared styles through `findLocalOrImport` has not been tested against Sketch.

Note, 2026-10-27: symbols, layer styles, and text styles from Apple's iOS UI library were later imported through `findLocalOrImport`. The two entries below cover the problems that came up.

## Library text styles linked without changing the text

Date: 2026-10-27, Sketch 88.1 on macOS 27.2, with Apple's iOS UI library.

A text layer given the library style "Title1/2 Bold/1 Light/1 Label Color/1 Left Aligned" through `sharedStyle` stayed at its old font and its 44 by 14 frame. Its layer spec named the style and reported 28 pt, because the spec reads the layer's style object, while the text itself was unchanged. A local text style on the same layer changed the font and the frame, and so did a local style made with the system font, so the font was not the cause. Calling `setSharedStyle` on the native layer did not change the text either.

Copying the shared style onto the layer with `layer.style = shared.style` before linking it changed the font to the style's `.AppleSystemUIFont` at 28 pt and left the layer linked and in sync. `linkSharedStyle` in `edit.js` does this for every text layer.

The style is named Bold, and the text still renders at a regular weight. The style stores `.AppleSystemUIFont` with no bold trait, and the SF Pro font files that Apple's design kit expects are not installed on this Mac.

## Renders left out symbols imported from a library in the same run

Date: 2026-10-27, Sketch 88.1 on macOS 27.2, with Apple's iOS UI library.

A `build_layers` call that placed two switches from the iOS library returned a PNG with no switches, and an `export_layers` call right after it showed both. An `update_layer` call that swapped an instance to a library variant returned an empty PNG, and a later export showed the new variant. `build` and `createLayer` now render in a second plugin run whenever they place a symbol, and `updateLayer` does the same when it swaps the symbol.

## Shapes deleted after the plugin run

Date: 2026-10-28, Sketch 88.1 on macOS 27.2.

A `build_layers` call with a `shape` node replied with the new Shape and its parts, and a `get_layer` call on the artboard right after it showed no Shape. The same happened to the Shape that `combine_shapes` made, and both created the Shape with `new sketch.Shape({ parent, frame, layers: [] })`. Without `layers: []`, Sketch's API adds a default rectangle as the Shape's first part, and a Shape created that way was kept.

`createPathLayer` in `edit.js` already made Shapes that were kept, and it creates the Shape with only `layers: []` and sets `parent` afterward. Creating the Shape that way and then setting `parent` and `frame` kept the Shape in both `build_layers` and `combine_shapes`.

## Photo downloads timed out in Node and not in curl

Date: 2026-10-29, Node 24.22.1 on macOS 27.2.

After `fetch_images` moved from `curl` to Node's `fetch`, some downloads from `images.unsplash.com` failed with `UND_ERR_CONNECT_TIMEOUT` after about 10 seconds. `images.unsplash.com` resolves to one IPv4 and one IPv6 address. On the network used for testing, every IPv6 connection timed out and every IPv4 connection took about 240 ms. [Node 24 tries each address for 250 ms](https://nodejs.org/docs/latest-v24.x/api/net.html#netgetdefaultautoselectfamilyattempttimeout) before moving to the next one, so when an IPv4 attempt took longer than 250 ms, Node stopped it and tried the IPv6 address, which never answered.

In 8 runs of 6 parallel downloads each, every run with Node's defaults had failures. With the attempt timeout raised to 1 second, none of the 8 runs did. `images.ts` sets the attempt timeout to 1 second with `setDefaultAutoSelectFamilyAttemptTimeout`, which keeps the fallback to IPv6 on a network where IPv4 is the broken one.

// Public surface of the loaders module — BMP / MCM / TTF / raw image inputs
// into the compositor's tile model.
export { decodeBmp, normalizeHdOsdFont } from "./bmp";
export { parseMcm } from "./mcm";
export type { McmLoadOptions } from "./mcm";
export { imageRgbaToTile, imageElementToTile } from "./image-to-tile";
export type { ImageToTileOptions } from "./image-to-tile";
export { rasterizeTtfSubset } from "./ttf";
export type { TtfRasterOptions } from "./ttf";

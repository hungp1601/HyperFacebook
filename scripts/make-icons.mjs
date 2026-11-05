// Crops image.png to the rounded tile, makes the corners transparent, exports 16/32/48/128 px icons.
import sharp from "sharp";

const X = 157, Y = 156, S = 940, R = 200; // tile position/size/corner radius in the source image
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${R}" fill="#fff"/></svg>`);

const tile = await sharp("image.png")
  .extract({ left: X, top: Y, width: S, height: S })
  .ensureAlpha()
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();

for (const size of [16, 32, 48, 128]) {
  await sharp(tile).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}

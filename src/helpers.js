/**
 * MetAtlas MapViewer 3D
 * Copyright (C) 2019 metabolicatlas.org
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * @file This file contains helper functions for the Metabolic Atlas 3D Viewer.
 * @author Martin Norling
 */

/**
 * Creates a blank white texture which has the approximate alpha channel of
 * of the parameter texture. The alpha channel will be preserved but limited
 * to 0 (if a<=128) or 255. This is in order to make sure that the index
 * buffer has the exact colors that it should have.
 *
 * @param {Object} baseSprite - a Three-js sprite texture.
 * @returns {string} The data url to the new sprite.
 */
function makeIndexSprite(baseSprite) {
  // bind sprite to a canvas so that we can interact with it
  var canvas = document.createElement("canvas");
  canvas.width = baseSprite.image.width;
  canvas.height = baseSprite.image.height;

  var ctx = canvas.getContext("2d");
  ctx.drawImage(baseSprite.image, 0, 0);

  // create a new sprite which is pure white and have the transparency of the
  // original sprite (without antialiasing).
  let dataSize = baseSprite.image.width*baseSprite.image.height*4;
  var spriteData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (var i = 0; i <= dataSize; i+=4) {
    spriteData.data[i] = 255;
    spriteData.data[i + 1] = 255;
    spriteData.data[i + 2] = 255;
    spriteData.data[i + 3] = spriteData.data[i+3] <= 128 ? 0 : 255;
  }
  ctx.putImageData(spriteData, 0, 0);

  // return the data url so that this function can be used with
  // textureLoader.load().
  return canvas.toDataURL();
}

export { makeIndexSprite };

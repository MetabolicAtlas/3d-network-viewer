import { LineBasicMaterial, PointsMaterial, Frustum, Matrix4 } from "three";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "../node_modules/three/examples/jsm/renderers/CSS2DRenderer";

/**
 * @file This file contains helper functions for the Metabolic Atlas 3D Viewer.
 * @author Martin Norling
 * @author e0
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
const makeIndexSprite = (baseSprite) => {
  // bind sprite to a canvas so that we can interact with it
  const canvas = document.createElement("canvas");
  canvas.width = baseSprite.image.width;
  canvas.height = baseSprite.image.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(baseSprite.image, 0, 0);

  // create a new sprite which is pure white and have the transparency of the
  // original sprite (without antialiasing).
  const dataSize = baseSprite.image.width * baseSprite.image.height * 4;
  const spriteData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i <= dataSize; i += 4) {
    spriteData.data[i] = 255;
    spriteData.data[i + 1] = 255;
    spriteData.data[i + 2] = 255;
    spriteData.data[i + 3] = spriteData.data[i + 3] <= 128 ? 0 : 255;
  }
  ctx.putImageData(spriteData, 0, 0);

  // return the data url so that this function can be used with
  // textureLoader.load().
  return canvas.toDataURL();
};

// Create a div to use for node mouseover information
const createInfoBox = () => {
  const infoBox = document.createElement("div");
  infoBox.style.position = "fixed";
  infoBox.style.top = "0";
  infoBox.style.left = "0";
  infoBox.style.visibility = "hidden";
  infoBox.style.backgroundColor = "rgba(255,255,255,0.5)";
  infoBox.style.padding = "10px";
  infoBox.style.borderRadius = "5px";
  infoBox.style.border = "1px solid rgba(0,0,0,0.6)";
  return infoBox;
};

/*
 * Create a label div for the node
 * The node should be of the shape:
 * {id: <node ID>, pos: (<x-pos>, <y-pos>, <z-pos>), g: <group>,
 * n: <node name>, (optional) color: [<r>, <g>, <b>],
 *  ...
 * @param {object} node - the text to display
 */
const createLabel = (node) => {
  let text = document.createElement("div");
  text.className = "label";
  text.textContent = node.n;
  text.style.fontSize = "11px";
  text.style.fontFamily = "monospace";
  text.style.color = "rgba(255,255,255,0.9)";
  text.style.marginTop = "-1em";
  text.style.padding = "5px";
  text.style.background = "rgba(0,0,0,0.6)";
  const label = new CSS2DObject(text);
  label.position.copy({ x: node.pos[0], y: node.pos[1], z: node.pos[2] });
  return label;
};

/*
 * Create a label-renderer for node labels
 *
 * ...
 * @param {number} width - the width of the container
 * @param {number} height - the height of the container
 */
const createLabelRenderer = (width, height) => {
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  return labelRenderer;
};

// Create the link material and geometry
const lineMaterial = new LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  depthTest: true,
  opacity: 0.67,
});

/*
 * Create a PointsMaterial instance.
 *
 *  ...
 * @param {number} size - the size of the node
 * @param {object} map - the texture/sprite to use for the node
 */
const createPointsMaterial = (size, map) =>
  new PointsMaterial({
    size,
    map,
    vertexColors: true,
    transparent: true,
    depthTest: true,
    alphaTest: 0.5,
  });

/*
 * Create a Frustum instance.
 *
 *  ...
 * @param {object} camera - a PerspectiveCamera instance
 */
const createFrustum = (camera) => {
  const frustum = new Frustum();
  frustum.setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    )
  );
  return frustum;
};

const defaultColors = {
  nodeDefaultColor: [255, 255, 255],
  connectionStartColor: [0, 127, 255],
  connectionEndColor: [0, 127, 0],
  nodeSelectColor: [255, 0, 0],
  connectionSelectColor: [255, 255, 0],
  hoverSelectColor: [255, 0, 255],
  hoverConnectionColor: [255, 0, 0],
};

export {
  makeIndexSprite,
  createInfoBox,
  createLabel,
  createLabelRenderer,
  createPointsMaterial,
  createFrustum,
  lineMaterial,
  defaultColors,
};

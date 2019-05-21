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
 * @file This file contains the main functions to initialize the Metabolic Atlas
 * 3D Map Viewer.
 * @author Martin Norling
 */

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  NearestFilter,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  TextureLoader,
  Uint8BufferAttribute,
  VertexColors,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three-js';

import { AtlasViewerControls } from './atlas-viewer-controls';

/**
 * Creates a rendering context for the Metabolic Atlas Viewer.
 *
 * @param {string} targetElement - The ID of the target DOM element where the
 *     viewer should be placed.
 * @returns A control object with functions for controlling the viewer.
 */
function MetAtlasViewer(targetElement) {
  // Camera variables
  let fieldOfView = 270;
  let aspect = window.innerWidth / window.innerHeight;
  let near = 1;
  let far = 5000;
  var camera = new PerspectiveCamera(fieldOfView, aspect, near, far)
  camera.position.z = 3000;

  // Create the scene and set background
  var scene = new Scene();
  scene.background = new Color( 0xdddddd );

  // Create color picking scene and target
  var indexScene = new Scene();
  indexScene.background = new Color( 0xffffff );
  var indexTarget = new WebGLRenderTarget(1,1);

  // Create object group for the graph
  var graph = new Group();

  // Create nodeMesh as a global so that we can modify it later
  var nodeMesh;

  // Create color arrays for the nodes
  var nodeColors = [];
  var indexColors = [];

  // Create a list to keep track of selected nodes.
  var selected = [];

  // Create renderer
  var renderer = new WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Add the renderer to the target element
  document.getElementById(targetElement).appendChild(renderer.domElement);

  // Create a div to use for node mouseover information
  var infoBox = document.createElement('div');
  infoBox.style.position = 'fixed';
  infoBox.style.top = '0';
  infoBox.style.left = '0';
  infoBox.style.visibility = 'hidden';
  infoBox.style.backgroundColor = 'rgba(255,255,255,0.5)';
  infoBox.style.padding = '10px';
  infoBox.style.borderRadius = '5px';
  infoBox.style.border = '1px solid rgba(0,0,0,0.6)';
  document.getElementById(targetElement).appendChild(infoBox);

  // Add window resize listener and mouse listener
  window.addEventListener('resize', onWindowResize, false);
  window.addEventListener('mousemove', onMouseMove, false);
  window.addEventListener('click', onMouseClick, false);

  // Set a camera control placeholder
  var cameraControls;

  // Set default controls
  setCameraControls(AtlasViewerControls);

  /**
   * Sets the graph data to display in the viewer.
   *
   * The data should be formatted as:
   * nodes = [{id: <node ID>, pos: (<x-pos>, <y-pos>, <z-pos>),
   *           ...
   *          ]
   * links = [{s: <node ID>, t: <node ID>},
   *           ...
   *          ]
   * where 's' and 't' should be the id of the start and end nodes of the link.
   *
   * @param {object} graphData - graph data formatted like {nodes:[], links: []}
   */
  function setData(graphData, nodeTexture, nodeSize) {
    let nodes = graphData.nodes;
    let links = graphData.links;

    // Make an index to keep track of nodes for the connections
    var nodeIndex = {}

    // create the node and index geometries
    var nodeGeometry = new BufferGeometry();
    var indexGeometry = new BufferGeometry();

    // Set node positions and colors, and set a unique color for each node. The
    // index color will be used for selecting nodes in the scene.
    var nodePositions = [];
    for ( var i = 0; i < nodes.length; i ++ ) {
      nodePositions.push.apply(nodePositions, data.nodes[i].pos);
      nodeColors.push( 255, 255, 255 );
      indexColors.push(Math.floor(i/(256*256)),
                       Math.floor(i/256) % 256,
                       i % 256
                      );

      // update index
      nodeIndex[nodes[i].id] = nodes[i].pos;
    }
    // bind arrays to node geometry attributes
    nodeGeometry.addAttribute('position',
                              new Float32BufferAttribute(nodePositions, 3));
    nodeGeometry.addAttribute('color',
                              new Uint8BufferAttribute(nodeColors, 3, true));
    nodeGeometry.computeBoundingSphere();

    // ... and to index geometry attributes
    indexGeometry.addAttribute('position',
                               new Float32BufferAttribute(nodePositions, 3));
    indexGeometry.addAttribute('color',
                               new Uint8BufferAttribute(indexColors, 3, true));

    // Create the link material and geometry
    var lineMaterial = new LineBasicMaterial({vertexColors: VertexColors,
      transparent: true,
      depthTest: true,
      opacity: 0.67
    });

    var linePositions = [];
    var lineColors = [];

    for ( var i = 0; i < links.length; i ++ ) {
      // Check the the nodes are in the graph
      if (!(links[i].s in nodeIndex)) {
        console.warn("ignoring link: '" + links[i].s + "' to '" + links[i].t +
                     ". The start node is not in the node list.")
        continue
      }
      if (!(links[i].t in nodeIndex)) {
        console.warn("ignoring link: '" + links[i].s + "' to '" + links[i].t +
                     ". The end node is not in the node list.")
        continue
      }
      // Start position and color
      linePositions.push.apply(linePositions, nodeIndex[links[i].s]);
      lineColors.push( 0.0, 1.0, 0.0 );

      // End position and color
      linePositions.push.apply(linePositions, nodeIndex[links[i].t]);
      lineColors.push( 0.0, 0.0, 1.0 );
    }

    // set line geometry attributes and mesh.
    var lineGeometry = new BufferGeometry();
    lineGeometry.addAttribute('position',
                              new Float32BufferAttribute(linePositions, 3));
    lineGeometry.addAttribute('color',
                              new Float32BufferAttribute(lineColors, 3));

    var lineMesh = new LineSegments(lineGeometry, lineMaterial);

    // Load sprite and set node material
    let textureLoader = new TextureLoader();

    // The sprite texture needs to be loaded so that we can parse it to make the
    // index sprite texture, which is why all this code is in the callback.
    var sprite = textureLoader.load(nodeTexture, function() {
      let nodeMaterial = new PointsMaterial({size: nodeSize,
                                             vertexColors: VertexColors,
                                             map: sprite,
                                             transparent: true,
                                             depthTest: true,
                                             alphaTest: 0.5
                                            });

      var indexSprite = textureLoader.load(makeIndexSprite(sprite));
      indexSprite.magFilter = NearestFilter;
      indexSprite.minFilter = NearestFilter;

      let indexMaterial = new PointsMaterial({size: nodeSize,
                                              vertexColors: VertexColors,
                                              map: indexSprite,
                                              transparent: true,
                                              depthTest: true,
                                              flatShading: true,
                                              alphaTest: 0.5
                                            });

      nodeMesh = new Points( nodeGeometry, nodeMaterial );
      let indexMesh = new Points( indexGeometry, indexMaterial );

      // Set render order and add objects to graph group
      lineMesh.renderOrder = 0;
      nodeMesh.renderOrder = 1;
      graph.add( lineMesh );
      graph.add( nodeMesh );

      // Finally, add the graph to the scene, and the index geometry to the index
      // scene, and render to show the new geometry
      scene.add( graph );
      indexScene.add( indexMesh );
      requestAnimationFrame(render);
    });
  }

  /**
   * Creates a blank white texture which has the approximate alpha channel of
   * of the parameter texture. The alpha channel will be preserved but limited
   * to 0 (if A<=128) or 255. This is in order to make sure that the index
   * buffer has the exact colors that it should have.
   *
   * @param {Object} baseSprite - a Three-js sprite texture.
   * @returns {string} - the data url to the new sprite.
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

  /**
   * Mouse move callback that does scene object picking.
   * @param {event} event - A mouse move event
   */
  function onMouseMove(event) {
    var items = pickInScene(event.clientX, event.clientY);
    items.forEach(id => {
      infoBox.style.top = (event.clientY+5).toString() + "px";
      infoBox.style.left = (event.clientX+5).toString() + "px";
      infoBox.style.visibility = 'visible';
      infoBox.innerHTML = 'Node: ' + id.toString();
    });
    if (items.length == 0) {
      infoBox.style.visibility = 'hidden';
    }
  }

  /**
   * Mouse click callback which calls pickInScene to get the current object
   * under the mouse cursor and colors it red.
   *
   * @param {event} - A mouse click event.
   */
  function onMouseClick(event) {

    var items = pickInScene(event.clientX, event.clientY);

    // reset last selected sprite
    while (selected.length > 0) {
      let item = selected.pop();
      setSpriteColor(item, [255, 255, 255]);
    }

    // save current selected ids
    items.forEach(id => {
      selected.push(id);

      // update selected if with red color
      setSpriteColor(id, [255,0,0]);
    });

    // render the scene to make sure that it's updated
    requestAnimationFrame(render);
  }

  /**
   * Does scene object picking by rendering the pixel at the mouse pointer,
   * converts its color to an index position and returns that id.
   *
   * @param {*} posX - X-position to pick in the scene.
   * @param {*} posY - Y-position to pick in the scene.
   * @returns {number} - ID number of the picked object.
   */
  function pickInScene(posX, posY) {

    // set the camera to only render the pixel under the cursor.
    camera.setViewOffset(renderer.domElement.width,
      renderer.domElement.height,
      posX * window.devicePixelRatio,
      posY * window.devicePixelRatio,
      1,
      1);

    // change rendering target so that the image stays on the screen
    renderer.setRenderTarget(indexTarget);
    renderer.render(indexScene, camera);

    var pixelBuffer = new Uint8Array(4);

    renderer.readRenderTargetPixels(indexTarget, 0, 0, 1, 1, pixelBuffer);
    // check if the color is white (background)
    if (pixelBuffer[2] == pixelBuffer[1] == pixelBuffer[1] == 255) {
      return;
    }
    var id = (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | (pixelBuffer[2]);

    // reset the camera and rendering target.
    camera.clearViewOffset();
    renderer.setRenderTarget(null);

    // don't return background color
    if (id == 16777215) {
      return [];
    }

    return [id];
  }

  /**
   * Sets the camera control function.
   * @param {function} cameraControlFunction
   */
  function setCameraControls(cameraControlFunction) {
    cameraControls = new cameraControlFunction(camera, renderer.domElement);
    cameraControls.addEventListener( 'change', render );
    return cameraControls;
  }

  /**
   * Sets the color of 'spriteNum' in the nodeMesh to 'color'.
   *
   * @param {number} spriteNum - id of the sprite in the nodemesh
   * @param {array} color - color to set the sprite to.
   */
  function setSpriteColor(spriteNum, color) {
    nodeMesh.geometry.attributes.color.array[spriteNum*3+0] = color[0];
    nodeMesh.geometry.attributes.color.array[spriteNum*3+1] = color[1];
    nodeMesh.geometry.attributes.color.array[spriteNum*3+2] = color[2];
    nodeMesh.geometry.attributes.color.needsUpdate = true;
  }

  /**
   * Updates the camera projection matrix, and renderer size to the current
   * window size.
   */
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
    if (cameraControls) {
      cameraControls.handleResize();
    }
    requestAnimationFrame(render);
  }

  /**
   * Rendering function.
   */
  function render() {
    renderer.render( scene, camera );
  }

  /**
   * Starts the animation cycle by repeatedly requesting an animation frame and
   * calling 'render()'.
   */
  function animate() {
    requestAnimationFrame(animate);
    if (cameraControls) {
      cameraControls.update();
    } else {
      render();
    }
  }

  // Start the rendering cycle
  animate();

  // Return an interaction "controller" that we can use to control the scene.
  // Currently it's only used to access the setData and setCameraControls
  // functions.
  return {setData: setData, setCameraControls: setCameraControls};
}

export { MetAtlasViewer };

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
import { makeIndexSprite } from './helpers';

/**
 * Creates a rendering context for the Metabolic Atlas Viewer.
 *
 * @param {string} targetElement - The ID of the target DOM element where the
 *     viewer should be placed.
 * @returns {Object} A control object with functions for controlling the viewer.
 */
function MetAtlasViewer(targetElement) {
  // Camera variables
  let fieldOfView = 270;
  let aspect = window.innerWidth / window.innerHeight;
  let near = 1;
  let far = 10000;
  var camera = new PerspectiveCamera(fieldOfView, aspect, near, far)
  camera.position.z = 3000;

  // Set default colors
  var connectionStartColor = [0, 127, 255];
  var connectionEndColor = [0, 127, 0];
  var nodeSelectColor = [255, 0, 0];
  var connectionSelectColor = [255, 255, 0];

  // Create the scene and set background
  var scene = new Scene();
  scene.background = new Color( 0xdddddd );

  // Create color picking scene and target
  var indexScene = new Scene();
  indexScene.background = new Color( 0xffffff );
  var indexTarget = new WebGLRenderTarget(1,1);

  // Create object group for the graph
  var graph = new Group();

  // Create nodeMesh and connectionMesh as globals so that we can modify them
  // later
  var nodeMesh;
  var connectionMesh;

  // Create color and material arrays for the nodes
  var nodeColors = [];
  var indexColors = [];

  // Create a list to keep track of selected nodes.
  var selected = [];

  // Create a texture loader for later
  const textureLoader = new TextureLoader();

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

  // Get the target DOM element for generating events
  var eventElement = document.getElementById(targetElement);

  // holds information to connect nodes to graph id's
  var nodeInfo = [];

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
   * @param {object} nodeTexture - texture images formatted as [{group:group,
   *     sprite:<image>}]
   * @param {object} nodeSize - Size of the nodes in graph coordinates
   */
  function setData(graphData, nodeTextures, nodeSize) {
    let nodes = graphData.nodes;
    let links = graphData.links;

    // Make an index to keep track of nodes for the connections
    var nodeIndex = {}

    // create the node and index geometries
    var nodeGeometry = new BufferGeometry();
    var indexGeometry = new BufferGeometry();

    // Sort the vertex positions by group, so that we can set the materials
    // properly
    nodes.sort((a,b) => a.g > b.g);

    // Sort the materials as well so that the arrays match
    nodeTextures.sort((a,b) => a.group > b.group);

    // Set node positions and colors, and set a unique color for each node. The
    // index color will be used for selecting nodes in the scene.
    var nodePositions = [];
    var nodeGroups = {};
    nodes.forEach((node,i) => {
      nodePositions.push.apply(nodePositions, node.pos);
      if (nodeGroups[node.g] === undefined) {
        nodeGroups[node.g] = 1;
      } else {
        nodeGroups[node.g] += 1;
      }
      nodeColors.push( 255, 255, 255 );
      indexColors.push(Math.floor(i/(256*256)),
                       Math.floor(i/256) % 256,
                       i % 256
                      );
      // update index
      nodeIndex[node.id] = {pos: node.pos, index: i};
      // update info
      nodeInfo.push({id: node.id,
                     connections: {to:[], from:[]},
                     index: i,
                     group: node.g});
    });

    // bind arrays to node geometry attributes
    nodeGeometry.setAttribute('position',
                              new Float32BufferAttribute(nodePositions, 3));
    nodeGeometry.setAttribute('color',
                              new Uint8BufferAttribute(nodeColors, 3, true));
    nodeGeometry.computeBoundingSphere();

    let last = 0;
    // Set material groups
    nodeTextures.forEach(function(texture, i) {
      let current = nodeGroups[texture.group];
      nodeGeometry.addGroup(last, (last + current), i);
      indexGeometry.addGroup(last,(last + current), i);
      last += current;
    });

    // Set index geometry attributes
    indexGeometry.setAttribute('position',
                               new Float32BufferAttribute(nodePositions, 3));
    indexGeometry.setAttribute('color',
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
      linePositions.push.apply(linePositions, nodeIndex[links[i].s].pos);
      lineColors.push.apply(lineColors, connectionStartColor );

      // End position and color
      linePositions.push.apply(linePositions, nodeIndex[links[i].t].pos);
      lineColors.push.apply(lineColors, connectionEndColor );

      // Add connections to nodeInfo
      // to:
      nodeInfo[nodeIndex[links[i].s].index].connections.to.push({
        index: i*2+1,
        neighbor: links[i].t
        });
      // from:
      nodeInfo[nodeIndex[links[i].t].index].connections.from.push({
        index: i*2,
        neighbor: links[i].s
        })
    }

    // set line geometry attributes and mesh.
    var lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute('position',
                              new Float32BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute('color',
                              new Uint8BufferAttribute(lineColors, 3, true));

    connectionMesh = new LineSegments(lineGeometry, lineMaterial);
    // Add the lines to the graph group and set it to render first
    graph.add(connectionMesh);
    connectionMesh.renderOrder = 0;

    let promises = [];
    var nodeMaterials = [];
    var indexMaterials = [];
    nodeTextures.forEach(tex => {
      promises.push(new Promise(function (resolve, reject) {
        var sprite = textureLoader.load(tex.sprite, function () {
          nodeMaterials.push(new PointsMaterial({
            size: nodeSize,
            vertexColors: VertexColors,
            map: sprite,
            transparent: true,
            depthTest: true,
            alphaTest: 0.5
          }));

          var indexSprite = textureLoader.load(makeIndexSprite(sprite));
          indexSprite.magFilter = NearestFilter;
          indexSprite.minFilter = NearestFilter;

          indexMaterials.push(new PointsMaterial({
            size: nodeSize,
            vertexColors: VertexColors,
            map: indexSprite,
            transparent: true,
            depthTest: true,
            flatShading: true,
            alphaTest: 0.5
          }));
          resolve("texture loaded");
        });
      }));
    });

    Promise.all(promises).then(function() {
      // All sprite materials are available here

      nodeMesh = new Points(nodeGeometry, nodeMaterials);
      let indexMesh = new Points(indexGeometry, indexMaterials);

      // Add the nodes to the graph group and set it to render second
      nodeMesh.renderOrder = 1;
      graph.add(nodeMesh);

      // Finally, add the graph to the scene, and the index geometry to the index
      // scene, and render to show the new geometry
      scene.add(graph);
      indexScene.add(indexMesh);
      requestAnimationFrame(render);
    });

  }

  function filterBy(filterString) {
    for (let key of Object.keys(filterString)) {
      if (!Array.isArray(filterString[key])) {
        filterString[key] = Array(filterString[key]);
      }
    }

    let items = nodeInfo.filter(v => {
      for (const key of Object.keys(filterString)) {
        if (filterString[key].includes(v[key])) {
          return true;
        }
      }
      return false;
    }).map(i => {return i.index});
    select(items);

    // render the scene to make sure that it's updated
    requestAnimationFrame(render);
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
      infoBox.innerHTML = nodeInfo[id].id;
    });
    if (items.length == 0) {
      infoBox.style.visibility = 'hidden';
    }
  }

  function select(items) {
    // reset last selected sprite
    while (selected.length > 0) {
      let item = selected.pop();
      setSpriteColor(item, [255, 255, 255]);
      setConnectionsColor(item);
    }

    // save current selected ids
    items.forEach(id => {
      selected.push(id);

      // update selected if with red color
      setSpriteColor(id, nodeSelectColor);

      // update selected connections with blue
      setConnectionsColor(id, connectionSelectColor)
    });

    // Create new selection event
    let selectEvent = new CustomEvent(
        "select",
        {
            detail: {
              items: items.map(i => {return nodeInfo[i];})
            },
            bubbles: false,
            cancelable: true
        });

    eventElement.dispatchEvent(selectEvent);
  }

  /**
   * Mouse click callback which calls pickInScene to get the current object
   * under the mouse cursor and colors it red.
   *
   * @param {event} - A mouse click event.
   */
  function onMouseClick(event) {

    var items = pickInScene(event.clientX, event.clientY);

    if (items.length > 0) {
      select(items);
    }

    // render the scene to make sure that it's updated
    requestAnimationFrame(render);
  }

  /**
   * Does scene object picking by rendering the pixel at the mouse pointer,
   * converts its color to an index position and returns that id.
   *
   * @param {*} posX - X-position to pick in the scene.
   * @param {*} posY - Y-position to pick in the scene.
   * @returns {number} ID number of the picked object.
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
   * Sets the camera control function, and adds an event listener which calls
   * the render function whenever the controls emit a change event.
   *
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
   * Colors all connections of the sprite selected by `spriteNum`.
   *
   * @param {*} spriteNum - id of the sprite to have it's connections colored
   * @param {*} color - (optional) color to set the connections to. If omitted,
   *     the default connection colors will be used.
   */
  function setConnectionsColor(spriteNum, color = undefined) {
    let node = nodeInfo[spriteNum];
    node.connections.from.forEach(conn => {
      let c = color ? color : connectionStartColor;
      connectionMesh.geometry.attributes.color.array[conn.index*3+0] = c[0];
      connectionMesh.geometry.attributes.color.array[conn.index*3+1] = c[1];
      connectionMesh.geometry.attributes.color.array[conn.index*3+2] = c[2];

      c = color ? color : connectionEndColor;
      connectionMesh.geometry.attributes.color.array[conn.index*3+3] = c[0];
      connectionMesh.geometry.attributes.color.array[conn.index*3+4] = c[1];
      connectionMesh.geometry.attributes.color.array[conn.index*3+5] = c[2];
    });
    node.connections.to.forEach(conn => {
      let c = color ? color : connectionStartColor;
      connectionMesh.geometry.attributes.color.array[conn.index*3-3] = c[0];
      connectionMesh.geometry.attributes.color.array[conn.index*3-2] = c[1];
      connectionMesh.geometry.attributes.color.array[conn.index*3-1] = c[2];

      c = color ? color : connectionEndColor;
      connectionMesh.geometry.attributes.color.array[conn.index*3+0] = c[0];
      connectionMesh.geometry.attributes.color.array[conn.index*3+1] = c[1];
      connectionMesh.geometry.attributes.color.array[conn.index*3+2] = c[2];
    });
    connectionMesh.geometry.attributes.color.needsUpdate = true;
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
  // Currently it's used to access the setData, setCameraControls, and filterBy
  // functions.
  return {setData: setData,
          setCameraControls: setCameraControls,
          filterBy: filterBy};
}

export { MetAtlasViewer };

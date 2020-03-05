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
  Frustum,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  NearestFilter,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  TextureLoader,
  Uint8BufferAttribute,
  VertexColors,
  WebGLRenderer,
  WebGLRenderTarget,
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
  let fieldOfView = 90;
  let aspect = window.innerWidth / window.innerHeight;
  let near = 1;
  let far = 10000;
  var camera = new PerspectiveCamera(fieldOfView, aspect, near, far)
  camera.position.z = 3000;

  var cameraDefault = {
    position: Object.assign({}, camera.position),
    up: Object.assign({}, camera.up),
    target: Object.assign({}, camera.up)
  };
  var flyTarget = {
    active: false,
    start: undefined,
    startUp: undefined,
    end: undefined,
    target: undefined,
    startTime: undefined,
    targetUp: undefined,
    runTime: 750
  };

  // Set default colors
  var nodeDefaultColor = [255,255,255];
  var connectionStartColor = [0, 127, 255];
  var connectionEndColor = [0, 127, 0];
  var nodeSelectColor = [255, 0, 0];
  var connectionSelectColor = [255, 255, 0];
  var hoverSelectColor = [255, 0, 255];
  var hoverConnectionColor = [255, 0, 0];

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

  // Create another reference to keep track of hover selected node
  var hoverNode;

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
  window.addEventListener('pointerdown', onMouseClick, false);
  window.addEventListener('keypress', onKeypress, false);

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

    // Set node positions and colors, and set a unique index color for each
    // node. The index color will be used for selecting nodes in the scene.
    var nodePositions = [];
    var nodeGroups = {};
    nodes.forEach((node,i) => {
      nodePositions.push.apply(nodePositions, node.pos);
      if (nodeGroups[node.g] === undefined) {
        nodeGroups[node.g] = 1;
      } else {
        nodeGroups[node.g] += 1;
      }
      let color = node.color ? node.color : nodeDefaultColor;
      nodeColors.push.apply(nodeColors, color);
      indexColors.push(Math.floor(i/(256*256)),
                       Math.floor(i/256) % 256,
                       i % 256
                      );
      // update index
      nodeIndex[node.id] = {pos: node.pos, index: i};
      // update info
      nodeInfo.push({id: node.id,
                     pos: node.pos,
                     color: node.color ? node.color : nodeDefaultColor,
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
      nodeGeometry.addGroup(last, current, i);
      indexGeometry.addGroup(last, current, i);
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

  /**
   * Selects nodes in the graph based on a filter.
   *
   * @param {*} filter - filter object, whose keys-value pairs will be compared
   *     to the nodes. If a node has the same key-value pair it will be
   *     selected.
   */
  function selectBy(filter) {
    for (let key of Object.keys(filter)) {
      if (!Array.isArray(filter[key])) {
        filter[key] = [filter[key]];
      }
    }

    let items = nodeInfo.filter(v => {
      for (const key of Object.keys(filter)) {
        if (filter[key].includes(v[key])) {
          return true;
        }
      }
      return false;
    }).map(i => {return i.index});
    select(items);

    focusOnItems(items);

    // render the scene to make sure that it's updated
    requestAnimationFrame(render);
  }

  /**
   * Given a lisf of nodes, `items`, this function will calculate the center
   * point of the nodes, then set the camera to point along a vector from that
   * point to the world center.
   *
   * The function will attempt to move the camera backwards along the vector
   * until all items are inside the camera frustum.
   */
  function focusOnItems(items) {

    // move camera to view items.
    if (items.length > 0) {
      let p = midPoint(items)
      let l = Math.sqrt(p.x*p.x + p.y*p.y + p.z*p.z);

      let cameraDistance = 50; // default, for single items

      let t = {
        x: p.x + p.x/l * cameraDistance,
        y: p.y + p.y/l * cameraDistance,
        z: p.z + p.z/l * cameraDistance
      };

      let cameraStep = 50;
      let maxDistance = 3000 - l;
      if (items.length > 1) {
        // copy camera to move it around without having to mess with the scene,
        // but make the FoV slightly narrower to make sure things are inside the
        // visible portion of the view on the main camera.
        let testCamera = new PerspectiveCamera(fieldOfView-10, aspect, near, far);
        testCamera.position.copy(t);
        testCamera.up.copy({x:0, y:1, z:0});
        testCamera.lookAt(0,0,0);
        testCamera.updateMatrix();
        testCamera.updateMatrixWorld();
        testCamera.matrixWorldInverse.getInverse( testCamera.matrixWorld );

        while (!isInCamera(items, testCamera) && cameraDistance < maxDistance) {
          // move camera back until we've reached the max distance or we can see
          // all object in the camera
          cameraDistance += cameraStep;
          t = {
            x: p.x + p.x/l * cameraDistance,
            y: p.y + p.y/l * cameraDistance,
            z: p.z + p.z/l * cameraDistance
          };
          testCamera.position.copy(t);
          testCamera.up.copy({x:0, y:1, z:0});
          testCamera.lookAt(0,0,0);
          testCamera.updateMatrix();
          testCamera.updateMatrixWorld();
          testCamera.matrixWorldInverse.getInverse( testCamera.matrixWorld );
        }
      }
      setFlyTarget(t);
    }
  }

  /**
   * returns the midpoints given a list of node index numbers.
   *
   * @param {*} items Items to get midpoint for
   */
  function midPoint(items) {
    let s = items.map(i => nodeInfo[i]).reduce((a,b) => {
      return {x: a.x+b.pos[0], y:a.y+b.pos[1], z: a.z+b.pos[2]};},
      {x:0,y:0,z:0}
    );
    return {
      x: s.x / items.length,
      y: s.y / items.length,
      z: s.z / items.length
    };
  }

  /**
   * Given a number of items and a camera, this function will return true if all
   * items are inside the camera frustum.
   *
   * @param {*} items - A list of node id's
   * @param {*} cam - The camera to test with
   */
  function isInCamera(items, cam) {
    let retval = true;
    let frustum = new Frustum();
    frustum.setFromProjectionMatrix( new Matrix4().multiplyMatrices( cam.projectionMatrix, cam.matrixWorldInverse ) );
    items.map(i => nodeInfo[i]).forEach(node => {
      let pos = {x: node.pos[0], y: node.pos[1], z: node.pos[2]};
      retval = retval && frustum.containsPoint(pos);
    });
    return retval;
  }

  /**
   * Mouse move callback that does scene object picking.
   * @param {event} event - A mouse move event
   */
  function onMouseMove(event) {
    var items = pickInScene(event);
    items.forEach(id => {
      infoBox.style.top = (event.clientY+5).toString() + "px";
      infoBox.style.left = (event.clientX+5).toString() + "px";
      infoBox.style.visibility = 'visible';
      infoBox.innerHTML = nodeInfo[id].id;
    });
    if (items.length == 0) {
      infoBox.style.visibility = 'hidden';
    }
    select(items, false);
    requestAnimationFrame(render);
  }

  function select(items, persistent = true) {

    if (persistent) {
      // reset the currently persistently selected sprites
      while (selected.length > 0) {
        let item = selected.pop();
        setSpriteColor(item);
        setConnectionsColor(item);
      }
    } else if (hoverNode) {
      setSpriteColor(hoverNode);
      setConnectionsColor(hoverNode);
    }

    // save current selected ids
    items.forEach(id => {
      if (persistent) {
        selected.push(id);
      } else {
        hoverNode = id;
      }

      // update selected if with red color
      setSpriteColor(id, persistent ? nodeSelectColor : hoverSelectColor);

      // update selected connections with blue
      setConnectionsColor(id, persistent ? connectionSelectColor : hoverConnectionColor)
    });

    if (persistent) {
      // focus camera on midpoint
      let m = midPoint(items);
      cameraControls.target.copy(m);

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
  }

  /**
   * Mouse click callback which calls pickInScene to get the current object
   * under the mouse cursor and colors it red.
   *
   * @param {event} - A mouse click event.
   */
  function onMouseClick(event) {

    var items = pickInScene(event);

    if (items.length > 0) {
      select(items);
    }

    // render the scene to make sure that it's updated
    requestAnimationFrame(render);
  }

  /**
   * Handles keypresses. Current controls:
   *
   *  - r: reset camera to start position.
   *  - q: reset the selection
   *
   * @param {*} event - A keypress event
   */
  function onKeypress(event) {
    if (event.key == 'r') {
      resetCamera();
    } else if (event.key == 'q') {
      resetSelection();
    }
  }

  /**
   * Does scene object picking by rendering the pixel at the mouse pointer,
   * converts its color to an index position and returns that id.
   *
   * @param {*} event - An event containing mouse coordinates.
   * @returns {number} ID number of the picked object.
   */
  function pickInScene(event) {
    let size = renderer.domElement.getBoundingClientRect();
    var posX = event.clientX-size.x;
    var posY = event.clientY-size.y;

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
  function setSpriteColor(spriteNum, color = undefined) {
    let c = color ? color : selected.includes(spriteNum) ? nodeSelectColor : nodeInfo[spriteNum].color;
    nodeMesh.geometry.attributes.color.array[spriteNum*3+0] = c[0];
    nodeMesh.geometry.attributes.color.array[spriteNum*3+1] = c[1];
    nodeMesh.geometry.attributes.color.array[spriteNum*3+2] = c[2];
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
      let c = color ? color : selected.includes(spriteNum) ? connectionSelectColor : connectionStartColor;
      connectionMesh.geometry.attributes.color.array[conn.index*3+0] = c[0];
      connectionMesh.geometry.attributes.color.array[conn.index*3+1] = c[1];
      connectionMesh.geometry.attributes.color.array[conn.index*3+2] = c[2];

      c = color ? color : selected.includes(spriteNum) ? connectionSelectColor : connectionEndColor;
      connectionMesh.geometry.attributes.color.array[conn.index*3+3] = c[0];
      connectionMesh.geometry.attributes.color.array[conn.index*3+4] = c[1];
      connectionMesh.geometry.attributes.color.array[conn.index*3+5] = c[2];
    });
    node.connections.to.forEach(conn => {
      let c = color ? color : selected.includes(spriteNum) ? connectionSelectColor : connectionStartColor;
      connectionMesh.geometry.attributes.color.array[conn.index*3-3] = c[0];
      connectionMesh.geometry.attributes.color.array[conn.index*3-2] = c[1];
      connectionMesh.geometry.attributes.color.array[conn.index*3-1] = c[2];

      c = color ? color : selected.includes(spriteNum) ? connectionSelectColor : connectionEndColor;
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
   * Sets the camera to the absolute position given by `position`, using the
   * up-vector `up`, and pointing at `target`.
   *
   * @param {*} position - new camera position
   * @param {*} up - new camera up vector
   * @param {*} target - new camera target
   */
  function setCamera(position, up, target) {
    camera.position.copy(position);
    camera.up.copy(up);
    cameraControls.target.copy(target)
    requestAnimationFrame(render);
  }

  /**
   * Sets the camera to fly towards being in the position given by `position`,
   * the up-vector `up`, and pointing towards `target`. The duration for the
   * transition is given by `flyTarget.runTime`.
   *
   * @param {*} position - target camera position
   * @param {*} up - target camera up vector
   * @param {*} target - target camera target
   */
  function setFlyTarget(position, up = {x:0, y:1, z:0}, target = {x:0, y:0, z:0}) {
    flyTarget.active = true;
    flyTarget.start = Object.assign({}, camera.position);
    flyTarget.startUp = Object.assign({}, camera.up);
    flyTarget.end = position;
    flyTarget.target = target;
    flyTarget.targetUp = up;
    flyTarget.startTime = new Date().getTime();
  }

  /**
   * Updates the camera with a new position given the time that's transpired
   * between `flyTarget.startTime` and now. If the current time is greater than
   * `flyTarget.startTime` + `flyTarget.runTime`, then the camera will be set to
   * the `flyTarget.end` position, and `flyTarget.active` will be set to
   * `false`.
   */
  function flyUpdate() {
    let t = new Date().getTime();
    if (t >= flyTarget.startTime + flyTarget.runTime) {
      flyTarget.active = false;
      setCamera(flyTarget.end, flyTarget.targetUp, flyTarget.target);
    } else {
      let p = (t - flyTarget.startTime)/flyTarget.runTime;
      let p_t = {
        x: flyTarget.start.x + (flyTarget.end.x - flyTarget.start.x)*p,
        y: flyTarget.start.y + (flyTarget.end.y - flyTarget.start.y)*p,
        z: flyTarget.start.z + (flyTarget.end.z - flyTarget.start.z)*p
      };
      let p_u = {
        x: flyTarget.startUp.x + (flyTarget.targetUp.x - flyTarget.startUp.x)*p,
        y: flyTarget.startUp.y + (flyTarget.targetUp.y - flyTarget.startUp.y)*p,
        z: flyTarget.startUp.z + (flyTarget.targetUp.z - flyTarget.startUp.z)*p
      };
      setCamera(p_t, p_u, flyTarget.target);
    }
  }

  /**
   * Uses the SetFlyTarget function to reset the camera to the start-position.
   */
  function resetCamera() {
    setFlyTarget(cameraDefault.position, cameraDefault.up, cameraDefault.target);
  }

  /**
   * Resets the list of selected nodes, and re-points the camera to the world
   * center.
   */
  function resetSelection() {
    select([]);
    cameraControls.target.copy({x:0, y:0, z:0});
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
    if (flyTarget.active) {
      flyUpdate();
    }
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
          selectBy: selectBy};
}

export { MetAtlasViewer };

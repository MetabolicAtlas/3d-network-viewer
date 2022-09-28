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
  LineSegments,
  NearestFilter,
  PerspectiveCamera,
  Points,
  Scene,
  TextureLoader,
  Uint8BufferAttribute,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";

import { AtlasViewerControls } from "./atlas-viewer-controls";
import {
  makeIndexSprite,
  createInfoBox,
  createLabel,
  createLabelRenderer,
  createPointsMaterial,
  createFrustum,
  moveCamera,
  lineMaterial,
  defaultColors,
} from "./helpers";

/**
 * Creates a rendering context for the Metabolic Atlas Viewer.
 *
 * @param {string} targetElement - The ID of the target DOM element where the
 *     viewer should be placed.
 * @returns {Object} A control object with functions for controlling the viewer.
 */
const MetAtlasViewer = (targetElement) => {
  const container = document.getElementById(targetElement);

  // Camera variables
  let fieldOfView = 90;
  let aspect = container.offsetWidth / container.offsetHeight;
  let near = 1;
  let far = 10000;
  let camera = new PerspectiveCamera(fieldOfView, aspect, near, far);
  camera.position.z = 3000;
  let nodeSelectCallback, updateCameraCallback;

  const cameraDefault = {
    position: Object.assign({}, camera.position),
    up: Object.assign({}, camera.up),
    target: Object.assign({}, camera.up),
  };
  const flyTarget = {
    active: false,
    start: undefined,
    startUp: undefined,
    end: undefined,
    target: undefined,
    startTime: undefined,
    targetUp: undefined,
    runTime: 750,
  };

  // Create the scene and set background
  let scene = new Scene();
  scene.background = new Color(0xdddddd);

  // Create color picking scene and target
  const indexScene = new Scene();
  indexScene.background = new Color(0xffffff);
  const indexTarget = new WebGLRenderTarget(1, 1);

  // Create object group for the graph
  let graph = new Group();

  // Create nodeMesh and connectionMesh as globals so that we can modify them
  // later
  let nodeMesh;
  let connectionMesh;

  // Create color and material arrays for the nodes
  let nodeColors = [];
  let indexColors = [];

  // Create a list to keep track of selected nodes.
  const selected = [];

  // Create another reference to keep track of hover-selected node
  let hoverNode;

  // Create a texture loader for later
  const textureLoader = new TextureLoader();

  // Create renderer
  let renderer = new WebGLRenderer();
  renderer.setSize(container.offsetWidth, container.offsetHeight);

  // Add the renderer to the target element
  container.appendChild(renderer.domElement);

  // Add a label-renderer for node labels
  let labelRenderer = createLabelRenderer(
    container.offsetWidth,
    container.offsetHeight
  );
  container.appendChild(labelRenderer.domElement);

  const labels = new Group();
  graph.add(labels);

  // and label controls
  let showLabels = true;
  let labelDistance = 200;

  // Create a div to use for node mouseover information
  const infoBox = createInfoBox();
  container.appendChild(infoBox);

  // Set a camera control placeholder
  let cameraControls;

  // holds information to connect nodes to graph id's
  let nodeInfo = [];

  // initial data for setData, this should only be set once
  let initialData = null;

  let showGenes = true;

  // animation id to be used when disposing scene
  let animationId;

  /**
   * Sets the graph data to display in the viewer.
   *
   * The data should be formatted as:
   * nodes = [{id: <node ID>, pos: (<x-pos>, <y-pos>, <z-pos>), g: <group>,
   *           (optional) color: [<r>, <g>, <b>],
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
  const setData = async ({ graphData, nodeTextures, nodeSize }) => {
    if (!initialData) {
      initialData = {
        graphData,
        nodeTextures,
        nodeSize,
      };
    }

    // reset graph
    scene.remove(graph);
    indexScene.remove(indexScene.children[0]);
    animationId = requestAnimationFrame(render);
    graph = new Group();
    nodeInfo = [];
    nodeColors = [];
    indexColors = [];

    let nodes = graphData.nodes;
    let links = graphData.links;

    // Make an index to keep track of nodes for the connections
    const nodeIndex = {};

    // create the node and index geometries
    const nodeGeometry = new BufferGeometry();
    const indexGeometry = new BufferGeometry();

    // Sort the vertex positions by group, so that we can set the materials
    // properly
    nodes.sort((a, b) => a.g.localeCompare(b.g));

    // Sort the materials as well so that the arrays match
    nodeTextures.sort((a, b) => a.group.localeCompare(b.group));

    // Set node positions and colors, and set a unique index color for each
    // node. The index color will be used for selecting nodes in the scene.
    const nodePositions = [];
    const nodeGroups = {};
    nodes.forEach((node, i) => {
      nodePositions.push.apply(nodePositions, node.pos);
      if (nodeGroups[node.g] === undefined) {
        nodeGroups[node.g] = 1;
      } else {
        nodeGroups[node.g] += 1;
      }
      let color = node.color ? node.color : defaultColors["nodeDefaultColor"];
      nodeColors.push.apply(nodeColors, color);
      indexColors.push(
        Math.floor(i / (256 * 256)),
        Math.floor(i / 256) % 256,
        i % 256
      );
      // update index
      nodeIndex[node.id] = { pos: node.pos, index: i };

      const label = createLabel(node);

      // update info
      nodeInfo.push({
        id: node.id,
        n: node.n,
        pos: node.pos,
        color: node.color ? node.color : defaultColors["nodeDefaultColor"],
        connections: { to: [], from: [] },
        index: i,
        label: label,
        group: node.g,
      });
    });
    scene.add(labels);

    // bind arrays to node geometry attributes
    nodeGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(nodePositions, 3)
    );
    nodeGeometry.setAttribute(
      "color",
      new Uint8BufferAttribute(nodeColors, 3, true)
    );
    nodeGeometry.computeBoundingSphere();

    let last = 0;
    // Set material groups
    nodeTextures.forEach((texture, i) => {
      let current = nodeGroups[texture.group];
      nodeGeometry.addGroup(last, current, i);
      indexGeometry.addGroup(last, current, i);
      last += current;
    });

    // Set index geometry attributes
    indexGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(nodePositions, 3)
    );
    indexGeometry.setAttribute(
      "color",
      new Uint8BufferAttribute(indexColors, 3, true)
    );

    const linePositions = [];
    const lineColors = [];

    for (let i = 0; i < links.length; i++) {
      // Check the the nodes are in the graph
      if (!(links[i].s in nodeIndex)) {
        console.warn(
          "ignoring link: '" +
            links[i].s +
            "' to '" +
            links[i].t +
            ". The start node is not in the node list."
        );
        continue;
      }
      if (!(links[i].t in nodeIndex)) {
        console.warn(
          "ignoring link: '" +
            links[i].s +
            "' to '" +
            links[i].t +
            ". The end node is not in the node list."
        );
        continue;
      }
      // Start position and color
      linePositions.push.apply(linePositions, nodeIndex[links[i].s].pos);
      lineColors.push.apply(lineColors, defaultColors["connectionStartColor"]);

      // End position and color
      linePositions.push.apply(linePositions, nodeIndex[links[i].t].pos);
      lineColors.push.apply(lineColors, defaultColors["connectionEndColor"]);

      // Add connections to nodeInfo
      // to:
      nodeInfo[nodeIndex[links[i].s].index].connections.to.push({
        index: i * 2 + 1,
        neighbor: links[i].t,
      });
      // from:
      nodeInfo[nodeIndex[links[i].t].index].connections.from.push({
        index: i * 2,
        neighbor: links[i].s,
      });
    }

    // set line geometry attributes and mesh.
    const lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(linePositions, 3)
    );
    lineGeometry.setAttribute(
      "color",
      new Uint8BufferAttribute(lineColors, 3, true)
    );

    connectionMesh = new LineSegments(lineGeometry, lineMaterial);
    // Add the lines to the graph group and set it to render first
    graph.add(connectionMesh);
    connectionMesh.renderOrder = 0;

    let promises = [];
    const nodeMaterials = [];
    const indexMaterials = [];
    nodeTextures.forEach((tex) => {
      promises.push(
        new Promise((resolve) => {
          const sprite = textureLoader.load(tex.sprite, () => {
            nodeMaterials.push(createPointsMaterial(nodeSize, sprite));

            const indexSprite = textureLoader.load(makeIndexSprite(sprite));
            indexSprite.magFilter = NearestFilter;
            indexSprite.minFilter = NearestFilter;

            indexMaterials.push(createPointsMaterial(nodeSize, indexSprite));
            resolve("texture loaded");
          });
        })
      );
    });

    return Promise.all(promises).then(() => {
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
      animationId = requestAnimationFrame(render);
    });
  };

  /**
   * Sets the default colors
   *
   * @param {*} colors - colors objects
   * value should be array of 3 integers to represent RGB
   * valid keys:
   * - nodeDefaultColor
   * - connectionStartColor
   * - connectionEndColor
   * - nodeSelectColor
   * - connectionSelectColor
   * - hoverSelectColor
   * - hoverConnectionColor
   */
  const setColors = (colors) => {
    const keys = Object.keys(colors);
    const validKeys = Object.keys(defaultColors);

    keys.forEach((key) => {
      if (validKeys.includes(key)) {
        defaultColors[key] = colors[key];
      }
    });
  };

  /**
   * Selects nodes in the graph based on a filter.
   *
   * @param {*} filter - filter object, whose keys-value pairs will be compared
   *     to the nodes. If a node has the same key-value pair it will be
   *     selected.
   */
  const selectBy = (filter) => {
    for (let key of Object.keys(filter)) {
      if (!Array.isArray(filter[key])) {
        filter[key] = [filter[key]];
      }
    }

    const items = nodeInfo
      .filter((v) => {
        for (const key of Object.keys(filter)) {
          if (filter[key].includes(v[key])) {
            return true;
          }
        }
        return false;
      })
      .map((i) => {
        return i.index;
      });
    select(items);

    focusOnItems(items);

    // render the scene to make sure that it's updated
    animationId = requestAnimationFrame(render);
  };

  /**
   * Given a lisf of nodes, `items`, this function will calculate the center
   * point of the nodes, then set the camera to point along a vector from that
   * point to the world center.
   *
   * The function will attempt to move the camera backwards along the vector
   * until all items are inside the camera frustum.
   */
  const focusOnItems = (items) => {
    // move camera to view items.
    if (items.length > 0) {
      let p = midPoint(items);
      let l = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);

      let cameraDistance = 50; // default, for single items

      let t = {
        x: p.x + (p.x / l) * cameraDistance,
        y: p.y + (p.y / l) * cameraDistance,
        z: p.z + (p.z / l) * cameraDistance,
      };

      let cameraStep = 50;
      let maxDistance = 3000 - l;
      if (items.length > 1) {
        // copy camera to move it around without having to mess with the scene,
        // but make the FoV slightly narrower to make sure things are inside the
        // visible portion of the view on the main camera.
        let testCamera = new PerspectiveCamera(
          fieldOfView - 10,
          aspect,
          near,
          far
        );
        moveCamera(testCamera, t);

        while (!isInCamera(items, testCamera) && cameraDistance < maxDistance) {
          // move camera back until we've reached the max distance or we can see
          // all object in the camera
          cameraDistance += cameraStep;
          t = {
            x: p.x + (p.x / l) * cameraDistance,
            y: p.y + (p.y / l) * cameraDistance,
            z: p.z + (p.z / l) * cameraDistance,
          };
          moveCamera(testCamera, t);
        }
      }
      setFlyTarget(t);
    }
  };

  /**
   * returns the midpoints given a list of node index numbers.
   *
   * @param {*} items Items to get midpoint for
   */
  const midPoint = (items) => {
    let s = items
      .map((i) => nodeInfo[i])
      .reduce(
        (a, b) => {
          return { x: a.x + b.pos[0], y: a.y + b.pos[1], z: a.z + b.pos[2] };
        },
        { x: 0, y: 0, z: 0 }
      );
    return {
      x: s.x / items.length,
      y: s.y / items.length,
      z: s.z / items.length,
    };
  };

  /**
   * Given a number of items and a camera, this function will return true if all
   * items are inside the camera frustum.
   *
   * @param {*} items - A list of node id's
   * @param {*} cam - The camera to test with
   */
  const isInCamera = (items, cam) => {
    let retval = true;
    const frustum = createFrustum(cam);
    items
      .map((i) => nodeInfo[i])
      .forEach((node) => {
        let pos = { x: node.pos[0], y: node.pos[1], z: node.pos[2] };
        retval = retval && frustum.containsPoint(pos);
      });
    return retval;
  };

  /**
   * Mouse move callback that does scene object picking.
   * @param {event} event - A mouse move event
   */
  const onMouseMove = (event) => {
    const items = pickInScene(event);
    items.forEach((id) => {
      infoBox.style.top = (event.clientY + 5).toString() + "px";
      infoBox.style.left = (event.clientX + 5).toString() + "px";
      infoBox.style.visibility = "visible";
      infoBox.innerHTML = nodeInfo[id].n;
    });
    if (items.length == 0) {
      infoBox.style.visibility = "hidden";
    }
    select(items, false);
    animationId = requestAnimationFrame(render);
  };

  const select = (items, persistent = true) => {
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
    items.forEach((id) => {
      if (persistent) {
        selected.push(id);
      } else {
        hoverNode = id;
      }

      // update selected if with red color
      setSpriteColor(
        id,
        persistent
          ? defaultColors["nodeSelectColor"]
          : defaultColors["hoverSelectColor"]
      );

      // update selected connections with blue
      setConnectionsColor(
        id,
        persistent
          ? defaultColors["connectionSelectColor"]
          : defaultColors["hoverConnectionColor"]
      );
    });

    if (persistent) {
      // // focus camera on midpoint
      // let m = midPoint(items);
      // cameraControls.target.copy(m);

      // Create new selection event
      let selectEvent = new CustomEvent("select", {
        detail: {
          items: items.map((i) => {
            return nodeInfo[i];
          }),
        },
        bubbles: false,
        cancelable: true,
      });

      container.dispatchEvent(selectEvent);
    }
  };

  /**
   * Mouse click callback which calls pickInScene to get the current object
   * under the mouse cursor and colors it red.
   *
   * @param {event} - A mouse click event.
   */
  const onMouseClick = (event) => {
    const items = pickInScene(event);

    if (items.length > 0) {
      select(items);
      if (nodeSelectCallback && items.length === 1) {
        nodeSelectCallback(nodeInfo[items[0]]);
      }
    }

    // render the scene to make sure that it's updated
    animationId = requestAnimationFrame(render);
  };

  /**
   * Handles keypresses. Current controls:
   *
   *  - r: reset camera to start position.
   *  - q: reset the selection
   *
   * @param {*} event - A keypress event
   */
  const onKeypress = (event) => {
    if (event.key == "r") {
      resetCamera();
    } else if (event.key == "q") {
      resetSelection();
    } else if (event.key == "l") {
      toggleLabels();
    } else if (event.key == "g") {
      toggleNodeType("e");
    }
  };

  /**
   * Does scene object picking by rendering the pixel at the mouse pointer,
   * converts its color to an index position and returns that id.
   *
   * @param {*} event - An event containing mouse coordinates.
   * @returns {number} ID number of the picked object.
   */
  const pickInScene = (event) => {
    let size = renderer.domElement.getBoundingClientRect();
    let dpr = window.devicePixelRatio || 1;
    const posX = event.clientX - size.x;
    const posY = event.clientY - size.y;

    // set the camera to only render the pixel under the cursor.
    camera.setViewOffset(
      renderer.domElement.width,
      renderer.domElement.height,
      posX * dpr,
      posY * dpr,
      1,
      1
    );

    // change rendering target so that the image stays on the screen
    renderer.setRenderTarget(indexTarget);
    renderer.render(indexScene, camera);

    const pixelBuffer = new Uint8Array(4);

    renderer.readRenderTargetPixels(indexTarget, 0, 0, 1, 1, pixelBuffer);
    // check if the color is white (background)
    if (((pixelBuffer[2] == pixelBuffer[1]) == pixelBuffer[0]) == 255) {
      return;
    }
    const id = (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | pixelBuffer[2];

    // reset the camera and rendering target.
    camera.clearViewOffset();
    renderer.setRenderTarget(null);

    // don't return background color
    if (id == 16777215) {
      return [];
    }

    return [id];
  };

  /**
   * Run the update camera callback with the updated camera position.
   */
  const handleUpdateCamera = () => {
    if (updateCameraCallback) {
      updateCameraCallback(camera.position);
    }
  };

  /**
   * Sets the camera control class, and adds an event listener which calls
   * the render function whenever the controls emit a change event.
   *
   * @param {function} cameraControlClass
   */
  const setCameraControls = (cameraControlClass) => {
    cameraControls = new cameraControlClass(camera, renderer.domElement);
    cameraControls.addEventListener("change", render);
    cameraControls.addEventListener("end", handleUpdateCamera);
    return cameraControls;
  };

  /**
   * Sets the color of 'spriteNum' in the nodeMesh to 'color'.
   *
   * @param {number} spriteNum - id of the sprite in the nodemesh
   * @param {array} color - color to set the sprite to.
   */
  const setSpriteColor = (spriteNum, color = undefined) => {
    if (!nodeInfo[spriteNum]) return;

    let c = color
      ? color
      : selected.includes(spriteNum)
      ? defaultColors["nodeSelectColor"]
      : nodeInfo[spriteNum].color;
    nodeMesh.geometry.attributes.color.array[spriteNum * 3 + 0] = c[0];
    nodeMesh.geometry.attributes.color.array[spriteNum * 3 + 1] = c[1];
    nodeMesh.geometry.attributes.color.array[spriteNum * 3 + 2] = c[2];
    nodeMesh.geometry.attributes.color.needsUpdate = true;
  };

  /**
   * Colors all connections of the sprite selected by `spriteNum`.
   *
   * @param {*} spriteNum - id of the sprite to have it's connections colored
   * @param {*} color - (optional) color to set the connections to. If omitted,
   *     the default connection colors will be used.
   */
  const setConnectionsColor = (spriteNum, color = undefined) => {
    let node = nodeInfo[spriteNum];
    if (!node) return;

    node.connections.from.forEach((conn) => {
      let c = color
        ? color
        : selected.includes(spriteNum)
        ? defaultColors["connectionSelectColor"]
        : defaultColors["connectionStartColor"];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 + 0] = c[0];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 + 1] = c[1];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 + 2] = c[2];

      c = color
        ? color
        : selected.includes(spriteNum)
        ? defaultColors["connectionSelectColor"]
        : defaultColors["connectionEndColor"];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 + 3] = c[0];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 + 4] = c[1];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 + 5] = c[2];
    });
    node.connections.to.forEach((conn) => {
      let c = color
        ? color
        : selected.includes(spriteNum)
        ? defaultColors["connectionSelectColor"]
        : defaultColors["connectionStartColor"];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 - 3] = c[0];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 - 2] = c[1];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 - 1] = c[2];

      c = color
        ? color
        : selected.includes(spriteNum)
        ? defaultColors["connectionSelectColor"]
        : defaultColors["connectionEndColor"];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 + 0] = c[0];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 + 1] = c[1];
      connectionMesh.geometry.attributes.color.array[conn.index * 3 + 2] = c[2];
    });
    connectionMesh.geometry.attributes.color.needsUpdate = true;
  };

  /**
   * Updates the camera projection matrix, and renderer size to the current
   * window size.
   */
  const onWindowResize = () => {
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    if (cameraControls) {
      cameraControls.handleResize();
    }
    animationId = requestAnimationFrame(render);
  };

  /**
   * Sets the camera to the absolute position given by `position`, using the
   * up-vector `up`, and pointing at `target`.
   *
   * @param {*} position - new camera position
   * @param {*} up - new camera up vector
   * @param {*} target - new camera target
   */
  const setCamera = (position, up, target) => {
    camera.position.copy(position);
    if (up) {
      camera.up.copy(up);
    }

    if (target) {
      cameraControls.target.copy(target);
    }
    animationId = requestAnimationFrame(render);
  };

  /**
   * Sets the camera to fly towards being in the position given by `position`,
   * the up-vector `up`, and pointing towards `target`. The duration for the
   * transition is given by `flyTarget.runTime`.
   *
   * @param {*} position - target camera position
   * @param {*} up - target camera up vector
   * @param {*} target - target camera target
   */
  const setFlyTarget = (
    position,
    up = { x: 0, y: 1, z: 0 },
    target = { x: 0, y: 0, z: 0 }
  ) => {
    flyTarget.active = true;
    flyTarget.start = Object.assign({}, camera.position);
    flyTarget.startUp = Object.assign({}, camera.up);
    flyTarget.end = position;
    flyTarget.target = target;
    flyTarget.targetUp = up;
    flyTarget.startTime = new Date().getTime();
  };

  /**
   * Updates the camera with a new position given the time that's transpired
   * between `flyTarget.startTime` and now. If the current time is greater than
   * `flyTarget.startTime` + `flyTarget.runTime`, then the camera will be set to
   * the `flyTarget.end` position, and `flyTarget.active` will be set to
   * `false`.
   */
  const flyUpdate = () => {
    let t = new Date().getTime();
    if (t >= flyTarget.startTime + flyTarget.runTime) {
      flyTarget.active = false;
      setCamera(flyTarget.end, flyTarget.targetUp, flyTarget.target);
    } else {
      let p = (t - flyTarget.startTime) / flyTarget.runTime;
      let p_t = {
        x: flyTarget.start.x + (flyTarget.end.x - flyTarget.start.x) * p,
        y: flyTarget.start.y + (flyTarget.end.y - flyTarget.start.y) * p,
        z: flyTarget.start.z + (flyTarget.end.z - flyTarget.start.z) * p,
      };
      let p_u = {
        x:
          flyTarget.startUp.x +
          (flyTarget.targetUp.x - flyTarget.startUp.x) * p,
        y:
          flyTarget.startUp.y +
          (flyTarget.targetUp.y - flyTarget.startUp.y) * p,
        z:
          flyTarget.startUp.z +
          (flyTarget.targetUp.z - flyTarget.startUp.z) * p,
      };
      setCamera(p_t, p_u, flyTarget.target);
    }
  };

  /**
   * Uses the SetFlyTarget function to reset the camera to the start-position.
   */
  const resetCamera = () => {
    setFlyTarget(
      cameraDefault.position,
      cameraDefault.up,
      cameraDefault.target
    );
  };

  /**
   * Resets the list of selected nodes, and re-points the camera to the world
   * center.
   */
  const resetSelection = () => {
    select([]);
    cameraControls.target.copy({ x: 0, y: 0, z: 0 });
    animationId = requestAnimationFrame(render);
  };

  /**
   * Toggles showing node labels;
   */
  const toggleLabels = () => {
    if (showLabels) {
      clearLabels();
    }
    showLabels = !showLabels;
    animationId = requestAnimationFrame(render);
  };

  /**
   * Toggles showing nodes and links for a node type;
   */
  const toggleNodeType = async (nodeType) => {
    showGenes = !showGenes;

    if (showGenes) {
      return await setData(initialData);
    } else {
      const nodes = initialData.graphData.nodes.filter((n) => n.g !== nodeType);
      const nodeIds = nodes.map((n) => n.id);
      const links = initialData.graphData.links.filter(
        (l) => nodeIds.includes(l.s) && nodeIds.includes(l.t)
      );
      const nodeTextures = initialData.nodeTextures.filter(
        (t) => t.group !== nodeType
      );

      const filteredData = {
        ...initialData,
        graphData: {
          nodes,
          links,
        },
        nodeTextures,
      };
      return await setData(filteredData);
    }
  };

  /**
   * Sets the distance to show node labels.
   *
   * @param {number} newDistance The new label rendering distance
   */
  const setLabelDistance = (newDistance) => {
    labelDistance = newDistance;
    animationId = requestAnimationFrame(render);
  };

  /**
   * Returns a list of all nodes within the given `distance` from the camera.
   */
  const getNodesWithin = (distance) => {
    let nodes = [];

    let testCamera = new PerspectiveCamera(fieldOfView, aspect, near, distance);
    testCamera.position.copy(camera.position);
    testCamera.up.copy(camera.up);
    testCamera.lookAt(cameraControls.target);
    testCamera.updateMatrix();
    testCamera.updateMatrixWorld();
    testCamera.matrixWorldInverse.copy(testCamera.matrixWorld).invert();

    const frustum = createFrustum(testCamera);
    nodeInfo.forEach((node, i) => {
      let p = { x: node.pos[0], y: node.pos[1], z: node.pos[2] };
      if (frustum.containsPoint(p)) {
        nodes.push(i);
      }
    });

    return nodes;
  };

  /**
   * Removes all labels from the scene
   */
  const clearLabels = () => {
    while (labels.children.length > 0) {
      labels.remove(labels.children[0]);
    }
  };

  /**
   * Adds a node label back into the scene.
   *
   * @param {number} node node index of the node to label
   */
  const labelNode = (node) => {
    labels.add(nodeInfo[node].label);
  };

  /**
   * Rendering function.
   */
  const render = () => {
    if (!renderer || !cameraControls) {
      return;
    }

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.render(scene, camera);
    if (showLabels) {
      let nodes = getNodesWithin(labelDistance);
      clearLabels();
      nodes.forEach((node) => {
        labelNode(node);
      });
      labelRenderer.setSize(container.offsetWidth, container.offsetHeight);
      labelRenderer.render(scene, camera);
    }
  };

  /**
   * Starts the animation cycle by repeatedly requesting an animation frame and
   * calling 'render()'.
   */
  const animate = () => {
    animationId = requestAnimationFrame(animate);
    if (flyTarget.active) {
      flyUpdate();
    }
    if (cameraControls) {
      cameraControls.update();
    } else {
      render();
    }
  };

  // Start the rendering cycle
  animate();

  /**
   * Bind callback for when a single node is clicked,
   * used in the onMouseClick function.
   */
  const setNodeSelectCallback = (callback) => {
    nodeSelectCallback = callback;
  };

  /**
   * Bind callback for when the camera is updated.
   */
  const setUpdateCameraCallback = (callback) => {
    updateCameraCallback = callback;
  };

  /**
   * Centers camera on a node
   */
  const centerNode = (node) => {
    let m = midPoint([node.index]);
    cameraControls.target.copy(m);
  };

  /**
   * Set background color
   */
  const setBackgroundColor = (color) => {
    scene.background = new Color(color);
  };

  /**
   * Disposes the viewer
   */
  const dispose = () => {
    // stop animation
    cancelAnimationFrame(animationId);

    // remove event listeners
    renderer.domElement.addEventListener("dblclick", null, false);
    window.removeEventListener("resize", onWindowResize, false);
    window.removeEventListener("mousemove", onMouseMove, false);
    window.removeEventListener("pointerdown", onMouseClick, false);
    window.removeEventListener("keypress", onKeypress, false);

    // dispose objects
    renderer.dispose();
    scene.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.dispose();

      if (object.material.isMaterial) {
        cleanMaterial(object.material);
      } else {
        for (const material of object.material) cleanMaterial(material);
      }
    });

    // clear variables
    renderer = null;
    labelRenderer = null;
    scene = null;
    camera = null;
    cameraControls = null;

    // remove elements
    while (container.lastChild) container.removeChild(container.lastChild);
  };

  const cleanMaterial = (material) => {
    material.dispose();

    // dispose textures
    for (const key of Object.keys(material)) {
      const value = material[key];
      if (value && typeof value === "object" && "minFilter" in value) {
        value.dispose();
      }
    }
  };

  // Add window resize listener and mouse listener
  window.addEventListener("resize", onWindowResize, false);
  window.addEventListener("mousemove", onMouseMove, false);
  window.addEventListener("pointerdown", onMouseClick, false);
  window.addEventListener("keypress", onKeypress, false);

  // Set default controls
  setCameraControls(AtlasViewerControls);

  // Return a "controller" that we can use to interact with the scene.
  return {
    centerNode,
    dispose,
    setBackgroundColor,
    selectBy,
    setCameraControls,
    setColors,
    setData,
    setCamera,
    setNodeSelectCallback,
    setUpdateCameraCallback,
    setLabelDistance,
    toggleLabels,
    toggleNodeType,
  };
};

export { MetAtlasViewer };

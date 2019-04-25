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
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  VertexColors,
  WebGLRenderer
} from 'three-js';

/**
 * Creates the buffers needed to display a quad of size 'size' along the x,y-
 * axes in the given position.
 *
 * @param {Object} position - the position of the quad, given as {x:, y:, z:}.
 * @param {number} size - the length of the quad sides.
 * @returns {Object} - {positions:[], normals:[]}
 */
function getQuadBuffers(position, size) {
  let halfSize = size / 2;
  var buffers = {positions: [], normals: []};

  let z = position[2];
  let mx = position[0] - halfSize;
  let px = position[0] + halfSize;
  let my = position[1] - halfSize;
  let py = position[1] + halfSize;
  buffers.positions.push( mx,py,z, mx,my,z, px,my,z,
                          mx,py,z, px,my,z, px,py,z );

  // temp variables
  var pA = new Vector3();
  var pB = new Vector3();
  var pC = new Vector3();
  var cb = new Vector3();
  var ab = new Vector3();

  // flat face normals
  // (the face is flat so I only calculate normals for one triangle)
  pA.set( mx, py, z );
  pB.set( mx, my, z );
  pC.set( px, my, z );
  cb.subVectors( pC, pB );
  ab.subVectors( pA, pB );
  cb.cross( ab );
  cb.normalize();
  var nx = cb.x;
  var ny = cb.y;
  var nz = cb.z;
  buffers.normals.push( nx,ny,nz, nx,ny,nz, nx,ny,nz,
                        nx,ny,nz, nx,ny,nz, nx,ny,nz );

  return buffers;
}

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
  let far = 4000;
  var camera = new PerspectiveCamera(fieldOfView, aspect, near, far)
  camera.position.z = 3000;

  // Create the scene and set background
  var scene = new Scene();
  scene.background = new Color( 0xdddddd );

  // Create object group for the graph
  var graph = new Group();

  // Create renderer
  var renderer = new WebGLRenderer();
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );

  // Add the renderer to the target element
  document.getElementById(targetElement).appendChild(renderer.domElement);

  // Add window resize listener
  window.addEventListener( 'resize', onWindowResize, false );

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
  function setData(graphData) {
    let nodes = graphData.nodes;
    let links = graphData.links;

    // Make an index to keep track of nodes
    var nodeIndex = {}

    // create the node geometry
    var nodeGeometry = new BufferGeometry();

    var nodePositions = [];
    var nodeNormals = [];
    var nodeColors = [];
    var nodeSize = 20;

    for ( var i = 0; i < nodes.length; i ++ ) {
      var quad = getQuadBuffers(data.nodes[i].pos, nodeSize);
      nodePositions.push.apply(nodePositions, quad.positions);
      nodeNormals.push.apply(nodeNormals, quad.normals);
      // colors
      nodeColors.push( 1.0,1.0,1.0, 1.0,1.0,1.0, 1.0,1.0,1.0,
                       1.0,1.0,1.0, 1.0,1.0,1.0, 1.0,1.0,1.0 );

      // update index
      nodeIndex[nodes[i].id] = nodes[i].pos;
    }
    function disposeArray() {
        this.array = null;
    }

    nodeGeometry.addAttribute('position',
                              new Float32BufferAttribute(nodePositions, 3)
                              .onUpload(disposeArray));
    nodeGeometry.addAttribute('normal',
                              new Float32BufferAttribute(nodeNormals, 3)
                              .onUpload(disposeArray));
    nodeGeometry.addAttribute('color',
                              new Float32BufferAttribute(nodeColors, 3)
                              .onUpload(disposeArray));
    nodeGeometry.computeBoundingSphere();

    var nodeMaterial = new MeshPhongMaterial( {
        color: 0xaaaaaa, specular: 0xffffff, shininess: 250,
        side: DoubleSide, vertexColors: VertexColors
    } );

    var nodeMesh = new Mesh( nodeGeometry, nodeMaterial );
    graph.add( nodeMesh );


    // Create the linkGeometry
    var lineMaterial = new LineBasicMaterial( { vertexColors: VertexColors } );
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
      lineColors.push( 1.0, 0.0, 0.0 );

      // End position and color
      linePositions.push.apply(linePositions, nodeIndex[links[i].t]);
      lineColors.push( 1.0, 0.0, 0.0 );
    }

    var lineGeometry = new BufferGeometry();
    lineGeometry.addAttribute('position',
                              new Float32BufferAttribute(linePositions, 3)
                              .onUpload(disposeArray));
    lineGeometry.addAttribute('color',
                              new Float32BufferAttribute(lineColors, 3)
                              .onUpload(disposeArray));

    var lineMesh = new LineSegments(lineGeometry, lineMaterial);
    graph.add( lineMesh );

    scene.add( graph );
  }

  /**
   * Updates the camera projection matrix, and renderer size to the current
   * window size.
   */
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
  }

  /**
   * Rendering function.
   * Currently applies a small rotation to the scene to make it less boring.
   */
  function render() {
    let time = Date.now() * 0.001;
    graph.rotation.y = time * 0.2;
    renderer.render( scene, camera );
  }

  /**
   * Starts the animation cycle by repeatedly requesting an animation frame and
   * calling 'render()'.
   */
  function animate() {
    requestAnimationFrame(animate);
    render();
  }

  // Start the rendering cycle
  animate();

  // Return an interaction "controller" that we can use to control the scene.
  // (currently it's only used to access the setData function)
  return {setData: setData, };
}

export { MetAtlasViewer };

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
  Color,
  PerspectiveCamera,
  Scene,
  WebGLRenderer
} from 'three-js';

/**
 * Creates a MetAtlasViewer instance in the given DOM element. Currently a
 * PerspectiveCamera, a Scene, and a WebGLRenderer are added and a blank scene
 * is rendered.
 *
 * @param {string} targetElement - The target DOM element id for the viewer.
 */
function createAt(targetElement) {
  let fieldOfView = 27;
  let aspect = window.innerWidth / window.innerHeight;
  let near = 1; // closest possible drawing distance
  let far = 4000; // farthest possible drawing distance
  var camera = new PerspectiveCamera(fieldOfView, aspect, near, far);

  var container = document.getElementById(targetElement);
  var scene = new Scene();
  scene.background = new Color( 0xdddddd );

  var renderer = new WebGLRenderer();
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  container.appendChild(renderer.domElement);

  renderer.render( scene, camera );

  // Add window resize listener
  window.addEventListener( 'resize', onWindowResize, false );

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
  }
}

export { createAt };

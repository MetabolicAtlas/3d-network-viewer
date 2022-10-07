/**
 * Cleaner (not nesting everything in the constructor) version of
 * the examples/jsm/controls/TrackballControls.js file from three-js
 */

import { EventDispatcher, Vector2, Vector3, Quaternion } from "three";

const STATE = {
  NONE: -1,
  ROTATE: 0,
  ZOOM: 1,
  PAN: 2,
  TOUCH_ROTATE: 3,
  TOUCH_ZOOM_PAN: 4,
};
const EPS = 0.000001;

// events
const changeEvent = { type: "change" };
const startEvent = { type: "start" };
const endEvent = { type: "end" };

class AtlasViewerControls extends EventDispatcher {
  constructor(object, domElement) {
    super();
    this.object = object;
    this.domElement = domElement !== undefined ? domElement : document;

    // API

    this.enabled = true;

    this.screen = { left: 0, top: 0, width: 0, height: 0 };

    this.rotateSpeed = 1.0;
    this.zoomSpeed = 1.2;
    this.panSpeed = 0.3;

    this.noRotate = false;
    this.noZoom = false;
    this.noPan = false;

    this.staticMoving = false;
    this.dynamicDampingFactor = 0.2;

    this.minDistance = 50;
    this.maxDistance = 5000;

    this.keys = [65 /*A*/, 83 /*S*/, 68 /*D*/];

    // internals

    this.target = new Vector3();
    this.lastPosition = new Vector3();
    this.state = STATE.NONE;
    this.prevState = STATE.NONE;
    this.eye = new Vector3();
    this.movePrev = new Vector2();
    this.moveCurr = new Vector2();
    this.lastAxis = new Vector3();
    this.lastAngle = 0;
    this.zoomStart = new Vector2();
    this.zoomEnd = new Vector2();
    this.touchZoomDistanceStart = 0;
    this.touchZoomDistanceEnd = 0;
    this.panStart = new Vector2();
    this.panEnd = new Vector2();
    this.interval = 50;

    // for reset

    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();
    this.up0 = this.object.up.clone();

    this.setupControls();
    // force an update at start
    this.update();
  }

  // methods

  setupControls() {
    this.mousewheelReset();
    this.domElement.addEventListener(
      "contextmenu",
      this.contextmenu.bind(this),
      false
    );
    this.domElement.addEventListener(
      "mousedown",
      this.mousedown.bind(this),
      false
    );
    this.domElement.addEventListener(
      "mousemove",
      this.mousemove.bind(this),
      false
    );
    this.domElement.addEventListener("mouseup", this.mouseup.bind(this), false);

    this.domElement.addEventListener(
      "wheel",
      this.mousewheel.bind(this),
      false
    );

    this.domElement.addEventListener(
      "touchstart",
      this.touchstart.bind(this),
      false
    );
    this.domElement.addEventListener(
      "touchend",
      this.touchend.bind(this),
      false
    );
    this.domElement.addEventListener(
      "touchmove",
      this.touchmove.bind(this),
      false
    );

    window.addEventListener("keydown", this.keydown.bind(this), false);
    window.addEventListener("keyup", this.keyup.bind(this), false);

    this.handleResize();
  }

  handleResize() {
    if (this.domElement === document) {
      this.screen.left = 0;
      this.screen.top = 0;
      this.screen.width = window.innerWidth;
      this.screen.height = window.innerHeight;
    } else {
      const box = this.domElement.getBoundingClientRect();
      // adjustments come from similar code in the jquery offset() function
      const d = this.domElement.ownerDocument.documentElement;
      this.screen.left = box.left + window.pageXOffset - d.clientLeft;
      this.screen.top = box.top + window.pageYOffset - d.clientTop;
      this.screen.width = box.width;
      this.screen.height = box.height;
    }
  }

  getMouseOnScreen(pageX, pageY) {
    const vector = new Vector2();

    vector.set(
      (pageX - this.screen.left) / this.screen.width,
      (pageY - this.screen.top) / this.screen.height
    );

    return vector;
  }

  getMouseOnCircle(pageX, pageY) {
    const vector = new Vector2();

    vector.set(
      (pageX - this.screen.width * 0.5 - this.screen.left) /
        (this.screen.width * 0.5),
      (this.screen.height + 2 * (this.screen.top - pageY)) / this.screen.width // screen.width intentional
    );

    return vector;
  }

  rotateCamera() {
    let axis = new Vector3(),
      quaternion = new Quaternion(),
      eyeDirection = new Vector3(),
      objectUpDirection = new Vector3(),
      objectSidewaysDirection = new Vector3(),
      moveDirection = new Vector3(),
      angle;

    moveDirection.set(
      this.moveCurr.x - this.movePrev.x,
      this.moveCurr.y - this.movePrev.y,
      0
    );
    angle = moveDirection.length();

    if (angle) {
      this.eye.copy(this.object.position).sub(this.target);

      eyeDirection.copy(this.eye).normalize();
      objectUpDirection.copy(this.object.up).normalize();
      objectSidewaysDirection
        .crossVectors(objectUpDirection, eyeDirection)
        .normalize();

      objectUpDirection.setLength(this.moveCurr.y - this.movePrev.y);
      objectSidewaysDirection.setLength(this.moveCurr.x - this.movePrev.x);

      moveDirection.copy(objectUpDirection.add(objectSidewaysDirection));

      axis.crossVectors(moveDirection, this.eye).normalize();

      angle *= this.rotateSpeed;
      quaternion.setFromAxisAngle(axis, angle);

      this.eye.applyQuaternion(quaternion);
      this.object.up.applyQuaternion(quaternion);

      this.lastAxis.copy(axis);
      this.lastAngle = angle;
    } else if (!this.staticMoving && this.lastAngle) {
      this.lastAngle *= Math.sqrt(1.0 - this.dynamicDampingFactor);
      this.eye.copy(this.object.position).sub(this.target);
      quaternion.setFromAxisAngle(this.lastAxis, this.lastAngle);
      this.eye.applyQuaternion(quaternion);
      this.object.up.applyQuaternion(quaternion);
    }

    this.movePrev.copy(this.moveCurr);
  }

  zoomCamera() {
    let factor;

    if (this.state === STATE.TOUCH_ZOOM_PAN) {
      factor = this.touchZoomDistanceStart / this.touchZoomDistanceEnd;
      this.touchZoomDistanceStart = this.touchZoomDistanceEnd;
      this.eye.multiplyScalar(factor);
    } else {
      factor = 1.0 + (this.zoomEnd.y - this.zoomStart.y) * this.zoomSpeed;

      if (factor !== 1.0 && factor > 0.0) {
        this.eye.multiplyScalar(factor);
      }

      if (this.staticMoving) {
        this.zoomStart.copy(this.zoomEnd);
      } else {
        this.zoomStart.y +=
          (this.zoomEnd.y - this.zoomStart.y) * this.dynamicDampingFactor;
      }
    }
  }

  panCamera() {
    const mouseChange = new Vector2(),
      objectUp = new Vector3(),
      pan = new Vector3();

    mouseChange.copy(this.panEnd).sub(this.panStart);

    if (mouseChange.lengthSq()) {
      mouseChange.multiplyScalar(this.eye.length() * this.panSpeed);

      pan.copy(this.eye).cross(this.object.up).setLength(mouseChange.x);
      pan.add(objectUp.copy(this.object.up).setLength(mouseChange.y));

      this.object.position.add(pan);
      this.target.add(pan);

      if (this.staticMoving) {
        this.panStart.copy(this.panEnd);
      } else {
        this.panStart.add(
          mouseChange
            .subVectors(this.panEnd, this.panStart)
            .multiplyScalar(this.dynamicDampingFactor)
        );
      }
    }
  }

  checkDistances() {
    if (!this.noZoom || !this.noPan) {
      if (this.eye.lengthSq() > this.maxDistance * this.maxDistance) {
        this.object.position.addVectors(
          this.target,
          this.eye.setLength(this.maxDistance)
        );
        this.zoomStart.copy(this.zoomEnd);
      }

      if (this.eye.lengthSq() < this.minDistance * this.minDistance) {
        this.object.position.addVectors(
          this.target,
          this.eye.setLength(this.minDistance)
        );
        this.zoomStart.copy(this.zoomEnd);
      }
    }
  }

  update() {
    this.eye.subVectors(this.object.position, this.target);

    if (!this.noRotate) {
      this.rotateCamera();
    }

    if (!this.noZoom) {
      this.zoomCamera();
    }

    if (!this.noPan) {
      this.panCamera();
    }

    this.object.position.addVectors(this.target, this.eye);

    this.checkDistances();

    this.object.lookAt(this.target);

    if (this.lastPosition.distanceToSquared(this.object.position) > EPS) {
      this.dispatchEvent(changeEvent);

      this.lastPosition.copy(this.object.position);
    }
  }

  reset() {
    this.state = STATE.NONE;
    this.prevState = STATE.NONE;

    this.target.copy(this.target0);
    this.object.position.copy(this.position0);
    this.object.up.copy(this.up0);

    this.eye.subVectors(this.object.position, this.target);

    this.object.lookAt(this.target);

    this.dispatchEvent(changeEvent);

    this.lastPosition.copy(this.object.position);
  }

  // listeners

  keydown(event) {
    if (this.enabled === false) return;

    window.removeEventListener("keydown", this.keydown.bind(this));

    this.prevState = this.state;

    if (this.state !== STATE.NONE) {
      return;
    } else if (event.keyCode === this.keys[STATE.ROTATE] && !this.noRotate) {
      this.state = STATE.ROTATE;
    } else if (event.keyCode === this.keys[STATE.ZOOM] && !this.noZoom) {
      this.state = STATE.ZOOM;
    } else if (event.keyCode === this.keys[STATE.PAN] && !this.noPan) {
      this.state = STATE.PAN;
    }
  }

  keyup() {
    if (this.enabled === false) return;

    this.state = this.prevState;

    window.addEventListener("keydown", this.keydown.bind(this), false);
  }

  mousedown(event) {
    if (this.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    if (this.state === STATE.NONE) {
      this.state = event.button;
    }

    if (this.state === STATE.ROTATE && !this.noRotate) {
      this.moveCurr.copy(this.getMouseOnCircle(event.pageX, event.pageY));
      this.movePrev.copy(this.moveCurr);
    } else if (this.state === STATE.ZOOM && !this.noZoom) {
      this.zoomStart.copy(this.getMouseOnScreen(event.pageX, event.pageY));
      this.zoomEnd.copy(this.zoomStart);
    } else if (this.state === STATE.PAN && !this.noPan) {
      this.panStart.copy(this.getMouseOnScreen(event.pageX, event.pageY));
      this.panEnd.copy(this.panStart);
    }

    this.dispatchEvent(startEvent);
  }

  mousemove(event) {
    if (this.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    if (this.state === STATE.ROTATE && !this.noRotate) {
      this.movePrev.copy(this.moveCurr);
      this.moveCurr.copy(this.getMouseOnCircle(event.pageX, event.pageY));
    } else if (this.state === STATE.ZOOM && !this.noZoom) {
      this.zoomEnd.copy(this.getMouseOnScreen(event.pageX, event.pageY));
    } else if (this.state === STATE.PAN && !this.noPan) {
      this.panEnd.copy(this.getMouseOnScreen(event.pageX, event.pageY));
    }
  }

  mouseup(event) {
    if (this.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    this.state = STATE.NONE;

    this.dispatchEvent(endEvent);
  }

  mousewheelReset() {
    this.marker = true;
    this.counter1 = 0;
    this.counter2 = null;
    this.counter3 = null;
    this.counter4 = null;
  }

  mousewheel(event) {
    if (this.enabled === false) return;

    if (this.noZoom === true) return;

    event.preventDefault();
    event.stopPropagation();

    switch (event.deltaMode) {
      case 2:
        // Zoom in pages
        this.zoomStart.y -= event.deltaY * 0.025;
        break;

      case 1:
        // Zoom in lines
        this.zoomStart.y -= event.deltaY * 0.01;
        break;

      default:
        // undefined, 0, assume pixels
        this.zoomStart.y -= event.deltaY * 0.00025;
        break;
    }

    this.counter1++;

    if (this.marker) this.mousewheelStart();

    return false;
  }

  mousewheelStart() {
    this.dispatchEvent(startEvent);

    this.marker = false;

    this.mousewheelContinue();

    this.counter3 = new Date();
  }

  mousewheelContinue() {
    this.counter2 = this.counter1;

    setTimeout(() => {
      if (this.counter2 == this.counter1) {
        this.mousewheelEnd();
      } else {
        this.mousewheelContinue();
      }
    }, this.interval);
  }

  mousewheelEnd() {
    this.mousewheelReset();

    this.dispatchEvent(endEvent);
  }

  touchstart(event) {
    if (this.enabled === false) return;

    event.preventDefault();

    switch (event.touches.length) {
      case 1:
        this.state = STATE.TOUCH_ROTATE;
        this.moveCurr.copy(
          this.getMouseOnCircle(event.touches[0].pageX, event.touches[0].pageY)
        );
        this.movePrev.copy(this.moveCurr);
        break;

      default:
        // 2 or more
        this.state = STATE.TOUCH_ZOOM_PAN;
        var dx = event.touches[0].pageX - event.touches[1].pageX;
        var dy = event.touches[0].pageY - event.touches[1].pageY;
        this.touchZoomDistanceEnd = this.touchZoomDistanceStart = Math.sqrt(
          dx * dx + dy * dy
        );

        var x = (event.touches[0].pageX + event.touches[1].pageX) / 2;
        var y = (event.touches[0].pageY + event.touches[1].pageY) / 2;
        this.panStart.copy(this.getMouseOnScreen(x, y));
        this.panEnd.copy(this.panStart);
        break;
    }

    this.dispatchEvent(startEvent);
  }

  touchmove(event) {
    if (this.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    switch (event.touches.length) {
      case 1:
        this.movePrev.copy(this.moveCurr);
        this.moveCurr.copy(
          this.getMouseOnCircle(event.touches[0].pageX, event.touches[0].pageY)
        );
        break;

      default:
        // 2 or more
        var dx = event.touches[0].pageX - event.touches[1].pageX;
        var dy = event.touches[0].pageY - event.touches[1].pageY;
        this.touchZoomDistanceEnd = Math.sqrt(dx * dx + dy * dy);

        var x = (event.touches[0].pageX + event.touches[1].pageX) / 2;
        var y = (event.touches[0].pageY + event.touches[1].pageY) / 2;
        this.panEnd.copy(this.getMouseOnScreen(x, y));
        break;
    }
  }

  touchend(event) {
    if (this.enabled === false) return;

    switch (event.touches.length) {
      case 0:
        this.state = STATE.NONE;
        break;

      case 1:
        this.state = STATE.TOUCH_ROTATE;
        this.moveCurr.copy(
          this.getMouseOnCircle(event.touches[0].pageX, event.touches[0].pageY)
        );
        this.movePrev.copy(this.moveCurr);
        break;
    }

    this.dispatchEvent(endEvent);
  }

  contextmenu(event) {
    if (this.enabled === false) return;

    event.preventDefault();
  }

  dispose() {
    this.domElement.removeEventListener(
      "contextmenu",
      this.contextmenu.bind(this),
      false
    );
    this.domElement.removeEventListener(
      "mousedown",
      this.mousedown.bind(this),
      false
    );
    this.domElement.removeEventListener(
      "wheel",
      this.mousewheel.bind(this),
      false
    );

    this.domElement.removeEventListener(
      "touchstart",
      this.touchstart.bind(this),
      false
    );
    this.domElement.removeEventListener(
      "touchend",
      this.touchend.bind(this),
      false
    );
    this.domElement.removeEventListener(
      "touchmove",
      this.touchmove.bind(this),
      false
    );

    document.removeEventListener("mousemove", this.mousemove.bind(this), false);
    document.removeEventListener("mouseup", this.mouseup.bind(this), false);

    window.removeEventListener("keydown", this.keydown.bind(this), false);
    window.removeEventListener("keyup", this.keyup.bind(this), false);
  }
}

export { AtlasViewerControls };

/**
 * This is a slightly modified version of the three-js TrackballControls.js,
 * which has been adapted to the specific case of working with the metabolic
 * atlas viewer.
 *
 * original authors:
 * @author Eberhard Graether / http://egraether.com/
 * @author Mark Lundin     / http://mark-lundin.com
 * @author Simone Manini / http://daron1337.github.io
 * @author Luca Antiga     / http://lantiga.github.io
 */

import {
    EventDispatcher,
    Vector2,
    Vector3,
    Quaternion
} from 'three-js';


let defaultControlMap = {mouse: {main: 'select',
                                 aux: 'pan',
                                 secondary: 'rotate'},
                         wheel: {x: 'rotate',
                                 y: 'zoom',
                                 z: 'pan'},
                         touch: {1: 'select',
                                 2: 'rotate',
                                 3: 'pan'}
                        };


/**
 * Creates a new set of metabolic atlas viewer controls. This function is
 * heavily based on the three-js TrackballControls.js.
 *
 * @param {Camera} object - The three-js camera object that is to be controlled.
 * @param {domElement} domElement - The DOM element that the three-js renderer
 *     context is attached to (or where the controls should be active).
 */
var AtlasViewerControls = function( object, domElement, controlMap = defaultControlMap) {

    var _this = this;
    var STATE = { NONE: - 1, ROTATE: 0, ZOOM: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_ZOOM_PAN: 4 };

    this.mouseButtons = {0: 'main', 1: 'aux', 2: 'secondary'};
    this.controlMap = controlMap;
    this.object = object;
    this.domElement = ( domElement !== undefined ) ? domElement : document;

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

    this.minDistance = 0;
    this.maxDistance = Infinity;

    this.keys = [ 65 /*A*/, 83 /*S*/, 68 /*D*/ ];

    // internals

    this.target = new Vector3();

    var EPS = 0.000001;

    var lastPosition = new Vector3();

    var _state = STATE.NONE,
        _prevState = STATE.NONE,

        _eye = new Vector3(),

        _movePrev = new Vector2(),
        _moveCurr = new Vector2(),

        _lastAxis = new Vector3(),
        _lastAngle = 0,

        _zoomStart = new Vector2(),
        _zoomEnd = new Vector2(),

        _touchZoomDistanceStart = 0,
        _touchZoomDistanceEnd = 0,

        _panStart = new Vector2(),
        _panEnd = new Vector2();

    // for reset

    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();
    this.up0 = this.object.up.clone();

    // events

    var changeEvent = { type: 'change' };
    var startEvent = { type: 'start' };
    var endEvent = { type: 'end' };


    // methods

    // -- New methods (not in trackballControls.js)

    /**
     * This function performs
     * @param {string} action - A string describing the action that is to be
     *     taken in the scene. Recognized values are 'select', 'rotate', 'pan',
     *     and 'zoom',
     * @param {object} value - An object on the form {x: <value>, y: <value>}
     *     representing the change value for the action. This value is either
     *     {x: event.pageX, y: event.pageY} (for mouse actions), or
     *     {x: event.deltaX, y: event.deltaY} (for wheel actions).
     * @param {boolean} start - Notes that this is the start of a mouse key
     *     event (used to set start values for actions).
     */
    this.resolveAction = function(action, value, start = false) {
        switch(action) {
            case 'select':
                break;
            case 'rotate':
                var pos = getMouseOnCircle( value.x, value.y );
                if (start === true) {
                    _moveCurr.copy( pos );
                }
                _movePrev.copy( pos );
                break;
            case 'pan':
                var pos = getMouseOnScreen( value.x, value.y );
                if (start === true) {
                    _panStart.copy( pos );
                }
                _panEnd.copy( pos );
                break;
            case 'zoom':
                // _zoomStart = value.x;
                break;
            default: console.warn('unknown action:', action); break;
        }
    }

    // original methods (somewhat modified)

    /**
     * Adjusts the left, top, width, and height values in this.screen to the
     * current domElement values.
     */
    this.handleResize = function () {

        if ( this.domElement === document ) {

            this.screen.left = 0;
            this.screen.top = 0;
            this.screen.width = window.innerWidth;
            this.screen.height = window.innerHeight;

        } else {

            var box = this.domElement.getBoundingClientRect();
            // adjustments come from similar code in the jquery offset() function
            var d = this.domElement.ownerDocument.documentElement;
            this.screen.left = box.left + window.pageXOffset - d.clientLeft;
            this.screen.top = box.top + window.pageYOffset - d.clientTop;
            this.screen.width = box.width;
            this.screen.height = box.height;

        }

    };

    /**
     * Returns the current mouse position in the rendering screen.
     *
     * @returns {Vector2} The current mouse position.
     */
    var getMouseOnScreen = ( function () {

        var vector = new Vector2();

        return function getMouseOnScreen( pageX, pageY ) {

            vector.set(
                ( pageX - _this.screen.left ) / _this.screen.width,
                ( pageY - _this.screen.top ) / _this.screen.height
            );

            return vector;

        };

    }() );

    /**
     * Converts the absolute position pageX, pageY to a position relative the
     * center of the rendering domElement, in units of screen width.
     *
     * @returns {Vector2} The resulting center-relative position.
     */
    var getMouseOnCircle = ( function () {

        var vector = new Vector2();

        return function getMouseOnCircle( pageX, pageY ) {

            vector.set(
                ( ( pageX - _this.screen.width * 0.5 - _this.screen.left ) / ( _this.screen.width * 0.5 ) ),
                ( ( _this.screen.height + 2 * ( _this.screen.top - pageY ) ) / _this.screen.width ) // screen.width intentional
            );

            return vector;

        };

    }() );

    /**
     * Converts the vector (_moveCurr - _movePrev) to a rotation angle and
     * applies it to the _eye vector.
     */
    this.rotateCamera = ( function () {

        var axis = new Vector3(),
            quaternion = new Quaternion(),
            eyeDirection = new Vector3(),
            objectUpDirection = new Vector3(),
            objectSidewaysDirection = new Vector3(),
            moveDirection = new Vector3(),
            angle;

        return function rotateCamera() {

            moveDirection.set( _moveCurr.x - _movePrev.x, _moveCurr.y - _movePrev.y, 0 );
            angle = moveDirection.length();

            if ( angle ) {

                _eye.copy( _this.object.position ).sub( _this.target );

                eyeDirection.copy( _eye ).normalize();
                objectUpDirection.copy( _this.object.up ).normalize();
                objectSidewaysDirection.crossVectors( objectUpDirection, eyeDirection ).normalize();

                objectUpDirection.setLength( _moveCurr.y - _movePrev.y );
                objectSidewaysDirection.setLength( _moveCurr.x - _movePrev.x );

                moveDirection.copy( objectUpDirection.add( objectSidewaysDirection ) );

                axis.crossVectors( moveDirection, _eye ).normalize();

                angle *= _this.rotateSpeed;
                quaternion.setFromAxisAngle( axis, angle );

                _eye.applyQuaternion( quaternion );
                _this.object.up.applyQuaternion( quaternion );

                _lastAxis.copy( axis );
                _lastAngle = angle;

            } else if ( ! _this.staticMoving && _lastAngle ) {

                _lastAngle *= Math.sqrt( 1.0 - _this.dynamicDampingFactor );
                _eye.copy( _this.object.position ).sub( _this.target );
                quaternion.setFromAxisAngle( _lastAxis, _lastAngle );
                _eye.applyQuaternion( quaternion );
                _this.object.up.applyQuaternion( quaternion );

            }

            _movePrev.copy( _moveCurr );

        };

    }() );

    /**
     *
     */
    this.zoomCamera = function () {

        var factor;

        if ( _state === STATE.TOUCH_ZOOM_PAN ) {

            factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
            _touchZoomDistanceStart = _touchZoomDistanceEnd;
            _eye.multiplyScalar( factor );

        } else {

            factor = 1.0 + ( _zoomEnd.y - _zoomStart.y ) * _this.zoomSpeed;

            if ( factor !== 1.0 && factor > 0.0 ) {

                _eye.multiplyScalar( factor );

            }

            if ( _this.staticMoving ) {

                _zoomStart.copy( _zoomEnd );

            } else {

                _zoomStart.y += ( _zoomEnd.y - _zoomStart.y ) * this.dynamicDampingFactor;

            }

        }

    };

    /**
     *
     */
    this.panCamera = ( function () {

        var mouseChange = new Vector2(),
            objectUp = new Vector3(),
            pan = new Vector3();

        return function panCamera() {

            mouseChange.copy( _panEnd ).sub( _panStart );

            if ( mouseChange.lengthSq() ) {

                mouseChange.multiplyScalar( _eye.length() * _this.panSpeed );

                pan.copy( _eye ).cross( _this.object.up ).setLength( mouseChange.x );
                pan.add( objectUp.copy( _this.object.up ).setLength( mouseChange.y ) );

                _this.object.position.add( pan );
                _this.target.add( pan );

                if ( _this.staticMoving ) {

                    _panStart.copy( _panEnd );

                } else {

                    _panStart.add( mouseChange.subVectors( _panEnd, _panStart ).multiplyScalar( _this.dynamicDampingFactor ) );

                }

            }

        };

    }() );

    /**
     *
     */
    this.checkDistances = function () {

        if ( ! _this.noZoom || ! _this.noPan ) {

            if ( _eye.lengthSq() > _this.maxDistance * _this.maxDistance ) {

                _this.object.position.addVectors( _this.target, _eye.setLength( _this.maxDistance ) );
                _zoomStart.copy( _zoomEnd );

            }

            if ( _eye.lengthSq() < _this.minDistance * _this.minDistance ) {

                _this.object.position.addVectors( _this.target, _eye.setLength( _this.minDistance ) );
                _zoomStart.copy( _zoomEnd );

            }

        }

    };

    /**
     * The update function is called every animation frame to update the camera
     * to the new position before a draw call.
     */
    this.update = function () {

        _eye.subVectors( _this.object.position, _this.target );

        if ( ! _this.noRotate ) {

            _this.rotateCamera();

        }

        if ( ! _this.noZoom ) {

            _this.zoomCamera();

        }

        if ( ! _this.noPan ) {

            _this.panCamera();

        }

        _this.object.position.addVectors( _this.target, _eye );

        _this.checkDistances();

        _this.object.lookAt( _this.target );

        if ( lastPosition.distanceToSquared( _this.object.position ) > EPS ) {

            _this.dispatchEvent( changeEvent );

            lastPosition.copy( _this.object.position );

        }

    };

    /**
     * Reset function that resets all state, camera, and target variables to
     * their default variables.
     */
    this.reset = function () {

        _state = STATE.NONE;
        _prevState = STATE.NONE;

        _this.target.copy( _this.target0 );
        _this.object.position.copy( _this.position0 );
        _this.object.up.copy( _this.up0 );

        _eye.subVectors( _this.object.position, _this.target );

        _this.object.lookAt( _this.target );

        _this.dispatchEvent( changeEvent );

        lastPosition.copy( _this.object.position );

    };

    // listeners

    /**
     *
     * @param {KeyboardEvent} event - A "keydown" event.
     */
    function keydown( event ) {

        if ( _this.enabled === false ) return;

        window.removeEventListener( 'keydown', keydown );

        _prevState = _state;

        if ( _state !== STATE.NONE ) {

            return;

        } else if ( event.keyCode === _this.keys[ STATE.ROTATE ] && ! _this.noRotate ) {

            _state = STATE.ROTATE;

        } else if ( event.keyCode === _this.keys[ STATE.ZOOM ] && ! _this.noZoom ) {

            _state = STATE.ZOOM;

        } else if ( event.keyCode === _this.keys[ STATE.PAN ] && ! _this.noPan ) {

            _state = STATE.PAN;

        }

    }

    /**
     *
     * @param {KeyboardEvent} event - A "keyup" event.
     */
    function keyup( event ) {

        if ( _this.enabled === false ) return;

        _state = _prevState;

        window.addEventListener( 'keydown', keydown, false );

    }

    /**
     *
     * @param {MouseEvent} event - A "mousedown" event.
     */
    function mousedown( event ) {

        if ( _this.enabled === false ) return;

        event.preventDefault();
        event.stopPropagation();

        const button = _this.mouseButtons[event.button];
        const action = _this.controlMap.mouse[button];
        console.log(button, action);
        const value = {x: event.pageX, y: event.pageY}
        _this.resolveAction(action, value, true);

        document.addEventListener( 'mousemove', mousemove, false );
        document.addEventListener( 'mouseup', mouseup, false );

        _this.dispatchEvent( startEvent );

    }

    /**
     *
     * @param {MouseEvent} event - A "mousemove" event.
     */
    function mousemove( event ) {
        if ( _this.enabled === false ) return;

        event.preventDefault();
        event.stopPropagation();

        const button = _this.mouseButtons[event.button];
        const action = _this.controlMap.mouse[button];
        const value = {x: event.pageX, y: event.pageY}
        _this.resolveAction(action, value);
    }

    /**
     *
     * @param {MouseEvent} event - A "mouseup" event.
     */
    function mouseup( event ) {

        if ( _this.enabled === false ) return;

        event.preventDefault();
        event.stopPropagation();

        document.removeEventListener( 'mousemove', mousemove );
        document.removeEventListener( 'mouseup', mouseup );
        _this.dispatchEvent( endEvent );

    }

    /**
     *
     * @param {WheelEvent} event - A "wheel" event.
     */
    function mousewheel( event ) {

        if ( _this.enabled === false ) return;

        if ( _this.noZoom === true ) return;

        event.preventDefault();
        event.stopPropagation();

        // const action = _this.controlMap.wheel;
        // _this.resolveAction(action, event);

        _this.dispatchEvent( startEvent );
        _this.dispatchEvent( endEvent );

    }

    /**
     *
     * @param {TouchEvent} event - A "touchstart" event.
     */
    function touchstart( event ) {

        if ( _this.enabled === false ) return;

        event.preventDefault();

        console.log('touchStart');

        switch ( event.touches.length ) {

            case 1:
                _state = STATE.TOUCH_ROTATE;
                _moveCurr.copy( getMouseOnCircle( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY ) );
                _movePrev.copy( _moveCurr );
                break;

            default: // 2 or more
                _state = STATE.TOUCH_ZOOM_PAN;
                var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
                var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
                _touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt( dx * dx + dy * dy );

                var x = ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX ) / 2;
                var y = ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY ) / 2;
                _panStart.copy( getMouseOnScreen( x, y ) );
                _panEnd.copy( _panStart );
                break;

        }

        _this.dispatchEvent( startEvent );

    }

    /**
     *
     * @param {TouchEvent} event - A "touchmove" event.
     */
    function touchmove( event ) {

        if ( _this.enabled === false ) return;

        event.preventDefault();
        event.stopPropagation();
        console.log('touchMove');

        switch ( event.touches.length ) {

            case 1:
                _movePrev.copy( _moveCurr );
                _moveCurr.copy( getMouseOnCircle( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY ) );
                break;

            default: // 2 or more
                var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
                var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
                _touchZoomDistanceEnd = Math.sqrt( dx * dx + dy * dy );

                var x = ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX ) / 2;
                var y = ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY ) / 2;
                _panEnd.copy( getMouseOnScreen( x, y ) );
                break;

        }

    }

    /**
     * Signals the end of a touch event. Uses the getMouseOnCircle() function to
     * update the current move state. Finally, dispatches an 'end' event.
     *
     * @param {TouchEvent} event - A "touchend" event.
     */
    function touchend( event ) {

        if ( _this.enabled === false ) return;
        console.log('touchEnd');

        switch ( event.touches.length ) {

            case 0:
                _state = STATE.NONE;
                break;

            case 1:
                _state = STATE.TOUCH_ROTATE;
                _moveCurr.copy( getMouseOnCircle( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY ) );
                _movePrev.copy( _moveCurr );
                break;

        }

        _this.dispatchEvent( endEvent );

    }

    /**
     * Prevents the opening of the context menu ("right click menu") in the
     * control area while the controls are enabled.
     *
     * @param {MouseEvent} event - A "contextmenu" event.
     */
    function contextmenu( event ) {

        if ( _this.enabled === false ) return;

        event.preventDefault();

    }

    /**
     * Removes all event listeners that has been added by this controller.
     */
    this.dispose = function () {

        this.domElement.removeEventListener( 'contextmenu', contextmenu, false );
        this.domElement.removeEventListener( 'mousedown', mousedown, false );
        this.domElement.removeEventListener( 'wheel', mousewheel, false );

        this.domElement.removeEventListener( 'touchstart', touchstart, false );
        this.domElement.removeEventListener( 'touchend', touchend, false );
        this.domElement.removeEventListener( 'touchmove', touchmove, false );

        document.removeEventListener( 'mousemove', mousemove, false );
        document.removeEventListener( 'mouseup', mouseup, false );

        window.removeEventListener( 'keydown', keydown, false );
        window.removeEventListener( 'keyup', keyup, false );

    };

    this.domElement.addEventListener( 'contextmenu', contextmenu, false );
    this.domElement.addEventListener( 'mousedown', mousedown, false );
    this.domElement.addEventListener( 'wheel', mousewheel, false );

    this.domElement.addEventListener( 'touchstart', touchstart, false );
    this.domElement.addEventListener( 'touchend', touchend, false );
    this.domElement.addEventListener( 'touchmove', touchmove, false );

    window.addEventListener( 'keydown', keydown, false );
    window.addEventListener( 'keyup', keyup, false );

    this.handleResize();

    // force an update at start
    this.update();

};
AtlasViewerControls.prototype = Object.create( EventDispatcher.prototype );
AtlasViewerControls.prototype.constructor = AtlasViewerControls;


export { AtlasViewerControls };

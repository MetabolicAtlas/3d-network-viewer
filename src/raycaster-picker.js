import { Raycaster, Vector2 } from 'three';

class RaycasterPicker {
  constructor() {
    this.raycaster = new Raycaster();
    this.raycaster.params.Points.threshold = 3; // TODO: this may not be ideal
    this.pointer = new Vector2();
  }

  pick({ scene, camera, event }) {
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, camera);
    const intersects = this.raycaster.intersectObjects(scene.children, false);

    if (intersects.length > 0) {
      return [intersects[0].index];
    }

    return [];
  }
}

export { RaycasterPicker };

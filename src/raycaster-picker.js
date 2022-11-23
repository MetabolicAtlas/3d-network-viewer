import { Raycaster, Vector2 } from 'three';

class RaycasterPicker {
  constructor(size) {
    this.raycaster = new Raycaster();
    this.raycaster.params.Points.threshold = size / 2;
    this.pointer = new Vector2();
  }

  pick({ renderer, scene, camera, event }) {
    const { raycaster, pointer } = this;
    const { clientX, clientY } = event;
    const rect = renderer.domElement.getBoundingClientRect();

    pointer.x = ((clientX - rect.left) / (rect.right - rect.left)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / (rect.bottom - rect.top)) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
      return [intersects[0].index];
    }

    return [];
  }
}

export { RaycasterPicker };

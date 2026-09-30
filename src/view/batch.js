/* Сборщик статической геометрии: сливает сетки по материалам (меньше вызовов отрисовки),
   собирает коллайдеры для физики и точки взаимодействия. */
import * as THREE from "three";
import { mergeAll, box } from "./geo.js";

export class Batch {
  constructor() { this.map = new Map(); this.colliders = []; this.spots = []; }
  add(geo, mat, { cast = true, receive = true, collide = false, matrix = null } = {}) {
    if (!geo) return;
    if (matrix) geo = geo.clone().applyMatrix4(matrix);   // набор может размещаться несколько раз
    const key = mat.uuid + (cast ? "c" : "") + (receive ? "r" : "");
    if (!this.map.has(key)) this.map.set(key, { mat, geos: [], cast, receive });
    this.map.get(key).geos.push(geo);
    if (collide) this.colliders.push(geo);
    return geo;
  }
  /* невидимый коллайдер-параллелепипед */
  wall(w, h, d, x, y, z, ry = 0) { this.colliders.push(box(w, h, d, x, y, z, 0, ry, 0)); }
  build(parent) {
    const meshes = [];
    for (const { mat, geos, cast, receive } of this.map.values()) {
      const m = new THREE.Mesh(mergeAll(geos), mat);
      m.castShadow = cast; m.receiveShadow = receive; m.matrixAutoUpdate = false; m.updateMatrix();
      parent.add(m); meshes.push(m);
    }
    this.map.clear();
    return meshes;
  }
}

/* групповое преобразование: применяет матрицу (позиция/поворот) ко всем геометриям набора */
export function xform(x, y, z, ry = 0, s = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));
}

/* Физика персонажа: капсула против статических коллайдеров (BVH three-mesh-bvh).
   Коллайдеры: мир (ангар, перрон, оборудование) и самолёт (со своей матрицей — он выкатывается на площадку). */
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { mergeAll } from "../view/geo.js";

export class Collider {
  constructor(geos, object3d = null) {
    const g = mergeAll(geos);
    g.boundsTree = new MeshBVH(g, { maxLeafSize: 8 });
    this.geo = g; this.bvh = g.boundsTree;
    this.obj = object3d;                  // если задан — коллайдер в локальных координатах объекта
    this.enabled = true;
  }
  matrix() { return this.obj ? this.obj.matrixWorld : null; }
}

const _seg = new THREE.Line3(), _box = new THREE.Box3(), _inv = new THREE.Matrix4(), _tp = new THREE.Vector3(), _cp = new THREE.Vector3(), _d = new THREE.Vector3();
const _ray = new THREE.Ray();

/* Разрешает пересечения капсулы с коллайдером. seg — в мировых координатах, модифицируется. */
export function resolveCapsule(col, seg, radius) {
  const m = col.matrix();
  _seg.copy(seg);
  if (m) { _inv.copy(m).invert(); _seg.start.applyMatrix4(_inv); _seg.end.applyMatrix4(_inv); }
  _box.makeEmpty(); _box.expandByPoint(_seg.start); _box.expandByPoint(_seg.end);
  _box.min.addScalar(-radius); _box.max.addScalar(radius);
  let hit = false;
  col.bvh.shapecast({
    intersectsBounds: (b) => b.intersectsBox(_box),
    intersectsTriangle: (tri) => {
      const dist = tri.closestPointToSegment(_seg, _tp, _cp);
      if (dist < radius) {
        const depth = radius - dist;
        _d.subVectors(_cp, _tp);
        if (_d.lengthSq() < 1e-12) { tri.getNormal(_d); } else _d.normalize();
        _seg.start.addScaledVector(_d, depth); _seg.end.addScaledVector(_d, depth);
        hit = true;
      }
    },
  });
  if (m) { _seg.start.applyMatrix4(m); _seg.end.applyMatrix4(m); }
  seg.copy(_seg);
  return hit;
}

/* луч против коллайдеров: расстояние до первого пересечения или Infinity */
export function raycastColliders(cols, origin, dir, far) {
  let best = Infinity;
  for (const c of cols) {
    if (!c.enabled) continue;
    _ray.origin.copy(origin); _ray.direction.copy(dir);
    const m = c.matrix();
    let scale = 1;
    if (m) { _inv.copy(m).invert(); _ray.applyMatrix4(_inv); scale = _ray.direction.length(); _ray.direction.normalize(); }
    const h = c.bvh.raycastFirst(_ray, THREE.DoubleSide, 0, far * scale);
    if (h) best = Math.min(best, h.distance / scale);
  }
  return best;
}

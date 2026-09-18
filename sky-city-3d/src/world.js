import * as THREE from 'three';
import { createMaterialLibrary } from './materials.js';

export const AREA_META = Object.freeze([
  { id: 'A', name: '云海停泊台', center: [0, 3, 62] },
  { id: 'B', name: '石桥与城门', center: [0, 5, 40] },
  { id: 'C', name: '巨树庭院', center: [0, 7, 10] },
  { id: 'D', name: '环形拱廊', center: [-17, 7, -8] },
  { id: 'E', name: '空中花园', center: [37, 9, -6] },
  { id: 'F', name: '高塔与观景台', center: [48, 11, -42] },
  { id: 'G', name: '下层遗迹大厅', center: [-23, -3, -23] },
  { id: 'H', name: '外墙云海步道', center: [-49, 3, -13] },
]);

let activeWorld = null;

function configureMesh(mesh, { shadow = true, receive = true } = {}) {
  mesh.castShadow = shadow;
  mesh.receiveShadow = receive;
  return mesh;
}

function mesh(geometry, material, name, options) {
  const result = configureMesh(new THREE.Mesh(geometry, material), options);
  result.name = name;
  return result;
}

function box(group, material, name, size, position, rotation = [0, 0, 0]) {
  const result = mesh(new THREE.BoxGeometry(...size), material, name);
  result.position.set(...position);
  result.rotation.set(...rotation);
  group.add(result);
  return result;
}

function cylinder(group, material, name, radiusTop, radiusBottom, height, position, segments = 16) {
  const result = mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material, name);
  result.position.set(...position);
  group.add(result);
  return result;
}

function addRail(group, material, start, end, y, name) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const center = a.clone().add(b).multiplyScalar(0.5);
  const length = a.distanceTo(b);
  const angle = Math.atan2(b.x - a.x, b.z - a.z);
  box(group, material, `${name}-扶手`, [0.28, 0.25, length], [center.x, y + 1.15, center.z], [0, angle, 0]);
  const count = Math.max(2, Math.floor(length / 3));
  for (let index = 0; index <= count; index += 1) {
    const point = a.clone().lerp(b, index / count);
    box(group, material, `${name}-栏柱-${index + 1}`, [0.35, 2.25, 0.35], [point.x, y, point.z]);
  }
}

function addSteps(group, material, from, to, count, width, name) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const horizontal = new THREE.Vector2(end.x - start.x, end.z - start.z);
  const run = horizontal.length();
  const direction = horizontal.normalize();
  const depth = run / count + 0.08;
  const angle = Math.atan2(direction.x, direction.y);
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    const height = THREE.MathUtils.lerp(start.y, end.y, (index + 1) / count);
    box(
      group,
      material,
      `${name}-${index + 1}`,
      [width, 0.34, depth],
      [THREE.MathUtils.lerp(start.x, end.x, t), height - 0.17, THREE.MathUtils.lerp(start.z, end.z, t)],
      [0, angle, 0],
    );
  }
}

function addRamp(group, material, from, to, width, name) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const length = direction.length();
  const ramp = mesh(new THREE.BoxGeometry(width, 0.55, length), material, name);
  ramp.position.copy(start).add(end).multiplyScalar(0.5);
  ramp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
  group.add(ramp);
  addRail(group, material, [from[0] - width * 0.46, 0, from[2]], [to[0] - width * 0.46, 0, to[2]], (from[1] + to[1]) * 0.5, `${name}-侧栏`);
  return ramp;
}

function addRoot(group, material, points, radius, name) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const root = mesh(new THREE.TubeGeometry(curve, 24, radius, 7, false), material, name);
  group.add(root);
  return root;
}

function addArch(group, materials, position, rotationY, index) {
  const arch = new THREE.Group();
  arch.name = `拱廊单元-${index + 1}`;
  arch.position.set(...position);
  arch.rotation.y = rotationY;
  box(arch, materials.stone, '左柱', [1.25, 5.6, 1.5], [-2.45, 2.8, 0]);
  box(arch, materials.stone, '右柱', [1.25, 5.6, 1.5], [2.45, 2.8, 0]);
  box(arch, materials.stone, '拱顶', [6.1, 1.25, 1.65], [0, 5.1, 0]);
  const wedgeLeft = mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.65, 20, 1, false, 0, Math.PI), materials.stone, '拱券');
  wedgeLeft.rotation.set(0, 0, Math.PI / 2);
  wedgeLeft.position.set(0, 4.3, 0);
  wedgeLeft.scale.z = 0.5;
  arch.add(wedgeLeft);
  group.add(arch);
  return arch;
}

function addMarker(group, area, position, interactiveTargets) {
  const ring = mesh(
    new THREE.RingGeometry(0.62, 0.9, 32),
    new THREE.MeshBasicMaterial({ color: '#efd89c', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    `区域${area}交互落点`,
    { shadow: false, receive: false },
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(...position);
  ring.userData = { area, interactionType: 'waypoint' };
  group.add(ring);
  interactiveTargets.push(ring);
}

function buildTerrain(root, materials) {
  const island = mesh(new THREE.CylinderGeometry(70, 20, 38, 13, 5, false), materials.stoneDark, '浮岛主体');
  island.position.y = -18.5;
  island.scale.z = 0.88;
  island.rotation.y = 0.12;
  root.add(island);
  const upper = mesh(new THREE.CylinderGeometry(67, 62, 1, 15, 2), materials.stone, '浮岛上层地基');
  upper.position.y = 3.7;
  upper.scale.z = 0.87;
  root.add(upper);
  const hanging = new THREE.Group();
  hanging.name = '悬垂岩与根系';
  root.add(hanging);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2 + 0.15;
    const radius = 43 + (index % 3) * 7;
    const rock = mesh(new THREE.ConeGeometry(5 + (index % 2) * 2, 18 + (index % 4) * 4, 6), materials.stoneDark, `悬岩-${index + 1}`);
    rock.position.set(Math.cos(angle) * radius, -29 - (index % 3) * 3, Math.sin(angle) * radius * 0.84);
    rock.rotation.z = (index % 2 ? 1 : -1) * 0.09;
    hanging.add(rock);
  }
  return island;
}

function buildAreaA(group, materials, interactiveTargets, animated) {
  box(group, materials.stoneWarm, '停泊台主平台', [25, 0.8, 17], [0, 2.6, 63]);
  box(group, materials.stone, '停泊台引桥', [8, 0.8, 18], [0, 3.3, 49]);
  [-9, 9].forEach((x) => cylinder(group, materials.copper, '系泊柱', 0.65, 0.8, 3.6, [x, 4.3, 67], 10));
  addRail(group, materials.stone, [-12, 0, 55], [-12, 0, 71], 3.3, '停泊台西栏');
  addRail(group, materials.stone, [12, 0, 55], [12, 0, 71], 3.3, '停泊台东栏');
  const mast = cylinder(group, materials.wood ?? materials.bark, '旧旗杆', 0.16, 0.22, 9, [-8, 7.4, 60], 10);
  const flag = box(group, materials.fabric, '暮色旗帜', [4.2, 2.2, 0.08], [-5.9, 9.2, 60]);
  flag.geometry.translate(2.1, 0, 0);
  flag.userData.baseRotation = flag.rotation.z;
  animated.flags.push(flag);
  mast.castShadow = true;
  addMarker(group, 'A', [0, 3.06, 63], interactiveTargets);
}

function buildAreaB(group, materials, interactiveTargets) {
  box(group, materials.stoneWarm, '石桥桥面', [8.8, 1.1, 22], [0, 4.15, 40]);
  addRail(group, materials.stone, [-4.5, 0, 30], [-4.5, 0, 50], 4.7, '石桥西栏');
  addRail(group, materials.stone, [4.5, 0, 30], [4.5, 0, 50], 4.7, '石桥东栏');
  box(group, materials.stone, '城门左塔', [7.5, 12, 6], [-7.2, 9.6, 29]);
  box(group, materials.stone, '城门右塔', [7.5, 12, 6], [7.2, 9.6, 29]);
  box(group, materials.stone, '城门上梁', [7.2, 3.2, 6], [0, 14, 29]);
  [-7.2, 7.2].forEach((x) => {
    cylinder(group, materials.moss, '塔顶覆苔', 4.3, 4.7, 0.6, [x, 15.9, 29], 10);
  });
  addSteps(group, materials.stoneWarm, [0, 4.7, 31], [0, 6.7, 24], 7, 7.4, '城门内阶');
  addMarker(group, 'B', [0, 4.76, 39], interactiveTargets);
}

function buildAreaC(group, materials, interactiveTargets, animated) {
  cylinder(group, materials.stoneWarm, '庭院圆形地面', 24, 25, 1.2, [0, 6.2, 8], 48);
  const pool = cylinder(group, materials.stone, '古池池沿', 6.1, 6.4, 0.7, [8, 7.1, 14], 32);
  const water = cylinder(group, materials.water, '古池水面', 5.45, 5.45, 0.16, [8, 7.48, 14], 32);
  water.userData.baseY = water.position.y;
  animated.water.push(water);
  pool.receiveShadow = true;
  const trunk = cylinder(group, materials.bark, '巨树主干', 5.6, 7.2, 31, [-4, 21.8, 3], 14);
  trunk.rotation.z = -0.06;
  const rootPoints = [
    [[-4, 8, 3], [-9, 7.4, 5], [-15, 7.1, 11], [-21, 6.9, 13]],
    [[-3, 8, 3], [2, 7.5, 1], [10, 7.1, -2], [19, 7, -5]],
    [[-5, 8, 3], [-5, 7.4, 10], [-2, 7, 17], [2, 6.8, 23]],
    [[-6, 8, 2], [-11, 7, -2], [-13, 6.5, -10], [-18, 5.8, -15]],
  ];
  rootPoints.forEach((points, index) => addRoot(group, materials.bark, points, 1.15 - index * 0.12, `巨树根系-${index + 1}`));
  const branches = [
    [[-4, 30, 3], [-12, 38, 5], [-20, 43, 12]],
    [[-3, 29, 3], [5, 38, 4], [16, 43, 1]],
    [[-4, 34, 2], [-2, 42, -8], [4, 47, -16]],
  ];
  branches.forEach((points, index) => addRoot(group, materials.bark, points, 1.2 - index * 0.15, `巨树枝干-${index + 1}`));
  const crown = new THREE.Group();
  crown.name = '巨树树冠';
  group.add(crown);
  const crownGeometry = new THREE.IcosahedronGeometry(5.6, 1);
  const crownMaterial = materials.foliage;
  const leafClusters = new THREE.InstancedMesh(crownGeometry, crownMaterial, 28);
  leafClusters.name = '树冠叶簇实例';
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 28; index += 1) {
    const angle = index * 2.399;
    const radius = 5 + (index % 5) * 2.1;
    dummy.position.set(-4 + Math.cos(angle) * radius, 41 + (index % 4) * 2.2, 2 + Math.sin(angle) * radius * 0.68);
    dummy.scale.set(1 + (index % 3) * 0.22, 0.75 + (index % 4) * 0.1, 1 + (index % 2) * 0.25);
    dummy.rotation.set(index * 0.07, angle, 0);
    dummy.updateMatrix();
    leafClusters.setMatrixAt(index, dummy.matrix);
  }
  leafClusters.castShadow = true;
  leafClusters.receiveShadow = true;
  crown.add(leafClusters);
  animated.foliage.push(crown);
  addMarker(group, 'C', [0, 7, 13], interactiveTargets);
}

function buildAreaD(group, materials, interactiveTargets) {
  const center = new THREE.Vector3(-3, 7.1, 6);
  const radius = 30;
  const floor = mesh(new THREE.RingGeometry(24, 33, 64), materials.stoneWarm, '环形拱廊地面');
  floor.rotation.x = -Math.PI / 2;
  floor.position.copy(center);
  floor.receiveShadow = true;
  group.add(floor);
  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    if ((index >= 3 && index <= 5) || index === 9 || index === 13) continue;
    addArch(group, materials, [center.x + Math.sin(angle) * radius, 7.2, center.z + Math.cos(angle) * radius], angle, index);
  }
  const rubbleGeometry = new THREE.DodecahedronGeometry(0.75, 0);
  const rubble = new THREE.InstancedMesh(rubbleGeometry, materials.stoneDark, 34);
  rubble.name = '拱廊碎石实例';
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 34; index += 1) {
    const angle = index * 1.72;
    const radiusOffset = 25.2 + (index % 4) * 1.5;
    dummy.position.set(center.x + Math.sin(angle) * radiusOffset, 7.7, center.z + Math.cos(angle) * radiusOffset);
    dummy.scale.setScalar(0.35 + (index % 5) * 0.11);
    dummy.rotation.set(angle * 0.2, angle, angle * 0.1);
    dummy.updateMatrix();
    rubble.setMatrixAt(index, dummy.matrix);
  }
  rubble.castShadow = true;
  rubble.receiveShadow = true;
  group.add(rubble);
  addMarker(group, 'D', [-27, 7.35, 6], interactiveTargets);
}

function buildAreaE(group, materials, interactiveTargets, animated) {
  box(group, materials.stoneWarm, '花园露台', [31, 1.2, 27], [39, 8.1, -4]);
  box(group, materials.stone, '水渠北岸', [27, 0.55, 1], [39, 9, -9]);
  box(group, materials.stone, '水渠南岸', [27, 0.55, 1], [39, 9, -5]);
  const water = box(group, materials.water, '花园水渠', [27, 0.12, 3], [39, 8.89, -7]);
  water.userData.baseY = water.position.y;
  animated.water.push(water);
  box(group, materials.wood ?? materials.bark, '花园长椅座', [5.5, 0.38, 1.2], [32, 10, 5]);
  box(group, materials.wood ?? materials.bark, '花园长椅背', [5.5, 1.6, 0.3], [32, 10.8, 5.5], [-0.1, 0, 0]);
  [-2, 2].forEach((x) => box(group, materials.copper, '长椅脚', [0.3, 1.1, 0.6], [32 + x, 9.5, 5]));

  const robot = new THREE.Group();
  robot.name = '守望机器人雕像';
  robot.position.set(47, 9, 3);
  cylinder(robot, materials.copper, '机器人躯干', 1.4, 1.8, 4.4, [0, 3.2, 0], 8);
  cylinder(robot, materials.copper, '机器人头部', 1.15, 1.25, 1.6, [0, 6.1, 0], 10);
  [-0.4, 0.4].forEach((x) => {
    const eye = mesh(new THREE.SphereGeometry(0.13, 8, 6), materials.copperGlow, '机器人微光眼');
    eye.position.set(x, 6.25, 1.14);
    robot.add(eye);
  });
  [-1, 1].forEach((side) => addRoot(robot, materials.copper, [[side * 1.4, 4, 0], [side * 2.3, 2.7, 0.2], [side * 2.2, 1.3, 0.7]], 0.26, '机器人手臂'));
  group.add(robot);
  animated.glow.push(robot);

  const flowerGeometry = new THREE.ConeGeometry(0.38, 1.4, 5);
  const flowers = new THREE.InstancedMesh(flowerGeometry, materials.foliage, 72);
  flowers.name = '花园植被实例';
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 72; index += 1) {
    const side = index % 2 ? 1 : -1;
    dummy.position.set(25 + (index % 12) * 2.5, 9.45, side * (9 + Math.floor(index / 24) * 2));
    dummy.scale.set(0.7 + (index % 3) * 0.2, 0.8 + (index % 5) * 0.12, 0.7 + (index % 3) * 0.2);
    dummy.rotation.y = index * 1.7;
    dummy.updateMatrix();
    flowers.setMatrixAt(index, dummy.matrix);
  }
  flowers.castShadow = true;
  group.add(flowers);
  addMarker(group, 'E', [39, 8.78, -1], interactiveTargets);
}

function buildAreaF(group, materials, interactiveTargets, animated) {
  const cx = 48;
  const cz = -40;
  cylinder(group, materials.stoneWarm, '高塔基座', 12, 13, 2, [cx, 9, cz], 32);
  // Four wall segments leave a real, walk-through southern doorway and an open interior.
  box(group, materials.stone, '塔底北墙', [18, 7, 2], [cx, 13.5, cz - 9]);
  box(group, materials.stone, '塔底西墙', [2, 7, 18], [cx - 9, 13.5, cz]);
  box(group, materials.stone, '塔底东墙', [2, 7, 18], [cx + 9, 13.5, cz]);
  box(group, materials.stone, '塔底南墙左', [6, 7, 2], [cx - 6, 13.5, cz + 9]);
  box(group, materials.stone, '塔底南墙右', [6, 7, 2], [cx + 6, 13.5, cz + 9]);
  box(group, materials.stone, '塔门上梁', [6, 2, 2], [cx, 16, cz + 9]);
  cylinder(group, materials.stone, '高塔中层环台', 9.5, 10, 0.8, [cx, 13.5, cz], 32);
  cylinder(group, materials.stone, '高塔上层环台', 8.2, 8.7, 0.8, [cx, 15.5, cz], 32);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    cylinder(group, materials.stone, `高塔立柱-${index + 1}`, 0.55, 0.7, 3.1, [cx + Math.cos(angle) * 7.3, 15.2, cz + Math.sin(angle) * 7.3], 10);
  }
  cylinder(group, materials.stoneWarm, '观景台', 10.2, 10.2, 0.8, [cx, 17, cz], 36);
  addRail(group, materials.copper, [cx - 8, 0, cz + 6], [cx + 8, 0, cz + 6], 17.5, '观景台南栏');
  const stairRadius = 5.2;
  for (let index = 0; index < 36; index += 1) {
    const angle = index * 0.43;
    const step = box(group, materials.stoneWarm, `塔内旋梯-${index + 1}`, [3.2, 0.26, 1.25], [cx + Math.cos(angle) * stairRadius, 10.2 + index * 0.19, cz + Math.sin(angle) * stairRadius], [0, -angle, 0]);
    step.geometry.translate(1.1, 0, 0);
  }
  cylinder(group, materials.copper, '高塔核心机关', 0.6, 0.8, 6.4, [cx, 13.4, cz], 12);
  const orb = mesh(new THREE.SphereGeometry(1.45, 16, 12), materials.copperGlow, '高塔机关光球');
  orb.position.set(cx, 15.8, cz);
  group.add(orb);
  animated.glow.push(orb);
  addRamp(group, materials.stoneWarm, [45, 10, -31], [48, 12.5, -37], 3.4, '塔内下层坡道');
  addRamp(group, materials.stoneWarm, [48, 12.5, -37], [43, 15, -42], 3.2, '塔内上层坡道');
  addRamp(group, materials.stoneWarm, [43, 15, -42], [43, 17, -49], 3.2, '观景台坡道');
  addRamp(group, materials.stoneWarm, [43, 17, -49], [29, 11, -46], 4, '高塔西侧坡道');
  addRamp(group, materials.stoneWarm, [29, 11, -46], [10, 9, -48], 4, '北侧高架东段');
  addMarker(group, 'F', [cx, 10.05, cz + 4], interactiveTargets);
}

function buildAreaG(group, materials, interactiveTargets, animated) {
  addSteps(group, materials.stoneDark, [-18, 7, -8], [-22, -6.1, -17], 28, 6.5, '下层折返阶梯');
  box(group, materials.stoneDark, '大厅地面', [31, 1, 28], [-24, -6.5, -27]);
  box(group, materials.stone, '大厅顶板', [31, 1.2, 28], [-24, 5.2, -27]);
  box(group, materials.stone, '大厅西墙北段', [1.5, 11.2, 10], [-39, -0.6, -34]);
  box(group, materials.stone, '大厅西墙南段', [1.5, 11.2, 8], [-39, -0.6, -14]);
  box(group, materials.stone, '大厅西门上梁', [1.5, 3.2, 10], [-39, 3.4, -22]);
  box(group, materials.stone, '大厅北墙', [31, 11.2, 1.5], [-24, -0.6, -40]);
  box(group, materials.stone, '大厅东墙北段', [1.5, 11.2, 8], [-9, -0.6, -36]);
  box(group, materials.stone, '大厅东墙南段', [1.5, 11.2, 8], [-9, -0.6, -18]);
  for (let index = 0; index < 6; index += 1) {
    const x = -34 + (index % 3) * 9;
    const z = -33 + Math.floor(index / 3) * 21;
    cylinder(group, materials.stoneWarm, `大厅内柱-${index + 1}`, 1.1, 1.3, 10.2, [x, -0.8, z], 10);
  }
  const aperture = box(group, materials.glass, '大厅侧面采光口', [0.18, 4.5, 7], [-8.2, -0.6, -27]);
  aperture.renderOrder = 2;
  const machine = new THREE.Group();
  machine.name = '遗迹铜色机关';
  machine.position.set(-24, -5.6, -31);
  [4.6, 3.4, 2.2].forEach((radius, index) => {
    const ring = mesh(new THREE.TorusGeometry(radius, 0.28, 10, 48), index === 1 ? materials.copperGlow : materials.copper, `机关环-${index + 1}`);
    ring.rotation.set(index === 1 ? 0.4 : 0, index * 0.5, 0);
    machine.add(ring);
  });
  group.add(machine);
  animated.machines.push(machine);
  addRamp(group, materials.stoneDark, [-39, -5, -20], [-48, 0, -14], 4, '大厅出岛坡道');
  addRamp(group, materials.stoneWarm, [-48, 0, -14], [-57, 3, -8], 4, '外墙接驳坡道');
  addMarker(group, 'G', [-24, -5.92, -23], interactiveTargets);
}

function buildAreaH(group, materials, interactiveTargets) {
  const points = [
    [-38, 3.8, -43], [-52, 3.2, -31], [-57, 2.6, -8], [-54, 2.8, 20], [-42, 3.1, 45], [-21, 3, 62],
  ];
  addRamp(group, materials.stoneWarm, [10, 9, -48], [-18, 6.5, -46], 4, '北侧高架中段');
  addRamp(group, materials.stoneWarm, [-18, 6.5, -46], [-38, 4, -43], 4, '北侧高架西段');
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = new THREE.Vector3(...points[index]);
    const end = new THREE.Vector3(...points[index + 1]);
    const center = start.clone().add(end).multiplyScalar(0.5);
    const length = start.distanceTo(end);
    const angle = Math.atan2(end.x - start.x, end.z - start.z);
    box(group, materials.stoneWarm, `外墙步道-${index + 1}`, [6.5, 1, length + 0.5], [center.x, center.y, center.z], [0, angle, 0]);
    addRail(group, materials.stone, [start.x - 2.8, 0, start.z], [end.x - 2.8, 0, end.z], center.y + 0.4, `云海侧栏-${index + 1}`);
  }
  box(group, materials.stone, '外墙瞭望亭顶', [8, 0.7, 8], [-57, 9.8, -8]);
  [-60, -54].forEach((x) => [-11, -5].forEach((z) => cylinder(group, materials.stone, '瞭望亭柱', 0.48, 0.58, 6.6, [x, 6.3, z], 10)));
  addMarker(group, 'H', [-55, 3.4, -8], interactiveTargets);
}

function countMetrics(root, materials) {
  let meshes = 0;
  let instances = 0;
  let triangles = 0;
  const geometries = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    if (object.isInstancedMesh) instances += object.count;
    const geometry = object.geometry;
    if (!geometry || geometries.has(geometry)) return;
    geometries.add(geometry);
    const count = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
    triangles += Math.floor(count / 3) * (object.isInstancedMesh ? object.count : 1);
  });
  return {
    worldRootId: root.uuid,
    areaCount: AREA_META.length,
    meshes,
    instances,
    triangles,
    sharedMaterialCount: Object.keys(materials).filter((key) => materials[key]?.isMaterial).length,
  };
}

/** Builds all eight areas in one coordinate system and attaches the stable root to `scene`. */
export function createWorld(scene, { materials: suppliedMaterials } = {}) {
  if (!scene?.isScene && !scene?.isGroup) throw new TypeError('createWorld requires a THREE.Scene or Group');
  const materials = suppliedMaterials ?? createMaterialLibrary();
  const ownsMaterials = !suppliedMaterials;
  const worldRoot = new THREE.Group();
  worldRoot.name = 'skyCityWorldRoot';
  worldRoot.userData.continuousWorld = true;
  scene.add(worldRoot);

  buildTerrain(worldRoot, materials);
  const areaGroups = new Map();
  const interactiveTargets = [];
  const animated = { flags: [], foliage: [], water: [], glow: [], machines: [] };

  const builders = { A: buildAreaA, B: buildAreaB, C: buildAreaC, D: buildAreaD, E: buildAreaE, F: buildAreaF, G: buildAreaG, H: buildAreaH };
  AREA_META.forEach((area) => {
    const group = new THREE.Group();
    group.name = `区域${area.id}-${area.name}`;
    group.userData = { areaId: area.id, areaName: area.name, center: area.center };
    worldRoot.add(group);
    areaGroups.set(area.id, group);
    builders[area.id](group, materials, interactiveTargets, animated);
  });

  const metrics = countMetrics(worldRoot, materials);
  let reducedMotion = false;
  const api = {
    worldRoot,
    areaGroups,
    interactiveTargets,
    materials,
    getMetrics: () => ({ ...metrics }),
    setReducedMotion(value) { reducedMotion = Boolean(value); },
    update(timeSeconds, reduced = reducedMotion) {
      const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
      if (reduced) return;
      animated.flags.forEach((flag, index) => { flag.rotation.y = Math.sin(time * 1.15 + index) * 0.08; });
      animated.foliage.forEach((foliage, index) => { foliage.rotation.z = Math.sin(time * 0.22 + index) * 0.006; });
      animated.water.forEach((water, index) => { water.position.y = water.userData.baseY + Math.sin(time * 0.65 + index) * 0.018; });
      animated.glow.forEach((object, index) => {
        object.traverse((child) => {
          if (child.material?.emissive) child.material.emissiveIntensity = 0.32 + Math.sin(time * 1.1 + index) * 0.12;
        });
      });
      animated.machines.forEach((machine, index) => { machine.rotation.y = time * (0.05 + index * 0.01); });
    },
    dispose() {
      scene.remove(worldRoot);
      const disposed = new Set();
      worldRoot.traverse((object) => {
        if (object.geometry && !disposed.has(object.geometry)) {
          object.geometry.dispose();
          disposed.add(object.geometry);
        }
      });
      if (ownsMaterials) materials.dispose();
      if (activeWorld === api) activeWorld = null;
    },
  };
  activeWorld = api;
  return api;
}

/** Updates the most recently created world; an explicit world handle is also accepted. */
export function updateWorld(timeSeconds, reducedMotion = false, world = activeWorld) {
  world?.update(timeSeconds, reducedMotion);
}

/** Returns serializable scene-budget metrics for the most recently created world. */
export function getWorldMetrics(world = activeWorld) {
  return world?.getMetrics() ?? { worldRootId: null, areaCount: 0, meshes: 0, instances: 0, triangles: 0, sharedMaterialCount: 0 };
}

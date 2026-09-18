/**
 * Shared spatial contract for the entire floating island.
 *
 * Coordinates use metres and follow Three.js' Y-up convention.  Waypoint Y
 * values describe the walking surface; the player controller adds eye height.
 */

export const AREAS = Object.freeze({
  A: Object.freeze({
    id: 'A',
    name: '云海停泊台',
    shortName: '停泊台',
    description: '浮岛南缘的初始落点，可以同时看见城门、巨树和高塔。',
    center: Object.freeze([0, 2, 62]),
    map: Object.freeze([50, 88]),
    accent: '#e8c486',
  }),
  B: Object.freeze({
    id: 'B',
    name: '石桥与城门',
    shortName: '城门',
    description: '跨过断岩的旧石桥与可以真正穿行的拱形城门。',
    center: Object.freeze([0, 4, 39]),
    map: Object.freeze([50, 72]),
    accent: '#bdc5ad',
  }),
  C: Object.freeze({
    id: 'C',
    name: '巨树庭院',
    shortName: '庭院',
    description: '根系环抱水池的中央庭院，也是整座浮岛的视觉中心。',
    center: Object.freeze([0, 6, 10]),
    map: Object.freeze([50, 51]),
    accent: '#9ab57d',
  }),
  D: Object.freeze({
    id: 'D',
    name: '环形拱廊',
    shortName: '拱廊',
    description: '围绕庭院延伸的厚重石廊，连接花园和下层遗迹。',
    center: Object.freeze([-20, 7, -4]),
    map: Object.freeze([36, 42]),
    accent: '#aeb7a7',
  }),
  E: Object.freeze({
    id: 'E',
    name: '空中花园',
    shortName: '花园',
    description: '旧水渠穿过花草与机器人雕像所在的东侧平台。',
    center: Object.freeze([35, 9, -13]),
    map: Object.freeze([72, 39]),
    accent: '#8ab88b',
  }),
  F: Object.freeze({
    id: 'F',
    name: '高塔与观景台',
    shortName: '高塔',
    description: '从塔内折返楼梯登上俯瞰云海的环形露台。',
    center: Object.freeze([43, 17, -45]),
    map: Object.freeze([76, 15]),
    accent: '#d7b87a',
  }),
  G: Object.freeze({
    id: 'G',
    name: '下层遗迹大厅',
    shortName: '遗迹大厅',
    description: '嵌入岛体的古代大厅，根系和铜色机关从石缝中穿过。',
    center: Object.freeze([-32, -6, -20]),
    map: Object.freeze([27, 31]),
    accent: '#b58263',
  }),
  H: Object.freeze({
    id: 'H',
    name: '外墙云海步道',
    shortName: '外墙步道',
    description: '沿西侧外墙绕行的安全步道，可近看悬垂岩层与根系。',
    center: Object.freeze([-49, 3, 18]),
    map: Object.freeze([16, 56]),
    accent: '#91aeb0',
  }),
});

export const MAIN_LOOP = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'H', 'A']);
export const BRANCH_LOOP = Object.freeze(['D', 'G', 'H']);

const point = (id, area, label, position, options = {}) => Object.freeze({
  id,
  area,
  label,
  position: Object.freeze(position),
  pause: options.pause ?? false,
  width: options.width ?? 5,
  heading: options.heading ?? null,
});

/**
 * Hand-verified safe points.  Extra points at stairs, turns and doors keep a
 * route from cutting through architecture when the endpoints are far apart.
 */
export const WAYPOINTS = Object.freeze([
  point('dock', 'A', '停泊台中央', [0, 3.02, 62], { pause: true, width: 7, heading: 0 }),
  point('dock-west', 'A', '西侧系船柱', [-13, 3.02, 59], { width: 5 }),
  point('dock-north', 'A', '停泊台北缘', [0, 3.5, 53], { width: 6 }),

  point('bridge-south', 'B', '石桥南端', [0, 3, 46], { width: 4 }),
  point('bridge-crown', 'B', '石桥拱顶', [0, 4.2, 39], { pause: true, width: 3.5 }),
  point('gate', 'B', '城门门洞', [0, 5, 32], { width: 4 }),
  point('gate-stairs', 'B', '城门石阶', [0, 5.7, 25], { width: 4 }),

  point('courtyard-south', 'C', '庭院南口', [0, 6, 19], { width: 6 }),
  point('courtyard', 'C', '巨树水池', [0, 6, 10], { pause: true, width: 8 }),
  point('root-walk', 'C', '古树根径', [-9, 6.3, 4], { width: 4 }),

  point('arcade-west', 'D', '西侧拱廊', [-20, 7, -3], { pause: true, width: 4 }),
  point('arcade-north', 'D', '北侧拱廊', [-5, 7.2, -13], { width: 4 }),
  point('arcade-east', 'D', '东侧拱廊', [15, 7.5, -7], { width: 4 }),
  point('ruin-stairs-top', 'D', '下层阶梯口', [-18, 7, -8], { width: 3.5 }),

  point('garden-entry', 'E', '花园藤门', [25, 8, -10], { width: 4 }),
  point('garden', 'E', '花园水渠', [36, 9, -15], { pause: true, width: 7 }),
  point('robot', 'E', '守望机器人', [43, 9.5, -22], { width: 5 }),

  point('tower-entry', 'F', '高塔入口', [45, 10, -31], { width: 4 }),
  point('tower-stair-1', 'F', '高塔下层', [48, 12.5, -37], { width: 3 }),
  point('tower-stair-2', 'F', '高塔上层', [43, 15, -42], { width: 3 }),
  point('tower-lookout', 'F', '云海观景台', [43, 17, -49], { pause: true, width: 6 }),
  point('tower-west-ramp', 'F', '高塔西侧坡道', [29, 11, -46], { width: 4 }),
  point('north-causeway-east', 'F', '北侧高架东段', [10, 9, -48], { width: 4 }),
  point('north-causeway-west', 'H', '北侧高架西段', [-18, 6.5, -46], { width: 4 }),

  point('lower-landing', 'G', '遗迹阶梯平台', [-22, -6.1, -17], { width: 3.5 }),
  point('lower-hall', 'G', '下层遗迹大厅', [-24, -6, -23], { pause: true, width: 7 }),
  point('lower-window', 'G', '根系采光口', [-39, -5, -20], { width: 4 }),

  point('wall-north', 'H', '外墙北望台', [-38, 4, -43], { pause: true, width: 4 }),
  point('wall-mid', 'H', '云海长廊', [-57, 3, -8], { width: 4.5 }),
  point('wall-south', 'H', '外墙南角', [-54, 3, 20], { width: 4.5 }),
  point('wall-return', 'H', '停泊台回廊', [-42, 3, 45], { width: 5 }),
]);

/** Undirected walking connections between safe points. */
export const EDGES = Object.freeze([
  ['dock', 'dock-west'],
  ['dock', 'dock-north'],
  ['dock-north', 'bridge-south'],
  ['bridge-south', 'bridge-crown'],
  ['bridge-crown', 'gate'],
  ['gate', 'gate-stairs'],
  ['gate-stairs', 'courtyard-south'],
  ['courtyard-south', 'courtyard'],
  ['courtyard', 'root-walk'],
  ['courtyard', 'arcade-east'],
  ['root-walk', 'arcade-west'],
  ['arcade-west', 'arcade-north'],
  ['arcade-north', 'arcade-east'],
  ['arcade-east', 'garden-entry'],
  ['garden-entry', 'garden'],
  ['garden', 'robot'],
  ['robot', 'tower-entry'],
  ['tower-entry', 'tower-stair-1'],
  ['tower-stair-1', 'tower-stair-2'],
  ['tower-stair-2', 'tower-lookout'],
  ['tower-lookout', 'tower-west-ramp'],
  ['tower-west-ramp', 'north-causeway-east'],
  ['north-causeway-east', 'north-causeway-west'],
  ['north-causeway-west', 'wall-north'],
  ['wall-north', 'wall-mid'],
  ['wall-mid', 'wall-south'],
  ['wall-south', 'wall-return'],
  ['wall-return', 'dock-west'],
  ['arcade-west', 'ruin-stairs-top'],
  ['ruin-stairs-top', 'lower-landing'],
  ['lower-landing', 'lower-hall'],
  ['lower-hall', 'lower-window'],
  ['lower-window', 'wall-mid'],
]);

export const MAIN_TOUR = Object.freeze([
  'dock', 'dock-north', 'bridge-south', 'bridge-crown', 'gate', 'gate-stairs',
  'courtyard-south', 'courtyard', 'root-walk', 'arcade-west', 'arcade-north',
  'arcade-east', 'garden-entry', 'garden',
  'robot', 'tower-entry', 'tower-stair-1', 'tower-stair-2', 'tower-lookout',
  'tower-west-ramp', 'north-causeway-east', 'north-causeway-west', 'wall-north',
  'wall-mid', 'wall-south', 'wall-return',
  'dock-west', 'dock',
]);

export const BRANCH_TOUR = Object.freeze([
  'arcade-west', 'ruin-stairs-top', 'lower-landing', 'lower-hall',
  'lower-window', 'wall-mid',
]);

export const START_WAYPOINT = 'dock';
export const WORLD_EXTENT = Object.freeze({
  min: Object.freeze([-70, -28, -64]),
  max: Object.freeze([65, 38, 76]),
});

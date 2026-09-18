import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AREAS, MAIN_TOUR, WAYPOINTS } from './world-layout.js';
import * as navigation from './navigation.js';
import { createExperienceState } from './state.js';
import { createWorld } from './world.js';
import { createAtmosphere } from './atmosphere.js';
import { createPlayerController } from './player-controller.js';

const canvas = document.querySelector('#world-canvas');
const loading = document.querySelector('#loading');
const loadingCopy = document.querySelector('#loading-copy');
const loadingProgress = document.querySelector('#loading-progress');
const errorPanel = document.querySelector('#error-panel');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const debugErrors = [];

window.addEventListener('error', (event) => debugErrors.push(event.message || String(event.error)));
window.addEventListener('unhandledrejection', (event) => debugErrors.push(String(event.reason)));

const gl = canvas.getContext('webgl2', {
  alpha: false,
  antialias: true,
  powerPreference: 'high-performance',
});

if (!gl) {
  loading.classList.add('hidden');
  errorPanel.hidden = false;
  throw new Error('WebGL2 is unavailable.');
}

const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.12, 700);
const state = createExperienceState({ reducedMotion: reducedMotionQuery.matches });
const world = createWorld(scene);
const atmosphere = createAtmosphere(scene, { reducedMotion: state.settings.reducedMotion });
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let activeArea = 'A';
let toastTimer = 0;
let qualityIndex = 0;
let overviewOpen = false;
let firstFrame = false;
let elapsed = 0;
let fps = 60;
let frameBucket = [];

const overviewControls = new OrbitControls(camera, canvas);
overviewControls.enabled = false;
overviewControls.enableDamping = true;
overviewControls.dampingFactor = 0.07;
overviewControls.minDistance = 72;
overviewControls.maxDistance = 260;
overviewControls.maxPolarAngle = Math.PI * 0.49;
overviewControls.target.set(0, 4, 5);

const areaTargets = {
  A: 'dock', B: 'bridge-crown', C: 'courtyard', D: 'arcade-west',
  E: 'garden', F: 'tower-lookout', G: 'lower-hall', H: 'wall-mid',
};

const player = createPlayerController({
  camera,
  domElement: canvas,
  navigation,
  state,
  resolveWaypoint: navigation.getWaypoint,
  initialYaw: 0,
  initialPitch: 0.02,
  eyeHeight: 2.35,
  onChange: updatePlayerHud,
  onRouteEnd: () => {
    if (state.tour.active) state.stopTour();
    document.querySelector('#tour-button').classList.remove('active');
    updateRouteStatus('已到达 · 自由漫游');
  },
  onManualInput: () => updateRouteStatus('自由漫游'),
});

function setLoading(percent, copy) {
  loadingProgress.style.width = `${percent}%`;
  if (copy) loadingCopy.textContent = copy;
}

function updateRouteStatus(copy) {
  document.querySelector('#route-status').textContent = copy;
}

function showArea(areaId, announce = true) {
  const area = AREAS[areaId];
  if (!area) return;
  activeArea = areaId;
  state.setArea(areaId);
  document.querySelector('#area-code').textContent = area.id;
  document.querySelector('#area-name').textContent = area.name;
  document.querySelector('#area-description').textContent = area.description;
  document.querySelectorAll('#mini-map button').forEach((button) => button.classList.toggle('active', button.dataset.area === areaId));
  if (!announce) return;
  const toast = document.querySelector('#area-toast');
  toast.querySelector('strong').textContent = area.name;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 1800);
}

function updatePlayerHud(snapshot) {
  const area = navigation.classifyArea(snapshot.position);
  if (area !== activeArea) showArea(area);
  document.querySelector('#position-readout').textContent = snapshot.position.map((value) => Math.round(value)).join(' · ');
  const areaMap = AREAS[area].map;
  const mapPlayer = document.querySelector('#map-player');
  mapPlayer.style.left = `${areaMap[0]}%`;
  mapPlayer.style.top = `${areaMap[1]}%`;
  mapPlayer.style.transform = `translate(-50%,-50%) rotate(${-snapshot.yaw}rad)`;
}

function routeToArea(areaId) {
  if (overviewOpen) closeOverview();
  if (state.tour.active) state.stopTour();
  document.querySelector('#tour-button').classList.remove('active');
  const target = areaTargets[areaId];
  const success = player.requestRoute(target);
  if (success) updateRouteStatus(`正在前往 · ${AREAS[areaId].name}`);
  return success;
}

function openOverview() {
  if (overviewOpen) return;
  state.openOverview();
  overviewOpen = true;
  player.setEnabled(false);
  camera.position.set(98, 78, 118);
  camera.lookAt(overviewControls.target);
  overviewControls.enabled = true;
  overviewControls.update();
  document.querySelector('#overview-panel').classList.add('visible');
  document.querySelector('#overview-panel').setAttribute('aria-hidden', 'false');
  document.querySelector('#overview-button').classList.add('active');
  updateRouteStatus('整岛总览');
}

function closeOverview() {
  if (!overviewOpen) return;
  overviewControls.enabled = false;
  overviewOpen = false;
  state.closeOverview();
  player.setTransform(state.player, { project: false });
  player.snapCamera();
  player.setEnabled(true);
  document.querySelector('#overview-panel').classList.remove('visible');
  document.querySelector('#overview-panel').setAttribute('aria-hidden', 'true');
  document.querySelector('#overview-button').classList.remove('active');
  updateRouteStatus('自由漫游');
  canvas.focus();
}

function setQuality(index) {
  const choices = [
    { name: '高', ratio: Math.min(window.devicePixelRatio, 1.75), shadows: true },
    { name: '均衡', ratio: Math.min(window.devicePixelRatio, 1.25), shadows: true },
    { name: '流畅', ratio: 1, shadows: false },
  ];
  qualityIndex = index % choices.length;
  const quality = choices[qualityIndex];
  renderer.setPixelRatio(quality.ratio);
  renderer.shadowMap.enabled = quality.shadows;
  state.settings.quality = ['high', 'balanced', 'low'][qualityIndex];
  document.querySelector('#quality-button').textContent = `画质：${quality.name}`;
  resize();
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function pickTarget(event) {
  if (overviewOpen || player.consumeDragGesture()) return;
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(world.interactiveTargets, false)[0];
  if (hit?.object.userData.area) routeToArea(hit.object.userData.area);
}

function updateMarkerHover(event) {
  if (overviewOpen) return;
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(world.interactiveTargets, false)[0]?.object;
  world.interactiveTargets.forEach((target) => {
    const active = target === hit;
    target.material.opacity = active ? 0.82 : 0.2;
    target.scale.setScalar(active ? 1.28 : 1);
  });
  canvas.style.cursor = hit ? 'pointer' : 'grab';
}

function setReducedMotion(value) {
  state.settings.reducedMotion = Boolean(value);
  atmosphere.setReducedMotion(value);
  world.setReducedMotion(value);
  const tourButton = document.querySelector('#tour-button');
  tourButton.disabled = Boolean(value);
  tourButton.title = value ? '系统已启用减少动态，自动导览已关闭' : '';
  if (value && state.tour.active) {
    state.handleManualInput();
    player.cancelRoute();
  }
}

document.querySelectorAll('#mini-map button').forEach((button) => button.addEventListener('click', () => routeToArea(button.dataset.area)));
document.querySelector('#overview-button').addEventListener('click', () => overviewOpen ? closeOverview() : openOverview());
document.querySelector('#return-button').addEventListener('click', closeOverview);
document.querySelector('#tour-button').addEventListener('click', () => {
  if (state.settings.reducedMotion) return;
  if (state.tour.active) {
    state.handleManualInput();
    player.cancelRoute();
    updateRouteStatus('自由漫游');
    document.querySelector('#tour-button').classList.remove('active');
    return;
  }
  const nearest = navigation.nearestWaypoint(player.getSnapshot().position)?.waypoint?.id ?? 'dock';
  const approach = navigation.shortestPath(nearest, MAIN_TOUR[0]);
  const tourRoute = [...approach, ...MAIN_TOUR.slice(1)];
  state.startTour(tourRoute);
  player.setRoute(tourRoute);
  updateRouteStatus('自动导览 · 主环路');
  document.querySelector('#tour-button').classList.add('active');
});
document.querySelector('#reset-button').addEventListener('click', () => {
  if (overviewOpen) closeOverview();
  state.resetToSafePoint();
  player.reset('dock');
  showArea('A');
  updateRouteStatus('已回到安全落点');
});
document.querySelector('#quality-button').addEventListener('click', () => setQuality(qualityIndex + 1));
document.querySelector('#sound-button').addEventListener('click', () => updateRouteStatus('本版以环境画面为主，未加载音频资源'));

const helpDialog = document.querySelector('#help-dialog');
function openHelp() { if (!helpDialog.open) helpDialog.showModal(); }
function closeHelp() { if (helpDialog.open) helpDialog.close(); canvas.focus(); }
document.querySelector('#help-button').addEventListener('click', openHelp);
document.querySelector('#brand').addEventListener('click', openHelp);
document.querySelector('#help-close').addEventListener('click', closeHelp);
document.querySelector('#help-start').addEventListener('click', closeHelp);
helpDialog.addEventListener('click', (event) => { if (event.target === helpDialog) closeHelp(); });

canvas.addEventListener('click', pickTarget);
canvas.addEventListener('pointermove', updateMarkerHover, { passive: true });
window.addEventListener('resize', resize);
reducedMotionQuery.addEventListener('change', (event) => setReducedMotion(event.matches));
document.addEventListener('visibilitychange', () => { if (document.hidden) clock.stop(); else clock.start(); });

function render() {
  requestAnimationFrame(render);
  if (document.hidden) return;
  const delta = Math.min(clock.getDelta(), 0.1);
  elapsed += delta;
  if (overviewOpen) overviewControls.update();
  else player.update(delta);
  world.update(elapsed, state.settings.reducedMotion);
  atmosphere.update(elapsed);
  renderer.render(scene, camera);

  if (delta > 0) {
    frameBucket.push(1 / delta);
    if (frameBucket.length > 90) frameBucket.shift();
    fps = frameBucket.reduce((sum, value) => sum + value, 0) / frameBucket.length;
  }
  if (!firstFrame) {
    firstFrame = true;
    setLoading(100, '世界已连通');
    requestAnimationFrame(() => setTimeout(() => loading.classList.add('hidden'), 250));
  }
}

setLoading(42, '建立城门、庭院与下层通道…');
setQuality(0);
resize();
showArea('A', false);
setReducedMotion(state.settings.reducedMotion);
world.interactiveTargets.forEach((target) => { target.material.opacity = 0.2; });
world.materials.atlasReady.then((loaded) => setLoading(loaded ? 86 : 76, loaded ? '手绘材质已经铺开…' : '使用本地程序材质…'));
render();

window.__SKY_CITY__ = {
  get ready() { return firstFrame && loading.classList.contains('hidden'); },
  get worldRootUuid() { return world.worldRoot.uuid; },
  get errors() { return [...debugErrors]; },
  get metrics() { return { ...world.getMetrics(), ...atmosphere.metrics, fps: Math.round(fps) }; },
  get state() { return { mode: state.mode, area: activeArea, player: player.getSnapshot(), cameraPosition: camera.position.toArray(), reducedMotion: state.settings.reducedMotion, quality: state.settings.quality }; },
  areas: Object.keys(AREAS),
  waypoints: WAYPOINTS.map(({ id, area, position }) => ({ id, area, position: [...position] })),
  routeToArea,
  openOverview,
  closeOverview,
  setReducedMotionForTest: setReducedMotion,
  goToWaypointForTest(id) {
    const waypoint = navigation.getWaypoint(id);
    if (!waypoint) return false;
    state.handleManualInput();
    player.setTransform({ position: waypoint.position, yaw: waypoint.heading ?? 0, pitch: 0 }, { project: false });
    showArea(waypoint.area, false);
    return true;
  },
  walkPathForTest(ids) {
    if (!Array.isArray(ids) || ids.length < 2) return { complete: false, areas: [] };
    for (let index = 1; index < ids.length; index += 1) {
      if (!navigation.areConnected(ids[index - 1], ids[index])) return { complete: false, areas: [], illegalHop: [ids[index - 1], ids[index]] };
    }
    const start = navigation.getWaypoint(ids[0]);
    player.setTransform({ position: start.position, yaw: start.heading ?? 0, pitch: 0 }, { project: false });
    player.snapCamera();
    player.setRoute(ids);
    const areas = new Set([start.area]);
    let frames = 0;
    while (player.getSnapshot().routeActive && frames < 20000) {
      const snapshot = player.update(0.1);
      areas.add(navigation.classifyArea(snapshot.position));
      frames += 1;
    }
    return { complete: !player.getSnapshot().routeActive, areas: [...areas], frames, position: player.getSnapshot().position };
  },
};

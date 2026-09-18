import { MathUtils, Vector3 } from 'three';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const EPSILON = 1e-6;

function asPosition(value, resolveWaypoint) {
  if (typeof value === 'string') value = resolveWaypoint?.(value);
  if (value?.position) value = value.position;
  if (value?.isVector3) return value.clone();
  if (!Array.isArray(value) || value.length < 3 || value.some((part) => !Number.isFinite(Number(part)))) return null;
  return new Vector3(Number(value[0]), Number(value[1]), Number(value[2]));
}

function shortestAngle(from, to) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Creates the walking camera controller used by the continuous sky-city scene.
 *
 * Required options:
 * - camera: a Three.js PerspectiveCamera (or compatible Object3D camera).
 * - domElement: the renderer canvas. Pointer drag changes yaw and pitch.
 * - navigation.projectToNavigable([x,y,z]): returns `{ position, distance, edge }`.
 *
 * Integration options:
 * - state: the object returned by createExperienceState(). Manual input calls
 *   `handleManualInput()`; route changes call `setRoute()` when available.
 * - resolveWaypoint(id): returns a waypoint or a `[x,y,z]` position.
 * - navigation.shortestPath(fromId, toId): enables requestRoute().
 * - onChange(snapshot), onRouteEnd(), onManualInput().
 *
 * Public API: update, setRoute, requestRoute, cancelRoute, reset,
 * setTransform, getSnapshot, consumeDragGesture, setEnabled, destroy.
 */
export function createPlayerController({
  camera,
  domElement,
  navigation,
  state = null,
  resolveWaypoint = null,
  initialPosition = state?.player?.position ?? [0, 2, 62],
  initialYaw = state?.player?.yaw ?? Math.PI,
  initialPitch = state?.player?.pitch ?? -0.08,
  safePosition = initialPosition,
  eyeHeight = 1.65,
  moveSpeed = 7.2,
  routeSpeed = 5.4,
  routeArrivalRadius = 0.38,
  maxProjectionDistance = 4.5,
  dragThreshold = 5,
  pointerSensitivity = 0.0032,
  cameraSmoothing = 15,
  onChange = null,
  onRouteEnd = null,
  onManualInput = null,
} = {}) {
  if (!camera) throw new TypeError('createPlayerController requires a camera');
  if (!domElement?.addEventListener) throw new TypeError('createPlayerController requires a DOM element');
  if (typeof navigation?.projectToNavigable !== 'function') {
    throw new TypeError('createPlayerController requires navigation.projectToNavigable');
  }

  const waypointResolver = resolveWaypoint ?? (typeof navigation.getWaypoint === 'function'
    ? (id) => navigation.getWaypoint(id)
    : null);
  const start = asPosition(initialPosition, waypointResolver);
  const fallback = asPosition(safePosition, waypointResolver) ?? start;
  if (!start || !fallback) throw new TypeError('Initial and safe positions must contain three finite numbers');

  const position = start.clone();
  const lastSafePosition = fallback.clone();
  const desiredCameraPosition = new Vector3();
  const candidate = new Vector3();
  const velocity = new Vector3();
  const keys = new Set();
  let route = [];
  let routeIds = [];
  let enabled = true;
  let yaw = Number(initialYaw) || 0;
  let pitch = MathUtils.clamp(Number(initialPitch) || 0, -1.35, 1.15);
  let renderedYaw = yaw;
  let renderedPitch = pitch;
  let pointerId = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let previousPointerX = 0;
  let previousPointerY = 0;
  let pointerTravel = 0;
  let draggedSincePointerDown = false;
  let suppressClickOnce = false;
  let manualActive = false;
  let destroyed = false;

  function snapshot() {
    return {
      position: position.toArray(),
      yaw,
      pitch,
      velocity: velocity.toArray(),
      moving: velocity.lengthSq() > EPSILON,
      routeActive: route.length > 0,
      route: [...routeIds],
      enabled,
    };
  }

  function syncState() {
    if (!state?.player) return;
    state.player.position = position.toArray();
    state.player.yaw = yaw;
    state.player.pitch = pitch;
  }

  function emitChange() {
    syncState();
    onChange?.(snapshot());
  }

  function stopMotion() {
    keys.clear();
    velocity.set(0, 0, 0);
    manualActive = false;
  }

  function cancelRoute({ notifyState = true } = {}) {
    const hadRoute = route.length > 0;
    route = [];
    routeIds = [];
    if (notifyState && hadRoute && typeof state?.setRoute === 'function') state.setRoute([]);
    return hadRoute;
  }

  function handleManualInput() {
    cancelRoute({ notifyState: false });
    if (typeof state?.handleManualInput === 'function') state.handleManualInput();
    else {
      if (state?.tour) state.tour.active = false;
      if (state && Array.isArray(state.route)) state.route = [];
      if (state && 'mode' in state) state.mode = 'walk';
    }
    onManualInput?.();
  }

  function projectToNetwork(target, { allowRecovery = false } = {}) {
    let projected;
    try {
      projected = navigation.projectToNavigable(target.toArray());
    } catch {
      projected = null;
    }
    const projectedPosition = asPosition(projected?.position ?? projected, waypointResolver);
    if (!projectedPosition) return false;
    const reportedDistance = Number(projected?.distance);
    const distance = Number.isFinite(reportedDistance) ? reportedDistance : projectedPosition.distanceTo(target);
    if (!allowRecovery && distance > maxProjectionDistance) return false;
    position.copy(projectedPosition);
    lastSafePosition.copy(projectedPosition);
    return true;
  }

  function setRoute(nextRoute, { notifyState = true } = {}) {
    if (!Array.isArray(nextRoute)) throw new TypeError('Route must be an array of waypoint ids or positions');
    const points = [];
    const ids = [];
    for (const item of nextRoute) {
      const point = asPosition(item, waypointResolver);
      if (!point) continue;
      if (point.distanceTo(position) <= routeArrivalRadius && points.length === 0) continue;
      points.push(point);
      ids.push(typeof item === 'string' ? item : item?.id ?? null);
    }
    route = points;
    routeIds = ids;
    if (notifyState && typeof state?.setRoute === 'function') {
      state.setRoute(nextRoute.map((item) => typeof item === 'string' ? item : item?.id).filter(Boolean));
    }
    emitChange();
    return route.length > 0;
  }

  function requestRoute(targetId, { fromId } = {}) {
    if (typeof navigation.shortestPath !== 'function') return false;
    let origin = fromId;
    if (!origin && typeof navigation.nearestWaypoint === 'function') {
      const nearest = navigation.nearestWaypoint(position.toArray());
      origin = typeof nearest === 'string' ? nearest : nearest?.id ?? nearest?.waypoint?.id;
    }
    if (!origin || !targetId) return false;
    const ids = navigation.shortestPath(origin, targetId);
    return Array.isArray(ids) && ids.length > 0 ? setRoute(ids) : false;
  }

  function reset(nextSafePosition = fallback) {
    stopMotion();
    cancelRoute();
    const requested = asPosition(nextSafePosition, waypointResolver) ?? fallback;
    if (!projectToNetwork(requested, { allowRecovery: true })) position.copy(fallback);
    lastSafePosition.copy(position);
    camera.position.set(position.x, position.y + eyeHeight, position.z);
    emitChange();
  }

  function setTransform(transform = {}, { project = true } = {}) {
    stopMotion();
    cancelRoute();
    const nextPosition = transform.position ? asPosition(transform.position, waypointResolver) : position.clone();
    if (nextPosition) {
      if (!project) {
        position.copy(nextPosition);
        lastSafePosition.copy(nextPosition);
      } else if (!projectToNetwork(nextPosition, { allowRecovery: true })) {
        position.copy(lastSafePosition);
      }
    }
    if (Number.isFinite(transform.yaw)) yaw = transform.yaw;
    if (Number.isFinite(transform.pitch)) pitch = MathUtils.clamp(transform.pitch, -1.35, 1.15);
    emitChange();
  }

  function onKeyDown(event) {
    if (!enabled || !MOVE_KEYS.has(event.code)) return;
    if (event.target?.closest?.('button,input,select,textarea,dialog,[contenteditable="true"]')) return;
    if (!keys.has(event.code)) handleManualInput();
    keys.add(event.code);
    manualActive = true;
    event.preventDefault?.();
  }

  function onKeyUp(event) {
    if (!MOVE_KEYS.has(event.code)) return;
    keys.delete(event.code);
    if (keys.size === 0) {
      velocity.set(0, 0, 0);
      manualActive = false;
    }
    event.preventDefault?.();
  }

  function onPointerDown(event) {
    if (!enabled || pointerId !== null || event.button > 0) return;
    pointerId = event.pointerId;
    pointerStartX = previousPointerX = event.clientX;
    pointerStartY = previousPointerY = event.clientY;
    pointerTravel = 0;
    draggedSincePointerDown = false;
    domElement.setPointerCapture?.(pointerId);
  }

  function onPointerMove(event) {
    if (!enabled || event.pointerId !== pointerId) return;
    const dx = event.clientX - previousPointerX;
    const dy = event.clientY - previousPointerY;
    previousPointerX = event.clientX;
    previousPointerY = event.clientY;
    pointerTravel = Math.max(pointerTravel, Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY));
    if (pointerTravel < dragThreshold) return;
    draggedSincePointerDown = true;
    yaw -= dx * pointerSensitivity;
    pitch = MathUtils.clamp(pitch - dy * pointerSensitivity, -1.35, 1.15);
    event.preventDefault?.();
    emitChange();
  }

  function endPointer(event) {
    if (event.pointerId !== pointerId) return;
    suppressClickOnce = draggedSincePointerDown;
    domElement.releasePointerCapture?.(pointerId);
    pointerId = null;
  }

  function consumeDragGesture() {
    const value = suppressClickOnce;
    suppressClickOnce = false;
    return value;
  }

  function updateManual(delta) {
    const forwardInput = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const sideInput = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    if (!forwardInput && !sideInput) {
      velocity.set(0, 0, 0);
      return false;
    }
    const length = Math.hypot(forwardInput, sideInput) || 1;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    velocity.set(
      (forwardX * forwardInput + Math.cos(yaw) * sideInput) / length,
      0,
      (forwardZ * forwardInput - Math.sin(yaw) * sideInput) / length,
    ).multiplyScalar(moveSpeed);
    candidate.copy(position).addScaledVector(velocity, delta);
    if (!projectToNetwork(candidate)) {
      position.copy(lastSafePosition);
      velocity.set(0, 0, 0);
    }
    return true;
  }

  function updateRoute(delta) {
    if (!route.length) return false;
    const target = route[0];
    const offset = target.clone().sub(position);
    const distance = offset.length();
    if (distance <= routeArrivalRadius) {
      position.copy(target);
      lastSafePosition.copy(position);
      route.shift();
      routeIds.shift();
      if (!route.length) {
        velocity.set(0, 0, 0);
        if (typeof state?.setRoute === 'function') state.setRoute([]);
        onRouteEnd?.();
        return false;
      }
      return updateRoute(delta);
    }
    offset.multiplyScalar(1 / Math.max(distance, EPSILON));
    const step = Math.min(distance, routeSpeed * delta);
    velocity.copy(offset).multiplyScalar(routeSpeed);
    candidate.copy(position).addScaledVector(offset, step);
    if (!projectToNetwork(candidate)) {
      cancelRoute();
      velocity.set(0, 0, 0);
      position.copy(lastSafePosition);
      return false;
    }
    yaw = Math.atan2(-offset.x, -offset.z);
    return true;
  }

  function updateCamera(delta) {
    const blend = 1 - Math.exp(-cameraSmoothing * Math.max(0, delta));
    desiredCameraPosition.set(position.x, position.y + eyeHeight, position.z);
    camera.position.lerp(desiredCameraPosition, blend);
    renderedYaw = MathUtils.lerp(renderedYaw, shortestAngle(renderedYaw, yaw), blend);
    renderedPitch = MathUtils.lerp(renderedPitch, pitch, blend);
    if (camera.rotation?.set) camera.rotation.set(renderedPitch, renderedYaw, 0, 'YXZ');
  }

  function snapCamera() {
    desiredCameraPosition.set(position.x, position.y + eyeHeight, position.z);
    camera.position.copy(desiredCameraPosition);
    renderedYaw = yaw;
    renderedPitch = pitch;
    if (camera.rotation?.set) camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  function update(deltaSeconds) {
    if (destroyed) return snapshot();
    const delta = MathUtils.clamp(Number(deltaSeconds) || 0, 0, 0.1);
    let changed = false;
    if (enabled) {
      changed = manualActive || keys.size > 0 ? updateManual(delta) : updateRoute(delta);
    } else {
      velocity.set(0, 0, 0);
    }
    if (!Number.isFinite(position.x + position.y + position.z)) {
      position.copy(lastSafePosition);
      velocity.set(0, 0, 0);
      changed = true;
    }
    updateCamera(delta);
    if (changed) emitChange();
    return snapshot();
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) stopMotion();
    emitChange();
  }

  function onVisibilityChange() {
    if (document.hidden) stopMotion();
  }

  function onBlur() {
    stopMotion();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopMotion();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', endPointer);
    domElement.removeEventListener('pointercancel', endPointer);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);
  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove, { passive: false });
  domElement.addEventListener('pointerup', endPointer);
  domElement.addEventListener('pointercancel', endPointer);

  camera.position.set(position.x, position.y + eyeHeight, position.z);
  if (camera.rotation?.set) camera.rotation.set(pitch, yaw, 0, 'YXZ');
  syncState();

  return {
    update,
    setRoute,
    requestRoute,
    cancelRoute,
    reset,
    setTransform,
    getSnapshot: snapshot,
    snapCamera,
    consumeDragGesture,
    setEnabled,
    stop: stopMotion,
    destroy,
  };
}

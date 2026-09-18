import { MAIN_TOUR, START_WAYPOINT } from './world-layout.js';
import { getWaypoint } from './navigation.js';

const cloneTransform = (player) => ({
  position: [...player.position],
  yaw: player.yaw,
  pitch: player.pitch,
});

/**
 * Small observable state store shared by the renderer, HUD and controller.
 * Mutating actions always emit after their state is internally consistent.
 */
export function createExperienceState(initial = {}) {
  const start = getWaypoint(START_WAYPOINT).position;
  const listeners = new Set();
  let overviewSnapshot = null;

  const state = {
    mode: 'walk',
    inputMode: initial.inputMode ?? 'click',
    area: initial.area ?? 'A',
    player: {
      position: [...(initial.position ?? start)],
      yaw: Number.isFinite(initial.yaw) ? initial.yaw : 0,
      pitch: Number.isFinite(initial.pitch) ? initial.pitch : -0.08,
    },
    route: [],
    routeIndex: 0,
    tour: {
      active: false,
      paused: false,
      itinerary: [...MAIN_TOUR],
    },
    settings: {
      reducedMotion: Boolean(initial.reducedMotion),
      quality: initial.quality ?? 'high',
      sensitivity: initial.sensitivity ?? 1,
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('Subscriber must be a function.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify(reason = 'change') {
      for (const listener of listeners) listener(state, reason);
    },
    setRoute(ids = []) {
      state.route = Array.isArray(ids) ? [...ids] : [];
      state.routeIndex = 0;
      state.notify('route');
      return state.route;
    },
    clearRoute() {
      state.route = [];
      state.routeIndex = 0;
      state.notify('route');
    },
    advanceRoute() {
      if (state.routeIndex < state.route.length - 1) {
        state.routeIndex += 1;
        state.notify('route-progress');
        return state.route[state.routeIndex];
      }
      state.clearRoute();
      if (state.tour.active) state.stopTour();
      return null;
    },
    startTour(itinerary = MAIN_TOUR) {
      state.mode = 'walk';
      state.tour.active = true;
      state.tour.paused = false;
      state.tour.itinerary = [...itinerary];
      state.setRoute(itinerary);
      state.notify('tour-start');
    },
    stopTour() {
      state.tour.active = false;
      state.tour.paused = false;
      state.notify('tour-stop');
    },
    handleManualInput() {
      state.tour.active = false;
      state.tour.paused = false;
      state.route = [];
      state.routeIndex = 0;
      state.mode = 'walk';
      state.notify('manual-input');
    },
    setPlayerTransform(transform = {}) {
      if (transform.position) state.player.position = [...transform.position];
      if (Number.isFinite(transform.yaw)) state.player.yaw = transform.yaw;
      if (Number.isFinite(transform.pitch)) state.player.pitch = transform.pitch;
      state.notify('player');
    },
    setArea(area) {
      if (state.area === area) return;
      state.area = area;
      state.notify('area');
    },
    setInputMode(inputMode) {
      state.inputMode = inputMode;
      state.notify('input-mode');
    },
    openOverview() {
      if (state.mode !== 'overview') overviewSnapshot = cloneTransform(state.player);
      state.mode = 'overview';
      state.route = [];
      state.routeIndex = 0;
      state.tour.active = false;
      state.tour.paused = false;
      state.notify('overview-open');
    },
    closeOverview() {
      if (overviewSnapshot) {
        state.player.position = [...overviewSnapshot.position];
        state.player.yaw = overviewSnapshot.yaw;
        state.player.pitch = overviewSnapshot.pitch;
        overviewSnapshot = null;
      }
      state.mode = 'walk';
      state.notify('overview-close');
    },
    resetToSafePoint() {
      const dock = getWaypoint(START_WAYPOINT);
      state.player.position = [...dock.position];
      state.player.yaw = dock.heading ?? Math.PI;
      state.player.pitch = -0.08;
      state.area = dock.area;
      state.handleManualInput();
    },
  };

  return state;
}

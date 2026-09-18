import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import * as navigation from '../src/navigation.js';
import { createExperienceState } from '../src/state.js';
import { createPlayerController } from '../src/player-controller.js';

class FakeDom extends EventTarget {
  setPointerCapture() {}
  releasePointerCapture() {}
}

function inputEvent(type, code) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'code', { value: code });
  return event;
}

test('controller follows connected route and manual input cancels tour immediately', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  globalThis.document.hidden = false;

  const state = createExperienceState();
  const controller = createPlayerController({
    camera: new PerspectiveCamera(),
    domElement: new FakeDom(),
    navigation,
    state,
  });

  state.startTour();
  controller.setRoute(['dock', 'dock-north']);
  for (let frame = 0; frame < 22; frame += 1) controller.update(0.1);
  assert.ok(controller.getSnapshot().position[2] < 54, 'route should move north along the dock');

  state.startTour();
  controller.setRoute(['dock-north', 'bridge-south']);
  globalThis.window.dispatchEvent(inputEvent('keydown', 'KeyW'));
  assert.equal(state.tour.active, false);
  assert.deepEqual(state.route, []);
  assert.equal(controller.getSnapshot().routeActive, false);

  globalThis.window.dispatchEvent(new Event('blur'));
  controller.update(0.1);
  assert.deepEqual(controller.getSnapshot().velocity, [0, 0, 0]);
  controller.destroy();
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
});

import test from 'node:test';
import assert from 'node:assert/strict';

async function loadState() {
  try {
    return await import('../src/state.js');
  } catch {
    return null;
  }
}

test('manual movement immediately cancels route following and the guided tour', async () => {
  const stateModule = await loadState();
  assert.ok(stateModule, 'state.js must be implemented');
  const state = stateModule.createExperienceState();
  state.startTour();
  state.setRoute(['dock', 'gate', 'courtyard']);
  state.handleManualInput();
  assert.equal(state.tour.active, false);
  assert.deepEqual(state.route, []);
  assert.equal(state.mode, 'walk');
});

test('overview saves and restores the exact player transform', async () => {
  const stateModule = await loadState();
  assert.ok(stateModule, 'state.js must be implemented');
  const state = stateModule.createExperienceState({ position: [12, 7, -4], yaw: 1.2, pitch: -0.18 });
  state.openOverview();
  state.player.position = [90, 90, 90];
  state.player.yaw = 0;
  state.closeOverview();
  assert.deepEqual(state.player.position, [12, 7, -4]);
  assert.equal(state.player.yaw, 1.2);
  assert.equal(state.player.pitch, -0.18);
  assert.equal(state.mode, 'walk');
});

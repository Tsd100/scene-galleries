import test from 'node:test';
import assert from 'node:assert/strict';

async function loadNavigation() {
  try {
    return await import('../src/navigation.js');
  } catch {
    return null;
  }
}

test('shortestPath follows declared edges and can traverse the internal branch', async () => {
  const navigation = await loadNavigation();
  assert.ok(navigation, 'navigation.js must be implemented');
  const path = navigation.shortestPath('dock', 'lower-hall');
  assert.equal(path[0], 'dock');
  assert.equal(path.at(-1), 'lower-hall');
  assert.ok(path.length >= 3);
  for (let index = 0; index < path.length - 1; index += 1) {
    assert.ok(navigation.areConnected(path[index], path[index + 1]), `illegal hop ${path[index]} -> ${path[index + 1]}`);
  }
});

test('classifyArea returns the nearest designed zone for a known waypoint position', async () => {
  const navigation = await loadNavigation();
  assert.ok(navigation, 'navigation.js must be implemented');
  assert.equal(navigation.classifyArea([0, 2, 62]), 'A');
  assert.equal(navigation.classifyArea([43, 17, -45]), 'F');
  assert.equal(navigation.classifyArea([-32, -6, -20]), 'G');
});

test('projectToNavigable keeps an unsafe position on the shared walking network', async () => {
  const navigation = await loadNavigation();
  assert.ok(navigation, 'navigation.js must be implemented');
  const projected = navigation.projectToNavigable([200, -80, 200]);
  assert.equal(projected.position.length, 3);
  assert.ok(projected.distance > 100);
  assert.ok(projected.edge.length === 2);
});

test('projectToNavigable preserves lateral movement inside an authored corridor width', async () => {
  const navigation = await loadNavigation();
  const projected = navigation.projectToNavigable([2, 3, 58]);
  assert.ok(Math.abs(projected.position[0] - 2) < 0.01, 'walkable corridor should keep legal lateral offset');
  assert.ok(projected.width >= 5);
  const outside = navigation.projectToNavigable([20, 3, 58]);
  assert.ok(Math.abs(outside.position[0]) < 4, 'outside position should clamp to corridor edge');
});

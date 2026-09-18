import test from 'node:test';
import assert from 'node:assert/strict';

async function loadLayout() {
  try {
    return await import('../src/world-layout.js');
  } catch {
    return null;
  }
}

test('world layout contains the eight planned areas and both closed routes', async () => {
  const layout = await loadLayout();
  assert.ok(layout, 'world-layout.js must be implemented');
  assert.deepEqual(Object.keys(layout.AREAS).sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.deepEqual(layout.MAIN_LOOP, ['A', 'B', 'C', 'D', 'E', 'F', 'H', 'A']);
  assert.deepEqual(layout.BRANCH_LOOP, ['D', 'G', 'H']);
});

test('every waypoint belongs to a real area and every edge references real waypoints', async () => {
  const layout = await loadLayout();
  assert.ok(layout, 'world-layout.js must be implemented');
  const waypointIds = new Set(layout.WAYPOINTS.map((point) => point.id));
  assert.ok(layout.WAYPOINTS.length >= 20, 'the shared world needs enough points for turns and height changes');
  for (const point of layout.WAYPOINTS) {
    assert.ok(layout.AREAS[point.area], `${point.id} has an unknown area`);
    assert.equal(point.position.length, 3, `${point.id} needs x, y, z`);
    assert.ok(point.label.length > 0, `${point.id} needs a label`);
  }
  for (const [from, to] of layout.EDGES) {
    assert.ok(waypointIds.has(from), `edge start ${from} does not exist`);
    assert.ok(waypointIds.has(to), `edge end ${to} does not exist`);
  }
});

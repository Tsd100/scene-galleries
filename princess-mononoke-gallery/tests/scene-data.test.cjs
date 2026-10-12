const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'scenes.js'), 'utf8'), context);
const scenes = context.window.MONONOKE_SCENES;

test('16 unique local scenes in four balanced chapters', () => {
  assert.equal(scenes.length, 16);
  assert.equal(new Set(scenes.map(scene => scene.id)).size, 16);
  const chapters = new Map();
  for (const scene of scenes) {
    chapters.set(scene.chapter, (chapters.get(scene.chapter) || 0) + 1);
    assert.match(scene.image, /^assets\/[\w-]+\.webp$/);
    assert.match(scene.thumb, /^assets\/thumbs\/[\w-]+\.webp$/);
    assert.ok(fs.existsSync(path.join(root, scene.image)), `missing ${scene.image}`);
    assert.ok(fs.existsSync(path.join(root, scene.thumb)), `missing ${scene.thumb}`);
  }
  assert.deepEqual([...chapters.values()], [4, 4, 4, 4]);
});

test('every hotspot reaches an existing scene', () => {
  const ids = new Set(scenes.map(scene => scene.id));
  for (const scene of scenes) {
    assert.ok(scene.hotspots.length >= 1);
    assert.equal(new Set(scene.hotspots.map(hotspot => hotspot.to)).size, scene.hotspots.length, `${scene.id} has duplicate destinations`);
    for (const hotspot of scene.hotspots) {
      assert.ok(ids.has(hotspot.to), `${scene.id} points to missing ${hotspot.to}`);
      assert.ok(hotspot.x >= 0 && hotspot.x <= 100);
      assert.ok(hotspot.y >= 0 && hotspot.y <= 100);
    }
  }
});

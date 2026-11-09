import test from 'node:test';
import assert from 'node:assert/strict';
import { roomCameraFrame } from '../src/building/room-camera';

test('同一真实房间在两种视角保持中心，窄视口为占地留出空间', () => {
  const room = { minX: -2.6, maxX: 2.6, minZ: -2.6, maxZ: 0 };
  const before = JSON.stringify(room);
  for (const mode of ['admire','place'] as const) {
    const wide = roomCameraFrame(room,mode,1.4), narrow = roomCameraFrame(room,mode,.46);
    assert.equal(wide.x,0); assert.equal(wide.z,-1.3); assert.equal(narrow.x,wide.x); assert.equal(narrow.z,wide.z);
    assert.ok(narrow.radius > wide.radius);
    const horizontalSpan = 2 * narrow.radius * Math.tan(.4) * .46;
    assert.ok(horizontalSpan > room.maxX-room.minX);
    assert.ok(Number.isFinite(wide.radius)); assert.ok(wide.radius >= 5);
  }
  assert.equal(JSON.stringify(room),before);
  assert.ok(roomCameraFrame(room,'place',1).beta < .05);
  assert.ok(roomCameraFrame(room,'admire',1).beta > .7);
});

test('两层或偏移房间以实际坐标取景，不跳回主岛中心', () => {
  const frame=roomCameraFrame({minX:10,maxX:15.2,minZ:-8,maxZ:-5.4},'place',1);
  assert.equal(frame.x,12.6); assert.equal(frame.z,-6.7);
});

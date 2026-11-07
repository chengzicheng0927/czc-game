/* 院子主角自由走动控制：上下左右/WASD 平滑移动，小岛安全边界碰撞，绝不走出小岛。 */
(function (G) {
  'use strict';
  G.runtime = G.runtime || {};
  if (!G.runtime.player) {
    G.runtime.player = {
      zone: 'yard',
      x: -2.2,
      y: 0.15,
      z: 3.25,
      facing: 1,
      walking: false,
      speed: 3.6
    };
  }

  // 小岛安全可行走区域判定（多圆形联合并剔除房屋后墙实体）
  function isWalkable(x, z) {
    // 房屋外墙与地基阻挡检测：
    // 小屋正面朝向前院 (+z)，正门在 x 接近 0 处
    // 在正门台阶处允许走近到 z = 1.25，其它墙壁位置在 z < 1.48 且 |x| < 4.7 时视为房屋实体阻挡
    const inDoorStep = Math.abs(x) <= 1.05 && z >= 1.25;
    if (!inDoorStep && z < 1.48 && Math.abs(x) < 4.75) return false;

    // 1. 主岛 (中心 -0.6, 0.9)，安全半径 6.6 (主岛半径 7.25，保留防跌落边缘)
    if (Math.hypot(x - (-0.6), z - 0.9) <= 6.6) return true;

    // 2. 左前草坪延伸小岛 (中心 -4.3, 3.4)，安全半径 2.65
    if (Math.hypot(x - (-4.3), z - 3.4) <= 2.65) return true;

    // 3. 右前草坪延伸小岛 (中心 4.3, 3.4)，安全半径 2.65
    if (Math.hypot(x - 4.3, z - 3.4) <= 2.65) return true;

    // 4. 通往花园岛的木桥通道 (连接右前草坪与花园岛)
    if (x >= 4.0 && x <= 8.5 && z >= 2.4 && z <= 4.25) return true;

    // 5. 花园小岛 (真实中心 10.0, 3.36)，安全半径 3.1 (岛半径 3.25)
    if (Math.hypot(x - 10.0, z - 3.36) <= 3.1) return true;

    return false;
  }

  // 沿岛屿边缘顺滑滑动（Edge / Wall Sliding）
  function tryMove(currX, currZ, dirX, dirZ, delta) {
    const nextX = currX + dirX * delta;
    const nextZ = currZ + dirZ * delta;

    // 优先完整位移
    if (isWalkable(nextX, nextZ)) {
      return { x: nextX, z: nextZ };
    }
    // 遇到斜角边界时，尝试沿 X 轴滑动
    if (isWalkable(nextX, currZ)) {
      return { x: nextX, z: currZ };
    }
    // 遇到斜角边界时，尝试沿 Z 轴滑动
    if (isWalkable(currX, nextZ)) {
      return { x: currX, z: nextZ };
    }
    // 完全超出边界时阻挡在安全位置
    return { x: currX, z: currZ };
  }

  const keys = { up: false, down: false, left: false, right: false };
  let loopRunning = false, lastTime = 0;

  function isInputBlocked() {
    if (G.runtime?.visit?.active) return true; // 串门时本地玩家不移动（方向键由 live-room 控制自己在对方小屋里的 peer）
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
    if (el.closest && (el.closest('.modal-card') || el.closest('.cute-popover') || el.closest('.minigame-container'))) return true;
    if (document.body.classList.contains('is-visiting')) return true;
    return false;
  }

  function updateLoop(now) {
    if (!loopRunning) return;
    const dt = Math.min((now - lastTime) / 1000, 0.08);
    lastTime = now;

    let moveX = 0, moveZ = 0;
    if (keys.left) moveX -= 1;
    if (keys.right) moveX += 1;
    if (keys.up) moveZ -= 1;
    if (keys.down) moveZ += 1;

    if (moveX !== 0 || moveZ !== 0) {
      const len = Math.hypot(moveX, moveZ);
      const normX = moveX / len;
      const normZ = moveZ / len;
      const step = (G.runtime.player.speed || 3.6) * dt;
      const result = tryMove(G.runtime.player.x, G.runtime.player.z, normX, normZ, step);
      G.runtime.player.x = result.x;
      G.runtime.player.z = result.z;
      if (moveX < 0) G.runtime.player.facing = -1;
      else if (moveX > 0) G.runtime.player.facing = 1;
      G.runtime.player.walking = true;
      G.render?.redraw?.();
      requestAnimationFrame(updateLoop);
    } else {
      G.runtime.player.walking = false;
      loopRunning = false;
      G.render?.redraw?.();
    }
  }

  function onKeyDown(e) {
    if (isInputBlocked() || e.ctrlKey || e.altKey || e.metaKey) return;
    let matched = false;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { keys.up = true; matched = true; }
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { keys.down = true; matched = true; }
    else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = true; matched = true; }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = true; matched = true; }

    if (matched) {
      e.preventDefault();
      // 如果小人还在房间里，按方向键直接来到院子散步！
      if (G.runtime.player.zone !== 'yard') {
        G.runtime.player.zone = 'yard';
        G.runtime.player.x = 0;
        G.runtime.player.z = 2.4;
        G.ui?.toast?.('小人来到院子里散步啦～');
      }
      if (!loopRunning) {
        loopRunning = true;
        lastTime = performance.now();
        requestAnimationFrame(updateLoop);
      }
    }
  }

  function onKeyUp(e) {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = false;
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = false;
    else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  }

  function resetKeys() {
    keys.up = keys.down = keys.left = keys.right = false;
    if (G.runtime.player) G.runtime.player.walking = false;
    loopRunning = false;
    G.render?.redraw?.();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', resetKeys);

  function toYard(x, z) {
    G.runtime.player.zone = 'yard';
    if (typeof x === 'number' && typeof z === 'number' && isWalkable(x, z)) {
      G.runtime.player.x = x;
      G.runtime.player.z = z;
    } else {
      G.runtime.player.x = -2.2;
      G.runtime.player.z = 3.25;
    }
    G.runtime.player.walking = false;
    G.render?.redraw?.();
  }

  function enterRoom(roomId) {
    const rooms = G.state?.house?.rooms || {};
    const roomKeys = Object.keys(rooms);
    const targetRoomId = roomId && rooms[roomId] ? roomId : (roomKeys[0] || null);
    if (!targetRoomId) {
      G.ui?.toast?.('小屋还没有建好房间呢，先去建一间房吧！');
      return false;
    }
    G.runtime.player.zone = targetRoomId;
    G.runtime.activeRoomId = targetRoomId;
    G.runtime.player.walking = false;
    resetKeys();
    const rDef = G.data?.rooms?.find(d => d.id === rooms[targetRoomId]?.type);
    const rName = rDef?.name || '房间';
    G.ui?.toast?.('小人进入了「' + rName + '」～');
    // 进屋后人必须看得见：当前若是外观视角、阁楼，或只看别的楼层，就回到“整屋剖面”，而不是把用户锁在某一层。
    const view = G.render?.getHouseView?.(), floorNo = (G.state?.house?.floors || []).findIndex(level => level.slots.includes(targetRoomId)) + 1;
    if (view && (view.view !== 'cutaway' || (view.floor !== 'all' && view.floor !== floorNo))) G.render.setHouseView({ floor: 'all', view: 'cutaway' });
    G.render?.redraw?.();
    return true;
  }

  G.playerMovement = {
    isWalkable,
    toYard,
    enterRoom,
    resetKeys
  };
})(window.Game = window.Game || {});

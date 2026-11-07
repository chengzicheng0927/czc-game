'use strict';

// 规则测试使用真实schema2命令创建小屋；不模拟已退役的格子房间或装饰写接口。
function sampleBuilding(api, catalog) {
  let document = api.createEmptyDocument();
  const floorId = document.floors[0].id;
  const corners = [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }];
  for (let index = 0; index < corners.length; index++) {
    document = api.executeCommand(document, { type: 'wall.add', wall: {
      id: 'save_wall_' + index, floorId, start: corners[index], end: corners[(index + 1) % corners.length], height: 2.8, thickness: .16, color: '#F1D9DA'
    } }, catalog);
  }
  document = api.executeCommand(document, { type: 'furniture.add', furniture: {
    id: 'save_bed', defId: 'bed_basic', floorId, position: { x: 0, y: 0, z: 0 }, rotation: 0,
    dimensions: { width: 1.5, height: .8, depth: 2 }
  } }, catalog);
  return document;
}

function commitSampleBuilding(G, api) {
  const document = sampleBuilding(api, G.data.furnitureById);
  G.store.update(state => {
    if (!(state.inventory.bed_basic > 0)) throw new Error('夹具必须使用实际拥有的小床。');
    state.inventory.bed_basic -= 1;
    state.building = document;
    state.house.name = '今天仍在玩的家'; state.wallet.coin = 721;
  }, { persist: true });
  return G.state.building;
}

module.exports = { sampleBuilding, commitSampleBuilding };

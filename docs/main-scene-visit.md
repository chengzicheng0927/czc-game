# 主场景串门：设计、契约与未验项

2026-10-30：去别人家串门时，主场景直接切换为对方的公开小屋，自己（和同屋的人）出现在那里，而不是新开平面标签页。仅本地实现，未部署，未经真实浏览器目视验收。授权与边界沿用[realtime.md](realtime.md)、[visiting-modes.md](visiting-modes.md)、[online-neighbors.md](online-neighbors.md)：实时位置/聊天只在内存，不进SQLite；file入口不联网；渲染层不联网；存档只经`Game.store.update`。

## 1. 设计要点

- **不替换自己的存档**：主页面`G.state`始终是玩家自己的存档（自动存档与云同步照旧）。对方的小屋由`G.publicHouse.materialize(snapshot)`合成、深度冻结后作为“访客状态”交给渲染层，渲染层按它绘制，不进入`G.state`。
- **两种模式**：路过（passerby）只读、不建会话、不发心跳、不挂浮层，主人不会知道；串门（live）先敲门，屋主同意并连上才切场景。
- **敲门期间留在自己家**：等待、婉拒、不在家、没回应、取消、加入失败，场景都不动，只提示。
- **一个账号一处在线**：进入串门前先结束屋主接待；屋主进入自己家（`G.hostRoom.enter()`）前先结束串门（含取消敲门）。自己房子的“接待朋友，一起玩”走`G.hostRoom.enter()`，不经公开快照。
- **共享代码**：`js/ui/host-room.js`暴露`G.roomKit.create(opts)`（面板挂载、同屋的人交给`G.livePeers.set`、方向键步进、收尾清理），屋主接待与串门会话共用；`G.hostRoom.active/walkTo/enter/leave`对外行为不变。
- **旧页保留**：`js/ui/visit.js`与`/visit/<id>`独立页不变，作兜底。

## 2. 文件

| 文件 | 作用 |
|---|---|
| `js/ui/visit-session.js` | `G.visitSession`：状态机、读快照、切换/退出、横幅、快照刷新 |
| `css/visit-session.css` | 顶部横幅样式（浮层沿用`live-room.css`的`.host-room`） |
| `js/ui/host-room.js` | 新增`G.roomKit.create`，屋主接待改用它；`enter()`先结束串门 |
| `js/ui/live-room.js` | 新增可选`options.onKnockResult(result)`，向后兼容 |
| `js/ui/neighbors.js` / `js/ui/sea-map.js` | `bindVisit(anchor,id,join)`；sea-map以`if (G.neighbors.bindVisit)`保护 |
| `js/ui/ui.js` | `ui.open`顶部一行拦截 |
| `tests/visit-session.cjs` | 轻DOM检查（见第7节） |

## 3. 接口契约

### G.visitSession

| 方法 | 说明 |
|---|---|
| `available()` | `G.render.visit.set`存在、`G.cloud.requestPublic`/`G.publicHouse`/`G.roomKit`可用、`G.cloud.status().available`（非file入口）。否则入口回落旧页 |
| `active()` | 已切换到对方小屋（路过或已连上的串门）。敲门等待（尚未切换）为假；路过中升级敲门时仍为真 |
| `blocks(name)` | 该面板在串门中是否被拦截 |
| `enter(houseId, {mode})` | `mode`=`'passerby'`（默认）或`'live'`。返回Promise：`{ok}`、`{ok:true,knocking:true}`（已开始敲门，连上与否由状态机决定）、`{ok:false,fallback:true}`（不可用，应走旧页）、`{ok:false,message}`、`{ok:false,cancelled:true}`。未登录要求live则降级为路过并提示登录；自己的房子+live转`G.hostRoom.enter()` |
| `leave(opts)` | 幂等。`opts`：`message`（提示）、`silent`、`keepalive`。依次：取消敲门、`G.live.leave`、`G.livePeers.clear`、卸载浮层与横幅、清`G.runtime.visit`、`G.render.visit.set(null)`、重画 |
| `walkTo(point)` | 仅已连上的live串门接管：用访客状态的`house`经`G.liveAvatars.destination`换算后`G.live.move`；不适用返回`false` |
| `state()` | `{phase,active,houseId,mode,title,ownerDisplayName,selfPeerId}` |

### G.runtime.visit（渲染层读取）

```
G.runtime.visit = { active:true, houseId, title, ownerDisplayName,
  mode:'passerby'|'live', selfPeerId:string|null, state: visitState }
```
串门期间`G.runtime.mode='visit'`，`placing`/`selected`被清空；回家后`G.runtime.visit=null`、`mode='explore'`。`panel:change`后会把`mode`重新置回`visit`（关面板会把它重置为`explore`），渲染层判断请以`G.runtime.visit && G.runtime.visit.active`为准。

### G.render.visit（会话3在scene.js实现）

`G.render.visit.set(visitState | null)`：`visitState`即`materialize`后的深度冻结state，字段与自己的存档同形（`house`、`avatar`、`residents`、`customArts`…）。`set(null)`表示回到自己的小屋。公开快照被刷新（版本号变化或每20秒核对到`updatedAt`变化）时用新的冻结state再次`set`。

### scene.js 条件（给会话3）

- env.peers条件：`(G.runtime.visit && G.runtime.visit.active && G.runtime.visit.mode==='live') || G.hostRoom.active()`，且`liveSnapshot.phase`为`connected`或`reconnecting`。
- 点地面：`G.visitSession.walkTo(point) || G.hostRoom.walkTo(point)`。
- 路过模式下，scene自己忽略编辑类点击（选房间、选物件、摆放等）。
- 串门时隐藏本地玩家actor、只画自己这个peer：scene处理`hidePlayer`，自己的peer为`G.runtime.visit.selfPeerId`；匿名路过不显示自己的形象。

### onKnockResult

`G.ui.liveRoom.mount(container,{houseId,onState,onMove,quickJoin,onKnockResult})`。敲门流程结束时调用一次`onKnockResult(result)`，`result`即`G.live.knock`的返回：`{ok:true,ticket}`（同意）或`{ok:false,status:'declined'|'host_away'|'expired'|'cancelled',message}`。回调抛错被吞掉，不影响组件；不传则行为不变。

## 4. 状态机

`phase`：`idle`（在自己家）→ `loading`（读快照）→ `passerby`（路过）或 `knocking`（敲门等待）→ `live`（已连上）→ `leaving`（瞬时）→ `idle`。

| 事件 | 结果 |
|---|---|
| enter(passerby) | loading → 快照成功 → passerby（`active()`为真）|
| enter(live)，未登录 | 降级为路过 + 提示登录；不发任何live请求 |
| enter(live)，已登录 | loading → 快照成功 → knocking（挂浮层，`quickJoin:true`）；`active()`仍为假 |
| knocking：连上（connected + 本屋peerId） | live，`commit`切场景，写`selfPeerId`，横幅“串门中” |
| knocking：婉拒/不在家/没回应/取消（onKnockResult） | 回idle，toast |
| knocking：加入失败（`error`、`idle`+错误文字、`idle`+`authenticated=false`） | 回idle，toast |
| 见到connected之前的初始`idle`/`left`/`joining`及挂载时回报的陈旧状态 | 忽略 |
| passerby点横幅“敲门串门”（已登录） | knocking（仍在对方家，`active()`为真）；失败留在passerby；连上改live，不重复`set` |
| live：`error`（被请离/重连失败/掉线）、`left`/`idle`（自己结束） | 退出回idle + toast |
| 快照刷新读到404（屋主撤下） | 退出回idle + toast；其它读取失败保留画面，继续每20秒核对 |
| 换一座小屋 | 先`leave`再进新的 |
| `pagehide` | 尽力`leave({keepalive:true})` |
| 横幅“回自己的小屋” | `leave`，toast“已回到自己的小屋。” |

快照刷新沿用旧参观页逻辑：联机时`houseVersion`变化立即重读；committed期间页面可见时每20秒核对`updatedAt`，隐藏页不读取。

## 5. ui.open 拦截

`ui.open`第一行：`G.visitSession && G.visitSession.active() && G.visitSession.blocks(name)`时toast“正在串门，先回自己的小屋再装扮吧”并返回。拦截：build、decor、yard、exterior、houseDesign、roomLayout、shop、garden、residents、crafting、play、quests、collection、observatory。放行：neighbors、cloudAccount、login、avatar、settings、memories、help。各入口（含`ui.houseDesign/roomLayout/crafting.open`）都经`ui.open`。

## 6. 降级

- file入口：`available()`为假（`G.cloud.status().available`为假），链接不拦截，行为保持现状。
- 没有`G.render.visit`（渲染层未就绪）：`available()`为假，入口走旧`/visit/<id>`页。
- 修饰键（Ctrl/Cmd/Shift/Alt）、中键、右键：不拦截，仍新页打开（`href`与`target=_blank`保留）。
- 同源读取失败：友好提示（404=“主人可能已撤下这次公开”，其它=“暂时没有载入成功”），不切场景。
- 没有`G.live`/`G.livePeers`/`G.ui.liveRoom`：敲门不可用，提示并保留路过。

## 7. 测试

`tests/visit-session.cjs`（16组，轻DOM + 桩，真实加载live-avatars/live-peers/host-room/visit-session/neighbors，`ui.open`拦截行从ui.js源码提取运行）：available/兜底；路过不发live请求、不挂浮层、快照冻结、`G.state`不变；未登录降级；敲门等待留在自己家（含陈旧初始状态被忽略）与连上切换、走动、方向键；婉拒/不在家/没回应/取消；加入失败三种；路过升级敲门；leave幂等；被请离/重连失败/自己结束；快照刷新、404退出、版本号触发；读取失败与加载中途离开；换屋与pagehide；host与串门互斥；`ui.open`拦截与放行；入口修饰键/中键/不可用兜底、动态目标、自己房子走hostRoom；静态检查（加载顺序、样式登记、sea-map保护、visit.js无依赖）。`tests/live-room-ui.cjs`新增onKnockResult用例。

## 8. 未验项（如实）

- 未在真实浏览器中目视：场景切换、横幅位置与小屏换行、浮层与横幅是否遮挡HUD/面板、sea-map卡片在串门后是否仍残留。
- `G.render.visit`的scene实现由会话3负责，两边的联调（包括`env.peers`条件、`hidePlayer`、路过时忽略编辑点击、`selfPeerId`）尚未验证。
- 真实双账号敲门→同意→切场景→走动→被请离/撤下公开，未在真实后端跑过。
- 页面隐藏/BFCache回来后的行为只有`pagehide`单测。
- `cloud-account.js`顶部“接待朋友 · N位”链接仍直接`href`到旧页（不在本次范围）。
- 部署、发布快照与`?v=`指纹未处理（index.html里新增行为占位值）。

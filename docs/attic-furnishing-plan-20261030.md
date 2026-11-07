# MC-079 阁楼自由布置：最小实施方案

日期：2026-10-30。状态：只读核查完成，等待总集分配产品文件写入窗口；本报告不是功能交付或验收通过声明。

本轮只新增此文档。已读 `AGENTS.md`、`TODO.md`、`prototype/IMPLEMENTATION-REALIGNMENT.md`，并核查观星、库存摆放、存档、画作、摄影和公开投影源码。未运行规则测试、浏览器、快照或服务，未读取真实账号、私人存档、相片、画作或 `.server-data` 内容。独立只读代理复核了存档和家具两条链路。

## 1. 交付范围

保留现有 Lv17 / 1000 游戏糖果建造的阁楼天文台、固定望远镜和原观星入口，在同一已建阁楼增加自由布置。阁楼始终位于普通最多 4 层 × 每层 3 格之外，不写进 `house.rooms` 或任何 `floors[].slots`。

- 只使用玩家实际库存；家具保留真实 UID、承托关系、深度、层次、颜色、翻转和撤销。
- 可换阁楼墙纸、地板，可沿原画板资格使用现有作品；不新增房型、居民床位或普通房间星级。
- 独立阁楼视图可放大、平移、转动；望远镜与家具采用同一世界比例，放大来自相机取景。
- 不自动建阁楼，不赠家具，不新增真钱、货币、组队、奖励或实时移动区域。
- 观星的每本地日期一次、夜晚门禁、回拨保护、每次 3 碎片、最近记录及 `persist:true` 提交保持。

## 2. 已证实的复用点与阻塞点

行号为本次只读时的定位，邻会话仍在改相机和共享 UI，实施时以函数名重新定位。

| 现有实现 | 可复用或必须调整的事实 |
| --- | --- |
| `js/data/observatory.js`；`js/systems/observatory.js` 的 `status/build/observe` | 阁楼当前只有 `{type:'observatory',paidPrice:1000,builtAt}`；建造与观星各用一次 `persist:true`，事件在成功后发出。只为建造增加空布置字段，不改状态门禁和奖励事务。 |
| `js/systems/systems.js:95` 的 `positioned()` | 仅依赖 `room.items` 和既有规范尺寸，可直接复用地面、墙面、吊顶、桌面吸附规则。 |
| `js/render/room-space.js` 的 `item/placement/tablePlacement/foot/grab` | 接收对象，不依赖 `house.rooms`；320×220、floorLine=200、depth 0–1 和原抓点反解可以原样复用。 |
| `systems.js:94–207` 的 `decorating` | 读、写、预览、选中查询、事务快照及撤销恢复都直接使用 `house.rooms[id]`；必须完整改成装饰空间解析，不能只接 UI。 |
| `systems.js:149` 的 `move()` | 已保留 UID，并把承托家具和直接子物一起跨房移动；改解析入口后沿用此流程，不能通过收起再创建模拟移动。 |
| `systems.js:115–124/201–207` 的撤销 | 房间快照＋库存差值，之后新买的家具不被撤回；库存已送出时拒绝撤销。阁楼也应参与同一栈。 |
| `js/core/store.js:120–166` | UID、画作唯一引用、父引用与总容量校验目前只覆盖普通房间和院子；阁楼必须加入同一集合与计数。 |
| `js/render/scene.js:309` 的 `rooms()` | 是普通楼层格布局，含未建空格；保持其含义，另外构造阁楼装饰空间描述。 |
| `js/render/world3d.js:482–548` | 普通房间循环在阁楼聚焦时全部跳过；阁楼只画固定几何，没有家具平面或家具命中。需要独立阁楼分支。 |
| `scene.js:1347/1365` | 当前整个阁楼区域一点击就进入观星；必须拆开固定观测点与家具/空地命中。 |
| `systems.js:209` 的 `score()` | 依赖普通 `D.rooms` 的 `comfortCap/required`，不能用不存在的 observatory 房型直接评分。 |

## 3. 数据契约和空间解析

采用 `house.attic.room`，不增加普通房间类型。建议规范形状如下，默认颜色集中在 `js/data/observatory.js`，具体图案取现有合法枚举：

```js
house.attic = {
  type: 'observatory', paidPrice: 1000, builtAt: 0,
  room: {
    wallpaper: { pattern: 'stars', color: '#EDDDE7', color2: '#FFF8FB' },
    floor: { pattern: 'wood', color: '#EED7B9' },
    light: 'star',
    items: []
  }
};
```

`builtAt:0` 仅为形状示意，正常建造仍用真实时间。`room` 不含普通房型、建房价格或第二份建造凭据；固定望远镜不是 `items` 元素，没有库存数量或可收起 UID。

空间访问器放在已有 `js/core/store.js`，避免引入只在浏览器加载、服务器校验 VM 却缺失的新依赖。建议公开以下纯访问接口，名称在实施窗口冻结后供 UI/renderer 使用：

- `G.store.atticRoomId`：固定运行态标识 `attic:observatory`。冒号不在普通存档 `validId` 字符集内，可避免与历史导入的合法普通房间 ID 冲突；它不写入普通楼层或居民 roomId。
- `G.store.decorRoom(state, id)`：普通 ID 经 `own` 检查后返回 `state.house.rooms[id]`，不能解析继承属性；固定阁楼 ID 仅在 `attic` 已建且 room 存在时返回该 room，否则返回空。
- `G.store.decorRooms(state)`：返回普通已建房间和已建阁楼的 `[id, room]` 集合；只用于实物、装饰与引用遍历。
- `G.store.replaceDecorRoom(state, id, room)`：仅替换已存在空间，用于 undo；不自动建阁楼。
- `G.store.newAtticRoom()`：从 data 默认值构造全新对象，供旧档迁移和原观星 `build()` 使用。

上述接口接收传入的草稿 `state`，事务内部不能回读 `G.state` 或持有旧对象引用。

### 严格校验和旧档迁移

1. `attic:null` 保持 null；不根据等级、已观星状态或 UI 聚焦自动建造。
2. 恰为原合法三字段的 attic，且原类型、价格、时间和 Lv17 条件均合法时，只在校验克隆中补一个空 room。不能依赖 `mergeDefaults`，因为默认 `attic` 是 null。
3. 新 attic 恰为四字段；显式 `room:null`、残缺 room、错误类型和未知字段拒绝，不用默认值掩盖错误。
4. 新 room 恰为 `wallpaper/floor/light/items`；墙纸、地板和家具按其定义检查允许字段。家具只允许既有通用字段及对应定义允许的 depth/artId；不接受院子家具、未知字段或伪造设施。
5. 抽取普通房间已有的内容校验，阁楼以严格模式复用；普通历史字段兼容不顺手收紧。普通房间仍校验房型、paidPrice、楼层唯一引用和最多12间。
6. 普通房间、阁楼、院子共享全局 UID 集合和 `B.maxItems=1000`。各室内空间单独建立 parent 表，parent 只能指向本空间的无父级承托家具；拒绝跨空间 parent、自承托及无效父引用。
7. 全空间共用 `placedArtIds`，同画作只能装框一次；自制墙纸须引用现存作品。保留落地家具缺 depth 补 .75、非落地不得带 depth 等旧规则。

继续使用现有 version 1 的同版本增量兼容，JSON 是恢复权威，不另造阁楼备份。旧程序不具备读取新 room 的能力，不能宣称双向兼容；发布中的 data/store 变化会更新服务器兼容契约，必须由总集一起接入。

## 4. 装饰事务、库存与奖励边界

`itemIn/preview/place/move/remove/recolor/flip/layer/wallpaper/floor` 及 `decorate/undo` 的空间定位统一改走访问器。原 `positioned` 和 `roomSpace` 的规范坐标保持；地面 depth、墙地装饰、承托组移动和库存差值撤销不另写一套。

- `systems.js:137`、`yard.js:10`、`creative.js:74` 的全局数量计算都纳入阁楼，避免在 UI 可放却在最终校验才超限。
- `collection-book.js:17` 的实际持有数量与 `store.js:286` 的历史回填纳入阁楼；摆入阁楼不应让图鉴误认为物品消失。
- `creative.js` 的全屋挂画查找、删除作品、挂画二次检查、自制墙纸、选中清理纳入阁楼；原 studio 解锁资格保持普通房间判断。删除成功后清撤销，拒写不清栈，防止撤销恢复已删作品。
- 普通 `buildRoom/demolishRoom/changeRoomType`、房间换位/布局模板、居民入住/心愿/生活、工坊/花园/合奏资格及 `quests.metric()` 的房型/主题/房数/楼层/星级遍历继续只读 `house.rooms`。不能全仓替换。
- 迁移、进入阁楼、画固定望远镜和阁楼建造不调用家具 `place`、普通建房或装饰统计。真实库存摆放沿原 `itemsPlaced` 与每 defId 一次的 `placed_` 标志，不新建“阁楼首次”奖励空间，不清旧标志或任何主线/成就领取凭据；移动继续不刷摆放统计。不擅自改既有真实摆放奖励规则。

### 真实拒写保证

当前普通 `decorate()` 使用普通 `store.update`，只有校验和写入租约拒绝能阻止发布内存状态；不能声称其在自动保存磁盘失败时也回滚。观星建造/观测和画作提交则已有 `persist:true`，`store.js:357–362` 为“克隆→规则→校验→commit成功→发布→事件”。

最小新增保障：涉及阁楼的装饰与跨阁楼移动、对应 undo 使用同一个既有 `persist:true` 机制；普通空间原路径不扩大承诺。只在事务成功后计算/压入 undo、弹出 undo、更新成功选择/粒子及发成功事件；对新阁楼动作在 decorating API 边界捕获异常并返回 `ok:false`，避免失败后仍返回“摆好啦”。失败时保留原库存、UID、parent、墙地、统计、观星记录、内存状态和 undo 栈。

不把 UID 生成器的序号消耗当作丢失家具；未提交的新 UID 不进入任何存档或成功事件。移除与撤销若将库存推过原 9999 上限，仍由原校验拒绝，不能丢弃溢出数量。

### 换档和迟到回调

`save.restoreState()` 先校验、落盘，成功后才 replace；失败不发 replace/imported、不清选择/撤销/摄影，也不改变阁楼视图。成功换档沿原清理：撤销栈、drag/pinch/placementPoint、selected/placing/activeRoomId、houseView、命中缓存及摄影草稿。新增运行态如有独立阁楼会话，也挂同一代次清理；旧 DOM 和异步文件/取景回调不能操作新档。

保留 `save.js:83–88` 异步导入的状态引用检查。恢复成功后日常初始化异常属于“目标档已保存＋warning”，不可误报旧档保留。

## 5. UI、真实场景与摄影

### 入口和操作面板

保留天文台面板和原观星按钮，在已建状态增加“布置阁楼”；未建状态仍走现有 Lv17/1000 建造，不出现可提交家具的空房。进入动作只改变运行态：选中阁楼空间，切 `floor:'attic',view:'cutaway'`，打开既有 decor 面板并正确聚焦。

共享 `ui.js` 的房间选择器需要区分用途：装饰 picker 才纳入阁楼；建造/换房 picker 保留普通房。`activeRoom/roomName`、墙地读取和选中工具条两处读取必须识别阁楼。`scene:room` 收到阁楼ID时显式走布置/聚焦，不进入普通 roomMenu，不显示拆除、换用途、换位、居民床位或评分。修掉现有两处显示“Lv18”的阁楼预览文案，统一真实 Lv17。

`ui/creative.js` 的挂画/墙纸位置选项和定位、`ui/photo-editor.js` 的取景选项增加已建阁楼。保留原面板焦点、滚动、档案代次、关闭清理和实际操作反馈，不复制第二套背包或选中工具。

### 场景描述和命中

保持 `scene.rooms()` 为普通楼层格，新增独立 `atticDecorRoom()` 描述，携带 `kind:'attic'`、固定空间 ID、规范320×220原点、数据和独立3D基座/边界；它只是渲染描述，绝不写入真实楼层。

- 家具查询、itemAt、roomAt、placementCoords、focusRoom、拖动预览和选中轮廓可解析两类装饰空间；名牌换位、openRoomSlot、roomDragValid、普通房屋结构仍只消费普通格。
- `world3d` 在独立阁楼分支绘制真实 wall/floor/items，复用家具模型与层次排序。将 `furniture/groundAt` 和墙面投射中的普通 `floorY/roomX` 假设集中为“空间基座”解析，阁楼明确给 base/center；不能用伪造 floorIdx 冒充第五层。
- `logicalToWorld`、地面/墙面/承托求交、家具 legacy 坐标和摄影必须使用同一描述；不能只添加可见模型而保留旧点选包围盒。
- 当前覆盖整个阁楼的 `kind:'attic'` 命中改为固定观测点命中。家具优先选中，空地用于布置/聚焦，固定望远镜才触发原 `scene:observatory`；未建阁楼预览保持只读且不可放置。
- 固定望远镜放在可布置平面后方的专属观测壁龛，使用同一单位比例，独立几何/命中不参与家具库存。由空间边界隔开，避免增加一套家具碰撞业务规则；镜头边界包含家具平面和完整望远镜。默认外观保留屋顶，阁楼剖面打开前方壳体。
- Canvas降级也绘制同一批真实阁楼家具并使用一致局部坐标；保留明确降级状态。当前 `G.draw.observatory.draw` 是含静态示意摆件的插画，不能把其中小凳/本子当实际库存家具。
- 不新建 GL context、Canvas动画循环或服务。保留30fps封顶、后台停绘、减少动态、context恢复和destroy；退出阁楼/切档恢复现有家园相机语义。

### 摄影与公开展示

`systems/photography.framing()` 接受已建阁楼 ID；相册只存图片和装饰，无需增加持久 roomId。`captureScene(scope:'room')` 显式把阁楼映射为 `floor:'attic'`，不能计算 `floorIdx+1`；整屋/当前视野取景也应包含已建真实阁楼。保持取景 finally 对镜头、尺寸、视图和命中缓存的恢复，不从衣橱等展示舞台取景，不把拖动预览或未建扩建预览拍成真实进度。

## 6. JSON、MD、离线和公开快照

- JSON导出/导入、离线副本/冲突恢复和云存档均沿现有 `store.validate/save.restore`；不建立旁路阁楼存档键。`js/core/offline.js`、`server/offline.cjs` 和 `cloud-sync.js` 无需因 room 字段改算法。
- `save.exportMarkdown()` 保留原观星段，补阁楼墙地和真实家具/位置/depth清单；画作挂画/墙纸引用次数包含阁楼。MD继续只是可读回忆，恢复用JSON。
- `public-house.project()` 保留旧 `house.attic:boolean`，新增可选 `house.atticRoom` 视觉白名单（wallpaper/floor/light/items），不加入普通 rooms。收集阁楼所引用作品，但仍只公开 `{id,pixels}`。
- `materialize()` 严格接受并验证该可选字段；有 atticRoom 必须同时 attic=true，false＋room拒绝；旧true且无room补空、旧false保持未建。生成合成态时去掉视觉中转字段，把内容放回真实 `attic.room`，再统一 validate。
- 不公开 attic 的价格/建造时间、库存、账号、生日、星碎片、观星日期/次数、照片或私人作品名。公开只来自用户主动发布快照，不自动更新公开状态。
- 当前独立参观页走 `captureScene` 的Canvas路径，整屋需显示新阁楼视觉数据；可继续使用原缩放。此最小包不添加阁楼实时移动 zone/同屋新协议，不把阁楼当普通房数。旧快照可由新读者读取；旧严格读者不能理解新字段，须随总集更新当前参观资源，不能称旧程序双向兼容。
- `server/save-validator.cjs` 已从发布清单加载全部data与store，并另加载public-house；访问器放store后无需修改VM加载名单。`contractHash` 会因data/store变化而变化，由总集标准整合处理。

## 7. 必须写入的文件与窗口

本次仅写本报告。以下是实施必需清单，不代表当前获准并发写入。

| 窗口 | 产品文件 | 最小责任 |
| --- | --- | --- |
| MC-079数据/规则窗口 | `js/data/observatory.js`、`js/core/store.js` | 空room配置、空间访问器、严格兼容校验、全局引用/数量/历史回填。 |
| MC-079数据/规则窗口 | `js/systems/observatory.js`、`js/systems/systems.js` | 仅build初始化room；装饰/撤销按空间解析，阁楼持久事务和失败边界。 |
| MC-079数据/规则窗口 | `js/systems/yard.js`、`js/systems/creative.js`、`js/systems/collection-book.js`、`js/systems/photography.js` | 全局容量、作品引用、实际持有数和阁楼取景。 |
| MC-079数据/导出窗口 | `js/core/save.js`、`js/core/public-house.js` | MD、公开白名单/旧快照恢复及隐私。 |
| 独立页窗口，先由总集确认MC-078已释放 | `js/ui/observatory.js`、`js/ui/creative.js`、`js/ui/photo-editor.js` | 保留观星并加布置入口、作品与摄影空间选择。 |
| MC-077释放后的共享窗口 | `js/ui/ui.js` | 装饰专用空间picker、active/selection/墙地、入口与Lv17文案。当前禁止争写。 |
| MC-076释放后的渲染窗口 | `js/render/scene.js`、`js/render/world3d.js` | 独立空间描述、正确比例/相机/家具命中、Canvas降级与摄影。当前禁止争写。 |
| 总集最终整合 | `index.html` | 必要资源指纹刷新；本方案不强制新增script/CSS，无需新加载依赖。当前由MC-077独占。 |

共16份既有产品文件，另由总集处理入口指纹。可选抽取纯阁楼几何helper须先报总集，不作为必需依赖；`css/observatory.css` 仅在真实排布需要且获窗口时窄改，优先复用现有按钮布局。`server/*`、`cloud-sync/offline`、普通房间布局、居民、quests、原型和共享shell/CSS不必改。

必要独立检查文件可新增 `tests/attic-furnishing.cjs`、`tests/attic-furnishing-scene.cjs`、`tests/attic-furnishing-ui.cjs`；它们只用合成夹具，不自动启动服务/浏览器，不读取本机存档，也不被其他检查自动require。若旧回归存在三字段或旧渲染断言，先确认真实契约再窄修夹具，保留原业务断言。

建议总集顺序：先冻结并完成用户当前相机/扩岛/邻居预览 → 分配MC-079数据窗口 → 冻结空间接口与规则 → 依次分配共享UI与renderer窗口 → 串行必要检查 → 总集统一4173整合和真实视觉复核。中间不prepare/activate，避免半接线新状态干扰当前可看版本。

## 8. 最短定向检查（本轮全部未运行）

新增检查先覆盖这些不可被源码断言替代的行为：

1. **兼容/拒错**：旧合法三字段迁移为空，null不建；错误/残缺/未知字段拒绝；4×3与12普通房不变；阁楼不能普通换位/拆房/入住。
2. **实物守恒**：一件真实库存→阁楼→depth0/1→桌面承托→跨普通房移动（父子UID不变）→收起→撤销；后买库存不撤回、已送库存拒撤销；global maxItems、跨三空间重复UID、越界/NaN、跨空间parent和重复挂画拒绝。
3. **拒写/换档**：安装真实save.commit拒写桩及writeGuard，检查阁楼place/move/墙地/undo/画作和观星未发布任何成功状态/事件且库存/栈原样；移除拒写后重试仅一次；失败恢复保旧会话，成功换档清旧拖动/选择/相机/摄影/undo，迟到回调无效。
4. **观星/奖励**：保留Lv17、1000、夜晚、本地日期、午夜、回拨和3碎片；新布置不改观星记录；迁移/进入不改roomsBuilt、主线普通房/主题/星级指标或领取凭据；真实摆放沿旧firstPlace标志，不产生新阁楼奖励。
5. **作品/导出/隐私**：编辑同ID实时反映阁楼挂画和墙纸；删除在同一持久事务清引用；JSON roundtrip与MD内容一致；旧/新公开快照可恢复，伪字段拒绝，只公开已引用像素，私密字段和照片均不出现；file入口不联网。
6. **真实投射**：旋转/缩放/仰视/面板遮挡下地板、墙面、台面、吊顶、拖动抓点与所见位置一致；家具命中不被大阁楼入口抢走，固定观测点可用；外观/剖面、阁楼/整屋摄影和Canvas降级同一数据；取景后镜头/命中恢复，后台/context/destroy无残留。

总集串行执行建议（不并发、不另起监听）：

```text
node tests/attic-furnishing.cjs
node tests/attic-furnishing-scene.cjs
node tests/attic-furnishing-ui.cjs
node tests/observatory.cjs
node tests/save-restore.cjs
node tests/creative.cjs
node tests/photography.cjs
node tests/public-house.cjs
node tests/room-depth.cjs
node tests/room-layout.cjs
node tests/yard.cjs
node tests/collection-book.cjs
```

data/store/public契约变动后再定向跑 `cloud-core.cjs`、`offline.cjs`，结合实际改动选已有world3d/摄影UI检查；无新失败不重复全仓。最后由总集复用原4173、原浏览器，以隔离合成状态验桌面与390px阁楼入口、真实布置/取景、望远镜比例和观星保留，核对后才能称完成。不得用私人进度进行此链路。

## 9. 当前交接状态

**已停止写入，等待总集分配文件窗口，不需要用户再次授权。** MC-076当前相机/3D renderer、MC-077共享UI/index/shell以及MC-078肤色窄修均未被本会话改动。未运行任何检查或改动TODO/AGENTS/README；项目跟踪由总集维护。

方案完成后，存档与家具两条独立只读复核均未发现实质遗漏；此结论只针对方案可实施性，不表示规则检查或视觉验收通过。

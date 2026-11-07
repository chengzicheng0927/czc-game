# MC-076：软陶3D家园第一阶段源码交付

日期：2026-10-30。状态：源码已接入；尚未激活资源、运行规则/UI/raster检查或进行正式根页浏览器视觉验收。不能据此将MC-076或整套原型还原标为完成。

## 实改文件与入口资源

只改本任务独占范围：

- `js/render/world3d-models.js`：新原生几何工厂。实际家具template/theme/染色/翻转、挂画像素、真实人类形象/衣物与动物居民、树木/花/草坪/土层/云。
- `js/render/world3d.js`：新原生WebGL引擎。几何基础来自本项目原型，移除示例进度；按真实state建立家园、命中和人物绘制区间。
- `js/render/scene.js`：最小渲染、摄影、输入、可用视口和生命周期接线，保留原Canvas降级及规则提交。
- `tests/world3d-contract.cjs`：新13组CPU投影/语义拾取/有状态GL资源检查，未执行。
- 本报告。

由总集/MC-077在原入口的 `js/render/scene.js` **之前**按顺序加入两个普通script；不需要ES Module、CDN、额外CSS或第三方库：

```html
<script src="js/render/world3d-models.js"></script>
<script src="js/render/world3d.js"></script>
<script src="js/render/scene.js"></script>
```

现有data、systems、`room-space.js`应继续先于这组加载。现有`live-avatars.js`、`live-peers.js`、`avatar.js`等保持现有顺序，只须在`main.js`调用`render.init()`前全部加载；新模块在init/build时才读取它们。入口指纹和发布资源manifest均由总集统一处理，本会话没有修改入口、prepare/activate或发布快照。

## 已接入的默认成功路径

主游戏`render.init()`创建一个长期复用的离屏WebGL context；真实3D顶点经深度测试和原型同源的柔光shader绘制，再逐帧复制到既有`#scene` Canvas。保留原Canvas DOM、输入、摄影输出接口；这不是静态贴图，也不把2D旧房屋描边作为3D。`#scene.dataset.renderer`与`render.rendererStatus()`可确认实际`webgl`/`canvas-fallback`和降级原因。

- 实际`house.floors[].slots[] → house.rooms[id]`决定已建格、空格和家具，不生成示例房间。最大四层三格、实际等级限制仍由原building系统执行；四层预览只使用运行态。
- 楼板、背墙、侧墙和剖面低墙具有进深；红粉屋檐、烟囱、屋外窗门、独立阁楼与望远镜有实际几何。草坪、泥土底座、云团与前院边缘都有厚度。
- 家具按真实def/UID/parent/depth/z/color/flip建立模型，沿原`roomSpace`反算进入原decorating系统。家具深度中心保留端点边距，避免合法depth=0/1穿墙或悬出地板；桌面承托按实际模型台面高度求交。
- 房间墙纸/地板颜色与基本点纹/条纹/木纹/砖格读取真实配置；家具customArt读取真实挂画像素。
- 真实avatar、入住动物、糯米、花园作物stage/mature/需水、花园临时访客与+5原动作、前院家具均可绘制。作物阶段变化只在签名改变时重建。
- 实际公开邻居从既有`seaMap.positions()`和对应位置`hitAt()`取得；不生成原型样本邻居、不联网。主游戏同屋人物订阅既有`G.live`只读状态，按相同3D镜头投影真实位置、称呼和撞脸彩环，不改协议。
- 普通拖动空白转镜头，Shift拖动平移，滚轮/双指缩放；保留房间名牌交换、家具/前院拖放、HTML拖入和点击事件。命中使用当前镜头射线及对象语义，落点回传旧逻辑坐标。

## 公开接口与兼容

原`G.render`全部保留：`init/start/resize/camera/captureScene/drawThumbnail/drawCharacter/harvestOrigin/layout/getHouseView/setHouseView/redraw`。

`camera.x/y/scale`与原`worldToScreen/screenToWorld/fit/zoom/focusRoom/focusFloor/focusObservatory/focusGarden/focusSea/focusYard`仍在；新增`rotate(dx,dy)`。`layout`原八个函数保持旧世界坐标，供参观页和原测试使用。新增`destroy()`和只读`rendererStatus()`。

既有scene/yard选择、房间交换、居民/玩家、花园、阁楼、邻居和取消事件仍由scene层发出；持久状态仅由原系统操作，不添加store写入。`panel:change`保留原open/height，并识别`layout:'side'`；优先使用`Game.ui.sceneViewport()`给出的相对`#scene`可用矩形及x/y偏移，getter缺失时兼容旧底部面板。

主游戏的`captureScene({scope:'house'|'room'|'view',roomId,floorFocus,viewMode,hidePlayer,width,height})`在WebGL已初始化时输出真实3D Canvas，可继续PNG与编辑器流程。尺寸和非法room的原错误保持；`finally`还原原镜头、拖动、命中缓存与运行态，并恢复主场景环境。

参观页的`main.js`分支从不调用`render.init()`，因此没有World3D实例，**仍使用旧2D capture/frame/crop**。这样保留现有访客人物投影和走动反算；参观页本轮尚未还原为3D，不能把主游戏同屋3D与独立参观页合并称全部串门场景完成。

## 资源与运行约束

- 场景最多30fps，小游戏背景5fps；减少动态时事件驱动单帧，真实作物阶段等只设下一次唤醒，不持续RAF。
- 页面隐藏取消RAF及定时唤醒，恢复后重绘。DPR上限1.5。只复用一个WebGL context。
- 静态几何按state/view/临时拖动隐藏/作物阶段/实际邻居和人物外观失效重建；镜头和人物位置只更新矩阵/offset，不逐帧重建整屋或上传网格。拖放预览只在预览参数变化时重建自己的小buffer。
- 处理context lost/restored；无WebGL或初始化/绘制失败使用原可操作Canvas并显示平面场景状态。销毁释放DOM/bus/live/MQ监听、ResizeObserver、RAF、唤醒定时器、buffer/program/shader和GL context。
- 本次没有操作浏览器/4173服务、真实账号或私人存档，没有网络/服务器/业务规则改动，没有部署/压缩包。

## 验证状态与总集命令

本会话只执行并通过：

```text
node --check js/render/world3d-models.js
node --check js/render/world3d.js
node --check js/render/scene.js
node --check tests/world3d-contract.cjs
```

以下尚未执行，请总集串行运行，不与其他开发会话并发：

```text
node tests/world3d-contract.cjs
node tests/room-layout-scene.cjs
node tests/room-space.cjs
node tests/room-depth.cjs
node tests/garden-space.cjs
node tests/photo-composition.cjs
node tests/photography.cjs
node tests/live-avatars.cjs
node tests/host-room.cjs
node tests/prototype-batch1.cjs
node tests/public-house.cjs
node tests/harvest-feedback.cjs
```

新增13组覆盖：桌面/手机与旋转投影、偏移视口、房间/空格/家具身份、墙/地板反算、非中央家具抓点、实际台灯/床头柜承托与parent UID、楼层聚焦、九格采收锚点、几何有限值/法线、state变化重建、DPR、context恢复及销毁。GL替身不能证明shader实际编译、真实GPU画面或最终操作体验。

随后由总集在原4173原浏览器统一加载新资源，桌面1280×720及390×844对应原型同尺寸核对；实际点击空格建房、家具从背包放置/移动/跨房/桌面承托、名牌换房、屋外/剖面/各层/阁楼、花园采收、同屋投影、缩放旋转、摄影house/room/view与PNG。截图需显示真实根页新版资源。按本次限制没有运行Impeccable detector或视觉截图/finish review，此部分同样由总集验收。

## 明确保留的后续范围和风险

- 尚无真实根页/原型同尺寸画面对照，shader在真实GPU、触屏、Safari和context恢复的实际表现待验；不能称整套视觉已验。
- 独立参观页/匿名路过仍为旧2D；公开邻居目前是根据真实公开元数据绘制的微缩几何外观，没有重建每个公开快照的全部内部家具。
- 家园保留原逻辑的独立花园空间，没有直接复制原型示例庭院位置；其镜头占比与手机标签密度需总集实际截图判定。
- 31种外观目录的专属轮廓、全部墙纸/地板图案与画作墙纸、节庆场景装置、四种房间光照的独立局部灯效，尚未逐项3D还原。本期屋外使用真实装备配色与烟囱状态、统一立体窗门和软陶屋顶。
- 居民位置读取residentLife，专属坐卧/读书/伸展/生日帽与夜间床内姿势尚未全部转换为3D骨骼/几何动作；同屋人物已有真实位置和名牌投影，但平滑步态尚待视觉核对。
- AABB语义拾取、墙/地板/桌面求交已实现；家具透明/空心轮廓、重叠家具或侧墙遮挡的极端点击仍需真实操作核对。未以源码测试冒充这个验收。

本会话未改TODO、AGENTS、README或共享设计文档；由总集维护MC-075/076状态，MC-076不应仅凭本次源码交付勾选完成。

## 总集首轮检查后的测试夹具修正

总集报告新增`world3d-contract.cjs`的13组已通过；既有`room-layout-scene.cjs`前9组通过，第10组读取主画布“· 换位”时失败。核对确认：旧夹具的`requestAnimationFrame: () => 1`丢弃全部回调，新版事件驱动重绘排入首帧后从未被测试执行；降级绘制路径仍保留原名牌文字和命中逻辑。

按总集授权仅调整`tests/room-layout-scene.cjs`：增加可推进时钟与单批RAF队列；第10组先通过真实`render.redraw()`和帧回调绘出名牌，再在不足帧间隔时断言零重绘，满帧后确认实际拖动提示。摄影隔离同时要求照片有实际绘图、无名牌/提示，并保持主画布调用数、state、镜头、指针捕获和待执行RAF不变；原pointerup仍应只交换一次。没有添加虚假的Canvas调用、移除标签或放宽命中。

该修正仅执行并通过`node --check tests/room-layout-scene.cjs`，未自行运行规则测试。请总集串行复跑`node tests/room-layout-scene.cjs`。此次未改场景源码、入口或快照；已停止写入。

## 家具漏绘窄修与当前检查边界

总集报告此前16组契约及10组房间名牌检查通过。真实scene输入夹具暴露正常环境`omitUid:null`与家具`parent:null`误匹配，导致普通家具被过滤；按总集单独授权，仅将`world3d.js`对应一行调整为无omit UID时保留全部家具，明确指定UID时才隐藏本体及其承托子件。该产品文件已再次冻结，未修改其它产品文件、入口或快照。

`world3d-contract.cjs`现17组。新增一组使用真实床、床头柜及规则建立的台灯子件，在同一world依次检查`undefined → null → 父UID → 子UID → 不存在UID → null`，验证实际UID集合、真实网格和状态不变，涵盖`roomOnly`及摄影绘制选项。新增组仅语法检查通过，未由本会话执行。`world3d-input.cjs`现7组，保留正向拾取与真实Pointer/HTML drop提交保护；当前尚未通过全部组。

总集后续反馈：输入测试已越过家具UID缺失，正向`framePoint`仍未命中挂画。只读源码分类发现，夹具设Lv.11，真实`expInto()`会扩展第二层；它只调用`camera.focusRoom()`，仍保持`houseView.floor:'all'`。挂画中心约为`[-3,1.394,-1.17]`，当前角度`.43`/俯角`.49`的射线在上层空格前缘`z=1.35`处约为`[-1.844,2.873,1.35]`，位于上层空格命中包围盒内；射线同时穿过实际上层楼板。因此“目标模型存在且屏幕坐标在viewport内”尚不能证明它未被上层遮挡。此为源码推算，未自行运行测试；所读取旧日志仍为先前UID缺失记录，尚无本次pick返回kind的日志。建议下一步保持正向断言，通过真实`setHouseView({floor:1})`隔离目标楼层，再验证原UID和实际射线；或先输出实际pick kind以核实遮挡对象，不能直接忽略正向控制。

## 下一小批候选：同屋人物跨区域缓存（P2，未实施）

总集独立复核发现：`setEnvironment()`的peer签名包含id/avatar/displayName/isHost，未包含zone；`build()`却根据zone及当前楼层决定是否建立peer actor。相同peer从隐藏楼层进入前院只改变zone时，不会重建先前缺失的actor；反向移动也可能保留本应隐藏的actor。已只读核对该条件，未修改产品。

下一批验收应使用同一peer、相同外观/称呼和不变state，依次执行隐藏楼层→yard→可见房间→隐藏楼层，并核真实actor集合和位置；同区域x/y移动仍只更新offset，不应每次重建整屋。此项等待总集授权下一产品修改窗口，不混入家具漏绘热修，MC-076继续保持未完成。

## 仰视、复位、实体墙与整身转向冻结包

用户实际预览后追加主场景要求，已在新授权窗口完成源码，以下文件现在停止写入，可先由总集独立接线发布这一批：`js/render/world3d.js`、`js/render/scene.js`、新`js/render/world3d-avatar.js`。`world3d-models.js`继续沿用，并只读消费MC-078更新后的真实肤色/服饰数据；未改MC-078的UI、exterior预览或data文件。

- 主相机俯仰开放为`[-0.5,1.05]`弧度，约−29°到60°，离开极点；默认角度仍`.43/.49`。新增公共`camera.resetView()`恢复默认旋转、真实整屋/非四层预览及合理取景，取消临时放置/拖动、回到explore，保留当前剖面/屋外选择。普通fit/resize不重置用户旋转。
- 水平射线共用`rayPlane()`拒绝平行/后方交点；确无业务平面时pick返回null，screenToWorld返回明确invalidProjection标记。scene的放置、预览、点击、拖动释放和zoom锚点均拒绝该标记，避免NaN污染相机或误收回家具。普通房间可使用真实后墙平面反算。
- 所有空格现在有实体背墙和侧墙，外侧墙保持完整高度/进深，内部隔墙前缘参照原型降低；空格实际绘制“待建房间”标识。屋外模式不论是否已建都绘连续完整前墙、外侧墙及窗门，使屋檐有实体承托；不生成真实房间或库存，保留全部原格位和UID。
- `G.render.drawAvatar3D(canvas,look,{yaw,facing,still})`已提供；同步boolean，true表示实际GL已合成，false允许现有UI降级。yaw为弧度且优先；默认正面，facing −1/+1是全身左右45°。真正旋转整个人物的所有position与normal，而非仅翻配饰。旧`drawAvatar`不变。
- avatar模块共用一个专用离屏World3D context，与主相机独立，透明合成，DPR≤1.5，缓存有界；后台不绘制，context恢复可重绘，`render.destroy()`统一调用avatar模块幂等销毁。
- 已窄修peer zone缓存键，跨隐藏房间/前院会更新actor集合，同区域x/y仍只更新位置；上述“下一小批候选”现为已实现待总集复验。契约现18组，新增真实zone切换回归。

本包需要入口顺序：`world3d-models.js → world3d.js → world3d-avatar.js → scene.js`，均在UI调用及main之前。入口及指纹由总集处理。

可选两页stage的消费框架已经准备：读取`runtime.shellLayout.panelKind`和`residentBookV2.friend`，可选调用`G.pageStages3D.describe(env)`；没有该模块保持家园。进入时清家园hits，stage点击/HTML drop只读，舞台orbit/zoom/pan不改家园相机，离开恢复；实际摆放/拖动与摄影强制家园。`page-stages3d.js`由MC-078独占，尚未作为本包前提；其内容与真实画面未验，不能把这段可选接线称两页中央舞台已落地。若总集启用它，放在world3d之后、scene之前。

本会话只通过上述产品文件和新增测试文件的`node --check`。请总集串行执行：

```text
node tests/world3d-contract.cjs
node tests/world3d-house-camera.cjs
node tests/world3d-avatar.cjs
node tests/world3d-input.cjs
node tests/room-layout-scene.cjs
```

新增house-camera 6组验证负俯仰/平行射线/复位/真实墙面顶点与连续外墙；avatar 7组验证实际整段网格旋转、暖黄真实metadata、单GL/缓存/恢复/后台/销毁。另有可选stage 8组`node tests/world3d-stage.cjs`，使用纯descriptor替身验证消费与输入/摄影隔离；不是MC-078真实模块像素验收。均未自行执行规则检查或浏览器。

用户最新院子反馈已接收：右侧真实garden岛/种植/桥接保留，前院后续须消费总集提取的纯`prototype-yard3d.js`原型组合；该文件由总集另派代理独占，当前未消费，不把本包空格墙壳修正称前院已经按原型还原。后续接入收到模块后另开产品修改窗口，避免争写已冻结发布文件。

## 默认平移、扩岛及邻居云岛冻结包

2026-10-30最新授权窗口已结束，产品仅修改`js/render/world3d.js`和`js/render/scene.js`，现停止写入。下列内容覆盖上文尚未接入原型院景等旧状态；没有修改总集独占的`prototype-yard3d.js`、`sea-map.js`、入口、UI、数据、系统或账号存档。

- 主场景默认空白单指/鼠标拖动沿当前相机right/up平移；家具与房间名牌拖动继续优先。公共`camera.getInteractionMode()`返回`pan|orbit`；`setInteractionMode(mode)`只改变runtime并发`camera:interaction`，显式reset恢复pan。Alt可临时旋转。主场景yaw归一到`[-π,π)`，俯仰保留`[-.5,1.05]`。显式可见模式按钮由UI所有者接入。
- GL相机用真实3D地形/屋顶/阁楼/院景保守边界取景；fit/resize保留旋转，平移由当前焦点和可用viewport约束。缩放上下界随viewport和整景投影重算；云海全览单独允许覆盖全部正式云位，默认整景只为最近三朵云留边，避免40户把家园缩成小点。滚轮使用相机平面锚点，不再调用语义pick，因此水平视角、家具/地面切换不造成锚点突跳。
- 摄影house/room使用独立真实3D取景并忽略交互pan；view保存当前target/range及宽高比覆盖。拍摄不改主相机baseTarget/pan/focus，成功与异常均在finally恢复。数字floor摄影优先所请求楼层，避免沿用主镜头的旧floor index。
- 主草坪圆参数为中心`(-.6,.9)`、半径`7.25`；房屋、人物和家具不整体缩放。保留原左右`(-4.3,3.4)/(4.3,3.4)`半径3延展，承托正式yard合法范围。报告仅称主圆扩大，不声称整个联合草坪面积精确增加19%。右花园、九格种植和八块桥梁坐标不变。
- 原型组合已通过纯`G.prototypeYard3D.build()`接入，消费`origin:[0,0,.3],scale:1.2`及粉/莓红palette，不伪造可编辑UID；读取总集更新后的组合坐标，无额外二次缩放。真实已放庭院家具继续来自house.yard。
- scene优先只读`seaMap.visualPositions()`并降级`positions()`。真实与空云均有独立固定3D位置，按主岛、两块庭院延展、右花园及邻居自身云底保守半径推离；计算不依赖当前镜头。位置缓存`neighborLocations`至多64项，键含id/empty/原槽位/scale，六朵同为`empty`的占位云不会重叠成一朵。近云保留正式`.72`比例；真实ID/title/online继续读取元数据。空云不绘假房屋/在线灯，标签“待邻居入住”；body与label命中均带原逻辑world及empty，scene转发已有邻居事件，不发起虚假入户。
- 主shader光照RGB系数改成中性标量，去除原绿色/黄色偏置；法线、光向、柔光强度、specular及夜色算法保留，未覆写角色肤色数据。阁楼未建时仅显示待建平台与“阁楼待建”，不再绘出已建望远镜；完整阁楼编辑/精细望远镜仍属于后续独立范围。

本轮产品`node --check`通过。新增`tests/world3d-camera-input.cjs`7组、`tests/world3d-island-bounds.cjs`3组、`tests/world3d-neighbors.cjs`4组，并适配`tests/world3d-input.cjs`默认pan与真实受限边距夹具。岛屿检查使用实际草坪三角形核四个yard合法角落承托；相机检查覆盖跨π、负俯仰CSS像素平移、无语义pick缩放、极端输入焦点、真实边界fit和摄影finally隔离。邻居检查覆盖实际空云/公开ID、真实缩放网格、固定位置避让、64项缓存上限、默认最近三云与显式40户全览，以及label/body点击的empty透传。测试仅做语法检查，未在本会话运行；真实GL shader编译、鼠标/触屏手感和同尺寸像素仍由总集验证。

建议总集串行复跑现有contract18、house-camera7、avatar7、yard5、input7、room-layout10，以及新camera-input7、island-bounds3、neighbors4；可选stage8另验，不将descriptor替身等同于真实舞台视觉。最新可选stage接线不改变本轮封口范围。

没有新增入口资源；沿用models → world3d → avatar → prototype-yard3d/可选page-stages3d → scene的依赖关系，sea-map须先于scene可用（现有入口由总集管理）。本会话未改TODO；MC-076是否完成由总集根据规则与真实浏览器验收决定。

## 南瓜灯摆放P1入口修复

总集反馈上述主回归68组已串行通过；该结果属于前一冻结包，不代表本次装扮实链已验。可选stage第3组另因夹具使用不在正式衣橱枚举内的发色而被存档校验拒绝，已仅将夹具改为另一合法发色，保留stage key/外观/无额外写入断言，未宣称stage8组通过。

用户随后实报“选南瓜灯点已建房仍提示先建房”。只读实链确认两种`festival_pumpkin_lantern`/`craft_pumpkin_lantern`都是正式floor家具，库存与3D模型正常；旧UI只设置placing并focusRoom，后者不退出原houseView的其他层、阁楼、屋外、未来预览，也不修复背面/水平镜头。目标房可能不在当前hits中，或地板射线没有有效交点，随后roomAt返回null。不能以activeRoom替代真实命中。

本窗口只改产品`js/render/scene.js`，未重开world3d模型、灯光、地形或阁楼规则：

- `G.render.beginPlacement(defId,roomId)`返回`{ok,message,roomId?,defId?}`，只读校验正式家具、实际floors.slots中的已建房间及库存；不额外限制已拥有节日家具的日期或等级，不消耗库存。成功清旧手势/命中/预览，进入decorate，切目标真实层/cutaway/preview=false，设置正面yaw0、正俯仰.49、清pan并按真实房间取景。yard仍走原前院入口。
- `G.render.cancelPlacement()`清placing/mode/selected、手势/预览/hover/lastPick及光标，回explore并发`placement:cancelled`，保留目标房选择。Escape与state:replace消费同一清理；换档另清activeRoomId，旧pointerup不能继续提交。
- GL placeItem只使用传入point.target.room，并核对当前实际层格；不使用activeRoom或旧二维矩形补房间。实际floor/table/wall/ceiling反算与既有decorating规则保留。成功只扣规则实际提交的一份库存，清placing并保留规则返回的真实UID；规则拒写异常显示原错误，保持可重试/取消。
- `camera.screenToWorld(x,y,defId?)`可按HTML载荷指定家具支撑类型，dragover/drop与点击共用同一求交，不再依赖旧runtime.placing的类别。已在scene出现过的DataTransfer以弱引用记录放置代际，取消/换档/完成后拒绝其迟到或重复drop；保留既有无placing但合法的直接HTML drop。仅含defId、从未在scene出现过的旧外部拖放无法自行识别来源存档；UI旧按钮仍须读取当前状态并调用入口校验，不能用旧DOM闭包盲设runtime。

产品已冻结，只通过`node --check js/render/scene.js`；新增`tests/world3d-placement.cjs`6组真实南瓜灯Pointer/HTMLdrop夹具也仅做语法检查，统一由总集串行运行。覆盖错视图恢复、同坐标同roomId/深度、payload支撑类别、库存一次扣除、取消/Escape、换档旧手势/房间闭包和原前院路径；每个正向房内控制点先要求真实ray命中，不以activeRoom兜底。UI可见取消/换一件及所有选择入口由MC-077消费两API，本会话不改共享UI、入口、存档数据或TODO。

## MC-080独立花园宿主接线冻结

总集已反馈南瓜灯新6组、input7、room-layout10、camera-input7及可选stage8通过；旧release交错窄修也已独立resolved并由总集激活。以下是随后单独开放的花园窗口，不能沿用这些通过结果称新园区已验。

本次只改`js/render/world3d.js`、`js/render/scene.js`，新增`tests/garden-page3d-scene.cjs`9组。只读消费MC-080冻结的`garden-page3d.js`与真实花园UI/规则，没有修改它们或CSS、数据、入口和TODO。加载依赖为`world3d-models → world3d → garden-page3d → scene`，既有avatar/yard helper保留，由总集统一入口及快照。

宿主每帧用真实surface/gardenLayout/statuses/selectedPlot/原visitor生成`env.gardenPage`，不塞入只读stage。独立build只包含模块园区几何，注册原plot/visitor hitBox与labels，p.y按底边使用；不绘主屋、小花园、邻居或家园人物。真实6/9索引通过`scene:garden → ui.garden.openPlot(index)`沿原播种/浇水/收获入口，访客沿原一次奖励分支，没有新规则、访客或计时器。状态/选择key更新几何但不复位相机。

`world.gardenView`独立持有angle/elevation/zoom/panX/panY；pan按right/up、zoom按相机平面锚点，360°yaw及有限俯仰、descriptor bounds/focus限位和sceneViewport均保留。园区进入/退出保存恢复完整家园baseTarget/baseCamera/legacyRef/pan及public focus与数字相机；普通fit/resize不把园区视角写回家园。页内显式reset只复位园区。拖动园区只操作相机，不误触地块；未移动才沿真实plot/visitor点击，保留最新pointerId归属保护及pinch增量缩放。

worldToScreen经模块worldToPage转换旧逻辑点；harvestOrigin直接投影对应harvestAnchor。3D点击会在同步业务事件前暂存当前植株起点，避免harvest先更新state、清空地块后变成empty锚点。既有harvest-feedback仍优先可见DOM卡片，因此本宿主helper通过并不等同于整条动画已从3D起飞；未越权修改该UI。

摄影house/room/view始终forceHouse，并在园区scope:view使用保存的真实家园target/range/aspect，不把园区镜头或示例进度拍成家园。成功/异常finally恢复园区；真实摆放、已有家具/名牌拖动强制家园。园区仍显示且未beginPlacement的直接HTML payload拒绝提交，避免用可见园区像素点中隐藏家园；已选择家具与原家园合法直接drop保留。

两产品和新scene测试仅`node --check`通过；没有运行规则、浏览器、服务、发布或账号存档。最短新检查为`node tests/garden-page3d-scene.cjs`，必要回归为world3d-placement/input/camera-input/contract、room-layout-scene与可选world3d-stage；模块8/UI16/加工导航4由总集已跑，产品未修改。真实桌面/390px园区、滚动返回与播种/浇水/收获仍由总集验收，不宣称整页视觉完成。

## MC-079真实阁楼渲染接线冻结

总集已反馈园区scene9、相关56组及标签修正后的input7/contract18/room10通过，fd64由总集激活并实际点击核对园区。以下阁楼窗口只改`js/render/world3d.js`、`js/render/scene.js`，新增`tests/attic-scene.cjs`9组；数据/规则沿用总集已核的MC-079十份源码，没有修改共享UI、花园纯模块、core/data、live模块或入口。现有`world3d-models.js`直接复用，未修改，也没有新增加载依赖。

阁楼通过`atticDecorRoom()`/`render.layout.atticRoom()`生成独立描述并传入`env.atticRoom`：固定ID取`store.atticRoomId`，data来自`store.decorRoom(state,id)`，只在真实已建时存在。逻辑平面保持320×220，没有floorIdx/slotIdx；`rooms()`/`env.rooms`保持普通楼层含义，另由装饰解析函数查两类空间。`frame`集中x/baseY/backZ及地板范围，`world.spaceFrame()`供模型、地板/墙面/桌面求交和相机共用，真实基座只按实际楼层数计算，不随未来四层预览漂移。

阁楼绘制真实墙地、实际pattern/颜色与custom墙纸像素、完整后墙及侧面/外观前壳，家具使用真实UID、parent、z/depth、颜色与翻转；父子拖动预览一起显示。屋顶外侧后方壁龛单绘细镜筒、镜片、调焦件、支架和三脚架；它不入库存、不造UID或装饰统计。固定望远镜单独`kind:'attic',fixed:true`命中，布置空地为真实room surface，布置名牌也不使用可换位的room-label。点放/拖动物品命中固定设施时明确返回不可提交点，原物不移动、不收起。

`beginPlacement(defId,atticId)`仍只校验实际房间/家具/库存，切`floor:'attic',view:'cutaway'`、关预览、正面近看，不消耗库存；点击、HTMLdrop、拖动仍沿原decorating API和持久拒写边界。取消/旧pointerId/迟到transfer保护保留。普通↔阁楼使用同一UID/parent移动流程，不靠activeRoom补ray。`camera.focusRoom(atticId)`解析独立阁楼并转近看；墙面、地板、台面、吊顶均复用既有roomSpace规则。

摄影room显式支持阁楼ID并映射attic view；阁楼build移出旧`!roomOnly`门禁，house/view也显示实际阁楼。捕获保持原finally隔离并去掉未来扩建预览。Canvas降级复用真实320×220 roomShell与items，再单绘固定望远镜，不再用含示意凳/笔记本的整幅观星插画冒充库存布置。待建文案动态读取`observatoryConfig.unlockLv`，修正旧Lv18残留。

本轮产品与新检查仅`node --check`通过；未执行规则、浏览器、服务、快照、生产或私人存档操作。最短由总集串行运行：`node tests/attic-scene.cjs`、`node tests/attic-furnishing.cjs`、`node tests/attic-furnishing-references.cjs`、`node tests/observatory.cjs`、`node tests/photography.cjs`、`node tests/room-depth.cjs`；导出/公开用save-restore/public-house，主场景必要回归world3d-placement/input/contract/camera-input/house-camera与garden-page3d-scene。数据/规则前136组已由总集复核的结果不作为本渲染窗口通过结果；实际近看细节/鼠标触屏/3D与降级截图仍由总集验收。

本轮没有TODO变更。MC-079完整完成状态仍须合入B/C独占UI并验证真实入口和操作后，由总集维护。

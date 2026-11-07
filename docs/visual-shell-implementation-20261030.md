# MC-077 公共外壳与菜单源码交付

日期：2026-10-30。范围：主入口DOM、共享UI、公共材质与外壳。状态：**源码交付，等待总集接线、串行测试及实际根页视觉验收**。未操作4173、浏览器、release、私人账号或存档；未部署、未打包；未改总集TODO/README/设计/交接。

## 构图与真实内容

依据 `prototype/index.html`、`prototype/style.css`、`prototype/app.js` 的 game-hud / location / quick-nav / side-panel / game-dock：

- 桌面：悬浮HUD、左上地点与真实天气、左侧五个快捷入口、右侧纸面板与底部八项底座导航。移除全宽顶部/底部实体栏和旧底部大抽屉布局。
- 保留糖霜粉与莓红；主行动为深莓红白字，纸面为暖奶油。未整站换绿，未给3D场景添加饱和滤镜或2D伪立体罩层。
- 无功能面板时显示家园主页。右纸面展示最多三条真实未领取且未锁心愿、真实入住居民头像与数量，入口仍进入原成长册/居民。没有虚构成熟、奖励、来访或邻居。
- 手机≤600px：保留500px主场景区域，其中Canvas为330px高、宽度为屏宽减25px；功能纸面板位于场景之后正常流滚动。固定底座下方保留安全区与内容尾部空间。切换功能回到页面顶部，原#panel-body内滚动在桌面保持。
- 共享商店保留真实目录/搜索/主题/分类/24件翻页/库存/价格/特惠/节日/礼盒；改为侧栏三列货架。游乐场保留四款真实目录/记录/解锁/难度/开始入口，用图形与纸面条目组织。设置保留全部原表单、声音、昼夜、存档与保护流程，以小节组织；日历仍使用原真实来信modal，公共材质统一。

## 菜单映射与功能覆盖

| 导航 | 真实入口 | 其余覆盖 |
| --- | --- | --- |
| 我的小屋 | `visualShell.action('home')` | 关闭面板、清运行态摆放/选择、恢复explore、整屋镜头、滚回顶；不写存档 |
| 建造装饰 | `ui.open('decor')` | 原分类保留家具、房间build、外观houseDesign/exterior、前院yard、布局roomLayout与模板、天文台 |
| 去串门 | `ui.neighbors.open()` → `ui.open('neighbors')` | 原邻居/公开/接待业务；先回到真实邻居列表，未修改协议或自动加入策略 |
| 居民 | `ui.open('residents')` | 原聊天/送礼/入住/心愿 |
| 游乐场 | `ui.open('play')` | 原bakery/match3/catch_stars/memory及其真实modal |
| 花园 | `ui.open('garden')` | 原地块/种子/收获/加工 |
| 杂货铺 | `ui.open('shop')` | 原杂货/今日特惠/节日限定/惊喜礼盒 |
| 回忆 | `ui.open('memories')` | 原回忆录下载、相册、图鉴、画板、加工、礼盒、七日礼、天文台 |

五个快捷入口为居民→residents、衣橱→avatar、成长→quests、摄影→`ui.photography.open()`、活动→`ui.calendar.open()`。摄影和活动为现有modal API，不使用不存在的panel键。设置按钮、设置内账号、主界面动态账号条、主页“设置与存档”和七日心意均可达；手机声音由设置音量操作。原房间菜单中的合奏/画板/换装/工坊也保留。

建造“已开放层数”改取真实capacity；第4层预览格改写为“未解锁房间格 · Lv.25”，未新增原型样本房间或改等级。

## 相机视口约定（MC-076必须消费）

统一入口：`Game.ui.sceneViewport()`。普通script已在ui.js前挂出此函数，DOM或初始化未就绪时安全返回完整scene矩形。

返回：

```js
{ x, y, width, height, layout: 'side' | 'bottom' | 'none', panel: { x, y, width, height } | null }
```

- 所有数值均为 **相对#scene左上角的CSS像素**，不乘DPR。
- 桌面根据可见右纸面实际DOM矩形留出右侧空间；顶部HUD/底座与左侧工具留出camera边距。家园主页纸面也计入可见侧栏。
- 手机纸面在scene之外，`layout:'none'`、`panel:null`；sceneViewport返回完整330px高Canvas，不再扣整幅高度。
- 当前正式外壳实际布局只有side/none；bottom保留在契约类型中供未来真正底部遮挡使用，不伪造底部遮挡。
- 面板实际开合、resize以及world/panel/home-paper/hud的ResizeObserver合并到一次requestAnimationFrame测量；无interval/持续轮询。

保持 `panel:change` 事件名与 `open/height`：

```js
{
  open,              // 真实功能panel是否打开；主页纸面不算功能panel
  height,            // 真面板实际DOM高度，关闭为0；绝不能在side/none时全宽扣除
  layout,            // 与sceneViewport.layout一致
  bounds,            // 功能panel的浏览器视口CSS矩形，关闭为null
  panel,             // 与viewport.panel同义，相对scene；可能是主页纸面
  viewport           // sceneViewport()结果
}
```

**不要再用 `Number(event.height) || 280` 对side/none减全画布高度**。MC-076应以viewport为权威；open仍为真实值，独立页清理/提醒依赖此语义。`bounds`与`viewport.panel`的坐标系不同，已明确区分。

另有 `Game.ui.getLayoutState()` / `Game.ui.visualShell.getLayoutState()` 返回额外诊断状态；`shell:layout`事件与 `Game.runtime.shellLayout`提供同一轮测量，不作为第二套视口来源。旧 `--open-panel-height`置0且移除panel-covers-scene；镜头按钮按左右布局定位。

## 保留的接口与行为

- 原`#scene/#world/#app/#hud/#panel/#panel-title/#panel-subtitle/#panel-body/#panel-close/#dock`、钱包/经验/天气/提示/选择/缩放/设置/任务/引导/模态/吐司等ID保持。
- `Game.render`及camera、captureScene、drawThumbnail/drawCharacter等未在本会话改动。
- `ui.open`原全部renderers键、各模块open、`ui.panel.close({keepPlacing:true})`、拖放后摆放、返回焦点、modal Tab循环/Escape/下拉优先、Ctrl/Cmd+Z保留。
- 账号/邻居继续复用原DOM，切页/关闭原清理保留；没有移动私人状态到新存储或新增网络。
- 下拉/调色盘仍由原controls附加到body的独立浮层承载，不被侧栏滚动截断。
- 摄影/画板及烘焙/小游戏接管时，新快捷栏、地点、主页纸面和原HUD/导航/镜头等隐藏；独立编辑器/游戏尺寸仍由原样式管理。

## 实改文件与资源顺序

1. `index.html`：八导航、五快捷、地点与真实主页纸面的容器；新增普通script。
2. `js/ui/ui.js`：外壳sync、真实状态接入、手机切页滚动、面板布局事件改由公共外壳统一、共享设置/游乐场内容组织。
3. **新** `js/ui/visual-shell.js`：SVG图形、运行态导航、真实首页摘要、sceneViewport及布局测量。
4. `css/style.css`：基础键盘焦点改莓红并补textarea。
5. `css/shell.css`：完整重写公共几何、断点、右纸面/手机流、共享内容及接管避让。
6. `css/game-feel.css`：移除场景滤镜与全宽条材质，统一莓红/柔粉软陶按钮；原预设组件保留。
7. `css/cloud-account.css`：删除过期grid/HUD/面板高度补丁，保留账号表单/版本/备份组件，账号条位置由shell负责。
8. **新** `tests/visual-shell-viewport.cjs`：合成DOM的视口/坐标/事件、手机场景不扣高、返回主页临时态、modal入口和测量合帧回归检查。
9. 本报告。

当前新增资源只有 `js/ui/visual-shell.js`，顺序为既有 `js/ui/sea-map.js` → **visual-shell.js** → `js/ui/ui.js` → 后续live-room/visit/reception/host-room → main。CSS保持现有顺序，shell.css最后。未添加未知3D脚本；MC-076所需world3d资源及顺序由其报告给总集。发布指纹/prepare/activate仍由总集在入口释放后统一处理。

## 验证事实、命令与未验缺口

本会话已执行且通过：

```sh
node --check js/ui/visual-shell.js
node --check js/ui/ui.js
node --check tests/visual-shell-viewport.cjs
```

已做独立只读源码复核，修复其指出的手机切页外层滚动、摄影/画板镜头隐藏优先级、小游戏真实ID映射三项。

**未运行**新测试/旧规则与UI测试、设计检测器、浏览器截图或真实链；遵守仅node --check的串行调度边界。请总集按需串行执行：

```sh
node tests/visual-shell-viewport.cjs
node tests/save-ui.cjs
node tests/cloud-account-ui.cjs
node tests/neighbors-ui.cjs
node tests/minigame-ui.cjs
node tests/calendar-ui.cjs
node tests/room-layout-ui.cjs
```

居民/花园/衣橱等独立页面测试由MC-078列出，避免重复全量检查。

实际根页与原型须在原4173以1280×720、390×844同尺寸对照：核场景占比、HUD长名字/大数/账号与访客、八导航、各页真实内容与滚动、下拉浮层、键盘回焦点、摄影/小游戏接管和原存档继续。手机世界canvas尺寸已与原型量级对齐，但未取得实际截图不能称视觉完成。3D资源未在本会话接线，须整合后一起验默认真3D、命中坐标/摄影/camera。无新TODO增删或状态变更。

## 总集串行回归后的账号备注修正

总集报告 `visual-shell-viewport` 7组和 `save-ui` 6组通过，`cloud-account-ui` 第3组停在旧CSS双行截断断言；日志位于 `.impeccable/review/realignment-20261030/cloud-account-ui.log`。本会话未重跑这些规则/UI检查。

核查结论：两行line-clamp只对应旧版可见账号备注；新紧凑HUD已通过账号按钮的title/aria-label与完整账号面板提供状态，接待链接仍含完整公开称呼，原退出/过期清称呼及移除href行为未改，未发现该失败表明的隐私回归。但原 `display:none` 同时取消了备注已有的 `role=status/aria-live=polite` 状态播报，因此做一项实际可访问性修正：

- `css/cloud-account.css`：仅将 `.account-bar-note` 从display:none改为绝对定位1×1、clip-path视觉隐藏；长备注不占HUD宽度，保留读屏状态播报。不加回无效的line-clamp。
- 经总集明确授权，仅更新 `tests/cloud-account-ui.cjs` 第3组：保留两人截短摘要和接待链接完整名单断言，增加原role/live、账号同步状态title/aria-label、点击真实cloudAccount入口、视觉隐藏不占布局且不隐藏读屏、账号名省略约束。其他账号行为用例未变。
- 已执行 `node --check tests/cloud-account-ui.cjs` 通过；未跑规则测试、浏览器或release。请总集从 `node tests/cloud-account-ui.cjs` 继续串行复核。

本次未修改index.html、ui.js或其他公共布局；**入口与共享文件再次释放**。TODO未修改。

## 接管视口P2修正

总集独立复核指出：摄影/画板使用visibility:hidden隐藏主页纸面，该元素仍有getClientRects，旧视口仍错误保留右侧空间。本次仅改 `js/ui/visual-shell.js`、`tests/visual-shell-viewport.cjs` 与本报告，未改摄影/画板/小游戏独立源码或CSS。

- 可见性同时检查DOM矩形及computed display/visibility；visibility:hidden/collapse不会作为纸面遮挡。
- body的is-photographing/is-creating、真实可见minigame-modal/bakery-modal接管时，sceneViewport返回完整Canvas `{x:0,y:0,width:scene.width,height:scene.height,layout:'none',panel:null}`，同时释放隐藏HUD/底座的边距。退出后恢复实际主页/功能纸面的视口。
- 只观察body与外壳遮挡节点自身class/style/hidden、modal-root的直接增删，以及当前modal-card自身class/style/hidden；不观察游戏内容子树或app.style。布局签名变化才安排原有RAF合帧测量，publish也更新签名；无轮询和兼容style回写循环。
- `panel:change`真实open语义保持；隐藏遮挡的bounds/viewport.panel为null，height为0，不把隐藏纸面当侧栏。原panel:change与shell:layout通知在同一轮测量发出。
- 视口回归由7组扩至11组，新增visibility隐藏仍有300px矩形及恢复、摄影/画板从主页进入/退出、小游戏/烘焙modal直接增删及迟加类、同帧合并和棋子/app兼容style无额外测量。

已通过 `node --check js/ui/visual-shell.js` 与 `node --check tests/visual-shell-viewport.cjs`；独立只读源码复核未发现确定缺陷。**未执行11组行为测试或浏览器验证**，仍由总集串行运行 `node tests/visual-shell-viewport.cjs` 并核实际摄影/画板/小游戏进出。入口与共享文件再次释放，index.html未修改，TODO未修改。

## 衣橱来源页签对接修正

总集报告视口11组、账号16组复跑通过。MC-078新增clothes/face/presets衣橱页签后，共享来源回调也需要声明服饰意图。本次只修改 `js/ui/ui.js` 中两处既有avatar来源分支：

- `residentsPanel.navigate`：category赋值前设 `G.runtime.avatarUI.tab = 'clothes'`；继续以action服饰优先、definition服饰回退定位类别，保留原filter。
- `navigateToContent`：category/filter赋值前设同一clothes页签；已拥有服饰仍选owned，未拥有/无有效ID仍按原逻辑选shop。

没有修改普通 `ui.open('avatar')`、独立avatar源码或默认页签；普通打开仍保留用户所选形象/预设等页签，未写持久状态。

新增 `tests/visual-shell-navigation.cjs`，加载真实ui.js与真实服饰目录，经居民/成长册/图鉴页面panel获取实际共享导航回调，再在avatar.panel实际被调用时核对tab/category/filter。6组覆盖居民definition/action来源、通用owned/shop、无有效服饰ID、普通打开保持页签、非avatar导航隔离，并核对无store.update/无存档内容变化。

已通过 `node --check js/ui/ui.js` 与 `node --check tests/visual-shell-navigation.cjs`。未执行导航行为测试、浏览器或快照；请总集串行运行 `node tests/visual-shell-navigation.cjs`。index.html及其他共享文件未修改，入口与共享源码再次释放，TODO未修改。

## 恢复家园视角按钮接线

按总集转交的用户视角丢失/缩小反馈，仅修改 `js/ui/ui.js` 中既有 `#zoom-fit` 绑定：点击优先调用 `camera.resetView()`，无此函数时回退原 `camera.fit()`，保持camera作为调用receiver。按钮运行时aria-label/title改为“恢复家园视角”，DOM ID、原按钮及SVG focus图形不变；普通fit及其余调用不改。

复用 `tests/visual-shell-navigation.cjs` 的现有夹具新增第7组，通过真实ui.init绑定并点击按钮，核resetView优先、旧API回退、this与语义，以及无存档写入。已通过两份JS的node --check；未运行行为测试或规则测试，未改index/公共布局/渲染/独立功能源码，未操作浏览器或快照。总集可串行复跑 `node tests/visual-shell-navigation.cjs`。共享源码再次释放，TODO未修改。

## 平移默认与显式转动视角入口

按总集最新约定接线：`camera.getInteractionMode()`返回pan/orbit，`camera.setInteractionMode('pan'|'orbit')`改变运行态并发出 `camera:interaction {mode}`；A负责默认pan、相机边界与reset标准角度。本会话未修改A或C文件。

本次冻结清单：

- `index.html`：仅在原镜头工具内新增原生 `#camera-orbit` “转动视角”按钮，初始disabled/pressed=false；工具组名改“场景镜头”，初始拖动提示及恢复按钮语义同步。总集现有两个helper `world3d-avatar.js`、`prototype-yard3d.js` 与全部script/CSS指纹引用均保留，未改加载顺序。
- `js/ui/ui.js`：只读真实mode，不在UI另存模式；同时存在get/set且返回值有效时才启用。点击在pan/orbit之间切换，`camera:interaction`事件按真实getter同步pressed/说明/hint；缺API时禁用并解释。恢复按钮先切pan，再调用resetView（旧API仍fit回退）。提示明确鼠标/单指拖动，原摆放提示保持优先，未完成教程继续保留原指导。
- `css/shell.css`：新按钮92×44，绝对定位在镜头列上方，不增加手机列高；pressed用莓红。手机提示改为离场景底部5px向上展开，避免较长教程/模式提示被裁切。未重排其他布局或独立设置visibility。
- `tests/visual-shell-navigation.cjs`：复用原夹具增至9组，新增真实init/点击/事件的mode切换、外部事件、恢复pan、摆放提示优先，以及缺失/半缺/非法mode API禁用边界。未堆新夹具。
- 本报告。

已通过 `node --check js/ui/ui.js` 和 `node --check tests/visual-shell-navigation.cjs`；独立只读复核未发现确定缺陷。未自行执行行为测试、浏览器、快照或发布。交付时A的mode API尚待其落地，按钮在旧接口下会正确禁用；由总集整合后串行运行 `node tests/visual-shell-navigation.cjs` 并核手机实际可点与平移/转动/恢复链。入口与共享源码再次释放，TODO未修改。

## 主画面完整楼层与视角导航恢复

用户澄清所需“7–8维度”是原型中的整屋/楼层/阁楼/剖面/外观等。本次恢复这些真实入口，未新增场景样本或阁楼业务规则。

- `index.html`：在主页纸面顶部增加 `#house-view-controls` 容器；现有转动按钮、总集两个helper和全部现有资源指纹引用保留。
- `js/ui/ui.js`：将同一 `worldHouseNav = houseNavigation('house-nav-world')` 挂入该容器，回到prototype首页housePanel的原位构图。保留原setHouseView回调：整屋、1F/2F/3F（及真实已开放4F）、独立阁楼、全屋剖面、小屋外观、第4层Lv.25扩建预览。未开放的未来层明确“未开放”并禁用；开启预览后未来层标“预览”，不改真实等级/层数/房格。扩建按钮明确包含“扩建预览”。
- `syncWorldHouseNav()`：替换节点时按floorFocus/houseView/expansion恢复焦点，保留楼层行scrollLeft，避免真实house:view事件和自动刷新打断键盘操作。
- `css/shell.css`：删除原summary/view/expansion隐藏与手机整组隐藏。主页导航改正常流，不再浮盖场景或镜头工具。楼层行横向滚动，按钮至少44×44；剖面/外观保留双按钮，预览允许换行。桌面沿主页纸面的实际纵向滚动，手机随纸面页面正常流滚动；不固定导航高度、不省略功能。功能panel打开时主页纸面沿原行为隐藏，建造/装饰内原完整同类导航保持。
- `tests/visual-shell-navigation.cjs`：复用现夹具增至12组；新增真实ui.init挂载及全部楼层回调、剖面/外观/4F预览不建房、键盘焦点/横滚保持，以及未开放层禁用和预览边界。

冻结文件为 `index.html`、`js/ui/ui.js`、`css/shell.css`、`tests/visual-shell-navigation.cjs` 与本报告。已通过 `node --check js/ui/ui.js`、`node --check tests/visual-shell-navigation.cjs`；未运行12组行为测试、浏览器、快照或发布。请总集串行运行 `node tests/visual-shell-navigation.cjs`，并在桌面/窄屏核纸面导航可点/可滚、房屋和镜头工具未被覆盖以及A提供的真实各视角。源码先冻结交付，不等待其他功能页；入口与共享源码再次释放，TODO未修改。

## 回忆菜单全入口外壳加宽

按总集最新真实memoriesPanel矩阵，本轮只改 `css/shell.css` 外壳宽度与本报告，不改index/ui.js/visual-shell、导航/相机模式、系统或C的组件CSS。新增13行左右的宽度档位规则；桌面目标760/960px，受viewport减56px封顶；手机目标panel宽为可用宽减16px、modal为其既有遮罩内100%可用宽。普通建造/衣橱、简单确认保持原档。

| 真实回忆入口/后续窗口 | 现有panel kind或modal class | 桌面外壳 | 手机处理 |
| --- | --- | --- | --- |
| 本页回忆列表与菜单 | `#panel[data-kind=memories]` | 新760px档 | 左右各8px |
| Markdown回忆录下载 | `G.save.exportMemory()` | 无新窗口，未改下载 | 原下载行为 |
| 小屋相册、回收夹列表 | `.modal-card.av-album-dialog` | 新960px档，替代原414px窄册 | 既有遮罩内全宽 |
| 正常/回收照片详情 | `.modal-card.av-detail-dialog` | 新960px档，替代原540px | 同上 |
| 拍照、照片装饰编辑 | `.photo-studio-card.photo-editor-v2-card` | 保留现有1080px大编辑器，不反向缩小 | 本轮显式100%可用宽 |
| 收藏图鉴、筛选/分页 | `#panel[data-kind=collection]` | 新960px档 | 左右各8px；内部筛选由C管理 |
| 图鉴详情/未收集线索 | `.modal-card.collection-detail-modal` | 新960px档，替代原510px | 既有遮罩内全宽 |
| 创意画册、空态/恢复入口 | `.modal-card.creative-gallery-card` | 新960px档，替代原450px | 同上 |
| 画作与布置详情 | `.modal-card.creative-detail-card` | 新960px档，替代原520px | 同上 |
| 真正画板编辑器 | `.creative-editor-card` | 保留现有1040px大编辑器 | 本轮显式100%可用宽 |
| 花园收获加工册 | `#panel[data-kind=crafting]` | 新760px外壳 | 左右各8px |
| 惊喜礼盒入口、拆盒/最近回执 | `.modal-card.gift-modal-card` | 新760px档，替代原560px | 既有遮罩内全宽 |
| 七日登录心意册（菜单入口） | `#panel[data-kind=login]` | 新760px档 | 左右各8px |
| 七日心意自动提示/独立打开 | `.modal-card.login-modal-card` | 新760px档，替代原520px | 既有遮罩内全宽 |
| 阁楼天文台 | `#panel[data-kind=observatory]` | 新760px档 | 左右各8px |
| 相片改名/删除确认 | `.av-form-dialog` | 原440px短窗，未拉宽 | 原响应式短表单 |
| 画作改名/删除确认 | `.creative-name-card` | 原530px短窗，未拉宽 | 原响应式短表单 |
| 其他简单确认 | 普通`.modal-card` | 原560px档，未全局改宽 | 原规则 |

日历/生日不在此次真实菜单矩阵，最终CSS未增加其规则；合奏、成长册和商店亦未附带扩大。没有为不存在的creative/album/gifts renderer kind造选择器，而是匹配上述实际modal class。

已覆盖上述外壳宽档，**未宣称内部组件排布或整页视觉完成**。已确认C独占 `css/crafting.css:2` 仍有 `.crafting-panel { max-width:450px }`，因此加工册内部内容当前仍会限450px；需C按总集分工调整。七日卡片/图鉴筛选、相册格数及其他组件内部布局继续由C处理，本会话未覆盖其专属选择器。

sceneViewport仍读取既有真实DOM rect，--paper-width沿用原有变量，无新布局协议；panel宽度变化由原ResizeObserver测量通知。index与JS保持冻结未改。按要求执行 `node --check js/ui/ui.js` 通过（该JS本轮未修改；此命令不验证CSS视觉）。未运行规则/UI测试、浏览器、截图或快照；须总集整合后核1280×720/390×844实际宽度与横溢。冻结交付文件仅 `css/shell.css` 与本报告，TODO未修改。

## P1 装扮闭环第一小批：摆放与取消

按总集分两批交付，**本批产品源码已冻结，可先整合A的beginPlacement/cancelPlacement发布，不等待主题/商店改造**。

冻结源码：`js/ui/ui.js`、`css/shell.css`。index本轮未改，既有nav/mode/加宽规则保留。

- 房间菜单显式 `ui.open('decor',{roomId})`，选中和拖放均使用面板实际房间ID；已删除/旧房拒绝进入，不静默套用另一间房。
- 室内点选、HTML drag与加工成品调用 `render.beginPlacement(defId,roomId)`，仅ok后收面板，失败保留面板并提示；不自行写placing、不消耗库存。前院原路径保持。
- HTML drag在API同步house:view及下一帧前抑制内容重挂，保留真实来源DOM供浏览器捕获拖影；取消拖动dropEffect none调用cancel，换档旧drag柄拒绝执行。
- placing且无selected时，selection-tools仍显示“正在摆放xxx→真实房名/前院”、持续取消/换一件。手机工具栏避开左右操作列；取消调用render.cancelPlacement。
- 普通close即使面板已隐藏也取消预览；换件先cancel再打开同房。scene成功、cancelled、恢复视角及换档同步tools/hint。失败仍保留当前摆放工具供重试/取消；不虚构新的失败事件。
- state:replace递增archiveEpoch、取消预览/选择、清activeRoom并收起旧decor/shop。共享动态业务按钮与dragstart捕获epoch，旧同ID档案按钮不能作用于新档；纯弹窗关闭X/确认取消不受业务门禁限制。

测试 `tests/visual-shell-decor.cjs` 9组已冻结：真实ui.js/目录/规则+内存DOM，覆盖指定roomId、begin成功/失败、无selected工具、触屏取消/换件、成功事件、已收面板close、同ID换档旧按钮、原生drag同步house:view、drag取消/成功及旧drag柄。只执行两份JS的node --check并通过，**未执行行为/规则测试或浏览器**。根可串行运行 `node tests/visual-shell-decor.cjs`；A另行负责真实南瓜/slot命中与渲染验证。

第二小批的房间UI简化、theme/缺货shop/返回上下文尚未修改产品。其测试草稿保存在 `tests/visual-shell-decor-flow.cjs.pending`，**不是本批可执行检查**，避免未实现断言被全量.cjs扫描误跑。后续同一夹具可复用。TODO未修改。

## P1 装扮闭环第二小批：房间、主题与购买返回

总集已确认第一小批UI9/nav12通过并取不可变c256资源。本次在此后单独完成第二补丁，**源码已冻结**：`js/ui/ui.js`、`css/shell.css`；index/visual-shell/A/C/MC080均未改，不涉及快照或发布。

- 指定房装扮顶部显示真实房名/楼层/第几间；更换房间为默认折叠details，选择后保持键盘焦点在可见summary。装扮正文不再重复完整houseNavigation；完整家园视角导航保持原冻结功能，建造/外观/前院/布局/观星仍在正文底部折叠入口可达。
- 背包、墙纸、地板保留。背包新增真实data.themes选项；decorTheme/decorCategory独立于商店，搜索、分类、库存数与24件分页保持。筛选行与当前房间做紧凑布局，家具网格先于附加工具入口。
- 空主题/搜索缺货和普通背包都提供“去杂货铺找…”；保存运行态快照 `{roomId,theme,category,search,tab,page,epoch}`。商店显示返回原房按钮，返回恢复原主题、分类、搜索和页码；商店另改筛选不会污染该快照，普通商店入口清旧返回上下文。
- 缺货搜索仅匹配真实可售节日商品时进入festival页，避免微笑南瓜灯被普通all页隐藏；排除rewardOnly/customArt/currency:none，不把加工成品伪造成可购买商品。仍调用原economy.buy，所有购买必须用户主动，无自动购买、送货或新保存规则。
- 返回同时验证原房间与epoch；旧购买/返回/摆放按钮以及旧主题/房间下拉、搜索输入在换档后失效。旧档中相同roomId也不会绕过门禁。居民主题心愿进入装扮也带入原心愿主题。

`tests/visual-shell-decor-flow.cjs.pending` 已恢复为正式 `tests/visual-shell-decor-flow.cjs`，11组：原8组覆盖房间头部/折叠与三页签、房间菜单显式ID、真主题与空主题去店返回、南瓜节日主动购买后返回原房摆放、同ID换档旧业务按钮、真实换房目标、商店筛选与装扮上下文隔离、换档旧下拉/输入失效；另3组覆盖手机深页成功后单次回场景与取消焦点、失败/取消/同件重开/同ID换档/切回桌面使旧RAF失效、原生拖放不滚动或抢焦点。复用第一批夹具，不重复造DOM环境；首批仍9组，仅扩展手机/滚动/焦点与RAF夹具。

已通过 `node --check js/ui/ui.js`、`node --check tests/visual-shell-decor.cjs`、`node --check tests/visual-shell-decor-flow.cjs`；独立只读源码复核未发现确定P1，所指出的居民心愿主题兼容点已补。**未执行行为/规则或浏览器检查**。请总集串行运行 `node tests/visual-shell-decor-flow.cjs` 与 `node tests/visual-shell-decor.cjs`，再在实际已建房/节日灯/触屏取消链核对。产品与测试源码冻结交付，TODO未修改。

## 第二批追加：397×799长页进入摆放的可见性

总集实际QA指出：装扮长页在scrollTop约600点击家具，面板收起后页面仍留在下方，scene与旧绝对定位工具栏都不可见。本次修正已并入第二批冻结源码（仍只有ui.js/shell.css，不改index/API/库存/UID）。

- 室内点选/加工成品begin成功且面板已收时，手机安排单次RAF滚至world的文档顶部，并把焦点放到持续取消按钮（preventScroll）。不只回焦原来源按钮。
- 回调同时验证当前仍为手机尺寸、archiveEpoch、本次placementSerial、同defId、面板确已隐藏且不在dragPreparing；取消事件/新开始递增serial。同ID新摆放也不会被上一轮迟到回调滚动或抢焦点；失败不排回调。
- HTML原生drag的keepPanel路径不安排自动滚动，保留拖影与落点；无逐帧scroll或轮询。
- 手机 `.placement-toolbar` 改为viewport fixed，底部位于dock上方96px+safe-area、左右让出原操作列；页面滚动不会带走取消/换件。摄影等接管仍继承既有隐藏规则。

实际手机视觉/操作仍由总集复核，本会话只做源码与node --check。此条覆盖前一批“工具栏随world底部定位”的旧说明。

最终冻结核对：`js/ui/ui.js`及两份装扮测试的`node --check`均通过；产品源码为`js/ui/ui.js`、`css/shell.css`，测试为`tests/visual-shell-decor.cjs`（9组）、`tests/visual-shell-decor-flow.cjs`（11组）。行为测试与397×799/1280×720实机验收仍待总集串行执行。index和TODO未修改。

# 正式游戏按原型还原：重新分工

日期：2026-10-30。总集任务MC-075。用户已明确授权总集接手调配、新开开发会话；此前第一批排除的视觉范围现解除。不要继续沿旧文档的排除边界停工，也不要修改其业务规则。


## 最新交付与当前开发前沿

2026-10-30用户单次侧栏微调：以当时活动r-9c6fd0bd…为底，仅覆盖css/shell.css并更新入口指纹，本地激活r-3aabd8468644cc3bf51e86f79e502f9d873122d968acbf38d51353a79cdb3561。家园侧栏桌面340px、中等屏320px，手机既有整行布局保留；实际根页新CSS、1280/800/390宽度与页面无横溢已核。截图`.impeccable/review/realignment-20261030/home-paper-wider-desktop.jpg`；未改玩法、未清存档，不恢复批次派发或自动跟进。

当前已按用户要求暂停，不再派发。最新本地1f5（144文件/143资源）已激活并从带版本号的新入口实载，MC079当前实现已交用户审核；已建阁楼浏览器像素未验，不能称整套完成。详细记录见docs/attic-acceptance-20261030.md。本段覆盖下方旧“当前fd64/正在接线”的历史状态。

用户2026-10-30最新要求：只收尾已派发的MC-079阁楼批次，完成交付后暂停自动跟进；不再新开会话、派下一批或继续其余原型差距。MC-075～078和设备等未完项保留，等待用户重新启动。

2026-10-30：原4173当前已激活 `r-fd64b1853da7cef3575668483d1d1994420e7f4aa633308cdcc62e9416962e69`（144文件/143资源）。MC-080独立花园本地交付完成；不是仅源码待接线。底部花园进入专属WebGL园区，家园右侧缩略花园保留。总集实际点第6块打开第6块播种窗口、12图卡键盘选种、加工返回花圃与回家均核，无领取/购买/播种或私档交易。桌面截图1280×720真实；390×844的DOM无横溢且帧可见，但截图为383×829，不称物理设备或精确像素验收。

前批装扮P1、房间/主题/空背包→真实商店→原房返回和七份回忆组件CSS已随99148/8a/fd64交付；摆放工具字号/对比随fd64修正。MC-075～078仍未完成，阁楼新功能、其他中央舞台、串门3D和既有14项整页/设备待办保持。用户做最终视觉审核。

MC-079数据批隔离新18+既有118共136组串行及独立只读accept；已核对基线后只选10份产品+2测试集成主项目源码。当前发布fd64不含这些新数据。当前独占窗口已顺序派发：A仅world3d.js/scene.js及新attic-scene测试；B仅ui.js/shell.css与observatory UI/CSS及新attic-decor-ui测试；C仅creative/photo-editor/photography UI和专属CSS必要增量及新attic-pages-ui测试。data/core/systems重新冻结，入口仍总集；C原garden范围已释放MC080、observatory范围已释放B。不要整目录复制隔离副本，避免覆盖装扮/园区修正。

主项目另有live-avatars/live-peers/live-room/visit/host-room五份未纳本次交付的源差异，不擅自接收或覆写；fd64沿用8a已批准的不可变版本。source index只接已冻结花园6覆盖项和helper，仍不等于整份工作区可直接发布。后续继续从当前不可变快照+明确冻结覆盖组装，勿全源prepare夹带未交资源。

## 视觉目标与真实产品

- 原型真值是本项目`prototype/index.html`、`scene.js`、`characters.js`、`app.js`、`style.css`，入口为既有4173的`/prototype/`。主体是原生WebGL软陶微缩云岛，有房屋进深、草坪土层、立体家具/人物、柔光与可转相机。不是把旧Canvas画面再加几层渐变。
- 用户更喜欢当前版本的粉红/莓红配色，尤其红色。保留这一配色，取原型的空间、构图、菜单、图形与层级；不要整站换回原型绿色。
- 使用真实`Game.store`和系统动作，保留普通4层×3格、等级解锁、独立阁楼、房间ID/家具UID、摆放/人物/花园/前院/摄影/公开邻居及同屋接口。不能把原型示例房屋、资产、玩家、奖励或邻居当真实状态，不扩大持久化保证。
- 原型的组队/广场/合作关卡等未实现概念不进入本轮。保留所有当前可用功能，不因原型简化而删掉真实页面或业务入口。

## 文件独占与接口

| 任务 | 独占写入范围 | 必须保留 / 交接 |
| --- | --- | --- |
| MC-076 软陶3D主场景 | 新`js/render/world3d*.js`、`js/render/scene.js`必要接线及本任务独立tests/docs | `Game.render`原公开API、camera坐标/焦点、captureScene、drawThumbnail/drawCharacter、harvestOrigin、layout、既有scene事件。需要额外文件先报总集，不私自跨界。 |
| MC-077 公共外壳/菜单 | `index.html`、`js/ui/ui.js`、新`js/ui/visual-shell.js`、`css/style.css`、`css/shell.css`、`css/game-feel.css`、`css/cloud-account.css`以及独立tests/docs | 不改业务系统、账号协议或独立页实现。入口DOM由本会话单写，所需3D资源根据总集汇总加入，发布指纹由总集最终处理。不要改`#scene`既有ID；渲染接口与MC-076保持。 |
| MC-078 功能页 | 既有独立`js/ui/{residents,avatar,garden,crafting,collection-book,quests,photo-editor,photography,creative,observatory,login,gifts,deals,concert,birthday}.js`及各自CSS；第二阶段新增`js/render/page-stages3d.js`独占；本任务独立tests/docs | 不动MC-077共享UI/CSS和MC-076的world3d/scene。新舞台模块只做纯几何与描述，由MC-076消费接线。样式以各自根类作用域实现；当前菜单内商店/设置/小游戏/日历等共享部分须给MC-077明确需求，勿并发编辑同文件。 |

`prototype/`原型源码及所有`js/core`、`js/data`、`js/systems`、音频、网络、server均只读；本总集维护AGENTS/TODO/README/DESIGN/本交接、索引与验收记录。每个开发会话写自己同前缀docs报告。发现必须改系统才能还原时，先给总集具体证据与接口需求，不顺手修改规则。

视口约定已分别发送MC-076与MC-077：保留`panel:change`事件名及`open/height`，新增`layout`（side/bottom/none）、`panel`矩形与`viewport`；公共UI暴露`Game.ui.sceneViewport()`返回相对`#scene` CSS坐标的未遮挡区域`{x,y,width,height,layout,panel}`。3D相机消费此区域，不能将右侧面板高度从整幅场景底部扣掉；未就绪时回退完整scene矩形。由MC-077写UI测量，MC-076写相机与命中，两边不争写。

## 分阶段交付

1. MC-076先交正式家园的真实3D外观/剖面、岛屿厚度、实际已有房间家具与人物、可转相机和点击；MC-077同步交真实导航/HUD/右侧纸面板与手机排布。保留原Canvas作为明确降级路径可以，但成功的默认路径必须是真3D。
2. MC-078先交居民/花园加工/衣橱三页的实际视觉，再按矩阵完成其余独立页。每页在报告中列原型来源、真实入口、改动、保留规则与待验项。
3. 总集串行整合和实际浏览器核对，先让用户看完整的“主场景+菜单+一页功能”闭环，再继续下一页。没有实际整页证据的交付只能称源码待复核。

## 运行与验收约束

- 只复用现有`127.0.0.1:4173`、现有浏览器，不另起服务、端口或浏览器进程。开发会话不prepare/activate、不修改`.server-data`、不清站点数据、不碰真实账号/私人存档、不部署生产、不zip。
- `index.html`由MC-077单写，在其释放后总集统一刷新指纹、prepare/activate。其他会话列出所需资源顺序，不私自改入口。浏览器与快照由总集统一排队操作，避免不同会话争抢当前标签页。
- 普通Node规则检查必须串行。各会话可做`node --check`；需执行规则/UI/raster检查时在报告中给出准确命令，由总集统一串行跑；不重复已通过的全量检查。不要新增只镜像实现的浅测试。
- 验收必须在真实根页使用新版资源，桌面1280×720与390×844对应原型同尺寸截图，核菜单入口、层级比例、软陶体积、真实内容/长文本、滚动/焦点和关键原动作。静态图、委托桩或资源200不能代替这一检查。
- WebGL至多30fps、后台停绘、减少动态静态、分辨率封顶；处理context丢失/恢复和destroy，别每帧重建几何或新建context。无WebGL须可用地降级并给出明确状态。
- 摄影取景不得丢失；几何命中必须与视觉坐标一致。换档、建造/换房、摆放、楼层、屋外/剖面变化要驱动真实重绘，不能只做看得见但点不到的3D罩层。

## 当前事实

MC-074只完成旧正式实现的新资源启动，并未完成整套原型的移植。第二至十五批的源码/隔离验收保留，不推翻规则正确性，但其画面必须重新按本交接核对。2026-10-30本轮试加的居民专属CSS已完全撤回，原指纹`24ee15ae31`保持，未激活该试改。

开发会话ID及最新进度由总集在下表更新。

| 任务 | 会话 | 状态 |
| --- | --- | --- |
| MC-076 | 01a18ad1-ab4c-73e1-9e0f-2f5e227d17cd（local） | 阁楼两renderer已冻结交付/新scene9过，cursor50；停止写入，不再派发 |
| MC-077 | 01a18ad2-3b42-7323-b78c-34d12a259eb3（local） | 四UI/CSS已冻结交付/新14与原60过，cursor39；停止写入，不再派发 |
| MC-078 | 01a18ad2-ab9e-7a13-b3c6-03b6a94ffab3（local） | creative/photo-editor已冻结交付/新14与原59过，cursor32；停止写入，不再派发 |

本总集已有15分钟跟进已按新授权更新范围并恢复，状态未变静默，只在实际批次可看、失败或需用户决策时提示。禁止使用暂停前的旧第一批排除提示覆盖本次用户授权。

2026-10-30首轮整合前复核：公共外壳新视口7、设置存档6、邻居32、小游戏UI13、日历6、房间布局UI15，以及花园UI14、加工UI16、人物12、照片编辑器32、画板27、庆生27、合奏32均由总集串行完整通过，共239组；日志在`.impeccable/review/realignment-20261030/`。居民前17功能组、相册前22功能组已过，末项历史CSS断言待按新构图更新；图鉴/特惠等旧构图断言也已集中退回，不通过添加无效CSS骗过旧检查。独立只读复核另发现两处实际P2：隐藏仍有rect的摄影/画板接管视口；加工“我的花圃”误返回上次收获篮/种子铺。均已退原会话修复。此为源码与回归进展，尚未接线激活或开始正式整页视觉验收，所有MC-075～078保持未完成。

MC-076已完成首轮源码交付，新增`world3d-models.js → world3d.js → scene.js`加载顺序，默认复用离屏WebGL动态绘制到原Canvas，保留输入与取景API。总集`world3d-contract`13组通过；既有`room-layout-scene`前9组通过，末组要求初始Canvas已有“换位”文字失败，已退回原会话核对帧调度/真实降级行为而非删除语义。尚未继续跑其余scene相关检查，避免与该会话修正争读。MC-077/C两处P2和八份旧构图测试修正也在原会话处理中；三方重新释放后再整合，不能在此时切换快照。

2026-10-30下一轮接收：MC-077接管视口已通过新增11组，账号状态改视觉隐藏但保留读屏播报并通过16组；共享服饰来源切clothes的6组真实导航回调检查通过，普通打开不重置页签。MC-078居民20、成长33、观星28、心意32、礼盒38、图鉴17、相册23、特惠28及加工返回花圃导航4组均由总集串行通过；礼盒重看关闭后仍回到当前具名回看按钮，单次揭晓绘图保护保留。未修改产品以满足旧CSS断言。B/C停止写入，不再轮询其旧完成报告，等实际整页发现具体问题才下发。

MC-076首帧失败已确认是旧RAF夹具丢弃回调，已补真实推进而未改产品；待合并下一修正后复跑。独立只读源码审查另找到两处实际P2：GL只输出到可用视口却允许视口外的不可见几何命中/放置；两张同坐标墙画调层仅改变真实z，但3D网格/绘制/共面命中不响应。已退回MC-076修完整路径并补有效边界/调层回归。此会话仍写入中，暂不准备或激活快照；剩余scene相关检查在其释放后串行跑。正式根页目前仍是MC-074旧实现，尚未开始本次视觉对照，不发交付通知，MC-075～078全部保留未完成。

## 第一阶段本地预览已启动

2026-10-30用户明确要求“先把能看的3D家园和菜单启动，不等所有页面”。MC-076已冻结三份产品源码；总集加入两个world3d脚本、同步37处资源指纹，复用既有4173进程标准prepare/activate。当前阶段预览为`r-b935f94cc8b2b8af2e9d5018fce4921337005d764d19438ff68777c375d77823`，141文件/140资源；旧MC-074快照保留，可回退。本节覆盖上文“当前根页仍MC-074”的历史状态。

实际原游戏标签页已刷新：DOM报告`renderer=webgl`且无降级原因，新3D/菜单脚本来自本次release，无控制台错误；真实画面已目视确认3D房屋/岛屿厚度、现有进度、莓红菜单和纸面板。通过真实菜单打开建造装饰、切外观、返回主页，并在空白区拖动确认相机实时旋转；未领取/购买/建造或改写私人进度。桌面1280×720截图为`.impeccable/review/realignment-20261030/home-3d-menu-desktop.png`及`home-3d-exterior-desktop.png`；正常窗口截图为`home-3d-menu-current.png`和`home-3d-menu-rotated.png`。窄屏DOM无横向溢出，viewport临时覆盖已恢复；指定390×844的截图捕获比例异常，不冒充该尺寸视觉验收。

新`world3d-contract`16组与修正后的`room-layout-scene`10组由总集串行通过；`world3d-input`首组过、次组在合成挂画UID夹具失败，已退MC-076只读分类/必要窄修测试，产品源码继续冻结，不能记成7组通过。其余scene回归、完整摄影/拖放/同屋及各页中央场景还原仍待继续。独立参观页仍2D。MC-075/076/077已记录阶段预览但不勾完成，MC-078和原14项整页待办亦保留；用户可先在[原4173游戏](http://127.0.0.1:4173/)审核当前可看部分。

## 室内家具漏绘修复与下一里程碑

2026-10-30继续检查确认`world3d-input`最初失败确有产品原因：正常主场景/摄影显式传`omitUid:null`，普通家具亦有`parent:null`，原过滤因此错误跳过普通家具。已仅在world3d.js加非null隐藏意图守卫，独立只读复核accept，扩展`world3d-contract`17组由总集通过。增量本地快照为`r-c88715b4041a5150c152e6109c8223cdc0b88fa19b675a41d7f1eb2db819382b`（仍141文件/140资源），只更新该程序文件及入口指纹。真实根页无表单/编辑器正在进行时刷新一次，保留WebGL且无控制台错误，室内家具已目视出现；证据`.impeccable/review/realignment-20261030/home-furniture-null-fix.png`，未改存档或资产。

后续input正向失败是Lv11夹具的第二层楼板遮挡挂画：总集保留原正向拾取/真实提交断言，只先用真实`setHouseView({floor:1})`明确目标层，再跑7组全部通过。源码未为此放宽遮挡。另独立复核发现peer缓存键缺zone，跨隐藏房间→前院可能不建actor，留在MC-076下一修改窗口修复，不能称同屋全面完成。

下一小批聚焦两个尚未落地的原型中央舞台：衣橱当前真实人物、居民当前所选真实动物。MC-078独占新`js/render/page-stages3d.js`，只导出`Game.pageStages3D.describe(env)`：env至少含`state/surface/residentId`，仅对avatar/residents返回`{id,key,bounds:{min,max},focus:[x,y,z],build(geometry,models)}`，其他返回null；bounds/focus为3D坐标，build写入现有Geometry并使用world3dModels.character，不创建GL/Canvas/监听/RAF或改store。人物读取真实state.avatar，动物读取真实data与residentId，不能伪造入住/服饰；纸面/木台/软陶陈设参照原型，配色保留莓红。

MC-076接入该纯描述并消费现有`Game.runtime.shellLayout.panelKind`和`residentBookV2.friend`，缺模块时保持现家园。stage进入时清旧房屋hits，预览不触发建造/摆放/领奖；正在摆放/拖动及摄影捕获强制真实家园路径，离开恢复家园相机/语义，不改MC-077或MC-078文件。普通头像/缩略图接口保持。先交这两页可见3D中央人物，不扩全部道具/无规则玩法；source接线同时窄修peer zone缓存。当前c887阶段预览保持服务，开发会话不发布或操作用户浏览器，总集验证后才更新一次。加载顺序拟为models→world3d→page-stages3d→scene，由总集最终接入。

## 用户实报问题优先于舞台扩展

用户继续反馈：相机不能从下向上仰视，缩放/平移后可能丢失主体；换装朝左/朝右只见蝴蝶结换边；未建格只有楼板细杆、看似房屋缺墙/屋顶悬空。确认旧elevation限制为.23～.85，衣橱仍调用正面2D镜像。优先修以上三项，再做未交的中央舞台。

- MC-076继续独占world3d/scene，支持适度负俯仰与高处俯视、有限稳定投影；增加明确`camera.resetView()`恢复默认角度与整屋取景，普通fit/resize不重置用户旋转。完整外观连续外墙，剖面保留背/侧墙、仅打开前墙，未建格清楚表达待建，不改任何真实房间/等级。另提供`render.drawAvatar3D(canvas,look,{yaw/facing,still})`或等价新API，共享/缓存离屏GL资源，头身手脚服饰整体三维转向，旧drawAvatar保留兼容。
- MC-077只窄改共享ui.js的zoom-fit：优先resetView、无新API退fit，明确“恢复家园视角”语义，保留ID/键盘，其他公共布局不动。
- MC-078在其avatar UI接新3D主预览，方向仅运行态；没有WebGL时平面镜像需明确说明，不能冒称整体转向。该会话还收到人类直接追加：修house-design窄面板变形、房屋模板预览匹配真实新房屋，以及统一暖黄色肤色。此直接授权优先于旧白名单/排队stage：其独占house-design/exterior独立UI/CSS和相应exterior绘制预览、outfits肤色元数据；不得争写A的world3d/scene、B的ui.js/index。总集统一收文件清单后发布，不让产品源码未冻结时切快照。

当前服务仍为c887家具修复预览；上述源码开发不立即干扰用户正在看的页面。MC-075～078仍未完成。原heartbeat的家具修复通知尚未发出时收到本轮人类问题，优先合并处理人类反馈，不另行用测试数字打扰。


用户明确“右边的花园可以保留”：固定保留正式右侧garden岛、桥、真实9格与现有种植链；前院其余环境直接提取原型home代码，不把示例作物/角色/邻居带入正式档。专属代理只新增并冻结`js/render/prototype-yard3d.js`，公开`prototypeYard3D.build(g,{origin,scale,palette}) → {bounds,anchors}`，复用3树/2围栏/长椅/邮箱/2花盆/11+5花团/7弯曲踏石/茶桌杯与2凳；待MC-076消费，不冒称已在网址显示。当前c887预览保持。

MC-076新仰视/复位/墙体/整身头像包已冻结，末cursor `a785a403-0d2e-4444-82c9-7d5f95730e84:19`；根契约18/头像7/input7/名牌10均过，house-camera前2过，第3组水平射线的命中业务坐标断言失败，已原会话只读分类，不能称该6组通过。MC-077窄改reset优先，导航7过，末cursor `0feccf76-8d7a-492b-a202-5ff52e5c37cf:14`已释放共享文件。MC-078用户实报七份产品资源与可后置page-stages3d已冻结，末cursor `f1b9bea1-7cc6-4e72-ba4c-bbb76e1905e5:12`；根新个性化7/预览5/旧个性化10、肤色6/方向6/人物12/换装12/预设5过；旧exterior前7过、预览家名fillText断言失败，已只读分类。A/C此时只读，不争写；具体失败及独立复核后再开放窄修窗口。以上均为源码/替身边界，实际画面仍待整合，MC-075～078全部未完成。


## 实报修正包与当前扩岛窗口（2026-10-30）

本地已激活r-feae3c3185fee9f66dd840e85f4bca102ed065ffdf4af1a85dca534367d8e28d，143文件/142资源；只含限定10份既有产品与world3d-avatar/prototype-yard3d两新增helper。根最终相机7/契约18/院景5/input7过，后缘AABB旁路独立resolved。C家名P2实修，最终预览7/exterior9过，旧DOM夹具保留业务断言。真实根页WebGL、新院景/墙体与衣橱完整头身衣服左右转向已目视；wardrobe-left-3d.png/right-3d.png为正常窗口全文截图。未换衣/购买/领奖或改私档。指定viewport截图裁切/比例异常不作1280/390整页证明，临时覆盖已reset。

用户最新要求默认拖动平移而非旋转，镜头不能把房子丢到云里；黄色长椅/树/花盆重叠、两侧树挤房，应稍扩岛。A当前独占scene/world3d做屏幕轴pan与边界/缩放；B独占ui.js/index/必要shell显式mode按钮。统一camera.getInteractionMode()/setInteractionMode('pan'|'orbit')发camera:interaction {mode}，默认pan、reset回pan，家具/名牌原拖动优先。A同时把草坪中心x=-.6/z=.9、半径7.25（面积+19%，右缘6.65接桥不变），房屋不放大。review_resource_wiring只改prototype-yard3d组合坐标/anchors/bounds，分开树冠/长椅靠背/花盆，A不争写模块。A末cursor28/B末cursor15开发中，C末cursor22已冻结；待产品冻结后根必要串行检查再更新一次。当前网址仍feae，扩岛/新平移尚未生效，MC075～078均未完成。


用户澄清7–8个维度指整屋/各楼层/阁楼/全屋剖面/小屋外观等，不是外观款式数；B当前恢复这些原有导航在主世界和窄屏的可见入口，不再由shell隐藏。A本窗口加入360 yaw、真实focus和既有邻居空云（sea-map visualPositions纯getter已冻结并根原测试通过），保持本批封口，不再扩大31款样式。用户将肤色进一步指定为自然黄白浅色，C已冻结四原ID色表#FFF1E7/#FDEDE1/#FAE8DA/#F7E4D4（末cursor24），A核中性光色偏；网址尚未更新该色表。

用户明确新增“保留观星，并新增可自由布置的阁楼”，MC079独立本地会话01a18b36-b4c0-7942-be02-7e0d5c44b32f已启动；首步仅读规则/存档并写独占docs/attic-furnishing-plan-20261030.md，回传必需改动清单后总集明确文件窗口再实施，不争A/B/C。初始cursor895427e7-1e6a-46ac-a19a-baa1129af0f4:1；不冒称自由布置已实现。TODO将非当前活跃的MC038设备/线上后续从Now移到Next，Now保持5项，新增MC079。原望远镜/阁楼完整细节与新增自由摆放留此后批，不阻塞当前可看相机/扩岛增量。


## 最新可看镜头增量与装扮P1（2026-10-30）

已从feae不可变公开资源拷贝并仅叠冻结7产品+index组装，激活r-494c118cb6e4de5b25ec23c555b562d9c5a7e46539bf827e7fd2b6b9dafb1f63（143文件/142资源）。来源临时目录及overlays见.impeccable/review/realignment-20261030/pan-island-stage-release.json；仓库C组件CSS尚在修改，source index暂不作为已发布全源证明。根A68组、B完整导航12、浅肤色6及sea-map原检查过，独立源码accept。真实根页默认pan/切orbit连拖可见背面/reset回pan、整屋1F2F与外观剖面/4F明确预览/邻云和右花园已看；未私档交易，截图home-pan-island-navigation.png/home-orbit-rear.png/home-exterior-rear.png等。正常窗口有小屏标签覆盖房体/顶栏标题挤压的具体余项，不作全移动视觉通过。C内部响应式未发布，B外壳760/960已随此包。

用户随后报装扮P1：已选已建房仍反复选择、主题难找、缺家具无购买入口；南瓜灯点击房报未建，+光标卡住。A/B已重新开放功能修复窗口，优先于视觉和阁楼新功能。根只读疑点是decorPanel仅placing+focusRoom，不同步houseView层/外观/阁楼/扩建预览，未把此疑点冒称已查明。A负责真实scene Pointer→roomAt/currentPick→规则的复现/正确命中，并提供render.beginPlacement(defId,roomId)->{ok,message,...}和cancelPlacement()，不耗库存/不强塞ID绕过几何，切真层cutaway并清预览/光标，发placement:cancelled；B负责room上下文简化、真主题/搜索分类、真实shop跳转/回原房和持续可见取消/更换家具。C只写回忆菜单全部组件CSS可读性；真实入口矩阵为回忆列表、相册全子窗、图鉴全子窗、画册/画板、加工、礼盒、七日、天文台（Markdown下载无窗口），不扩日历生日合奏。不能把先前68组过称装扮P1已通过。

MC079只读方案已交并接受，独立attic.room与16文件依赖见docs/attic-furnishing-plan-20261030.md；暂只开放独立测试草稿，不写既有产品。当前先交装扮P1/可读性再开阁楼数据规则窗口，用户无需再次授权。各MC075～079均未完成。


用户追加MC080：底部花园进入独立3D花园页面，首页保留右侧缩略岛。新本地会话01a18b53-609d-71a0-8e39-0c94869a6476已开，独占新js/render/garden-page3d.js与js/ui/garden.js/css/garden-visual.css、新tests/docs；C已通知不碰此两既有文件，只继续加工与回忆其余CSS。模块先CPU Geometry+相机/plot index/命中描述，不新GL、不改系统，不误用只读stage挡地块；A当前装扮P1结束再消费接线，B不争写。真实6/9容量、12作物/夜种/水分/成熟/收获/种子/加工原逻辑保留，无样本和假奖励。新任务已初始wait，cursor另见本轮记录。TODO新增MC080于Now；MC079阁楼产品仍等待数据窗口，移Next（独立测试草稿可继续），Now保持5；MC075～080均不勾完成。

## 独立花园实际交付与源码后续（2026-10-30）

MC080的garden-page3d纯模块/garden UI与CSS和A宿主接线均已冻结后整合。根新模块8、真实图卡UI16、加工导航4、scene9共37组及相关旧56组通过。scene第3初跑只因白天按钮文案动态改名，改稳定属性后保留禁种/夜种/扣种子断言；第4随后实际暴露窄屏第9格标签抢第8格土面，A仅园区缩窄标签并使真实实体优先/无实体时标签fallback，保留家园名牌优先。新scene9全过，独立P2 resolved；label后input7/contract18/room-layout10再过。不能把内存DOM/GL替身当真实设备或像素。

由8a不可变资源仅叠world3d.js/scene.js/garden-page3d.js/garden.js/garden-visual.css/shell.css，加helper在world3d后scene前，生成并激活fd64；未重启服务。8ced只是标签修复前prepare、从未激活。准确清单/哈希见`.impeccable/review/realignment-20261030/garden-page-release.json`。浏览器加载路径确认为fd64，scene dataset为webgl/garden-page，stage为空；无控制台错误。

实际桌面园区截图`garden-live-1280.jpg`（1280×720）；自然388×792窗口`garden-live-current.jpg`；实点3D第6格正确播种窗图卡`garden-seed-cards-live.jpg`。390×844 DOM与图帧已看，`garden-live-390-frame.jpg`实际383×829，保持尺寸/物理触屏证据限制；`garden-live-390.jpg`为resize尚未绘帧的全页捕获，不用它作园区可见证明。临时viewport已reset，原用户游戏页停在独立花园，原型页保留。浏览器连接曾失效，按文档重置REPL后恢复，同标签复用，无新进程/账号/存档操作。

阁楼隔离批：根新13+5和旧118共136组通过，offline首跑缺根创建隔离副本中的server依赖，补同版本公开server/releases.cjs/offline.cjs/sw.js及仅隔离index指纹后6组过；不是规则产品失败或修改测试绕过。独立只读accept、10产品基线比对与选取集成见`attic-data-integrated.json`和`docs/attic-furnishing-data-20261030.md`。目前只源码集成，当前网址尚无自由布置阁楼；A/B/C新独占窗口已初始wait并记录上表cursor，产品未交付前不抢读测试或切快照。

### 06:49跟进：阁楼仍在接线，当前预览不变

A/C仍开发；B四产品已明确冻结、独立只读限定accept，根串行旧flow11/decor9/nav12/观星UI28共60组通过，新attic-decor-ui13等最终脚本冻结后才跑。C实际摄影空间控件位于photo-editor.js，本轮总集已明确扩入该文件的阁楼framing最小改动，不扩编辑器设计；A接到scene旧Lv18文案应沿data真Lv17修正。最新cursor见上表，下一轮带cursor等交付，不抢读A/C或并发跑测试。

服务端发布契约先行复核：根仅以fd64公开程序+10已冻结阁楼数据产品在隔离temp prepare候选，createSaveValidator合成4组通过（旧档迁移、严格坏room、contractHash/旧读者边界、公开视觉白名单），未激活或监听。独立源码确认无需server改动；最终必须同release接全部10文件与对应指纹。旧私有客户端因contract改变写操作426，旧公开GET读者仍需刷新，不称双向兼容。证据`.impeccable/review/realignment-20261030/attic-server-contract.json`。这不是阁楼UI/3D已交付，原4173继续fd64花园版本；本轮不刷新浏览器或操作私档。

2026-10-30 16:33 用户直接授权本会话整合蛋仔人物/天空/作物/房屋阁楼/邻居造型：从当前不可变快照r-1f5d2da0…叠加五个冻结文件（atmosphere.js、world3d.js、world3d-models.js、garden-page3d.js、avatar.js），仅刷新入口对应指纹，prepare/activate为`r-f106ea699fe7fe005f9a6407246d6ad02e4cccd4e7c5199767462deed415455e`（144文件），未重启服务。live-avatars/live-peers夹带他会话未交付聊天气泡，未带入；可回退至r-1f5d2da0…。

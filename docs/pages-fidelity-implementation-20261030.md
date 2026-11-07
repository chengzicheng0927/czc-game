# MC-078 功能页原型还原

日期：2026-10-30。本报告记录独立页面源码交付。未启动服务、操作浏览器、prepare/activate、修改入口、运行规则测试或读写私人数据。总集须在原4173真实根页，按1280×720和390×844与原型同尺寸对照。

## 第一里程碑：源码已交，可集成复核

- 居民：取消宽双栏名册，按原型恢复页签、状态筛选、小头像带、选中朋友、真实心愿物品、三项陪伴与独立泡泡。手机保留候选头像；人数、待邀请与入住状态均来自真实状态。六类心愿、五阶好友、普通送礼/选房/聊天仍调用原接口，来信样式保留。新增心愿绘图逐Canvas捕获异常，单张图失败不阻断其余内容。
- 花园/加工：三列紧凑花圃、当前地块详情与补给纵向排列；五份短配方后为成品与真实数量/材料确认。保留9地块、12作物、5配方、计时、报价和拒写链，花园内增加真实加工入口。重复的地块快捷动作集中在选中详情，既有操作继续可达。
- 衣橱：恢复衣橱/形象/预设三页签、两列八套真实完整人体预设、当前形象及三格搭配盒。60服饰、筛选和原购买后穿戴/搭配API仍在；页签、搭配与购买后焦点保持。

第一里程碑已先交；后续页面源码也已补齐。全部15份分配JS通过`node --check`，这只代表语法检查完成。实际整页像素、玩法与设备验收未由本会话执行；没有完成或移动总集TODO条目。

## 页面矩阵

| 页面 | 原型真值 / 真实入口 | 本轮源码已实现 | 待总集浏览器验 | 未覆盖 / 对接 |
| --- | --- | --- | --- | --- |
| 居民 | `residentsPage` / `ui.residentBook.panel(api)` | 紧凑头像带→选中朋友→心愿图形/奖励→三项陪伴/独立泡泡；五阶纸页 | 0/1/12真实入住、六类心愿、五阶与重读、长文、滚动/浮层/焦点 | 原型场景侧居民名牌未接公共场景 |
| 花园 | `garden` / `ui.open('garden')` | 三列真实花圃、选中详情、补给/温室、加工入口 | 地块选择、种子数量/作物切换、浇水收获/计时、空满锁定 | 主场景花圃由MC-076负责 |
| 花果加工 | garden加工页 / `ui.crafting.open()` | 五配方短列表、真实成品/材料、竖向数量及二次确认 | 配方选择、数量/报价、拒写/重试、去向/焦点 | 原型点击配方弹窗保留为页内竖向详情适配，尚未统一为模态 |
| 衣橱/形象 | `wardrobe` / `ui.open('avatar')` | 三页签、两列八套完整人体、服装/形象控制、三格搭配 | 三签页、8预设/60服饰、买穿/保存应用、下拉/长名、手机头像 | 原型中央大人物未接公共场景；页内保留真实完整人物 |
| 图鉴 | `collection` / `ui.open('collection')` | 四类紧凑页签、当前类真实进度、搜索、状态保留的折叠筛选、三列Canvas、竖向详情 | 完整动态目录、IME/组合筛选/24分页、来源/九主题领奖、浮层焦点 | 原型中央独立收藏册摆件未接公共场景 |
| 成长册 | `quests` / `ui.open('quests')` | 七色软陶片、章节下拉、当前任务纸页、独立每日宝箱、徽章纵列、折叠五本书架 | 全文展开、主线/每日/成就、完整来源与行动、领奖/故事/派对、焦点 | 原型场景侧书架移为页末可展开内容，未接场景侧舞台 |
| 相册 | `album` / `ui.photography.open({mode:'album'})` | 414px纸页、两列真实照片、容量/页签；竖向照片详情与完整配文、厚度相机/回收册 | 空满/回收/恢复/下载、横竖图、编辑器往返、长名/IME/焦点 | 原型场景旁留念摆件未接公共场景；保留原modal入口 |
| 照片编辑器 | 原型photo editor / `ui.photoEditor.open(options)` | 1080px照片主栏与300px工具盒；预览置照片下方，相框/贴纸/图层、微调与手机滚动 | 取景/装饰/纯净预览、缓存底图、已有照/保存/下载、键盘触屏/IME | 原型独立中央取景框未接公共场景，不制造假镜头 |
| 画板 | `creative` / `ui.creative.open()` | 木框大画布、295px工具纸页、六列真24色、撤销/重做步数、固定保存区；450px两列真画册/竖向详情 | 16×16绘画、补线/历史/填充、草稿重开、IME、拒写、挂画/墙纸/下载 | 原型画册背后的独立画架未接公共场景；画册保留原modal入口 |
| 观星 | `observatory` / `ui.observatory.open()` | 日期→今夜状态/行动→累计→最近星群的纵向纸页；规则与真实穹顶插图可展开 | 全部资格/日期/拒写、真实最近记录/长数值、滚动/焦点 | 原型中央穹顶插图未接公共场景，当前放在本页展开项 |
| 七日心意 | `loginGiftPage` / `ui.login.panel/open/content` | 七小格、真实礼物与缩略图、状态/主行动分开、折叠规则；去除emoji替代图标 | 两入口、七份/轮次/真实凭据、旧null/回拨/满库存/拒写、自动提示/焦点 | 原型中央独立礼物纸册未接公共场景 |
| 礼盒 | `giftLobby` / `ui.gifts.panel/open/content` | 紧凑纸页、收藏进度、预算/主行动、带真缩略图的最近凭据；粉盒侧面/顶面与金丝带 | 三入口、免费/付费/回拨、单次receipt、650/1250ms拆盒/跳过/焦点、清理 | 原型中央大礼盒未接公共场景；页内与揭晓已有立体盒 |
| 今日特惠 | `dealContent` / `ui.deals.content()` | 两列六件真实缩略货架、紧凑名称/价格/原因、莓红厚按钮 | 完整六件/八折、长名/大数、连买/午夜旧价、拒写/焦点 | 原型中央木货架未接公共场景；JS交易逻辑未改 |
| 庆生 | 原型birthday / 原只读庆生入口 | 主角/皇冠蛋糕/头像姓名比例、真实人数标记、紧凑完整祝词、固定三动作 | 0/1/4/12人、长祝词、日期凭据门禁、滚动/声音/减少动态/触屏 | 本轮源码已实现，实际整页与设备未验 |
| 合奏 | 原型concert / `ui.concert.open(roomId)` | 舞台→三步进度→全文、真实音符纸签、粉帷幕/木地台、按真实1/2/3人数居中 | 4/12姓名、三段/首次记录/重演/拒写取消、声音/后台/清理 | 本轮源码已实现，实际整页与设备未验 |

全部“已实现”均指本轮DOM/CSS源码交付；不表示中央舞台对接或同尺寸整页验收已完成。

## 实际修改文件

- `js/ui/{residents,avatar,garden,crafting,collection-book,quests,photography,photo-editor,creative,observatory,login,gifts,concert,birthday}.js`。`deals.js`保持既有交易实现，本轮只还原其专属CSS。
- `css/{resident-life,character-visual,garden-visual,crafting,collection-book,quests,photography,creative,observatory,login,gifts,deals,concert,birthday}.css`。
- 本报告。没有新增资源文件或加载顺序要求。后续窄授权的测试更新与导航修复见文末。

所有页面保持粉红/莓红主操作。自然作物/木头/夜空保留各自颜色。移除了独立页原先设置公共`#panel`高度/位置的覆盖；居民来信原选择器保留。实际面板几何由MC-077统一决定。

## 保留合约与复核范围

读写继续委托原系统，没有改core/data/systems/render/audio/server/网络：居民心愿/五阶仍按原普通update语义；普通送礼、画板、观星、心意册、礼盒、特惠与合奏原有显式提交边界保持。未统一提高或降低持久化保证。

照片编辑器保留先close再同步onAlbum/onSaved、底图/相框缓存、保存/下载与关闭弃稿；画板保留persist:true、按ID的未保存草稿和引用语义。庆生纯只读且仍用日期/已收礼凭据门禁；礼盒只消费已存receipt、重看/跳过/动画不重复open。原busy、换档/旧节点失效、焦点、IME、RAF/监听/Canvas清理均保留。

只读交叉复核已检查居民、心意册、观星、礼盒的新增DOM/API与生命周期，以及首选预设关闭应用、花园选种/数量、加工报价、画板IME/草稿和照片同步回调。修复了居民单图绘制异常边界；居民、图鉴与成长册的服饰来源已主动设置`avatarUI.tab='clothes'`，避免新页签把目标服饰藏在预设页后。未以此替代规则测试或浏览器证明。

## 共享外壳的明确对接

MC-077需让独立模块放在与原型相称的右纸面板，而非再次展开成整屏宽表单。居民/衣橱原型约370px；其他普通页约330–370px，手机保持可滚单列，公共断点与可视高度由MC-077统一处理。相册/画册/编辑器/舞台仍遵循原modal协议，不能复制出第二套业务入口。

商店普通家具、设置、小游戏、日历均在共享`ui.js`，本会话未修改。请MC-077按prototype对应分支完成这些分支的内部构图，并保留全部真实导航；特惠继续调用`ui.deals.content()`，礼盒继续调用既有`ui.gifts`三入口，不复制示例池或虚构结果。

衣橱新增页签还需要共享导航同步两处：`residentsPanel`中的`navigate`回调、以及`navigateToContent`的`panel==='avatar'`分支，在现有category/filter赋值之前加`G.runtime.avatarUI.tab='clothes'`。本轮独立页已在调用前补这个状态，因此当前三页来源可用；MC-077补共享分支后可覆盖其他现有/后续调用方。原型默认预设页仍保留，不能靠全局改默认页签解决来源跳转。

原型中央人物、居民名牌、收藏册/书架、画架、穹顶、礼物纸册/大礼盒、木货架等舞台仍需MC-076/077协调挂载与页面切换清理。本模块内可继续复用`drawAvatar/drawCharacter/drawThumbnail`、`draw.creative`、`draw.observatory`等真实绘图；本轮没有创建新的共享scene overlay API。该部分不能通过把面板拉成大双栏来冒充完成。

## 总集串行定向检查

下列命令尚未由本会话执行，先检查功能链，再结合下一节更新旧构图断言；不要把未运行写成通过。

```text
node tests/residents-visual-ui.cjs
node tests/resident-wishes.cjs
node tests/residents-content.cjs
node tests/resident-life.cjs
node tests/resident-notices-ui.cjs
node tests/garden-visual-ui.cjs
node tests/crafting-ui.cjs
node tests/pages-fidelity-navigation.cjs
node tests/avatar.cjs
node tests/avatar-presets.cjs
node tests/character-visual.cjs
node tests/collection-book-visual-ui.cjs
node tests/collection-book.cjs
node tests/quests-visual-ui.cjs
node tests/quests.cjs
node tests/album-visual-ui.cjs
node tests/photo-editor-visual-ui.cjs
node tests/photography.cjs
node tests/album-storage.cjs
node tests/creative-visual-ui.cjs
node tests/creative.cjs
node tests/observatory-visual-ui.cjs
node tests/observatory.cjs
node tests/login-visual-ui.cjs
node tests/login.cjs
node tests/gifts-visual-ui.cjs
node tests/gifts.cjs
node tests/deals-visual-ui.cjs
node tests/deals.cjs
node tests/birthday-visual-ui.cjs
node tests/birthday.cjs
node tests/concert-visual-ui.cjs
node tests/concert.cjs
```

## 总集首轮回归与本轮授权修正

总集反馈的已执行结果（本会话没有重跑）：garden-visual-ui 14、crafting-ui 16、character-visual 12、photo-editor 32、creative 27、birthday 27、concert 32组通过；residents前17功能组通过，最后旧CSS分段/布局断言失败。其余日志位于`.impeccable/review/realignment-20261030/`。这些是总集提供的首轮证据，新的测试版本仍待串行运行。

总集随后明确授权只更新八份既有定向测试与本报告，并额外授权花园/加工的一项真实导航修复及独立回归。本轮没有修改CSS或其他产品模块。

| 测试 | 被替换的旧检查 | 新版有效合约 |
| --- | --- | --- |
| `residents-visual-ui.cjs` | 注释文本切分CSS、固定grid/媒体块/48px | 真实1位入住的候选/页签与详情ARIA；单张头像/花果或家具心愿图失败不阻断其余图形、全文、导航和真实领奖；换装来源先切clothes页签 |
| `quests-visual-ui.cjs` | 手机任务按钮必须grid单列 | 五章真实下拉、全文/复合条件可展开且阅读不写进度；baker_3真实服饰来源的clothes与owned/category后备；主线来源完整对象透传与指标后备导航 |
| `observatory-visual-ui.cjs` | intro首子FIGURE、手机先大图、固定48px等 | 状态/行动关联、具名望远镜、规则/预览原生披露可读取且不写档；望远镜图失败仍可真实观测并重读恢复 |
| `login-visual-ui.cjs` | root固定子序、手机四列/grid-row:2/48px | 完整长家具名、真实七份语义、规则/每轮总量/7日边界/累计可主动读取；重读保持展开与焦点、领取后真实累计更新 |
| `gifts-visual-ui.cjs` | 首子固定class、48px/CSS布局及合并页面绘图总数 | 长名/ARIA/真实控件/回看不重奖；大厅回执图与结果图按Canvas对象分别计数；揭晓前结果0、揭晓后恰1、重复迟到揭晓仍恰1；关闭后相对关闭前基线零新增绘图；大厅图失败不阻断回看与结果图 |
| `collection-book-visual-ui.cjs` | 每个tab必须显示done/total、固定三列/手机CSS实现 | 逐tab点击后对照当前真实summary、ARIA/焦点；407家具/12居民/12花果/60服饰及全部5加工成品完整性不放宽；折叠筛选重挂保留状态/焦点、重置恢复；已拥有服饰来源切clothes。对比度仍保留4.5门槛，采用当前实际设计token组合而非已废弃绿色样本 |
| `album-visual-ui.cjs` | 历史第六/七批文件分工、不允许存在photo-editor选择器 | 合法最长30码点名字/配文全文与alt、具名详情动作、tab控制关系；编辑移交关闭旧详情，同步onSaved返回内容/回到相册且不改档。原普通update/无commit/fetch边界及全部原同步回调/清理用例保留 |
| `deals-visual-ui.cjs` | 固定48px/两列CSS实现 | 长名/大数/禁买原因与状态关联；禁用按钮不能越权，重读恢复预算与焦点；购买在任何绘图/焦点RAF前已持久保存，耗尽后反馈可聚焦且无持续RAF |

原有业务、旧按钮/迟到异步、拒写、奖励防重复和焦点保护均保留。两份轻DOM只补浏览器原生SUMMARY点击展开/收起DETAILS的默认行为，不根据产品特定类名伪造成功。真正几何、计算样式、减少动态下的视觉与同尺寸整页对照仍由总集浏览器核实。

## 花园返回花圃的真实P2

总集只读复核发现：从种子铺/收获篮进入加工后，旧“我的花圃”调用普通`ui.open('garden')`，会保留原来的seeds/harvest页签，名称与实际目的地不一致。

只做以下窄修复：

- `js/ui/garden.js`新增`ui.garden.openPlots()`，通过已有`go('plots')`表达明确意图。
- `js/ui/crafting.js`的“我的花圃”优先调用该入口；缺少新adapter时仍保留旧open后备。普通花园入口没有全局清空页签。
- 新增`tests/pages-fidelity-navigation.cjs`四组，加载真实garden/crafting UI及原系统，以合成DOM覆盖seeds/harvest→crafting→我的花圃→plots；另核普通open仍保留seeds/harvest、明确openPlots后普通open保留plots，导航前后存档不变。

本轮11份JS（八份既有测试、新导航测试、两份窄修产品源码）的`node --check`全部通过。未运行任何UI/规则测试、浏览器或检测器；请总集一次串行运行八份更新测试与新导航测试。该检查列表不表示已通过，也不代表真实布局/设备已验收。

本轮授权修改已一次交齐，现已停止写入。未新增、移动、完成或重排总集TODO条目。

## 用户实报：小屋个性化挤压、旧房屋预览与人物肤色

用户在本会话直接附图指出“小屋个性化”变形、房屋模板与新3D不符，并要求人物使用暖黄色肤色。这项直接要求与后续纯stage模块并行处理，未由stage任务覆盖。

截图的根因是窄的右纸面板仍使用双栏和六列，而旧媒体查询只根据整个浏览器宽度判断；因此在桌面窄纸面板内也会把名称和按钮压成竖条。修复以容器实际可用宽度为准：默认单列大预览、整行行动和两列风格卡，只有容器自身达到440px才三列；删除此CSS对公共panel高度的覆盖。布局模板前后图也纵排。自由搭配的操作/招牌表单保持整行，调色仍为两列。

本次实际写入文件（截至本节）：

- `js/ui/house-design.js`、`js/ui/exterior.js`、`css/house-design.css`：纸面构图、实际房屋预览消费、每帧一张的有限预览队列/主图优先、关闭/换档/迟到绘图清理。交叉复核发现旧交互在换档后仍可能调用，因此补页面根节点/代次/宿主kind守卫；旧确认、下拉、颜色及改名不再能写新档。原风格quote、布局signature、部件购买与保存系统不改。
- `js/render/exterior.js`：仅替换旧固定单层`preview`并新增幂等`disposePreview`，保留roof/wall/window/door/chimney原绘制API。唯一离屏World3D按实际floors/slots/rooms/attic和所选exterior绘制；不读写主相机、不修改store，不按卡新建context，不持续动画。无GL或失败时返回明确原因，并绘制真实1–4层的等距结构示意。
- `js/data/outfits.js`：保留四个skin ID与八预设/已有搭配字段，色值改为奶油/杏仁/蜂蜜/麦芽暖黄（`#F6DDAF/#F3D6A4/#F0CF9A/#EDC991`）。旧ID在2D、3D、衣橱和公开人物中共用正式表，无需改写存档。动物毛色、头发与绘画调色盘未修改。
- `tests/character-visual.cjs`：只将正式肤色必须等于原型历史旧色的断言改为新正式表合法色/既有ID兼容，其他预设与原型字段断言保留。
- 新`tests/pages-fidelity-house-preview.cjs`（5组）、`tests/pages-fidelity-house-design-ui.cjs`（7组）、`tests/pages-fidelity-avatar-skin.cjs`（6组）。均为待总集串行运行的定义，不能记为18组通过。

预览兼容旧三参，并支持`G.draw.exterior.preview(canvas, exterior, name, {width,height,dpr,house?})`。返回`{ok,status,mode,reason,floors,rooms,attic,width,height,partsSupport,supportedParts,unsupportedParts}`；mode为`webgl/canvas-isometric/none`，status为`ready/fallback/unavailable`。宿主调用`disposePreview()`释放唯一GL；UI主图560×400、小图220×160，逐帧一张，页面静止后不再排帧。

**必须保留的实际限制：** 当前主World3D本身尚未分别建模roof/wall/window/door/chimneyStyle款式，GL预览复用它以保持与主场景一致，metadata明确列为unsupportedParts。没有跨写MC-076的world3d/scene来掩盖这项缺口。降级可复用墙纹/窗门图形，但仍不宣称完整屋顶/烟囱款式。真正新3D整屋效果、390px与桌面侧栏、完整风格切换须总集使用新资源实页复核。

这些修改没有prepare/activate、入口指纹或私人存档操作，当前c887阶段预览保持。需总集对上述既有资源更新指纹并在统一整合时换入，不能把源码提交称为用户截图中的页面已经刷新完成。

总集建议串行命令：

```text
node tests/pages-fidelity-house-design-ui.cjs
node tests/pages-fidelity-house-preview.cjs
node tests/house-design-ui.cjs
node tests/exterior.cjs
node tests/pages-fidelity-avatar-skin.cjs
node tests/character-visual.cjs
node tests/avatar.cjs
node tests/avatar-presets.cjs
```

本会话只做`node --check`；未执行以上规则/UI检查、浏览器或像素验收。未修改总集TODO。

## 用户实报：衣橱整个人物朝向（可冻结接线）

本轮另写入`js/ui/avatar.js`、`css/character-visual.css`与新`tests/pages-fidelity-avatar-direction.cjs`。主预览扩大为124×168 CSS像素（窄屏112×152），画布260×352，不使用CSS翻转来冒充3D。

**给MC-076的准确API依赖：**

```text
Game.render.drawAvatar3D(canvas, look, {
  yaw: facing * Math.PI / 5,
  facing: -1 | 1,
  still: true
}) -> true | { ok: true, mode: 'webgl' }
```

调用必须同步绘制完整真实look（头、身、手脚、头发、衣物和配饰一起发生3D视角变化）。UI仅将上面两类返回值视为3D成功；未安装API、返回false/ok:false或抛错时，回到原`drawAvatar`并明确可见“平面镜像预览 · 3D 暂不可用”。下一次方向操作可重试新adapter。方向仍只有运行态，不进入存档；关闭/换页/换档使旧方向按钮和迟到绘图失效。普通服装、八预设、购买后穿戴、三套搭配及旧IDs保留。

未改`world3d*.js`、`scene.js`或任何共享入口。API底层实现仍由MC-076提供，所以这里是UI接线源码已交，不能说实际整人转向已目视通过。总集需在新adapter可用后核左右三分之四视图、完整头发/鞋脚与原服饰一致。

新增6组真实UI/规则+3D适配器替身回归，仅定义、未执行：

```text
node tests/pages-fidelity-avatar-direction.cjs
node tests/character-visual.cjs
```

## 第二里程碑纯几何模块（独立交付，不阻挡实报修复）

总集追加的`js/render/page-stages3d.js`与`tests/page-stages3d.cjs`独立于上述人类实报问题。只提供两个CPU舞台描述：当前衣橱真实人物、当前所选真实动物；不创建Canvas、GL、监听或RAF，不读DOM、不写store，不扩画架/货架。

```text
Game.pageStages3D.describe({state, surface:'avatar'|'residents', residentId?})
  -> {id, key, bounds:{min:[x,y,z],max:[x,y,z]}, focus:[x,y,z], build(geometry,models)}
其他surface、无真实avatar或无效residentId -> null
build(geometry, models || Game.world3dModels) -> true | false
```

`id`为avatar/residents；key绑定当前真实look及绘图使用的肤色/衣物定义，或真实所选动物定义与入住事实，无关钱包/非穿着库存不改变外观key。build只追加Geometry并调用已有character工厂，人物来自当前state.avatar，动物来自真实residentId；待邀请可预览，未伪造入住、服饰或奖励。舞台保留莓红、木纸平台与少量镜柜/矮凳。独立主相机/命中/摄影绕开舞台由MC-076消费，不在本模块越界接线。

加载顺序由总集接入：`world3d-models.js → world3d.js → page-stages3d.js → scene.js`。纯几何边界/完整头发角耳与真实数据检查待总集串行运行`node tests/page-stages3d.cjs`；实际GL、相机、手机/桌面构图与左右视图均未验。

## 本次完整指纹清单与冻结边界

需要总集纳入指纹/发布源的产品资源共8份：

```text
js/ui/house-design.js
js/ui/exterior.js
css/house-design.css
js/render/exterior.js
js/data/outfits.js
js/ui/avatar.js
css/character-visual.css
js/render/page-stages3d.js（新增，需MC-076先消费接线）
```

测试文件截至下方家名窄修共7份：`tests/character-visual.cjs`、`tests/pages-fidelity-house-preview.cjs`、`tests/pages-fidelity-house-design-ui.cjs`、`tests/pages-fidelity-avatar-skin.cjs`、`tests/pages-fidelity-avatar-direction.cjs`、`tests/page-stages3d.cjs`、`tests/exterior.cjs`。其他写入只有本报告。没有改B的ui.js/index、A的world3d/scene、prototype、网络/账号/server或总集TODO/README/DESIGN。

用户实报修复的上述源码可以冻结，等总集串行检查后统一接线/更新预览；c887当前产品预览未由本会话切换。本会话只做语法检查，没有运行UI/规则/纯几何测试、浏览器或部署。

最终只读复核后，预览帧也使用相同owns(root,token)判定：外壳已经隐藏但关闭事件尚在下一帧时，旧DOM仍连接也不再绘制。新增对应交互回归；上述产品与测试现已全部停止写入，等总集统一接线和串行检查。

总集后续院景要求已保留：正常预览继续调用正式World3D核心，不另造GL院景；真实yard部件与位置随只读快照保留，花园取正式公开layout.garden与只读status，未来prototype-yard3d由A接入核心后预览一并消费。没有改A或该新院景模块。Canvas等距分支仅为明确标示的无GL降级，不作为正常3D替代。

## 总集退回：预览家名实际丢失的P2窄修

总集串行完成个性化UI7、预览适配旧5、既有house-design UI10组后，既有exterior前7组通过，第8组缺少`fillText('云上的家')`失败。只读分类确认是实际展示回归：家名仍在只读快照、存档与改名输入框内，但新GL用photo模式跳过标签、核心不消费house.name，降级房屋也未画家名。不能仅删除家名断言。旧绘图桩另缺标准transform，有房间样本会受影响；当前第8组默认空房不触发该分支，因此本次失败不能归因桩缺API。

经总集开放窄修，本轮仅改四份文件：

- `js/render/exterior.js`：两条成功路径共用previewName，底部独立纸牌展示完整当前家名；预留30–48逻辑像素后重新框取房屋，避免盖住房屋。220×160缩略图与560×400主图按各自画布设置字号，长名用Canvas maxWidth保持在纸牌内；DPR仍封顶1.5。家名不写store、不改主核心或其标签逻辑。
- `tests/exterior.cjs`：绘图桩补标准transform；原家名与31款独立绘图保护保持，第8组另核真实有房间的等距降级成功、立面命令、家名、Canvas状态平衡及存档不变。
- `tests/pages-fidelity-house-preview.cjs`：由5组增至7组，补GL/缺GL/渲染异常、默认名/八字/emoji、主图/缩略图/尺寸下限、DPR上限、名牌在GL取景之外、重绘改名不留旧名、不重建renderer、Canvas状态平衡与unsupportedParts不虚报的检查。
- 本报告：记录分类、窄修与准确待运行列表。其他7份产品继续冻结，没有改UI/CSS、A核心、入口或TODO。

外观31款在正常3D核心中尚未分别建模的限制继续保留：补家名不等于屋顶/墙纹/窗门/烟囱款式全部还原。此次只做3份JS的node --check；规则测试、真实像素与可读性仍由总集串行及实页核对。本轮必要串行命令只有：

```text
node tests/pages-fidelity-house-preview.cjs
node tests/exterior.cjs
```

新必要回归尚未由本会话执行，不能记为7组或整份exterior通过。产品再冻结后由总集统一更新exterior资源指纹并发布，未自行操作浏览器、prepare/activate或私人数据。

独立只读复核接受本轮名牌分区、尺寸下限、状态恢复与限制表达。另从源码看到既有exterior第9组手写Node没有isConnected且未挂载，现UI的owns会拦截该脱离页面的root；如串行继续到此组出现空预览/动作未执行，应补真实连接/挂载的测试夹具，不能放宽产品生命周期守卫。本次开放范围仅含该旧测试的Canvas API，未顺带修改其DOM夹具或宣称此组已运行。

## 回忆菜单全入口：组件窄容器与可读性修正（2026-10-30）

用户继续指出回忆菜单各功能的面板/弹窗太窄、文字难读，并强调相册及长尾子窗也要覆盖。实际入口按`js/ui/ui.js`的memoriesPanel（754–764行）逐项映射：Markdown下载、小屋相册、收藏图鉴、创意画板、收获加工册、惊喜礼盒、七日登录礼物、阁楼天文台，以及菜单本页的真实回忆列表。没有加入日历/生日等不属于此菜单的范围。

本轮只有七份组件CSS与本报告写入，所有JS、规则、数据、测试、共享外壳和入口均未修改。公共外框宽档由MC-077负责；组件旧的520/510/560px等外框width限制已撤掉，画册/相册/编辑器也撤掉重复的组件外框宽高接管。简单改名/删除确认仍交公共外壳的普通表单档，不将全部窗口放大到1000px。此前浅肤色已交的产品数据保持冻结。

### 实际菜单与子窗口覆盖矩阵

下表“已改”仅指CSS源码交付并经静态阅读，不等于已在正式根页验证画面或操作。

| 实际入口 / 子窗口 | 本轮组件覆盖 | 尚未覆盖 / 交接 |
| --- | --- | --- |
| 回忆菜单本页、逐条回忆和时间 | 已映射真实memoriesPanel，未跨写ui.js/style.css/shell.css | 本页公共宽档、共享memory-item/memory-text由B处理，实际显示待总集 |
| 下载Markdown回忆录 | 原按钮与下载逻辑保持；此动作无新游戏窗口 | 原生下载界面不属于组件CSS，不发明下载弹窗 |
| 小屋相册、回收夹、空/满与图片加载失败 | photography.css：自身内容容器默认单列，≥480px才双列；名称/日期/状态约14px、按钮44px；长名换行 | 正式图片解码、失败重试、满额与回收操作、真实滚动待实页 |
| 照片详情、重命名、永久删除确认 | photography.css：详情默认上下排，≥760px自身容器才双栏；动作按156px最小宽换行，输入16px；确认全文与计数14px | av-form-dialog交B普通表单档；IME/焦点/确认/PNG下载待实页 |
| 照片编辑器：取景/相框/贴纸/配文/纯净预览/保存下载 | photography.css：自身内容容器默认单列，≥760px才预览+工具双栏；相框120px、贴纸84px、动作160px最小宽auto-fit；去掉固定300/260px工具列与工具区高度/嵌套滚动，改宿主单滚动；正文14px、输入16px | photo-editor-v2-card交B大型工作台档；原stageWell→fitSurface/ResizeObserver链未改，实际画布尺寸、触屏、键盘与保存下载待实页 |
| 收藏图鉴四类主册、搜索/筛选/分页、九主题徽章、空/未知/错误 | collection-book.css：分类112px、筛选176px、卡片160px最小宽auto-fit；分页/筛选摘要/徽章按自身容器换行；搜索16px、正文及真实字段标签14px、状态13px | 共享下拉弹层在根组件之外，交B；筛选组合/重置/24分页/领奖与键盘实际核对待总集 |
| 图鉴详情、来源/线索/历史与未发现剪影 | collection-book.css：事实列表窄时一列、自身容器≥360px才标签/值两列；长来源可折行、正文14px，保留剪影/隐藏/错误/动作 | collection-detail-modal外宽交B；来源跳转与详情滚动待实页 |
| 创意画册：空/有作品、锁定/读取失败、容量/草稿；画作详情与选房布置 | creative.css：画册默认单列、容器≥420px两列；详情默认上下排、≥640px双栏；正文/名称/状态/按钮约14px，长名及说明换行 | 画册/详情外框档交B；真实旧作品、草稿、布置及焦点待实页 |
| 创意画板、24色、工具/撤销/重做/清空、预览/帮助/保存下载；改名/删除确认 | creative.css：编辑器默认画布→工具单列可滚，自身容器≥760px才按比例双栏；撤掉295/260px固定工具栏，24色auto-fit最小44px，全部操作可折行；输入16px，帮助/状态14px；改名/删除全文可折行 | creative-editor-card交B大型工作台档，creative-name-card维持普通表单档；原像素画布fitCanvas/ResizeObserver未改，真实尺寸/矮窗/IME/键盘/触屏待实页 |
| 收获加工册：五配方、选择/批量、材料/条件、二次报价、成品与记录 | crafting.css：撤组件450px内宽上限；默认纵排，容器≥700px才配方/详情双栏；配方/数量按最小180px换行，导航与动作可换行；正文/确认/历史14px | 普通下拉弹层由B管理；真实报价、数量、确认与返回花圃未改，实际滚动/操作待实页 |
| 惊喜礼盒：大厅/预算/候选/最近回执、首次/失败/回看、揭晓/礼物/回执 | gifts.css：正文14px/日期13px，窄预算纵排、最近回执按钮另行；依据自身360/440px宽增强列数；修正无回执、读取失败及有回执但插图失败时的文字/重看按钮布局；揭晓动作可折行 | 礼盒外框交B适当阅读档；真实开盒、回看/跳过、焦点及回执链保持但待实页 |
| 七日登录：panel/modal、七份进度、当前礼物、领取/已领/回拨/读取失败、规则 | login.css：七卡按auto-fit与104px最小宽换行，保持原1→7顺序；卡名14px、编号13px/状态12px，正文/动作14px；礼物默认上下排，自身容器≥440px才图文并排；撤520px组件外框cap | 真正七卡换行与完整日期/大数、领取/重复领取/拒写/换档、读屏焦点与滚动待实页 |
| 阁楼天文台：未建/等级、今夜行动/反馈、累计、最近星空、规则及穹顶预览 | observatory.css：正文/规则/星空故事/动作14px、日期/图注13px；累计指标按180px最小宽auto-fit，按钮可换行；星图/望远镜仍满容器缩放 | 观星与阁楼原机制未改，本批不实现新增自由布置；真实行动、长星空故事/大数与折叠滚动待实页 |

### 文件清单、复核与冻结

本轮需总集更新资源指纹的产品文件只有：

```text
css/login.css
css/collection-book.css
css/creative.css
css/photography.css
css/crafting.css
css/gifts.css
css/observatory.css
```

布局不再以整个浏览器宽度来判断这些组件是否分栏；使用自身具名inline-size容器或带可缩最小宽的auto-fit，CSS媒体查询只保留减少动态/强制色等原适配语义。交叉只读复核确认查询的祖先关系与真实DOM匹配，原hidden、焦点和全部按钮/选项均保留。修掉复核发现的图鉴字段标签被共享11px盖住，以及礼盒两插图隐藏时文字落入68px列的问题；有历史但缩略图失败且重看按钮仍显示时，也让按钮另起一行，避免宽容器重叠。

本轮没有JS修改，无新增node --check目标；未运行规则/UI测试、CSS parser/validator、服务或浏览器。此前已通过的业务测试不作为本轮真实排版证明。总集仍须用新外壳与这七份CSS在实际根页核宽窗/390px及桌面窄容器、长名/大数/空满/失败、键盘焦点、全部子窗和编辑器实际滚动/尺寸；这些项目全部保持“待实际验收”。未prepare/activate、未同步入口指纹、未操作私人存档或生产，未修改TODO。七份产品现已冻结并停止写入。

2026-10-30补记：`tests/pages-fidelity-avatar-direction.cjs`已删除。换装面板后来重写为蛋仔舞台（自带3D画布、拖动360°旋转），本文所述的朝左/朝右按钮、`G.runtime.avatarUI.tab`与平面镜像降级已不存在，该测试只剩失效的旧界面夹具。3D人物转向接口`render.drawAvatar3D`仍由`tests/world3d-avatar.cjs`覆盖。

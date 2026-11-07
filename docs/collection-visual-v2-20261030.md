# 第五批收藏图鉴：源码与隔离验证

日期：2026-10-30（Asia/Shanghai）。范围依据 `prototype/COLLECTION-HANDOFF.md`；真实内容与规则依据 `js/data` 和 `Game.sys.collectionBook`。本批已完成图鉴源码及隔离验证，正式桌面/390px整页验收待总集集成。

## 文件与公开接口

本批只修改：

- `js/ui/collection-book.js`：四类动态进度、组合筛选、分页、详情、套装反馈和失效管理。
- `css/collection-book.css`：图鉴面板、`.collection-book`、`.collection-detail` 和专属 `.collection-detail-modal` 的奶油纸/橄榄绿样式。

本批新增：

- `tests/collection-book-visual-ui.cjs`：17组真实规则与轻DOM检查，可单独运行，也为像素检查提供合成fixture。
- `tests/collection-book-visual-raster.cjs`：可选离屏Canvas检查，使用验收机已有Canvas包，不增加产品依赖。
- 本报告。

公开接口保持：`Game.ui.collectionBook.panel({doAction,navigate})`、`openDetail(kind,id,api)`、`focus(options)`。原入口和kind `furniture/residents/crops/outfits` 保持。`focus`接受kind/status/query/theme/category并重置页码；兼容owned/unowned状态，非法kind不替换当前kind，非法家具主题/类别归一为all，非家具清除家具条件。

未修改prototype、README/TODO/AGENTS、共享设计文档、ui.js/style.css、data/core/systems/render、入口、manifest、指纹、快照或发布文件。没有部署、切release、压缩打包、启动服务/端口/浏览器进程，没有操作真实账号或私人存档；未介入第一至四批开发或验收。

## 最终行为

四册进度直接读取 `summary()`；完整合成fixture载入真实加工数据，当前为407家具/12居民/12花果/60服装。五个加工成品包含在407家具内；旧 `collection-book.cjs` 的402来自未载入加工数据的旧fixture，不用于产品总数。源码没有硬编码407。

搜索、发现状态和家具主题/类别共同传给系统 `list()`，不额外检索 `definition.name`。每页24条，407家具共17页且ID不重复；空结果可清除全部条件并回到搜索。未发现条目使用系统显示名「？？？」与真实预览的单色剪影；标题和ARIA使用泛化线索，不暴露真名。稀有度装饰继续传 `discovered:item.collected`。

详情从 `get()`读取来源、等级、历史发现、当前数量和线索。家具用完、花果卖空、居民搬离后仍按系统历史点亮；种子和生长中的作物不被算作收获发现。服装预览克隆玩家外观与配饰数组，不修改玩家。四类继续调用原 `drawThumbnail`、`drawCharacter`、`drawAvatar`、`ui.garden.drawCrop`。

来源操作点击时重读当前条目，并完整转发 `item.action`，保留shop的itemId/theme/shopTab、residents的residentId、quests的tab/category/milestoneId/achievementId、crafting的recipeId、garden、avatar的outfitId/category。calendar继续调用原 `calendar.open(eventId)`；没有统一跳商店或修改目标模块。

九主题的done/total/complete/claimed全部读取 `themes()`；常规集合由系统 `regularIds()`定义。每套38件，不把庭院、节日、rewardOnly、非标准模板和五个加工成品加入套装。奖励区默认折叠，展示未齐、可领和已领；手动操作只调用一次 `claimTheme()`。成功由系统写入500糖果、徽章记录与回忆，没有新增徽章库存。钱包上限、规则失败或同步异常保留反馈与重试入口，UI不扣发任何资源。

`claimTheme`仍沿用既有普通 `store.update`；本批没有修改规则、引入 `persist:true`、直接调用同步commit，或承诺新增同步落盘原子保证。容量/同步拒写的实际行为以原系统与保存模块为准。

## 焦点与生命周期

筛选、页码、奖励展开和反馈仅在 `Game.runtime.collectionBookV2`。所有本模块交互入口提供稳定 `data-ui-focus`，适配共享 `renderCurrent` 的重挂恢复；搜索与自定义选择器回调只更新结果区，保留正在编辑的控件，不绕过共享ui.refresh的交互保护。

清空条件回搜索；分类切换回原分类按钮；翻到首末页时回可聚焦页码；领奖失败回重试按钮，成功回该主题行。详情关闭时可找回被共享重挂替换的原条目。按钮保留原生键盘触发，选择器与弹窗复用现有键盘组件。

换档递增epoch、清除运行态并关闭本模块创建的详情。旧面板、旧按钮、选择器/搜索回调和待执行绘图都检查epoch/活动根/DOM连接，不影响新档；不关闭其它模块弹窗。绘制只在请求帧执行一次，无新增循环或计时器。

窄于620px时四册变两列、筛选纵排、条目三列，按钮至少48px，搜索字号16px；桌面按钮至少44px。正文/状态/进度使用明确文字，包含focus-visible、减少动态及强制颜色模式规则。指定的8组静态正文颜色对均达4.5以上：这只是源码颜色对检查，不代表整页无障碍验收。

## 实际执行的检查

所有Node检查串行执行，没有重复全量测试。

| 命令 | 结果 |
| --- | --- |
| `node --check js/ui/collection-book.js` | 通过 |
| `node --check tests/collection-book-visual-raster.cjs` | 通过 |
| `node tests/collection-book-visual-ui.cjs` | 17组通过 |
| `node tests/collection-book.cjs` | 12组通过（旧fixture402） |
| `node tests/crafting-integration.cjs` | 7组通过（完整407） |
| `node tests/rarity-outfit-rewards.cjs` | 8组通过 |
| `node tests/album-storage.cjs` | 11组通过 |
| `COLLECTION_CANVAS_MODULE=…/@napi-rs/canvas node tests/collection-book-visual-raster.cjs` | 2组通过 |

合计57组定向检查。新增UI17组覆盖四册summary、未知文本/aria/title/搜索、组合筛选、24分页和空恢复、历史与当前数量、未收获不点亮、全部来源action字段、试穿零修改、九主题手动单次奖励、规则失败/钱包上限/异常重试、普通update语义、focus与非法输入恢复、共享重挂焦点、换档失效和样式限域。

独立只读审查先核对权威系统及共享UIAPI，再复核最终JS/CSS和两份检查，结论accept，未发现阻断问题。其提出的非法focus主题/类别导致显示与实际筛选不一致已修复，并加入用例。审查者没有运行测试或修改源码。

按impeccable流程对两个产品文件执行一次机械detector。退出码2，输出为共享DESIGN登记之外的颜色、圆角与字号advisory；本批依据收藏交接的奶油纸/橄榄绿方向使用局部值，在此记录，未修改共享设计文件、添加忽略或宣称detector零告警。随后只做了一次次要文字对比度修正（`--cb-muted:#596747`）。

## 离屏绘制证据与复现

离屏检查加载既有渲染代码但不调用场景init，只通过图鉴正常绘制路径执行491个真实条目，在112×100和92×86两种缩略图尺寸各绘制一次；另外检查五个加工详情预览。每个Canvas有非空像素，绘制前后合成存档完全一致。

输出位于 `/tmp/marshmallow-collection-visual-v2-20261030/`：

- `desktop-preview.png`：四类代表条目的已知名/未知剪影与五个加工绘图示例。
- `narrow-preview.png`：较窄缩略图尺寸的同类证据。
- `report.json`：407/12/12/60计数、尺寸与零存档修改结果。

两图均已打开目视核对：家具、动物轮廓、作物和人物清晰且没有明显裁切；五份加工图来自原接口。图中底部加工成品为原绘图接口示例，未套未知剪影，并非正式未知详情截图。这些是离屏联系图，不是桌面或390px DOM整页截图，也没有执行真实键盘遍历。

本机复现使用已捆绑依赖，无安装：

```sh
COLLECTION_CANVAS_MODULE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas" node tests/collection-book-visual-raster.cjs
```

中文字体只由检查工具注册已有系统黑体；产品没有加载外部字体。

## 集成限制

本轮只读检查确认既有127.0.0.1:4173由一个Node进程监听，根页面仍引用 `/releases/r-383bb1dcf39ed44421f2e331428aa5a297e6a5c19a976793096f89e0049a7cc8/…` 的既有快照。未修改入口或激活新发布来绕过范围限制。

本次证据因此只覆盖源码、真实规则的合成内存交互、轻DOM焦点逻辑与离屏Canvas。正式桌面/390px整页、真实键盘遍历、弹窗/抽屉滚动、选择器浮层定位、100%缩放和屏幕阅读器效果仍待总集在目标资源真正载入后验收，不宣称现有网址或生产已显示新界面。TODO由总集管理，本批未添加、移动或完成任何TODO条目。

# 第三批：现有花园与花果加工源码交付

日期：2026-10-30。范围为现有花园/加工面板和独立花圃绘制 adapter，依据 `prototype/GARDEN-HANDOFF.md`、`prototype/#garden`、`prototype/review/multifloor-20261030/garden.jpg` 和 `mobile-garden.jpg`。本次未改第一批、第二批、正式规则/数据/存档、入口或发布快照。

## 文件与接口

| 文件 | 交付内容 |
| --- | --- |
| `js/ui/garden.js` | 真实容量的可选花圃、所选地块详情、四阶段/当前阶段与成熟倒计时/真实时间、12种子铺、数量校验、收获篮出售确认、定向送居民和花果收藏入口 |
| `js/ui/crafting.js` | 五份配方直接浏览、真实锁定/工坊/材料条件、完整1—99批量、报价→确认→系统提交、拒写反馈、背包去向和制作历史 |
| `css/garden-visual.css` | 仅花园/加工作用域的奶油纸面与橄榄绿视觉层、三列花圃、宽屏双栏/窄屏纵排、焦点与禁用/错误状态 |
| `js/render/garden-visual.js` | 独立软陶土花圃绘制 adapter，无计时、状态修改、输入或网络 |
| `tests/garden-visual-ui.cjs` | 现有14组真实系统+轻DOM定向回归，含买种→继续播种、选种运行态及焦点保持 |
| `tests/crafting-ui.cjs` | 原11组适配显式确认，新增5组确认/批量/历史边界回归，共16组 |
| `tests/harvest-feedback.cjs` | 重复初始化断言改为原有监听基线+1，允许花园自己的可见性刷新监听；其他断言保持 |
| `tests/garden-visual-raster.cjs` | 3组实际Canvas像素检查与可重复生成离屏产物 |
| 本文 | 交接、证据和未集成边界 |

保留 `Game.ui.garden.panel/openPlot/openBasket/drawCrop/refresh` 和 `Game.ui.crafting.panel/open/entry` 接口。保留 `data-garden-plot`、`.garden-plot-action`、`.garden-plot-visual` 等收获反馈定位钩子，以及成品摆放/送礼事件和回调。

选择只进入 `Game.runtime.gardenVisual` / `Game.runtime.craftingUi`，不进入存档。每秒仅读取真实状态和更新计时/阶段显示，不写进度、不全页重建；输入数量和焦点保持。换档使旧操作与待确认报价失效。

## 本批局部视觉约定

方向锁定为上述桌面/手机原型的奶油纸面、橄榄绿操作与矮胖软陶花圃，延续本地Canvas绘图和系统中文字体，不另起品牌。以下是 `css/garden-visual.css` 与现有组件的实值，只供花园/加工使用；本次不把它们提升为共享设计令牌。

| 层级 | 源码事实 |
| --- | --- |
| 颜色 | 正文 `#425747`、次要文字 `#616d57`、奶油纸 `#fffaf0`、细边线 `#cdd0b8`；主要按钮与选中页签为 `#526e53` 配 `#fffdf4`。地块选中使用 `#e8edd6` 与 `#6f8866` 内描边；禁用保留实色底 `#e8e7dc` 和文字 `#5e6657`，不靠降低整体透明度表达。 |
| 文字 | 继承 `"PingFang SC", "Microsoft YaHei", system-ui, sans-serif`；地块标题13px/1.5、状态11px，窄屏分别12px/10px；详情标题17px/1.6、计时14px/1.7、汇总15px加粗。目录标题16px，数量输入16px；库存与时间采用等宽数字。 |
| 布局 | 抽屉目标高度570px；花园宽屏为 `minmax(0,1.12fr) minmax(250px,1fr)`，加工为 `minmax(200px,.8fr) minmax(0,1.6fr)`，栏距18px。760px及以下均纵排、间距14px；花圃保持三列，目录由两列变一列。 |
| 形状与层次 | 花圃17px圆角、窄屏14px，详情20px、目录18px、页签13px、加工报价16px；细边线与轻阴影共同区分纸面。花圃阴影为 `0 3px 8px #6d755414`，目录为 `0 3px 10px #6670500b`；选中态增加内描边，不依赖阴影表达选择。 |
| 操作与状态 | 页签/地块快捷操作至少44px，数量输入与加工主操作至少48px；键盘焦点为 `3px solid #40684d`、外偏移3px。当前生长阶段同时有文字、加粗及 `aria-current="step"`，配方/地块选择有 `aria-pressed`；减少动态时取消本批按钮过渡。 |
| 花圃材质 | adapter按180×130逻辑画布等比居中，分别绘制浅后沿、陶土前沿和土面；水滴与成熟星光只反映传入状态。作物仍复用正式 `drawCrop`，不以图形推导状态或操作命中。 |

## 真实规则保持

- 容量来自 `sys.garden.capacity()/plots()`：Lv.6六块、Lv.14九块；未到Lv.6显示解锁入口。空地与小种子/发芽/花苞/成熟均可选看详情，没有“预览下一阶段”或修改时间的正式按钮。
- 12作物的ID、名称、种价、基础生长时长、售价和库存均读取 `data.crops/cropById` 和真实状态。原型示例库存、钱包、地块和Lv.18不进入产品数据。
- 时间来自 `sys.garden.status()` 和现存地块时间戳；离线恢复、三阶段独立时间线和每阶段一次浇水保持。浇水只缩短当前阶段当下剩余时间30%。
- 温室说明明确只影响新播种，时长为基础时长÷1.2；既有植株不回算。星星果播种按钮与提交均依设备当地20:00—次日06:00；永夜背景不授予播种资格。播种弹窗每秒更新跨时段按钮。
- 每块收获1份、经验+3、首次发现印记、库存上限和原子保存由现有garden系统处理。浇水/收获保存拒写时保持原状态并显示失败。
- 收获篮按真实单价确认出售数量，取消不提交、确认期间库存不足不能超卖、换档后的旧确认不影响新小屋。卖完仍保留发现。送居民复用 `sys.residents.gift(id,cropId)`，保留每人每天一次、每次一份、喜欢/生日加成与保存边界；收藏入口先 `collectionBook.focus({kind:'crops'})`。
- 加工只读取五份正式配方：郁金香×3的花瓶Lv.6；南瓜×2的灯Lv.6；樱花×1的前院树Lv.11；草莓/蓝莓各×2的双层蛋糕Lv.21+workshop。未解锁仍可看真实配方和条件，不能制作。
- UI只调用 `sys.crafting.status/list/latest/craft` 中的既有接口，提交沿用原报价字符串。材料、成品、收藏与历史仍由系统一次持久保存；报价过期、材料不足、背包满、历史满、数量非法及拒写不显示完成或另扣材料。制作不会增加小游戏订单。

## 收尾复核与修正

独立源码收尾复核在P2焦点问题修正后给出 `disposition: ship`，结论仅覆盖本批源码交付。花园页签、地块选择、快捷操作、详情操作及种子/收获目录的数量与库存操作现有唯一且稳定的 `data-ui-focus`；面板重新挂载可识别同一控件，详情因自然进入下一阶段或成熟而局部重建时，也按原键恢复焦点并阻止滚动。加工沿用配方、数量、报价确认、状态与结果的显式焦点去向。

第12组花园轻DOM回归已通过：核对三个页签、九个选择/九个快捷操作、详情操作及12个数量/12个库存操作的键稳定性，并验证自然成熟后详情焦点保留且没有状态写入。此次修正没有扩展到入口或场景集成；`ship` 不代表完整浏览器构图、弹层、读屏或设备验收通过。

## 总集复核P2修正（2026-10-30）

总集复现空地详情（非播种弹窗）选择 `tulip` 后点击「买1粒」，`action → ui.refresh` 重挂使局部变量重置为 `daisy`、焦点指向已脱离DOM的旧按钮，随后可能种下错误花果。新增针对性用例先在旧代码上明确失败：期望 `tulip`，实际 `daisy`。

修正仅涉及 `js/ui/garden.js`、`tests/garden-visual-ui.cjs` 和本文：当前空地的 `seedChoice: { index, cropId }` 保存在 `Game.runtime.gardenVisual`，同一地块刷新沿用同一选择；选种器、买种和播种按钮均有区分inline/dialog及地块的稳定焦点键。重挂后的选择、预览与实际提交共享所选作物。切换地块、换档、地块已有作物或成功播种后清除选择，旧表单控件须仍连接DOM并持有当前选择才可操作；选种不写入JSON存档。

本轮只串行执行受影响检查：`node --check js/ui/garden.js`、`node --check tests/garden-visual-ui.cjs`，以及 `node tests/garden-visual-ui.cjs`（14/14通过）。新增两组覆盖从0粒郁金香开始（播种禁用）→买1粒→保留tulip与新购买按钮焦点→播种启用→实际种下tulip且库存回0，并验证旧控件失效、切地块/返回/换档/已有作物后的选择失效。窄范围独立源码复核判定此P2已解决；总集复验和入口集成后的浏览器验收仍保留。没有重跑下节全部96组，也未重生成离屏图。

## 首轮交付已执行的检查（本次修正未全部重跑）

所有规则/UI/像素回归串行运行，不新建浏览器进程、监听、端口或服务，不读取/修改私人账号与真实存档。

| 检查 | 结果 |
| --- | --- |
| `node --check`：上述3份产品JS与4份变更CJS | 7份通过 |
| `node tests/garden-visual-ui.cjs` | 12组通过，包含花果图鉴聚焦及稳定焦点键/自然成熟刷新断言 |
| `node tests/garden.cjs` | 15组通过 |
| `node tests/harvest-feedback.cjs` | 17组通过 |
| `node tests/crafting-ui.cjs` | 16组通过 |
| `node tests/crafting.cjs` | 19组通过 |
| `node tests/crafting-integration.cjs` | 7组通过 |
| `node tests/crafting-content.cjs` | 7组通过 |
| `GARDEN_CANVAS_MODULE=…/@napi-rs/canvas node tests/garden-visual-raster.cjs` | 3组真实像素检查通过 |

首轮合计96组定向检查；本次P2修正的实际执行结果以上节为准。轻DOM覆盖操作链和状态，不代替真实浏览器布局或设备验收。Canvas包只用验收机已安装依赖，不加入产品运行依赖。

离屏产物位于 `/tmp/marshmallow-garden-visual-v2-20261030/`，均已打开目视检查：

- `garden-crops.png`：全部12种成熟花果，正式data价格/时长；
- `garden-stages.png`：实际 `drawPlot/drawCrop` 的空地与四阶段；
- `garden-nine-plots.png`：固定合成Lv.18九块真实 `sys.status` 地块；左侧可选adapter，右侧明确标记为基础作物素材，非完整UI截图；
- `garden-raster-report.json`：合成标记、12作物像素边界与hash、2217次有限绘制参数检查、3组像素检查。

可重生成命令：

```sh
GARDEN_CANVAS_MODULE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas" node tests/garden-visual-raster.cjs
```

设计机械检测已执行一次，退出2并提示现有 `DESIGN.md` 未登记本批颜色、字号、圆角等advisory。没有把它报告为通过；按本次“文档仅本文”的边界在上节有意记录局部字面值，没有改共享设计文档、sidecar或增加忽略规则。已针对初版主按钮与禁用文字对比做加深修正；浏览器逐色/设备检查仍待集成。

## 尚未集成的边界

1. **未改 `index.html`**。两份现有UI脚本已在原入口加载，其公开API保持；新 `css/garden-visual.css` 与 `js/render/garden-visual.js` 尚未加入口。无新CSS/adapter时，原CSS和内置fallback仍提供完整操作。
2. 后续入口集成清单：在现有基础/加工/游戏感CSS之后加载 `css/garden-visual.css`；在namespace之后、花园UI首次使用前加载 `js/render/garden-visual.js`。花园UI检测adapter后才调用，缺失时回退。
3. **未改 `scene.js` 或场景绘制/命中**。adapter当前由花园面板可选使用；将来主场景如需使用同一材质，应由负责入口/场景的工作消费真实status和此纯绘制API。此交付不接管、修改、协调或验收第一批。
4. 发布指纹、manifest、Service Worker/快照、release切换均未修改；没有部署、打包或宣称当前网址已经加载新视觉资源。
5. 未用用户小屋或私人存档验证，未取得本批浏览器DOM截图。桌面/手机真实DOM、滚动/弹层、键盘/读屏及设备性能留到新资源入口集成后验证；本次交付的是源码、轻DOM操作证据及合成状态的真实Canvas离屏证据。
6. 未改共享 `README.md`、`TODO.md`、`AGENTS.md`，无TODO条目新增、移动或完成；MC-047状态由总集依据后续审查管理。

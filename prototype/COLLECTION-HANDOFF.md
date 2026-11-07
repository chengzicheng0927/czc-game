# 第五批：现有收藏图鉴

日期：2026-10-30。入口：`http://127.0.0.1:4173/prototype/#collection`。沿用软陶云岛背景、奶油纸册与橄榄绿操作；只升级已有图鉴信息结构及操作，不增加玩法或接管其他批次。

## 可开发的页面设计

依次为四类收藏进度、搜索/状态筛选、家具专属主题/类别筛选、24条一页的条目、页码；家具页提供九套主题徽章。条目点击后打开含预览、发现状态、等级、获取来源、当前数量与获取线索的详情，操作直接指向对应原功能。

宽屏以图鉴网格为主体，筛选置于网格上方，详情采用现有弹层；手机筛选纵排、网格保持可读触达、分页按钮可见，不把九套奖励挤在首屏。未知条目展示剪影与「？？？」；已发现但当前用完的条目保留点亮状态。原型目录/库存/领取记录均为当前页面内存示例，正式实现不复制这些数据。

| 真实kind | 当前完整内容数 | 发现依据 | 当前数量 |
| --- | ---: | --- | --- |
| furniture | 407（含5加工成品） | `state.collection[id]`历史 | 背包＋房间＋庭院 |
| residents | 12 | 曾有该居民ID | 当前入住为1，否则0 |
| crops | 12 | 实际收获品种印记 | 收获篮 |
| outfits | 60 | `avatar.owned[id]` | 已拥有为1 |

数量必须来自 `summary()`，不得硬编码407。旧 `collection-book` 测试fixture未载入加工数据时为402，不能据此删去五个加工成品。个人画作不加入完整图鉴总数。原型旧 `clothes` 分类须以真实 `outfits` 为准。

## 规则和接口

- 保留 `Game.ui.collectionBook.panel({doAction,navigate})`、`openDetail(kind,id,api)`、`focus(options)`；focus支持kind/status/query/theme/category并重置页码。换档重置筛选、使旧操作和详情失效，选择与展开状态留运行态。
- 只使用 `Game.sys.collectionBook.summary/get/list/themes/claimTheme/regularIds`。list的页码从1起，返回items/total/page/pages/pageSize，真实每页24条。读取、搜索、翻页、预览不得写存档。
- 家具、居民和花果的历史发现不因卖完、送出、搬家而熄灭；种子和生长中花果不能代替收获发现。界面分别展示历史发现与当前数量。
- 未发现名称、预览、aria和标题不能泄露真名；搜索只匹配系统暴露的显示名称、主题、分类、来源与线索，不额外搜 `definition.name`。稀有度装饰继续传入 `discovered:item.collected`。
- 九主题为basic/strawberry/forest/garden/ocean/cloud/oriental/starry/princess，每套38件常规家具历史。庭院、节日、rewardOnly、非标准模板及五个加工成品均不参与套装。使用系统done/total/complete/claimed，不自行统计替代。
- 集齐后手动领取，每套仅一次500糖果＋徽章记录＋回忆；没有额外徽章物品库存。未齐、已领、可领、未知主题、钱包上限及失败分别呈现；不在UI发奖或改领取记录。`claimTheme`仍沿用普通 `store.update`，本批不修改规则或新增同步持久原子保证。
- 预览继续既有 `drawThumbnail/drawCharacter/drawAvatar/ui.garden.drawCrop`，不改第一至四批绘制文件、人物外观或存档。

| 获取来源 | 既有目标与需保留的字段 |
| --- | --- |
| 常规/节日家具 | shop，itemId/theme/shopTab |
| 好友家具、居民 | residents，residentId |
| 成就/里程碑奖励 | quests，tab/category/milestoneId |
| 五个加工成品 | crafting，recipeId |
| 花果 | garden |
| 常规服装 | avatar，outfitId/category |
| 成就/节日服装 | 继续系统action的quests或calendar/eventId |

直接转发现有item.action；日历沿用图鉴模块已有的calendar.open，不统一跳杂货铺，不修改目标模块。

## 限定开发文件

仅修改 `js/ui/collection-book.js`、`css/collection-book.css` 的图鉴专属作用域；新增 `tests/collection-book-visual-ui.cjs`（必要时同前缀隔离检查）及 `docs/collection-visual-v2-20261030.md` 报告。保持现有已加载文件位置与公开API。

禁止修改第一至四批产品文件、prototype、共享ui.js/style.css、data/core/systems/render、入口/指纹/快照/发布文件。共享README、TODO及交接由总集管理。无新服务、端口或浏览器进程，无真实账号/私人存档，不部署或打包。

## 定向源码验收

检查四类真实summary、含加工成品的完整407视图、未知剪影/名称保密、搜索与状态/主题/类别组合、24分页及空结果清除；详情来源导航保留字段；九主题未齐/可领/已领/失败与重复操作；focus、换档、键盘与稳定焦点。同步异常显示失败和可重试，不伪造成功。

串行执行新增UI检查及受影响的 `collection-book`、`crafting-integration`、`rarity-outfit-rewards`、`album-storage` 定向检查；不重复全量。只在原4173和现有浏览器中以隔离样本验桌面/390px；当前快照尚未纳入新源码时明确保留整页验收，不改入口或切发布绕过边界。

## 原型与源码交付检查

本页家具使用60件真实抽样，明确标示60/407；居民12、花果12、服装60元数据齐备。发现/持有/主题历史为本页示例。未知项以问号和剪影呈现，来源按真实action分流；三项筛选默认折叠，搜索常驻，展开状态与条件摘要保持。

总集复用4173原标签检查1280×720及390×844：首屏完整露出卡片名称；24条分页进入2/3页、无结果与清空恢复、森林主题组合筛选保持展开；未知详情标题/正文不露真名，手机无横向溢出；简约日常手动领取使示例糖果12480→12980、徽章1→2，已领按钮禁用。浏览器无错误。

截图：[桌面](review/multifloor-20261030/collection.png)、[手机未知详情](review/multifloor-20261030/mobile-collection.png)。这些是独立原型证据。正式源码已通过总集36组复跑与独立accept，见[第五批验收](../docs/collection-acceptance-v2-20261030.md)；正式整页和目标快照留MC-053。

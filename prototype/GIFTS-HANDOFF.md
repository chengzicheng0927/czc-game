# 第十二批：现有惊喜礼盒

日期：2026-10-30。仅独立礼盒大厅、已存结果与开盒展示；不升级商店主模块、摆放、联络或分享服务。原型入口为 `#shop → 惊喜礼盒`，已按完整真实候选校准，不固定某件结果。

## 设计与真实规则

软纸立体盒、草莓丝带与温柔短拆封，主要行动清楚标免费或200游戏糖果。本次预算、当前等级未收/总池、结果去向及最近凭据可读；手机先行动/状态再结果与辅助说明，关闭和跳过始终可触达。只用游戏糖果，不加入真钱或赠送他人的入口。

- `data.giftConfig`：paidCost200、completeCoins300、库存9999、钱包/累计开盒各10亿、650ms抬盖/1250ms揭晓/16彩带。
- 本地日期首盒免费，之后每次200糖果。查询不写日期；实际开盒才推进date/freeUsed。漏日不补，回拨只阻止新免费，**仍可付费**，不沿七日心意的全锁规则。
- `data.giftPool(level)`真实条件：非rewardOnly/festivalId/customArt、currency不为none、unlockLv满足，含庭院；从collection历史未收的候选随机一件，摆出/送走不变回未收。满等级当前362件，但UI读取status总数，不能硬编码或从60抽样池选。升级可出现新候选。
- 当前等级全收时回300糖果；免费净+300，付费先需200、净+100。不写付费净加300，也不额外赠家具。候选家具库存满9999时拒绝，不重抽换奖。
- 钱包/库存/累计上限或保存失败不扣糖、不占免费与冷却，资格保持。查看/重看不发奖励。
- giftBox严格 `{date,freeUsed,opened,lastReward}`，只保留最近结果；receipt严格 `{id,at,kind,itemId,coin,paid}`。家具coin0，糖果itemId:null/coin300，无礼物历史册。

## API、提交与动画

保留 `ui.gifts.open/panel/content`及弹窗/独立面板/商店内容三入口，不改调用方。读取 `sys.gifts.status()` 的date/savedDate/freeAvailable/cost/coin/remaining/total/opened/lastReward/canOpen/reason；open返回ok/message/reward/cost/free，latest为副本，init无写入/定时器。

原open已 **persist:true**，扣费/送物/收藏/免费标记/累计/凭据/回忆同次保存，成功后gift:opened。busy与成功后1250ms冷却保持；动画/关闭/跳过/重看不能调用第二次open或扣款。失败不给成功动画、结果或音效，按最新状态恢复；异常可重读，不改规则/core。

展示只消费已保存receipt，重看/刷新/提前关窗不重奖。沿650/1250ms与16彩带现有预算，后台或减少动态立即显示结果；关闭清timeout、RAF、visibility/motion监听与Canvas，换档关旧结果、旧按钮/迟到回调失效。家具继续原drawThumbnail和稀有度装饰，不新增摆放流程；结果只收好/关闭。

## 文件分工与验证

仅 `js/ui/gifts.js`、`css/gifts.css`，新 `tests/gifts-visual-ui.cjs`及必要同前缀隔离绘图/动画检查、`docs/gifts-visual-v2-20261030.md`。保留class/API。禁止prototype、共享README/TODO/交接、data/core/systems/render、公共UI/CSS、商店主模块/scene/其他批次、入口/指纹/快照；第一批完全排除。原型app/style由总集负责。

串行新UI+ `tests/gifts.cjs`15组，核三入口、免费/付费/不足、全收免费+300/付费净+100、回拨可付费、真实receipt/拒写、重入/冷却、重看/跳过/提前关闭/后台/减少动态、换档/旧按钮/焦点/滚动。人工Canvas/时钟只能作隔离证据，不读scene或私人记录，不冒充真实动画/整页。

正式桌面/390px、键盘/读屏/滚动、动画与设备待目标快照实际载入后验；不改入口或切release绕过。无真实账号/私人存档、新服务/端口/浏览器进程、压缩包或生产部署；共享文档与TODO由总集维护。

## 总集原型检查（2026-10-30）

已在现有4173审核页一次核验桌面1280×720与390×844：免费开盒后65→64未收、糖果不扣；重看不再发奖；再次付费12,480→12,280，提前关闭仍留最近回执；全收免费12,480→12,780、付费200→300（净100），跳过只揭晓。回拨仍付费；拒写保留免费/预算/累计并可立即重试；庭院「团团大树」9999拒绝、腾1格后仍获同款；199糖/钱包10亿/累计10亿禁用，Lv22在完整362池出现38新候选。手机大厅/结果/关闭与按钮可滚动触达，无横向溢出（文档宽385/视口390）。

截图：`review/multifloor-20261030/gifts.png`、`mobile-gifts.png`、`mobile-gifts-reward.png`。家具缩略形状与本页内存记录仍为原型示意；此检查不替代正式资源、系统持久化、真实绘图/动画或物理触屏验收。未改正式存档、设备时间或其他商店分支。

单点修正复验：隐藏skip前捕获焦点；手动跳过与Tab至skip后的1250ms自动揭晓都真实回到「收好礼物」，修后桌面结果证据 `gifts-reward.png`。源码最终37UI+15规则52组及独立复核accept，见[总集验收](../docs/gifts-acceptance-v2-20261030.md)；正式整页/设备留MC-067。

# 第十批：现有阁楼天文台面板

日期：2026-10-30。只升级独立观星面板及最近记录，不修改第一批家园/建造、屋顶几何、点击入口或镜头，不新增玩法。原型 `#observatory` 正按本交接校准；旧原型的固定38碎片、虚构星群名、已解锁3/6与连线小游戏暗示均非真实规则。

## 设计与真实状态

面板以穹顶望远镜、静态星群和奶油纸观测记录为主，夜蓝配暖纸文字，状态与主行动明确。桌面图文并列，390px先图再状态/按钮，累计与最近记录可滚阅读，焦点/反馈稳定。只展示今夜状态、累计碎片/次数和最近一条记录；六种幻想星群如提供预览，必须明确为内容预览，不是已发现图鉴。

- 配置来自 `js/data/observatory.js`。Lv.17、1000糖果且尚未建造可调用原build；独立阁楼不占普通房格、不加普通建房计数。仅面板内既有行动委托，不改家园建造模块或入口。
- observe要求已建/等级满足/夜晚、当前本地日历日期严格晚于lastDate；真实夜晚20:00–06:00或永远夜晚，白天/黄昏拒绝。每天按日期一次，不是滚动24小时，也不是早6点重置。漏日不补、回拨拒领；回拨与同日已领分别说明。
- 每次仅3星星碎片，observations+1，fragments始终为observations×3；最多333333333次/999999999碎片。无金币、经验、兑换、连线或计时游戏。
- 六真实ID/名称：marshmallow_rabbit棉花糖兔座、sugar_swan糖霜天鹅座、sleeping_cat呼噜小猫座、little_whale云海鲸鱼座、honey_bear蜂蜜小熊座、rainbow_deer彩虹小鹿座。故事和points直接取data，按日期固定，可重复遇见，不承诺轮流集齐。
- 仅持久累计数、lastDate与最近lastDiscovery，没有六类发现清单或完整可检索历史。最近记录显示真实ID对应名称/故事、date与3碎片，重看不领奖。

## API与生命周期

保留 `ui.observatory.open/panel/entry` 签名；entry的现有实现和外部调用保持，不改屋顶入口。读取 `sys.observatory.status()`：date/built/unlocked/night/clockBehind/alreadyObserved/canBuild/canObserve/price/fragments/observations/lastDiscovery/constellation/reason；latest为副本，init不写入/无定时器。

build/observe复用既有 **store.update(...,{persist:true})** 同步持久提交和busy防重入，拒写/容量失败不扣币、机会/碎片不变、不发成功事件。UI成功才反馈/刷新；失败展示错误并按最新status恢复按钮，不用闭包旧状态判断。不得改systems/core或弱化为普通update，也不新增持久化承诺。

区分等级不足、钱不足、可建、白天、可观星、同日已领、时钟回拨、收集上限、保存/读取失败。观察按钮单次调用，旧窗口/关闭/换档按钮与迟到结果失效。去设置夜晚沿现有settings入口，不自动修改设置。静态绘制继续调用 `draw.observatory.draw/drawConstellation`，面板渲染单次RAF，关闭/换档清预览与RAF，不加持续world动画或新计时器。

## 文件分工与验收

仅 `js/ui/observatory.js`面板与局部生命周期、`css/observatory.css`专属范围（已有文件，保留公共class），新增 `tests/observatory-visual-ui.cjs`及必要同前缀隔离绘制证据，`docs/observatory-visual-v2-20261030.md`报告。

禁止prototype、共享README/TODO/交接、data/core/systems/render、ui.js/公共CSS、scene、其他批次、屋顶入口/镜头、入口/指纹/快照。第一批完全排除，不分配/消息/修改/验收。原型app/style由总集独立负责。

串行新UI及既有 `tests/observatory.cjs`13组。核所有状态、build/observe单次调用、真实setItem拒写后机会/钱包/记录保持、回拨独立文案、最近真实记录/重看不奖、换档/旧按钮/绘图清理。必要静态星群离屏图可用人工Canvas与真实data/draw，只作隔离视觉证据，不载scene或真实私人记录。

正式桌面/390px、键盘焦点/抽屉滚动、设备与真实取景需后续目标快照加载后验；不改第一批入口/切release绕过、不新增端口/服务/浏览器进程、不操作真实账号/私人存档、不zip、不部署。共享文档由总集维护。

## 原型与总集交付检查（2026-10-30）

`#observatory`已校准真实data/render，默认本页10-30夜晚、最近10-29与累计6碎片/2次；仅最近记录和累计，六星群明确幻想内容预览。此页页眉星星映射本页累计，其他原型HUD不动。状态均为隔离样本，不改设备时间/真实settings或存档。

总集复用4173既有页完成桌面1280×720与390×844：主动观星后糖霜天鹅座、最近10-30、9碎片/3次，重复按钮禁用、无糖果经验奖；拒写首次仍6/2/昨晚记录且机会可重试，第二次成功9/3。建造1500→500且仍0次，再手动观测才加3；回拨独立提示、白天等待、上限999999999/333333333禁增均已点击核对。手机长数值无横向溢出，最近星群弹窗故事/日期/当次3枚与只保留最近说明完整可读，重看不发奖。

证据：[桌面观星](review/multifloor-20261030/observatory.png)、[390px上限与记录](review/multifloor-20261030/mobile-observatory.png)、[手机最近星群](review/multifloor-20261030/mobile-observatory-record.png)。未重复检查其他页面或第一批；真实触屏/实际场景取景不混算通过。

MC-062源码总集42组串行复跑、独立只读accept和人工静态PNG目视，见[第十批验收](../docs/observatory-acceptance-v2-20261030.md)。正式目标快照/整页/设备留MC-063，原persist:true及entry/open接口保持，不改屋顶入口/镜头或切发布。

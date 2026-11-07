# 原需求 P1 核对表

核对日期：2026-10-28。依据用户提供的《棉花糖小屋-需求文档.md》，《实现路径》仅作历史拆解参考。文档中的代理指令、打包建议不作为用户授权；用户后续要求优先：本地存档、手绘低资源2.5D、只复用4173、暂不打包。

本表把“代码有实现”“本轮验证通过”“仍缺失”分开。原文部分系统同时含P0/P1；按具体条目判定，不把P0遗留或明确P2算成剩余P1。下面的测试路径表示覆盖位置，实际执行结果以[验证记录](verification.md)为准。

## P1 主表

| 原文范围 | 当前核对结果 | 实现与检查位置 | 后续 |
|---|---|---|---|
| §2.2、5.7 五章约35主线、七彩虹、每日任务宝箱、40成就 | 已有35/40及完整奖励、章节和结局。原音乐会仅检房型/居民/家具，缺真正举办事件，本轮已补齐并验证 | data/progression、achievements；systems/quests、concert；ui/quests、quest-party、concert；tests/quests、progression、quest-content、concert | MC-029；旧已领音乐会不回退、不重奖 |
| §2.4、5.6 全12居民、档案、入住条件、132日常台词 | 身份/生日/等级/条件齐；橘子最爱主题错误，本轮纠正garden | data/content、residents-expansion；tests/residents-content、content-expansion | MC-030；豆豆主题另见口径项 |
| §5.6 完整居民行为、入住通知 | 旧版仅在卧室持续正弦行走；缺停留/串门/喜爱家具动作和信封提醒。本轮已补齐并验证 | systems/resident-life；render/scene；ui/resident-notices、residents；tests/resident-life | MC-030；位置只在runtime，夜间回卧室 |
| §5.6 每日心愿、五级好感奖励、送礼 | 已有每日心愿/五级凭据；普通蛋糕原固定20，与普通8/喜欢20冲突，本轮修正 | systems/resident-wishes、systems；tests/resident-wishes、residents-content、minigames | MC-030；生日双倍保留 |
| §5.4 150家具、9主题、稀有度 | 342常规+20院子+18节日+12居民礼物+10成就=402，另加5件加工成品=407；已超过150。稀有度旧版仅有数据，本轮接入共用视觉 | data/furniture-expansion；ui/furniture-rarity、collection-book、deals、gifts、ui；tests/content-expansion、collection-book、rarity-outfit-rewards | MC-032 |
| §5.2 外观与前院（单列P1） | 8屋顶/8墙/6窗/6门/3烟囱；20院子物、拖动/配色/回收已做；花园前院已按后续要求扩展对齐 | data/exterior、yard；systems/exterior、yard；render/exterior、yard、scene；tests/exterior、yard、garden-space | 已有验收MC-011/013/017 |
| §5.5 图鉴 | 家具/居民/花果/服装四类、未知剪影、发现历史、百分比、9套装徽章一次500均已做 | systems/collection-book；ui/collection-book；tests/collection-book | 已有验收MC-021 |
| §5.8 四款小游戏 | 四款核心规则已有；记忆UI实际只取居民，顾客耐心只有文字，两处本轮已补齐并验证 | systems/minigames；ui/minigames、bakery；tests/minigames、minigame-ui | MC-031；节奏游戏明确P2 |
| §5.9 种植基础 | 12作物价格/时长/售价、6→9地块、温室20%、四阶段、浇水、离线成长、收售赠、访客+5已有。星星果误用18点夜种，本轮统一20点 | data/garden；systems/garden；ui/garden；render/scene；tests/garden、garden-space | MC-031；永夜仅改场景，经济规则仍用真实钟 |
| §5.9 作物扩展用途 | **MC-033已补齐**：5份真实配方，花瓶/南瓜灯/前院樱花树与两种高级蛋糕；工坊使用真实收获 | data/systems/ui/render的crafting；tests/crafting-content、crafting、crafting-ui、crafting-integration；原页真实扣料/摆放/送礼 | MC-033完成，工坊子项亦补齐 |
| §5.10 昼夜天气与8种节日 | 真实6/18/20边界、永昼永夜、季节天气/雨后彩虹、夜间睡眠、2025–2035节期表、限定礼物/年度凭据、儿童节按人数蛋糕、居民生日帽/生日双倍已有 | data/calendar；systems/time；render/atmosphere、festival、scene；tests/time、atmosphere、calendar-ui | MC-009已验；玩家生日全员庆生见MC-034 |
| §5.10 玩家生日 | **MC-034已补齐**：真实当天收礼后全部已入住朋友与玩家庆生，逐位祝福、七音曲与主动重看；只原年度蛋糕礼包，皇冠保留商店商品/舞台道具 | systems/time；core/audio；data/ui/birthday；tests/birthday、audio；原页12位演出 | MC-034完成 |
| §5.11 换装 | 4肤色/10发型/12发色/6表情、60衣物、3方案、居民好感衣物已有；缺成就/节日衣物来源，本轮已补齐并验证 | data/outfits；systems/avatar、quests、time；ui/avatar、calendar、quests、collection-book；tests/avatar、rarity-outfit-rewards | MC-032；数量口径见下 |
| §5.12 画板 | 16×16、24色、画笔橡皮填充撤销、20幅、挂墙/平铺墙纸、PNG已做 | systems/creative；ui/creative；render/creative；tests/creative、photo-composition | 已有验收MC-022 |
| §5.13 礼盒、每日特惠、七日登录 | 每日免费/续开200、未收家具/全齐300、6件八折日期固定、七日循环漏登不清零/准确序列均已做，奖励持久化后展示 | systems/gifts、deals、login；对应ui与tests | 已有验收MC-023～026 |
| §5.14 相册 | 整屋/房间、8框20贴纸、拖放缩放、一行文字、12张JPEG/PNG下载、编辑/回收恢复已做 | systems/photography；ui/photo-editor、photography；render/photo-decoration；tests/photography、photo-composition、album-storage | 已有验收MC-020 |
| §3.2 音乐音效 | **MC-034已补齐**：九种独立轻柔音色跟随真实成功事件，收获实际作物飞入可见篮子；静音/后台/减少动态与异步取消，保留两套配乐及主动本机朗读 | core/audio；data/audio；ui/harvest-feedback、garden、minigames；render/scene；tests/audio、harvest-feedback、garden | MC-034完成；实际扬声器听感仍按设备待验 |

## P0 遗留，单独排队

这些不是本轮严格P1完成率的分母，也不应因后续功能已做就视为完成。

| 原文 | 确认未完整之处 | 证据/任务 |
|---|---|---|
| §5.2 房型作用 | 客厅聚会/舒适+10%、餐厅每日开饭全员+5、书房阅读经验、游戏室奖励+10%；工坊高级蛋糕已随MC-033完成 | 除音乐会和工坊外，房型活动仍缺失，ui/ui房间菜单和systems/minigames没有相应活动/加成；MC-035，与MC-033材料链协同 |
| §5.3 装修 | 四灯光仅存档字段；夜景固定暖光；房间名牌缺评分/主题徽章 | core/store、systems初始化warm，render/atmosphere固定暖光；MC-035 |
| §5.7/5.16 等级与引导 | 升级仅toast；强引导只文字/跳转，缺遮罩手指和禁点；首次解锁缺专门提示 | ui/ui的guideSteps/advanceGuide/level刷新；MC-036 |
| §5.13/5.15 商店与设置 | 服饰/种子/外观已有独立面板，商店缺统一分类入口；设置缺明确朗读总开关 | ui/ui商店只家具；settings只有选声与试听；MC-036。总开关须保留主动点击试听约定 |

## 已知口径与待验证项

- **服装≥80**：§5.11衣物明细合计60，另有4肤色+10发型+12发色+6表情；§7“服装部件≥80”是否包含外观项不明，不虚构缺20件的结论。
- **豆豆最爱“游戏室风”**：原居民表有该名字，9家具主题表没有。暂保留现有basic，不能随意造第10主题。
- **小游戏60–90秒**：总述与三消25步、记忆按时间/翻牌计星的明细口径交叉；不擅自给步数游戏加失败倒计时。
- **浇水缩短30%**：当前明确按当前阶段剩余时间计算，已有规则用例；原文没有规定按完整阶段还是剩余时间。保持既有规则。
- **花园永夜**：夜种沿用真实钟约定，不用显示设置绕过经济时段；本轮仅纠正18→20的确证冲突。
- **30fps与2.5D**：用户后续要求低资源并允许暂缓完整3D，当前30fps/后台停绘优先于最初60/45fps指标。原先地板左右移动已由2.5D前后摆放要求更新。
- **14房型**：13常规房间+独立阁楼天文台=14，不能按普通房间列表误报少1。
- **待验证**：触屏真机、Safari/Edge分别实机、长时间运行、大对象压力和低端硬件性能。已有代码/规则测试不能替代这些设备验收。
- **明确P2**：宠物和节奏音乐小游戏；用户已暂缓的完整3D；均不进入当前P1缺失数。

## 本轮验证状态

本轮MC-028～032已完成：36个Node脚本409组串行通过，原4173同页完成400×792与1024×768操作、JSON/MD导出和刷新恢复。独立初审发现手机任务首行按钮截断，已用两列条件保留字号与48px目标；定点复核F1 resolved / ship。详见[本轮证据](../.impeccable/review/p1-audit-20261028/finish-verdict.md)与[验证记录](verification.md)。正常Lv5、581糖果、5爱心、莉莉35和原房间恢复；明确剩余MC-033/034、P0遗留MC-035/036继续由MC-004跟踪，未宣称全量P1完成。


### 加工后续批次

2026-10-28完成MC-033：40脚本453组串行通过，5配方与407家具、真实扣料、工坊门槛、批量/拒写/凭据、台面庭院、8/20送礼、图鉴与JSON/MD已接通。原4173同页实际做7份，放4件室内/1棵前院树，送1份蛋糕，剩1份；独立复核ship。正常进度恢复见验证记录；MC-034、MC-035其余房间能力与MC-036保留。


2026-10-28完成MC-034：生日13组、音频25组、花园15组、收获反馈17组；完整42脚本490组后追加同布局延迟刷新回归3组，现有总493组。原4173同页12朋友庆生、逐位祝福/重唱不重领、四作物真实入篮、浇水与新播种流程、400/1024首排48px操作已检查。具体证据和正常档恢复见验证记录。严格P1已确证缺口MC-033/034实现，MC-004仍保留口径歧义/设备待验与P0遗留MC-035/036，不宣称M0–M12全量完成。

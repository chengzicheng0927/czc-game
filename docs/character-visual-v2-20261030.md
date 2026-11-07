# 第二批人物视觉 v2（2026-10-30）

本次仅升级现有八套人类人物的 Canvas 绘制和衣橱展示。没有接管、修改或验收第一批家园、建造、云海、串门页面；没有修改 `prototype/`、`index.html`、发布清单、共享 README/TODO/AGENTS、数据/规则/存档模块。当前为源码交付与隔离验收，未部署。

## 交付文件

| 文件 | 内容 |
| --- | --- |
| `js/render/avatar.js` | 同色柔光渐变、圆润身体与手脚、八种发型剪影、四肤色六表情、红豆玛丽珍鞋带/鞋扣；全部既有衣物继续分层绘制 |
| `js/ui/avatar.js` | 原预设选择器增加真实发型说明、读屏描述、单一勾选与已选摘要；保留首次随机/关闭应用/确认防重复行为 |
| `css/character-visual.css` | 独立人物样式，桌面四列/手机两列、焦点与选中态；**尚未接入入口，待总集合并** |
| `tests/character-visual.cjs` | 12组映射、旧档、公开外观、接口、缓存、绘制及轻DOM选择器检查 |
| `tests/character-visual-raster.cjs` | 3组可选真实离屏Canvas像素检查与两张对照图生成；测试工具依赖不进入产品 |
| 本文件 | 边界、接口、实际证据和剩余集成点 |

## 真实数据映射

绘制读取 `js/data/outfits.js`；不复制第二份预设数据。测试把 `prototype/characters.js` 的 ID、名称、`defaults` 与正式 `avatarPresetLook(id)` 九个外观字段逐项比较。

| ID / 名称 | 肤色索引 | 发型 / 发色 | 表情 | 穿着 / 红结 |
| --- | --- | --- | --- | --- |
| `preset_sunny` 阳光糖糖 | 0 | twin_tails / #8B5A3C | smile | 粉裙 / 有 |
| `preset_pony` 元气小马 | 1 | ponytail / #3D3545 | cheer | 云朵衫奶油短裤 / 无 |
| `preset_bun` 云朵团子 | 0 | buns / #D8B77A | calm | 粉裙 / 无 |
| `preset_curl` 卷卷小熊 | 2 | curls / #B77D50 | wink | 云朵衫奶油短裤 / 有 |
| `preset_braid` 麦穗公主 | 3 | princess_braid / #3D3545 | shy | 粉裙 / 有 |
| `preset_bob` 薄荷波波 | 1 | bob / #8EBBA8 | surprise | 云朵衫奶油短裤 / 无 |
| `preset_short` 清爽小橘 | 2 | short / #C77362 | smile | 云朵衫奶油短裤 / 有 |
| `preset_taro` 香芋刘海 | 0 | side_swept / #B497CC | cheer | 粉裙 / 无 |

全部穿既有 `shoes_mary`。裙装为 `dress_pink`，上下装为 `top_cloud` / `bottom_cream`，红结仍由 `acc: ['bow_red']` 决定。高马尾、双马尾等结构性发圈使用发色，不伪装成额外配饰。没有新增赠衣，没有改动价格、owned、三格搭配、旧档校验和首次随机逻辑；名字中的小马/小熊没有变成动物。

## 接口和性能边界

原接口可直接替换：

```js
Game.draw.avatar(context, publicLookOrAvatarOrWrapper, x, bottomY, scale, {
  still: true, facing: -1, time: 0
});
Game.render.drawAvatar(canvas, avatar, { facing: 1 });
```

`x/bottomY` 仍为脚底锚点；`source` 支持公开精简外观、完整外观及 `{ avatar }`。明确传入外观时不访问 `Game.state`、store 或 localStorage，只读取九个外观字段；旧字符串 `acc` 也能绘制。原 `Game.draw` / `Game.render` 其它成员保留。场景私有 `drawPlayer` 无需修改。

独立 adapter：

```js
const visual = Game.render.characterVisual;
visual.version; // 2
visual.draw === Game.draw.avatar;
visual.thumbnail === Game.render.drawAvatar;
visual.bounds; // {left:-64, top:-204, width:128, height:212}，含既有帽饰余量
visual.cacheInfo(); // {size, max:24}
visual.clearCache();
```

支持 OffscreenCanvas 时，按九个外观字段缓存2倍像素人物；位置、朝向、呼吸和 owned/搭配变化不会重烘焙。LRU最多24份，裸像素约10 MiB，未做设备内存实测。不支持离屏Canvas时直接绘制；缺少渐变API时退回同色绘制。`options.direct: true` 可明确绕过缓存。没有新增动画循环、联网、第三方前端库、CDN、外部图片/字体/音频或ES模块；现有场景的帧率/后台调度继续由调用方控制。

## 实际验证

Node检查逐个串行执行，没有新服务端口或浏览器进程。以下已通过：

- `node tests/avatar.cjs`：12组，含全部60件衣物、10发型/6表情、购买/所有权/旧档/JSON/三格搭配和缩略图旧接口。
- `node tests/avatar-presets.cjs`：5组，含8套合法预设、初始五件物品、旧档不强制选脸、首次随机和既有同屋标记。
- `node tests/character-visual.cjs`：12组，含交付原型精确映射、全8套轮换保留3套搭配/owned/钱包/小屋，冻结公开输入且禁止访问私人状态，4肤色/10发型/6表情、裙装/短裤、四档缩放/镜像/静止和走动变换、无渐变/无离屏降级、24项LRU、CSS尺寸/DPR、首次随机只一次、点卡不提前应用、关闭和确认幂等。专用CSS未加载时也只显示一个选中勾。
- `node tests/live-avatars.cjs`：既有10组人物坐标/插值/生命周期回归通过；没有修改其代码，此项不构成第一批场景或串门流程验收。
- `tests/character-visual-raster.cjs`：3组实际Canvas检查，8套完整入画且像素不同、60件衣物合成、4肤色含真实柔光渐变。
- 两份源文件 `node --check` 通过。人物UI机械扫描执行1次，20项均为局部颜色/字号/圆角未登记的 advisory；无阻断项。奶油纸底、草木绿选中态来自本批原型方向；人物说明11–14px与既有衣橱尺度一致。按限定范围没有修改共享 DESIGN.md 或添加忽略规则。扫描不代替真实浏览器/完整无障碍验收。

独立代码/图像复核发现并修复了森林背带裤的围兜被上衣遮挡的问题：仅背带裤保持上衣先画、围兜后画；新增前后层断言。修复后重新串行运行 avatar 12组、character-visual 12组与真实像素3组，全部通过，并重新目视最终衣物图中围兜/肩带/纽扣可见。

离屏证据：

- `/tmp/marshmallow-character-visual-v2-20261030/characters-lineup.png`：八套形象对照，已逐张目视。
- `/tmp/marshmallow-character-visual-v2-20261030/characters-catalog.png`：全部60件原衣物兼容图，已目视。
- `/tmp/marshmallow-character-visual-v2-20261030/raster-report.json`：八套像素哈希、有效像素数及边界。

重生成方法（将模块位置替换为验收机已有Canvas包路径）：

```sh
CHARACTER_CANVAS_MODULE=/absolute/path/to/@napi-rs/canvas node tests/character-visual-raster.cjs
```

本机使用 Codex 已捆绑的 `@napi-rs/canvas`，没有安装依赖。输出图的中文只在测试工具中注册已有系统黑体；产品仍使用原系统字体，不加载字体文件。`CHARACTER_REVIEW_DIR` 可指定其它输出目录。

## 待总集合并的集成点

1. 源码渲染器与UI沿用原脚本位置，入口无需新增JS。即使新CSS尚未载入，现有 `preset-grid/preset-card/preset-art` 和所有Canvas缩略图已使用升级后的绘制；原按钮/选择行为与可读名称保留。
2. 总集验收后将 `css/character-visual.css` 放在现有样式之后加载，按现有资源hash/离线发布机制更新入口。**本任务没有改 index、发布清单或激活本地/生产发布。** 专用CSS增强模态宽度、两列手机布局、选中背景、焦点框与衣橱底色。
3. 已检查现有 `127.0.0.1:4173` 仍有一个Node监听；根入口引用 `/releases/r-…/` 固定快照，直接源码 `/js/render/avatar.js` 返回404，原型入口仍200。没有为了第二批切换当前发布；因此没有宣称新代码已在现有网址生效，也没有打开/读取用户小屋。待总集按既有方式接入后再验证桌面/手机衣橱与预设弹窗；触屏、Safari、真实同屋名牌遮挡与整合后的性能尚未目视验收。

未新增、移动、完成或重排共享TODO项；由总集合并维护。

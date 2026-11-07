# 第七批相机与照片装饰编辑器交付记录

日期：2026-10-30。依据 `prototype/PHOTO-EDITOR-HANDOFF.md`，本轮交付编辑器源码、编辑器专属样式和隔离验证。独立复核最终结论为 **ship，限定源码与离屏合成范围**；修复后当前未发现未解决的 P1/P2。此结论不包含正式桌面、390px DOM 实页、真实触屏、HUD 或主场景摄影验收，也不表示生产已发布。

## 交付范围与视觉实现

产品改动限于 `js/ui/photo-editor.js` 与 `css/photography.css` 的第七批编辑器段；独立检查为 `tests/photo-editor-visual-ui.cjs`、`tests/photo-editor-visual-raster.cjs`，本文件记录交付证据。没有改共享设计规范、第一至六批产品代码、入口、指纹或发布快照。`js/ui/photography.js` 的 SHA1 仍为 `317f508d4c4e8053a1ab4113eb4bbe0194644e5b`。移除 CSS 第七批新增段可按字节还原旧 CSS，第六批 `.photography-album-v2` 样式保持。

编辑器采用奶油相纸背景与薄荷色工具、深绿色文字和焦点轮廓。照片是主要视觉区域；桌面源码为预览与工具并列，窄屏在 620px 以下改为照片在前、工具纵排和标签切换，因此 390px 对应纵排设计。照片用可用宽高等比适配，工具区独立滚动；手机的选中贴纸工具改为普通流布局，避免粘性工具遮挡。取景选择器允许收缩，滑块的浏览器轨道与手柄也覆盖为薄荷色。以上布局与样式属于源码实现，尚未由新资源的 DOM 实页截图证实。

顶栏持续显示草稿/已保存状态、贴纸 `0 / 20` 和相册 `0 / 12`；贴纸计数不会随工具页切换消失。底部说明明确下载的是哪张已保存照片，以及是否排除当前未存草稿。原生层选择按钮支持选中重叠底层贴纸，带选中态和可读名称；仅在贴纸成员变化时重建，移动与缩放保持按钮稳定。纯净预览隐藏工具、选框和辅助说明，保留已合成装饰；返回后继续编辑，不触发保存。

## 内容、输入与操作

- 相框共 9 项，即 `none/cream/strawberry/forest/ocean/starry/cloud/rainbow/polaroid`，包含不加框和 8 款既有 Canvas 装饰。缩略图使用当前缓存底图实际合成。
- 贴纸共 20 种：`heart/star/rainbow/cloud/sun/moon/flower/leaf/strawberry/cake/ribbon/sparkles/rabbit/bear/fox/cat/penguin/unicorn/butterfly/gift`。可重复添加，每照最多 20 张，第 21 张不进入草稿；内容继续使用既有系统 emoji，没有外部图片素材。
- 配文为单行、最多 30 个 Unicode 码点，去除 C0 与 DEL 控制字符，emoji 按码点计数。输入框的 UTF-16 `maxLength=60` 不代替码点规范化；IME 合成中不截断、不保存，`compositionend` 后规范化并恢复快门。
- 鼠标仅左键开始拖动，命中从最上层倒序查找并直接复用 `photoDecoration.stickerBox()`。中心坐标 clamp 到 0–1，允许靠边时贴纸部分出画面。滚轮缩放、双指中心平移和距离缩放共用 0.4–3 边界，`up/cancel/lostpointercapture` 收尾并释放指针。
- 画布获得焦点后，方向键每次移动 0.01，Shift 为 0.04，加减每次缩放 0.1，Delete/Backspace 拿下贴纸。原生滑块范围 0.4–3、步长 0.05，有限值统一 clamp。配文编辑中的这些按键不会操作贴纸或切换工具页。

独立复核曾发现公共 modal 的 capture Escape 会在输入法取消候选时关闭草稿。现由本模块在创建 modal 前注册 capture 监听，合成态配文 Escape 使用 `stopImmediatePropagation()` 阻止后续 modal 监听，保留原生默认动作，不调用 `preventDefault()`；普通 Escape 仍由公共 modal 关闭。监听随 AbortController 清理。新增检查的 modal 替身已对齐真实 capture handler 和同一 document 的监听顺序，不在替身中额外兜底 IME。

## API、缓存、保存与生命周期

保留 `Game.ui.photoEditor.open({photo?, onAlbum?, onSaved?})` 与 `close()`。返回相册、返回原相片和旧照保存成功均先同步关闭 handle，再在同一调用栈执行 `onAlbum/onSaved`，没有改成延后回调，也没有修改相册模块补偿。

新拍只提供整屋和已建房间，使用 `sys.photography.prepare({scope:'house'|'room', roomId?, fresh?})`；主动「更新取景」才传 `fresh:true`。按 scope/roomId 缓存底图，旧照通过异步 `base(id)` 展开并锁定原底图。换框、贴纸移动/缩放和配文仅经原 `photoDecoration.draw(target, base, decor)` 合成，按需单次 RAF，不重画世界、不增加预览 JPEG 编码或循环动画。准备/底图失败会撤掉旧画布和就绪状态，保留装饰与重试路径。

临时 decor 由既有 validator 复制。新拍调用 `capture({decor, scope, roomId?})`，旧照调用 `updateDecor(id, decor)`；旧照名字、底图 JPEG、相册数量和累计拍摄数保持。成功才触发相应成功音、快门闪光和拍照累计；减少动态偏好省去闪光。前台拍摄、12 张容量、距上次成功至少 1 秒的系统规则保持，编辑器另保留 1050ms 按钮锁。后台拒拍不自动关闭或清稿；编码/保存/下载失败保留草稿和重试，不伪造成功反馈。

`download(lastPhotoId)` 固定下载该照片已保存的底图与装饰，后来未保存的草稿不混入 PNG。运行态最近大底图可用于高清导出；刷新或换档清理后从持久小 JPEG 重建，不承诺永久高清。系统仍调用普通 `store.update`，没有新增 `persist:true`、同步 commit、同步落盘或拒写原子保证；替身拒写检查只证明所模拟失败分支的反馈和草稿行为。

`open` 终止旧 session。`close` 清理 AbortController 监听、RAF、timer、ResizeObserver、指针、缩略预览、底图和临时草稿，恢复隐藏 HUD；仅收起仍由本编辑器拥有的控件弹层。换档关闭编辑器并沿用系统最近图/节流清理。旧 base、下载与图片异步响应检查 closed/请求版本，不能污染新窗口或关闭其它模块。

## 实际执行的定向验证

以下命令在项目根目录下串行执行，全部通过；没有后台并行运行 Node 检查：

```sh
node --check js/ui/photo-editor.js
node tests/photo-editor-visual-ui.cjs
node tests/photography.cjs
node tests/album-storage.cjs
node tests/album-visual-ui.cjs
PHOTO_EDITOR_CANVAS_MODULE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas" node tests/photo-editor-visual-raster.cjs
```

| 检查 | 通过数量 | 证据边界 |
| --- | ---: | --- |
| 编辑器隔离 UI | 32 组 | 轻 DOM、模拟编码；涵盖内容/容量、Unicode/IME Escape、层选择、鼠标/双指/键盘/滑块、取景、草稿/下载、同步回调、失败与清理 |
| 基础摄影事务 | 13 组 | 模拟摄影与编码的规则分支 |
| 相册与图鉴存档边界 | 11 组 | 定向存档/大小边界检查 |
| 相册隔离 UI | 23 组 | 轻 DOM、模拟编码，确认既有相册合约 |
| 真实 Canvas / 摄影 PNG | 3 组 | 原绘制与摄影系统、人工底图、内存 store、真实 PNG 编码/解码及下载链 |

前四项共 79 组定向模拟/存档检查，加 3 组真实 Canvas，共 82 组；不是全量回归或 scene 整合通过。真实 Canvas 检查只加载 `js/data/photography.js`、`js/render/photo-decoration.js`、`js/systems/photography.js`，人工底图为 1280×960 和 960×1280，未初始化 scene，未读取真实账号或私人照片。内存 `store.update` 替身严格保持单参数调用。

`raster-report.json` 记录 2 次人工世界取景、2 次 JPEG 编码、3 次内存写入和 3 次下载。纯装饰绘制阶段 JPEG 编码增量为 0、存档增量为 0；capture 复用已 prepare 底图，updateDecor 不重画世界、不追加 JPEG 编码且保持名字/底图/累计。下载已保存横图与期望合成像素一致；换档模拟清理后从 480×360 持久 JPEG 重建；另有 960×1280 竖图 PNG 下载与后台拒拍证据。

## 离屏 PNG 与字形限制

机器记录：`/tmp/marshmallow-photo-editor-visual-v2-20261030/raster-report.json`。以下均为合成人工底图的离屏证据：

| PNG 绝对路径 | 尺寸 |
| --- | --- |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/frame-none.png` | 1280×960 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/frame-cream.png` | 1280×960 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/frame-strawberry.png` | 1280×960 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/frame-forest.png` | 1280×960 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/frame-ocean.png` | 1280×960 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/frame-starry.png` | 1280×960 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/frame-cloud.png` | 1280×960 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/frame-rainbow.png` | 1280×960 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/frame-polaroid.png` | 1280×960 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/nine-frames-sheet.png` | 1656×1430 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/portrait-20-stickers.png` | 960×1280 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/nine-frames-readable-caption-sheet.png` | 1656×1430 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/readable-caption-landscape.png` | 1280×960 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/readable-caption-portrait.png` | 960×1280 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/download-saved-landscape.png` | 1280×960 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/download-refreshed-small-jpeg.png` | 480×360 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/download-saved-portrait.png` | 960×1280 |
| `/tmp/marshmallow-photo-editor-visual-v2-20261030/mixed-caption-fallback-probe.png` | 1280×960 |

九框像素各异，20 种贴纸 emoji 图形目视正常；30 中文码点可读配文「阳光洒满小屋朋友围坐一起把今天这份快乐收进相片留作温暖的纪念」的横竖幅与九框对照已目视完整、比例正常。

原 `nine-frames-sheet.png`、`portrait-20-stickers.png` 及其对应混合配文图保留了问题：30 码点中文加 emoji 配文末尾的「🌷✨」在 NAPI Canvas 中显示缺字盒。额外注册字体别名后的 `mixed-caption-fallback-probe.png` 仍显示缺字盒，与原草莓框图 hash 相同；不能把注册成功、PNG 可解码或码点断言通过称为混合配文字形通过，也没有以修改产品绘制/字体回退来掩盖结果。系统 emoji 字形仍受验收机字体影响，浏览器实际回退需后续另验。

这些 PNG 不代表主场景摄影、桌面/390px DOM 布局、真实键盘/触屏或 HUD 行为；轻 DOM 输入检查也不替代真实设备操作。独立复核已确认源码修复、顶栏计数、层按钮稳定、手机 static、取景选择收缩和薄荷滑块覆盖，视觉结论同样限定于现有离屏输出。

## 网址状态与保留验收

只读复核现有 4173 服务：

```sh
curl -sS http://127.0.0.1:4173/ | rg -o 'r-[a-f0-9]{64}' | head -n 1
curl -sS -i http://127.0.0.1:4173/js/ui/photo-editor.js
shasum js/ui/photography.js
```

根页仍指向旧 release `r-383bb1dcf39ed44421f2e331428aa5a297e6a5c19a976793096f89e0049a7cc8`，编辑器根路径返回 `404 Not Found`。因此没有宣称网址已载入本轮资源；没有修改入口、切换快照或绕过发布机制来制造实页证据。正式桌面/390px 整页、真实 HUD/焦点/键盘/滚动/触屏、图片解码与浏览器配文 emoji 字形需在后续目标快照实际加载新资源后验收。

本轮没有运行全量或第一批 scene 整合，没有新建端口、服务或浏览器进程，没有访问真实账号/私人照片，没有生产发布或压缩包。样式 detector 曾给出多项 palette/type/radius advisory，其中包含既有 CSS；本报告不声称 detector clean，也未越界改共享设计规范。TODO 由总集维护，本交付报告线程未新增、移动或完成 TODO 项。

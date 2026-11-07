# 第八批：现有创意画板与画册

日期：2026-10-30。只升级已有像素创作UI；不新增绘画规则、上传、公开画册或联机编辑。原型入口为 `#creative`，正在按本交接校准；现有系统/data是权威，旧原型不作为错误数值的依据。

## 设计与入口

沿奶油纸、橄榄绿与软陶画架，画板是主视觉。桌面大画布与工具并列，390px先画布再工具，颜色可读且不靠横向溢出。区分画册、未保存草稿、已有作品编辑；持续显示作品数量、20字名字、透明棋盘、工具/颜色、选格和撤销状态。空画册不造假作品；Lv不足、没有画室、20幅满额、未保存与失败都有明确下一步。

`Game.ui.creative.open()`打开画册；`open({mode:'editor',id?})`新画或编辑。保留画室与回忆现有入口，不修改共享导航。保存后可查看装框效果、改名、下载、选择已建房间挂墙/墙纸；已挂作品显示定位入口。删除明确提醒会移走挂画及恢复引用墙纸底色，先确认再调用系统。

## 真实内容与输入

- `js/data/creative.js`的creativeConfig：16×16共256格；固定24色及paletteNames，palette来自balance.colors前24项。编码 `0123456789abcdefghijklmn` 对应24色，`.`为透明；白色不是橡皮。作品pixels严格256个 `[.0-9a-n]`。
- 画笔、橡皮、四邻填充。橡皮/清空回透明；连续拖画用Bresenham补线，一整笔一次历史。填充/清空各一次；50步撤销上限、新修改清redo、无变化不记历史。历史只留编辑器session。
- 鼠标/单指pointer capture，忽略第二指；up/cancel/lostcapture提交本笔。箭头选格、Space/Enter画格、B/E/F换工具、Delete/Backspace擦格、Ctrl/Meta+Z撤销、Shift+Z/Y重做，文本输入时不执行画布快捷键。
- 名字单行trim后1–20 Unicode码点、UTF-16最多40，无控制字符；IME合成过程不截断、不误提交或退出。不要沿用照片30字规则。
- `state.customArts`每项严格 `{id,name,pixels}`；ID为1–100个字母/数字/下划线/连字符且唯一。新保存生成ID，编辑传原ID原位更新，不新增副本。

## 解锁、草稿与保存

Lv.7且有studio画室才能新建/编辑/改名/挂墙/墙纸。最多20幅，满额仍能编辑已有ID；拆掉画室后旧作可查看、下载和删除，其余操作锁定。读取 `sys.creative.status/list/get`，不要从原型硬编码等级、列表或房间。

草稿按 `runtime.creativeDrafts.new` 和 `art:<id>` 分开保存name/pixels/cursor。**关闭保留本页未保存草稿，重开续画**；与照片关闭弃稿不同。历史关闭丢弃，刷新/换档清草稿；保存成功只清对应草稿。绘画/改名失败保留草稿和原作品，不显示成功。草稿、光标、历史、Canvas不进入JSON。

正式 `save/rename/remove/place/wallpaper` 已使用 **store.update(...,{persist:true})**。保留已有同步持久提交/拒写边界，不能弱化为普通store.update；失败不得改变作品、引用、统计或发成功事件。不改systems/core来适配UI。

## 展示、引用与下载

- `save({id?,name,pixels})/rename/remove/place/wallpaper/placement/download`均复用 `sys.creative`；列表/get为克隆。保存后才能用作品ID布置/下载。
- 挂画 `place(artId,roomId,x?,y?)` 默认为墙中央，全屋每作最多一件；`placement(id)`可定位。内部custom_art_frame为66×66，只注册家具索引，不进商品/库存/图鉴。收起或拆房不删除原画、不增加普通库存。
- `wallpaper(roomId,artId)`是ID引用，重复应用不刷统计。编辑同ID同步所有挂画/墙纸；删除清引用，墙纸恢复solid并保留color/color2，同时清旧装饰撤销状态。
- 挂墙/定位沿原focusPainting：关本窗口和面板、设现有runtime选择、camera.focusRoom、ui.selection。用既有item:placed/room:decorated/creative:changed，不新增共享事件或改目标模块。
- `download(id)`只下载已存作品，512×512透明PNG，无相框/网格/光标、像素不平滑。不下载当前未存草稿，不新增外部导入或共享上传。
- 沿 `draw.creative.drawPixels/drawFrame/tile/clearCache`；最多20个缓存16×16位图，作品/换档后清，按需RAF不加world循环。close清监听、RAF/Canvas与is-creating/HUD；换档关窗并清草稿、绘图缓存。旧异步不能污染新窗口。

## 文件分工与验收

仅 `js/ui/creative.js`、`css/creative.css`（已有加载位置，保持旧公共class兼容），独立 `tests/creative-visual-ui.cjs`、必要同前缀PNG检查、`docs/creative-visual-v2-20261030.md`。原型app/style由总集单独处理，开发者不改。

禁止data/core/systems/render、ui.js/公共CSS、scene、其他批次、入口/指纹/快照或共享README/TODO。第一批用户自行安排，不分配/消息/修改/验收。无真实账号/私人作品、发布生产、压缩包、新服务/端口/浏览器进程。

串行必要定向检查：新UI检查及现有 `tests/creative.cjs`；不跑全量或第一批scene。核透明/白色、补线整笔/50历史、填充/清空可撤销、快捷键/20码点IME、锁定/20满额仍编辑、分ID草稿重开/换档、拒写不变、删除确认引用清理、挂画定位/墙纸幂等/HUD/异步清理。

PNG可用独立内存作品与原draw.creative系统验证512×512透明alpha/24色，不读scene或私人作品。真实桌面/390px整页、手指和浏览器下载，待目标快照加载后另验；不得改入口或切release制造实页通过。原型的房间选择/关联图像仅示意，不把它当成真实场景挂墙验收。

## 原型交付与总集检查（2026-10-30）

`#creative`已改为默认空画册、主动打开画板，工具和元数据按真实16×16/24色/50历史/20幅/20字校准。草稿按new/原ID分别续画，已有作品保存不新增；已存作品才可下载或布置。Lv6、拆画室后2幅旧作、20幅满册为明确隔离审核样本。挂画与墙纸只演示房间选择、唯一挂画与同ID图像关联，不接入3D场景。

总集复用4173既有页完成1280×720和390×844检查：雪白落笔→橡皮透明→撤销回雪白；填充/撤销/重做及清空后撤销恢复；名字输入21码点截到20并保存；已有ID改画关闭、重开保留像素/光标而历史归0，再保存仍1幅。挂画示意全屋唯一，墙纸重复应用提示不新增；删除先取消保留1挂画/1墙纸，再确认回0幅。低等级拒新建、拆画室旧作仍可下载/删除而编辑/改名/布置禁用、满20仍可编辑均已点击核对。触屏拖画与真实IME候选操作未冒充实机通过。

首轮桌面页脚按钮被裁，已改工作台固定可用高度、主体收缩/工具独立滚动、页脚保持可见，隐藏桌面重复长说明。复验桌面386px方画布、保存按钮底654<720；390px方画布305px、单处主体滚动、保存底814<844，scrollTop初开0且无横向溢出。

证据：[桌面工作台](review/multifloor-20261030/creative.png)、[390px工作台](review/multifloor-20261030/mobile-creative.png)。透明PNG以原系统人工像素的真实512输出和逐像素检查为证据，见[色表](../tests/creative-visual-ui-export.png)；本轮未取得原型浏览器下载文件，不将Canvas截图当文件传输验收。

MC-058源码总集44组串行复跑及独立只读accept，见[第八批验收](../docs/creative-acceptance-v2-20261030.md)。正式目标快照/整页/HUD/焦点/实际场景引用和浏览器下载留MC-059，不修改第一批入口或擅自切release。

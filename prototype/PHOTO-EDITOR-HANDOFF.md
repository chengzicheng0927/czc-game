# 第七批：完整相机与照片装饰编辑器

日期：2026-10-30。第六批相册源码已通过验收并停止写入CSS，本批可顺序开发。原型从 `#album` 的取景/照片编辑进入；保留相册与回收夹，不新增分享、外部照片或玩法。

## 编辑器设计

延续奶油相纸与软陶相机，以照片预览为主，工具分为相框、贴纸、配文。桌面预览和工具并列；手机预览在前、工具纵排/标签切换，操作不遮住选中贴纸。显示0/20贴纸计数、选中项、缩放和拿下入口，区分未保存草稿、已保存照片与下载对象。

新拍显示整屋/已建房间及主动更新取景；旧照锁定原底图。快门/保存/下载有等待、失败和成功状态；纯净预览隐藏工具和选框，仍显示装饰。关闭不保存草稿，保存装饰只更新原照，照片名字与配文分开。

## 真实数据与输入

- 9个相框ID：`none/cream/strawberry/forest/ocean/starry/cloud/rainbow/polaroid`，即无框＋8款本地Canvas装饰，无价格或解锁。
- 20贴纸ID：`heart/star/rainbow/cloud/sun/moon/flower/leaf/strawberry/cake/ribbon/sparkles/rabbit/bear/fox/cat/penguin/unicorn/butterfly/gift`。系统emoji是既有贴纸内容，工具图标延续现有SVG/组件；不加载外部素材。
- decor严格为 `{frame,caption,stickers}`；配文0–30 Unicode码点、单行、无控制字符，保留中文输入法与emoji计数。
- 每照最多20张贴纸，可重复种类；每项严格 `{uid,stickerId,x,y,scale}`，uid为1–100个字母/数字/下划线/连字符且唯一。中心x/y在0–1，scale在0.4–3，均有限数字；中心靠边允许贴纸部分出画面。
- 命中使用 `photoDecoration.stickerBox()`：宽高为画布短边×0.13×scale，不另算一套。倒序命中最上层，保留左键拖动/pointer capture、滚轮及双指缩放/平移、up/cancel/lost capture收尾。
- 方向键每次0.01，Shift为0.04；加减缩放0.1，Delete/Backspace拿下；滑块0.4–3步0.05，统一clamp。文本编辑期间不得让快捷键操作贴纸或切页面。

## API、性能与保存

- 保留 `Game.ui.photoEditor.open({photo?,onAlbum?,onSaved?})` / `close()`。第六批依赖**先关闭handle、再在同一调用栈调用onAlbum/onSaved**的现有协议，不改成迟到异步回调，不修改相册模块补偿。
- 新拍复用 `sys.photography.prepare({scope:'house'|'room',roomId?,fresh?})`，fresh主动更新。系统另支持view，本批不新增前院独立取景、转岛或镜头玩法。
- 底图按scope/roomId缓存；旧照异步 `base(id)`。换框、拖贴纸、改配文只经 `photoDecoration.draw(target,base,decor)`合成缓存底图，不重画世界、不编码JPEG、不新增循环动画。
- 临时装饰由validator复制；新拍 `capture({decor,scope,roomId?})`，旧照 `updateDecor(id,decor)`。成功才快门音/闪光/照片累计；失败保留编辑器、草稿与重试。快门前台、未满12、距上次成功至少1秒；保留编辑器1050ms按钮锁。
- `download(lastPhotoId)`只下载该照片**已保存**的底图与装饰，不混入后来未保存的草稿。最近大底图仅运行态，刷新/旧照从持久小JPEG重建，不保证永久高清。
- 系统仍普通store.update，本批不改规则、不加persist:true/同步commit或扩大拒写原子保证。
- open关闭旧session；close清AbortController监听、RAF/timer、ResizeObserver、指针、预览缓存/draft并恢复隐藏HUD。旧base/download/图片响应验证closed。换档关闭，系统清最新图和节流；不关闭其它模块窗口。
- 当前无后台自动关闭或清稿规则，绘制仅按需单次RAF。后台只由capture拒拍，不新增自动关稿、自动快门或自动保存。准备失败、无房间、底图失败、满册、保存失败不能显示旧底图已就绪。

## 文件分工

仅 `js/ui/photo-editor.js`；`css/photography.css` 的编辑器专属作用域（建议新增v2祖先类）；独立 `tests/photo-editor-visual-ui.cjs`，必要同前缀绘制检查；`docs/photo-editor-visual-v2-20261030.md` 报告。

第六批相册/详情/改名等 `.photography-album-v2` 样式保持；拆开混合选择器，不连带改变相册。禁止改 `js/ui/photography.js`、prototype、共享文档/UI/CSS、data/core/systems/render、scene、入口/指纹/快照或第一至六批其他产品文件。共享文档由总集更新。无生产部署、真实账号/私人照片、压缩包、新服务/端口/浏览器进程。

## 定向验收

新UI检查覆盖9框/20种/第21张拒绝、输入和IME、鼠标/双指/键盘、更新取景次数、关闭草稿不入档、旧照保存不加统计、失败不关闭/不成功音、满册/后台拒拍、关闭/换档/旧异步/HUD和回调合约。串行跑新检查及摄影/相册存档，不跑第一批scene整合或全量。

真实PNG隔离证据可用人工1280×960 Canvas底图＋合成照片＋内存存储，只加载现有摄影data、photo-decoration、photography系统与编辑器，不读取scene或用户照片。导出九框、20贴纸、30码点配文及横竖比例对照；明确为合成底图的编辑/PNG证据，不冒充主场景摄影或真实触屏。当前4173仍旧快照时保留正式桌面/390px、真实HUD/键盘/滚动/设备验收，不改入口或切发布绕过。

## 原型与源码交付检查（2026-10-30）

独立原型从相册「打开照片工作台」进入新拍草稿，整屋/房间取景后先装饰再拍；旧照「编辑照片」保持原底图与ID。九框、20种贴纸、20上限、层选择、纯净预览、30码点配文和已保存合成预览已接入。原型状态仅本页内存，房屋底图是原型示意，不读正式照片。

总集复用4173既有浏览器页完成1280×720与390×844检查：新拍取消仍0张；草莓框＋贴纸拍下一刻后为1张/1次累计；保存旧照不新增，名称与配文分离；方向键移动0.01、Shift移动0.04；纯净预览保留装饰，返回相册再编辑可继续。混合配文30码点末尾🌷✨在浏览器Canvas预览中可读。手机无横向溢出。初开编辑器继承滚动导致标题/关闭被裁的问题已修正，两种入口复验scrollTop=0、关闭按钮可见；后续用户滚动不被持续重置。拍摄后相册状态说明已改为已收进相册，不再显示尚未新增。

证据：[桌面工作台](review/multifloor-20261030/photo-editor.png)、[390px工作台](review/multifloor-20261030/mobile-photo-editor.png)、[浏览器混合配文预览截图](review/multifloor-20261030/browser-photo-editor-preview.png)。浏览器下载事件捕获超时，未取得原型实际下载PNG；截图不冒充PNG文件或主场景摄影。真实手势和加减物理按键不混算为已实机通过。

MC-056源码已总集68组串行复跑、独立只读复核accept，见[第七批验收](../docs/photo-editor-acceptance-v2-20261030.md)。正式目标快照、新资源桌面/390px整页、真实HUD/输入和浏览器PNG下载/字形留MC-057；不修改第一批入口或擅自切发布。

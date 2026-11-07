# MC-079 阁楼布置 UI 交接

日期：2026-10-30。状态：四份产品源码已冻结。范围：独立阁楼的装扮入口、真实库存、墙地与选中工具；保留原观星流程。仅做源码实现与语法检查，不表示正式网址、3D 命中或视觉验收完成。

## 文件窗口

产品仅修改 `js/ui/ui.js`、`css/shell.css`、`js/ui/observatory.js`、`css/observatory.css`；新增 `tests/attic-decor-ui.cjs` 和本报告。index、数据、core、systems、renderer、其他功能页及 TODO 均未改；未启动服务、浏览器或规则检查，未生成、激活或发布快照，未读取真实账号或私人存档。

## 真实空间与入口

- 装饰专用 `decorRoom` / `decorRooms` 委托 `G.store.decorRoom(state,id)` / `G.store.decorRooms(state)`。固定阁楼标识来自 `G.store.atticRoomId`，不向 `house.rooms`、普通 floors 或居民床位加入阁楼。
- 普通 `rooms()` 与 `activeRoom()` 保持原义，仅供建房、换用途、拆房、普通 roomMenu、居民卧室与教学；新增 `activeDecorRoom()` 供装扮、原房商店快照和加工成品摆放。
- 观星面板只在已建且真实阁楼 room 存在时显示“布置阁楼 · 家具、墙纸与地板”（`observatory-decor`）。原建造/观星按钮仍是 `observatory-action`，仍调用原系统；不因进入或布置自动观测、购买、赠送或保存家具。
- 阁楼装扮顶部显示“星空天文台（独立阁楼）”，装饰换房选择器包含已建阁楼；正文保留明显的“去观星 · 星空天文台”（`decor-observatory`），在家具、墙纸、地板页都可达。
- `scene:room` 收到固定阁楼 ID 时，已建进入阁楼装扮，未建进入原观星/建造面板，提前返回，不经过普通房星级、拆除、换用途、布局或居民菜单。
- 建房总览中的旧 18 级文字改为读取 `observatoryConfig.unlockLv` / `price`；观星入口也读取真实 data。当前真实值为 Lv17 / 1000 糖果，未建状态不创建装饰空间。

## 摆放、墙地与相机

- 选背包和原生拖放继续只调用 `G.render.beginPlacement(defId,roomId)`，以返回的 `{ok,message}` 决定后续；阁楼使用真实固定 ID，不用 activeRoom 绕过 ray/规则，也不在 UI 假装 place 成功。失败保留面板，成功才收起，取消、换件和手机单次回场景流程沿用最新 P1。
- `focusDecorRoom()` 统一用于显式进入、装饰换房及商店返回：阁楼设 `floor:'attic',view:'cutaway',previewFourFloors:false` 后 `focusObservatory()`；普通房由真实 floors 找到所在层后设该层剖面，再 `focusRoom(id)`。避免标题已换普通房而 renderer 仍隐藏普通房。
- 观星面板从普通房或回忆菜单进入时，同步选择真实阁楼空间及阁楼剖面；再打开公共装扮入口也保持对应阁楼。不能只移动相机却留下普通楼层或外观壳体。
- 墙纸/地板读取真实装饰空间，提交仍走原 `sys.decorating.wallpaper/floor`；没有 UI 存档写入旁路。选中家具与 depth 更新也从装饰空间按真实 UID 读取，收起、翻转、层次、换色沿原系统。
- 商店“已拥有”数量包含背包、普通房、阁楼与前院；原房/主题/分类/搜索/页码快照接受阁楼，返回前仍核对空间存在及档案代次，不自动购买。
- 手机固定取消栏的位置、莓红/奶油白换件按钮、浅底深字取消按钮、14px 按钮、13px 状态及 44px 目标均保持。新增阁楼说明和入口仅作局部排布，无全局宽度或 dock 调整。

## 换档与拒写

保留既有业务按钮、下拉、搜索与拖放的 archiveEpoch 门禁。新增观星布置按钮沿用 owns(session)/busy/档案代次检查；观星 entry 也捕获代次。旧阁楼 depth/换色 change 在同 ID 换档后不再提交。depth/换色无论成功或拒写，控件回读当前已保存家具值，失败仍显示系统失败反馈，不伪造成功值。

房间选择器的回焦、观星镜头 RAF 和面板标题 RAF 检查代次、当前面板及可见性，迟到回调不接管新档或已离开的面板。实际持久提交、同步重入拒绝与 undo 栈仍由已冻结的 store/systems 实现，UI 不扩大普通房保存保证。

## 验证与整合边界

产品先冻结，检查脚本单独交总集串行执行。`node --check js/ui/ui.js`、`node --check js/ui/observatory.js`、`node --check tests/attic-decor-ui.cjs` 均通过。本会话没有运行规则或行为测试。独立只读源码复核发现的“阁楼返回普通房仍保留 attic 视图”和“普通房进入观星只移动相机”两处问题已修复，最终复核未再发现确定 P1；这不替代执行检查。

新增检查共14组：未建等级/糖果与真实建造、建造拒写、布置入口/普通房→观星→公共装扮、场景分流与原观星记录、装饰换房/普通建房和居民床位隔离、真实库存与拥有量、begin失败/成功及取消换件、墙地真实事务、选中 UID 深度一次提交、墙地拒写与重试、深度/色彩拒写回显与重试、收起/撤销与持久拒写恢复、阁楼和普通房的商店返回、同 ID 换档的旧业务 DOM 失效（含旧墙纸和旧地板提交）。使用合成存档与轻 DOM，不访问本机真实存档；renderer 由接口记录替身承担，不能证明 3D 所见与命中一致。

总集必要检查命令：

```text
node tests/attic-decor-ui.cjs
node tests/visual-shell-decor-flow.cjs
node tests/visual-shell-decor.cjs
node tests/visual-shell-navigation.cjs
node tests/observatory-visual-ui.cjs
```

renderer 独立阁楼、固定望远镜命中、真实落点、Canvas 降级及摄影由 A 的窗口接线；index 指纹与实际 4173 更新由总集处理。另只读发现 `js/render/scene.js` 原预览文字仍有 `Lv.18`，需 renderer 窗口改为真实 data 等级，本窗口未改。画板和摄影自己的空间 picker 不在本轮文件窗口，不能据本报告宣称这些专用入口已覆盖阁楼。

后续实际验收仍需桌面和手机：已建观星→布置→选真实库存→命中放置/取消→选中 UID 工具→墙地拒写与重试→原主题去店返回阁楼→去观星；未建应保持原门禁。不要以本批语法检查或内存 DOM 脚本代替正式整页验收。

## 冻结校验值

```text
72a7fa85f4a15cd47e7022efbeaf6d61a60bbf640a46bdd46607890ff726dbc7  js/ui/ui.js
887706439c494bb004dc4188ba69e8599a145ad08a43bc306513745838baaa20  css/shell.css
85f916f1dfbe6f40f640af49eba7b21daf2c0b520346054560e9df3c69ad3c23  js/ui/observatory.js
81578dd925c8656758f6cfb22c0381bb7c1b9e3975b59dbe155d356a53204de3  css/observatory.css
7cf9981fc40cc3aebc487084c171f304d63041d3530c12fc1c8d794100b23f69  tests/attic-decor-ui.cjs
```

index、TODO、README、AGENTS 与发布资源清单由总集维护，本轮未改。

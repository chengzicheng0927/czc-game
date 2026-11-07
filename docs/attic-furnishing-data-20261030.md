# MC-079 阁楼数据与规则隔离实现交接

日期：2026-10-30。状态：本批10份数据/规则产品文件已在隔离副本完成并冻结，等待总集复核、串行规则检查和选取集成。**未接UI或renderer，不表示阁楼完整功能或视觉已交付。**

## 隔离范围与验证边界

- 实现目录：项目根目录下的 `.impeccable/work/attic-data-yx7nhk`，总集说明其公开程序基线为c256。
- 产品修改全部留在该隔离目录；没有复制回主项目，没有修改UI、scene、world3d、index或shell。
- 主项目仅新增本报告；TODO、AGENTS、README由总集维护，本会话未改。
- 未读取或操作真实账号、私人存档、相片、画作或`.server-data`内容；未创建服务、端口、浏览器、快照、压缩包或部署。
- 10份产品与2份阁楼检查脚本的`node --check`均无语法错误；**未运行任何规则检查**。独立只读交叉复核只证明本批源码与约定一致，不替代功能、拒写或视觉验证。

## 冻结的相对文件清单

| 文件 | 本批变化 |
| --- | --- |
| `js/data/observatory.js` | 新增`observatoryAtticConfig`，集中固定空间ID、默认墙纸/地板/灯光；不改等级、价格、日期或碎片数。 |
| `js/core/store.js` | 独立`attic.room`兼容迁移与严格校验；空间访问器；共享UID、作品唯一、局部parent、总家具上限和collection历史回填。 |
| `js/systems/observatory.js` | build只追加空room初始化；observe原逻辑保持。 |
| `js/systems/systems.js` | 装饰访问器、跨阁楼父子移动/库存差值撤销；涉及阁楼才`persist:true`；拒写明确返回失败，成功才压/弹undo及发成功事件；保存中装饰重入拒绝。 |
| `js/systems/yard.js` | 全局已摆家具数量含阁楼；院子原提交方式保持。 |
| `js/systems/creative.js` | 全空间挂画唯一/位置、挂画与自制墙纸、删除清引用及选中状态；保留普通studio资格和原持久事务。 |
| `js/systems/collection-book.js` | 实际持有数量包含阁楼家具。 |
| `js/systems/photography.js` | framing接受真实已建阁楼ID；尚未接实际captureScene取景。 |
| `js/core/save.js` | MD补阁楼布置、UID/承托/depth；全屋画作引用次数含阁楼，原观星段保留。 |
| `js/core/public-house.js` | 保留`house.attic:boolean`，新增可选`house.atticRoom`视觉白名单；新旧快照materialize统一验证并剔除视觉中转字段。 |

测试文件：`tests/attic-furnishing.cjs`与新`tests/attic-furnishing-references.cjs`。未修改任何原有规则测试。

## 对后续UI与renderer的固定契约

`G.store`新增：

```text
atticRoomId === 'attic:observatory'
decorRoom(state, id) -> 已存在空间对象，或null
decorRooms(state) -> 普通已建房间＋已建阁楼的[id, room][]
replaceDecorRoom(state, id, room) -> boolean，只替换已存在空间
newAtticRoom() -> 独立的新空room对象
```

所有接口使用传入state；事务内必须用草稿，不能回读旧`G.state`对象。普通ID需合法且为字典own属性；冒号ID不会与普通存档roomId相撞。旧夹具未载观星data时，store保留等价合法空房默认值，不新增脚本依赖。

新阁楼持久形状：`{type:'observatory',paidPrice:1000,builtAt,room:{wallpaper,floor,light,items}}`。恰为合法旧三字段时，在校验克隆上补空；新room显式null、残缺/未知字段均拒绝。新阁楼家具的defId也须合法字符串，避免数组隐式转换为字典键。普通房间原兼容范围未收紧。

普通`house.rooms/floors`、房型评分/建房/换位、居民、工坊/花园资格、主线普通房/主题指标保持原范围。迁移和建造不调用家具place，不赠家具，不创建新首次奖励标志或清领取凭据。真实摆放沿原每defId一次首次经验与itemsPlaced；移动不刷统计，undo继续仅还原空间和库存差值。

涉及阁楼的place/move/remove/flip/recolor/layer/墙地/undo使用既有持久事务；保存失败不发布新内存状态、不消费库存、不压/弹undo或发成功事件。普通空间独立装饰仍沿原自动保存保证，未宣称磁盘失败回滚。观星仍是原Lv17/1000建造、本地日期/夜晚/回拨/3碎片及persist事务。

## 导出、公开与引用

- 普通＋阁楼＋院子共享总家具上限；室内parent只在同空间解析，父子跨空间移动保留UID。
- 自制挂画全空间唯一；删除作品在同一次原有`persist:true`提交清普通/阁楼挂画和墙纸，成功后清undo与无效选中。阁楼不冒充studio。
- JSON/离线/云恢复仍走现有store/save路径；无第二存档键、无server或offline算法修改。
- MD保留观星段并列真实阁楼家具和引用次数。
- 公开快照仅新增wallpaper/floor/light/items及实际引用的`{id,pixels}`；不公开阁楼建造时间/价格、观星凭据、库存、照片、账号或私人画作名。未建＋atticRoom拒绝；旧true无room补空，旧false保持null。
- 本批只保证新读者接受旧快照；旧严格读者不理解新字段。总集集成时须一起更新data/store和公开解析资源，并按标准兼容契约处理，不能单独复制其中少数文件后发布。

## 新检查覆盖与未验项

主检查13组，涵盖旧档/严格错误、真实starter库存/UID/承托跨空间、后买物保留/送礼拒undo、真实1000总容量、普通奖励与领取凭据、7种持久拒写动作、写租约、同步事件重入、恢复先落盘与观星保留。引用检查5组，涵盖studio资格/作品唯一、删除引用拒写与undo、MD、公开兼容/隐私、摄影framing参数转交。

摄影末项只记录传给渲染接口的参数，不验证像素、视角或正确比例。无UI或scene的夹具也不能证明houseView、拖动、相机、命中及全部运行态清理。实际阁楼布置、固定望远镜观测点、墙地呈现、3D/Canvas降级与取景，仍需总集后续顺序分配UI和renderer窗口。

总集串行建议先执行：

```text
node tests/attic-furnishing.cjs
node tests/attic-furnishing-references.cjs
node tests/observatory.cjs
node tests/save-restore.cjs
node tests/creative.cjs
node tests/photography.cjs
node tests/public-house.cjs
node tests/room-depth.cjs
node tests/yard.cjs
node tests/collection-book.cjs
node tests/room-layout.cjs
node tests/cloud-core.cjs
node tests/offline.cjs
```

以上命令本会话均未执行。server验证器由现有发布清单加载全部data/store，未改其源码；总集生成新契约后还需核对真实发布边界。完成规则复核不等于完整功能完成；正式4173接线、浏览器和快照由总集统一操作。

## 冻结校验值

```text
01e02d3fec1666fc5473e261e62545056753529b5b9dd0008f80acd69a5e1c26  js/data/observatory.js
d3e14991246e5b8407ef4ac3849e00aa1c3b03f4ea154515845c133c6a0d9283  js/core/store.js
d91473bc80ef2db1a5672c931783a4929568f337bd63cb7a676abda94ca8c114  js/systems/observatory.js
6d579baa3dcc67b5f71b9873e77c00b8f3b936d5fe1e2b449ec7b5d9aed2f4fa  js/systems/systems.js
3fb322a62e83dae1a81074401a66c34f1d6e9a858911d1318766b79102b5af55  js/systems/yard.js
5ea32995b4d54ea18691040eb3ade89b32572f0bc6ded807918caa6907bb08cc  js/systems/creative.js
d687cdac430a07125a1f6b83bc8dc3e340727b78cf6e30ac642124a6724b06e4  js/systems/collection-book.js
5767fbcceb5d7955c19df012a30a50993ae9d8c6d507649838dfac9707db1c2d  js/systems/photography.js
a197e58384bfaa6d3e1590c4828f57a4c2dc2bdd171e346a561b6d0988bbd560  js/core/save.js
4501ac70611bc0388b8c873f1cf2c5ca397d090d65e41030fac7dacb0a231f45  js/core/public-house.js
4fb50565c11d80da480b8492adfd9a7e684a460efdf2cdbbede183022cd21a73  tests/attic-furnishing.cjs
c9df7ce638e62356ea28f77ef1e8d16bd3caa48c930f6431caf579d6c602458b  tests/attic-furnishing-references.cjs
```

本批停止写入产品和检查文件，等待总集复核反馈或下一窗口；不需要用户再次授权。

# 阁楼画作布置与摄影空间接线

日期：2026-10-30。状态：两份UI产品源码已完成并冻结，等待总集串行检查与实际页面整合。本批不表示阁楼完整视觉或实际取景已通过。

总集已说明MC-079的十份数据/规则文件完成选取集成，基线新18与既有118组由总集通过；本批只消费该基线的公开空间接口。最初白名单为creative/photography UI，经定位真实取景控件后，用户及总集明确追加允许photo-editor.js的空间选择窄修。observatory.js及其CSS已释放给B，本会话没有争写。

## 最终文件与准确增量

| 文件 | 本批变化 |
| --- | --- |
| `js/ui/creative.js` | roomChoices改为`G.store.decorRooms(G.state)`；已建阁楼以独立空间标签出现，普通房型与楼层/位置标签保留。详情选房控件新增稳定焦点键`creative-room`。定位前核当前详情窗口、作品、`decorRoom`和当前挂画UID/作品引用或墙纸引用；“看看墙上这幅”点击时重取真实placement。只有提交成功且旧窗口仍有效才定位，使用实际楼层或`floor:'attic'`剖面，再调用公开camera.focusRoom。换档代次拦截关闭、面板、视角事件中的迟到定位。 |
| `js/ui/photo-editor.js` | roomOptions改为`G.store.decorRooms(G.state)`并标识已建阁楼；旧照编辑不枚举新取景空间。新增当前空间存在检查，选择/更新取景/新照拍摄前均以`decorRoom`重核；失效就清失效底图并说明，不改为整屋、不丢配文和贴纸。prepare返回后补closed守卫；原关闭/换档/异步底图代次及保存回调顺序保留。 |
| `tests/attic-pages-ui.cjs` | 新增14组真实数据/规则/UI的内存合约检查；DOM、Canvas、图像编码和渲染边界使用合成替身，检查范围与限制见下文。 |
| 本报告 | 接线、边界、文件清单与交接命令。 |

没有修改`js/ui/photography.js`或任何CSS；相册包装器继续按原协议交给编辑器。没有修改renderer、core、data、systems、index、共享UI、观星、花园、加工、公开快照或总集TODO。没有新资源脚本依赖；本轮产品指纹仅需更新上述两份UI脚本。

## 空间与动作契约

统一消费已集成的`G.store`接口：

```text
atticRoomId === 'attic:observatory'             // 字符串常量
decorRooms(state) -> [id, room][]               // 普通已建空间＋真实已建阁楼
decorRoom(state, id) -> room | null
```

两个空间选择器都把阁楼显示为“阁楼天文台 · 独立阁楼”。不向`house.rooms`或普通楼层slots添加阁楼，不构造虚假第四/第五层。未建阁楼没有可选项；只有阁楼而无普通房时，摄影仍可将真实阁楼作为指定空间。

画作资格仍由原`G.sys.creative.status()`判定，需要真实普通studio；阁楼不提供画室资格。挂墙、全空间挂画唯一、墙纸、库存、统计、保存与拒写仍调用原`place/wallpaper/placement/get`系统，不在UI重写业务规则。

挂墙/墙纸成功后，UI仅在当前作品与目标空间仍存在时关闭详情并定位。挂画还核当前placement、UID、frameId与artId，墙纸核当前custom/artId；无效位置提示重新打开详情，不假装定位成功。当前挂画已移动时，“看看墙上这幅”使用新的真实位置。失败/拒写保留详情，不改镜头或运行态选中。

定位交给A/B现有公开接口：

```text
runtime.activeRoomId = 实际普通roomId | 'attic:observatory'
runtime.selected = 挂画的 {roomId, uid} | null
render.setHouseView({floor: 实际普通楼层 | 'attic', view:'cutaway', previewFourFloors:false})
render.camera.focusRoom(roomId)
ui.selection()
```

`setHouseView`沿兼容方式在存在时调用；camera和实际阁楼几何由A负责，选中/布置外壳由B消费。UI层没有新建相机或绕开真实命中。

摄影沿原framing协议：

```text
sys.photography.prepare({scope:'room', roomId:'attic:observatory', fresh})
sys.photography.capture({scope:'room', roomId:'attic:observatory', decor})
```

没有新增scope值或相册容量。默认仍整屋；选中阁楼只改变运行态取景目标。摄影控件保留“取景”“选择房间”，增加`data-ui-focus=photo-framing-scope/photo-framing-room`及`data-photo-scope=scope`、`data-photo-room=room`。目标必须既是本窗真实可选空间，又在调用前仍由decorRoom返回；失效时不调用captureScene冒充整屋，拍摄按钮随失效底图禁用。旧照片仍走原`base(id)/updateDecor(id,decor)`，没有重新拍摄阁楼或替换旧底图。

## 状态与兼容边界

- creative原草稿、画册、改名/删除、保存/PNG及普通studio资格保持；state:replace仍关闭旧窗并清草稿，本批只加定位代次。
- 摄影原配文、贴纸、相框、已存PNG、12张容量、HUD、IME/焦点、AbortController、RAF/timer/ResizeObserver和异步baseRequest门禁保持。先close再在同一调用栈调用onAlbum/onSaved的协议没有改变。
- 共享选择控件只增加可选真实空间及焦点标记；没有改公共弹层、尺寸、输入协议或组件设计。
- 两份UI依赖MC-079已集成的decorRoom/decorRooms；应随总集同一兼容资源集发布，不能把新UI单独放到旧store上。

## 检查与未验

新检查使用真实data/store/save/systems与两个UI，存储为内存Map；真实save事务保留，并提供拒写场景。Canvas、Image/编码、captureScene及相机是明确的边界替身，不读取私人存档、照片或画作，也不加载主场景。

覆盖目标：有/无阁楼的真实下拉选项、普通空间标签与画室资格、真实挂画/墙纸/唯一引用及定位、持久拒写不写状态或跳镜头、旧按钮关闭/换档失效、摄影阁楼参数与普通取景、已选目标消失、旧照保留底图及旧控件/迟到结果保护。实际分组以冻结的新检查脚本为准。

两份产品与新检查共3份JS的`node --check`均通过；产品和检查文件全部停止写入。独立只读交叉复核未发现本轮摄影接线的实质回归，该阅读结论不替代执行验证。没有执行规则/UI检查、浏览器、服务、快照或生产操作。总集必要串行命令：

```text
node tests/attic-pages-ui.cjs
node tests/creative-visual-ui.cjs
node tests/photo-editor-visual-ui.cjs
```

系统基线已由总集完成的136组不在本会话重复运行。上述检查命令也未由本会话执行，不可记作通过。真实阁楼画作/墙纸呈现、近看定位、摄影像素/比例、桌面与窄屏、输入/滚动及整套可用性，均留总集使用新资源实页验收；当前fd64网址未由本会话更新。TODO没有新增、移动、完成或重排。

冻结产品SHA-256，仅供总集核对本轮选取资源：

```text
129e98427e6ebabb0f7f2f07f88473e484ea2283dc8ef44328bc03f2853937b6  js/ui/creative.js
441de2542cf1f83c182eb108334241bde1f336600c13819e9019c0e6685e28eb  js/ui/photo-editor.js
```

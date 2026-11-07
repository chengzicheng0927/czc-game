# 实时串门与同屋聊天合同

2026-10-29用户追加授权：小朋友互相串门、看到彼此走动并聊天。本轮已实现并部署，65脚本732组串行检查、真实Chrome与独立HTTP客户端互通，以及正式HTTPS双账号移动/聊天、重启重加和请离验收通过。沿用公开快照和独立参观页，私人进度不参与实时共享。详细证据见[验证记录](verification.md)与[部署维护](runbook/deployment.md)。

## 产品范围

未登录仍可玩自己的小屋和只读参观。普通公开参观页由用户填写展示昵称并「加入串门」；主人从本人公开状态的「在我家一起玩」进入同一页面。本轮在线邻居增加明确「去串门聊天」入口，以精确`#join`在可见且已认证的参观页尝试加入一次；游客不保留待执行意图，满员或过期状态只提供普通参观。所有在线人物来自当前参与者；公开快照的静态主人在加入后隐藏。房间选择仅改变查看范围，点击地面或键盘移动自己，其他人物平滑跟随；房屋家具仍只读。每屋最多8人，一个账号同时仅一处在线。

同屋文字聊天与快捷短句，1–80字、纯文字、发送限频；只读取加入后消息，服务器内存保留最多32条，不写SQLite或日志。无私信、音视频或文件。可在当前串门期间本机屏蔽某人，主人可请离某成员并在本次房间生命周期阻止其重新加入。手动加入的展示昵称主动填写，默认「小小建筑师」；快捷加入取当前已公开的串门称呼，其次本人公开小屋昵称，最后通用称呼，不自动公开登录名/账号昵称。

## HTTP合同

同源`basePath/api/v1`，协议1/build门禁/no-store保持。零外部依赖，以最长8秒长轮询，在事件发生时立即返回；无新端口或代理协议。所有`/live/*`只读/写独立内存状态，不调用私档prepare、租约或localStorage。所有POST仍严格Origin与CSRF。

- `GET /live/me` → `{authenticated:false}`或`{authenticated:true,liveKey,csrfToken,joinDisplayName}`。liveKey与CSRF绑定当前Cookie，仅存在调用页内存，不包含账号标识。`joinDisplayName`仅取当前认证本人正在使用的公开称呼、本人publications.display_name、最后「小小建筑师」；查询不续期成员、不枚举其他账号。
- 此后GET/POST均要求当前有效Cookie和`X-MC-Live: liveKey`，POST另带`X-CSRF-Token`。异步body读完和长轮询返回前复核，防止切换Cookie后迟到请求作用于另一孩子。
- `POST /live/join` body`{houseId,displayName}` → `{peerId,revision,houseVersion,house:{id,title},peers,messages:[]}`。houseVersion为当前公开小屋版本的64位十六进制摘要。houseId为已公开UUID；形象由服务器从本人已验证云档的avatar白名单产生，无私档则可信默认形象。成员摘要`{id,displayName,avatar,isHost,zone,x,y,updatedAt}`，zone=`yard`或公开快照实际房间ID，x/y为0–1归一化地面坐标。
- `GET /live/poll?houseId=UUID&after=N` → `{revision,houseVersion,peers,messages}`，全量有界成员、仅加入后的最近32条消息。消息`{id,seq,peerId,displayName,text,at}`，seq用于去重，id为客户端随机幂等ID。一个成员最多一个等待请求。
- `POST /live/move` body`{houseId,seq,zone,x,y}`，seq为递增正整数，位置有限且在有效地面范围；返回`{ok:true}`，更新触发轮询。最多5次/秒，画面插值仅运行态。
- `POST /live/chat` body`{houseId,clientMessageId,text}` → `{ok:true}`；同一消息ID幂等，拒绝控制符/非法文本，最多每秒1条及有限突发。服务器提供成员ID/昵称，不接受sender伪造。
- `POST /live/leave` body`{houseId}` → `{ok:true}`；主动离开幂等。
- `POST /live/kick` body`{houseId,peerId}` → `{ok:true}`，仅屋主成员可请离别人，不允许请离自己。

成员TTL35秒，以有效轮询/动作续期，离页尽力leave，TTL最终清理；最多64屋/256成员，单账号跨房间/标签后加入替换先前成员，旧请求不能控制新成员。加入响应返回peerId，后续move/chat/leave/kick/poll须另带`X-MC-Peer`绑定当前加入，防止旧标签退出新标签。被替换/被请离/超时返回409，不自动偷偷重加入。撤下公开小屋立即关闭对应联机房间。更新公开快照（含主人保存新布置后服务端自动跟随）不再解散房间：成员、聊天与请离名单都保留，所在房间已被拆掉的人回到前院，等待中的轮询立即醒来并带回新的houseVersion，访客页据此重新读取公开快照，不踢人也不必重新加入；退出登录、会话过期、epoch变化移除相关成员。服务器关闭先释放等待，再关闭HTTP/数据库。进程重启不会保留在线或聊天，客户端明确提示重新加入。

## 客户端职责与分工

- 后端：`server/live-hub.cjs`、cloud-api接入、cli停止钩子，专用无监听测试。数据库schema不变。
- 客户端：`js/core/live.js`独立同源请求/内存凭据/状态机和generation隔离；`js/ui/live-room.js`+`css/live-room.css`稳定DOM加入/成员/聊天/屏蔽/请离组件，专用测试。接口见下。
- 画面：`js/render/live-avatars.js`纯几何/插值/30fps绘制；visit.js与visit.css接入点击目的地和观察区，不触碰主人存档/规则/租约，专用测试。
- 主线程：scene.captureScene局部hidePlayer选项、neighbor入口、加载顺序/指纹、文档、全量串行测试、实际多标签/HTTP/生产验证。

`Game.live`接口：`status()`返回复制快照`{phase,authenticated,houseId,peerId,revision,peers,messages,error}`；`subscribe(fn)`返回unsubscribe；`probe()`、`join(houseId,displayName)`、`quickJoin(houseId)`、`move(zone,x,y)`、`chat(text)`、`kick(peerId)`、`leave()`、`destroy()`。phase=`idle|joining|connected|reconnecting|left|error`。快捷加入复用join的fresh `/me`身份确认，用同一次Cookie握手中的凭据与`joinDisplayName`，不沿用旧probe称呼；未知/非法称呼回退通用称呼。403、满员或网络失败不自动重试加入。同一poll在途，请求有timeout/abort，generation拒绝跨屋/跨账号迟到结果；网络故障有限退避，不重发聊天。隐藏页停止poll/移动，返回后由原peer轮询验证，过期须主动重加。pagehide尽力leave，destroy释放计时/监听。

`Game.ui.liveRoom.mount(container,{houseId,onState,onMove,quickJoin})` → `{destroy()}`。自行probe，只有`quickJoin:true`且认证成功、文档可见时尝试一次快捷加入；加入后onState收到status。visit仅在快照加载成功后消费精确`#join`并传此标志，保留路径/查询；普通参观、未知片段、失败、退出、刷新或BFCache返回不自动加入。onMove用于可访问的键盘/地面方向控制可选，主要地面点击由visit调用live.move。UI纯textContent，保留输入焦点和草稿，不泄露凭据；进入访客页不依赖G.ui.init。

`Game.liveAvatars`由画面任务与visit内部协调，无需改main。共享G.draw.avatar真实服装；背景capture`hidePlayer:true`只在connected/reconnecting时使用，离开恢复原快照。公开房间/前院标准坐标换算与捕获裁剪保持一致。减少动态或后台不跑动画；输出写Canvas/运行态，不写G.state。所有测试由主线程统一串行运行，子任务只写测试、不执行Node或打开浏览器。

MC-041在线邻居扩展已实现并部署，66脚本758组串行检查通过。公开`GET /neighbors/online`只汇总当前主动加入的称呼、人数与屋主在场状态，先清理失效成员且不续期，不返回账号/peerId/位置/聊天；列表仅打开且可见时每10秒刷新。正式HTTPS全部126文件hash、在线人数1→2→1（屋主离开）→0、公开称呼/快捷称呼和同屋聊天通过；重启清空在线、旧peer409、会话/公开快照/私人修订/hash保留及主动重加已验，原8张表内容和schema保持，两个验收账号已清理。私人存档接口及旧公开分页合同保持，完整边界见[在线邻居合同](online-neighbors.md)，本轮证据与发布身份见[验证记录](verification.md)和[部署维护](runbook/deployment.md)。

## 2026-10-29 本地交互修复

参观默认固定整屋，只有放大后可拖动镜头且限制在画面边界；加入串门时归位，点击地面/方向键仍只移动自己。主人登录并已公开小屋后，主页面可见时每10秒读取既有公开在线摘要，显示来访人数与接待入口；隐藏页暂停，过期/失败撤销入口，账号切换拒绝旧响应，缓存账号须确认会话后读取本人公开状态。主页面不自动加入或替换其他标签的成员；点击接待后进入原独立串门页并尝试一次快捷加入。布置仍为主动公开快照。此修复仅更新本地，尚未发布线上。（2026-10-30更新：“主场景不直接绘制访客”已被取代——去别人家串门时主场景直接切换为对方的公开小屋，见下文“主场景串门”与[main-scene-visit.md](main-scene-visit.md)。）

## 2026-10-30 3D参观与跟随屋主

- **3D参观**：`/visit/<id>`与主游戏同为软陶3D外观。visit.js自建独立`World3D`，用公开快照合成的状态以固定取景（`capturingPhoto`）绘制，支持整座/分层/单房间与剖面/外观视角；联机时`hidePlayer`隐藏静态主人，成员由`live-peers`的3D名牌与气泡层绘制，位置在客户端平滑插值，最多30帧。点地面走动：`world.pick(x/dpr,y/dpr,'floor')`取地面点，再经`liveAvatars.destination`换算成归一化坐标发送。没有WebGL时保留原2D截图路径。参观入口仍不初始化主人存档、规则或同步，file入口不联网。
- **头顶名牌与气泡**：文字气泡6秒消失；`liveAvatars.drawBubble`接收同一帧已画气泡矩形`placed`，挨得近的人同时说话时后画的往上错开（含尾巴也不互相压住，推到画面顶部时收回画面内）；3D层按画面从前往后排序再画，前面的人留在原位。
- **跟随屋主**：主人家的公开快照由服务端在`PUT /save`事务内自动重新投影（未选择不公开时），只有公开投影真的变了才更新`updated_at`；只改钱包等私有数据时只推进`source_revision`，不会让在线访客白白刷新。`PUT /save`与`POST /my-publication`之后都调用`liveHub.refreshHouse`。访客页收到新的houseVersion就重读`/public-houses/<id>`并重建房间按钮与画面；页面可见时另每20秒核对一次`updatedAt`，补上读取失败或错过的更新，隐藏页不读取。看的房间被拆掉就回整座小屋。出生点与屋主拉开（x±0.18、y±0.1），避免访客一进来就站在屋主身上。

## 2026-10-30 主场景串门

去别人家串门不再默认新开标签页：`js/ui/visit-session.js`读取对方公开快照，冻结后交给渲染层（`G.render.visit.set`），主场景直接显示对方的小屋；同屋的人经`G.livePeers`画在主场景里。自己的`G.state`、存档、同步和租约原样保留，串门期间只读。非屋主仍走敲门流程，敲门等待时留在自己家，屋主同意并连上后才切换。会话合同（HTTP、成员TTL、请离、houseVersion）不变；实时位置/聊天仍只在内存，不进SQLite。`/visit/<id>`独立访客页保留作兜底（file入口、没有渲染接口、修饰键/中键打开新页）。完整设计、状态机、降级与未验项见[main-scene-visit.md](main-scene-visit.md)。

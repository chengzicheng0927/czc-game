# 公开小屋与只读邻居合同

2026-10-29，用户明确要求主界面显示可选登录入口，并选择首期「邻居列表和只读参观，优先展示其他孩子公开的小屋」。该阶段已实现并部署：本地60脚本674组及原4173浏览器发布、列表、参观、撤下与退出已验；正式HTTPS正常证书校验、入口/版本/健康、全部122份发布文件hash与匿名列表/详情/参观已通过，Chrome已实际绘制正式站点的公开小屋。随后用户授权实时串门与同屋聊天，现已实现并部署，正式HTTPS双账号和重启隔离已验；本合同的公开快照和房屋只读边界继续保留，新增在线成员与聊天见[实时合同](realtime.md)。详细证据见[验证记录](verification.md)与[部署手册](runbook/deployment.md)。

## 使用入口

主界面常驻「登录 / 注册」或当前账号与同步状态，旁边提供「邻居小屋」，明确提示不登录也能玩；设置继续保留账号、同步/冲突处理、JSON备份和本机副本工具。邻居页先显示实际有人主动加入的公开小屋，再显示按最近公开更新时间排列的其他小屋；在线区保留自己家里的成员，普通区排除本人并去重在线小屋。自己的公开状态在「公开我的小屋」页签管理。未登录可看列表和只读参观，发布/更新/撤下需登录本人账号。离线文件版继续可玩和导出JSON，邻居功能需从网站入口联网使用。

有空位且状态新鲜的在线条目提供「去串门聊天」，链接到隔离参观页`/visit/:id#join`；已登录者在可见页尝试加入一次，沿用当前已公开的串门称呼，其次本人公开小屋昵称，最后「小小建筑师」，不取账号名或账号昵称。游客仍只读并显示登录入口，满员或过期状态仅提供普通参观。普通条目「去看看」及本人「在我家一起玩」进入同一页面后，仍可主动填写昵称并「加入串门」；每屋最多8人，最终容量由加入时判定。在线形象来自服务器核对的本人云档，无云档用默认形象。房间选择只改变查看范围，进入按钮才把自己移入所选房间；之后可点地面、用键盘或方向控件走动。快捷入口只执行一次，失败、退出、刷新或BFCache返回不重试；详情见[在线邻居合同](online-neighbors.md)。文字/4条快捷短句、屏蔽聊天和主人请离的边界见实时合同；家具与房屋保持只读。

## 边界

每个小朋友的房子默认都是公开的。保存云端存档后，若未选择不公开，系统默认生成脱敏公开快照并在邻居列表与云海地图展示，并在后续保存时自动跟随最新布置；展示昵称默认取孩子自己填写的账号昵称；没填时账号昵称等于登录名，此时改用「小小建筑师」，绝不把登录名当作公开称呼；小屋名默认取小屋名称或「我的小屋」。能打开网站的人都可能参观已公开内容。用户可以随时选择撤下（设为不公开），撤下后列表和原链接均不可再获取，且后续保存存档不会自动公开（保持私密）；想要公开时可随时重新公开。撤下成功后立即关闭对应内存房间；更新（含保存云端后的自动跟随）不解散房间，在线访客收到新版本号后自动重新读取公开快照，不被踢出，见[实时合同](realtime.md)。自动跟随在服务端完成，客户端没有第二套发布逻辑；公开投影没变时不改更新时间，也不会刷新访客画面。列表仅含公开记录，不枚举私有账号。

公开投影仅包含实际房屋、家具装修、前院／阁楼、当前形象、入住角色与被实际引用的像素画作。不得包含账号ID／用户名、profile、钱包／拥有权／库存、生日、好感／心愿、领奖凭据、相册／回收夹、回忆、设置、会话或私有存档。投影由服务器从本人当前已验证云档生成，不接受客户端上传公开JSON。

## API（basePath + /api/v1）

- 所有接口继续协议1／release build门禁与no-store。认证写沿用Origin、Cookie／CSRF和X-MC-Account一致性复核。
- `GET /neighbors?cursor=...`：公开列表，返回`{houses:[{id,title,displayName,roomCount,updatedAt}],nextCursor:null|string}`；每页最多24，按updatedAt与id降序稳定分页，cursor为服务端生成的不透明值。不返回owner账号信息；UI将本人已知公开记录从邻居行过滤，单列本人状态。
- `GET /neighbors/online`：匿名可读的在线摘要，返回`{houses:[{id,title,displayName,roomCount,updatedAt,online:{count,hostOnline,displayNames}}]}`；最多64屋、每屋1–8位实际加入成员。读取先清理TTL/失效会话/更新或撤下小屋且不续期；不返回账号、peerId、形象、位置或聊天。按有空位、屋主在场、人数降序、updatedAt/id降序排列，旧分页与游标合同不变。
- `GET /public-houses/:id`：返回`{house:{id,title,displayName,roomCount,updatedAt},snapshot}`；不存在／撤下404。公开GET不要求认证。
- `GET /my-publication`：本人认证，返回`{publication:null|{id,title,displayName,roomCount,updatedAt,sourceRevision}}`。
- `POST /my-publication`：本人认证写，body`{title,displayName,expectedRevision}`；title与displayName各1–24字，不含控制符或换行，expectedRevision为正整数。事务内校验本人当前save revision等于expectedRevision，投影并发布／更新；返回`{publication:{...}}`，412/PUBLICATION_STALE表示云档变化需重新同步并确认，409/NO_SAVED_HOUSE表示没有已保存云档；客户端未关联／未恢复完整档时不得用临时空屋发布。拒绝额外字段或客户端公开JSON。
- `DELETE /my-publication`：本人认证写，返回`{ok:true}`；删除公开记录，保留私有存档。
- 参观页：`basePath + /visit/:id`由handler提供当前release入口，资源仍为不可变版本URL。main在任何cloud.prepare／save.load／store.init／save.init／规则init前分支到独立viewer。worker对参观导航只走网络，不缓存、不把断网参观退回主人页面。联机使用独立`/live/*`API与页内认证，不扩展公开快照字段或私人存档接口。

## 客户端接口与职责

`Game.cloud.requestAccount(path,method,body)`与`requestPublic(path)`窄接口复用同源协议/build，不向UI暴露会话令牌。认证窄接口只接受本合同的my-publication路径与GET/POST/DELETE，复用账号及CSRF；公开窄接口只接受neighbors分页、neighbors/online与public-houses的GET，以credentials:omit请求且不要求prepare或会话。不改原存档协议。返回JSON，失败抛Error，HTTP错误附status/code。

`Game.neighbors`与`Game.ui.neighbors`为同一UI模块接口，提供init/panel/open/close/refresh/status。在线区在前，普通公开列表保留分页，本人发布状态单列；所有参观链接只负责打开独立页，不在主人页面加入。仅在列表打开、列表页签及文档可见时每10秒刷新在线区，返回立即刷新；关闭/后台/离页停止，generation隔离迟到响应。失败保留并标明上次状态，移除绿色在线标识及快捷动作；稳定行DOM和独立发布表单保留焦点/输入。发布前先调用syncNow并确认同账号ready/binding、无dirty/restoreRequired/readOnly，再取得status.remote.revision作为expectedRevision；冲突、坏档、只读／失租约或切账号时停止发布。本人撤下不依赖已关联或有效私档，仍需认证和持有当前页租约，允许先撤下再恢复私档。请求跨await绑定当前account.id，旧结果不更新另一个账号的界面。提供空状态、重试、加载更多、公开说明及发布/撤下确认。

`Game.publicHouse.project(validatedSave,{title,displayName})`是纯函数，只输出version=1白名单投影；展示昵称在公开响应摘要中，不进入合成状态。`materialize(snapshot)`严格校验形状与引用后仅构造绘图用合成状态，绝不触摸localStorage／store.update。后端validator在可信VM加载当前release的该脚本，提供`projectPublic(save,options)`，不改变私有云档的contractHash及save/history/session接口兼容性。

`Game.visit.shouldStart()/init()`识别参观路由，独立文档中对冻结的合成状态用独立`World3D`以3D软陶外观绘图（无WebGL时退回2D离屏绘图），并安装拒写guard，不初始化主人编辑输入、每日规则、自动保存、私人账号同步、离线worker或租约。提供整屋/房间、拖动/缩放、键盘与返回自己的小屋，不允许对参观数据运行导入／store.replace或进入编辑。当前版本另挂载`Game.live`和在线人物层：连接期间隐藏静态快照玩家，绘制本次真实成员，离开恢复公开快照；只改变Canvas与运行态。参观不读取本机私人存档，不写localStorage或Cache Storage；本地测试与实际浏览器已核对访客无本机写入、两方私人云修订/hash不变，后端越权写请求仍被拒绝。

## 模块与恢复

- 后端：server/cloud-store.cjs独立publications表，每账号最多一份；cloud-api.cjs认证、分页及事务，save-validator.cjs可信投影，handler.cjs参观入口。
- 参观：js/core/public-house.js、js/ui/visit.js、css/visit.css与js/main.js提前分支；入口加载顺序与内容指纹按当前index.html。
- 实时：server/live-hub.cjs独立内存房间，js/core/live.js同源认证/轮询，js/ui/live-room.js与css/live-room.css成员/聊天/屏蔽/请离，js/render/live-avatars.js绘图/插值；无新数据库表、无私人存档修改。
- 账号与邻居UI：cloud-account.js主界面账号状态，neighbors.js列表/本人管理，ui.js导航与对应CSS；公开快照网络通过cloud-sync窄接口，联机网络只通过独立live adapter。
- 离线边界：server/offline.cjs生成的worker不缓存API和参观导航，不把参观路径退回私人主人页面。已有缓存须按正常worker更新机制换版。

SQLite备份包含公开快照。灾难恢复在对外启动前必须执行rotate-epoch，生成新serverEpoch，并清除会话、旧幂等回执与全部公开记录；旧链接因此失效，不会从旧备份复活已撤下的小屋。主人需重新登录并核对恢复进度；按默认公开规则，下次保存会重新发布新的公开小屋。当前实现的rotate-epoch也会清除“不公开”标记，已设为不公开的孩子会因此被重新公开，已记入待办，需另行决定。具体命令见[后端说明](../server/README.md)。

此前只读参观生产发布是保留数据的程序升级：先完成旧代码一致性备份、停服务后新增publications表，user_version仍为1，原有7张私有表内容hash核对不变。独立验收账号发布后重启服务，私人修订/hash与公开快照均保留；撤下后公开详情404，私人存档不变，该次未做灾难恢复或epoch轮换。随后实时功能本地65脚本732组通过，Chrome与独立HTTP客户端核对互见、双向走动/聊天、明确进入房间、屏蔽/取消屏蔽和请离后403禁止重加；两方私人修订/hash不变。最终另有57组定向复查通过。当前入口104 JS + 21 CSS，共126份发布文件，实时版已部署；正式HTTPS双账号加入、走动与双向聊天、形象白名单、成员权限及请离后禁止重加通过。服务重启前释放等待请求、重启后旧peer失效，主动重加产生新peer且不恢复聊天，私人修订/hash及公开快照保留；本次原8张数据库表内容hash与user_version=1保持，无schema变更；真实双物理设备、Safari、长期使用与异机灾备恢复仍未验，最新检查与证据边界见验证记录。

MC-041在线邻居与直接串门已实现并部署，66脚本758组串行检查通过；正式HTTPS全部126文件hash、在线人数/屋主离开清理、公开称呼与快捷称呼、聊天和重启重加已验。重启清空在线、旧peer409，会话/公开快照/私人修订/hash保留，原8张表内容和schema保持，两个验收账号已清理。新增在线摘要和快捷入口不改公开投影、私人save/history/session接口或旧公开分页合同。推荐公开称呼与单次加入的Cookie绑定边界见在线邻居合同，本轮证据与发布身份见[验证记录](verification.md)和[部署手册](runbook/deployment.md)。

# 网站服务与发布副本

本目录提供 Node.js 24 的零第三方依赖网站与账号存档服务：静态入口和版本切换、每个孩子独立账号、SQLite完整JSON／修订／历史／会话、自动备份，以及主动发布的公开视觉快照、邻居列表和只读参观。随后授权的实时串门/同屋聊天已增加独立内存hub并部署，正式HTTPS双账号和重启隔离已验。浏览器继续保留本机进度；前端仍可双击原 `index.html` 离线运行，无npm安装或构建步骤。

应用服务器上一版已更新只读参观，正式HTTPS正常证书校验、入口/版本/健康及全部122份发布文件hash通过，匿名邻居列表/详情/参观可用，Chrome已实际绘制正式站点的公开小屋。账号阶段19项上游HTTP与117资源检查保留为历史记录。`marshmallow-cottage.service`以专用非root用户`mc-cottage`运行并启用开机启动，代码与持久库分离；独立Node.js 24.22.2已核对官方SHA-256且实际通过SQLite/scrypt验证，系统Node.js 16保持不变。APISIX由用户配置，操作与证据见[部署手册](../docs/runbook/deployment.md)。

本地Node.js 24.3.0、54脚本626组的历史验收保留，部署HTTP检查不计入规则脚本数；完整结果见[验证记录](../docs/verification.md)。原Python预览退出后，仅在同一`127.0.0.1:4173`用本后端恢复本地预览并完成真实HTTP核对；以下8080仍只是手动操作示例。

本轮MC-041在线邻居与直接串门已实现并部署，66脚本758组串行检查通过。当前生产release为`r-f0558753cab3a6e4138e8a7a82fffb0730b26a6f2a1621893588caa25f78171c`，发布包135个程序文件、1,462,821字节，SHA-256为`11245814ea226c5fe4956f4851a0ff823b3429fdf23e6893df1dd3e65023cc40`；正式HTTPS全部126份文件hash已核对。在线人数1→2→1（屋主离开）→0、公开称呼/快捷称呼和同屋聊天通过；重启清空在线、旧peer409、会话/公开快照/私人修订/hash保留及主动重加已验。原8张表内容与schema保持，两个验收账号已清理，服务运行且启用开机启动。新增摘要和推荐称呼沿用同源API与内存hub，私人save/history/session接口及旧公开分页合同保持；最新结果见[验证记录](../docs/verification.md)与[部署手册](../docs/runbook/deployment.md)。

追加的主界面可选登录、邻居公开列表、主动发布/更新/撤下与只读参观已实现并部署，60脚本674组及本地实际浏览器流程保留为该阶段证据。该次发布包为130个程序文件、1,372,489字节，静态发布白名单为122份文件；前端release为`r-9fddeaf6c6e49f2b58a52f3fb177d9d951fd3e6c713f404bde554b0da537c5ef`，发布包SHA-256为`d87aa7552b50e4d4f1efc96a7931327404ddf5d4fcf6162f0f6dab649e83886a`。独立验收账号的私人修订/hash及公开快照经服务重启保留，撤下后公开404且私档不变；真实双物理设备、Safari、长期使用与异机灾备恢复仍未验，完整证据及最新定向检查见验证记录和部署手册。

MC-040实时阶段历史验收为本地65脚本732组串行通过，原Chrome页与独立HTTP客户端已核对互见、双向走动/聊天、明确进入房间、屏蔽/取消屏蔽及请离后403禁止重加，两方私人修订/hash不变。源入口104 JS + 21 CSS，共125资源、126份发布文件；当时新增`server/live-hub.cjs`为第8个后端模块，数据库schema和私人存档合同不变。最终错误提示修正后另有57组定向复查通过。该阶段生产release为`r-411f8ac520c06cf2baa16a27802affc035906995ff9cdff075b5c166e22d7e51`，发布包135个程序文件、1,449,741字节，SHA-256为`771ac57a2f8c31806bdb082a70aa023f5f82bfb1cf52d9d4cc38f2944d69e914`。发布前使用旧代码新鲜备份，停服务后更新程序及release；原8张数据库表内容hash及user_version=1保持，无schema变更，服务以mc-cottage用户运行并启用开机启动。该阶段正式HTTPS双账号和重启隔离已验，完整证据见部署手册。

账号阶段使用内置 `node:sqlite` 的 `DatabaseSync` 与一致性 `backup`，本地24.3.0版本会输出ExperimentalWarning，未引入npm SQLite驱动。接口见 [Node 24.3 SQLite文档](https://nodejs.org/download/release/v24.3.0/docs/api/sqlite.html)。账号阶段最终测试结果以本轮验证记录为准。

## 准备与激活

在游戏根目录操作。`prepare` 只生成文件，不监听端口：

```sh
node server/cli.cjs prepare --data-dir .server-data --base-path /cottage
node server/cli.cjs list --data-dir .server-data
```

输出的 `releaseId` 是内容身份。复制该值到以下命令的 `RELEASE_ID` 位置，显式激活：

```sh
node server/cli.cjs activate RELEASE_ID --data-dir .server-data
```

也可在准备时加 `--activate`。根域名模式使用 `--base-path /`；路径模式可用 `/cottage` 或 `/cottage/`，两者归一为同一配置。`--source-root DIR` 可指定另一个游戏源目录，默认本项目目录。

同一个 `data-dir` 首次激活后固定挂载路径。后续 `activate`／`prepare --activate` 若目标 release 的 `base-path` 不同会拒绝，保留原活动指针和原入口；例如现站点为 `/cottage` 时，漏写 `--base-path` 不能把根路径版本误切上线。真正迁移挂载路径时使用新的 `data-dir`，按新路径准备和验收，并明确处理正式网址与旧进度迁移。

生成规则：

- 从入口的 script/stylesheet 引用提取白名单，验证每个资源的 `?v=` 等于 SHA-256 前十位，仅接受 `js/`、`css/` 内带指纹的相应文件。
- 只复制入口和被引用资源；不复制测试、文档、个人存档、备份或父目录文件。CSS 新增 `url()`／`@import` 会要求先扩展清单，避免无声漏文件。
- 发布副本入口改用 `/cottage/releases/RELEASE_ID/js/...` 等版本 URL；源码入口完全不改。挂载路径也参与 release 身份，路径变化需重新 prepare。
- 写入临时目录后再完成 release。相同内容复用原版本；已有 release 不覆写，旧资源继续保留。拒绝资源或中间目录的符号链接。
- `active.json`、`manifest.json` 留在私有数据目录。HTTP 通过白名单 handler 提供指定文件，不把整个数据目录或源码目录挂成 webroot。

数据布局：

```text
.server-data/
  active.json
  releases/
    r-完整SHA256/
      manifest.json
      index.html
      js/...
      css/...
  cloud/
    cottage.sqlite
    cottage.sqlite-wal
    cottage.sqlite-shm
    backups/...
```

`.server-data/` 已加入根 `.gitignore`。生产时可以把 `--data-dir` 指向项目之外专用目录；目录需由运行进程可读写，不能由上传用户任意修改。暂不自动清理旧 release，以保护仍打开旧入口的浏览器。

## 运行命令

只有 `serve` 会监听，必须同时明确 `--host` 和 `--port`。下例仅绑定本机；8080 是可替换示例，不代表服务器已占用或批准该端口：

```sh
node server/cli.cjs serve --host 127.0.0.1 --port 8080 --data-dir .server-data --base-path /cottage
```

启动前校验活动release并打开私有SQLite。允许的Origin仅在显式绑定127.0.0.1／localhost／::1时可由host/port推导；其它绑定必须给 `--origin`，例如 `--origin https://game.example.com`，不信任任意Host或X-Forwarded头来推测来源。HTTPS Origin自动使用Secure Cookie，也可明确加 `--secure-cookies`（必须配HTTPS Origin）。

APISIX访问应用上游时，应按部署手册核对绑定地址、防火墙和进程管理；本地loopback不能直接供另一台机器访问。Node服务提供普通HTTP，入口HTTPS由网关负责；跨不可信网络的上游连接需要额外保护。

路径约定：`--base-path /cottage` 时，APISIX 应把 `/cottage/...` 原样转发；不剥离前缀。根路径模式才用 `--base-path /`。两种模式不要混配。`/cottage` 会重定向到 `/cottage/`。

| 路径（以 `/cottage` 为例） | 行为 |
| --- | --- |
| `/cottage/`、`/cottage/index.html` | 当前入口，`Cache-Control: no-cache`，强 ETag |
| `/cottage/visit/PUBLIC_HOUSE_ID` | 当前release入口；main先进入独立参观/串门页，不初始化本机私档、规则、同步或租约 |
| `/cottage/releases/RELEASE_ID/js/...`、`css/...` | 已发布白名单资源，正确 MIME，强 ETag，immutable 一年 |
| `/cottage/version.json` | 当前 release、路径和资源数，no-store |
| `/cottage/healthz` | 校验活动清单、前缀及全部发布文件的可读性／hash；有效200，缺失／损坏503 |
| `/cottage/api/v1/...` | 注入的账号、存档、公开快照与实时接口，全部no-store |
| 其它路径 | 404；不返回入口 HTML 伪装成缺失脚本 |

静态入口／资源支持GET/HEAD，其它方法405；API按合同开放GET／POST／PUT／DELETE。首页/资源的ETag可返回304；health/version为no-store，不提供ETag。完整资源在prepare/activate/serve启动时校验，资源请求自身也检查内容hash。非法编码、路径穿越和双重编码拒绝，目录、清单、SQLite和私人数据不可直接访问。错误响应不包含磁盘路径。参观导航与API只走网络，不缓存到Service Worker，不在断网时退回主人入口。

APISIX／其它缓存应保留版本 URL 并遵循入口与 API 缓存头。更新时重新 prepare、激活新 ID，不改站点 origin 或浏览器存档键。仅切换已部署的静态release时，回滚使用 `list` 找到旧 ID 后再 `activate`，无需重启；服务对每次请求读取当前活动指针。后端程序更新仍按部署手册备份、更新并重启，内存联机房间因此结束。旧 release 资源继续可访问。未来存档 schema 变化时只可回退到能读取当前档的代码，不能清站点数据排障。

## 无监听验证

```sh
node tests/server.cjs
node tests/cloud-api.cjs
```

测试直接调用导出的 `createHandler`，使用临时目录，不调用 `listen`、不启动浏览器、不碰真实存档。覆盖实际资源白名单、源指纹、版本保留与回滚、缓存／HEAD、路径前缀、损坏文件、符号链接及数据泄露边界。所有 Node 检查由主线程串行运行。

新站点与旧 file/localhost 地址的存档不自动互通。迁移前在原游戏 UI 新鲜导出 JSON，在目标站点备份现有进度后导入，刷新与再次导出核对；故障时保留原文件和两份 JSON。已关联账号也可明确恢复自己的云档。完整边界见[账号存档合同](../docs/cloud-save.md)与[联网方案](../docs/network-plan.md)。

## 账号与存档边界

API根为 `basePath + /api/v1`，完整请求／响应见 [账号存档合同](../docs/cloud-save.md)。账号名3–32位英文字母、数字、下划线（归一为小写），密码8–128个字符且不超过512字节，可选昵称1–24字。每个账号一份小屋；注册只建账号与会话，不创建默认云档，不覆盖本机进度。

密码用异步scrypt、随机16字节盐与64字节派生值保存（N=32768/r=8/p=1）；数据库只保存会话令牌hash，Cookie为HttpOnly／SameSite=Strict，默认7天。注册／登录限流及最多4个同时密码计算；认证写还需Origin、JSON和CSRF。save／history／logout及my-publication要求 `X-MC-Account` 与Cookie实际账号一致，不能用账号头授权别人的档。登录／注册无已有CSRF，以严格Origin防登录CSRF。

后端从活动release只加载可信namespace、data、utils、store到隔离VM，上传内容仅JSON.parse后调用既有validator，永不作为代码执行。每份存档同时受3MiB UTF-8、2,500,000 UTF-16字符与既有版本／引用／字段规则约束。contentHash为验证后递归键排序（数组不改序）JSON的SHA-256。它证明格式和内部一致性，不能证明离线游戏数值没有被玩家修改。

客户端须发 `X-MC-Protocol: 1` 和保留的releaseId；即使JSON version仍为1，旧页面也只有在data／utils／store合同完全相同时才能同步。服务器只按会话账号读写，不接受ownerId。CAS、修订、历史和幂等回执同一SQLite事务提交；同内容不增加修订，最多保留10个版本（含当前），最多保留256份幂等回执。被裁剪的旧回执重试仍须通过CAS，不能变成无条件覆盖。

## 公开小屋与只读邻居

此前只读参观升级先用旧代码完成新鲜SQLite一致性备份，停止服务后新增publications表；user_version仍为1，迁移前后原有7张私有表内容hash核对不变。程序与不可变release更新后启动服务；正式HTTPS发布文件逐一核对hash，并用独立验收账号验证私人/公开快照重启持久化及撤下隔离。操作记录见[部署手册](../docs/runbook/deployment.md)，该次没有执行灾难恢复epoch轮换。

公开接口仍在同一API根、协议/build门禁与no-store约束下。`GET /neighbors`按最近公开更新时间分页返回最多24份公开摘要，`GET /public-houses/:id`返回独立视觉快照；公开GET不要求认证，不查询或枚举私有账号。`GET /neighbors/online`返回`{houses:[{id,title,displayName,roomCount,updatedAt,online:{count,hostOnline,displayNames}}]}`，最多64屋、每屋1–8位主动加入成员；先清理TTL/失效会话/更新或撤下房屋，读取不续期，不返回账号、peerId、形象、位置或聊天。按有空位、屋主在场、人数降序、updatedAt/id降序排列，旧分页与游标保持。`GET/POST/DELETE /my-publication`仅管理认证账号自己的公开记录，写请求仍复核Origin、CSRF和账号。

每个小朋友的房子默认都是公开的。保存云端后，若未选择不公开，系统默认自动投影公开快照；之后改动布置自动跟着更新。用户可随时选择撤下（设为不公开），撤下后转为私密状态，后续保存不会再自动公开；随时可重新设为公开。主动发布/更新只接受公开小屋名、展示昵称与expectedRevision；事务内核对本人当前云档revision，再由可信release中的`Game.publicHouse.project`投影，客户端不能提交公开JSON或指定owner。`publications`表每账号最多一份，独立于私人save/history。投影脚本不纳入私有存档contractHash，既有账号存档API保持兼容。

撤下只删本人公开记录，列表和旧链接后续获取失败，私有云档及修订保留；重新发布生成新的公开ID。`/visit/:id`由当前release提供独立参观入口，main在cloud.prepare、save.load/store.init、规则和租约之前分支，参观页不读写访客自己的小屋；主人加入联机也在同一隔离页面。完整字段和本地验收边界见[公开小屋合同](../docs/public-neighbors.md)。

## 实时串门与同屋聊天

`server/live-hub.cjs`由cloud-api接入，单进程内保存最多64屋/256成员，每屋8人；一个账号只保留一个在线成员。`/live/*`仍在同源`basePath + /api/v1`，沿用协议/build及no-store，使用最长8秒HTTP长轮询、事件立即返回，每成员最多一个等待请求。无需新端口、WebSocket或代理协议升级；APISIX沿用已有HTTP通路和API不缓存约定。

`GET /live/me`返回`{authenticated:false}`或认证本人的`{authenticated:true,liveKey,csrfToken,joinDisplayName}`；推荐称呼依次取当前实际在线成员已公开称呼、本人publications.display_name、最后「小小建筑师」，不取登录名或账号昵称，读取不续期。此后须有当前有效Cookie和`X-MC-Live`，加入后再带`X-MC-Peer`绑定本次成员，所有POST另验Origin/CSRF。异步body读完及长轮询返回前复核会话，旧标签或切账号后的迟到请求不能移动、聊天或退出新成员。形象只从本人已验证云档白名单产生，无云档用可信默认；手动加入仍可主动填写展示昵称。完整请求/响应见[实时合同](../docs/realtime.md)。

本轮邻居UI仅在列表打开、列表页签且文档可见时每10秒读取在线摘要；有空位且状态新鲜的行提供精确`#join`快捷入口。独立visit页成功加载快照后消费该片段，已登录且可见时仅尝试一次；quickJoin重新读取`/live/me`，使用同一次Cookie握手中的推荐称呼和凭据。游客只读，满员/过期提供普通参观，失败/退出/刷新/BFCache不自动重试。此扩展无需新端口或数据库迁移，完整边界见[在线邻居合同](../docs/online-neighbors.md)。

位置为公开房间/前院的0–1地面坐标，移动限5次/秒；聊天1–80字纯文字，有限频和幂等ID，只交付本次加入后的消息，内存最多32条。房屋家具仍只读；成员、位置和聊天不写SQLite、日志、私人save/history或JSON，数据库schema和private contractHash不变。屏蔽只在本次页面隐藏对方聊天，主人可请离成员并在本次房间生命周期禁止重加（403）。

成员TTL35秒，由有效轮询/动作续期；离页尽力leave，TTL最终回收。更新/撤下公开快照立即关闭该屋联机；退出/换账号、会话过期或epoch变化清理相关成员。停止服务先释放长轮询，再关闭HTTP/数据库；重启不保留在线或聊天，客户端明确提示主动重新加入，不自动恢复成员。本功能已部署并完成正式HTTPS双账号验收：同屋poll被移动事件唤醒（该次总用时276ms，包含验收主动等待250ms），双向聊天、形象白名单和no-store通过；访客不能请离主人，主人请离后对方旧请求409、重加403。重启前等待poll以503释放，重启后登录/私人修订/hash及公开快照保留，旧peer返回409，主动重加产生新peer且聊天不恢复。该单次响应时间不作为设备性能或并发基准；真实双物理设备、Safari、长期运行与异机灾备仍未验，发布/检查/清理细节见[部署手册](../docs/runbook/deployment.md)。

## 数据库备份与灾难恢复

`serve` 在启动、每24小时及正常退出时做SQLite一致性备份，保留最近7份；失败只给不含存档内容的错误提示。进程被强制终止时无法保证退出备份完成。手动备份和epoch轮换都不启动监听：

```sh
node server/cli.cjs backup --data-dir .server-data
node server/cli.cjs rotate-epoch --data-dir .server-data
```

命令要求已有数据库，避免误建空库。备份在私有 `cloud/backups/`，包含账号哈希、会话及完整进度，应复制到另一故障域并限制权限；同磁盘备份不能抵御整机磁盘损坏。当前程序不把备份当公开下载文件。

灾难恢复时先停止服务并保留当前数据库／WAL／SHM，再使用一致性备份恢复独立工作目录；不能让旧WAL与恢复的主库混用。**启动对外服务前执行 `rotate-epoch`**，它生成新serverEpoch、撤销全部会话和旧幂等回执，并清除全部公开记录使旧公开链接失效，保留已恢复的私人修订。客户端重新登录后比较本机与云端，核对恢复进度后由主人主动重新发布，不能从旧备份自动恢复公开状态。旧ETag不能在恢复后误命中新修订（防ABA）。不要在服务运行时直接复制覆盖正在写入的主库，也不要只手工回拨revision。

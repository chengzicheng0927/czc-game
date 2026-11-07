# 账号与SQLite自动存档

2026-10-29，MC-038账号存档及后续主界面登录、邻居公开列表与只读参观已实现并部署。真实SQLite接口、双客户端同步、账号界面及断网重开的本地证据保留；账号阶段上游19项HTTP与117资源检查作为历史记录。只读参观阶段正式HTTPS正常证书校验、入口/版本/健康及全部122份发布文件hash已通过，匿名列表/详情/参观与Chrome实际画面已验。APISIX由用户配置，真实双物理设备、Safari、长期使用和异机灾备恢复仍未验。详细证据见[验证记录](verification.md)与[部署手册](runbook/deployment.md)。

## 实现合同

每个孩子一个账号（账号名+密码，可选昵称，不要求真实姓名/邮箱），每个账号一个完整小屋。注册/首次登录不自动覆盖本机已有小屋；明确选择关联当前进度或恢复云端。SQLite保存完整权威JSON、修订、历史和会话；浏览器保留本机离线副本，JSON导入导出继续可用。后续追加的主界面登录、邻居公开列表与只读参观已实现并部署，使用独立主动发布的视觉快照。随后授权的实时串门与同屋聊天已实现并部署，正式HTTPS双账号与重启隔离已验；它们使用独立内存状态，不改变私人存档同步或数据库schema，合同见[实时串门](realtime.md)。

同源API根为 `basePath + /api/v1`。所有响应no-store。前端每次发送 `X-MC-Protocol: 1`、`X-MC-Build: 当前releaseId`；后端核对retained release及存档数据合同兼容，拒绝不兼容旧页。认证后的save/history/logout及my-publication请求另带 `X-MC-Account: 当前account.id`，服务端只做与已认证会话的一致性比较，绝不能据此赋予归属；防止同浏览器另一页换账号后旧任务误读/写新账号。原私人存档协议与数据contractHash兼容判定不变；新增公开投影和联机模块不改变其身份。API错误为 `{code,message}`，私人账号/存档成功结构如下，公开接口另见[公开小屋合同](public-neighbors.md)。实时`/live/*`使用当前Cookie及页内`X-MC-Live`身份围栏，加入后的请求再带`X-MC-Peer`，POST另带CSRF；不读取或修改本机私档元数据。

| 方法/路径 | 请求 | 成功 |
| --- | --- | --- |
| GET /session | 无 | `{authenticated:false,protocol:1,serverEpoch}` 或 `{authenticated:true,account:{id,username,displayName},csrfToken,protocol:1,serverEpoch}` |
| POST /register | `{username,password,displayName?}` | 同已登录session；设置HttpOnly/SameSite会话Cookie |
| POST /login | `{username,password}` | 同已登录session |
| POST /logout | `X-CSRF-Token` | `{ok:true}` |
| GET /save | 已认证 | `{save,revision,serverEpoch,contentHash,updatedAt}`，强ETag；没有时404/NO_SAVE（含serverEpoch） |
| PUT /save | `{save,mutationId,expectedEpoch}`，更新带If-Match，首次带If-None-Match:*；X-CSRF-Token | `{revision,serverEpoch,contentHash,updatedAt}`，强ETag；同mutationId/相同hash幂等返回原回执 |
| GET /save/versions | 已认证 | `{versions:[{revision,serverEpoch,contentHash,updatedAt}]}` |
| GET /save/versions/:revision | 已认证 | 与GET /save相同结构，但取指定历史；用于下载备份 |

写入均验证Origin/JSON类型/请求体预算/CSRF；密码scrypt加盐，会话只存令牌hash，有过期及登录限流。存档3MiB UTF-8/2,500,000 UTF-16字符，服务器复用可信源码中的校验与迁移，不执行上传内容。更新CAS、历史、幂等回执在同一SQLite事务；412冲突、426客户端不兼容、401过期、413过大、422无效档、429限流。客户端绝不以无条件覆盖重试412。

ETag绑定serverEpoch+revision+contentHash。灾难恢复后必须通过rotate-epoch重新生成serverEpoch，撤销会话、旧幂等回执和全部公开记录/旧链接，旧设备重新登录/比较基准；核对恢复进度后需主动重新发布小屋。JSON version=1不代表所有build都兼容。保留最近10个有效历史版本，SQLite支持一致性备份及恢复后epoch轮换。

## 前端约定

`Game.cloud`提供 `prepare/init/status/register/login/logout/syncNow/bindLocal/useCloud/startNew/resolveConflict/downloadCloud/downloadBackup/forgetBackup/takeover`；异步操作返回`{ok,message?}`，`status()`返回只读UI状态，变化发`cloud:change`。`prepare`在加载本机存档前接入写入租约，`init`在save初始化后订阅成功保存事件。

主界面直接显示登录/注册或账号及同步状态，并提供「邻居小屋」；不登录也能玩，未登录也可查看公开邻居。设置仍保留账号、同步、冲突处理、JSON和本机副本工具。`requestPublic`只取公开分页、`/neighbors/online`在线摘要和公开快照，使用`credentials:omit`，不初始化私人存档或租约；`requestAccount`仅扩展本人公开状态的GET/POST/DELETE，不向UI暴露会话令牌。在线摘要只包含主动加入公开小屋的称呼、人数及屋主在场状态，不枚举私人登录账号。参观路由在任何主人初始化前单独分支，不加载、替换或保存访客自己的小屋。

实时串门在同一独立`/visit/:id`页由`Game.live`接入，主人也从本人公开状态进入。普通参观须登录后主动填写昵称加入；本轮在线邻居的明确「去串门聊天」入口通过精确`#join`触发一次快捷加入，游客仍只读。`GET /live/me`仅给认证本人增加`joinDisplayName`，取当前实际在线的公开称呼、本人公开小屋昵称、最后「小小建筑师」，不取登录名或账号昵称；快捷加入重新握手，称呼与凭据绑定同一次Cookie，失败或刷新不重试。服务器只从本人已验证云档取形象白名单，无云档用默认形象。走动、房间位置、成员与聊天只留内存，不触发store.update、save、私人云修订、历史或SQLite写入。公开模样更新/撤下结束该屋联机；退出、切账号或会话失效清除成员，旧页迟到请求不能作用于新成员。服务重启不恢复在线或聊天，客户端须主动重新加入；退出与重启不影响私人进度恢复。

私人进度默认不公开。主动发布/更新需确认公开小屋名、展示昵称与视觉内容，先同步并用当前云revision核对，再由服务器生成脱敏快照。之后的自动保存仍只更新私人云档。公开列表仅枚举主动发布记录，按最近公开更新时间排列，UI优先展示其他孩子的小屋；撤下会停止列表及原链接后续获取，私档保留。

状态含`available,phase,message,account,binding,remote,conflict,busy,restoreRequired`。phase使用`offline/guest/ready/pending/syncing/conflict/choose/expired/error/incompatible/other_tab`。binding表示账号已明确关联当前本机小屋；remote为当前远端摘要，conflict包含两边摘要。`resolveConflict('local'|'cloud')`必须由UI明确确认：local仅以刚取的远端ETag作CAS再上传，cloud先保留本机分支再经可靠切档恢复。`downloadCloud()`默认当前远端JSON，入参revision可取历史。读取坏档失败的默认小屋不能绑定或上传，需先恢复有效JSON或明确恢复云端；原坏档继续保留。

只有本机成功保存后触发自动上传，防抖合并并用单次在途任务，普通计时更新不每次创建云版本；定期拉取远端用于跨设备续玩。基准未分叉时自动续接，有双方修改时保留两份并明确选择。请求绑定账号/epoch/generation，迟到响应不清新修改。401保留本机待同步，离线重开恢复绑定，不把旧账号缓存传给新账号。

本机账号缓存与guest分开保留，活跃档兼容原saveKey；旁路最多保留2个账号副本及guest、恢复分支和切换日志。没有云档的账号可明确新建初始小屋，原有guest不会当成另一个孩子的进度。切换前必须完成副本保存，配额/拒写失败就停止切换。多标签20秒租约、5秒续期，并在store/save写入前和元数据写入时核对持有者；明确接管后旧页不能继续写共享key。pagehide先完成保存再释放自己的租约，刷新可立即恢复。

普通操作成功保存后1.5秒防抖上传；仅游玩计时／居民气泡时钟变化每120秒合并，完整JSON仍包含计时字段。在线每30秒检查远端；网络失败退避重试。关闭页面只保证尽力保存本机，离开设备前应确认「已同步」或下载JSON。

正式release网页在HTTPS或浏览器允许的loopback安全环境缓存公开页面壳及不可变资源，显示「离线副本已准备好」后可断网重开；API、Cookie、账号响应和存档不进入Service Worker缓存。参观导航只走网络，断网不回退主人入口，公开快照不缓存。本机私有进度仍只由localStorage保存。安装绑定单一release，不强制接管旧页；更新提示关闭所有游戏页面后重开，避免编辑中的页面混版。浏览器清站点数据或回收缓存后仍需网络或JSON备份。file入口不登录/不注册worker/不发请求，仍能玩和导出JSON。

## 运行与限制

后端无npm依赖。本地实测Node.js 24.3.0内置SQLite，该版本会输出SQLite ExperimentalWarning；本地54脚本626组是保留的历史验收记录。应用服务器使用独立Node.js 24.22.2，已核对官方SHA-256并实际通过SQLite/scrypt验证，系统Node.js 16保持不变；`marshmallow-cottage.service`以专用非root用户`mc-cottage`运行并启用开机启动，代码与持久库分离。此前只读参观升级先做一致性备份、停服务，再新增publications表，user_version仍为1；迁移前后原有7张私有表内容hash核对不变。独立验收账号的私人修订/hash及公开快照经服务重启保留，撤下后公开404且私人存档不变。准备release、启动、手动一致性备份及灾难恢复epoch轮换见[server说明](../server/README.md)，部署证据见[部署手册](runbook/deployment.md)。自动备份保留最近7份，默认与数据库同盘，另一故障域副本仍需安排。

账号是每个孩子独立的用户名和密码，当前没有邮箱、家庭配对码、密码找回或管理后台。家长应保管账号；使用本机副本与JSON作为补充恢复方式。同步整份私人游戏进度（含相册、画作、昵称和生日设置），默认不向其他账号公开；只有另行确认的视觉快照可供网站访问者参观，不包含相册、生日、账号名与完整进度。主动加入实时串门会向同屋成员展示本次昵称、形象、位置与加入后的聊天；聊天1–80字、最多32条内存留存，不写日志、历史或SQLite。私人离线进度不提供防作弊保证；共享经济与共同布置未实现。

主界面入口与邻居功能本地60脚本674组及实际发布、列表、参观、撤下、退出流程已验；该阶段生产证据另含正式HTTPS全部122份发布文件与公开流程、独立验收账号的重启持久化和撤下隔离，不沿用历史检查充当新功能验收。最新定向检查与完整细节见部署手册和验证记录。

实时功能本地65脚本732组串行通过，Chrome与独立HTTP客户端已核对互见、双向移动/聊天、进入房间、屏蔽与请离后禁止重加，两方私人修订/hash保持。当前源入口125资源、126份发布文件；本次数据库schema及私人存档合同不变。最终另有57组定向复查通过。实时版已部署，正式HTTPS双账号验证加入、形象白名单、移动与双向聊天、权限与请离隔离；重启前等待请求以503释放，重启后旧peer返回409，主动重加生成新peer且不恢复聊天。两方登录/私人修订/hash及公开快照保留；升级前后8张表内容hash与user_version=1保持，无schema变更。上一版122文件证据继续作为历史，当前生产证据与发布身份见部署手册；真实双物理设备、Safari、长期使用和异机灾备仍待验。

本轮MC-041在线邻居与直接串门已实现并部署，66脚本758组串行检查通过；正式HTTPS全部126文件hash、在线人数/屋主离开清理、公开称呼与快捷称呼、聊天及重启重加已验。在线区在普通公开列表前，仅打开且可见时每10秒刷新，普通区去重；满员或过期状态保留只读参观，游客不会自动加入。升级前后原8张表内容保持、无schema变更；重启后会话、公开快照及私人修订/hash保留，旧peer409且在线清空，两个验收账号已清理。私人save/history/session接口、原分页及离线/JSON恢复合同保持；完整范围见[在线邻居](online-neighbors.md)，本轮证据与发布身份见[验证记录](verification.md)和[部署手册](runbook/deployment.md)。

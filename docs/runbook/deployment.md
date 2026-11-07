# 应用服务器部署与维护

2026-10-29已完成应用服务器部署，并先后更新主界面登录、公开邻居、实时串门/同屋聊天及在线优先/点击直接加入。APISIX路由和入口HTTPS由用户配置；生产地址、域名、SSH信息和凭据不记录在项目文档。

## 当前配置

| 项目 | 已验证配置 |
| --- | --- |
| 服务 | `marshmallow-cottage.service`，systemd开机启动、异常重启 |
| 运行用户 | `mc-cottage`，非特权、禁止交互登录 |
| 应用根目录 | `/home/marshmallow-cottage` |
| 代码 | `builds/20261029-11245814ea22`，`current`指向该目录 |
| 持久数据 | `data/`，SQLite在`data/cloud/cottage.sqlite` |
| 运行时 | `runtime/node-v24.22.2-linux-x64/bin/node`，独立于系统Node16 |
| 配置 | `/etc/marshmallow-cottage.env`，root权限0600 |
| 启动定义 | `/etc/systemd/system/marshmallow-cottage.service` |
| 应用上游 | 内网指定接口HTTP端口18080、根路径`/` |
| 资源版本 | `r-f0558753cab3a6e4138e8a7a82fffb0730b26a6f2a1621893588caa25f78171c` |

代码135文件／1,462,821字节，静态release为126文件。整体代码hash为`11245814ea226c5fe4956f4851a0ff823b3429fdf23e6893df1dd3e65023cc40`，它包含后端和根worker模板，不仅是前端release。部署身份另保存在服务器`deployment.json`。

运行时来自Node官方发布目录，经SHA-256核对并在目标主机实测SQLite、备份接口及scrypt；未替换系统Node。服务限制单CPU配额和512MiB内存，代码与运行时只读，持久数据单独可写。数据库目录700、文件600。Docker拉取连接超时，因此本次实际采用systemd直接运行；未修改Docker全局配置或其它服务。

## 检查与重启

通过已确认的SSH方式登录应用服务器后：

```sh
systemctl status marshmallow-cottage.service --no-pager
journalctl -u marshmallow-cottage.service -n 50 --no-pager
systemctl is-enabled marshmallow-cottage.service
```

需要重启时：

```sh
systemctl restart marshmallow-cottage.service
```

服务用SIGTERM正常停止，会等待数据库一致性备份；停止超时45秒。健康接口检查活动发布资源，不能代替账号数据库写入检查。日志不应加入密码、Cookie、完整存档或生日／相册。

## 备份

应用启动、每24小时和正常退出自动生成一致性备份，保留最近7份。手动备份：

```sh
cd /home/marshmallow-cottage/current
runuser -u mc-cottage -- /home/marshmallow-cottage/runtime/node-v24.22.2-linux-x64/bin/node server/cli.cjs backup --data-dir /home/marshmallow-cottage/data
```

备份仍与主库同盘。外部灾备尚未配置；备份文件不能放入公开目录。灾难恢复必须先停止服务、保留原库及WAL／SHM，使用一致性备份并在对外启动前轮换epoch，轮换epoch同时撤下所有公开小屋，防止恢复旧库让已经撤下的链接重新出现；主人恢复后需主动重新公开。细节见[后端说明](../../server/README.md)。

## 更新与回滚

本次保留上版`builds/20261029-771ac57a2f8c`、只读邻居版本和更早首个版本和各自release供代码回滚。旧代码一致性备份后停服务，本次没有修改SQLite结构，user_version保持1；在内存中比较accounts、sessions、saves、versions、mutations、auth_limits、metadata、publications八张原表完整内容hash，逐表不变。此前只读邻居阶段曾新增publications表，历史见验证记录。没有上传本机数据库或回拨修订。更新记录和原指针保存在服务器私有`deployments/`目录。

以后更新时继续保留原代码目录、current指针、活动release和配置，先做数据库一致性备份。程序放到新build目录，以服务用户prepare新release；停服务、激活版本、切代码指针后再启动验收。失败时恢复旧代码指针与旧活动release，不回拨SQLite、不清浏览器数据。数据合同不兼容的旧网页会保留本机进度并拒绝同步，不能为绕过门禁强制覆盖。

更改资源后需同步源指纹；程序上传仅包含入口、其125个资源、根sw.js和8个server模块。不要上传本机测试库、个人JSON、文档、测试或截图。数据库与备份始终保留在固定data目录，不能随着代码同步覆盖。

## APISIX交接与剩余验收

代理上游使用HTTP18080，根路径`/*`原样转发；包括API、releases、sw.js和离线壳。不得把缺失资源重写为HTML，不缓存API，保留Cookie、ETag及条件请求头，上传体积至少允许4MiB。服务的唯一HTTPS Origin已在私有配置中按用户提供的网址设置，Cookie保留Secure／HttpOnly／SameSite Strict。

用户配置APISIX后，初次证书/空404故障已恢复。当前正常证书校验、正式HTTPS根页面/版本/健康及全部126个发布文件HTTP hash通过，公开参观入口和独立实时认证可用；现有Chrome此前实际打开正式串门入口，本轮正式HTTPS额外验证在线目录/安全称呼、两成员聊天、屋主离开/最后离开清理、重启清空在线和旧peer409、主动重加及私人revision/hash保留。测试账号精确清理后再次一致性备份；证据见[验证记录](../verification.md)。没有修改用户DNS、路由器或APISIX配置。

上游内网HTTP验收使用独立客户端显式携带Cookie，仅证明API及Cookie属性，不代表浏览器可直接用内网HTTP登录。

实际实时更新验收：135源文件与126发布文件hash一致，服务active/enabled且以mc-cottage运行；正式HTTPS两账号同屋走动、双向聊天、身份白名单、主人请离/限制重入通过。挂起轮询在停服务时503释放；重启后登录、私档revision/hash和公开小屋保留，旧peer返回409，主动重加生成新peer，聊天清空。精确清理本轮合成两账号，其他数据hash不变，随后一致性备份。旧19项HTTP/122文件为历史检查，不冒充本次结果。详情见[验证记录](../verification.md)；两台物理设备、Safari、长期运行和外部灾备仍待实际验收。

## 实时串门运行边界

沿用同一HTTP上游和API路由，无新端口/依赖或WebSocket配置。长轮询最长8秒，事件即时响应，API必须no-store，代理超时需容纳完整8秒等待。每屋8人、最多64屋/256成员，35秒无有效活动会清理；位置/聊天只在内存，聊天不落SQLite或日志。离页尽力leave，TTL负责最终清理。更新/撤下公开快照关闭房间，退出/过期/epoch变化结束成员。重启后需主动重加；实时消息清理不影响游戏进度。见[实时合同](../realtime.md)。

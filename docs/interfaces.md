# 当前模块接口

前端脚本使用IIFE与window.Game。加载顺序以index.html为准：namespace→balance/content→furniture-expansion/residents-expansion/progression/achievements及其它数据→utils/bus/store/public-house/save/cloud-sync/live/offline/audio core→systems及各规则→resident-wishes→quests/creative/gifts/collection-book/photography规则→atmosphere/festival/exterior/room-space/creative/room-shell/furniture-extra/resident-extra→scene→live-avatars/avatar/yard渲染补充→controls/各玩法UI/residents/quest-party/quests/creative/gifts/collection-book/photo-editor/photography→cloud-account/neighbors→ui→live-room/visit→main。render/avatar.js必须在scene.js后加载以保留drawAvatar接口；心愿规则须在avatar与小游戏规则后加载；systems/quests.js覆盖早期systems.js里的任务接口，必须在其后。禁止第三方前端依赖和ES Module；仅可选cloud-sync、live与offline模块允许同源fetch/Service Worker，file入口不发云存档、邻居或联机请求。cloud-account与neighbors UI在根ui.js前加载，live-room与visit在main之前；启动编排以当前main.js为准。第一局house.floors=[{slots:[null,null,null]}]、rooms={}。入口本地JS/CSS带内容指纹查询参数，源文件修改时同步指纹以避免旧缓存混用。当前入口104 JS + 21 CSS，共125资源、126份发布文件；生产上一版122文件验收保留为只读参观阶段记录。

## Core
- Game.bus.on(name, fn) 返回 unsubscribe；emit(name,payload)。
- Game.store.init(raw) 迁移/默认状态，update(fn,options?) 校验后更新并发 state:change；options.persist=true且安装save模块时，先commit到本机，失败抛错且状态/事件不提交；replace(raw,options?) 校验后替换；defaultState()；所有玩法持久修改必须走 update，可靠切档走save.restore/importFile/reset。setWriteGuard(fn)、canWrite(source?)、writeReason(source?)由可选同步层安装写入保护，update/replace与save落盘都检查，不能只拦网络上传。
- Game.save.load() 返回已解析状态或 null；init() 安装定时和关闭保存；flush()；commit(next) 在状态发布前验证并写入、返回boolean；exportJson()；importFile(file) Promise；exportMemory() 下载 MD；reset()。Game.save.status 字符串。2026-10-29导入/reset共用先validate→commit成功→replace的切档边界；拒写或损坏原文保护时返回ok:false，不清runtime/撤销、不发导入成功。异步读取期间若Game.state变化拒绝迟到覆盖；并发导入/reset互斥，任何读取异常后均解锁。目标落盘后sys.init只作原有日常补算，若初始化异常返回ok:true附warning，如实说明目标已保存；UI持久显示提醒。
- Game.save.commit(next,options?)成功后同步发`save:committed {state,json,source}`；持久事务尚未发布新Game.state时，消费者须用事件中的已落盘快照。snapshot()返回当前存档键经校验的`{state,json}`或null；restore(raw,{source:'cloud'})同步执行可靠切档并返回`{ok,message,warning?}`。loadFailed标记原存档读取失败，恢复完整档前阻止临时空屋自动上传。
- Game.utils.uid(prefix), clamp(n,a,b), shade(hex,amount), dateKey(), escapeHtml(str), utf8Bytes(str)。
- Game.data.balance：roomWidth=320,roomHeight=220；所有经济数值集中于此。
- Game.data.rooms 数组 {id,name,icon,unlockLv,price,tags}；furniture 数组 {id,name,template,theme,category,place,w,h,surface,price,currency,comfort,recolor,tags,unlockLv}；furnitureById；themes 对象以 id 索引 {id,name,icon,palette,motif}；residents 数组。
- Game.data.audio 保存音色、混音、白天/夜晚原创乐谱；Game.data.minigames、minigameRewards、minigameFlowers 保存四款游戏配置与统一奖励；Game.data.crops、cropById、gardenConfig 保存 12 种作物与花圃规则。

## Audio and speech

- Game.audio.init() 幂等安装状态、页面可见性与声线更新监听，不创建 AudioContext；unlock() 在交互后创建/恢复上下文，返回 Promise<boolean>。重复解锁不叠加音乐调度器。
- Game.audio.play(kind) 支持 click、soft、success、level、preview、shutter；preview 为约 2.65 秒的柔和音色示范。点击音延后合并，同一操作的全局点击声与成功声不重复叠播。
- Game.audio.refresh() 应用音量与昼夜设置；toggleMute() 保存本次页面内的原音量后切换静音；stop() 停止音乐、音效与朗读。设置变化订阅 state:change；切后台和静音立即取消未播声部并淡出正在发声的总线。
- Game.audio.getVoices() 返回原生 SpeechSynthesisVoice[]，只含 localService=true 的常规中文声线，排除英文、在线及 Eddy/Flo/Grandma/Grandpa/Reed/Rocko/Sandy/Shelley 等角色效果声线。按普通话、增强/自然/Siri 标记、Tingting 等信息排序；没有可用声线时返回空数组。
- Game.audio.speak(text,{manual:true,key?,voiceURI?}) 主动朗读指定正文；manual=true 无需启用 settings.tts。同一个 key（缺省为清理后的正文）再次调用会停止。返回 {ok:true}、{ok:true,stopped:true} 或 {ok:false,message}。voiceURI 仅能从已筛选声线中选择，旧的无效选择回落自动选择；没有常规中文声线时明确失败，不使用英文或在线语音。
- Game.audio.stopSpeech() 取消当前台词和待播分句，恢复音乐音量。朗读清理表情装饰、使用正常语速与音高、句间适度停顿并压低配乐；无真人录音，不能保证真人质感。
- bus speech:change 发 {speaking,key,voiceURI,reason:'started'|'stopped'|'finished'}；audio:voices 发更新后的声线数组。取消后的旧回调不改变新台词，结束/停止事件只发一次。
- Game.ui.audio 指向 Game.audio；ui.speak(text,source?) 转为 manual=true。所有可见「听一听」均为主动播放，没有自动朗读触发；settings.tts 仅保留作兼容字段。

## Systems
- 所有操作返回 {ok:boolean,message?:string,...}，失败不修改状态；UI 负责 toast。
- Game.sys.building.buildRoom(floorIdx,slotIdx,type), demolishRoom(roomId), changeRoomType(roomId,type), capacity() 返回 {floors,slots}。
- Game.sys.decorating.place(defId,roomId,x,y,parent?,depth?)、move(roomId,uid,targetRoomId,x,y,parent?,depth?)；仅 floor 接受数值 depth∈[0,1]，非法值或给其它类别传 depth 会失败且不改状态。新摆放缺省 .75，移动缺省保留原深度。canonical y 仍为 floorLine-def.h，实际画面位置由 roomSpace 投影。
- decorating.preview(defId,roomId,x,y,parent?,movingUid?) 返回吸附后的 {x,y,parent}，不写状态；remove/recolor/flip/layer/wallpaper/floor/undo/score 接口保持不变。台面坐标与子物随父件的 canonical 位移由系统处理；渲染时子物继承父缩放和深度。
- Game.sys.economy.buy(defId, expectedPrice?), reward(coin,exp,reason), addExp(exp)。
- Game.sys.residents.eligibility(id) 返回 {ok,message}；invite(id,roomId), chat(id) 返回 text；pat(id), gift(id,cropId?), collect(id), tick(now)。gift 缺省赠送草莓蛋糕，传 cropId 则扣减 garden.harvest 中的一份收获；每位居民每日赠礼一次，喜爱作物好感 +20、普通作物 +8，生日翻倍。
- Game.sys.quests.list() 返回主线及每日任务，claim(id)校验当前任务并原子领取；详细字段和新增成就接口见下方「主线、成就与每日宝箱」。
- 系统 init() 统一 Game.sys.init()（每天重置/离线补算/事件监听）。
- store.update 后 state:change；building/decorating 等发 room:built、item:placed、resident:moved_in、minigame:finished；重要操作写入 state.memories（{at,text}，最多200）。

## Minigames

- Game.sys.minigames.begin(id) 返回当前运行期 sessionId，未知 id 返回 null；finish(id,{score,stars,sessionId}) 验证并结算一次，返回 {ok,id,score,stars,coin,exp,half,sessionId}，重复结算返回 {ok:false,duplicate:true,message}。
- id 为 bakery、match3、catch_stars、memory。各游戏每天前 5 局完整奖励，一至三星分别为 30/60/100 糖果与 10/20/30 经验，其后减半。结算更新最高成绩、每日局数、日期并发 minigame:finished。
- rules 暴露纯规则：adjacent/matches/swapped/validSwap/findMove/createBoard/reshuffle/clearRound/refill 处理消消乐，shuffle/memoryStars 处理翻牌，scoreStars/catchEffect 处理星级与接物效果；配置从 Game.data 读取。
- Game.ui.minigames.catalog() 返回包含 locked/unlockText 的游戏列表；start(id,options?) 进入游戏，翻牌可传 {difficulty:'easy'|'normal'|'hard'}；isRunning() 返回当前是否在玩三款新增游戏。
- 新增游戏有 3 秒准备、暂停、后台自动暂停与提前结束一星结算；关闭弹窗释放动画、事件和延时任务。局内状态放 Game.runtime.minigames，不写入存档。蛋糕仍由 Game.ui.bakery.start()/isRunning() 提供界面，使用统一 begin/finish 防止重复奖励。
- 真实bakery session成功结算后，quests.stats.bakeryPlays加1、bakeryOrders加本局合法score；重复session、其它游戏或非法成绩不计蛋糕局数/订单。主线首局蛋糕检查bakeryPlays，小厨师成就检查bakeryOrders。

## 主线、成就与每日宝箱（2026-10-28）

- `Game.data.mainQuests`为五章35条任务（8/6/7/7/7），保留17条旧任务ID、相对顺序与已有奖励。任务包含`id/chapter/title/description/metric/target/reward/action`，可选`conditions:[{metric,target,label}]`、`rainbow`、`ending`。复合任务必须全部满足，章节数据与开篇/章末故事在`storyChapters`，七色定义在`rainbowFragments`，派对谢幕在`rainbowEnding`。
- `Game.sys.quests.metric(name)`从当前房间、居民、收藏、服装、彩虹或真实行为统计推导数值；`list()`返回主线和每日项，附`type/progress/target/done/claimed/locked`。复合任务另有各条件的`progress/done`，总进度按完成条件数计算。已领项维持完成显示；主线只解锁首个未领ID，不用已领数量跳过插入任务。
- `quests.claim(id)`成功返回`{ok,message,reward,chapterCompleted,endingUnlocked,milestones}`。验证达标、次序、货币和背包容量后，一次更新领取凭据、碎片、奖励、等级与里程碑；失败无副作用。`chapters()`返回章节定义及`done/total/available/complete/storySeen`；`markStorySeen(chapterId)`只接受已解锁章节。`ending()`返回`{unlocked,seen}`；`markEndingSeen()`仅在35条主线和七色齐全后记已看，重复调用不重发奖或追加同一回忆。
- `Game.data.achievementCategories`为建造、收藏、朋友、烘焙、园艺、游戏、时尚、摄影八类，每类五阶；`achievements`共40项，ID为`<category>_<1..5>`，带`category/tier/metric/target/reward`。`Game.sys.achievements.list(category?)`附`progress/done/claimed/locked/available`；`claim(id)`必须按同类阶梯领取；`categories()`附`done/total/ready`；`summary()`返回`{done,total,ready,milestones}`。8个顶阶各发一件限定家具；`milestoneRewards`中的`rainbow`和`home_master`在主线领取时自动原子发奖，两者各有一件纪念家具，共10件，拥有权和收藏同步记录。
- `quests.dailyChest()`返回`{done,target:3,claimed,available,reward}`，done为已领取每日任务数；`claimDailyChest()`在当天三项全部领完后一次性发`dailyChestReward={coin:80,exp:30,heart:5}`。新日重建清单和宝箱，回拨至未来清单之前的日期时锁定，不追发旧日宝箱。
- 发`quest:claimed {id,chapterCompleted,endingUnlocked,milestones}`、`quest:daily_chest {}`和`achievement:claimed {id,reward}`；等级变化发`level:up`。领取凭据是存档事实，显示进度从当前真实状态推导，不能通过UI显示属性发奖。
- `Game.ui.questBook.panel({doAction,navigate})`返回成长小册，分主线/每日/成就三页签，使用自定义章节/类别选择器、当前任务与折叠清单、进度和限定家具缩略图。`story(chapterId,mode='opening')`逐句手动翻页，mode为completion时读章末故事；仅点击「听一听」朗读当前正文，换句或关闭停止朗读。`Game.ui.questParty.open()`或`questBook.party()`打开可重播12居民派对与五句谢幕，不再次发奖；关窗释放帧循环、监听和人物缓存，24帧上限、后台停绘、减少动态时静态显示。
- 集齐七片后`Game.atmosphere.sky()`画常驻七色彩虹，不再依赖当天雨后条件；夜间降低亮度。未齐时仍使用原雨后彩虹规则。

## 相册与离屏取景

- `G.data.photoFrames`为none加8相框；`photoStickers`共20种；`defaultPhotoDecor()`、`validatePhotoDecor(value)`统一严格装饰数据。`G.draw.photoDecoration.draw(target,base,decor)`合成相框、贴纸和文字，`stickerBox()`提供同一命中矩形。
- `G.render.captureScene({scope:'house'|'room'|'view',roomId?,width?,height?})`默认1280×960重新绘制纯场景；房间包含对应居民与玩家。finally还原主镜头、尺寸、命中与天气缓存，不推进世界人物或增加循环。生产UI开放整屋/指定房间。
- `sys.photography.prepare({scope,roomId?,fresh?})`返回`{ok,canvas,width,height}`，缓存一个底图；`clearDraft()`清理。`paint(target,decor,base?)`只合成缓存图，拖动时不重画世界、不编码。`preview(options?)`返回小JPEG不记拍摄。
- `capture({decor,...framing}?)`在前台、容量未满、距上次成功快门至少1秒时原子保存；返回`{ok,photo,message}`，只在成功时增photos/每日进度/回忆并发`photo:captured {id,at}`。新图未装饰JPEG480宽/最高600、每张URL≤120,000字符；`runtime.latestPhoto={id,canvas}`缓存最新较大底图，换档清除，不写JSON。
- `list()`、`trash()`返回深拷贝；`base(id)`异步提供未装饰底图；`image(idOrPhoto,{decor?}?)`合成供相册显示的小JPEG。`updateDecor(id,decor)`、`rename(id,name)`只改活动相册，不加photos；名字1～30码点。`remove(id)`移到回收夹，`restore(id)`恢复，两个列表各12张；均不减累计数、不自动覆盖。`purge(id)`仅永久删除指定回收照片，产品UI必须先明确确认。
- `download(id)`异步合成PNG并走Blob下载，最新runtime图保留较大尺寸，其它按持久小图重建。`ui.photography.open({mode:'album'})`打开相册，缺省/`camera`进入`ui.photoEditor.open()`。关闭编辑器清理RAF/监听/计时器/底图并恢复HUD，减少动态关闭闪白；成功快门播放一次shutter。

## 收藏图鉴

- `state.collectionBook={crops:[],themeClaims:[]}`只持久化已收获品种和已领主题。家具历史沿用collection，居民沿用residents记录（搬走仍保留），服装沿用avatar.owned。旧档实物家具与正数收获在store.validate提交前补齐，和容量校验一起成功/拒绝。真实harvest在同一次store.update写入收获和发现；不靠事件二次提交。
- `sys.collectionBook.init()`保留统一启动接口，当前不新增监听或迁移事务。`summary()`返回四类`{id,name,done,total,percent,...}`；`get(kind,id)`返回派生详情；`list({kind,status,theme,category,query,page})`页码从1起，返回`{items,total,page,pages,pageSize:24}`。未知名字返回？？？，搜索只匹配可见线索，UI的aria也不暴露真名。
- `themes()`返回9主题的`done/total:38/percent/complete/claimed`；`regularIds(theme)`排除庭院/节日/rewardOnly。`claimTheme(id)`校验38件历史与钱包容量，原子发500币、凭据和回忆；重复/未集齐/超限失败无副作用，成功发`collection:theme-claimed {id,coin:500}`。
- `ui.collectionBook.panel({doAction,navigate})`返回标准抽屉配置，支持四类预览、未知剪影、筛选与分页；详情`action`使用panel/itemId/theme/shopTab/residentId/outfitId/category/tab/milestoneId。主UI统一导航到真实商品/居民/花园/衣橱/成就，特别里程碑展开对应礼物。

## 创意画板与作品引用

- `data.creativeConfig`集中16格、24色、20幅、Lv.7/画室、50步编辑历史、512导出及固定编码。`symbols='0123456789abcdefghijklmn'`，`.`透明；`validCreativePixels/validCreativeName/validateCreativeArt`统一格式。
- `state.customArts`最多20条严格`{id,name,pixels}`；唯一ASCII ID，名字1～20码点/≤40UTF16/单行，pixels严格256个`.0-9a-n`字符。内部`furnitureById.custom_art_frame`为wall/66×66/static customArt定义，只在索引注册，不进402家具数组、普通库存或收集历史。
- `sys.creative.status()`返回`unlocked/reason/count/maxArts/hasStudio/unlockLv`，新创作/编辑/应用需Lv.7且有studio。`list()/get(id)`返回拷贝；`save({id?,name,pixels})`新建或原位编辑；`rename(id,name)`；`download(id)`异步导出512透明PNG。已有作品的查看/下载在拆掉画室后仍可用。
- `place(artId,roomId,x?,y?)`默认墙中央，返回`roomId/uid/artId`；全局每作品最多一挂件，常规room.items新增artId字段，现有move/flip/layer/remove/命中沿用。新挂画计真实itemsPlaced，普通收起/拆房不新增通用库存，作品仍在画册。`placement(id)`定位现有实例。
- `wallpaper(roomId,artId)`设置`{pattern:'custom',color,color2,artId}`，重复同作品不刷统计；`remove(id)`原子删除作品和所有挂画/墙纸引用，墙纸恢复solid保留底色。三者成功清装饰undo，防旧房间快照恢复孤立引用；产品删除前须明确确认。
- 新模块所有正式写入使用`store.update(fn,{persist:true})`，实际setItem拒写时作品/引用/统计不提交。成功发`creative:changed {id,type}`，放置另发item:placed、墙纸另发room:decorated；保存/改名不刷摆放计数。
- `draw.creative.drawPixels(ctx,pixels,x,y,w,h)`、`drawFrame(ctx,art,x,y,w,h)`、`tile(pixels)`、`clearCache()`；最多20张16×16缓存，像素不平滑。scene.drawFurniture按实例artId绘画框，roomShell裁切平铺，房壳缓存key含art.pixels，编辑自动失效；没有额外世界循环。
- `ui.creative.open()`画册，`open({mode:'editor',id?})`画板。Pointer单笔Bresenham连线/单次undo，填充最多256格；单焦点方向键+Space，B/E/F选工具，Ctrl/⌘Z撤销。`runtime.creativeDrafts`按作品/新作隔离，关窗保留本页草稿、换档清除；正式像素进JSON，草稿/历史/光标不存档。关闭释放监听/RAF/Canvas，减少动态禁过渡。

## 惊喜礼盒

- `data.giftConfig`集中200付费/300全收回礼/库存9999/钱包1e9/1250ms防连点与动画预算；`giftPool(level)`筛当前等级正常非rewardOnly/非festival/非custom家具，最高等级共362件，当前已收按collection历史。
- `state.giftBox={date,freeUsed,opened,lastReward}`严格4键；旧缺字段用daily.lastLoginDate/freeBoxUsed迁移。date只前进，状态查看不写档，跨日实际开盒时原子更新；回拨只禁止新免费，200付费仍按规则可用。daily.freeBoxUsed保留兼容镜像，giftBox为权威。
- `sys.gifts.status()`返回`date/savedDate/freeAvailable/freeUsed/clockBehind/cost/coin/remaining/total/opened/lastReward/canOpen/reason`；`open()`返回`{ok,message,reward,cost,free}`。在一次持久事务内扣币/送物/点亮收藏/记免费/累计/最近receipt/回忆，失败不占免费或冷却。成功1250ms冷却，state:change及gift:opened事件重入不可再开。
- receipt严格6键`{id,at,kind,itemId,coin,paid}`，kind为furniture或coin；家具必须正常已收ID且coin=0，糖果必须itemId=null/coin=300。免费/付费均可全收回礼；累计上限/余额/库存/钱包/字节或字符容量/真实存储拒写均在提交前失败。成功发`gift:opened {reward,cost,free}`。
- `latest()`返回receipt拷贝，`init()`无定时器。`ui.gifts.open()`弹窗，`content()`用于商店礼盒页，`panel()`标准配置。提交后再建独立结果modal，CSS摇盒/抬盖/16彩带，skip直接展开；关闭清理两个timeout/RAF/监听，后台/减少动态立即展开结果。重看只展示，不调用open或再发奖。

## Garden

- Game.sys.garden.init() 幂等补齐花圃并监听升级/换档；capacity() 返回 6 或 9，Lv.6 开放操作，Lv.14 扩展；hasGreenhouse() 判断已建温室，isNight(now?) 按设备当地 18:00—次日 06:00 判定。
- plant(index,cropId)、water(index,now?)、harvest(index,now?)、buySeeds(cropId,count)、sell(cropId,count) 返回 {ok,message,...}；索引从 0 开始，规则校验失败不改变库存或金币。种子和收获字典使用作物 id，库存上限 9999。
- status(index,now?) 与 plots(now?) 返回花圃派生状态：empty/locked/crop/stage/mature/needsWater/progress/remainingMs 等；timeline(plot) 返回三个阶段的起止时间和 matureAt。种植时记录 plantedAt/durationMs，每阶段一次浇水将该阶段当下剩余时间缩短 30%，不改写之后阶段的基础时长。
- 温室在播种时使 durationMs=round(crop.growMs/1.2)，不会追溯加速旧作物；成熟收获获得 1 份库存和 3 经验。星星果限夜间播种。离线生长由真实时间戳推算，不依赖页面运行定时器；收获仍需主动操作。
- 发 garden:planted {index,crop}、garden:watered {index,crop,stage}、garden:harvested {index,crop,count}、garden:seeds_bought {crop,count}、garden:sold {crop,count,coin}。种植、收获、售卖和赠礼记录进入 memories。
- Game.ui.garden.panel() 返回 {title,subtitle,content}，包含小花圃/种子铺/收获篮；openPlot(index) 对应场景地块的播种、浇水、收获或面板定位；refresh() 更新进度，drawCrop(...) 绘制程序作物。面板计时器在收起后释放。

## Persistent state additions

- minigames 固定含 bakery/match3/catch_stars/memory，每项 {best,playsToday,date}。局内棋盘、倒计时、暂停和选牌不恢复。
- garden={plots,seeds,harvest}；plots 为 6/9 格数组，空格为 null，种植项 {crop,plantedAt,durationMs,watered:[null|timestamp,null|timestamp,null|timestamp]}。不得持久化派生进度；读档后按时间推算。
- settings 新增 audioVersion:2、ttsVoice:''，新默认 music:0.22/sfx:0.45/tts:false。旧音频设置迁移时保留静音与更低音量，清空旧声线并关闭旧朗读偏好。
- settings.dayMode 为 real/day/night；calendar.claimed 以 `年:节日` 或 `年:resident_birthday:居民id` 保存一次性领取。调试日期、小时、天气、节日仅在 Game.runtime.timeDebug，不持久化，不改变花园生长与日常经济使用的真实时钟。
- floor 家具新增 depth，缺失旧值补 .75；wall/ceiling/table 不保存独立 depth，table 有父件时继承其视觉变换。JSON 保留 canonical x/y、父引用、depth、z；渲染坐标不写回存档。
- avatar 保存 skin/hair/hairColor/face/top/bottom/dress/shoes/acc/outfits/owned。data.validateAvatar(raw) 严格校验并返回归一化对象；owned 只含已知服饰 id→true，旧空 owned 幂等补固定五件基础服饰，不发货币。acc 最多四件且 head/face/back/bag 每槽一件；旧字符串配饰转数组。dress 与上下装互斥，无 dress 时上下装必须完整。outfits 最多三格，可空槽 null，非空为带 name 的外观快照；快照不可带 owned 或 outfits，也不能引用未拥有服饰。
- house.exterior 保存各类别当前 id、roofColor/wallColor 和 owned；同版本旧档只补默认拥有权。house.yard.items 使用世界绝对坐标 {uid,defId,x,y,z,flip,color}，不能混入室内家具列表；前院最多120件，室内与前院总量受 balance.maxItems=1000 约束。
- quests.main保存`{schema:2,chapter,index,claimed,storySeen,endingSeen}`，index必须等于首个未领取任务的位置（全领为35），claimed只含已知且不重复ID。旧无schema档按ID保留领取凭据并计算补位index，chapter不会倒退，不重发已领奖励。storySeen为不重复且不超过已解锁chapter的章节号；endingSeen=true必须35条与七片齐全。
- quests.achievements只接受已知成就ID→true，并要求同类别所有前阶也已领取；quests.milestoneClaims为不重复的`rainbow/home_master`ID列表，分别校验七色或全部主线门槛。rainbowPieces只允许七个已知不同颜色；全部主线已领必须七色齐全。quests.daily保留`{date,list:[{id,progress,done,claimed}],chestClaimed}`，宝箱已领须有三项已领任务。
- quests.stats新增bakeryPlays/bakeryOrders/photos。旧无烘焙累计字段时，只以已保存的best与playsToday推导可确认下限，不臆造完整历史；新局按真实结算累加。album与albumTrash各最多12项，ID跨两册唯一；旧照片保留六键`{id,at,name,image,width,height}`，新照片可增加decor。宽高1～600、JPEG URL≤120,000字符、全部图片URL≤2,880,000字符，photos不少于两册现存总数。decor严格三键`{frame,caption,stickers}`；caption≤30码点且单行，stickers≤20，严格`{uid,stickerId,x,y,scale}`，位置0..1、scale .4..3、uid唯一。collectionBook严格两键/唯一已知ID，已领主题必须有38件常规历史。紧凑JSON≤3MiB UTF-8且≤2,500,000字符；作品与礼盒字段见对应段落；大底图、草稿、选中项和派对动画不写JSON。
- 同版本旧档补齐整款缺失的游戏和空花圃，Lv.14 自动补至 9 格；已有种子字典原样保留，不能因合并默认值重复送种子。新增字段仍做类型、作物 id、时间线和库存校验；未来/不兼容存档拒绝载入。
- JSON 是以上全部持久状态的恢复依据；Markdown 是小屋概况、主线与已读章节/派对、已点亮成就、相片名字与配文/贴纸数、图鉴进度和套装徽章、种子/收获库存、花圃阶段、小游戏最高成绩和 memories 派生的可读记录，不包含相册图片，不作为完整存档。

## Renderer and input
- Game.render.init(canvas)；start()；resize()；drawThumbnail(canvas,defId)；drawCharacter(canvas,id)；drawAvatar(canvas,avatar?,options?)。
- Game.render.camera：worldToScreen(x,y),screenToWorld(x,y),fit(),zoom(factor),focusRoom(roomId),focusGarden(),focusYard()。
- 世界房间格宽320高220；floor0 左上(-480,-220)，slot s 左上(-480+s*320,-220-floorIdx*220)。家具 x/y 相对房间左上。
- Game.runtime.mode='explore'|'decorate'|'build'|'garden'|'yard'；室内 selected={roomId,uid}|null，前院 selected={yard:true,uid,roomId:null}；placing=defId|null；activeRoomId=roomId|null。
- 场景点击空格 bus.emit('scene:empty',{floorIdx,slotIdx})；房间 bus.emit('scene:room',{roomId})；家具 bus.emit('scene:item',{roomId,uid})；居民 bus.emit('scene:resident',{id})。
- UI 按背包室内物品设置 runtime.placing，panel.close({keepPlacing:true}) 后 focusRoom(activeRoomId)。原生拖放保留三种 dataTransfer 类型，在下一帧收起来源面板。Canvas 点击/拖放调用 decorating.place，成功清除 placing 并选择新家具，emit scene:placed；panel:change 的 {open,height} 调整可见区域。拖动家具时不因刷新保存而重置相机。
- floor 工具栏提供靠里/靠前 range，0..1、步长 .01；input 只更新读数，change 单次 move 保存，避免一轮滑动生成大量撤销项。data-cute-control=depth 让刷新保留同一控件和焦点。
- Game.render effects 监听系统事件绘制粒子。若 drawThumbnail 提前不存在，UI 的 requestAnimationFrame 内调用。

## UI
- Game.ui.init()，Game.ui.open(name,options?)，名字 build/decor/residents/shop/play/garden/avatar/yard/exterior/quests/settings/memories/collection/help/cloudAccount/neighbors。
- Game.ui.toast(text)，confirm(text) Promise<boolean>，modal({title,content,speechText?,onClose})，panel.open({title,content,onClose}) / close({keepPlacing?:boolean})。DOM 弹窗只朗读显式 speechText；纯字符串 content 可直接作说明正文。关闭弹窗会调用 stopSpeech，不把整个 body.textContent 拼接为台词。
- Game.ui.refresh() 渲染 HUD 与当前面板，订阅 state:change；Canvas 场景事件绑定打开对应面板/家具工具栏。
- UI 创建内容必须转义用户文本，使用 textContent 优先。所有按钮至少48px，保持 keyboard focus 和原生 form 语义。
- Game.ui.bakery.start() 60s 倒计时，提前结束结算仍有1星；完成调用 sys.minigames.finish 统一奖励、更新记录、发 minigame:finished；做出的蛋糕还可用于居民赠礼。

## Root-owned DOM
header#hud：#house-name 按钮、#level-label、#xp-fill、#xp-label、#coin-count、#heart-count、#save-status、#sound-toggle、#settings-button。
账号UI在#world前插入section#account-bar：#account-entry显示登录/注册或账号与同步状态，#neighbors-entry打开邻居列表，正文说明不登录也能玩。
main#world：canvas#scene，#scene-hint，#quest-button，#zoom-in、#zoom-out、#zoom-fit，#guide-button。
nav#dock：button[data-panel=build|decor|residents|play|garden|shop|memories]。
section#panel.hidden：#panel-title、#panel-subtitle、#panel-close、#panel-body；div#modal-root、#toast-root、#selection-tools。
Root main.js首先用visit.shouldStart()识别参观路由并调用visit.init()后返回；此分支发生在cloud.prepare、save.load、store.init、sys.init及租约/自动保存之前。主人入口继续cloud.prepare→store.init(save.load())→可写时sys.init（含garden/time初始化）→render.init→ui.init（含audio.init）→save.init→cloud/offline/cloudAccount.init→render.start。data/audio.js必须早于core/audio.js；data/garden/calendar/outfits/yard/exterior必须早于store.js；规则与常规UI脚本须在ui.js前加载。

## M8 时间与气氛

- Game.sys.time.current(now?) 返回 {date,hour,phase,nightness,season,weather,baseWeather,rainbow,festivals,birthdays,debug}。phase=day/dusk/night；真实6–18为白天、18–20黄昏、20–6夜晚，18–20与5–6平滑过渡；固定白天/夜晚覆盖画面。weather 为 clear/cloudy/rain/snow/sakura/leaves，按日期与季节稳定取样。雨日15点后 weather=clear，20点前且非夜景时 rainbow=true。
- time.claim(eventId) 一次性发当前节日礼物；canBuy(def) 校验节日商品档期。init 幂等监听存档/设置与10秒日历刷新，发 time:change；setDebug({date?,hour?,weather?,festival?})/clearDebug 仅供调试界面。日期表内置2025—2035的春节和中秋，共22个日期，来源逐年记录在 data.lunarFestivalSources，按香港天文台官方对照表取值。
- Game.ui.calendar.open(eventId?)、notices()、maybeGreet() 提供节日/生日正文、商品缩略图与礼物入口；已领取按钮不重复发奖。
- Game.atmosphere.sky/weather/night(ctx,{width,height,time,reducedMotion,state,now?,lights?}) 在 CSS 逻辑像素坐标绘制并 save/restore；night 的 lights={x,y,radius?,strength?} 已是屏幕坐标。先绘天空，再绘房屋，最后叠加夜幕与天气。夜幕只在离屏画布 destination-out 挖光，不清除主场景；reset() 清缓存与粒子。

## M9 形象、外观与前院

- Game.data.outfits/outfitById 为60件服装；avatarSkins/HairStyles/HairColors/Faces 分别为4/10/12/6项。Game.sys.avatar.current()、buy(id)、equip(id)、removeAccessory(id)、setSkin(number)、setHair(id)、setHairColor(hex)、setFace(id)、saveOutfit(slot,name)、applyOutfit(slot)，slot=0..2。购买校验等级、余额和所有权，重复购买不扣币。
- Game.draw.avatar(ctx,avatarOrState,x,bottom,scale,{facing:-1|1,still,time}) 分层绘制同一手绘玩家；Game.render.drawAvatar(canvas,avatar?,options?) 按 CSS 尺寸和DPR绘缩略图。Game.ui.avatar.panel() 返回标准面板，未买商品只预览，点击购买后走正式 buy/equip。
- Game.sys.exterior.list(category)、owned(id)、buy(id)、equip(category,id)、color(part,hex)、rename(name)；类别 roof/wall/window/door/chimney，共31款。Game.ui.exterior.panel() 的未拥有试穿不写当前装备；拥有后选择即时保存。draw.exterior 负责程序外观预览与场景。
- Game.sys.yard.get(uid)、bounds()、position(def,x,y)、place(id,x,y)、move(uid,x,y)、remove(uid)、flip/recolor/layer；placeStroke(id,points,{buyMissing?}) 将栅栏/小路按网格补点，同格去重，先用库存再在明确开启 buyMissing 时按余额补购。Lv.11开放20种前院物件。Game.ui.yard.panel() 与场景前院工具对应。

## 2.5D 房间几何

- Game.roomSpace.item(roomData,item,def?) 返回房间局部 {x,y,w,h,scale,depth,footX,footY}。floor 默认 d=.75，s=.76+.24d，脚底 footX=160+(canonicalX+w/2-160)s、footY=142+68d；sprite 左上为脚底减缩放后的半宽/全高。
- roomSpace.placement(def,localPoint,grab?) 反解 canonical {x,y,depth}；grab={u,v} 是原sprite中的归一化抓点，缺省为脚底中心(.5,1)。投影层 clamp 0..1 后交给系统严格校验。wall/ceiling/无父table 保持原坐标且返回值无depth；tablePlacement(room,parent,childDef,point,grab) 依据父投影反算桌面 canonical 坐标。
- roomSpace.contains(projected,point,padding?) 与 grab(projected,point) 使用同一投影矩形；foot(canonicalCenterX,depth) 提供人物锚点；pointToDepth(y) 将脚底y映射到深度。台面子物投影=父投影左上+(子canonical-父canonical)×父scale，不另存depth。
- Game.roomShell.draw(ctx,roomData,options?) 只画320×220局部房间壳；后墙x38.4..281.6、y14..142，梯形地板后沿142、前沿212，脚底最大210留2px前沿。floorPath(ctx) 提供地板路径，plane(x,depth) 用于纹理收束。墙面/吊顶先绘，地毯最底，地面家具与人物按深度及层级排序，台面子物跟随父组。

## 轻资源开发约束

- 保留原生 Canvas 与手绘billboard，不引入WebGL/完整3D引擎、模型或外部资源下载。后台主场景停绘；通常30帧上限、减少动态12帧、小游戏期间主场景5帧。
- 房间壳按材质缓存，最多12份；天气雨≤68、雪≤42、花瓣/落叶≤26，减少动态最多8颗静止；夜幕离屏最大边1600、暖光最多64处。以上是代码预算，不能据此声称真实设备性能达标。
- 开发只复用一个4173服务和已有浏览器页面，不为验收另开测试端口；规则命令串行，画布模拟与浏览器QA分开记录。暂不打包。

## 居民心愿与内容扩充（2026-10-28）

- `Game.sys.residents.wish(id)`只读返回`{ok,id,definition,text,date,progress,target,done,claimed,locked,reward,missing,action}`；`claimWish(id)`验证并一次性领取当天奖励。六类为furniture/theme/food/flower/activity/outfit；食物与花朵领取时扣库存，不占普通每日送礼次数；家具/主题检查居民卧室。活动只计真实结算session，换装只计生成后实际穿上的目标服饰，购买或改发型不算。
- `friendship(id)`返回`{ok,level,affection,nextThreshold,progress,max,bestFriendBadge,steps}`，每步有threshold/unlocked/claimed/available/reward；`claimFriendship(id,level)`按1～5顺序领取且只能一次，故事返回story数组。角色解锁条件来自结构化admission；分房仍受卧室/床位容量约束。
- `Game.sys.residentWishes.init/refresh/reachable/counterKey`管理生成与动作基线。存档每位居民增加`wish={date,defId,generatedAt,baseline,claimed}`、`wishLastClaimedDate`、`friendshipClaims`、`bestFriendBadge`；奖励、描述与进度由定义推导，不接受存档伪造。旧占位心愿迁移为空，保留原好感。逻辑日期不按导入设备时区反推generatedAt，未来心愿锁定，旧日未完成心愿换为当天且不补发奖励。
- `avatar:worn`携带before/after服饰ID；`quests.stats`保存`wish_activity_<gameId>`和`wish_wear_<outfitId>`计数。午夜后的第一场活动/换装先刷新心愿，再增加计数。发`resident:wish_claimed`、`resident:friendship_claimed`事件。
- 新内容文件：data/furniture-expansion.js、residents-expansion.js、progression.js、achievements.js；render/furniture-extra.js、resident-extra.js；ui/residents.js。家具共402个定义，`rewardOnly`不进普通商店；10件限定家具由8类顶阶成就和2项主线里程碑各发一次。新增5房间仅装饰/解锁用途；当前35条主线与40成就接口见上文。
- `Game.draw.furnitureExtra`、`residentExtra`返回是否已处理，旧绘图保留；新居民画像尺寸来自portraitWidth/portraitHeight。`Game.ui.residentBook.panel(...)`与friendship弹窗提供名册、心愿与礼物入口；缩略图使用`data-resident`。商店/背包每页最多24个，改变筛选回第一页；心愿跳转装饰时重置为items背包页。
- `Game.render.layout.garden(count?)`集中草面/地块/桥/标题/访客坐标，`plotAt(point,count?)`供点击和悬停，`overview(floors?)`和`frame(bounds,width,height,padding?,maxScale?,bottomInset?)`供镜头与几何检查。实际容量仍6/9；中心(1000,143)、半径330×185、地块100×66。全景左右-710/1330，预留底部80px缩放栏；相机与花园绘制坐标不写入存档，旧前院bounds不变。

## 表单组件

js/ui/controls.js 先于ui.js加载，提供自定义选择器与颜色浮层。返回控件保留.value读写、change事件和data-ui-focus约定；更换面板时清理浮层，label通过aria-labelledby关联控件。滑块和勾选框保留原生键盘行为，通过appearance:none与主题CSS绘制。

## 阁楼、今日特惠与七日登录

- 新数据在store之前加载：data/observatory、deals、login；规则在systems之后；render/observatory在scene之前，三个UI在根ui之前。普通房间仍13种、最多12格，家具目录仍402件；天文台独立于house.rooms。
- house.attic 为null或严格三字段`{type:'observatory',paidPrice:1000,builtAt}`。state.observatory严格四字段`{fragments,observations,lastDate,lastDiscovery}`；初始0/0/空串/null。每次3碎片，fragments===observations*3；lastDiscovery严格`{id,at,date,fragments:3}`，与lastDate一致，6个有效幻想星座ID之一。
- sys.observatory.status()/build()/observe()/latest()/init()；建造需Lv17、1000币且未建，观星需夜晚且today>lastDate。真实昼夜或dayMode=night生效；漏夜不补，回拨拒领。建造/观察通过persist:true事务先保存，失败不发事件；busy防同步重入。事件observatory:built、observatory:observed。
- draw.observatory.draw(ctx,x,y,w,h,night)与drawConstellation()纯静态，无时钟与画布持有。render.layout.attic()/atticAt(point)、camera.focusObservatory()统一屋顶几何、命中与镜头；整屋离屏捕获同样包含阁楼。scene:observatory打开面板。
- sys.deals.list(date?)/status(date?)/priceFor(id,date?)按稳定ID池与日期种子抽6件，八折Math.ceil(price*4/5)，查询无写入，无持续计时器。池含所有等级的普通金币家具与庭院，排除节日/专属/内部画框，升级不换；priceFor非法或原型ID返回null。economy.buy检查自有商品ID、有限报价、等级、余额及9999库存，采用实际折价计扣款/经验；可传expectedPrice，跨午夜价格不同则失败且提示重新看价格。普通与特惠UI均传展示价；存储拒写整次回滚。
- state.loginRewards严格三字段`{claimed,lastClaimDate,lastReward}`，claimed累计0..1e9，下一份claimed%7+1。仅整个字段缺失才迁移；旧daily.giftClaimed=true映射claimed=1与原领取日期（无凭据null仅允许claimed≤1），忽略旧版单纯访问天数。新daily为兼容镜像，资格仅由loginRewards决定。
- 登录lastReward严格六字段`{day,at,kind,coin,itemId,seeds}`，day与claimed末位一致；金币为50/100/150/200对应第1/2/4/6，种子包严格雏菊3/郁金香2/草莓2（第3），第5/7必须普通fine/rare家具且已点亮收藏，其它字段为null/0。家具日期+累计领取种子固定，可能高于当前等级，收到即可摆放；满格不换奖、不消耗资格。
- sys.login.status()/claim()/latest()/description(reward)/init()；只在today>lastClaimDate时可领取，漏登不跳天，第7份当天仍显示7/7，隔日下一轮。persist:true先写入金币/种子/家具、凭据、日期、次数与回忆，再发login:claimed；失败不变且可重试。
- ui.observatory.panel/open/entry、ui.deals.content、ui.login.panel/content/open/maybePrompt。登录自动提示不覆盖引导、后台、已开抽屉/弹窗，同页面同日最多提示一次；启动与modal:closed后单次延迟检查，换档清理计时器。三项不新增持续动画循环。

## 房间位置互换

- `js/systems/room-layout.js`在基础systems之后加载，增强`Game.sys.building`；无新持久字段、无版本迁移。`roomPosition(roomId)`返回唯一引用的`{floorIdx,slotIdx}`或null；`layoutSlots()`返回当前等级已开放的`{floorIdx,slotIdx,roomId,locked:false}`数组，空格roomId=null；返回值不引用状态。
- `swapRooms(roomId,targetFloorIdx,targetSlotIdx,expectedTargetId?)`检查自有合法源房间、唯一来源、两端开放格、整数坐标与目标ID。传null显式要求目标仍为空格；传ID要求目标仍为该房间。相同位置返回`{ok:true,unchanged:true,...}`，不写、不记回忆、不清选择。阁楼不参与普通位置图。
- 事务只交换`house.floors[f].slots[slot]`引用并加1条回忆，不重建room对象、不收家具或搬出居民。已解锁但旧档缺少的空楼层在同一成功事务中补齐；金币、经验、库存、paidPrice、家具层级/台面parent/depth/颜色、墙纸画作、住户roomId/好感/心愿及成长统计完整保留。
- 通过`store.update(fn,{persist:true})`先真正写入，拒写/容量失败时内存、磁盘原文、运行期及装饰撤销全部不变；busy防同步事件重入。成功后清旧装饰undo，activeRoomId保留源房间、selected/placing清空，再emit `room:swapped {roomId,otherRoomId,from:{floorIdx,slotIdx},to:{floorIdx,slotIdx}}`。
- `ui.roomLayout.panel(options)`、`open(roomId,target?)`／`open({roomId,target})`、`isInteracting()`；根renderer传稳定view.options。位置图源选择、目标与回忆文案只用textContent，自定义选择器，无原生select。目标预览记来源位置与两端用途、目标ID，确认处理器同步重查，陈旧预览清掉且不调用规则。
- DOM Pointer拖动只预选目标，主动48px按钮才提交；拖动期间根renderCurrent跳过重建。临时指针/keydown/visibility/blur监听在手势结束释放；Esc、pointercancel、第二指、后台、失焦、面板收起、换档统一取消，旧options.target不在换档后复活。方向键、Home/End改变格子焦点，Enter选目标，Escape清预览。
- scene共用`render.layout.roomLabel(roomOrId)`与`roomLabelAt(point)`绘制/命中168×30世界单位名牌，顶部x+76/y+9。5px拖动阈值区分轻点入口`scene:room-layout {roomId}`与整房拖动；释放到已开放普通格调用真实规则，传拖动快照目标ID。来源格/用途与全房屋布局变化则拒绝旧拖动；双指、后台、换档与Esc同样取消。`room:swapped`后镜头跟随源房间；roomLayout模式下后续抽屉重绘仍跟随，未新增动画循环。
- 场景名牌、目标轮廓与拖动提示属于交互层，离屏摄影不绘制，captureScene不消耗尚未提交的拖动。原房间家具与居民仍用既有绘图。


## P1核对后的补齐接口（2026-10-28）

- `data.concert`集中三段正文与本地MIDI音高；`sys.concert.status()`返回音乐室、已入住朋友、资格和是否举办过。`begin(roomId?)`建立页内会话，`advance(sessionId)`依次推进到第三段；`finish(sessionId)`仅完整谢幕时接受，首次以persist:true写`quests.stats.concerts=1`及一条回忆后emit`concert:finished`，无额外经济奖励。重演无存档副作用；拒写可同场重试，busy拒绝同步重入，换档/改用途/参与者改变令旧会话失效；`cancel()`无奖励。
- `ui.concert.open(roomId?)`从音乐室菜单或主线进入，共用手绘角色按乐句静态重绘，不新增RAF循环。主动切段调用`audio.play('concert_0/1/2')`，关闭调用`stopConcert()`；后台/静音取消未起音声部，不自动朗读，故事仍可主动“听一听”。`island_concert`新增真实谢幕条件；旧已领取主线保留。
- `sys.residentLife`由scene已有帧调用`advance(now,{phase,reducedMotion,hidden})`，动作/随机种子/串门房间全部留runtime；`snapshot(options)`只读投影，离屏拍照不推进路线或破坏主命中。夜间回homeRoomId，沿用床上睡眠和家具深度遮挡。`init/reset`在换档或重新初始化清理运行态；无额外interval。
- 新持久`residentNotices:[]`只记已送达的合法居民ID，最多12、去重，缺失旧档补空；资格实时由`residents.eligibility`计算。`residentLife.notices()`返回eligible/unseen，`acknowledge(ids)`先保存送达记录；失败不假装已存。`ui.residentNotices.init`提供可关闭纸笺/常驻信封，发`resident:invite_requested`复用现有介绍与选卧室；抽屉/弹窗/后台/引导期间隐藏。
- 家具DOM预览共用`ui.furnitureRarity.decorate(container,def,{preview,discovered})`：四种中文稀有度与预览边框，未知图鉴不透露，稀有轻闪一次且减少动态关闭；不新增Canvas循环。
- `data.outfitRewardSources`定义dress_daisy←baker_3、dress_winter←christmas。真实领奖事务写`avatar.owned`，原商店购买仍可用；`applyOutfitRewardEntitlements(state)`在完整校验后按历史有效领奖凭据幂等补服饰，不补钱/经验/家具/记忆。图鉴说明双来源，已有后进入已拥有衣橱。
- `ui.minigames.memoryPool(pairs,random?)`为可测混合池，真实三难度开局均用；居民/家具各取约一半，以typed ID区分并成双。蛋糕耐心复用唯一100ms心跳，单层20秒/双层25秒，到期清盘换客、不扣币不算订单；操作先核对截止时刻，后台冻结计时，关闭/换档/卸载清理。
- 花园星星果真实时钟20:00≤hour或hour<06:00可播种；dayMode/debug显示设置不绕过经济时段，规则与UI提示一致。


## 收获加工与甜品工坊

- data/crafting在garden/yard之后、store之前注册5份配方与5成品。配方字段为id/name/description/cropId/cropCount/itemId/requireRoom/unlockLv；IDs为tulip_vase、pumpkin_lantern、sakura_tree、strawberry_deluxe、blueberry_deluxe，材料3/2/1/2/2，门槛6/6/11/21/21。两糕要求workshop。
- 成品source=crafting、rewardOnly=true、currency=none、price=0，目录407，普通商店362不变；不进礼盒、特惠或9套38件主题套装。树进yardFurniture，庭院小铺排除rewardOnly，背包与已摆列表保留。
- 存档crafting严格两键counts/last。counts只含5合法配方ID，值为1..1e9，sum不超1e9且等级符合历史门槛；sum0当且仅当last=null。last严格recipeId/count/total/at四键，批量1..99、不超该配方累计，total=sum，at合法时间。只补整个缺失字段，残缺拒绝；制作历史不随成品消耗或工坊拆除清空。
- sys.crafting.status(id,count=1)纯查询，返回recipe、materials、stock/crafted/totalCrafted、unlocked/hasRoom/maxCraftable/canCraft/reason/quote；list(count)、latest()只读。craft(id,count,quote)必须提交显示时的opaque quote，包含相关材料/库存/计数/等级/工坊ID和档身份/换档epoch，普通计时不误失效。
- 制作busy防同步重入，persist:true一次扣harvest、加inventory/collection、counts/last与回忆；拒写/非法数量/原型ID/9999库存/1e9历史失败均不变。成功emit crafting:made。没有制作币/经验奖励，不加bakeryOrders/minigamePlays；摆放和送礼各自遵循旧规则。
- ui.crafting.open(recipeId或options)、entry(recipeId?)、panel(options,api?)。根renderer传稳定view.options；自定义选择器与闭包旧quote，成功锁主按钮，主动继续才重取；结果focus和uiFocus保证手机露出摆放/送礼。crafting:place_requested复用室内/庭院摆放；gift_requested先选朋友，再默认选本次蛋糕。
- residents.giftOptions(id)只列实际拥有的普通/两种高级糕与花果，含count/favorite/type。gift(id,giftId?)保留undefined普通蛋糕；高级糕按giftCrop继承水果偏好20/普通8、生日双倍。persist:true一次消耗/好感/日期/经验，busy防重入，拒写不丢成品。
- draw.crafting仅接管5固定ID，按尺寸/flip静态绘制、finally恢复context；场景、缩略图、摄影和庭院preview共用，无新循环。成品不换色，两处庭院UI隐藏控件，yard.recolor规则拒绝不支持的定义；旧20种可换色庭院物保留。
- JSON保留制作历史和物品状态；Markdown追加累计、逐配方次数和最近一批。图鉴新5项来源回到准确配方，未知剪影规则保留。


## 庆生与动作反馈（MC-034）

- `ui.birthday.available()/open({fromClaim:true})/close()`：只在真实本机生日当天且当年 `calendar.claimed[year+':player_birthday']` 存在时演出。日历成功领奖自动打开，已领可主动再开。只读入住人数/现有角色/玩家形象，演出不写奖励；蛋糕年度礼物仍由time.claim负责，皇冠是舞台道具，商店原商品保留。
- `time.claim` 先在同一persist事务保存年度凭据、原节日奖励、心情与回忆；busy挡同步重入。失败不发 `festival:claimed`，不消耗资格。birthday组通过 `audio.stopBirthday()` 独立停止，异步解锁也可取消；从收礼打开时不再奏第二次。
- `data.audio.effects/feedbackEvents` 集中九种音色/事件配置，audio.init只订阅一次真实成功事件；语义音合并同次通用success/click，升级优先。静音、后台、换档、stop作废待播并释放声部。click/error/flip由UI主动调用；主动本机朗读、昼夜配乐规则保留。
- `economy.expInto(state,value)` 只修改传入草稿并返回升级列表，不发事件。garden.water/harvest使用persist+busy；收获把清地、库存、图鉴、任务、回忆、经验与升级扩地同次提交，之后才发level:up、garden:harvested。拒写不产生成功音或飞入动画。
- `ui.harvestFeedback.init()/entry()/clear()/openBasket()` 只消费 `garden:harvested {index,crop,count}`，不修改库存。`render.harvestOrigin(index)` 用实际镜头映射视口坐标，屏外返回null；花园内优先可见地块按钮→可见篮子。`ui.garden.openBasket()` 进入真实库存。
- 飞行最多4个真实作物、820ms，超时释放；无持续绘制循环。减少动态只显示作物/数量与一次读屏正文。后台、换档、滚动、尺寸/镜头变化清理。庆生画布680×340、12fps；后台停绘，减少动态和零入住为静态，关闭释放监听/帧/缓存。


## 房屋个性化（MC-037）

- `data.houseStyles/houseStyleById`保存6套稳定ID配方，每套含5部件ID与两HEX色；其中3套使用免费基础部件。`data.layoutTemplates`保存4份稳定ID、中文说明与排列规则。它们是可选择的配置，不是额外的存档拥有权或上次选择标签。
- `sys.houseStyles.preview(id)`纯读返回`{ok,id,name,description,exterior,parts,missing,cost:{coin,heart},unlockLv,locked,canAfford,canApply,selected,quote,reason}`；`list()`返回6套报价，`current()`按实际7字段匹配返回配方ID或null。预览Canvas可以绘制未拥有部件，不能据此获得部件。
- `houseStyles.apply(id,expectedQuote)`必须带当前预览的字符串quote；重新核对部件、相关拥有权、当前配色与等级，并重新检查实际余额。单次`store.update(...,{persist:true})`购买缺件、装备部件、配色及追加回忆；失败不扣币、不改外观、不发成功事件，重复已用款无保存/扣费。报价过期要求重新预览；成功沿用`exterior:bought/changed`，附styleId。
- `sys.layoutTemplates.list()`返回配方副本；`preview(templateId)`纯读返回`{ok,templateId,name,signature,before,floors,moves:[{roomId,from,to}],roomCount,unchanged,capacity,message}`。按稳定房间ID分配当前开放格子，少量房间或单层时不同模板可能自然相同。没有房间时返回可建造提示，不生成房间。
- `layoutTemplates.apply(templateId,expectedSignature)`强制绑定同一模板的预览，确认时重算；增拆房、改房型、换位或开放容量改变会拒绝旧预览。只在一次持久事务更新`house.floors[*].slots`引用和一条回忆，保留最新`house.rooms`及家具/画作/装修/居民引用、前院、阁楼、经济和统计。成功清装饰撤销/当前摆放选择并发`house:layout-applied {templateId,moves,roomCount}`；同布局零写盘/事件/回忆。
- `ui.houseDesign.panel()/open('styles'|'layouts'|'custom')`提供整套灵感、自由搭配、布局模板导航。整套有同源Canvas预览、部件清单、缺件总价与明确确认；模板给真实现在/试看位置图和每间去向，确认成功后适配镜头。既有`ui.exterior`单件/调色仍明确即时保存；套装成功会清理它的旧试穿选择。
- 不新增持久schema。JSON仍以外观具体部件/HEX/owned、楼层roomId引用与房间实体为权威；MD列实际部件名/HEX、派生匹配风格及真实楼层位置。未来小屋展示可以读取同一结构；个性化模块本身不含联网代码、远端身份或服务。

## 可选网站与SQLite账号后端（MC-038，已部署）

- Node.js 24、CommonJS、仅标准库；本机环境24.3.0，数据库用内置`node:sqlite`（此版本有ExperimentalWarning），无npm驱动。离线IIFE前端独立运行，不向玩法/绘图加入网络请求。
- `server/releases.cjs`提供prepareRelease/verifyRelease/activateRelease/listReleases；源入口提取带指纹JS/CSS白名单，仅改发布副本引用。release身份绑定源入口、资源内容与basePath，旧目录不覆写；同data-dir首次激活后固定basePath。
- `server/handler.cjs.createHandler({dataDir,basePath,cloudApi?})`返回可直接调用的HTTP handler，无监听副作用。入口no-cache、不可变资源immutable，支持GET/HEAD、强ETag和304；healthz完整检查活动release，version.json仅发布信息，两者no-store。未知路径404，编码/穿越400，内部错误503且无磁盘路径。清单/活动指针、源码、SQLite、备份和个人JSON不作为静态资源。
- `server/cloud-api.cjs.createCloudApi`接收明确dataDir/basePath/origin，打开私有SQLite；同源API为`basePath+/api/v1`，完整合同见[账号存档接口](cloud-save.md)。账户归属只取已认证会话；X-MC-Account须与Cookie账号一致，不能据其授权。密码scrypt盐哈希、会话令牌hash、Origin/CSRF/请求体限额和登录限流；客户端合同不兼容拒绝同步。
- `server/save-validator.cjs`仅在受限VM执行已验证release中的可信namespace/data/utils/store，上传JSON用变量传入解析与校验，不执行上传内容。服务器规范JSON键序后计算contentHash；整档保持3MiB UTF-8及2,500,000 UTF-16字符上限。另加载可信public-house投影脚本提供projectPublic；投影脚本不参与私有存档contractHash，既有私人存档协议保持兼容。
- `server/cloud-store.cjs`以SQLite事务原子提交当前JSON、修订、最近10版历史和有界幂等回执；publications独立保存每账号最多一份公开视觉快照。ETag含serverEpoch/revision/contentHash；写入须CAS，冲突412不无条件覆盖。灾难恢复rotate-epoch撤销会话、幂等回执与全部公开记录/旧链接，恢复后需主动重新发布，不能只回拨修订。
- `server/live-hub.cjs`是第8个后端模块，保存独立、有界的内存房间/成员/位置/短消息；cloud-api负责当前会话与CSRF、liveKey和peerId复核。联机不调用私人存档写入，不新增SQLite表或修改schema，私档contractHash不变。完整合同见[实时串门](realtime.md)。
- `server/cli.cjs`提供prepare/list/activate/serve/backup/rotate-epoch；只有serve监听且host/port明确。非loopback绑定须显式origin。serve启动/每24小时/正常退出做一致性备份，保留最近7份；不能把同磁盘备份当异机容灾。命令与恢复步骤见[后端说明](../server/README.md)。

## 可选账号同步与本机副本

- `Game.cloud.prepare()`在store/sys初始化前识别同源release入口并安装写入保护；`init()`在save.init之后安装成功落盘、网络和页面生命周期监听。file入口不启用账号请求，不影响双击游戏。
- `status()`返回只读`{available,phase,message,account,binding,remote,conflict,busy,dirty,readOnly,restoreRequired,backups}`，变化发`cloud:change`。phase为offline/guest/ready/pending/syncing/conflict/choose/expired/error/incompatible/other_tab；摘要为`{name,level,coin,roomCount,updatedAt,revision}`，conflict含local/cloud。restoreRequired时本机档未完整读取，禁止临时空屋关联或新建，明确恢复完整档后再同步。
- `register({username,password,displayName?})`／`login({username,password})`、`logout()`、`syncNow()`均返回异步`{ok,message?,warning?}`。新账号名3–32位ASCII字母/数字/下划线，归一小写；密码8–128个JS字符且≤512字节，不trim；昵称可省略，给出时1–24码点，不含控制字符。密码不写游戏JSON、侧车或localStorage。
- `bindLocal()`由用户确认后关联当前小屋；`startNew()`只允许尚未关联且服务端确认无云档的账号，先保留旧副本再创建默认空屋并首次CAS上传；已有云档重置仍走设置双确认/3秒。`useCloud()`主动取云档，经可靠本机切档恢复；首次登录不默默覆盖已有小屋。
- `resolveConflict('local'|'cloud')`先再取远端比较，保留另一分支，按明确选择CAS上传或可靠恢复。两份整档不逐字段合并，不以设备时间或金币最大值自动选胜者。换档/账号/标签页时使旧请求失效，旧回执只确认发出时的那一代，后来的本机修改仍待上传。
- 成功本机保存触发队列，单次在途、操作防抖、网络重试和30秒前台远端检查；只有游玩时间/居民泡泡计时变化时延后上传，不为每次计时都新建历史。云端失败不撤销已成功的本机玩法。401保留副本待重新登录；不兼容版本先备份再更新，不能强写云档。
- 原活动JSON继续使用`marshmallow_cottage_save_v1`。`marshmallow_cottage_cloud_v1`为账号归属/基准/队列/切档journal等旁路元数据，单机槽、最多两个账号槽及一份恢复分支有界保留。配额/写入失败停止切换；journal或归属不明时只读保留，不能自动认作另一个账号。
- `downloadCloud(revision?)`下载本人当前/历史JSON；`downloadBackup(id?)`下载当前或本机离线分支。`forgetBackup(id)`只清非活动副本，UI须先提示下载并明确确认，不删除云存档；`takeover()`只在用户确认后接管同浏览器写入租约，先读取真实磁盘快照，不flush旧标签内存。只读标签同时禁止store与save写入。
- `ui.cloudAccount.panel/open/init/close/entry`提供账号、首次选择、同步、冲突、JSON与副本整理入口。init在主界面插入常驻账号与邻居栏，登录前显示「登录 / 注册」及「不登录也能玩」，登录后显示账号与同步状态；设置保留账号和备份等工具。输入使用原生密码语义，错误正文保留；云状态及根UI计时刷新不重挂账号表单，失败不清输入，成功或离开面板清密码。JSON导入/重置确认会说明已关联账号同步后也会替换云端当前进度。

## 邻居公开快照与只读参观（已实现并部署）

- `Game.cloud.requestPublic(path)`只接受`/neighbors?cursor=...`、`/neighbors/online`和`/public-houses/:id`的公开GET，返回JSON，使用当前同源release的协议/build请求头、`credentials:'omit'`与no-store；不要求cloud.prepare或会话，可在独立参观页使用。`requestAccount(path,method,body)`仅接受`/my-publication`的GET/POST/DELETE，复用会话/账号/CSRF检查并隔离迟到账号响应；POST须已关联有效进度。两者失败抛Error，HTTP错误附status/code。既有私有save/history/session接口不变。
- `Game.neighbors`与`Game.ui.neighbors`指向同一`init/panel/open/close/refresh/status`接口。默认打开邻居页，在线小屋在前，普通公开列表按最近更新时间分页、每页最多24份；普通区排除本人并去重在线区，在线区保留自己家里的成员。仅展示主动公开的小屋与实际加入的公开称呼；未登录可看列表和参观。在线区仅在列表打开、处于列表页签且文档可见时每10秒刷新，返回立即刷新；generation拒绝关闭/切账号/切页签后的迟到响应，稳定行DOM保留焦点，发布表单不被重建。失败保留上次结果但标为过期，并移除在线标识及快捷加入动作。`status`另含`onlineHouseCount/onlineStale`。
- 发布/更新须填写1–24字公开小屋名与展示昵称并确认，默认称呼「小小建筑师」，不取账号名。先syncNow并确认同账号ready/binding、无dirty/restoreRequired/readOnly，再用remote.revision作为expectedRevision；服务端从本人当前已验证云档投影，不接受客户端公开JSON或owner字段。私有自动同步不更新公开快照，412要求重新同步并确认。撤下需认证、当前页可写及确认，不要求先恢复/关联私档；账号切换使旧请求失效。
- `Game.publicHouse.project(validatedSave,{title,displayName})`为纯白名单投影，输出version=1、公开房名、外观、楼层/房间/家具装修、前院/阁楼、当前形象、入住角色与实际引用的像素画；展示昵称放响应摘要，不进入合成存档。排除账号/profile、钱包/拥有权/库存、生日/心愿/领奖、相册/回忆/设置等私人字段。`materialize(snapshot)`严格校验后构造绘图用合成状态，只供独立文档，不读写本机存储或store.update。
- `Game.visit.shouldStart()/init()`处理`basePath+/visit/:id`。main先分支；viewer安装拒写guard，取得公开快照后使用冻结的合成Game.state与既有离屏绘图，提供整屋/房间、拖动/缩放、键盘和返回自己小屋。不会load/init/replace本机私人存档、执行每日/经济规则、初始化编辑输入、私人账号同步、离线worker或写入租约，不启动主人场景循环；主人参加联机也进入此页。参观路由和公开API不进入worker缓存，断网不能回退成主人页。
- 后端API、响应字段、事务/撤销边界见[公开小屋合同](public-neighbors.md)。列表和只读参观已部署；该阶段正式HTTPS正常证书校验、入口/版本/健康、122份发布文件hash及匿名列表/详情/参观已验，独立验收账号重启后私人修订/hash与公开快照保留，撤下公开404且私档不变。详细证据见[验证记录](verification.md)与[部署手册](runbook/deployment.md)。随后实时在场与聊天也已实现并部署，正式HTTPS双账号与重启验证通过；交易与共同布置未实现。

## 实时串门与同屋聊天（MC-040，已实现并部署）

- `Game.live`只在受支持的同源release使用，独立于cloud.prepare、私档、localStorage及标签页写入租约。`status()`返回复制快照`{phase,authenticated,houseId,peerId,revision,peers,messages,error}`；`subscribe(fn)`返回unsubscribe；`probe()`、`join(houseId,displayName)`、`quickJoin(houseId)`、`move(zone,x,y)`、`chat(text)`、`kick(peerId)`、`leave()`、`destroy()`提供认证探测、主动加入与清理。phase为`idle|joining|connected|reconnecting|left|error`；file入口不发请求。
- 同源`basePath+/api/v1/live/*`沿用协议1/build门禁与no-store。`GET /live/me`返回`{authenticated:false}`或本人页内`{authenticated:true,liveKey,csrfToken,joinDisplayName}`；推荐称呼取当前实际在线成员已公开称呼、本人公开小屋昵称、最后「小小建筑师」，不取登录名或账号昵称，查询不续期。后续请求使用当前Cookie和`X-MC-Live`，POST另验Origin/CSRF；`join`返回本次`peerId`，后续poll/move/chat/leave/kick须再带`X-MC-Peer`。读取异步body后及长轮询返回前复核，防止换账号或旧标签的迟到操作影响新成员。API字段及错误边界见实时合同。
- `server/live-hub.cjs`最多64屋/256成员、每屋8人；一个账号只有一个在线成员，后加入替换先前成员。成员TTL35秒，有效轮询/动作续期，每成员最多一个等待请求；poll最长8秒，有事件立即返回，不新增端口或代理协议。后台停止poll/移动，回来验证原成员；过期、被替换、请离或服务重启后须主动重加，禁止自动恢复成员。服务关闭先释放等待请求，再关闭HTTP和SQLite。
- 成员摘要为`{id,displayName,avatar,isHost,zone,x,y,updatedAt}`，zone为`yard`或公开快照真实房间ID，x/y为0–1地面坐标；服务器从本人已验证云档投影形象，无云档使用可信默认形象。展示昵称主动填写、默认「小小建筑师」，不取账号名或账号昵称。移动使用单调seq、最多5次/秒；位置、成员和聊天均为内存数据，不调用store.update、save或私人云写入。
- 聊天1–80字纯文字与4条快捷短句，按客户端消息ID幂等并限频；成员只能取加入后的消息，服务器最多留32条，不写SQLite、日志或持久历史。`ui.liveRoom`用textContent显示昵称/消息，屏蔽只在本次串门隐藏该成员聊天、保留人物。主人请离别人并在本次房间生命周期禁止重加，禁止重加返回403；成员失效/被替换等情况要求明确重加。更新/撤下公开快照立即关闭该房间，退出/切账号、会话过期或epoch变化清理相关成员。
- `Game.ui.liveRoom.mount(container,{houseId,onState,onMove,quickJoin})`返回`{destroy()}`，自行probe并提供加入、成员、聊天、屏蔽、请离、离开和方向控件；仅`quickJoin:true`且认证成功、文档可见时触发一次`Game.live.quickJoin(houseId)`，游客不保留待执行意图。稳定DOM保留输入焦点与草稿，离页/销毁释放订阅与请求，不依赖根ui.init。`Game.liveAvatars`提供room/position/destination/view/project/unproject/clientPoint及`create({canvas,background,house,view})`；返回update/redraw/destroy，复用真实服装绘制、深度排序与插值，上限30fps，减少动态或后台不跑动画。
- visit只在connected/reconnecting时以`captureScene({hidePlayer:true})`背景与成员层绘图，离开恢复静态公开玩家。房间按钮仅改变观察范围；「走进这间房」或「走到前院」明确切换自己的zone，地面点击、键盘或方向按钮随后移动。地面命中与绘图共用坐标/裁剪变换，所有输出只在Canvas和runtime，房屋家具保持只读。
- 本地65脚本732组串行通过；原Chrome页与独立HTTP客户端实际核对互见、双向移动/聊天、进入房间、屏蔽/取消屏蔽和请离后403禁入，两方私人修订/hash不变。最终另有57组定向复查通过；正式HTTPS以两个独立账号核对认证/形象白名单、同屋长轮询唤醒、双向聊天、成员权限与请离隔离。重启前等待请求以503释放，重启后旧peer返回409，主动重加生成新peer且聊天不恢复；私人修订/hash及公开快照保留，原8张数据库表hash和user_version=1保持。真实双物理设备、Safari、长期使用与异机灾备仍未验，最新证据见[验证记录](verification.md)和[部署手册](runbook/deployment.md)。

## 在线邻居与直接串门（MC-041，已实现并部署）

- 公开`GET /neighbors/online`返回`{houses:[{id,title,displayName,roomCount,updatedAt,online:{count,hostOnline,displayNames}}]}`，最多64屋、每屋1–8位。hub先清理TTL、失效会话及更新/撤下小屋，查询不续期；只含公开摘要和主动加入称呼，不返回账号ID/用户名、peerId、形象、位置或聊天。按有空位、屋主在场、人数降序、updatedAt/id降序排列。旧`GET /neighbors`分页/游标保持。
- 有空位且新鲜的在线行链接到`/visit/:id#join`；满员或过期只提供普通参观。visit仅在公开快照成功加载后消费精确`#join`，保留原路径/查询并传`quickJoin:true`；普通参观和未知片段不自动加入。`Game.live.quickJoin(houseId)`复用主动join的fresh `/live/me`握手，凭据与推荐称呼来自同一次Cookie绑定，非法称呼回退通用称呼；不沿用旧probe的称呼。失败、离开、刷新或BFCache返回均不自动重试。
- 本轮66脚本758组串行检查通过；正式HTTPS全部126文件hash、在线人数与屋主离开清理、公开称呼/快捷称呼及聊天已验。重启清空在线、旧peer409、会话/公开快照/私人修订/hash保留及主动重加通过，原8张表内容与schema保持，两个验收账号已清理。私人save/history/session合同和离线/JSON恢复保持。完整合同见[在线邻居](online-neighbors.md)，本轮证据与发布身份见[验证记录](verification.md)和[部署手册](runbook/deployment.md)。

## 网站离线缓存

- `Game.offline.init()`识别同源release入口，在支持Service Worker的安全上下文注册`basePath+/sw.js`；`status()`返回`{phase,message}`，变化发`offline:change`，phase为unavailable/preparing/ready/update/error。账号面板显示实际准备状态，不能在未准备好时承诺断网重新打开。
- `server/offline.cjs`按活动release生成公开worker/config：`sw.js`为no-cache，`offline-manifest.json`为no-store，`offline-shell/:releaseId`为该版本纯游戏入口。发布资源固定版本URL，旧release保留；worker等待旧页关闭后更新。
- worker仅缓存公开入口和清单内不可变资源；账号API、会话、存档JSON和数据库永不进入Cache Storage。参观导航只走网络，不缓存公开快照，也不在断网时回退主人入口。文件离线版继续直接打开；缓存可能被浏览器回收，未同步本机进度仍需JSON备份。正式HTTPS已验，真实双物理设备、Safari、长期使用与异机灾备恢复仍未验，证据边界见[验证记录](verification.md)。

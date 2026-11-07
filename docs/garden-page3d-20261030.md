# MC-080 独立花园接口冻结

2026-10-30。仅源码交付，未接线、激活或执行浏览器验收。

## 宿主消费契约

加载顺序：`world3d-models.js → world3d.js → garden-page3d.js → scene.js`；模块调用时读取已加载的正式作物数据。

`Game.gardenPage3D.describe(env)` 返回 `null` 或描述：

```js
{
  id: 'garden', interactive: true, key,
  bounds: { min: [x, y, z], max: [x, y, z] }, focus: [x, y, z],
  plots: [{ index, p, size, world, particleWorld, harvestAnchor, status }],
  hits: [{ kind: 'plot' | 'visitor', p, size, index?, world }],
  labels: [{ kind: 'plot' | 'visitor', index?, text, p, world }],
  worldToPage({ x, y }, height = .18),
  build(existingGeometry, world3dModels) // 仅追加CPU几何；成功true
}
```

必需输入：`surface:'garden'`、真实 `state`、`data`（可回退只读 `Game.data`）、现有 `gardenLayout()` 的 `garden`、与各格 index 对应的真实 `gardenStatuses`。可选 `selectedPlot`（当前 `runtime.gardenVisual.selectedPlot`）、原 `visitor`。`capturingPhoto / roomOnly / forceHouse` 任一为真则返回 null；未解锁或缺失逐格状态也返回 null，不伪造空地。容量只接受正式配置在当前等级开放的6/9格。

`plots[].world` / `hits[].world` 保持 `{x:plot.cropX,y:plot.y+plot.h/2}`；`particleWorld` 保持原 `particleX/Y`。独立园区几何以本地原点布置，`harvestAnchor` 是新园区中的真实作物上方；普通逻辑点可用 `worldToPage` 转换。命中 `p/size` 直接符合 `World3D.hitBox`：x/z为中心、**p.y为底边**，覆盖土面到完整植株（包括成熟樱花树冠）。访客只绘制已传入的原访客，保留原世界命中坐标，不创建定时器、访客或奖励。

**不要塞入 `env.stage`。** 当前只读stage会提前返回 `kind:'stage'`，PointerDown/Up吞掉点击，且 `harvestOrigin` 返回null。建议使用独立 `env.gardenPage`，复用bounds/focus相机计算，另注册 `hits` 到 `hitBox`、接入 `labels`，保留可交互 `plot/visitor` 类型。点击继续沿 `scene:garden → ui.garden.openPlot(index)`；不新增规则动作。宿主key需纳入描述key，选择变化需触发redraw。

摄影与 `forceHouse/roomOnly` 继续真实家园；主家园花园岛、桥及种植坐标保持。花园相机进入/退出保存并恢复家园镜头，适配 `sceneViewport()`；`harvestOrigin(index)` 使用描述的 `harvestAnchor` 投影，避免动画飞自主岛缩略位置。

## 页面与验证边界

`js/ui/garden.js` 保留现有公开方法和花园→加工→回花圃合约，增加独立园区的清楚阶段/水分/可收状态、真实袋/篮信息与容器响应式布局。新增 `open()` 同 `openPlots()`。3D中央区域仍由宿主场景负责，本页不创建第二个场景canvas/GL/RAF；原作物缩略图继续Canvas代码绘制。

人类追加要求播种不使用下拉，已将内联与播种弹窗改为12张真实作物图卡，显示成熟图、名称、实际持有种子、价格和夜种标识；`radiogroup/radio` 支持方向键、Home/End、唯一Tab落点和稳定焦点键。选择只改运行态，仍需主动点击 `buySeeds/plant`；图卡不自动购买或播种。固定预览与规则说明保留。

最终文件清单：

- 新 `js/render/garden-page3d.js`：纯模块、逐格命中/标签/收获锚点和相机描述。
- 既有 `js/ui/garden.js`、`css/garden-visual.css`：独立纸页与图卡选种；容器宽度变化时重排，按钮至少44px。
- 新 `tests/garden-page3d.cjs`：8组真实规则/正式Geometry契约，覆盖48种作物阶段组合、完整bounds、6/9格、旧坐标、访客、纯度与快照。
- 总集追加授权的 `tests/garden-visual-ui.cjs`：保留原14组业务/事务/拒写/焦点/换档断言，将选种路径改为真实图卡，另补2组图卡可读名/真实数量/价格/键盘/不自动买种。
- 本报告。

已执行且通过：上述3个JS/CJS文件与既有 `tests/garden-visual-ui.cjs` 的 `node --check`（仅语法）。未执行规则测试、浏览器、服务或激活。独立只读复核发现的成熟樱花锚点/命中上沿问题已修正；不作为视觉验收。

总集最短串行检查：`node tests/garden-page3d.cjs`、`node tests/garden-visual-ui.cjs`、`node tests/pages-fidelity-navigation.cjs`（真实花园/加工返回）。接线后须由A补/跑独立gardenPage的真实scene输入回归，覆盖点击土面/植株、拖动不误操作、3D与DOM同index、访客/收获起点、退出还原和摄影强制家园。随后原4173实际消费资源核桌面1280×720/390×844，对照prototype #garden、滚动/键盘/完整区域及真实播种/浇水/收获/加工返回；本次不称整页已验。

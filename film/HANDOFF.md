# 交接说明（第二轮修改，进行中）

> **进度（随做随更新）**
> - [x] 音乐选定并放进 `audio/music/`，`make_film.py` 已改为直接用成品曲（`MUSIC = 'lullabies_1.mp3'`）
> - [x] 音效已做减法并压低（`audio/sfx.py`）
> - [x] `scenes/spring.py` 春·落花：已定稿并渲染（`spring_frames.npy`）
> - [x] `scenes/autumn.py` 秋·落叶：已写好、试渲满意，最终循环渲染中/已渲染（`autumn_frames.npy`）
> - [ ] 先按**春夏秋冬四场**出片：`ORDER = spring, rain(=summer), autumn, snow(=winter)`，每场 4 个循环（36 秒），总长 2:27
> - [ ] 校园（夏·傍晚火烧云）是**可选的第五场**：做得好再加进去（加进去后改回每场 3 个循环）；`scenes/school.py` 目前还是旧版
> - [ ] 删除 `scenes/roof.py`、`scenes/rail.py`、`engine/dyn.py`、`audio/music.py`，更新 README / CREDITS / WORKFLOW，重新导出并推送


给接手的 agent。先读 [`WORKFLOW.md`](WORKFLOW.md) 了解引擎和流程，再读这份。**这份说明的优先级高于 WORKFLOW.md 里与它冲突的内容。**

## 1. 用户对第一版（已推送的 `out/`）的评价

- **雪（snow）、雨（rain）两场通过**，「动态掌握得不错」。不要改它们的画面。
- **天台晨雾（roof / fog）不要了**：像随手拍，没有氛围和记忆点，「晨雾」和季节是硬凑的，动态也弱。
- **铁路（rail / train）不要了**：平、不精细、不好看、不怀旧；火车匀速慢慢开一直不断也不对。
- **校园（school / campus）要重做**：乍看还行，但「一栋教学楼孤零零立在大操场边」不合常理、太疏离；
  黄昏颜色要更绚丽。
- 总要求：**不能太写实，要带梦幻朦胧的色彩**（「核」的感觉）；场景要有生活里真正的美和怀旧；
  季节要靠景色本身表达出来。
- **音乐不要原创**。这是一支 **lofi 电台视频**：要用高质量的成品 lofi 曲。
- **音效太嘈杂**，雨声太突出。要压低、做减法。
- 之前几轮的要求仍然有效：远观全景、不聚焦单个物体；大部分场景不放人；视频里不放任何文字标题；
  文件名简洁；1080p；每个场景是能无缝循环的片段，成片里每场循环多次；总长 2～2.5 分钟。

## 2. 已定方案

### 场景（5 场，按季节排）

| 顺序 | 输出名 | 模块 | 状态 | 内容 |
|---|---|---|---|---|
| 1 | `spring` | `scenes/spring.py` | **要新做** | 春 · 蓝调时刻。老家属院的窄巷，从二三层楼高度斜着俯看：低矮的红砖楼和坡顶平房，一棵很大的花树（海棠/樱花，粉白）伸到巷子上方，被树下一盏暖色路灯从下往上照亮；**花瓣不停地落**（粒子，像雪但更慢、会打旋），地上屋顶上铺着落花；远处屋顶间还有几团粉色花树。靛蓝+粉+琥珀。 |
| 2 | `campus` | `scenes/school.py` | **要重做** | 夏 · 傍晚 · **火烧云**。相机在一栋教学楼的走廊上，看对面三四十米外的另一栋教学楼和侧面的连廊/配楼，围出一个院子（旗杆、篮球架、大树、宣传栏、车棚）；晚自习的窗一排排亮着冷白的日光灯；操场只在楼后露出一角。天空是主角：洋红—橙—紫的大片晚霞。动态：云、成群低飞的蜻蜓、旗、树、一根闪的灯管。 |
| 3 | `rain` | `scenes/rain.py` | 完成，不动 | 夏 · 夜 · 雨 |
| 4 | `autumn` | `scenes/autumn.py` | **要新做** | 秋 · 黄昏。从三层楼高度顺着一条老街的轴线看过去（一点透视）：两排法桐/银杏的金色树冠连成拱，钠灯藏在树冠里把叶子照得透亮；**落叶不停地飘**，路面铺满黄叶；路边有报刊亭（亮着灯）、公交站牌、成排的二八自行车，树后是亮着窗的旧楼。金+紫+青。 |
| 5 | `snow` | `scenes/snow.py` | 完成，不动 | 冬 · 蓝调时刻 · 雪 |

`scenes/roof.py`、`scenes/rail.py` 以及 `engine/dyn.py`（火车用）不再使用，定稿时删掉；`out/loops/fog.mp4`、`train.mp4`、`campus.mp4` 要替换。

新场景成立的配方（照着雪/雨那两场抄结构，但构图各不相同）：

1. 相机在二到四层楼高度，看进一个**有围合感的居住空间**（院子、巷子、街），不是开阔的大远景；
2. **一种持续的粒子动态**充满画面（雪 / 雨 / 花瓣 / 落叶 / 蜻蜓），用 `fx.Particles`，按深度遮挡、按光源着色；
3. **冷的大环境 + 一两处暖光**，暖光要照在粒子和树冠上；窗户零星亮着，其中一扇是电视的闪光；
4. 画面里要有一个大的自然形体做视觉重心（雪景的枯树、春天的花树、秋天的树冠拱廊），但不是特写；
5. 梦幻感：更浓的辉光（`fx.bloom` 的 gain 加大）、薄雾（`FOG`）、偏色的调色（`GRADE` 的 `tint_sh`）、
   饱和但柔和的天空渐变；宁可偏「画」也不要偏「照片」；
6. 生活痕迹照旧：`props.apt_block(details=True)`、`house`、`shed_row`、`bike_row`、`hedge`、`shrub`、`bench`、
   `junk_pile`、电线杆电线、春联横幅等。

花瓣和落叶的做法：`fx.Particles(..., vel=(0.2,-0.5,0.1), sway=0.5, size=0.05, loops=1)`，`p.tint` 给每个粒子一个颜色，
`draw(lin, ph, amb, lights)` 里把路灯作为 `lights` 传进去；参考 `scenes/snow.py` 的 `setup()/frame()`。
树冠用 `props.tree(..., kind='plane')` 取枝梢，再 `props.foliage(tips, n_per=很大, size=0.08~0.12, col=..., col2=..., p2=...)`；
离相机近的树叶片要小（否则是一片片大多边形）。地上的落花/落叶用很多贴地的小 quad（见已删除的 crossing 场景的做法：
`w.quads(..., mat='plain', col=cols, mask=MASK_THIN)`，y 取 0.03）。

### 音乐

用 **HoliznaCC0** 的成品曲（Free Music Archive，CC0 1.0，可自由使用，无需署名但 CREDITS 里要写明）。
候选已放在 `audio/music/`（特征是用 librosa 测的，我听不到声音）：

| 文件 | 曲名 | 特征 | 备注 |
|---|---|---|---|
| `lullabies_1.mp3` | Lullabies For The End Of The World #1 | 57 bpm，B 小调，几乎无鼓，很暗，165 秒 | **首选**：最接近参考曲（my head is empty 的 *i was only temporary*）那种慢、暗、孤独 |
| `never_sleeping.mp3` | Never Sleeping ( Lofi , Dark , Sad ) | 92 bpm，E 小调，几乎无鼓，185 秒 | 备选 |
| `before_everything.mp3` | Before Everything ( LoFi , Nostalgic ) | 76 bpm，B 小调，有 lofi 鼓点，很暗，171 秒 | 备选：更像典型的 lofi 电台曲 |
| `going_home.mp3` | Going "Home" | 65 bpm，E 小调，150 秒 | 备选 |

更多同一作者的曲子：<https://freemusicarchive.org/music/holiznacc0/public-domain-lofi>（页面里每首歌的
`data-track-info` 属性带直链 `fileUrl`）。**最终用哪首请让用户听过再定**；把几首都混一版给用户挑也可以。
成片直接用曲子本身（从头开始，结尾 3 秒淡出），不要再加工它。`audio/music.py`（原创配乐）要删掉。

### 音效

`audio/sfx.py` 现在每场一条 27 秒无缝循环的音床。要改成：

- 每场**只留一层环境声 + 至多一个点缀**，全部低通，电平比现在再低 6～8 dB（音床 RMS 约 −36 dB，雨约 −31 dB）；
- 雨：只留 `1289`（Rain on concrete）一层，去掉水洼声、城市底噪和电流声；
- 雪：只留低通后的风 `0595`，很轻；去掉狗叫和电流声；
- 春：很轻的夜风 `0595`/`0904` + 远处极轻的城市底噪 `0080`；
- 秋：风吹树叶 `0904`（Wind in the Trees）；
- 校园：夏夜虫鸣 `1470`（很轻），不要蛙、燕子、雷。
- 混音时音乐为主，音效整体在音乐下方约 12 dB。`make_film.py` 里的 `SFX_GAIN` 可以再调。
- 循环片段（`out/loops/`）仍然只带音效不带音乐。

### 总装

`make_film.py` 要改：`ORDER = [('spring','spring'), ('school','campus'), ('rain','rain'), ('autumn','autumn'), ('snow','snow')]`；
音乐改读 `audio/music/<选定的曲子>.mp3`（用 ffmpeg 转成 44.1k wav 再读，或 `librosa.load`）。
5 场 × 27 秒（9 秒循环 × 3）+ 3 秒尾 = 138 秒，不变。

## 3. 当前工作目录里有什么

渲染中间结果不在仓库里，在 `PX_OUT`（`run.py` 顶部的 `OUT`，本次会话是
`/tmp/claude-0/-home-user-Rainroji/6146149c-374c-532e-9224-be2885cb3c7f/scratchpad/work`）。如果那个目录还在：

- `snow_frames.npy`、`rain_frames.npy`：已定稿的循环帧（270 帧，640×360），直接用；
- `snow_S6.pkl`、`rain_S6.pkl`：对应的静态渲染缓存；
- `../sfx_dl/wav/*.wav`：已下载转好的 CC0 音效源；`../music_dl/*.mp3`：30 首候选曲。

如果目录没了：`DSTR=0.5 python3 run.py snow anim 6` 和 `... rain anim 6` 各约 6 分钟可以原样重渲
（代码是确定性的），`bash audio/get_sfx.sh <dir>` 重新下载音效。

## 4. 步骤

```bash
cd film
# 依赖见 README.md
export PX_OUT=<工作目录>/work
python3 run.py spring still 3      # 9 采样快速静帧，十几秒到一分钟；反复看图改构图和光
python3 run.py spring anim 6       # 定稿后渲染循环（36 采样）
# autumn、school 同理
python3 audio/sfx.py <sfx 源目录>/wav <工作目录>/audio/sfx
python3 make_film.py $PX_OUT out
# film.mp4 超过 100 MB 时：见 build.sh 最后一行的无损切分；整片不进 git（.gitignore）
```

每个场景模块需要提供：`NAME, T(=9.0), K, build(), camera(), sky(d), RENDER, GRADE, PAL, setup(plate, cam), frame(ctx, ph)`，
照 `scenes/snow.py` 写即可。看图用 `<PX_OUT>/<name>_px.png`（still）和 `<name>_f.png`、`<name>_sheet.png`（anim）。

定稿前自查（每场）：

- 缩略图里明暗大块是否清楚、暖光是否只占一小块、有没有前中远三层；
- 有没有哪个物体大到能看出它是怎么拼的（有就把相机拉远或把它挪走）；
- 离相机十几米内不要有树叶、电线、草；
- 用 `np.load(..._frames.npy)` 比较末帧→首帧的差和相邻帧的差，应该相当（无缝）；
- 和雪、雨两场摆在一起看，构图和色调是不是各不相同、但一看就是同一支片子。

交付：更新 `README.md`、`CREDITS.md`（音乐改为 HoliznaCC0 + 曲名 + 链接 + CC0）、`WORKFLOW.md`
（把第 3 节的规则补上这一轮的教训：见上面第 1、2 节），删除不用的场景和 `audio/music.py`，
提交并推送到分支 `claude/eloquent-archimedes-i22s27`，把 `film.mp4` 和 `loops/*.mp4` 发给用户。
推送后把这份 HANDOFF.md 删掉或改成已完成。

## 5. 这一轮得到的教训（写进 WORKFLOW.md）

- 「氛围」不等于「雾」「远景」。天台晨雾和铁路远眺都是**没有落点的风景**；雪和雨成立，是因为
  画面里有一个具体的、有人住的小世界，加上一种看得见的天气在其中不停地动。
- 季节要让人一眼认出来：雪、雨、落花、落叶、火烧云。不要用「晨雾」这种说不清季节的东西凑数。
- 布局要合常理（学校不会只有一栋楼立在大操场边）。不合理的布局会让人出戏，比细节少更致命。
- 颜色可以比现实更绚丽、更朦胧；写实反而显得平常。
- 配乐用成品曲，不要自己写。音效是底色，听得出但不该被注意到。

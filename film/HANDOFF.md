# 交接说明

第二轮修改已完成并推送：春夏秋冬四场（`spring / rain / autumn / snow`），成品 lofi 配乐，音效做了减法。
流程和教训都写进了 [`WORKFLOW.md`](WORKFLOW.md)（第 3 节是用户每条意见对应的规则，接手前必读）。

## 还没有得到用户确认的地方

- **配乐**：我听不到声音，`lullabies_1.mp3` 是按测出来的特征挑的（57 bpm、B 小调、几乎无鼓、很暗）。
  用户如果觉得不对，`audio/music/` 里有另外三首候选，改 `make_film.py` 的 `MUSIC` 后重跑总装即可（约 6 分钟，不用重渲画面）。
  更多曲子：<https://freemusicarchive.org/music/holiznacc0/public-domain-lofi>。
- **音效电平**：`audio/sfx.py` 里每场的 dB 值，和 `make_film.py` 的 `MUSIC_DB`、`LOOP_SFX_DB`。
- **春、秋两场**是新做的，用户还没看过。

## 可选的后续

- 用户提过校园场景「乍一看还行」，但要改：几栋教学楼围合成院子（不能一栋楼孤零零立在操场边），
  傍晚的**火烧云**要绚丽，晚自习的窗一排排亮着，粒子动态可以用成群低飞的蜻蜓。做得好可以作为「夏 · 傍晚」加进去
  （加进 `make_film.py` 的 `ORDER`，五场时把 `LOOPS` 改回 3）。旧的 `scenes/school.py` 已删，可从 git 历史取回参考。

## 重新出片

```bash
cd film
export PX_OUT=<工作目录>/work
DSTR=0.5 python3 run.py <scene> anim 6          # 每场约 6 分钟；still 3 是十几秒的快速静帧
python3 audio/sfx.py <sfx 源目录>/wav <工作目录>/audio/sfx     # 源文件用 audio/get_sfx.sh 下载
python3 make_film.py $PX_OUT out
# 整片超过 100 MB：按 build.sh 最后一行无损切分；out/film.mp4 不进 git
```

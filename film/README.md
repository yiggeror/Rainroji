# 暂住 / only temporary

五个可以无缝循环的像素动态场景，拼成一支 2 分 18 秒的短片。全部画面由这个目录里的代码渲染。

| | 场景 | 季节 · 时刻 · 天气 | 在动的东西 |
|---|---|---|---|
| 1 | `fog` 天台 | 春 · 清晨 · 大雾 | 盘旋的鸽群、漂移的雾、烟、晾着的衣服 |
| 2 | `campus` 校园 | 夏 · 傍晚 · 雨后晚霞 | 云、云里的闷闪、水洼、燕子、一根快坏的日光灯 |
| 3 | `rain` 街 | 夏 · 夜 · 雨 | 雨、涟漪、霓虹和灯箱、电视窗、理发店转灯、红绿灯 |
| 4 | `train` 铁路 | 秋 · 黄昏 · 晴 | 亮着窗的绿皮车、炊烟、归鸟、池塘、道口的红灯 |
| 5 | `snow` 家属院 | 冬 · 蓝调时刻 · 雪 | 雪、钠灯、电视窗、逐层亮起的楼道灯、烟 |

- 成片：1920×1080，30 fps，2 分 18 秒，带配乐和环境音。整片 142 MB，超过 GitHub 单文件 100 MB 的限制，
  所以**无损**切成了两段放在仓库里：`out/film_1.mp4`（0:00–1:22）和 `out/film_2.mp4`（1:22–2:18）。
  运行 `bash out/join.sh` 可以拼回 `out/film.mp4`（流拷贝，不重新编码；两段解码后的画面与整片校验和一致）
- 循环片段：`out/loops/*.mp4`（各 27 秒 = 3 个循环，首尾相接；只有环境音，没有配乐）
- 怎么做的、为什么这么做：[`WORKFLOW.md`](WORKFLOW.md)
- 素材来源：[`CREDITS.md`](CREDITS.md)

## 重新生成

```bash
pip install numpy scipy numba pillow soundfile librosa mido
apt-get install -y fluidsynth fluid-soundfont-gm fonts-wqy-zenhei fonts-arphic-ukai fonts-arphic-uming ffmpeg
bash build.sh /tmp/px_work
```

单独调一个场景：

```bash
python3 run.py snow still 3     # 9 采样的快速静帧，十几秒
python3 run.py snow anim 6      # 36 采样的完整循环
```

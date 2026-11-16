# 暂住 / only temporary

一支 lofi 电台式的像素短片：春夏秋冬四个可以无缝循环的动态场景，2 分 27 秒。全部画面由这个目录里的代码渲染；
配乐是 HoliznaCC0 的 CC0 lofi 曲。

| | 场景 | 季节 · 时刻 · 天气 | 在动的东西 |
|---|---|---|---|
| 1 | `spring` 老巷 | 春 · 蓝调时刻 | 落花、被路灯照亮的花树、电视窗、炊烟 |
| 2 | `summer` 街 | 夏 · 夜 · 雨 | 雨、涟漪、霓虹和灯箱、电视窗、理发店转灯、红绿灯 |
| 3 | `autumn` 梧桐街 | 秋 · 黄昏 | 落叶、藏在树冠里的钠灯、报刊亭的灯 |
| 4 | `winter` 家属院 | 冬 · 蓝调时刻 · 雪 | 雪、钠灯、电视窗、逐层亮起的楼道灯、烟 |

- 成片：1920×1080，30 fps，2 分 27 秒，配乐 + 很轻的环境音。整片 229 MB，超过 GitHub 单文件 100 MB 的限制，
  所以**无损**切成三段放在仓库里：`out/film_1.mp4`（0:00–0:50）、`out/film_2.mp4`（0:50–1:38）、`out/film_3.mp4`（1:38–2:27）。
  `bash out/join.sh` 拼回 `out/film.mp4`（流拷贝，不重新编码；三段解码后的画面与整片校验和一致）
- 循环片段：`out/loops/*.mp4`（各 36 秒 = 4 个循环，首尾相接；只有环境音，没有配乐）
- 怎么做的、为什么这么做：[`WORKFLOW.md`](WORKFLOW.md)
- 素材来源：[`CREDITS.md`](CREDITS.md)

## 重新生成

```bash
pip install numpy scipy numba pillow soundfile
apt-get install -y fonts-wqy-zenhei fonts-arphic-ukai fonts-arphic-uming ffmpeg
bash build.sh /tmp/px_work
```

单独调一个场景：

```bash
python3 run.py snow still 3     # 9 采样的快速静帧，十几秒
python3 run.py snow anim 6      # 36 采样的完整循环
```

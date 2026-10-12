# 场景漫游作品集

六个浏览器场景项目，加一份早期单页作品。原创插画画廊可直接离线打开；两套官方剧照画廊需要先下载素材；3D 场景需要先构建。

| 项目 | 内容 | 运行方式 |
| --- | --- | --- |
| [千与千寻场景画廊](spirited-away/index.html) | 12 个场景，原创生成插画 | 双击 index.html |
| [幽灵公主场景画廊](princess-mononoke-gallery/index.html) | 16 个场景，原创生成插画 | 双击 index.html |
| [天空之城插画画廊](sky-city-gallery/index.html) | 16 个场景，原创生成插画 | 双击 index.html |
| [天空之城 3D 空间](sky-city-3d/) | 连续空间漫游 | Node.js 安装并构建 |
| [天空之城剧照画廊](laputa-original-gallery/index.html) | 20 个场景，官方剧照 | 先运行素材获取脚本 |
| [起风了剧照画廊](wind-rises-gallery/index.html) | 20 个场景，官方剧照 | 先运行素材获取脚本 |

## 快速开始

1. 克隆仓库后，双击 `index.html` 打开总入口；原创插画项目可直接进入。
2. 使用官方剧照画廊前，运行 `python scripts/fetch_official_assets.py`。脚本从吉卜力工作室官网分别获取所选的 20 张剧照到本机，下载内容被 Git 忽略。也可以只下载其中一套：`python scripts/fetch_official_assets.py laputa-original-gallery`。
3. 使用 3D 场景前，在 `sky-city-3d` 目录运行 `npm ci` 和 `npm run build`，然后从总入口打开构建后的页面。浏览器可能不允许直接以 `file://` 打开 3D 构建文件，此时在仓库根目录运行 `python -m http.server 8000`，访问 `http://localhost:8000`。

两套剧照来自吉卜力工作室官方 [作品图库](https://www.ghibli.jp/works/)。官网发布的[剧照使用说明](https://www.ghibli.jp/info/013344/)不是开源授权。此仓库**不包含**电影原生剧照，也不将其纳入 MIT 许可；请自行判断使用范围。原创生成的画面也是非官方同人展示，相关作品、角色和名称的权利归原权利人。

## 项目结构与许可

- 根目录 `index.html`：作品导航页。
- `spirited-away/`、`princess-mononoke-gallery/`、`sky-city-gallery/`：自带运行素材的静态画廊。
- `laputa-original-gallery/`、`wind-rises-gallery/`：播放器和场景资料；本地剧照由脚本获取。
- `sky-city-3d/`：Three.js / Vite 浏览器场景。
- `legacy/sky-city.html`：早期单文件版本，保留供对照。

程序代码采用 [MIT 许可](LICENSE)。仓库中的图像不在 MIT 许可范围内，详见 [素材说明](ASSET_POLICY.md)。

# 部署（香港轻量 2C4G · Ubuntu 22.04）

## 0. 一次性准备（在服务器上）

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 项目
git clone <你的仓库> marketing-photo-aigc && cd marketing-photo-aigc
```

## 1. 放模型（不打进镜像）

```bash
mkdir -p models/easyocr
cd models
curl -L -o sam_vit_b.pth \
  https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth   # 375MB

# EasyOCR 权重：本地跑过一次后从 ~/.EasyOCR/model 拷上去即可
# scp -r ~/.EasyOCR/model/* user@server:~/marketing-photo-aigc/models/easyocr/
```

## 2. 配置

```bash
cp deploy/.env.example deploy/.env
vi deploy/.env          # 填 DEEPSEEK_API_KEY
```

## 3. 起服务

```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f backend
```

访问：`http://<公网IP>/`

## 4. 域名（可选）

把 `deploy/Caddyfile` 第一行 `:80` 改成 `yourdomain.com`，
并在 DNS 加 A 记录指向服务器 IP，Caddy 会自动申请 HTTPS 证书。

## 注意

- 首次 build 约 10–20 分钟（torch 下载占大头），2C4G 上更慢
- `backend/data` 与 `models` 都挂 volume，重建容器不丢数据
- 安全组只需放行 80/443 和你的 SSH 端口，**不要**把 3000 暴露到公网

## 5. 本地只跑前端（后端在远程）

`deploy/docker-compose.remote.yml` 是「只跑后端」的编排，配合本地 dev-server 的 proxy 使用：

```bash
# 服务器
cd /root/aigc
docker compose -f deploy/docker-compose.remote.yml up -d --build

# 本地（不启动本地后端）
API_PROXY_TARGET=http://<服务器IP>:3000 pnpm --filter @marketing-photo/frontend dev
```

前端代理已覆盖后端全部路由前缀：`/api`、`/media`、`/gallery`、`/health`，
因此上传、分析、图库、合成、素材等接口都会走远程，不只是图片。

### 远程部署踩坑清单

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| Python 解释器路径 | `spawn /usr/bin/python3 ENOENT`，且 Node 进程直接退出 | 镜像内用 `/usr/local/bin/python3`；`spawn` 必须挂 `error` 事件 |
| torch 与 NumPy 不兼容 | 文字探查报 `Numpy is not available` | 固定 `numpy==1.26.4` + `opencv-python-headless==4.10.0.84` |
| `ffmpeg-static` 无二进制 | `--ignore-scripts` 下 ffmpeg 不可用 | 镜像内 `apt install ffmpeg`，并设 `FFMPEG_PATH`/`FFPROBE_PATH` |
| 数据目录错位 | 启动目录是 `/app`，默认 `DATA_ROOT` 变成 `/app/data` | 显式设 `DATA_ROOT=/app/backend/data` |
| 只监听本地 | 公网连不上 | `BACKEND_HOST=0.0.0.0` + 安全组放行 3000 |
| 容器内没有 `.env.local` | Python 拿不到密钥 | `workflow-analyze.py` 增加 `os.environ["DEEPSEEK_API_KEY"]` 兜底 |
| HEIC 只能解出缩略图/半分辨率 | 海报尺寸错误或模糊 | 镜像装 `libheif-examples`，`HEIF_CONVERT_PATH=/usr/bin/heif-convert`，转码优先走 heif-convert |
| thumb.jpg 缺失 | `/preview/thumb.jpg` 返回 404 | 历史行为：缩略图由 `LocalPhotoLibrary.ensurePreview` 懒生成，前端应回退到 poster |

### 校验命令

```bash
# 判断镜像是否重建完成（新镜像应为 1.26.4）
ssh -i ~/.ssh/<key>.pem root@<服务器IP> \
  'docker exec aigc-backend python3 -c "import numpy;print(numpy.__version__)"'

# 公网直连自检
curl -s http://<服务器IP>:3000/health
curl -s -o /dev/null -w "%{http_code}\n" http://<服务器IP>:3000/api/v1/gallery/motionsites
```

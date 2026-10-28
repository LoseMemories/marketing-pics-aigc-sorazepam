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

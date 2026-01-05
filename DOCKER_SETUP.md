# Docker 安装与 SRS 启动指南

下面是你在 Windows 环境上安装 Docker Desktop 并启动本地 SRS（用于 RTMP→HLS 验证）的逐步命令与检验方法。

## 安装 Docker Desktop（Windows）
1. 下载并安装： https://www.docker.com/get-started
2. 启用 WSL2（根据安装向导）或 Hyper-V，完成后重启电脑。
3. 启动 Docker Desktop 并确保 `docker` 命令可用：
   ```powershell
   docker --version
   docker compose version
   ```

## 启动 SRS + Web
1. 进入项目目录：
   ```powershell
   cd "d:\Vibe Coding\vs-code\live-prototype"
   ```
2. 启动容器：
   ```powershell
   docker compose up -d --build
   ```
3. 检查容器状态：
   ```powershell
   docker compose ps
   docker compose logs -f srs
   ```

## 推流与验证
1. 使用 ffmpeg 推流示例（把 `sample.mp4` 换成你的视频或从 OBS 推）：
   ```powershell
   ffmpeg -re -i sample.mp4 -c:v libx264 -c:a aac -f flv rtmp://localhost:1935/live/stream
   ```
2. 检查浏览器 HLS 地址：
   - 播放器页面： http://localhost:3000 ，输入 `stream` 点击 Play
   - HLS 清单（SRS 暴露）： http://localhost:8080/live/stream.m3u8
3. 如果 HLS 无法播放，请检查 SRS 日志（`docker compose logs -f srs`），并确认 `objs/nginx/html/live/` 下生成了 `.m3u8` / `.ts` 文件（容器内部路径为 `/usr/local/srs/objs/nginx/html/live/`）。

## 常见问题
- Docker 报错找不到 WSL：确认已启用并安装 WSL2，并在 Docker Desktop 设置中选择 WSL 2 后端。
- 端口被占用（1935/8080/3000）：确保没有其他服务占用这些端口，或修改 `docker-compose.yml` 映射端口。

---
一旦你确认 Docker 已安装并运行，回复我，我会远程（在你的环境里）运行 `docker compose up`、检查 SRS 日志并演示一次 ffmpeg 推流到 HLS 的完整验证过程。
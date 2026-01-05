# Live Prototype (RTMP → HLS)

这是一个最小可行原型，用于演示：主播用 OBS 或 ffmpeg 推 RTMP 到本地 SRS，SRS 将流转成 HLS，浏览器通过 HLS.js 播放。

## 快速启动

1. 在项目目录运行：

   docker compose up -d --build

2. 使用 FFmpeg 推流（或在 OBS 中配置 RTMP 推流地址 `rtmp://localhost:1935/live/stream`）：

   ```bash
   ffmpeg -re -i sample.mp4 -c:v libx264 -c:a aac -f flv rtmp://localhost:1935/live/stream
   ```

3. 打开网页播放器： http://localhost:3000 ，输入流名（例如 `stream`），点击 Play。

## 说明
- SRS 的 HTTP Server 在容器内的 `./objs/nginx/html` 下输出 HLS 文件，映射到宿主由 `docker-compose.yml` 管理。
- HLS 地址示例： `http://localhost:8080/live/stream.m3u8`。

## 下一步建议
- 添加房间后端 API（房间列表 / 鉴权）
- 添加聊天（Socket.IO） — 已实现本地聊天 UI（前端模拟），后续接入后端消息服务
- 集成 CDN 并做压测

## 界面更新
已美化直播间界面：
- 响应式布局（视频 + 聊天面板）
- 观看器计数、分享按钮、发送聊天的本地演示
- 优化样式和控制条（在 `web/public` 下查看 `index.html` 与 `styles.css`）


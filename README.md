# Live Prototype (RTMP → HLS)

这是一个功能完整的直播平台最小可行原型（MVP），用于演示：主播用 OBS 或 ffmpeg 推 RTMP 到本地 SRS，SRS 将流转成 HLS，浏览器通过 HLS.js 播放。

> 📋 **[查看完整项目进度报告](PROJECT_STATUS.md)** - 详细的功能清单、技术架构和开发计划

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

## 已实现功能
- ✅ **流媒体核心**: RTMP 推流 → SRS 转码 → HLS 播放
- ✅ **房间管理**: 房间列表、创建、状态管理、封面上传
- ✅ **实时聊天**: Socket.IO + Redis，支持消息持久化和历史记录
- ✅ **用户系统**: JWT 认证、角色管理、用户偏好存储
- ✅ **内容审核**: 敏感词过滤、审核队列、用户封禁
- ✅ **前端界面**: 播放器、房间列表、管理后台、响应式设计
- ✅ **E2E 测试**: 覆盖聊天、审核、房间管理等核心功能

## 下一步计划
- [ ] 完善用户注册/登录（密码验证）
- [ ] 弹幕系统
- [ ] 直播录制与回放
- [ ] CDN 集成与性能压测
- [ ] 移动端 App 开发

详见 [PROJECT_STATUS.md](PROJECT_STATUS.md)

## 界面更新
已美化直播间界面：
- 响应式布局（视频 + 聊天面板）
- 观看器计数、分享按钮、发送聊天的本地演示
- 优化样式和控制条（在 `web/public` 下查看 `index.html` 与 `styles.css`）


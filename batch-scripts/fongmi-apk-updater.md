# FongMi APK 智能加速更新脚本

[![GitHub](https://img.shields.io/badge/GitHub-SurfHelper-blue?logo=github)](https://github.com/RiTian96/SurfHelper)
[![TG频道](https://img.shields.io/badge/Telegram-Channel-blue?logo=telegram)](https://t.me/SurfHelper_C)

## 📋 主要功能

- **🚀 智能测速**: 自动从 10 个精选的 GitHub 加速代理节点中挑选响应最快的线路。
- **📦 批量下载**: 一键获取 FongMi (蜂蜜) 播放器的最新版 APK 文件，包括：
  - `leanback-arm64_v8a.apk` (电视/盒子 64位)
  - `leanback-armeabi_v7a.apk` (电视/盒子 32位)
  - `mobile-arm64_v8a.apk` (手机 64位)
- **⚡ 高效稳定**: 基于 `curl` 实现，支持断点续传（通过加速节点实现），下载过程可视化。
- **🛡️ 自动回退**: 若所有优选节点均不可用，将自动切换至默认备用线路。

## 🛠️ 如何使用

1. **前提条件**: 
   - 确保你的 Windows 系统支持 `curl` 命令（Windows 10 1803 及更高版本已内置）。
2. **执行脚本**:
   - 直接双击运行 `fongmi-apk-updater.bat`。
3. **查看结果**:
   - 脚本执行完成后，APK 文件将下载至脚本所在的文件夹中。

## 📝 更新日志

### v1.0.0 (2026-03-29)
- 🎯 初版发布。
- ✨ 实现 10 个代理节点的并行筛选与自动加速下载。
- 🔧 支持 FongMi 电视版与移动版全量架构 APK 下载。

## 💬 问题反馈

- **Telegram 频道**: [https://t.me/SurfHelper_C](https://t.me/SurfHelper_C)
- **Telegram 群组**: [https://t.me/SurfHelper_G](https://t.me/SurfHelper_G)

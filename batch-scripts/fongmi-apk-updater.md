# FongMi APK 手动下载器

[![GitHub](https://img.shields.io/badge/GitHub-SurfHelper-blue?logo=github)](https://github.com/RiTian96/SurfHelper)
[![TG频道](https://img.shields.io/badge/Telegram-Channel-blue?logo=telegram)](https://t.me/SurfHelper_C)

## 📋 主要功能

- **📦 版本选择**: 支持下载 FongMi (蜂蜜) 播放器的最新版 APK 文件：
  - `leanback-arm64_v8a.apk` (电视/盒子 64位)
  - `leanback-armeabi_v7a.apk` (电视/盒子 32位)
  - `mobile-arm64_v8a.apk` (手机 64位)
- **🎮 手动节点选择**: 4 个 GitHub 加速代理节点 + 1 个直连节点，按网络状况自由切换。
- **🔄 失败重试**: 当前节点下载失败可随时换节点重试，已完整下载的文件自动跳过。
- **🛡️ 稳定可靠**: 无后台并发/无自动测速/无 taskkill，纯前台顺序下载，bat 兼容性最大化。

## 🛠️ 如何使用

1. **前提条件**: 
   - 确保你的 Windows 系统支持 `curl` 命令（Windows 10 1803 及更高版本已内置）。
2. **执行脚本**:
   - 直接双击运行 `fongmi-apk-updater.bat`。
3. **选择文件**:
   - 按 `1/2/3` 选择单个版本，按 `4` 下载全部三个版本。
4. **选择节点**:
   - 按 `0` 直连 GitHub，或按 `1~4` 选择加速代理节点。
5. **失败重试**:
   - 若下载失败，按 `Y` 返回节点选择菜单换节点重试，按 `N` 退出。
6. **查看结果**:
   - 脚本执行完成后，APK 文件将下载至脚本所在的文件夹中。

## 📝 更新日志

### v2.2.0 (2026-04-21)
- 🎯 改为纯手动选择模式：先选文件，再选节点（直连/4个代理）。
- 🎯 下载失败可随时换节点重试，已下载文件自动跳过。
- 🔧 彻底移除自动测速与并发下载逻辑，避免 taskkill 误杀。
- 🐛 修复 bat `if` 嵌套 `else` 解析 bug（goto 分支替代）。
- 🐛 修复 `set /p` 输入残留回车符导致匹配失败的问题（改用 `choice`）。

### v2.1.0 (2026-04-21)
- 🎯 统一测速 + 并发下载三个文件。
- 🔧 修复逐文件测速时 taskkill 误杀问题。
- 🐛 修复 `timeout` 在非交互式环境报错的问题（ping 替代）。

### v2.0.0 (2026-04-12)
- 🎯 重新设计下载策略：去掉竞速测速阶段，改用 4 个预选优质节点按优先级尝试。
- ⚡ 新增智能卡顿检测：速度低于 0.5 MB/s 持续 4 秒自动换节点（curl `--speed-limit` / `--speed-time`）。
- 🔧 节点列表精简为 4 个实测优质节点（从 57 个候选中串行 3 轮实测筛选）。
- 🎨 交互优化：版本选择倒计时从 5 秒缩短为 1 秒。
- 🐛 修复 `for` 循环内 `goto` 导致脚本崩溃闪退的 bat 兼容性问题。
- 🐛 修复下载 URL 缺少 `https://` 前缀、`findstr` 匹配过宽等多项 bug。

### v1.1.0 (2026-04-12)
- 🎯 新增交互式版本选择（1/2/3/A），5秒无操作默认下载全部三个版本。
- 🎯 新增下载失败询问是否继续，5秒无操作默认停止后续下载。
- 🔧 下载流程去重，三个重复代码块合并为循环。
- 🐛 修复 `goto` 标签语法错误（原双冒号 `::START_DOWNLOAD` 导致跳转失效）。
- 🐛 修复脚本目录切换失效问题。
- 🐛 修复下载 URL 双斜杠问题。

### v1.0.0 (2026-03-29)
- 🎯 初版发布。
- ✨ 实现 10 个代理节点的并行筛选与自动加速下载。
- 🔧 支持 FongMi 电视版与移动版全量架构 APK 下载。

## 💬 问题反馈

- **Telegram 频道**: [https://t.me/SurfHelper_C](https://t.me/SurfHelper_C)
- **Telegram 群组**: [https://t.me/SurfHelper_G](https://t.me/SurfHelper_G)

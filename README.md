# SurfHelper

> **从零开始改善你的上网体验**

个人自用备份仓库，包含各种实用工具和脚本，专注于提升网页浏览和使用体验。

## 📁 项目结构

```
SurfHelper/
├── tampermonkey-scripts/          # 油猴脚本文件夹
│   ├── coc-layout-helper.md       # COC阵型复制助手说明文档
│   ├── coc-layout-helper.user.js  # COC阵型复制助手 (v1.1.1)
│   ├── javdb-manager.md           # JavDB影片管理器说明文档
│   ├── javdb-manager.user.js      # JavDB影片管理器 (v1.0.0)
│   ├── video-parser.md            # VIP视频解析器说明文档
│   ├── video-parser.user.js       # VIP视频解析器 (v1.4.1)
│   ├── weibo-magnet-linker.md     # 微博磁链补全助手说明文档
│   └── weibo-magnet-linker.user.js # 微博磁链补全助手 (v1.1.0)
└── README.md                       # 项目说明文档
```

## 🛠️ 油猴脚本

| 脚本名称 | 版本 | 功能描述 | 文档 | 安装 |
|---------|------|---------|------|------|
| **COC阵型复制助手** | v1.1.1 | 绕过付费限制，一键复制阵型链接，支持大图预览和历史记录 | [📖 查看文档](tampermonkey-scripts/coc-layout-helper.md) | [🔧 安装脚本](https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/coc-layout-helper.user.js) |
| **JavDB影片管理器** | v1.0.0 | 智能屏蔽已看/想看影片，低分过滤，高分高亮，批量导入管理 | [📖 查看文档](tampermonkey-scripts/javdb-manager.md) | [🔧 安装脚本](https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/javdb-manager.user.js) |
| **微博磁链补全助手** | v1.1.0 | 自动识别并补全微博中的磁力链接 | [📖 查看文档](tampermonkey-scripts/weibo-magnet-linker.md) | [🔧 安装脚本](https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/weibo-magnet-linker.user.js) |
| **VIP视频解析器** | v1.4.1 | 多平台视频解析，集成16+解析接口，极简界面设计，小图标模式不遮挡视频 | [📖 查看文档](tampermonkey-scripts/video-parser.md) | [🔧 安装脚本](https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/video-parser.user.js) |

## ✨ 特色功能

### 🎬 VIP视频解析器 (v1.4.1)
- **智能解析** - 支持腾讯视频、爱奇艺、优酷、B站、芒果TV等主流平台
- **极简界面** - 小图标模式，不遮挡视频内容，点击展开完整面板
- **剧集自动切换** - 检测剧集切换自动重新解析
- **B站智能过滤** - 番剧自动解析，普通视频仅手动解析
- **增强视觉反馈** - 加载动画、进度条、实时状态提示

### 🎬 JavDB影片管理器 (v1.0.0)
- **智能屏蔽** - 自动识别已看/想看影片并降低透明度
- **低分过滤** - 智能屏蔽3.5分以下且评价人数超过5人的影片
- **高分高亮** - 4.5分以上显示"必看"，4.0分以上显示"推荐"
- **批量导入** - 支持翻页自动导入已看/想看列表
- **可视化管理** - 右上角悬浮窗，支持搜索和快速操作

### 🏰 COC阵型复制助手 (v1.1.1)
- **绕过限制** - 后台无感提取阵型链接，无需付费
- **智能预览** - 鼠标悬停显示高清大图，智能避让
- **历史管理** - 左侧悬浮背包记录历史阵型
- **二维码支持** - 扫码直连阵型

### 🔗 微博磁链补全助手 (v1.1.0)
- **智能识别** - 自动识别40位磁力哈希值
- **自动补全** - 转换为可点击的磁力链接
- **安全过滤** - 避免误匹配，精确识别
- **多平台支持** - 支持微博主站、搜索、发现页面

## 🚀 快速开始

1. **安装油猴插件** - [Tampermonkey](https://www.tampermonkey.net/)
2. **选择脚本** - 点击上方表格中的安装链接
3. **自动运行** - 访问对应网站即可享受增强功能

## 📞 联系方式

**TG频道：** https://t.me/SurfHelper_C  
**TG群组：** https://t.me/SurfHelper_G  

## 📄 许可证

本项目采用 MIT 许可证 - 可自由使用、修改和分发

---

*最后更新：2025年12月3日*
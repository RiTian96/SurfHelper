# SurfHelper 项目上下文

## 🖥️ 开发环境信息
- **操作系统**: Windows (win32)
- **Shell 环境**: PowerShell
- **命令语法**: 使用分号 `;` 分隔命令，而非 `&&`
- **换行符**: CRLF (`\r\n`)
- **路径格式**: Windows 反斜杠路径 (`C:\Users\...`)

## 🔗 相关链接
- **GitHub仓库**: [https://github.com/RiTian96/SurfHelper](https://github.com/RiTian96/SurfHelper)
- **Greasy Fork**: [https://greasyfork.org/zh-CN/users/332142-ritian96](https://greasyfork.org/zh-CN/users/332142-ritian96)

## 项目概述

SurfHelper 是一个专注于提升网页浏览体验的个人工具集项目，主要包含多个 Tampermonkey 油猴脚本。该项目于 2025 年 12 月 2 日创建，采用 MIT 许可证，托管在 GitHub 上。

## 项目结构

```
SurfHelper/
├── tampermonkey-scripts/          # 油猴脚本文件夹
│   ├── coc-layout-helper.md           # COC阵型辅助说明文档
│   ├── coc-layout-helper.user.js      # COC阵型辅助脚本 (v1.1.3)
│   ├── javdb-manager.md               # JavDB影片管理器说明文档
│   ├── javdb-manager.user.js          # JavDB影片管理器 (v1.3.0)
│   ├── vip-video-parser.md            # 视频解析器说明文档
│   ├── vip-video-parser.user.js       # 视频解析器 (v1.4.2)
│   ├── weibo-magnet-linker.md         # 微博磁链辅助说明文档
│   └── weibo-magnet-linker.user.js    # 微博磁链自动补全 (v1.1.1)
├── README.md                       # 项目说明文档
└── IFLOW.md                        # 本文件，项目上下文
```

## 核心组件

### 1. COC阵型复制助手 (v1.1.3)
- **文件**: `tampermonkey-scripts/coc-layout-helper.user.js`
- **文档**: `tampermonkey-scripts/coc-layout-helper.md`
- **功能**: Clash of Clans 阵型网站增强工具
- **核心特性**:
  - 绕过付费/次数限制，后台无感提取阵型链接
  - 鼠标悬停显示高清巨型大图（自适应尺寸，智能避让）
  - 左侧悬浮背包记录历史阵型（最多50条）
  - 二维码扫码直连支持
- **运行时机**: document-start
- **权限**: GM_addStyle, GM_setClipboard
- **配置**: 可开启调试模式，自定义历史记录数量

### 2. JavDB影片管理器 (v1.3.0)
- **文件**: `tampermonkey-scripts/javdb-manager.user.js`
- **文档**: `tampermonkey-scripts/javdb-manager.md`
- **功能**: JavDB 网站影片管理工具，提供智能过滤和管理功能
- **核心特性**:
  - 已看/想看影片自动屏蔽（降低透明度）
  - **评分规则**：10人以下正常显示，10人以上按分数分级（0-3.5屏蔽，3.5-4.0正常，4.0-4.5推荐，4.5以上必看）
  - 批量导入已看/想看列表（URL翻页导入，智能停止机制）
  - 去重处理（同一番号只能在想看/已看中存在一个，按最后导入位置计算）
  - 智能搜索和管理功能（快速添加/删除影片）
  - 可视化开关控制（可独立控制各功能模块）
  - **按钮联动**：影片详情页点击想看/看過按钮自动导入番号到本地列表
- **支持网站**: javdb.com
- **运行时机**: 未明确指定（默认 document-end）
- **权限**: GM_setValue, GM_getValue, GM_deleteValue, GM_listValues

### 3. VIP视频解析器 (v1.4.2)
- **文件**: `tampermonkey-scripts/vip-video-parser.user.js`
- **文档**: `tampermonkey-scripts/vip-video-parser.md`
- **功能**: 多平台视频解析工具，集成 15 个解析接口
- **支持平台**: 腾讯视频、爱奇艺、优酷、B站、芒果TV
- **特色功能**: 
  - 键盘快捷键支持 (Ctrl+Enter 快速解析)
  - 剧集自动切换检测
  - B站智能过滤（番剧自动解析，普通视频仅手动解析）
  - 跨域统一配置
  - 新增 HLS 解析接口支持
- **运行时机**: document-start
- **权限**: GM_setValue, GM_getValue, GM_deleteValue

### 4. 微博磁链补全助手 (v1.1.1)
- **文件**: `tampermonkey-scripts/weibo-magnet-linker.user.js`
- **文档**: `tampermonkey-scripts/weibo-magnet-linker.md`
- **功能**: 微博磁力链接自动补全工具
- **核心特性**:
  - 智能识别 40 位磁力哈希值
  - 自动补全 magnet 前缀
  - 安全过滤机制（避免在链接、代码等元素中误匹配）
  - 悬停效果和美观样式
- **支持网站**: weibo.com, s.weibo.com, d.weibo.com
- **运行时机**: 未明确指定（默认 document-end）
- **权限**: 无特殊权限要求
- **特殊功能**: 唯一包含 图标的脚本

## 开发约定

### 代码风格
- 使用严格模式 (`'use strict'`)
- 采用现代 JavaScript (ES6+) 语法
- 代码结构清晰，分段注释明确
- 功能模块化，配置与逻辑分离

### 脚本元数据
所有脚本都包含完整的 Tampermonkey 元数据：
- 脚本名称
- GitHub 项目地址
- 语义化版本号
- 功能描述
- 作者: RiTian96
- 目标网站匹配规则
- 所需权限
- MIT 许可证
- 自动更新URL
- 下载URL
- 运行时机（VIP视频解析器和COC阵型助手使用 document-start）
- 图标设置（仅微博磁链补全助手包含）

### 版本管理
- 采用语义化版本控制 (Major.Minor.Patch)
- 每个脚本都有对应的 Markdown 文档
- 文档中包含详细的更新日志

## 项目维护

### 更新机制
- 所有脚本都配置了自动更新 URL
- 使用 GitHub Raw 作为更新源
- 支持油猴插件的自动更新功能

### 联系方式
- TG频道: https://t.me/SurfHelper_C
- TG群组: https://t.me/SurfHelper_G

### 许可证
- 项目采用 MIT 许可证
- 可自由使用、修改和分发

## 技术特点

### 安全性
- 所有脚本仅在前端运行，不收集用户数据
- 采用安全过滤机制，避免误操作
- 代码开源，透明可审计

### 性能优化
- 智能DOM遍历，减少页面性能影响
- 实时监听页面变化，动态处理新内容
- 避免在iframe中重复运行
- 使用 requestAnimationFrame 优化DOM操作（微博磁链补全助手）
- MutationObserver 监听动态内容加载（微博磁链补全助手）

### 兼容性
- 支持现代浏览器
- 适配各种屏幕尺寸
- 跨平台兼容

## 使用场景

该项目适用于：
- 视频网站VIP内容解析
- 游戏阵型分享和浏览
- 影片资源管理和筛选
- 社交媒体资源分享
- 网页浏览体验增强

## 未来扩展

项目架构支持轻松添加新的油猴脚本，保持统一的代码风格和文档结构。
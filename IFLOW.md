# SurfHelper 项目上下文

## 🖥️ 开发环境与用户偏好
- **操作系统**: Windows 64位 (win32)
- **处理器架构**: x64
- **Shell 环境**: PowerShell
- **语言环境**: 中文用户，使用中文进行交流

### Windows 平台语法注意事项
- **命令连接符**: 使用 `;` 分隔多个命令，而非 Unix/Linux 的 `&&`
- **路径分隔符**: 使用 `\` 而非 `/`，但 PowerShell 通常兼容两种格式
- **字符串引用**: 优先使用双引号 `"`，单引号 `'` 用于字面量字符串
- **命令执行**: 避免使用 Unix 特有的命令如 `ls`、`cat`，使用 PowerShell 对应命令如 `Get-ChildItem`、`Get-Content`
- **环境变量**: 使用 `$env:VARIABLE_NAME` 格式，如 `$env:PATH`

## 🔗 相关链接
- **GitHub仓库**: [https://github.com/RiTian96/SurfHelper](https://github.com/RiTian96/SurfHelper)
- **Greasy Fork**: [https://greasyfork.org/zh-CN/users/332142-ritian96](https://greasyfork.org/zh-CN/users/332142-ritian96)

## 项目概述

SurfHelper 是一个专注于提升网页浏览体验的个人工具集项目，主要包含多个 Tampermonkey 油猴脚本。项目采用模块化设计，每个脚本独立运行，专注于特定网站的功能增强。

## 🛠️ 脚本矩阵

### 当前脚本列表
1. **COC阵型复制助手** (`coc-layout-helper.user.js`)
   - 版本: 1.1.3
   - 目标网站: `*://coc.6oh.cn/*`
   - 核心功能: 绕过付费限制提取阵型链接，大图预览，历史记录

2. **JavDB影片管理器** (`javdb-manager.user.js`)
   - 版本: 1.4.0
   - 目标网站: `https://javdb.com/*`
   - 核心功能: 已看/想看影片屏蔽，评分高亮，批量管理

3. **VIP视频解析器** (`vip-video-parser.user.js`)
   - 版本: 1.4.2
   - 目标网站: 多平台视频网站
   - 核心功能: 15个解析接口集成，一键解析VIP内容

4. **微博磁链补全助手** (`weibo-magnet-linker.user.js`)
   - 版本: 1.1.1
   - 目标网站: `*://weibo.com/*`, `*://s.weibo.com/*`, `*://d.weibo.com/*`
   - 核心功能: 智能识别磁力哈希值，自动补全magnet链接

## 开发约定

### 代码风格
- 使用严格模式 (`'use strict'`)
- 采用现代 JavaScript (ES6+) 语法
- 代码结构清晰，分段注释明确
- 功能模块化，配置与逻辑分离

### 脚本元数据规范
所有脚本都包含完整的 Tampermonkey 元数据：
- **@name**: 脚本名称（中文）
- **@namespace**: GitHub项目地址
- **@version**: 语义化版本号 (Major.Minor.Patch)
- **@description**: 详细功能描述，使用[]标记核心功能点
- **@author**: RiTian96
- **@match**: 目标网站匹配规则
- **@icon**: 网站favicon图标（双重保险）
- **@grant**: 所需权限（GM_addStyle, GM_setValue等）
- **@run-at**: 运行时机（document-start或document-idle）
- **@license**: MIT
- **@updateURL**: GitHub Raw更新地址
- **@downloadURL**: GitHub Raw下载地址

### 版本管理
- 采用语义化版本控制 (Major.Minor.Patch)
- 每个脚本都有对应的 Markdown 文档和更新日志
- 版本号在脚本和文档中保持同步

### 文档格式规范
所有脚本文档必须包含以下5个核心部分：
1. **仓库导航** - GitHub和Greasy Fork链接
2. **主要功能** - 精简的核心功能点描述
3. **如何使用** - 清晰的安装和使用步骤
4. **更新日志** - 按时间倒序排列，每个版本明确标注日期
5. **问题反馈** - TG联系方式

### 更新日志 emoji 规范
- 🌐 图标相关更新
- 🎯 新功能/新特性
- 🔧 优化/修复/改进
- 🛡️ 安全性增强
- ⚡ 性能提升
- 🎨 界面/样式优化
- ✨ 功能亮点/特效
- 🎉 版本发布/里程碑
- 🐛 Bug修复
- 📊 数据/统计相关
- 🔄 同步/更新相关
- 🚀 部署/发布相关

### 一致性检查要求
- 脚本功能必须与说明文档完全对应
- 修改过的功能部分必须在文档中同步更新
- 检查所有文档的一致性，确保信息准确
- 版本号在脚本和文档中保持同步



## CLI 工作流程约定

### 文件修改标准流程
1. **读取** - 使用 `read_file` 工具先读取文件内容，了解当前状态
2. **分析** - 分析代码结构、功能逻辑和需要修改的部分
3. **修改** - 使用 `replace` 或 `write_file` 工具进行精确修改
4. **验证** - 确认修改结果符合预期，检查语法和逻辑

### 开发顺序约定
1. **脚本优先** - 先修改 `.user.js` 脚本文件，确保功能正确
2. **文档同步** - 等用户确认功能满意后，再更新对应的 `.md` 文档
3. **项目文档** - 更新 README.md 和 IFLOW.md
4. **最终确认** - 等用户确认文档内容后再上传到 GitHub

### 任务管理规则
- **复杂任务** - 非单一要求的任务必须使用 `todo_write` 工具进行任务规划
- **简单任务** - 单一、直接的任务可以不使用 todo_write
- **进度跟踪** - 及时更新任务状态，确保用户了解进展

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

## 项目结构

```
SurfHelper/
├── IFLOW.md                    # 项目上下文文档（本文件）
├── README.md                   # 项目主要说明文档
├── .git/                       # Git版本控制
└── tampermonkey-scripts/       # 油猴脚本目录
    ├── coc-layout-helper.md    # COC阵型助手文档
    ├── coc-layout-helper.user.js # COC阵型助手脚本
    ├── javdb-manager.md        # JavDB管理器文档
    ├── javdb-manager.user.js   # JavDB管理器脚本
    ├── vip-video-parser.md     # VIP视频解析器文档
    ├── vip-video-parser.user.js # VIP视频解析器脚本
    ├── weibo-magnet-linker.md  # 微博磁链助手文档
    └── weibo-magnet-linker.user.js # 微博磁链助手脚本
```
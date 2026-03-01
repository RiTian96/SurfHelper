# SurfHelper 项目上下文

## 🖥️ 开发环境与用户偏好
- **操作系统**: Windows 64位 (win32)
- **处理器架构**: x64
- **Shell 环境**: PowerShell
- **语言环境**: 中文用户，使用中文进行交流
- **当前日期**: 2026年2月24日

### Windows 平台语法注意事项
- **命令连接符**: 使用 `;` 分隔多个命令，而非 Unix/Linux 的 `&&`
- **路径分隔符**: 使用 `\` 或 `/`，PowerShell 兼容两种格式
- **字符串引用**: 优先使用双引号 `"`，单引号 `'` 用于字面量字符串
- **命令执行**: 避免使用 Unix 特有的命令如 `ls`、`cat`，使用 PowerShell 对应命令如 `Get-ChildItem`、`Get-Content`
- **环境变量**: 使用 `$env:VARIABLE_NAME` 格式，如 `$env:PATH`

## 🔗 相关链接
- **GitHub仓库**: [https://github.com/RiTian96/SurfHelper](https://github.com/RiTian96/SurfHelper)
- **Greasy Fork**: [https://greasyfork.org/zh-CN/users/332142-ritian96](https://greasyfork.org/zh-CN/users/332142-ritian96)
- **TG频道**: https://t.me/SurfHelper_C
- **TG群组**: https://t.me/SurfHelper_G

## 📋 项目概述

SurfHelper 是个人开发的小脚本集合，专注于提升网页浏览体验。项目采用模块化设计，主要包含多个 Tampermonkey 油猴脚本，每个脚本独立运行，专注于特定网站的功能增强。所有脚本均在前端运行，不收集用户数据，安全可靠。

### 设计理念
- **专注体验**: 解决实际浏览痛点，提升效率
- **安全可靠**: 纯前端运行，不收集用户隐私数据
- **持续迭代**: 根据用户反馈不断优化功能

## 🛠️ 脚本矩阵

### 当前脚本列表

| 脚本名称 | 版本 | 目标网站 | 核心功能 |
|---------|------|---------|---------|
| **COC阵型复制助手** | 1.1.3 | `*://coc.6oh.cn/*` | 绕过付费限制提取阵型链接，大图预览，历史记录背包，扫码直连 |
| **JavDB影片管理器** | 1.8.0 | `https://javdb.com/*` | 看过/想看影片屏蔽，低分过滤高分高亮；批量导入，大图预览，数据备份；支持欧美区番号 |
| **VIP视频解析器** | 1.4.2 | 多平台视频网站 | 多平台支持(腾讯/爱奇艺/优酷/B站/芒果TV)，15个解析接口，剧集自动切换，接口评分系统 |
| **微博磁链补全助手** | 1.1.1 | `*://weibo.com/*` | 智能识别40位磁力哈希值，自动补全magnet链接 |

### 功能分类

#### 🔓 破解增强类
- **COC阵型复制助手**: 绕过付费/次数限制，无感提取阵型链接
- **VIP视频解析器**: 多平台VIP内容解析(腾讯/爱奇艺/优酷/B站/芒果TV)，剧集自动切换，支持自动切换接口

#### 🛡️ 内容管理类
- **JavDB影片管理器**: 看过/想看影片屏蔽，低分过滤高分高亮；批量导入，大图预览，数据备份；支持欧美区番号

#### 🔗 链接处理类
- **微博磁链补全助手**: 自动识别并补全磁力链接

## 📝 开发约定

### 代码风格
- 使用严格模式 (`'use strict'`)
- 采用现代 JavaScript (ES6+) 语法
- 代码结构清晰，分段注释明确（使用 `=== Section Name ===` 格式）
- 功能模块化，配置与逻辑分离
- 使用 `const`/`let` 替代 `var`，避免变量提升问题

### 脚本元数据规范

所有脚本必须包含完整的 Tampermonkey 元数据块：

```javascript
// ==UserScript==
// @name         脚本名称（中文）
// @namespace    https://github.com/RiTian96/SurfHelper
// @version      Major.Minor.Patch
// @description  [核心] 主要功能；[辅助] 次要功能；[资源] 其他功能
// @author       RiTian96
// @match        目标网站匹配规则
// @icon         网站favicon图标（双重保险）
// @grant        所需权限（GM_addStyle, GM_setValue等）
// @run-at       document-start 或 document-idle
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/xxx.user.js
// @downloadURL  https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/xxx.user.js
// ==/UserScript==
```

### 常用权限说明
- `GM_addStyle`: 注入自定义CSS样式
- `GM_setValue` / `GM_getValue`: 跨页面数据持久化存储
- `GM_deleteValue` / `GM_listValues`: 数据管理
- `GM_setClipboard`: 设置剪贴板内容

### 版本管理
- 采用语义化版本控制 (SemVer: Major.Minor.Patch)
- **Major**: 重大功能变更或破坏性更新
- **Minor**: 新增功能，向后兼容
- **Patch**: Bug修复或小的优化
- 每个脚本都有对应的 Markdown 文档和更新日志
- 版本号在脚本和文档中保持同步

### 文档格式规范

所有脚本文档 (`.md`) 必须包含以下5个核心部分：

1. **仓库导航** - GitHub和Greasy Fork链接
2. **主要功能** - 精简的核心功能点描述，使用列表形式
3. **如何使用** - 清晰的安装和使用步骤
4. **更新日志** - 按时间倒序排列，每个版本明确标注日期，使用emoji标记
5. **问题反馈** - TG联系方式

### 更新日志 Emoji 规范

| Emoji | 含义 |
|-------|------|
| 🌐 | 图标相关更新 |
| 🎯 | 新功能/新特性 |
| 🔧 | 优化/修复/改进 |
| 🛡️ | 安全性增强 |
| ⚡ | 性能提升 |
| 🎨 | 界面/样式优化 |
| ✨ | 功能亮点/特效 |
| 🎉 | 版本发布/里程碑 |
| 🐛 | Bug修复 |
| 📊 | 数据/统计相关 |
| 🔄 | 同步/更新相关 |
| 🚀 | 部署/发布相关 |

### 一致性检查要求
- 脚本功能必须与说明文档完全对应
- 修改过的功能部分必须在文档中同步更新
- 检查所有文档的一致性，确保信息准确
- 版本号在脚本和文档中保持同步

## 🔨 CLI 工作流程约定

### 文件修改标准流程
1. **读取** - 使用 `read_file` 工具先读取文件内容，了解当前状态
2. **分析** - 分析代码结构、功能逻辑和需要修改的部分
3. **修改** - 使用 `replace` 或 `write_file` 工具进行精确修改
4. **验证** - 确认修改结果符合预期，检查语法和逻辑

### 开发顺序约定

**三步验收流程：**

1. **需求与开发** - 用户提出需求，CLI 进行代码编写（仅修改 `.user.js` 脚本文件）
2. **验收与文档** - 等用户验收功能通过后，更新版本号和文档
   - 版本号更新规则：
     - **Patch (+0.0.1)**：小修补、Bug修复
     - **Minor (+0.1)**：小功能增减、功能优化
     - **Major (+1)**：整个代码重构、重大变更
   - 需更新文件：脚本对应的 `.md` 文档、IFLOW.md、README.md
3. **发布** - 等用户验收文档通过后，推送到 GitHub

### 任务管理规则
- **复杂任务** - 非单一要求的任务必须使用 `todo_write` 工具进行任务规划
- **简单任务** - 单一、直接的任务可以不使用 todo_write
- **进度跟踪** - 及时更新任务状态，确保用户了解进展

### 代码审查清单
- [ ] 版本号已更新（如需要）
- [ ] 元数据中的 `@description` 已更新
- [ ] 代码注释清晰明了
- [ ] 调试模式默认为关闭状态
- [ ] 没有硬编码的敏感信息
- [ ] 样式注入使用 `GM_addStyle` 或动态创建 style 标签

## 🚀 项目维护

### 更新机制
- 所有脚本都配置了自动更新 URL (`@updateURL` 和 `@downloadURL`)
- 使用 GitHub Raw 作为更新源
- 支持油猴插件的自动更新功能
- 建议发布新版本后等待几分钟再测试更新

### 发布流程
1. 修改脚本代码并更新版本号
2. 更新对应脚本的 `.md` 文档
3. 更新 README.md（如需要）
4. 提交到 GitHub
5. 等待 Raw 链接同步（通常1-5分钟）
6. 测试更新功能

### 许可证
- 项目采用 MIT 许可证
- 可自由使用、修改和分发
- 请保留作者署名和版权声明

## 📁 项目结构

```
SurfHelper/
├── IFLOW.md                    # 项目上下文文档（本文件）
├── README.md                   # 项目主要说明文档
├── .git/                       # Git版本控制
└── tampermonkey-scripts/       # 油猴脚本目录
    ├── coc-layout-helper.md    # COC阵型助手文档
    ├── coc-layout-helper.user.js # COC阵型助手脚本 (v1.1.3)
    ├── javdb-manager.md        # JavDB管理器文档
    ├── javdb-manager.user.js   # JavDB管理器脚本 (v1.6.0)
    ├── vip-video-parser.md     # VIP视频解析器文档
    ├── vip-video-parser.user.js # VIP视频解析器脚本 (v1.4.2)
    ├── weibo-magnet-linker.md  # 微博磁链助手文档
    └── weibo-magnet-linker.user.js # 微博磁链助手脚本 (v1.1.1)
```

## 💡 技术要点

### 油猴脚本开发技巧

#### 1. 网络请求拦截
```javascript
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    this._method = method;
    return originalOpen.apply(this, arguments);
};
```

#### 2. DOM 变化监听
```javascript
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
            // 处理新增节点
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});
```

#### 3. 跨域数据存储
```javascript
// 使用 GM_setValue / GM_getValue 实现跨域数据共享
await GM_setValue('key', value);
const value = await GM_getValue('key', defaultValue);
```

#### 4. 样式注入
```javascript
GM_addStyle(`
    .custom-class {
        property: value !important;
    }
`);
```

### 常见问题解决

#### iframe 处理
- 使用 `window.top !== window.self` 检测是否在 iframe 中
- 避免在 iframe 中重复创建 UI 元素

#### 性能优化
- 使用 `requestAnimationFrame` 优化 DOM 操作
- 使用 `will-change` CSS 属性优化动画性能
- 及时清理事件监听器和定时器

#### 兼容性处理
- 使用 `document.readyState` 检测页面加载状态
- 为动态加载内容使用 MutationObserver

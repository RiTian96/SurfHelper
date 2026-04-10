# CODEBUDDY.md This file provides guidance to WorkBuddy when working with code in this repository.

## 项目概述

SurfHelper 是一个个人开发的油猴脚本集合，专注于提升网页浏览体验。项目包含多个 Tampermonkey 脚本，每个脚本独立运行，专注于特定网站的功能增强。

## 项目结构

```
SurfHelper/
├── tampermonkey-scripts/    # 油猴脚本目录（核心）
│   ├── *.user.js           # 脚本源文件（可被 Tampermonkey 直接安装）
│   └── *.md                # 对应脚本的说明文档
└── batch-scripts/          # Windows 批处理脚本目录
    └── *.bat              # 批处理脚本文件
```

## 核心开发约定

### 脚本元数据规范

所有 `.user.js` 文件必须包含完整的 Tampermonkey 元数据块：

```javascript
// ==UserScript==
// @name         脚本名称（中文）
// @namespace    https://github.com/RiTian96/SurfHelper
// @version      Major.Minor.Patch
// @description  [核心] 主要功能；[辅助] 次要功能；[资源] 其他功能
// @author       RiTian96
// @match        目标网站匹配规则
// @grant        GM_addStyle, GM_setClipboard, GM_setValue, GM_getValue
// @run-at       document-start 或 document-idle
// @updateURL    https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/xxx.user.js
// @downloadURL  https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/xxx.user.js
// ==/UserScript==
```

### 版本管理

采用语义化版本控制 (SemVer: Major.Minor.Patch)：
- **Major**: 重大功能变更或破坏性更新
- **Minor**: 新增功能，向后兼容
- **Patch**: Bug修复或小的优化

版本号需在脚本和对应文档中保持同步。

### 文档规范

每个脚本必须有对应的 `.md` 文档，包含：
1. 仓库导航（GitHub 和 Greasy Fork 链接）
2. 主要功能（精简的核心功能点描述）
3. 如何使用（安装和使用步骤）
4. 更新日志（按时间倒序排列，使用 emoji 标记）
5. 问题反馈（TG 联系方式）

### 更新日志 Emoji 规范

| Emoji | 含义 |
|-------|------|
| 🎯 | 新功能/新特性 |
| 🐛 | Bug修复 |
| ⚡ | 性能提升 |
| 🎨 | 界面/样式优化 |
| 🔧 | 优化/改进 |

## 开发工作流

### 三步验收流程

1. **需求与开发** — 修改 `.user.js` 脚本文件
2. **功能验证** — 用户在实际环境测试功能
3. **验收与文档** — 功能验证通过后，一次性更新版本号和文档

禁止在开发过程中碎片化地更新文档和版本号。

### 代码审查清单

- [ ] 版本号已更新
- [ ] 元数据中的 `@description` 已更新
- [ ] 代码注释清晰明了
- [ ] 调试模式默认为关闭状态
- [ ] 没有硬编码的敏感信息
- [ ] 样式注入使用 `GM_addStyle` 或动态创建 style 标签

## 代码模式

### 常用 GM API

```javascript
// 样式注入
GM_addStyle(`css rules here`);

// 数据持久化
await GM_setValue('key', value);
const value = await GM_getValue('key', defaultValue);

// 剪贴板
GM_setClipboard(text);
```

### 网络请求拦截（绕过限制的核心技术）

```javascript
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function(body) {
    // 检测目标请求并处理
    if (isTargetRequest(body, this._url)) {
        fetch(this._url, { method, credentials: 'omit' })
            .then(r => r.text())
            .then(handleResponse);
    }
    return originalSend.apply(this, arguments);
};
```

### DOM 动态监听

```javascript
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
            // 处理新增节点
        }
    });
});
observer.observe(document.body, { childList: true, subtree: true });
```

### 组件初始化模板

```javascript
function main() {
    injectStyles();
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initComponents();
            initEvents();
        });
    } else {
        initComponents();
        initEvents();
    }
}
```

## 技术要点

### iframe 检测
```javascript
if (window.top !== window.self) return; // 避免在 iframe 中重复执行
```

### 性能优化
- 使用 `requestAnimationFrame` 优化 DOM 操作
- 使用 `will-change` CSS 属性优化动画性能
- 及时清理事件监听器和定时器

### 兼容性处理
- 使用 `document.readyState` 检测页面加载状态
- 为动态加载内容使用 MutationObserver

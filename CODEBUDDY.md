# CODEBUDDY.md This file provides guidance to WorkBuddy when working with code in this repository.

## 常用命令

```bash
# 查看当前改动状态
git status

# 开发阶段：用户验收后提交代码 + 版本号
git add tampermonkey-scripts/xxx.user.js
git commit -m "feat: 描述" / "perf: 描述" / "fix: 描述"

# 发布阶段：文档验收后提交所有文档（开发结束后执行）
git add tampermonkey-scripts/xxx.user.js tampermonkey-scripts/xxx.md README.md CODEBUDDY.md
git commit -m "chore(release): vX.X.X"

# 推送到 GitHub
git push

# 查看提交历史
git log --oneline -10

# 回退到上一步（保留改动）
git reset --soft HEAD~1

# 回退到上一步（丢弃改动）
git reset --hard HEAD~1
```

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

**版本号递增规范**：
- 同一 Minor 版本下的多个小优化（如 1.6.0 → 1.6.1 → 1.6.2），更新日志可以合并发布
- 多个小更新累积到一定规模或新功能引入时，再合并为一次 Minor 升级

版本号需在脚本和对应文档中保持同步。

### 文档规范

每次发布（版本号更新时）需同步以下三处文档：

**① 脚本元数据 `@description`**
- 通读完整代码后，用简洁语言描述**最主要的功能**，不堆砌所有细节
- 格式：`[核心] 主要功能；[辅助] 次要功能；[资源] 其他`

**② 脚本对应的 `.md` 文档**
包含：
1. 仓库导航（GitHub 和 Greasy Fork 链接）
2. **主要功能**（简洁描述本次及历史核心功能，非流水账日志）
3. 如何使用（安装和使用步骤）
4. 更新日志（按时间倒序排列，使用 emoji 标记）
5. 问题反馈（TG 联系方式）

**③ `README.md` 功能简介**
- 与 `.md` 文档的「主要功能」保持一致

> ⚠️ **核心原则**：文档同步时先完整阅读代码，描述功能而非罗列改动。所有文档保持一致后再提交。

### 更新日志 Emoji 规范

| Emoji | 含义 |
|-------|------|
| 🎯 | 新功能/新特性 |
| 🐛 | Bug修复 |
| ⚡ | 性能提升 |
| 🎨 | 界面/样式优化 |
| 🔧 | 优化/改进 |

## 开发工作流

### 迭代开发流程

#### 阶段一：迭代开发（可多次循环）
1. **需求提出** — 用户明确功能需求或优化目标
2. **代码开发** — 修改 `.user.js` 脚本实现功能
3. **用户验收** — 在实际环境测试，确认功能正常
4. **版本号更新** — 验收通过后，根据改动规模更新脚本中的 `@version`（SemVer规范）
5. **Git 保存** — 提交代码 + 版本号到本地仓库，便于后续精准回档
6. **重复循环** — 继续提出下一个需求，重复步骤 1–5

#### 阶段二：最终发布（所有需求验收完毕后执行）
7. **文档同步** — 统一更新以下文件：
   - 脚本对应的 `.md` 文档（更新日志）
   - `CODEBUDDY.md`（如有新的代码模式）
   - `README.md`（版本号同步）
8. **文档验收** — 用户确认所有文档内容无误
9. **推送发布** — `git push` 推送到 GitHub

### Git 提交策略

| 阶段 | 时机 | 提交内容 | 消息格式 |
|------|------|----------|----------|
| 开发 | 用户验收后 | 代码 + 版本号 | `feat: 描述` / `perf: 描述` / `fix: 描述` |
| 发布 | 文档验收后 | 所有文档 | `chore(release): vX.X.X` |

### 关键原则
- ✅ **每个需求验收后立即更新版本号并 Git 提交，确保随时可回档**
- ✅ **文档统一留到所有需求验收完毕后再更新，避免频繁改动**
- ✅ **分步提交优于单个大提交，精准定位问题**
- ✅ **推送前必须完成文档验收**
- ❌ **禁止未经用户验收就提交代码**

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

### 性能优化代码模式

**Set 去重与查找优化**
```javascript
// 使用 Set 替代数组进行 O(1) 查找
const codeSet = new Set(codes.map(c => normalizeCode(c)));
const exists = codeSet.has(normalizedCode); // O(1)

// 使用 Set 合并去重
const allCodes = [...new Set([...existingCodes, ...newCodes])];
```

**防抖**
```javascript
// 防抖：延迟执行，合并多次触发
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// 应用：DOM 变化监听使用防抖
const debouncedApply = debounce(() => applyBlockEffect(), 300);
observer.observe(document.body, { childList: true, subtree: true });
```

**数据缓存层**
```javascript
const DataCache = {
    _cache: new Map(),
    _ttl: 5000, // 5秒有效期

    get(key) {
        const item = this._cache.get(key);
        if (!item) return null;
        if (Date.now() - item.timestamp > this._ttl) {
            this._cache.delete(key);
            return null;
        }
        return item.value;
    },

    set(key, value) {
        this._cache.set(key, { value, timestamp: Date.now() });
    }
};

// 带缓存的 GM API 包装器
function getCachedValue(key, defaultValue = null) {
    const cached = DataCache.get(key);
    if (cached !== null) return cached;
    const value = GM_getValue(key, defaultValue);
    DataCache.set(key, value);
    return value;
}
```

**错误处理包装器**
```javascript
// 同步错误处理
function safeExecute(fn, context = '', defaultValue = null) {
    try {
        return fn();
    } catch (error) {
        console.error(`[Script] ${context} 出错:`, error);
        return defaultValue;
    }
}

// 异步错误处理
async function safeExecuteAsync(fn, context = '', defaultValue = null) {
    try {
        return await fn();
    } catch (error) {
        console.error(`[Script] ${context} 出错:`, error);
        return defaultValue;
    }
}
```

**常量枚举**
```javascript
// 使用常量替代魔法字符串
const STORAGE_KEY = {
    WATCHED: 'javdb_watched_codes',
    WANTED: 'javdb_wanted_codes',
    IMPORTING: 'javdb_importing'
};

const CONFIG_KEY = {
    ENABLE_WATCHED_BLOCK: 'javdb_enable_watched_block',
    ENABLE_WANTED_BLOCK: 'javdb_enable_wanted_block'
};
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
- **使用 Set 进行 O(1) 去重和查找**，替代数组的 O(n) 操作
- **防抖 (debounce)** 控制高频函数执行
- **数据缓存层** 减少重复的 GM API 调用
- **常量枚举** 替代魔法字符串，提升代码可维护性

### 兼容性处理
- 使用 `document.readyState` 检测页面加载状态
- 为动态加载内容使用 MutationObserver

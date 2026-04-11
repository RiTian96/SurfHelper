# MEMORY.md - 长期记忆

## 项目相关

### SurfHelper 项目
- 项目位置: `d:\Shared\code\SurfHelper`
- 核心文件: `tampermonkey-scripts/javdb-manager.user.js`
- 版本: 2.3.0

### JavDB Manager 脚本
- 功能: JavDB 网站影片自动屏蔽(看过/想看)与智能评分
- 存储: 使用 GM API (GM_getValue/GM_setValue) 存储数据
- 配置: 统一使用 GM API (2026-04-11 优化后)

### 用户偏好
- 用户希望保持代码稳定，不希望未确认的改动
- 每次优化前会确认不影响功能再提交
- 域名匹配问题: Tampermonkey @match **不支持**域名中间的 `*` 通配符

### 发布记录
- **v1.6.2 (2026-04-11)**: VIP解析器玻璃拟态UI优化（与JavDB统一）
- **v2.4.1 (2026-04-11)**: JavDB Manager 玻璃UI更通透、按钮动效增强
- **v2.4.0 (2026-04-11)**: JavDB Manager UI优化（Toast底部弹出/ESC关闭/移动适配）

## 技术要点

### 代码优化记录 (2026-04-11)
1. 删除未使用的 throttle 函数
2. 配置存储统一使用 GM API (替代 localStorage)
3. 导入状态统一使用 GM API (替代 localStorage)
4. Magic Lens 事件添加初始化标志位，防止重复绑定

## 开发工作流约定 (2026-04-11 更新)
1. 用户提出需求 → 代码实现 → 用户验收
2. 验收通过后：更新版本号 + git commit（代码+版本号一起提交）
3. 重复 1-2 直到所有需求完成
4. 所有需求验收完毕：统一更新 .md / CODEBUDDY.md / README.md
5. 文档验收通过 → git push 上传 GitHub

### 文档同步规范 (2026-04-11 新增)
每次发布时需同步三处：①脚本元数据 @description ②对应 .md 文档 ③README.md 功能简介
原则：先完整读代码，描述功能而非罗列改动，所有文档一致后再提交

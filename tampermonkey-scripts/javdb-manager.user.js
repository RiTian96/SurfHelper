// ==UserScript==
// @name         JavDB影片管理器
// @namespace    https://github.com/RiTian96/SurfHelper
// @version      2.3.0
// @description  [核心] 影片自动屏蔽(看过/想看)与智能评分(高分绿边高亮/低分自动隐身)；[辅助] 搜索精确匹配黄金特效、详情页状态双向同步、悬浮大图预览、数据导入导出/自动爬取个人列表；支持日产/欧美/FC2番号
// @author       RiTian96
// @match        https://javdb.com/*
// @icon         https://javdb.com/favicon.ico
// @icon         https://www.google.com/s2/favicons?sz=64&domain=javdb.com
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/javdb-manager.user.js
// @downloadURL    https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/javdb-manager.user.js
// ==/UserScript==

(function () {
    'use strict';

    /**
     * === JavDB Manager 核心配置 ===
     * 包含存储键名、功能开关及全局状态
     */

    // 常量枚举：页面类型
    const PAGE_TYPE = {
        WATCHED: 'watched',
        WANTED: 'wanted',
        UNKNOWN: null
    };

    // 常量枚举：列表类型
    const LIST_TYPE = {
        WATCHED: 'watched',
        WANTED: 'wanted'
    };

    // 常量枚举：存储键名
    const STORAGE_KEY = {
        WATCHED: 'javdb_watched_codes',
        WANTED: 'javdb_wanted_codes',
        IMPORTING: 'javdb_importing',
        IMPORTED_COUNT: 'javdb_imported_count',
        IMPORT_TYPE: 'javdb_import_type',
        PENDING_IMPORT: 'javdb_pending_import'
    };

    // 常量枚举：配置键名
    const CONFIG_KEY = {
        ENABLE_WATCHED_BLOCK: 'javdb_enable_watched_block',
        ENABLE_WANTED_BLOCK: 'javdb_enable_wanted_block',
        ENABLE_LOW_SCORE_BLOCK: 'javdb_enable_low_score_block',
        ENABLE_IMAGE_PREVIEW: 'javdb_enable_image_preview'
    };

    const CONFIG = {
        watchedStorageKey: STORAGE_KEY.WATCHED,
        wantedStorageKey: STORAGE_KEY.WANTED,
        currentPageType: PAGE_TYPE.UNKNOWN,
        isImporting: false,
        importedCount: 0,
        totalCount: 0,

        DEBUG: false, // 生产环境设为false，调试时设为true
        panelCreated: false, // 防止重复创建面板

        // 功能开关
        enableWatchedBlock: true, // 是否启用看过屏蔽
        enableWantedBlock: true, // 是否启用想看屏蔽
        enableLowScoreBlock: true, // 是否启用低分屏蔽（同时控制高分高亮）
        enableImagePreview: true // 是否启用大图预览
    };

    // 调试日志函数
    function debugLog(...args) {
        if (CONFIG.DEBUG) {
            console.log('[JavDB Manager]', ...args);
        }
    }

    // 防抖函数：限制高频调用的函数执行频率
    function debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                fn.apply(this, args);
            }, delay);
        };
    }

    // === 数据缓存层 ===
    const DataCache = {
        _cache: new Map(),
        _ttl: 5000, // 缓存有效期 5 秒

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
        },

        clear() {
            this._cache.clear();
        },

        invalidate(key) {
            this._cache.delete(key);
        }
    };

    // === 错误处理包装器 ===
    function safeExecute(fn, context = '', defaultValue = null) {
        try {
            return fn();
        } catch (error) {
            console.error(`[JavDB Manager] ${context} 出错:`, error);
            return defaultValue;
        }
    }

    // 异步错误处理包装器
    async function safeExecuteAsync(fn, context = '', defaultValue = null) {
        try {
            return await fn();
        } catch (error) {
            console.error(`[JavDB Manager] ${context} 出错:`, error);
            return defaultValue;
        }
    }

    // 带缓存的 GM_getValue 包装器
    function getCachedValue(key, defaultValue = null) {
        const cacheKey = `gm_${key}`;
        const cached = DataCache.get(cacheKey);
        if (cached !== null) return cached;

        const value = safeExecute(() => GM_getValue(key, defaultValue), `获取 ${key}`);
        DataCache.set(cacheKey, value);
        return value;
    }

    // 带缓存失效的 GM_setValue 包装器
    function setCachedValue(key, value) {
        safeExecute(() => {
            GM_setValue(key, value);
            DataCache.invalidate(`gm_${key}`);
        }, `设置 ${key}`);
    }

    // 带缓存失效的 GM_deleteValue 包装器
    function deleteCachedValue(key) {
        safeExecute(() => {
            GM_deleteValue(key);
            DataCache.invalidate(`gm_${key}`);
        }, `删除 ${key}`);
    }

    // 添加样式
    function injectStyles() {
        if (document.querySelector('style[data-javdb-manager]')) return;

        const style = document.createElement('style');
        style.textContent = `
            /* === 基础面板：Apple 玻璃拟态 === */
            .javdb-manager-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10001;
                background: rgba(28, 28, 30, 0.75);
                color: #f5f5f7;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
                transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                box-sizing: border-box;
            }

            .javdb-manager-panel.minimized {
                width: 54px;
                height: 54px;
                padding: 0;
                min-width: 54px;
                border-radius: 27px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }

            .javdb-manager-panel.minimized:hover {
                transform: scale(1.05);
                background: rgba(40, 40, 45, 0.85);
            }

            .javdb-manager-panel.minimized .panel-content {
                display: none;
            }

            .javdb-manager-panel.minimized .close-button {
                position: absolute;
                top: -2px;
                right: -2px;
                width: 20px;
                height: 20px;
                background: #ff453a;
                border-radius: 50%;
                color: white;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                box-shadow: 0 2px 6px rgba(255, 69, 58, 0.4);
            }

            .javdb-manager-panel.minimized .manager-icon {
                display: block;
                font-size: 26px;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
            }

            .javdb-manager-panel:not(.minimized) .manager-icon {
                display: none;
            }

            .javdb-manager-panel, .javdb-manager-panel * {
                box-sizing: border-box !important;
            }

            .javdb-manager-panel:not(.minimized) {
                width: 380px;
                padding: 20px;
                max-height: 85vh;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                align-items: center; /* 居中内容容器 */
            }

            .panel-content {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 0;
            }

            /* 自定义滚动条 */
            .javdb-manager-panel::-webkit-scrollbar {
                width: 6px;
            }
            .javdb-manager-panel::-webkit-scrollbar-track {
                background: transparent;
            }
            .javdb-manager-panel::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 3px;
            }
            .javdb-manager-panel::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.3);
            }

            .manager-header {
                color: #ffffff;
                font-size: 18px;
                font-weight: 700;
                margin-bottom: 16px;
                text-align: center;
                letter-spacing: 0.5px;
                text-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }

            .manager-count {
                text-align: center;
                margin-bottom: 20px;
                padding: 0;
                background: transparent;
                border: none;
                box-shadow: none;
                color: #ebebf5;
                width: 100%;
            }
            
            .manager-count strong {
                color: #ffffff;
                font-weight: 700;
            }

            /* --- 统计网格布局：撑满全宽 --- */
            .stat-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                margin-top: 5px;
                width: 100%;
            }

            .stat-item {
                background: rgba(255, 255, 255, 0.05);
                padding: 16px 10px;
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                align-items: center;
                border: 1px solid rgba(255, 255, 255, 0.08);
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            
            .stat-item:hover {
                background: rgba(255, 255, 255, 0.1);
                transform: translateY(-2px);
                border-color: rgba(255, 255, 255, 0.15);
                box-shadow: 0 8px 20px rgba(0,0,0,0.2);
            }

            .stat-value {
                font-size: 24px;
                font-weight: 700;
                line-height: 1.1;
                margin-bottom: 8px;
            }

            .stat-label {
                font-size: 12px;
                color: rgba(235, 235, 245, 0.5);
                font-weight: 600;
                letter-spacing: 0.5px;
            }

            .stat-item.wanted .stat-value { color: #ff9f0a; }
            .stat-item.watched .stat-value { color: #ff453a; }
            .stat-item.total { 
                background: rgba(255, 255, 255, 0.03);
                border-color: rgba(255, 255, 255, 0.05);
            }
            .stat-item.total .stat-value { color: #ffffff; }

            .stat-item.full-width {
                grid-column: span 2;
                padding: 14px 10px;
                margin-bottom: 4px;
            }
            .stat-item.full-width .stat-value { font-size: 20px; margin-bottom: 6px; }

            .manager-count.importing {
                background: transparent;
                border-color: rgba(255, 159, 10, 0.2);
            }

            .stat-item.importing-stat {
                background: transparent;
                border-color: rgba(255, 159, 10, 0.15);
            }

            .manager-tabs {
                display: flex;
                margin-bottom: 20px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                padding: 4px;
                width: 100%;
            }

            .manager-tab {
                flex: 1;
                padding: 8px 12px;
                text-align: center;
                cursor: pointer;
                border: none;
                background: transparent;
                color: rgba(235, 235, 245, 0.6);
                font-size: 13px;
                font-weight: 600;
                border-radius: 6px;
                transition: all 0.3s ease;
            }

            .manager-tab.active {
                background: rgba(255, 255, 255, 0.15);
                color: #ffffff;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            }

            .manager-tab:hover:not(.active) {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.05);
            }

            .manager-tab-content {
                display: none;
                animation: fadeIn 0.3s ease;
                width: 100%;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(4px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .manager-tab-content.active {
                display: block;
            }

            /* --- 表单与按钮设计 --- */
            .manager-buttons {
                display: flex;
                gap: 10px;
                margin-bottom: 12px;
                width: 100%;
            }

            .manager-button {
                flex: 1; /* 强制按钮在 flex 容器中平分宽度 */
                padding: 10px 14px;
                border: none;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }

            .manager-button.watched {
                background: linear-gradient(135deg, #ff453a, #ff3b30);
                color: white;
                box-shadow: 0 4px 12px rgba(255, 69, 58, 0.3);
            }

            .manager-button.wanted {
                background: linear-gradient(135deg, #ff9f0a, #ff9500);
                color: white;
                box-shadow: 0 4px 12px rgba(255, 159, 10, 0.3);
            }

            .manager-button.stop {
                background: rgba(255, 255, 255, 0.1);
                color: #ebebf5;
                width: 100%;
                border: 1px solid rgba(255, 255, 255, 0.05);
            }

            .manager-button.stop.active {
                background: linear-gradient(135deg, #ff453a, #ff3b30);
                color: white;
                box-shadow: 0 4px 12px rgba(255, 69, 58, 0.3);
                border: none;
            }

            .manager-button:hover {
                transform: translateY(-2px);
                filter: brightness(1.1);
            }
            
            .manager-button:active {
                transform: translateY(0);
                filter: brightness(0.95);
            }

            .manager-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
                filter: none;
            }

            .close-button {
                position: absolute;
                top: 14px;
                right: 14px;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                color: rgba(255, 255, 255, 0.7);
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 28px;
                height: 28px;
                line-height: normal;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                z-index: 100;
                border-radius: 50%;
            }

            .close-button:hover {
                background: rgba(255, 69, 58, 0.8);
                color: white;
                transform: rotate(90deg);
            }

            /* --- 智能管理功能区 --- */
            .smart-container {
                margin-bottom: 16px;
            }

            .smart-input {
                width: 100%;
                padding: 12px 14px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                background: rgba(0, 0, 0, 0.2);
                color: #ffffff;
                font-size: 14px;
                margin-bottom: 12px;
                transition: all 0.3s ease;
                outline: none;
                box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .smart-input:focus {
                border-color: rgba(10, 132, 255, 0.6);
                background: rgba(0, 0, 0, 0.3);
                box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.2);
            }

            .smart-input::placeholder {
                color: rgba(235, 235, 245, 0.4);
            }

            .javdb-manager-panel .smart-result {
                padding: 16px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 12px;
                margin-bottom: 3px;
                font-size: 14px;
                text-align: center;
                border: 1px solid rgba(255, 255, 255, 0.08);
                line-height: 1.6;
                width: 100%;
            }

            .javdb-manager-panel .smart-result.found {
                background: rgba(48, 209, 88, 0.1);
                border-color: rgba(48, 209, 88, 0.25);
                color: #30d158;
            }

            .javdb-manager-panel .smart-result.not-found {
                background: rgba(255, 69, 58, 0.1);
                border-color: rgba(255, 69, 58, 0.25);
                color: #ff453a;
            }

            .javdb-manager-panel .smart-actions {
                display: flex;
                gap: 12px;
                margin-top: 12px;
                width: 100%;
            }

            .javdb-manager-panel .smart-action-button {
                flex: 1;
                padding: 10px;
                min-height: 44px;
                border: none;
                border-radius: 10px;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                white-space: nowrap;
            }

            .javdb-manager-panel .smart-action-button.add-watched {
                background: linear-gradient(135deg, #ff453a, #ff3b30);
                box-shadow: 0 4px 12px rgba(255, 69, 58, 0.3);
            }

            .javdb-manager-panel .smart-action-button.add-wanted {
                background: linear-gradient(135deg, #ff9f0a, #ff9500);
                box-shadow: 0 4px 12px rgba(255, 159, 10, 0.3);
            }

            .javdb-manager-panel .smart-action-button:hover {
                transform: translateY(-2px);
                filter: brightness(1.1);
                box-shadow: 0 6px 16px rgba(0,0,0,0.3);
            }

            /* --- 删除按钮：经典的圆角矩形设计 --- */
            .javdb-manager-panel .smart-action-button.delete.javdb-delete-btn {
                background: linear-gradient(135deg, #ff453a, #ff3b30);
                width: auto;
                flex: initial;
                padding: 10px 40px;
                min-height: 44px;
                font-size: 13px; /* 统一字号 */
                font-weight: 700;
                letter-spacing: 1px;
                border-radius: 10px;
                box-shadow: 0 4px 12px rgba(255, 69, 58, 0.3);
                margin: 0 auto;
                border: none; /* 移除边框，消除 2px 高度差 */
            }

            .javdb-manager-panel .smart-action-button.delete.javdb-delete-btn:active {
                transform: translateY(0);
            }

            /* --- 确保删除按钮内容不被遮挡 --- */
            .javdb-manager-panel .smart-action-button.delete.javdb-delete-btn::before,
            .javdb-manager-panel .smart-action-button.delete.javdb-delete-btn::after {
                display: none !important;
                content: none !important;
            }

            /* --- 开关与选项区 --- */
            .switch-container {
                display: flex;
                flex-direction: column;
                gap: 14px;
            }

            .switch-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 14px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 10px;
                border: 1px solid rgba(255, 255, 255, 0.05);
                transition: background 0.2s;
            }
            
            .switch-item:hover {
                background: rgba(255, 255, 255, 0.06);
            }

            .switch-label {
                color: #ebebf5;
                font-size: 14px;
                font-weight: 500;
                flex: 1;
            }

            /* iOS 风格 Switch */
            .switch {
                position: relative;
                display: inline-block;
                width: 48px;
                height: 28px;
            }

            .switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }

            .slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(255, 255, 255, 0.15);
                transition: .4s cubic-bezier(0.25, 0.1, 0.25, 1);
                border-radius: 30px;
                box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
            }

            .slider:before {
                position: absolute;
                content: "";
                height: 22px;
                width: 22px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .4s cubic-bezier(0.25, 0.1, 0.25, 1);
                border-radius: 50%;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }

            input:checked + .slider {
                background-color: #30d158;
            }

            input:checked + .slider:before {
                transform: translateX(20px);
            }

            /* --- 导入导出与清理相关的通用组件样式 --- */
            .manager-section {
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid rgba(255,255,255,0.08);
            }

            .section-title {
                font-size: 14px;
                font-weight: 700;
                margin-bottom: 14px;
                color: #0a84ff;
                text-align: center;
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            }

            .action-result {
                display: none;
                margin-bottom: 12px;
                padding: 12px;
                border-radius: 10px;
                font-size: 13px;
                text-align: center;
                background: rgba(255,255,255,0.05);
            }

            .button-group {
                display: flex;
                gap: 10px;
                margin-bottom: 12px;
                width: 100%;
            }

            .btn-export { 
                background: linear-gradient(135deg, #30d158, #28cd41); 
                color: white;
                box-shadow: 0 4px 12px rgba(48, 209, 88, 0.25);
                border: none;
                padding: 10px 14px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                flex: 1;
            }
            .btn-import { 
                background: linear-gradient(135deg, #0a84ff, #007aff); 
                color: white;
                box-shadow: 0 4px 12px rgba(10, 132, 255, 0.25);
                border: none;
                padding: 10px 14px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                flex: 1;
            }
            .btn-export:hover, .btn-import:hover {
                transform: translateY(-2px);
                filter: brightness(1.1);
            }
            .btn-cleanup { 
                background: rgba(255, 69, 58, 0.1); 
                color: #ff453a; 
                border: 1px solid rgba(255, 69, 58, 0.3);
                width: 100%; 
                font-size: 14px; 
                font-weight: 600;
                padding: 12px; 
                border-radius: 10px;
                box-shadow: none;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            .btn-cleanup:hover {
                background: #ff453a;
                color: white;
                box-shadow: 0 6px 16px rgba(255, 69, 58, 0.4);
                transform: translateY(-2px);
            }

            /* --- [组件] 智能巨型透镜 (Magic Lens) - 大图预览 --- */
            #javdb-magic-lens {
                position: fixed;
                top: 50%;
                transform: translateY(-50%);

                /* 自适应逻辑：取消固定宽高，改用最大限制 */
                width: auto;
                height: auto;
                max-width: 45vw;  /* 限制宽度不超过屏幕45% */
                max-height: 85vh; /* 限制高度不超过屏幕85% */

                background: rgba(0, 0, 0, 0.95);
                border: 2px solid #555;
                border-radius: 12px;
                box-shadow: 0 30px 100px rgba(0,0,0,0.9);
                z-index: 2147483647; /* 使用最高z-index确保在最上层 */

                /* 布局居中 */
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;

                pointer-events: none; /* 鼠标穿透 */
                backdrop-filter: blur(5px);
                transition: opacity 0.2s;
                will-change: opacity;
            }

            #javdb-magic-lens img {
                display: block;
                max-width: 100%;
                max-height: 80vh;
                object-fit: contain;
                opacity: 0;
                transition: opacity 0.3s ease;
                user-select: none;
                -webkit-user-drag: none;
            }

            /* 加载提示 */
            #javdb-magic-lens::after {
                content: "高清封面读取中...";
                position: absolute;
                color: #888; font-size: 12px; letter-spacing: 1px;
                z-index: 1;
                pointer-events: none;
            }

            /* === 影片状态样式 === */

            /* 搜索精确匹配样式：金边 + 呼吸灯动画 */
            .movie-list .item.javdb-search-match {
                box-shadow: 0 0 0 4px #ffd700, 0 0 20px rgba(255, 215, 0, 0.6) !important;
                animation: javdb-gold-breathing 2s infinite alternate !important;
                z-index: 5 !important;
                transition: all 0.3s ease !important;
                opacity: 1 !important; /* 精确匹配不透明 */
                filter: none !important; /* 精确匹配不置灰 */
            }

            /* 叠加态：如果是搜索匹配 且 是高分推荐 */
            .movie-list .item.javdb-search-match.javdb-high-score {
                box-shadow: 
                    0 0 0 3px #2ecc71,           /* 内层绿边 */
                    0 0 0 6px #ffd700,           /* 外层金边 */
                    0 0 25px rgba(255, 215, 0, 0.8) !important;
            }

            @keyframes javdb-gold-breathing {
                from { 
                    transform: scale(1.0); 
                    box-shadow: 0 0 0 4px #ffd700, 0 0 15px rgba(255, 215, 0, 0.5); 
                }
                to { 
                    transform: scale(1.03); 
                    box-shadow: 0 0 0 5px #ffd700, 0 0 30px rgba(255, 215, 0, 0.9); 
                }
            }

            /* 低分样式：整体变暗 */
            .movie-list .item.javdb-low-score {
                opacity: 0.3 !important;
                filter: grayscale(80%) !important;
                transition: all 0.3s ease !important;
            }

            .movie-list .item.javdb-low-score:hover {
                opacity: 0.5 !important;
                filter: grayscale(50%) !important;
            }

            /* 高分样式：绿色边框高亮 */
            .movie-list .item.javdb-high-score {
                box-shadow: 0 0 0 3px rgba(46, 204, 113, 0.9), 0 4px 12px rgba(46, 204, 113, 0.3) !important;
                transition: all 0.3s ease !important;
            }

            .movie-list .item.javdb-high-score:hover {
                box-shadow: 0 0 0 4px rgba(46, 204, 113, 1), 0 6px 20px rgba(46, 204, 113, 0.4) !important;
            }

            /* 看过样式：变暗 + 右上角标注（不在想看页面生效） */
            body:not([data-page="wanted"]) .movie-list .item.javdb-watched {
                opacity: 0.3 !important;
                filter: grayscale(80%) !important;
                transition: all 0.3s ease !important;
                position: relative;
            }

            body:not([data-page="wanted"]) .movie-list .item.javdb-watched:hover {
                opacity: 0.5 !important;
                filter: grayscale(50%) !important;
            }

            body:not([data-page="wanted"]) .movie-list .item.javdb-watched::before {
                content: '看过';
                position: absolute;
                top: 5px;
                right: 5px;
                background: rgba(231, 76, 60, 0.9);
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: bold;
                z-index: 2;
                pointer-events: none;
            }

            /* 想看样式：变暗 + 右上角标注（不在看过页面生效） */
            body:not([data-page="watched"]) .movie-list .item.javdb-wanted {
                opacity: 0.3 !important;
                filter: grayscale(80%) !important;
                transition: all 0.3s ease !important;
                position: relative;
            }

            body:not([data-page="watched"]) .movie-list .item.javdb-wanted:hover {
                opacity: 0.5 !important;
                filter: grayscale(50%) !important;
            }

            body:not([data-page="watched"]) .movie-list .item.javdb-wanted::before {
                content: '想看';
                position: absolute;
                top: 5px;
                right: 5px;
                background: rgba(243, 156, 18, 0.9);
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: bold;
                z-index: 2;
                pointer-events: none;
            }

        `;

        // 只添加一次样式
        if (!document.querySelector('style[data-javdb-manager]')) {
            style.setAttribute('data-javdb-manager', 'true');
            document.head.appendChild(style);
        }
    }

    // === 通用工具函数 ===

    // 日期格式移除（复用函数，避免5处重复正则）
    // 支持 .YY.MM.DD 和 .YYYY.MM.DD 两种格式
    function removeDateFromCode(str) {
        return str.replace(/\.\d{2}\.\d{2}\.\d{2}/g, '').replace(/\.\d{4}\.\d{2}\.\d{2}/g, '');
    }

    // 标准化用于匹配的字符串（去除空格，转小写）
    function normalizeForMatch(str) {
        return str.replace(/\s+/g, '').toLowerCase();
    }

    // 配置键名映射（loadConfig/saveConfig 共用）- 使用常量
    const CONFIG_KEYS = {
        enableWatchedBlock: CONFIG_KEY.ENABLE_WATCHED_BLOCK,
        enableWantedBlock: CONFIG_KEY.ENABLE_WANTED_BLOCK,
        enableLowScoreBlock: CONFIG_KEY.ENABLE_LOW_SCORE_BLOCK,
        enableImagePreview: CONFIG_KEY.ENABLE_IMAGE_PREVIEW
    };

    // 从标题元素中提取番号（列表页和详情页通用逻辑）
    function extractCodeFromTitleElement(containerEl) {
        if (!containerEl) return null;
        const strongElement = containerEl.querySelector('strong');
        if (!strongElement) return null;

        const strongText = strongElement.textContent.trim();
        const cleanedStrong = removeDateFromCode(strongText);
        const isPureLetters = /^[a-zA-Z]+$/.test(cleanedStrong.replace(/\s+/g, ''));

        if (isPureLetters) {
            const fullTitle = containerEl.textContent.trim();
            const normalizedCode = normalizeCode(fullTitle);
            debugLog(`提取欧美区完整番号: ${fullTitle} -> 标准化: ${normalizedCode}`);
            return normalizedCode;
        } else {
            const normalizedCode = normalizeCode(strongText);
            debugLog(`提取日式番号: ${strongText} -> 标准化: ${normalizedCode}`);
            return normalizedCode;
        }
    }

    // 从影片项中提取番号（支持日式和欧美区）
    // 规则：
    // - 日式番号（去除日期后仍有数字）：只保留番号，不需要标题，全部大写
    // - 欧美区番号（去除日期后纯字母）：保留完整番号+标题（不含日期），全部大写
    function getVideoCodeFromItem(item) {
        const code = extractCodeFromTitleElement(item.querySelector('.video-title'));
        if (!code) debugLog('无法从影片项中提取番号');
        return code;
    }

    // 不区分大小写和空格的匹配函数
    function isCodeMatch(code1, code2) {
        return normalizeForMatch(code1) === normalizeForMatch(code2);
    }

    // 不区分大小写和空格的前缀匹配函数
    function isCodePrefixMatch(prefix, fullCode) {
        return normalizeForMatch(fullCode).startsWith(normalizeForMatch(prefix));
    }

    // 番号标准化函数
    // - 欧美区（去除日期后纯字母）：全部大写，保留完整标题
    // - 日厂（去除日期后仍有数字）：全部大写，只保留字母、数字、-、_
    function normalizeCode(code) {
        if (!code || typeof code !== 'string') return code;

        let normalized = removeDateFromCode(code.replace(/\s+/g, ''));
        const isPureLetters = /^[a-zA-Z]+$/.test(normalized);

        if (isPureLetters) {
            return normalized.toUpperCase();
        } else {
            normalized = normalized.toUpperCase();
            normalized = normalized.replace(/[^A-Z0-9\-_]/g, '');
            return normalized;
        }
    }





    // 查找匹配的番号（不区分大小写和空格，支持前缀匹配）
    function findMatchingCode(code, codeList) {
        return codeList.find(savedCode => isCodeMatch(code, savedCode));
    }

    // 查找前缀匹配的番号（不区分大小写和空格）
    function findPrefixMatchingCode(prefix, codeList) {
        return codeList.filter(savedCode => isCodePrefixMatch(prefix, savedCode));
    }

    // 创建开关组件
    function createSwitch(label, configKey, isChecked) {
        const switchItem = document.createElement('div');
        switchItem.className = 'switch-item';

        const switchLabel = document.createElement('label');
        switchLabel.className = 'switch-label';
        switchLabel.textContent = label;

        const switchWrapper = document.createElement('label');
        switchWrapper.className = 'switch';

        const switchInput = document.createElement('input');
        switchInput.type = 'checkbox';
        switchInput.checked = isChecked;
        switchInput.addEventListener('change', (e) => {
            CONFIG[configKey] = e.target.checked;
            saveConfig();
            applyBlockEffect(); // 重新应用效果
            debugLog(`${label}开关: ${e.target.checked ? '开启' : '关闭'}`);
        });

        const slider = document.createElement('span');
        slider.className = 'slider';

        switchWrapper.appendChild(switchInput);
        switchWrapper.appendChild(slider);

        switchItem.appendChild(switchLabel);
        switchItem.appendChild(switchWrapper);

        return switchItem;
    }

    // 测试函数：分析页面评分结构
    function debugScoreStructure() {
        const movieItems = document.querySelectorAll('.movie-list .item');
        console.log(`找到 ${movieItems.length} 个影片项`);

        if (movieItems.length > 0) {
            const firstItem = movieItems[0];
            console.log('第一个影片项的HTML结构:', firstItem.innerHTML.substring(0, 500));

            const scoreElements = firstItem.querySelectorAll('.score, .score .value, .score > .value');
            console.log('找到的评分元素:', scoreElements.length);

            scoreElements.forEach((el, index) => {
                console.log(`评分元素${index}:`, {
                    className: el.className,
                    textContent: el.textContent,
                    innerHTML: el.innerHTML.substring(0, 100)
                });
            });
        }
    }

    // 加载配置
    function loadConfig() {
        for (const key in CONFIG_KEYS) {
            const savedValue = getCachedValue(CONFIG_KEYS[key], null);
            if (savedValue !== null) {
                CONFIG[key] = savedValue;
            }
        }
        debugLog('加载配置:', {
            enableWatchedBlock: CONFIG.enableWatchedBlock,
            enableWantedBlock: CONFIG.enableWantedBlock,
            enableLowScoreBlock: CONFIG.enableLowScoreBlock,
            enableImagePreview: CONFIG.enableImagePreview
        });
    }

    // 保存配置
    function saveConfig() {
        for (const key in CONFIG_KEYS) {
            setCachedValue(CONFIG_KEYS[key], CONFIG[key]);
        }
        debugLog('保存配置:', {
            enableWatchedBlock: CONFIG.enableWatchedBlock,
            enableWantedBlock: CONFIG.enableWantedBlock,
            enableLowScoreBlock: CONFIG.enableLowScoreBlock,
            enableImagePreview: CONFIG.enableImagePreview
        });
    }

    // 初始化
    function init() {
        if (CONFIG.panelCreated) return;

        // 加载配置
        loadConfig();

        // 确定当前页面类型
        CONFIG.currentPageType = window.location.href.includes('watched_videos') ? 'watched' :
            window.location.href.includes('want_watch_videos') ? 'wanted' : null;

        // 设置页面标识，供CSS使用
        if (CONFIG.currentPageType === 'watched') {
            document.body.setAttribute('data-page', 'watched');
        } else if (CONFIG.currentPageType === 'wanted') {
            document.body.setAttribute('data-page', 'wanted');
        } else {
            document.body.removeAttribute('data-page');
        }

        // 创建全局悬浮窗
        createGlobalFloatingWindow();
        CONFIG.panelCreated = true;

        // 初始化大图预览组件
        initMagicLens();

        // 应用屏蔽效果
        applyBlockEffect();

        // 监听页面变化，动态应用屏蔽效果
        observePageChanges();

        // 检查是否有待处理的导入任务
        const pendingImport = getCachedValue(STORAGE_KEY.PENDING_IMPORT, null);
        if (pendingImport && CONFIG.currentPageType === pendingImport) {
            // 延迟一下确保页面完全加载
            setTimeout(() => {
                startImport(pendingImport);
                setCachedValue(STORAGE_KEY.PENDING_IMPORT, null); // 清除待处理状态
            }, 1000);
        }

        // 检查是否是翻页后的继续导入
        const isImporting = getCachedValue(STORAGE_KEY.IMPORTING, false);
        if (isImporting && CONFIG.currentPageType) {
            const importType = getCachedValue(STORAGE_KEY.IMPORT_TYPE, null);
            const importedCount = getCachedValue(STORAGE_KEY.IMPORTED_COUNT, 0);

            if (importType === CONFIG.currentPageType) {
                // 延迟一下确保页面完全加载
                setTimeout(() => {
                    // 更新内存状态
                    CONFIG.isImporting = true;
                    CONFIG.importedCount = importedCount ? parseInt(importedCount) : 0;
                    CONFIG.currentPageType = importType;

                    // 更新UI
                    updateGlobalCount();

                    // 继续导入
                    extractAndSaveCurrentPage();
                }, 2000); // 翻页需要更长的等待时间
            }
        }

        // 添加点击按钮自动导入功能
        if (window.location.pathname.includes('/v/')) {
            // 影片详情页，绑定想看/看過按钮
            bindVideoDetailButtons();
        }
    }

    // 获取当前页面搜索词
    function getSearchQuery() {
        const searchInput = document.getElementById('video-search');
        return searchInput ? searchInput.value.trim() : '';
    }

    // 万能标准化匹配逻辑
    function isSearchMatch(query, videoCode) {
        if (!query || !videoCode) return false;

        // 标准化：转大写，只保留字母和数字
        const sQuery = query.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const sCode = videoCode.toUpperCase().replace(/[^A-Z0-9]/g, '');

        if (!sQuery || !sCode) return false;

        // 1. 完全相等（标准化后）
        if (sQuery === sCode) return true;

        // 2. 针对 FC2 的特殊处理
        // 如果搜纯数字，匹配 FC2 + 数字
        if (/^\d+$/.test(sQuery)) {
            if (sCode === 'FC2' + sQuery) return true;
        }

        // 3. 针对搜 FC2 数字却漏搜字母的特殊处理
        if (sQuery === 'FC2' + sCode) return true;

        return false;
    }

    // 屏蔽功能相关函数
    // 应用屏蔽效果和高亮评分 - 优化数据读取和匹配性能
    function applyBlockEffect() {
        debugLog('应用屏蔽效果');

        // 查找所有影片项
        const movieItems = document.querySelectorAll('.movie-list .item');
        debugLog(`找到 ${movieItems.length} 个影片项`);

        if (movieItems.length === 0) return;

        // 性能优化：使用带缓存的 API 读取数据
        const watchedCodes = getCachedValue(CONFIG.watchedStorageKey, []);
        const wantedCodes = getCachedValue(CONFIG.wantedStorageKey, []);

        // 使用 Set 存储标准化后的番号，O(1) 查找
        const watchedSet = new Set(watchedCodes.map(c => normalizeForMatch(c)));
        const wantedSet = new Set(wantedCodes.map(c => normalizeForMatch(c)));

        const query = getSearchQuery();
        const normalizedQuery = query ? normalizeForMatch(query) : '';

        movieItems.forEach(item => {
            // 清除所有相关类
            item.classList.remove('javdb-blocked', 'javdb-watched', 'javdb-wanted',
                'javdb-low-score', 'javdb-normal-score', 'javdb-high-score', 'javdb-excellent', 'javdb-search-match');

            // 应用屏蔽效果（看过/想看）- 传入 Set 优化查找
            applyBlockEffectInternalOptimized(item, watchedSet, wantedSet, normalizedQuery);

            // 应用评分效果（低分屏蔽+高亮）
            applyScoreHighlight(item);
        });
    }

    // 内部屏蔽效果应用函数 - 使用 Set 优化版本
    function applyBlockEffectInternalOptimized(item, watchedSet, wantedSet, normalizedQuery) {
        // 使用通用函数提取番号
        const code = getVideoCodeFromItem(item);
        if (!code) return;

        const normalizedCode = normalizeForMatch(code);

        // 1. 处理精确搜索匹配（金边高亮优先）- 使用标准化后的查询
        if (normalizedQuery && isSearchMatch(normalizedQuery, code)) {
            item.classList.add('javdb-search-match');
            debugLog(`精确搜索匹配: ${code}`);
        }

        let shouldBlock = false;

        // 使用 Set 进行 O(1) 查找
        const inWatched = watchedSet.has(normalizedCode);
        const inWanted = wantedSet.has(normalizedCode);

        // 根据当前页面类型决定屏蔽策略
        if (CONFIG.currentPageType === 'watched') {
            if (inWatched && CONFIG.enableWatchedBlock) {
                item.classList.add('javdb-watched');
                shouldBlock = true;
                debugLog(`看过页面屏蔽看过番号: ${code}`);
            } else if (inWanted) {
                item.classList.add('javdb-wanted');
                debugLog(`看过页面显示想看番号: ${code}（不屏蔽）`);
            }
        } else if (CONFIG.currentPageType === 'wanted') {
            if (inWanted && CONFIG.enableWantedBlock) {
                item.classList.add('javdb-wanted');
                shouldBlock = true;
                debugLog(`想看页面屏蔽想看番号: ${code}`);
            } else if (inWatched) {
                item.classList.add('javdb-watched');
                debugLog(`想看页面显示看过番号: ${code}（不屏蔽）`);
            }
        } else {
            // 在其他页面，屏蔽所有
            if (inWatched && CONFIG.enableWatchedBlock) {
                item.classList.add('javdb-watched');
                shouldBlock = true;
                debugLog(`其他页面屏蔽看过番号: ${code}`);
            }
            if (inWanted && CONFIG.enableWantedBlock) {
                item.classList.add('javdb-wanted');
                shouldBlock = true;
                debugLog(`其他页面屏蔽想看番号: ${code}`);
            }
        }

        if (shouldBlock) {
            item.classList.add('javdb-blocked');
        }
    }

    // 保留原函数用于兼容其他调用（已废弃，逐步迁移）
    function applyBlockEffectInternal(item, watchedCodes, wantedCodes, query) {
        const watchedSet = new Set(watchedCodes.map(c => normalizeForMatch(c)));
        const wantedSet = new Set(wantedCodes.map(c => normalizeForMatch(c)));
        applyBlockEffectInternalOptimized(item, watchedSet, wantedSet, normalizeForMatch(query || ''));
    }

    // 根据评价人数获取评分阈值
    function getScoreThresholds(reviewCount) {
        if (reviewCount < 10) {
            return { lowScore: null, highScore: null }; // 样本太小，不做判断
        } else if (reviewCount < 50) {
            return { lowScore: 3.0, highScore: 4.4 };
        } else if (reviewCount < 100) {
            return { lowScore: 3.1, highScore: 4.3 };
        } else if (reviewCount < 300) {
            return { lowScore: 3.2, highScore: 4.2 };
        } else if (reviewCount < 1000) {
            return { lowScore: 3.3, highScore: 4.1 };
        } else {
            return { lowScore: 3.4, highScore: 4.0 };
        }
    }

    // 应用评分效果
    function applyScoreHighlight(item) {
        // 尝试多种可能的评分元素选择器
        let scoreElement = item.querySelector('.score .value') ||
            item.querySelector('.score > .value') ||
            item.querySelector('.score');

        if (!scoreElement) return;

        // 获取评分文本，可能包含HTML编码
        let scoreText = scoreElement.textContent || scoreElement.innerText || '';
        scoreText = scoreText.trim();

        // 解码HTML实体
        scoreText = scoreText.replace(/=E5=88=86/g, '分')
            .replace(/=E4=BA=BA/g, '人')
            .replace(/=E7=94=A8/g, '用')
            .replace(/=E8=A9=95=E5=83=B9/g, '評價')
            .replace(/=E7=9C=8B/g, '看')
            .replace(/=E7=94=B1/g, '由');

        // 匹配评分格式：X.XX分, 由XXX人評價
        const scoreMatch = scoreText.match(/([\d.]+)分[,，]\s*由(\d+)人(?:評價|评价)/);

        // 清除之前的评分相关类
        item.classList.remove('javdb-low-score', 'javdb-high-score');

        if (!CONFIG.enableLowScoreBlock) return;

        let score, reviewCount;

        if (scoreMatch) {
            score = parseFloat(scoreMatch[1]);
            reviewCount = parseInt(scoreMatch[2]);
        } else {
            // 宽松匹配：只提取分数
            const looseMatch = scoreText.match(/([\d.]+)/);
            if (!looseMatch) {
                debugLog(`无法解析评分，正常显示`);
                return;
            }
            score = parseFloat(looseMatch[1]);
            reviewCount = 0; // 无法获取人数时按0处理
        }

        // 获取阈值
        const thresholds = getScoreThresholds(reviewCount);

        // 样本太小，不做判断
        if (thresholds.lowScore === null) {
            debugLog(`评价人数较少(${reviewCount}人)，正常显示: ${score}分`);
            return;
        }

        // 判断评分档位
        if (score < thresholds.lowScore) {
            item.classList.add('javdb-low-score');
            debugLog(`低分: ${score}分, ${reviewCount}人评价, 阈值${thresholds.lowScore}`);
        } else if (score >= thresholds.highScore) {
            item.classList.add('javdb-high-score');
            debugLog(`高分: ${score}分, ${reviewCount}人评价, 阈值${thresholds.highScore}`);
        } else {
            debugLog(`正常: ${score}分, ${reviewCount}人评价`);
        }
    }

    // 全局持有 observer 以便卸载
    let pageObserver = null;

    // 监听页面变化 - 使用防抖优化高频触发
    function observePageChanges() {
        let lastUrl = window.location.href;

        // 创建防抖版本的 applyBlockEffect，避免高频 DOM 操作
        const debouncedApplyBlockEffect = debounce(() => {
            applyBlockEffect();
        }, 300);

        // 创建MutationObserver同时监听DOM变化和URL变化
        pageObserver = new MutationObserver((mutations) => {
            let shouldReapply = false;
            let urlChanged = false;

            // 检查URL变化
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                urlChanged = true;

                // 更新页面类型和标识
                CONFIG.currentPageType = window.location.href.includes('watched_videos') ? 'watched' :
                    window.location.href.includes('want_watch_videos') ? 'wanted' : null;

                if (CONFIG.currentPageType === 'watched') {
                    document.body.setAttribute('data-page', 'watched');
                } else if (CONFIG.currentPageType === 'wanted') {
                    document.body.setAttribute('data-page', 'wanted');
                } else {
                    document.body.removeAttribute('data-page');
                }
            }

            // 检查DOM变化 - 只检查新增的影片项
            if (!urlChanged) {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // 快速判断：检查是否包含影片项
                                if (node.classList?.contains('movie-list') ||
                                    node.classList?.contains('item') ||
                                    node.querySelector?.('.movie-list .item')) {
                                    shouldReapply = true;
                                    break;
                                }
                            }
                        }
                        if (shouldReapply) break;
                    }
                }
            }

            // 如果有变化，使用防抖重新应用屏蔽效果
            if (urlChanged) {
                // URL 变化使用较长延迟，确保页面完全加载
                setTimeout(() => applyBlockEffect(), 800);
            } else if (shouldReapply) {
                // DOM 变化使用防抖，合并多次触发
                debouncedApplyBlockEffect();
            }
        });

        // 开始观察整个文档
        pageObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * =================================================================
     * 大图预览组件 (Magic Lens)
     * =================================================================
     */

    // 大图预览状态
    const LensState = {
        isVisible: false,
        currentSrc: null,
        initialized: false
    };

    // 初始化大图预览组件
    function initMagicLens() {
        // 防止重复初始化
        if (LensState.initialized) {
            debugLog('大图预览组件已初始化，跳过');
            return;
        }

        // 创建透镜容器
        const lens = document.createElement('div');
        lens.id = 'javdb-magic-lens';
        lens.innerHTML = '<img id="javdb-lens-img" src="">';
        document.body.appendChild(lens);

        // 绑定事件
        bindMagicLensEvents();

        LensState.initialized = true;
        debugLog('大图预览组件初始化完成');
    }

    // 绑定大图预览事件
    function bindMagicLensEvents() {
        // 防止重复绑定
        if (document.body.dataset.javdbLensBound) return;
        document.body.dataset.javdbLensBound = 'true';

        // 鼠标悬停显示大图
        document.body.addEventListener('mouseover', function (e) {
            // 检查开关状态
            if (!CONFIG.enableImagePreview) return;

            const item = e.target.closest('.movie-list .item');
            if (item) {
                const lens = document.getElementById('javdb-magic-lens');
                const lensImg = document.getElementById('javdb-lens-img');

                if (!lens || !lensImg) return;

                // 获取封面图片
                const coverImg = item.querySelector('.cover img');
                if (!coverImg) return;

                let imgSrc = coverImg.src;

                // 尝试获取更大的图片：JavDB 图片 URL 规则
                // 缩略图格式: https://c0.jdbstatic.com/covers/xx/XXXXXXX.jpg
                // 大图格式: https://c0.jdbstatic.com/covers/xx/XXXXXXX.jpg (相同)
                // 但有些情况可能有 thumbs/ 目录，需要替换
                if (imgSrc) {
                    // 移除可能存在的 thumbs 路径
                    imgSrc = imgSrc.replace('/thumbs/', '/');
                }

                if (imgSrc && imgSrc.trim() && imgSrc !== LensState.currentSrc) {
                    LensState.isVisible = true;
                    LensState.currentSrc = imgSrc;
                    lens.style.display = 'flex';

                    lensImg.style.opacity = '0';
                    lensImg.src = imgSrc;
                    lensImg.onload = () => {
                        if (lensImg) lensImg.style.opacity = '1';
                    };
                    lensImg.onerror = () => {
                        debugLog("封面图片加载失败:", imgSrc);
                        lens.style.display = 'none';
                        LensState.isVisible = false;
                    };
                } else if (imgSrc && imgSrc.trim()) {
                    // 同一张图片，直接显示
                    LensState.isVisible = true;
                    lens.style.display = 'flex';
                }
            }
        });

        // 鼠标移出隐藏大图
        document.body.addEventListener('mouseout', function (e) {
            // 检查开关状态
            if (!CONFIG.enableImagePreview) return;

            const item = e.target.closest('.movie-list .item');
            const related = e.relatedTarget;
            const lens = document.getElementById('javdb-magic-lens');

            if (item && (!related || !item.contains(related))) {
                LensState.isVisible = false;
                if (lens) lens.style.display = 'none';
            }
        });

        // 智能避让：根据鼠标位置决定大图显示在左边还是右边
        document.addEventListener('mousemove', function (e) {
            // 检查开关状态
            if (!CONFIG.enableImagePreview || !LensState.isVisible) return;

            const lens = document.getElementById('javdb-magic-lens');
            if (!lens) return;

            const screenWidth = window.innerWidth;
            const mouseX = e.clientX;
            const margin = 30;

            // 鼠标在左半屏 -> 图显示在右半屏；反之亦然
            if (mouseX < screenWidth / 2) {
                lens.style.left = 'auto';
                lens.style.right = `${margin}px`;
            } else {
                lens.style.right = 'auto';
                lens.style.left = `${margin}px`;
            }
        });
    }

    // 移除未使用的控制面板函数，保持代码简洁

    // 创建全局悬浮窗
    function createGlobalFloatingWindow() {
        // 移除已存在的悬浮窗
        const existingWindow = document.getElementById('javdb-global-floating-window');
        if (existingWindow) {
            existingWindow.remove();
        }

        // 判断是否在导入页面或正在导入
        const isImportPage = CONFIG.currentPageType === PAGE_TYPE.WATCHED || CONFIG.currentPageType === PAGE_TYPE.WANTED;
        const isImporting = CONFIG.isImporting || getCachedValue(STORAGE_KEY.IMPORTING, false);

        // 注入 CSS 样式（只执行一次）
        injectStyles();

        // 创建面板
        const floatingWindow = document.createElement('div');
        floatingWindow.id = 'javdb-global-floating-window';
        floatingWindow.className = 'javdb-manager-panel minimized';

        // 最小化状态的内容
        const minimizedContent = document.createElement('div');
        minimizedContent.className = 'manager-icon';
        minimizedContent.textContent = '📋';

        // 展开状态的内容
        const panelContent = document.createElement('div');
        panelContent.className = 'panel-content';

        // 标题
        const header = document.createElement('div');
        header.className = 'manager-header';
        header.textContent = 'JavDB 影片管理器';

        // 计数显示区域
        const countDiv = document.createElement('div');
        countDiv.id = 'global-count-div';
        countDiv.className = 'manager-count';

        // 创建标签页
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'manager-tabs';

        const importTab = document.createElement('button');
        importTab.className = 'manager-tab active';
        importTab.textContent = '📥 导入';
        importTab.setAttribute('data-tab', 'import');

        const manageTab = document.createElement('button');
        manageTab.className = 'manager-tab';
        manageTab.textContent = '⚙️ 管理';
        manageTab.setAttribute('data-tab', 'manage');

        tabsContainer.appendChild(importTab);
        tabsContainer.appendChild(manageTab);

        // 导入标签页内容
        const importContent = document.createElement('div');
        importContent.className = 'manager-tab-content active';
        importContent.setAttribute('data-content', 'import');

        // 按钮区域
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'manager-buttons';

        const watchedBtn = document.createElement('button');
        watchedBtn.id = 'watched-import-btn';
        watchedBtn.className = 'manager-button watched';
        watchedBtn.textContent = '导入看过';

        const wantedBtn = document.createElement('button');
        wantedBtn.id = 'wanted-import-btn';
        wantedBtn.className = 'manager-button wanted';
        wantedBtn.textContent = '导入想看';

        buttonContainer.appendChild(wantedBtn);
        buttonContainer.appendChild(watchedBtn);

        const stopBtn = document.createElement('button');
        stopBtn.id = 'global-stop-btn';
        stopBtn.className = 'manager-button stop';
        stopBtn.textContent = '停止';

        importContent.appendChild(buttonContainer);
        importContent.appendChild(stopBtn);

        // === 数据导入导出功能 ===
        const ioContainer = document.createElement('div');
        ioContainer.className = 'manager-section';

        const ioTitle = document.createElement('div');
        ioTitle.className = 'section-title';
        ioTitle.textContent = '💾 数据备份';

        // 导入结果提示区域
        const ioResult = document.createElement('div');
        ioResult.id = 'io-result';
        ioResult.className = 'action-result';
        ioResult.style.textAlign = 'left';

        // 按钮容器
        const ioButtons = document.createElement('div');
        ioButtons.className = 'button-group';

        // 导出按钮
        const exportBtn = document.createElement('button');
        exportBtn.className = 'manager-button btn-export';
        exportBtn.textContent = '📤 导出数据';
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportData();
        });

        // 导入按钮
        const importBtn = document.createElement('button');
        importBtn.className = 'manager-button btn-import';
        importBtn.textContent = '📥 导入数据';
        importBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerFileImport();
        });

        // 隐藏的文件输入框
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'javdb-file-input';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', (e) => {
            handleFileImport(e.target.files[0]);
            fileInput.value = ''; // 重置以允许重复选择同一文件
        });

        ioButtons.appendChild(exportBtn);
        ioButtons.appendChild(importBtn);
        ioButtons.appendChild(fileInput);

        ioContainer.appendChild(ioTitle);
        ioContainer.appendChild(ioResult);
        ioContainer.appendChild(ioButtons);
        importContent.appendChild(ioContainer);

        // 管理标签页内容
        const manageContent = document.createElement('div');
        manageContent.className = 'manager-tab-content';
        manageContent.setAttribute('data-content', 'manage');

        // 智能管理功能
        const smartContainer = document.createElement('div');
        smartContainer.className = 'smart-container';

        const smartInput = document.createElement('input');
        smartInput.className = 'smart-input';
        smartInput.id = 'smart-input';
        smartInput.placeholder = '输入番号进行查询/添加/删除';

        const smartResult = document.createElement('div');
        smartResult.className = 'smart-result';
        smartResult.id = 'smart-result';
        smartResult.style.display = 'none';

        const smartActions = document.createElement('div');
        smartActions.className = 'smart-actions';
        smartActions.id = 'smart-actions';
        smartActions.style.display = 'none';

        smartContainer.appendChild(smartInput);
        smartContainer.appendChild(smartResult);
        smartContainer.appendChild(smartActions);

        manageContent.appendChild(smartContainer);

        // 添加功能开关
        const switchContainer = document.createElement('div');
        switchContainer.className = 'switch-container';
        switchContainer.style.marginTop = '15px';
        switchContainer.style.paddingTop = '15px';
        switchContainer.style.borderTop = '1px solid rgba(255,255,255,0.2)';

        // 看过屏蔽开关
        const watchedSwitch = createSwitch('看过屏蔽', 'enableWatchedBlock', CONFIG.enableWatchedBlock);
        switchContainer.appendChild(watchedSwitch);

        // 想看屏蔽开关
        const wantedSwitch = createSwitch('想看屏蔽', 'enableWantedBlock', CONFIG.enableWantedBlock);
        switchContainer.appendChild(wantedSwitch);

        // 低分屏蔽开关（同时控制高分高亮）
        const scoreSwitch = createSwitch('评分功能', 'enableLowScoreBlock', CONFIG.enableLowScoreBlock);
        switchContainer.appendChild(scoreSwitch);

        // 大图预览开关
        const imagePreviewSwitch = createSwitch('大图预览', 'enableImagePreview', CONFIG.enableImagePreview);
        switchContainer.appendChild(imagePreviewSwitch);

        manageContent.appendChild(switchContainer);

        // 添加数据清理按钮
        const cleanupContainer = document.createElement('div');
        cleanupContainer.className = 'manager-section';

        const cleanupResult = document.createElement('div');
        cleanupResult.id = 'cleanup-result';
        cleanupResult.className = 'action-result';

        const cleanupButton = document.createElement('button');
        cleanupButton.className = 'manager-button btn-cleanup';
        cleanupButton.textContent = '🗑️ 清空所有数据';
        cleanupButton.addEventListener('click', (e) => {
            e.stopPropagation();

            const watchedCodes = getCachedValue(CONFIG.watchedStorageKey, []);
            const wantedCodes = getCachedValue(CONFIG.wantedStorageKey, []);
            const totalCount = watchedCodes.length + wantedCodes.length;

            if (totalCount === 0) {
                showMessage('没有数据需要清空', 'warning');
                return;
            }

            // 二次确认对话框
            if (confirm(`⚠️ 确认清空所有数据？\n\n此操作将删除：\n• 看过列表：${watchedCodes.length} 个\n• 想看列表：${wantedCodes.length} 个\n\n此功能用于清除过去错误格式的历史数据，清空后不可恢复！`)) {
                // 清空数据
                setCachedValue(CONFIG.watchedStorageKey, []);
                setCachedValue(CONFIG.wantedStorageKey, []);

                // 显示结果
                cleanupResult.style.display = 'block';
                cleanupResult.style.background = 'rgba(231, 76, 60, 0.2)';
                cleanupResult.style.border = '1px solid rgba(231, 76, 60, 0.5)';
                cleanupResult.style.color = '#e74c3c';
                cleanupResult.style.textAlign = 'center';
                cleanupResult.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 5px;">🗑️ 数据已清空</div>
                    <div style="font-size: 11px;">已删除 ${totalCount} 个番号</div>
                `;

                // 更新显示
                updateGlobalCount();

                // 重新应用屏蔽效果
                setTimeout(() => {
                    applyBlockEffect();
                }, 100);
            }
        });

        cleanupContainer.appendChild(cleanupResult);
        cleanupContainer.appendChild(cleanupButton);
        manageContent.appendChild(cleanupContainer);

        // 添加调试按钮
        if (CONFIG.DEBUG) {
            const debugContainer = document.createElement('div');
            debugContainer.style.marginTop = '15px';
            debugContainer.style.paddingTop = '15px';
            debugContainer.style.borderTop = '1px solid rgba(255,255,255,0.2)';

            const debugButton = document.createElement('button');
            debugButton.className = 'manager-button';
            debugButton.style.background = '#9b59b6';
            debugButton.style.color = 'white';
            debugButton.textContent = '调试评分结构';
            debugButton.addEventListener('click', (e) => {
                e.stopPropagation();
                debugScoreStructure();
                applyBlockEffect(); // 重新应用效果
            });

            debugContainer.appendChild(debugButton);
            manageContent.appendChild(debugContainer);
        }

        // 关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-button';
        closeBtn.innerHTML = '&times;';

        // 组装展开状态的界面
        panelContent.appendChild(header);
        panelContent.appendChild(countDiv);
        panelContent.appendChild(tabsContainer);
        panelContent.appendChild(importContent);
        panelContent.appendChild(manageContent);

        // 组装完整界面
        floatingWindow.appendChild(minimizedContent);
        floatingWindow.appendChild(panelContent);
        floatingWindow.appendChild(closeBtn);

        // 事件处理
        floatingWindow.addEventListener('click', function (e) {
            // 如果点击的是关闭按钮，不处理
            if (e.target.classList.contains('close-button')) {
                return;
            }

            // 如果点击的是输入元素、候选区域或按钮，不处理最小化逻辑
            if (e.target.tagName === 'INPUT' ||
                e.target.tagName === 'SELECT' ||
                e.target.tagName === 'TEXTAREA' ||
                e.target.closest('.smart-result') ||
                e.target.closest('.smart-actions') ||
                e.target.tagName === 'BUTTON') {
                return;
            }

            // 如果面板已最小化，则展开
            if (floatingWindow.classList.contains('minimized')) {
                floatingWindow.classList.remove('minimized');
            }
            // 如果点击的是面板内容区域且不是上述元素，则最小化
            else if (!e.target.closest('.panel-content') ||
                (e.target.closest('.panel-content') &&
                    !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) &&
                    !e.target.closest('.smart-result') &&
                    !e.target.closest('.smart-actions'))) {
                floatingWindow.classList.add('minimized');
            }
        });

        // 按钮事件
        watchedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startImport('watched');
        });

        wantedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startImport('wanted');
        });

        stopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            stopImport();
        });

        // 标签页切换事件
        importTab.addEventListener('click', (e) => {
            e.stopPropagation();
            switchTab('import');
        });

        manageTab.addEventListener('click', (e) => {
            e.stopPropagation();
            switchTab('manage');
        });

        // 智能输入框事件
        smartInput.addEventListener('input', (e) => {
            e.stopPropagation();
            handleSmartInput();
        });

        smartInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                // 如果有推荐操作，执行第一个推荐操作
                const firstAction = document.querySelector('.smart-action-button');
                if (firstAction) {
                    firstAction.click();
                }
            }
        });

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            floatingWindow.remove();
            CONFIG.panelCreated = false;
        });

        // 如果正在导入，自动展开面板
        if (isImporting || isImportPage) {
            floatingWindow.classList.remove('minimized');
        }

        document.body.appendChild(floatingWindow);

        // 获取已保存的总数
        updateGlobalCount();
    }

    // 更新全局悬浮窗显示
    function updateGlobalCount() {
        debugLog('更新UI显示，当前状态:', {
            isImporting: CONFIG.isImporting,
            gmImporting: getCachedValue(STORAGE_KEY.IMPORTING, false)
        });

        const watchedCodes = getCachedValue(CONFIG.watchedStorageKey, []);
        const wantedCodes = getCachedValue(CONFIG.wantedStorageKey, []);
        const totalCount = watchedCodes.length + wantedCodes.length;

        // 从 GM 存储读取当前状态，确保页面刷新后状态正确
        const isImporting = getCachedValue(STORAGE_KEY.IMPORTING, false);
        const importType = getCachedValue(STORAGE_KEY.IMPORT_TYPE, null);
        const importedCount = getCachedValue(STORAGE_KEY.IMPORTED_COUNT, 0);

        debugLog('UI更新参数:', {
            isImporting,
            importType,
            importedCount,
            totalCount,
            watchedCount: watchedCodes.length,
            wantedCount: wantedCodes.length
        });

        const countDiv = document.getElementById('global-count-div');
        const watchedImportBtn = document.getElementById('watched-import-btn');
        const wantedImportBtn = document.getElementById('wanted-import-btn');
        const stopBtn = document.getElementById('global-stop-btn');
        const panel = document.getElementById('javdb-global-floating-window');

        debugLog('找到的元素:', {
            countDiv: !!countDiv,
            watchedImportBtn: !!watchedImportBtn,
            wantedImportBtn: !!wantedImportBtn,
            stopBtn: !!stopBtn,
            panel: !!panel
        });

        if (countDiv) {
            if (isImporting && importType) {
                const typeText = importType === 'watched' ? '看过' : '想看';
                debugLog('设置导入中状态');

                // 添加导入中样式
                countDiv.classList.add('importing');

                // 获取当前页面的影片总数
                const currentPageItems = document.querySelectorAll('.movie-list .item').length;

                countDiv.innerHTML = `
                    <div style="font-size: 13px; color: #ff9f0a; text-align: center; font-weight: 600; margin-bottom: 8px;">🚀 正在导入${typeText}...</div>
                    <div class="stat-grid">
                        <div class="stat-item importing-stat">
                            <div class="stat-value" style="color: #ff9f0a;">${importedCount}</div>
                            <div class="stat-label">已导入</div>
                        </div>
                        <div class="stat-item importing-stat">
                            <div class="stat-value" style="color: #ffffff;">${currentPageItems}</div>
                            <div class="stat-label">本页总计</div>
                        </div>
                    </div>
                `;

                if (watchedImportBtn) {
                    watchedImportBtn.disabled = true;
                }
                if (wantedImportBtn) {
                    wantedImportBtn.disabled = true;
                }

                // 停止按钮激活状态
                if (stopBtn) {
                    stopBtn.disabled = false;
                    stopBtn.classList.add('active');
                }

                // 导入时自动展开面板
                if (panel && panel.classList.contains('minimized')) {
                    panel.classList.remove('minimized');
                }
            } else {
                debugLog('设置完成状态');

                // 移除导入中样式
                countDiv.classList.remove('importing');

                countDiv.innerHTML = `
                    <div class="stat-grid">
                        <div class="stat-item full-width total">
                            <div class="stat-value">${totalCount}</div>
                            <div class="stat-label">已保存总数</div>
                        </div>
                        <div class="stat-item wanted">
                            <div class="stat-value">${wantedCodes.length}</div>
                            <div class="stat-label">想看</div>
                        </div>
                        <div class="stat-item watched">
                            <div class="stat-value">${watchedCodes.length}</div>
                            <div class="stat-label">看过</div>
                        </div>
                    </div>
                `;

                if (watchedImportBtn) {
                    watchedImportBtn.disabled = false;
                }
                if (wantedImportBtn) {
                    wantedImportBtn.disabled = false;
                }

                // 停止按钮恢复正常状态
                if (stopBtn) {
                    stopBtn.disabled = false;
                    stopBtn.classList.remove('active');
                }
            }

            debugLog('UI更新完成，当前内容:', countDiv.innerText);
        } else {
            debugLog('未找到悬浮窗元素，尝试重新创建');
            // 如果找不到悬浮窗，重新创建
            createGlobalFloatingWindow();
            // 再次尝试更新
            setTimeout(() => updateGlobalCount(), 200);
        }
    }



    // 开始导入
    function startImport(type) {
        // 如果当前不在对应页面，先跳转并记录待导入状态
        if (type === 'watched' && !window.location.href.includes('watched_videos')) {
            setCachedValue(STORAGE_KEY.PENDING_IMPORT, PAGE_TYPE.WATCHED);
            window.location.href = 'https://javdb.com/users/watched_videos?page=1';
            return;
        }
        // 如果当前不在对应页面，先跳转并记录待导入状态
        if (type === PAGE_TYPE.WANTED && !window.location.href.includes('want_watch_videos')) {
            setCachedValue(STORAGE_KEY.PENDING_IMPORT, PAGE_TYPE.WANTED);
            window.location.href = 'https://javdb.com/users/want_watch_videos?page=1';
            return;
        }

        // 设置 GM 存储状态
        setCachedValue(STORAGE_KEY.IMPORTING, true);
        setCachedValue(STORAGE_KEY.IMPORTED_COUNT, 0);
        setCachedValue(STORAGE_KEY.IMPORT_TYPE, type);

        // 更新内存状态
        CONFIG.isImporting = true;
        CONFIG.importedCount = 0;
        CONFIG.totalCount = 0;
        CONFIG.currentPageType = type;

        // 更新UI
        updateGlobalCount();

        // 开始提取当前页面的番号
        extractAndSaveCurrentPage();
    }

    // 停止导入
    function stopImport() {
        debugLog('停止导入被调用');

        // 保存当前页面的番号
        saveCurrentPageCodes();

        // 立即清除 GM 存储状态
        deleteCachedValue(STORAGE_KEY.PENDING_IMPORT);
        deleteCachedValue(STORAGE_KEY.IMPORTING);
        deleteCachedValue(STORAGE_KEY.IMPORTED_COUNT);
        deleteCachedValue(STORAGE_KEY.IMPORT_TYPE);

        // 更新内存状态
        CONFIG.isImporting = false;

        debugLog('已清除所有状态，准备更新UI');

        // 保存当前进度
        saveProgress();

        // 使用公共函数重建悬浮窗
        forceRecreateFloatingWindow();

        // 显示停止提示
        showStopMessage();

        debugLog('停止导入完成');
    }

    // 保存当前页面的番号 - 使用 Set 优化去重
    function saveCurrentPageCodes() {
        debugLog('保存当前页面的番号');

        const items = document.querySelectorAll('.movie-list .item');
        const pageCodesSet = new Set(); // 使用 Set 替代数组，O(1) 去重

        items.forEach(item => {
            const code = getVideoCodeFromItem(item);
            if (code) {
                pageCodesSet.add(code);
            }
        });

        const pageCodes = [...pageCodesSet];

        if (pageCodes.length > 0) {
            debugLog(`当前页面找到 ${pageCodes.length} 个番号:`, pageCodes);

            // 保存番号
            saveCodes(pageCodes);

            // 同步到 GM 存储
            if (CONFIG.isImporting) {
                setCachedValue(STORAGE_KEY.IMPORTED_COUNT, CONFIG.importedCount);
            }

            debugLog(`已保存当前页面番号，本次导入总数: ${CONFIG.importedCount}`);
        } else {
            debugLog('当前页面没有找到番号');
        }
    }



    // 强制重建悬浮窗的公共函数
    function forceRecreateFloatingWindow() {
        const existingWindow = document.getElementById('javdb-global-floating-window');
        if (existingWindow) {
            existingWindow.remove();
        }
        CONFIG.panelCreated = false;
        createGlobalFloatingWindow();
        CONFIG.panelCreated = true;
        setTimeout(() => updateGlobalCount(), 100);
    }

    // 完成导入的统一函数
    function completeImport() {
        debugLog('开始完成导入流程');

        // 清除所有 GM 存储状态
        deleteCachedValue(STORAGE_KEY.PENDING_IMPORT);
        deleteCachedValue(STORAGE_KEY.IMPORTING);
        deleteCachedValue(STORAGE_KEY.IMPORTED_COUNT);
        deleteCachedValue(STORAGE_KEY.IMPORT_TYPE);

        // 更新内存状态
        CONFIG.isImporting = false;

        debugLog('导入完成，已清除所有状态');

        // 保存当前进度
        saveProgress();

        // 使用公共函数重建悬浮窗
        forceRecreateFloatingWindow();

        // 延迟显示完成消息，确保UI已更新
        setTimeout(() => {
            showCompletionMessage();
        }, 200);
    }

    // 显示停止提示
    function showStopMessage() {
        showToast('导入已停止', {
            type: 'error',
            duration: 2000,
            onClose: () => {
                const panel = document.getElementById('javdb-global-floating-window');
                if (panel && !panel.classList.contains('minimized')) {
                    panel.classList.add('minimized');
                }
            }
        });
    }

    // 提取并保存当前页面的番号 - 使用 Set 优化去重
    function extractAndSaveCurrentPage() {
        // 双重检查：内存状态和 GM 存储状态
        if (!CONFIG.isImporting || !getCachedValue(STORAGE_KEY.IMPORTING, false)) {
            debugLog('导入已停止，取消当前页面处理');
            return;
        }

        const items = document.querySelectorAll('.movie-list .item');
        const pageCodesSet = new Set(); // 使用 Set 替代数组，O(1) 去重

        items.forEach(item => {
            const code = getVideoCodeFromItem(item);
            if (code) {
                pageCodesSet.add(code);
            }
        });

        const pageCodes = [...pageCodesSet];

        // 保存番号
        saveCodes(pageCodes);

        // 更新计数
        if (pageCodes.length > 0) {
            setCachedValue(STORAGE_KEY.IMPORTED_COUNT, CONFIG.importedCount);
        }

        updateGlobalCount();

        // 检查是否有下一页
        setTimeout(() => {
            // 再次检查状态，防止在等待期间被停止
            if (CONFIG.isImporting && getCachedValue(STORAGE_KEY.IMPORTING, false)) {
                goToNextPage();
            } else {
                debugLog('在等待翻页期间检测到停止信号');
            }
        }, 1000);
    }

    // 保存番号 - 使用 Set 优化去重性能
    function saveCodes(newCodes) {
        const storageKey = CONFIG.currentPageType === 'watched' ? CONFIG.watchedStorageKey : CONFIG.wantedStorageKey;
        const oppositeKey = CONFIG.currentPageType === 'watched' ? CONFIG.wantedStorageKey : CONFIG.watchedStorageKey;

        // 使用 Set 存储标准化后的新番号，O(n) 去重
        const normalizedNewCodes = [...new Set(newCodes.map(code => normalizeCode(code)).filter(Boolean))];
        if (normalizedNewCodes.length === 0) return;

        // 使用 Set 优化对面列表的去重检查，O(n) 而非 O(n²)
        const newCodesSet = new Set(normalizedNewCodes.map(c => normalizeForMatch(c)));
        const oppositeCodes = getCachedValue(oppositeKey, []);
        const newOppositeCodes = oppositeCodes.filter(code => !newCodesSet.has(normalizeForMatch(code)));

        if (newOppositeCodes.length !== oppositeCodes.length) {
            setCachedValue(oppositeKey, newOppositeCodes.sort());
            debugLog(`从对面列表移除了 ${oppositeCodes.length - newOppositeCodes.length} 个重复番号`);
        }

        // 使用 Set 合并去重，O(n)
        const existingCodes = getCachedValue(storageKey, []);
        const allCodesSet = new Set([...existingCodes, ...normalizedNewCodes]);
        const allCodes = [...allCodesSet].sort();

        // 保存
        setCachedValue(storageKey, allCodes);

        // 计算新增数量
        const newCount = allCodes.length - existingCodes.length;
        CONFIG.importedCount += newCount;

        // 更新全局计数显示
        updateGlobalCount();

        // 重新应用屏蔽效果
        setTimeout(() => {
            applyBlockEffect();
        }, 100);

        debugLog(`保存了 ${normalizedNewCodes.length} 个番号，新增 ${newCount} 个，累计 ${CONFIG.importedCount} 个`);
    }

    // 保存进度
    function saveProgress() {
        const statusDiv = document.getElementById('status-div');
        if (statusDiv) {
            statusDiv.textContent = `导入完成，共保存 ${CONFIG.importedCount} 个番号`;
        }
        // 不再依赖控制面板，这个函数现在主要用于保存数据
    }



    // 跳转到下一页
    function goToNextPage() {
        // 双重检查状态
        if (!CONFIG.isImporting || !getCachedValue(STORAGE_KEY.IMPORTING, false)) {
            debugLog('导入已停止，取消翻页');
            return;
        }

        debugLog('检查是否有下一页...');

        // 检查是否还有更多内容的方法
        const hasMoreContent = checkHasMoreContent();

        debugLog('是否有更多内容:', hasMoreContent);

        if (hasMoreContent) {
            // 获取当前页码并构造下一页URL
            const currentUrl = window.location.href;
            let nextPageUrl;

            // 尝试从URL中提取页码
            const pageMatch = currentUrl.match(/[?&]page=(\d+)/);
            if (pageMatch) {
                const currentPage = parseInt(pageMatch[1]);
                const nextPage = currentPage + 1;
                nextPageUrl = currentUrl.replace(/([?&]page=)\d+/, `$1${nextPage}`);
                debugLog(`从第${currentPage}页跳转到第${nextPage}页`);
            } else {
                // 如果URL中没有页码参数，添加第1页
                nextPageUrl = currentUrl + (currentUrl.includes('?') ? '&' : '?') + 'page=1';
                debugLog('URL中没有页码参数，跳转到第1页');
            }

            debugLog('准备跳转到下一页:', nextPageUrl);

            // 最后一次状态检查
            if (!getCachedValue(STORAGE_KEY.IMPORTING, false)) {
                debugLog('翻页前检查到停止信号，取消翻页');
                return;
            }

            // 保存当前导入状态到 GM 存储
            setCachedValue(STORAGE_KEY.IMPORTING, true);
            setCachedValue(STORAGE_KEY.IMPORTED_COUNT, CONFIG.importedCount);
            setCachedValue(STORAGE_KEY.IMPORT_TYPE, CONFIG.currentPageType);

            debugLog('已保存导入状态，准备跳转到下一页');

            // 直接跳转到下一页URL
            window.location.href = nextPageUrl;

            debugLog('已跳转到下一页');

            // 页面跳转后，init函数会检查并继续导入
        } else {
            // 没有下一页了，完成导入
            debugLog('没有更多内容，导入完成');

            // 彻底清除状态
            completeImport();
        }
    }

    // 检查是否还有更多内容
    function checkHasMoreContent() {
        // 检查当前页面是否有影片
        const items = document.querySelectorAll('.movie-list .item');
        if (items.length === 0) {
            debugLog('当前页面没有找到影片项，应该停止');
            return false;
        }

        // 检查页面文本内容是否包含"暫無內容"
        const bodyText = document.body.textContent || document.body.innerText || '';
        if (/暫無內容/.test(bodyText)) {
            debugLog('页面显示"暫無內容"，应该停止');
            return false;
        }

        return true; // 有番号且没有"暫無內容"则继续
    }

    // 显示完成消息
    function showCompletionMessage() {
        const typeName = CONFIG.currentPageType === 'watched' ? '看过' : '想看';
        const html = `
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">导入完成！</div>
            <div>${typeName}影片共导入 ${CONFIG.importedCount} 个</div>
        `;

        showToast(html, {
            type: 'success',
            duration: 3000,
            isHtml: true,
            padding: '20px 30px',
            fontSize: '16px',
            onClose: () => {
                const panel = document.getElementById('javdb-global-floating-window');
                if (panel && !panel.classList.contains('minimized')) {
                    panel.classList.add('minimized');
                }
            }
        });
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 切换标签页
    function switchTab(tabName) {
        // 更新标签按钮状态
        document.querySelectorAll('.manager-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.getAttribute('data-tab') === tabName) {
                tab.classList.add('active');
            }
        });

        // 更新内容显示
        document.querySelectorAll('.manager-tab-content').forEach(content => {
            content.classList.remove('active');
            if (content.getAttribute('data-content') === tabName) {
                content.classList.add('active');
            }
        });
    }

    // 智能输入处理 - 使用防抖和 Set 优化
    const debouncedHandleSmartInput = debounce(() => {
        handleSmartInputCore();
    }, 150);

    function handleSmartInput() {
        debouncedHandleSmartInput();
    }

    // 核心处理逻辑
    function handleSmartInputCore() {
        const smartInput = document.getElementById('smart-input');
        const smartResult = document.getElementById('smart-result');
        const smartActions = document.getElementById('smart-actions');
        const code = smartInput.value.trim();

        // 如果输入为空，隐藏结果
        if (!code) {
            smartResult.style.display = 'none';
            smartActions.style.display = 'none';
            return;
        }

        // 读取数据并使用 Set 优化查找（使用缓存）
        const watchedCodes = getCachedValue(CONFIG.watchedStorageKey, []);
        const wantedCodes = getCachedValue(CONFIG.wantedStorageKey, []);

        // 构建查找映射，O(1) 查询
        const watchedMap = new Map(watchedCodes.map(c => [normalizeForMatch(c), c]));
        const wantedMap = new Map(wantedCodes.map(c => [normalizeForMatch(c), c]));

        const normalizedInput = normalizeForMatch(code);
        let found = false;
        let location = '';
        let matchedCode = null;
        let candidates = [];

        // 精确匹配（O(1) 查找）
        if (watchedMap.has(normalizedInput)) {
            found = true;
            location = '看过';
            matchedCode = watchedMap.get(normalizedInput);
        } else if (wantedMap.has(normalizedInput)) {
            found = true;
            location = '想看';
            matchedCode = wantedMap.get(normalizedInput);
        }

        // 查找候选匹配（只在未精确匹配时执行）
        if (!found && code.length >= 2) {
            const allEntries = [...watchedMap.entries(), ...wantedMap.entries()];
            candidates = allEntries
                .filter(([normalized, original]) =>
                    normalized.includes(normalizedInput) ||
                    normalizedInput.includes(normalized)
                )
                .slice(0, 5)
                .map(([_, original]) => original);
        }

        smartResult.style.display = 'block';

        if (found) {
            renderFoundResult(smartResult, smartActions, matchedCode, location);
        } else if (candidates.length > 0) {
            renderCandidates(smartResult, smartActions, candidates, watchedMap);
        } else {
            renderNotFound(smartResult, smartActions, code);
        }
    }

    // 渲染匹配成功结果
    function renderFoundResult(smartResult, smartActions, matchedCode, location) {
        smartResult.className = 'smart-result found';
        const statusColor = location === '看过' ? '#ff453a' : '#ff9f0a';
        smartResult.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 6px;">
                <span style="background: ${statusColor}; color: white; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: bold;">${location}</span>
                <span style="font-weight: bold; font-size: 16px;">匹配成功</span>
            </div>
            <div style="opacity: 0.8; font-size: 14px; letter-spacing: 0.5px;">${matchedCode}</div>
        `;

        smartActions.style.display = 'flex';
        smartActions.style.justifyContent = 'center';
        smartActions.innerHTML = '';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'smart-action-button delete active javdb-delete-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => smartDeleteCode(matchedCode));
        smartActions.appendChild(deleteBtn);
    }

    // 渲染候选列表
    function renderCandidates(smartResult, smartActions, candidates, watchedMap) {
        smartResult.className = 'smart-result not-found';
        let candidatesHtml = '<div style="font-weight: bold; margin-bottom: 5px;">候选番号:</div>';
        candidates.forEach(candidate => {
            const location = watchedMap.has(normalizeForMatch(candidate)) ? '看过' : '想看';
            candidatesHtml += `<div style="cursor: pointer; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.1);" data-candidate="${candidate}">${candidate} (${location})</div>`;
        });
        smartResult.innerHTML = candidatesHtml;

        smartResult.querySelectorAll('[data-candidate]').forEach(elem => {
            elem.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const candidate = e.target.getAttribute('data-candidate');
                selectCandidate(candidate);
            });
        });

        smartActions.style.display = 'none';
    }

    // 渲染未找到结果
    function renderNotFound(smartResult, smartActions, code) {
        smartResult.className = 'smart-result not-found';
        smartResult.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">未找到</div>
            <div>番号: ${code}</div>
            <div>可以添加到看过或想看列表</div>
        `;

        smartActions.style.display = 'flex';
        smartActions.innerHTML = '';

        const addWantedBtn = document.createElement('button');
        addWantedBtn.className = 'smart-action-button add-wanted';
        addWantedBtn.textContent = '添加到想看';
        addWantedBtn.addEventListener('click', () => smartAddCode(code, 'wanted'));
        smartActions.appendChild(addWantedBtn);

        const addWatchedBtn = document.createElement('button');
        addWatchedBtn.className = 'smart-action-button add-watched';
        addWatchedBtn.textContent = '添加到看过';
        addWatchedBtn.addEventListener('click', () => smartAddCode(code, 'watched'));
        smartActions.appendChild(addWatchedBtn);
    }

    // 选择候选番号
    function selectCandidate(candidate) {
        const smartInput = document.getElementById('smart-input');
        smartInput.value = candidate;
        handleSmartInput(); // 重新处理显示
    }

    // 智能添加番号
    function smartAddCode(code, type) {
        const storageKey = type === 'watched' ? CONFIG.watchedStorageKey : CONFIG.wantedStorageKey;
        const oppositeKey = type === 'watched' ? CONFIG.wantedStorageKey : CONFIG.watchedStorageKey;

        // 标准化番号
        const normalizedCode = normalizeCode(code);

        // 获取当前列表（使用缓存）
        let codes = getCachedValue(storageKey, []);
        let oppositeCodes = getCachedValue(oppositeKey, []);

        // 检查是否已在列表中（不区分大小写和空格）
        if (findMatchingCode(normalizedCode, codes)) {
            showMessage(`番号 ${normalizedCode} 已在${type === 'watched' ? '看过' : '想看'}列表中`, 'warning');
            return;
        }

        // 检查是否在对面列表中（不区分大小写和空格）
        if (findMatchingCode(normalizedCode, oppositeCodes)) {
            // 从对面列表中移除并排序
            oppositeCodes = oppositeCodes.filter(c => !isCodeMatch(c, normalizedCode)).sort();
            setCachedValue(oppositeKey, oppositeCodes);
            showMessage(`番号 ${normalizedCode} 已从${type === 'watched' ? '想看' : '看过'}列表移除，并添加到${type === 'watched' ? '看过' : '想看'}列表`, 'info');
        } else {
            showMessage(`番号 ${normalizedCode} 已添加到${type === 'watched' ? '看过' : '想看'}列表`, 'success');
        }

        // 添加到新列表并排序
        codes.push(normalizedCode);
        setCachedValue(storageKey, codes.sort());

        // 更新显示
        updateGlobalCount();
        handleSmartInput(); // 重新搜索以更新状态

        // 重新应用屏蔽效果
        setTimeout(() => {
            applyBlockEffect();
        }, 100);
    }

    // 智能删除番号
    function smartDeleteCode(code) {
        const watchedCodes = getCachedValue(CONFIG.watchedStorageKey, []);
        const wantedCodes = getCachedValue(CONFIG.wantedStorageKey, []);

        let deleted = false;
        let deletedFrom = '';

        // 检查并从看过列表删除
        const watchedMatch = findMatchingCode(code, watchedCodes);
        if (watchedMatch) {
            const newWatchedCodes = watchedCodes.filter(c => !isCodeMatch(c, code)).sort();
            setCachedValue(CONFIG.watchedStorageKey, newWatchedCodes);
            deleted = true;
            deletedFrom = '看过';
        }

        // 检查并从想看列表删除
        const wantedMatch = findMatchingCode(code, wantedCodes);
        if (wantedMatch) {
            const newWantedCodes = wantedCodes.filter(c => !isCodeMatch(c, code)).sort();
            setCachedValue(CONFIG.wantedStorageKey, newWantedCodes);
            deleted = true;
            deletedFrom += deletedFrom ? '和想看' : '想看';
        }

        if (deleted) {
            showMessage(`番号 ${code} 已从${deletedFrom}列表删除`, 'success');
            updateGlobalCount();
            handleSmartInput(); // 重新搜索以更新状态

            // 重新应用屏蔽效果
            setTimeout(() => {
                applyBlockEffect();
            }, 100);
        } else {
            showMessage(`番号 ${code} 不在任何列表中`, 'error');
        }
    }

    // 通用 Toast 提示函数
    function showToast(content, options = {}) {
        // 移除已存在的提示
        const existingMsg = document.getElementById('javdb-toast-message');
        if (existingMsg) {
            existingMsg.remove();
        }

        const {
            type = 'info',
            duration = 2000,
            isHtml = false,
            padding = '15px 25px',
            fontSize = '14px',
            onClose = null
        } = options;

        let bgColor = '#3498db'; // info
        if (type === 'success') bgColor = 'rgba(39, 174, 96, 0.95)';
        else if (type === 'error') bgColor = 'rgba(231, 76, 60, 0.95)';
        else if (type === 'warning') bgColor = 'rgba(243, 156, 18, 0.95)';

        const messageDiv = document.createElement('div');
        messageDiv.id = 'javdb-toast-message';
        messageDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${bgColor};
            color: white;
            padding: ${padding};
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 10002;
            font-family: Arial, sans-serif;
            font-size: ${fontSize};
            text-align: center;
            backdrop-filter: blur(10px);
        `;

        if (isHtml) {
            messageDiv.innerHTML = content;
        } else {
            messageDiv.textContent = content;
        }

        document.body.appendChild(messageDiv);

        if (duration > 0) {
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
                if (onClose) onClose();
            }, duration);
        }
    }

    // 显示消息提示 (保持向后兼容)
    function showMessage(text, type) {
        showToast(text, { type });
    }

    // === 数据导入导出功能实现 ===

    // 导出数据到本地JSON文件
    function exportData() {
        const watchedCodes = getCachedValue(CONFIG.watchedStorageKey, []);
        const wantedCodes = getCachedValue(CONFIG.wantedStorageKey, []);

        // 按字母数字顺序排序
        const sortedWatched = [...watchedCodes].sort();
        const sortedWanted = [...wantedCodes].sort();

        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString().split('T')[0],
            exportTime: new Date().toISOString(),
            source: 'JavDB影片管理器',
            watched: sortedWatched,
            wanted: sortedWanted,
            stats: {
                watchedCount: sortedWatched.length,
                wantedCount: sortedWanted.length,
                totalCount: sortedWatched.length + sortedWanted.length
            }
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const fileName = `javdb_backup_${new Date().toISOString().split('T')[0]}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage(`已导出 ${exportData.stats.totalCount} 个番号到 ${fileName}`, 'success');
        debugLog(`数据导出成功: ${fileName}`, exportData.stats);
    }

    // 触发文件选择对话框
    function triggerFileImport() {
        const fileInput = document.getElementById('javdb-file-input');
        if (fileInput) {
            fileInput.click();
        }
    }

    // 处理文件导入
    function handleFileImport(file) {
        if (!file) {
            showMessage('未选择文件', 'error');
            return;
        }

        if (!file.name.endsWith('.json')) {
            showMessage('请选择 JSON 格式的文件', 'error');
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);

                // 验证数据格式
                if (!validateImportData(importedData)) {
                    showMessage('文件格式不正确，请选择有效的备份文件', 'error');
                    return;
                }

                // 显示导入选项对话框
                showImportDialog(importedData);

            } catch (error) {
                showMessage('文件解析失败，请确保是有效的 JSON 文件', 'error');
                debugLog('导入解析错误:', error);
            }
        };

        reader.onerror = () => {
            showMessage('文件读取失败', 'error');
        };

        reader.readAsText(file);
    }

    // 验证导入数据格式
    function validateImportData(data) {
        if (!data || typeof data !== 'object') return false;
        if (!Array.isArray(data.watched) && !Array.isArray(data.wanted)) return false;
        // 至少需要一个列表
        return true;
    }

    // 显示导入选项对话框
    function showImportDialog(importedData) {
        // 移除已存在的对话框
        const existingDialog = document.getElementById('javdb-import-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        const dialog = document.createElement('div');
        dialog.id = 'javdb-import-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(28, 28, 30, 0.85);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            color: white;
            padding: 20px;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            z-index: 10003;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            min-width: 340px;
            max-width: 90vw;
            border: 1px solid rgba(255,255,255,0.15);
        `;

        // 获取当前数据统计
        const currentWatched = getCachedValue(CONFIG.watchedStorageKey, []);
        const currentWanted = getCachedValue(CONFIG.wantedStorageKey, []);

        // 标题
        const title = document.createElement('div');
        title.style.cssText = `
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            text-align: center;
            color: #3498db;
        `;
        title.textContent = '📥 导入数据预览';

        // 数据预览
        const preview = document.createElement('div');
        preview.style.cssText = `
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 15px;
            font-size: 12px;
        `;

        const importWatched = importedData.watched || [];
        const importWanted = importedData.wanted || [];
        const importDate = importedData.exportDate || '未知';

        preview.innerHTML = `
            <div style="margin-bottom: 8px; color: #888;">备份日期: ${importDate}</div>
            <div style="display: flex; gap: 20px; justify-content: center;">
                <div style="text-align: center;">
                    <div style="font-size: 11px; color: #888;">看过</div>
                    <div style="font-size: 20px; font-weight: bold; color: #e74c3c;">${importWatched.length}</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 11px; color: #888;">想看</div>
                    <div style="font-size: 20px; font-weight: bold; color: #f39c12;">${importWanted.length}</div>
                </div>
            </div>
                            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; color: #888;">
                            当前数据: 看过 ${currentWatched.length} | 想看 ${currentWanted.length}
                        </div>        `;

        // 导入模式选项
        const modeContainer = document.createElement('div');
        modeContainer.style.cssText = `
            margin-bottom: 15px;
        `;

        const modeTitle = document.createElement('div');
        modeTitle.style.cssText = `
            font-size: 12px;
            color: #888;
            margin-bottom: 8px;
        `;
        modeTitle.textContent = '导入模式:';

        const modeOptions = document.createElement('div');
        modeOptions.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        // 合并模式
        const mergeOption = document.createElement('label');
        mergeOption.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            padding: 8px;
            background: rgba(52, 152, 219, 0.2);
            border-radius: 6px;
            border: 1px solid rgba(52, 152, 219, 0.5);
        `;
        mergeOption.innerHTML = `
            <input type="radio" name="import-mode" value="merge" checked>
            <div>
                <div style="font-weight: bold;">合并数据</div>
                <div style="font-size: 11px; color: #888;">将导入数据与现有数据合并，自动去重</div>
            </div>
        `;

        // 覆盖模式
        const overwriteOption = document.createElement('label');
        overwriteOption.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            padding: 8px;
            background: rgba(231, 76, 60, 0.2);
            border-radius: 6px;
            border: 1px solid rgba(231, 76, 60, 0.5);
        `;
        overwriteOption.innerHTML = `
            <input type="radio" name="import-mode" value="overwrite">
            <div>
                <div style="font-weight: bold;">覆盖数据</div>
                <div style="font-size: 11px; color: #888;">⚠️ 清空现有数据，使用导入数据替换</div>
            </div>
        `;

        modeOptions.appendChild(mergeOption);
        modeOptions.appendChild(overwriteOption);
        modeContainer.appendChild(modeTitle);
        modeContainer.appendChild(modeOptions);

        // 按钮区域
        const buttons = document.createElement('div');
        buttons.style.cssText = `
            display: flex;
            gap: 10px;
            margin-top: 15px;
        `;

        const confirmBtn = document.createElement('button');
        confirmBtn.style.cssText = `
            flex: 1;
            padding: 10px;
            border: none;
            border-radius: 6px;
            background: linear-gradient(135deg, #27ae60, #2ecc71);
            color: white;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
        `;
        confirmBtn.textContent = '确认导入';
        confirmBtn.addEventListener('click', () => {
            const mode = document.querySelector('input[name="import-mode"]:checked').value;
            executeImport(importedData, mode);
            dialog.remove();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.style.cssText = `
            flex: 1;
            padding: 10px;
            border: none;
            border-radius: 6px;
            background: rgba(255,255,255,0.1);
            color: white;
            font-size: 14px;
            cursor: pointer;
        `;
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', () => {
            dialog.remove();
        });

        buttons.appendChild(confirmBtn);
        buttons.appendChild(cancelBtn);

        // 遮罩层点击关闭
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 10002;
        `;
        overlay.addEventListener('click', () => {
            overlay.remove();
            dialog.remove();
        });

        dialog.appendChild(title);
        dialog.appendChild(preview);
        dialog.appendChild(modeContainer);
        dialog.appendChild(buttons);

        document.body.appendChild(overlay);
        document.body.appendChild(dialog);
    }

    // 执行导入
    function executeImport(importedData, mode) {
        const importWatched = (importedData.watched || []).map(code => normalizeCode(code)).filter(code => code);
        const importWanted = (importedData.wanted || []).map(code => normalizeCode(code)).filter(code => code);

        let result = {
            watched: { before: 0, after: 0, added: 0 },
            wanted: { before: 0, after: 0, added: 0 }
        };

        if (mode === 'overwrite') {
            // 覆盖模式：直接替换，看过优先
            result.watched.before = getCachedValue(CONFIG.watchedStorageKey, []).length;
            result.wanted.before = getCachedValue(CONFIG.wantedStorageKey, []).length;

            // 看过优先：从想看中移除看过中已有的番号
            const watchedSet = new Set(importWatched);
            const finalWatched = [...new Set(importWatched)].sort();
            const finalWanted = importWanted.filter(code => !watchedSet.has(code)).sort();

            setCachedValue(CONFIG.watchedStorageKey, finalWatched);
            setCachedValue(CONFIG.wantedStorageKey, finalWanted);

            result.watched.after = finalWatched.length;
            result.wanted.after = finalWanted.length;
            result.watched.added = finalWatched.length;
            result.wanted.added = finalWanted.length;

        } else {
            // 合并模式：合并、去重并排序
            const currentWatched = getCachedValue(CONFIG.watchedStorageKey, []);
            const currentWanted = getCachedValue(CONFIG.wantedStorageKey, []);

            result.watched.before = currentWatched.length;
            result.wanted.before = currentWanted.length;

            // 合并看过列表
            const mergedWatched = [...new Set([...currentWatched, ...importWatched])].sort();

            // 合并想看列表
            const mergedWanted = [...new Set([...currentWanted, ...importWanted])].sort();

            // 看过优先：从想看中移除看过中已有的番号
            const watchedSet = new Set(mergedWatched);
            const finalWanted = mergedWanted.filter(code => !watchedSet.has(code)).sort();

            setCachedValue(CONFIG.watchedStorageKey, mergedWatched);
            setCachedValue(CONFIG.wantedStorageKey, finalWanted);

            result.watched.after = mergedWatched.length;
            result.wanted.after = finalWanted.length;
            result.watched.added = mergedWatched.length - currentWatched.length;
            result.wanted.added = finalWanted.length - currentWanted.length;

            debugLog(`合并完成 - 看过: ${result.watched.before} -> ${result.watched.after}, 想看: ${result.wanted.before} -> ${result.wanted.after}`);
        }

        // 更新UI
        updateGlobalCount();

        // 重新应用屏蔽效果
        setTimeout(() => {
            applyBlockEffect();
        }, 100);

        // 显示结果
        const totalAdded = result.watched.added + result.wanted.added;
        const totalAfter = result.watched.after + result.wanted.after;

        showImportResult(result, mode, totalAdded, totalAfter);

        debugLog('导入完成:', { mode, result });
    }

    // 显示导入结果
    function showImportResult(result, mode, totalAdded, totalAfter) {
        const modeText = mode === 'overwrite' ? '覆盖' : '合并';

        // 使用 io-result 区域显示结果
        const ioResult = document.getElementById('io-result');
        if (ioResult) {
            ioResult.style.display = 'block';
            ioResult.style.background = 'rgba(39, 174, 96, 0.2)';
            ioResult.style.border = '1px solid rgba(39, 174, 96, 0.5)';
            ioResult.style.color = '#27ae60';

            ioResult.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 8px; text-align: center;">✅ 导入完成 (${modeText}模式)</div>
                <div style="display: flex; justify-content: space-around; margin-bottom: 5px;">
                    <div>看过: ${result.watched.before} → ${result.watched.after} <span style="color: #2ecc71;">(+${result.watched.added})</span></div>
                    <div>想看: ${result.wanted.before} → ${result.wanted.after} <span style="color: #2ecc71;">(+${result.wanted.added})</span></div>
                </div>
                <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 5px;">
                    共导入 ${totalAdded} 个新番号，总计 ${totalAfter} 个
                </div>
            `;

            // 5秒后自动隐藏
            setTimeout(() => {
                ioResult.style.display = 'none';
            }, 5000);
        }

        showMessage(`导入完成！新增 ${totalAdded} 个番号`, 'success');
    }

    // 绑定影片详情页的想看/看過按钮
    function bindVideoDetailButtons(retryCount = 0) {
        debugLog('绑定影片详情页按钮');

        // 获取当前影片番号
        const videoCode = getCurrentVideoCode();
        if (!videoCode) {
            debugLog('无法获取当前影片番号');
            // 重试机制：如果获取失败，延迟重试（最多5次）
            if (retryCount < 5) {
                setTimeout(() => bindVideoDetailButtons(retryCount + 1), 500);
            }
            return;
        }

        debugLog(`当前影片番号: ${videoCode}`);

        // === 自动检测页面标签并同步 ===
        const reviewTitles = document.querySelectorAll('.review-title');
        let autoSynced = false;
        reviewTitles.forEach(title => {
            const text = title.textContent.trim();
            if (text.includes('我看過這部影片')) {
                debugLog('检测到“我看過”标签，自动同步');
                addVideoToList(videoCode, 'watched', false);
                autoSynced = true;
            } else if (text.includes('我想看這部影片')) {
                debugLog('检测到“我想看”标签，自动同步');
                addVideoToList(videoCode, 'wanted', false);
                autoSynced = true;
            }
        });

        // 绑定"想看"按钮
        const wantButton = document.querySelector('form.button_to[action*="/reviews/want_to_watch"] button') ||
            Array.from(document.querySelectorAll('button')).find(btn => btn.textContent?.includes('想看'));

        if (wantButton && !wantButton.hasAttribute('data-javdb-manager-bound')) {
            wantButton.setAttribute('data-javdb-manager-bound', 'true');
            wantButton.addEventListener('click', (e) => {
                debugLog('点击了想看按钮，添加到想看列表');
                addVideoToList(videoCode, 'wanted');
            });
            debugLog('已绑定想看按钮');
        }

        // 绑定"看過"按钮
        const watchedButton = document.querySelector('form.button_to[action*="/reviews/watched"] button') ||
            Array.from(document.querySelectorAll('button')).find(btn => btn.textContent?.includes('看過'));

        if (watchedButton && !watchedButton.hasAttribute('data-javdb-manager-bound')) {
            watchedButton.setAttribute('data-javdb-manager-bound', 'true');
            watchedButton.addEventListener('click', (e) => {
                debugLog('点击了看過按钮，添加到看过列表');
                addVideoToList(videoCode, 'watched');
            });
            debugLog('已绑定看過按钮');
        }

        // 绑定"刪除"按钮
        const deleteButton = document.querySelector('a.button.is-danger[data-method="delete"]') ||
            Array.from(document.querySelectorAll('a.button')).find(btn => btn.textContent?.includes('刪除') || btn.textContent?.includes('删除'));

        if (deleteButton && !deleteButton.hasAttribute('data-javdb-manager-bound')) {
            deleteButton.setAttribute('data-javdb-manager-bound', 'true');
            deleteButton.addEventListener('click', (e) => {
                debugLog(`点击了详情页删除按钮，番号: ${videoCode}`);
                const removed = removeVideoFromList(videoCode);
                if (removed) {
                    debugLog(`成功从本地数据库移除番号: ${videoCode}`);
                }

                debugLog('准备刷新页面...');
                // 延迟1秒让网站先执行删除操作
                setTimeout(() => {
                    debugLog('删除操作完成，刷新页面');
                    window.location.reload();
                }, 1000);
            });
            debugLog('已绑定删除按钮');
        }
    }

    // 获取当前影片番号（详情页面）
    function getCurrentVideoCode() {
        const titleElement = document.querySelector('h2.title') || document.querySelector('h2[class*="title"]');
        const code = extractCodeFromTitleElement(titleElement);
        if (!code) debugLog('无法从详情页面提取番号');
        return code;
    }

    // 添加影片到列表
    // listType: 'watched' 或 'wanted'
    // isSilent: 是否静默处理（不弹出提示）
    function addVideoToList(videoCode, listType, isSilent = false) {
        // 标准化番号
        const normalizedCode = normalizeCode(videoCode);
        if (!normalizedCode) return;

        debugLog(`尝试同步番号 ${normalizedCode} 到 ${listType} 列表 (静默: ${isSilent})`);

        const storageKey = listType === 'watched' ? CONFIG.watchedStorageKey : CONFIG.wantedStorageKey;
        const oppositeKey = listType === 'watched' ? CONFIG.wantedStorageKey : CONFIG.watchedStorageKey;

        // 获取现有列表（使用缓存）
        let currentList = getCachedValue(storageKey, []);
        let oppositeList = getCachedValue(oppositeKey, []);

        // 检查状态
        const alreadyInCurrent = findMatchingCode(normalizedCode, currentList);
        const alreadyInOpposite = findMatchingCode(normalizedCode, oppositeList);

        // 如果已经在当前列表且不在对面列表，无需任何操作
        if (alreadyInCurrent && !alreadyInOpposite) {
            debugLog(`番号 ${normalizedCode} 已在目标列表且无冲突，无需操作`);
            return;
        }

        let hasChanged = false;

        // 强制二选一逻辑：如果存在于对面列表，必须移除（以最后一次存入为准）
        if (alreadyInOpposite) {
            oppositeList = oppositeList.filter(code => !isCodeMatch(code, normalizedCode)).sort();
            setCachedValue(oppositeKey, oppositeList);
            hasChanged = true;
            debugLog(`从对侧列表 (${listType === 'watched' ? '想看' : '看过'}) 移除冲突项: ${normalizedCode}`);
        }

        // 如果不在当前列表，则添加
        if (!alreadyInCurrent) {
            currentList.push(normalizedCode);
            setCachedValue(storageKey, currentList.sort());
            hasChanged = true;
            debugLog(`添加到当前列表 (${listType}): ${normalizedCode}`);
        }

        if (hasChanged) {
            // 更新UI计数和页面效果
            updateGlobalCount();
            setTimeout(() => applyBlockEffect(), 100);

            if (!isSilent) {
                const msg = alreadyInOpposite
                    ? `番号 ${normalizedCode} 已从${listType === 'watched' ? '想看' : '看过'}移除并更新到${listType === 'watched' ? '看过' : '想看'}`
                    : `番号 ${normalizedCode} 已添加到${listType === 'watched' ? '看过' : '想看'}列表`;
                showMessage(msg, 'success');
            }
            debugLog(`成功完成同步: ${normalizedCode}`);
        }
    }

    // 从列表中移除影片
    function removeVideoFromList(videoCode) {
        // 标准化番号
        const normalizedCode = normalizeCode(videoCode);
        if (!normalizedCode) return false;

        debugLog(`尝试从所有列表中移除番号: ${normalizedCode}`);

        const watchedCodes = getCachedValue(CONFIG.watchedStorageKey, []);
        const wantedCodes = getCachedValue(CONFIG.wantedStorageKey, []);

        let hasChanged = false;

        // 从看过列表中移除
        const newWatchedCodes = watchedCodes.filter(code => !isCodeMatch(code, normalizedCode));
        if (newWatchedCodes.length !== watchedCodes.length) {
            setCachedValue(CONFIG.watchedStorageKey, newWatchedCodes);
            hasChanged = true;
            debugLog(`从看过列表中移除: ${normalizedCode}`);
        }

        // 从想看列表中移除
        const newWantedCodes = wantedCodes.filter(code => !isCodeMatch(code, normalizedCode));
        if (newWantedCodes.length !== wantedCodes.length) {
            setCachedValue(CONFIG.wantedStorageKey, newWantedCodes);
            hasChanged = true;
            debugLog(`从想看列表中移除: ${normalizedCode}`);
        }

        if (hasChanged) {
            updateGlobalCount();
            setTimeout(() => applyBlockEffect(), 100);
            return true;
        }

        return false;
    }

    // 清理函数，在页面卸载时调用
    window.addEventListener('beforeunload', () => {
        if (pageObserver) pageObserver.disconnect();
    });

})();
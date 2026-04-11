// ==UserScript==
// @name         VIP视频解析器
// @namespace    https://github.com/RiTian96/SurfHelper
// @version      1.6.2
// @description  [核心] 多平台VIP视频解析，支持腾讯/爱奇艺/优酷/B站/芒果TV，自动切换可用接口；[辅助] 接口评分排序、一键切换下一接口；[UI] 玻璃拟态风格
// @author       RiTian96
// @match        *://v.qq.com/*
// @match        *://*.iqiyi.com/*
// @match        *://*.youku.com/*
// @match        *://*.bilibili.com/*
// @match        *://*.mgtv.com/*
// @icon         https://v.qq.com/favicon.ico
// @icon         https://www.google.com/s2/favicons?sz=64&domain=v.qq.com
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-start
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/vip-video-parser.user.js
// @downloadURL  https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/vip-video-parser.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 只在顶层窗口运行，避免在iframe中重复创建面板
    if (window.top !== window.self) {
        return;
    }

    // === 工具函数 ===
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 解析接口列表
    const apiList = [
        {value: "https://jx.playerjy.com/?url=", label: "Player-JY"},
        {value: "https://jiexi.789jiexi.icu:4433/?url=", label: "789解析"},
        {value: "https://jx.2s0.cn/player/?url=", label: "极速解析"},
        {value: "https://bd.jx.cn/?url=", label: "冰豆解析"},
        {value: "https://jx.973973.xyz/?url=", label: "973解析"},
        {value: "https://jx.xmflv.com/?url=", label: "虾米视频解析"},
        {value: "https://jx.hls.one/?url=", label: "HLS解析"},
        {value: "https://www.ckplayer.vip/jiexi/?url=", label: "CK"},
        {value: "https://jx.nnxv.cn/tv.php?url=", label: "七哥解析"},
        {value: "https://www.yemu.xyz/?url=", label: "夜幕"},
        {value: "https://www.pangujiexi.com/jiexi/?url=", label: "盘古"},
        {value: "https://www.playm3u8.cn/jiexi.php?url=", label: "playm3u8"},
        {value: "https://jx.77flv.cc/?url=", label: "七七云解析"},
        {value: "https://video.isyour.love/player/getplayer?url=", label: "芒果TV1"},
        {value: "https://im1907.top/?jx=", label: "芒果TV2"}
    ];

    // 播放器容器选择器（按优先级排序）
    const playerContainerSelectors = [
        // 爱奇艺
        '.iqp-player',
        '.player-controls-wrap',
        // 腾讯视频
        '.txp_player_video_wrap',
        '.txp_video_container',
        // B站
        '#bilibili-player',
        '.bpx-player-container',
        '.bpx-player-wrap',
        // 芒果TV
        '.mango-layer',
        '#mgtv-player',
        '.mgtv-player',
        // 优酷
        '#player-wrapper',
        '.yk-player',
        // 通用
        '#flashbox',
        '.player-wrap',
        '#player-container',
        '#player',
        '.player-view'
    ];

    // 备用播放器容器（当主容器找不到时使用，需尺寸检测）
    const fallbackContainerSelectors = [
        'main',
        '.main-content',
        'article',
        '.content',
        'body'
    ];

    // 需要隐藏的元素选择器
    const nuisanceSelectors = [
        // 通用弹窗
        '#playerPopup',
        '#vipCoversBox',
        '.player-popup',
        // 爱奇艺
        'div.iqp-player-vipmask',
        'div.iqp-player-paymask',
        'div.iqp-player-loginmask',
        'div[class^=qy-header-login-pop]',
        '.iqp-player-guide',
        'div.m-iqyGuide-layer',
        '.loading_loading__vzq4j',
        '[class*="XPlayer_defaultCover__"]',
        '.iqp-controller',
        '.qy-dialog-container',
        '.iqp-player-overlay',
        // 腾讯视频
        '.txp_player_gift_overlay',
        '.txp_player_vip_tip',
        '.mod_copyright_tips',
        // B站
        '.bpx-player-ending-overlay',
        '.bilibili-player-video-dash',
        '.bilibili-player-alert-overlay',
        '[class*="player-mobile-tip"]',
        // 芒果TV
        '.mgtv-player-layers',
        '.mgtv-player-ad',
        '.mgtv-player-overlay',
        '#m-player-ad',
        '.notSupportedDrm_drmTipsPopBox',
        // 优酷
        '.covers_cloudCover__ILy8R',
        '.youku-player-vip-tip',
        '.yk-player-vip-overlay',
        // 通用
        '#videoContent > div.loading_loading__vzq4j',
        '[class*="popwin_fullCover"]',
        '[class*="shapedPopup_container"]',
        '[class*="floatPage_floatPage"]',
        '#tvgCashierPage',
        '.browser-ver-tip'
    ];

    // 原生视频选择器
    const nativeVideoSelectors = [
        'video',
        '.txp_video_container',
        '._ControlBar_1fux8_5',
        '.ControlBar',
        '[class*="ControlBar"]'
    ];

    // 本地存储键名
    const STORAGE_KEYS = {
        AUTO_PARSE: 'void_auto_parse',
        SELECTED_API: 'void_selected_api',
        API_SCORES: 'void_api_scores'
    };

    // 当前状态
    let currentApi = apiList[0].value;
    let guardianInterval = null;
    let isParsing = false;
    let autoParseEnabled = true;  // 默认开启自动解析
    let currentApiIndex = 0;
    let parseAttempts = 0;
    let panelCreated = false;
    let apiScores = {};
    let lastVideoUrl = '';  // 记录上一次的视频URL，用于检测剧集切换
    let loadingStartTime = 0;  // 记录加载开始时间
    let urlWatchInterval = null;  // URL监听定时器
    let eventListeners = [];  // 存储事件监听器引用

    // 创建UI（异步）
    async function createUI() {
        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .video-parser-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 999999;
                background: rgba(0, 0, 0, 0.3);
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border-radius: 16px;
                padding: 15px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                width: 280px;
                max-width: 280px;
                border: 1px solid rgba(255, 255, 255, 0.15);
                box-sizing: border-box;
                transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .video-parser-panel.minimized {
                width: 50px;
                height: 50px;
                padding: 0;
                min-width: 50px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }

            .video-parser-panel.minimized:hover {
                transform: scale(1.05);
                background: rgba(52, 55, 78, 0.9);
            }

            .video-parser-panel.minimized .panel-content {
                display: none;
            }

            .video-parser-panel.minimized .close-button {
                position: absolute;
                top: -5px;
                right: -5px;
                width: 20px;
                height: 20px;
                background: #f44336;
                border-radius: 50%;
                color: white;
                font-size: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                box-shadow: 0 2px 6px rgba(244, 67, 54, 0.4);
            }

            .video-parser-panel.minimized .parser-icon {
                display: block;
                font-size: 24px;
                color: #ff6768;
            }

            .video-parser-panel:not(.minimized) .parser-icon {
                display: none;
            }

            .video-parser-panel * {
                box-sizing: border-box;
            }

            .parser-header {
                color: #ff6768;
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 12px;
                text-align: center;
            }

            .parser-select {
                width: 100%;
                padding: 8px 12px;
                margin-bottom: 10px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                background: rgba(30, 30, 47, 0.8);
                color: #dcdce4;
                font-size: 14px;
                outline: none;
                transition: all 0.2s;
            }

            .parser-select:focus {
                border-color: #ff6768;
                box-shadow: 0 0 0 3px rgba(255, 103, 104, 0.2);
            }

            .parser-button {
                width: 100%;
                padding: 10px;
                background: linear-gradient(135deg, #ff6768 0%, #ff5252 100%);
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                box-shadow: 0 4px 12px rgba(255, 103, 104, 0.3);
            }

            .parser-button:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(255, 103, 104, 0.4);
            }

            .parser-button:active:not(:disabled) {
                transform: translateY(0);
            }

            .parser-button:disabled {
                background: #3a3d5b;
                cursor: not-allowed;
                box-shadow: none;
            }

            .parser-status {
                margin-top: 10px;
                padding: 8px;
                border-radius: 6px;
                font-size: 12px;
                text-align: center;
                display: none;
                width: 100%;
                min-height: 36px;
                word-wrap: break-word;
                overflow-wrap: break-word;
            }

            .parser-status.success {
                background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
                color: white;
                display: block;
            }

            .parser-status.error {
                background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
                color: white;
                display: block;
            }

            .parser-status.loading {
                background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
                color: white;
                display: block;
                position: relative;
                overflow: hidden;
                animation: status-pulse 1.5s ease-in-out infinite;
            }

            @keyframes status-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.8; }
            }

            .parser-status.loading::after {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                animation: loading-shimmer 1.5s infinite;
            }

            @keyframes loading-shimmer {
                0% { left: -100%; }
                100% { left: 100%; }
            }

            .parser-progress {
                margin-top: 5px;
                height: 3px;
                background: rgba(255,255,255,0.2);
                border-radius: 2px;
                overflow: hidden;
                display: none;
            }

            .parser-progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #4caf50 0%, #8bc34a 100%);
                border-radius: 2px;
                width: 0%;
                transition: width 0.3s ease;
            }

            .parser-tips {
                margin-top: 8px;
                padding: 6px;
                background: rgba(255,255,255,0.05);
                border-radius: 6px;
                font-size: 11px;
                color: #a0a0b8;
                text-align: center;
                border-left: 3px solid #ff6768;
            }

            .parser-toggle {
                display: flex;
                align-items: center;
                margin-bottom: 10px;
                font-size: 13px;
                color: #dcdce4;
            }

            .parser-toggle input[type="checkbox"] {
                margin-right: 8px;
                cursor: pointer;
                width: 16px;
                height: 16px;
                accent-color: #ff6768;
            }

            .parser-toggle label {
                cursor: pointer;
                user-select: none;
            }

            .parser-actions {
                display: flex;
                gap: 5px;
                margin-bottom: 10px;
            }

            .parser-action-btn {
                flex: 1;
                padding: 8px;
                background: rgba(58, 61, 91, 0.8);
                color: #dcdce4;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .parser-action-btn:hover {
                background: rgba(74, 77, 107, 0.9);
                transform: translateY(-1px);
            }

            .parser-action-btn:active {
                transform: translateY(0);
            }

            .parser-action-btn.next-btn {
                background: linear-gradient(135deg, #ff6768 0%, #ff5252 100%);
                color: white;
                border: none;
                box-shadow: 0 2px 8px rgba(255, 103, 104, 0.3);
            }

            .parser-action-btn.next-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(255, 103, 104, 0.4);
            }

            .parser-score {
                font-size: 11px;
                color: #a0a0b8;
                text-align: center;
                margin-top: 5px;
            }

            .parser-vote {
                display: flex;
                justify-content: center;
                gap: 10px;
                margin-top: 5px;
            }

            .vote-btn {
                background: rgba(58, 61, 91, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 12px;
                cursor: pointer;
                color: #a0a0b8;
                transition: all 0.2s;
            }

            .vote-btn:hover {
                border-color: #ff6768;
                color: #ff6768;
                transform: scale(1.05);
            }

            .vote-btn.liked {
                background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
                border-color: #4caf50;
                color: white;
            }

            .vote-btn.disliked {
                background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
                border-color: #f44336;
                color: white;
            }

            .close-button {
                position: absolute;
                top: 8px;
                right: 8px;
                background: none;
                border: none;
                color: #a0a0b8;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                line-height: 20px;
                text-align: center;
                transition: color 0.2s, transform 0.2s;
            }

            .close-button:hover {
                color: #ff6768;
                transform: scale(1.2);
            }

            .void-player-iframe {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                border: none !important;
                z-index: 9999 !important;
            }

            /* 防止iframe中的脚本影响主页面 */
            .void-player-iframe ~ .video-parser-panel {
                display: none !important;
            }

            /* 移动端适配 */
            @media (max-width: 480px) {
                .video-parser-panel {
                    width: calc(100vw - 20px);
                    max-width: calc(100vw - 20px);
                    right: 10px;
                    left: 10px;
                }
            }
        `;
        document.head.appendChild(style);

        // 加载API评分
        await loadApiScores();

        // 按评分排序接口列表
        const sortedApiList = sortApiListByScore();

        // 检查是否已存在面板
        let panel = document.querySelector('.video-parser-panel');
        if (!panel) {
            // 创建面板
            panel = document.createElement('div');
            panel.className = 'video-parser-panel minimized';
            panel.innerHTML = `
                <div class="parser-icon">🎬</div>
                <button class="close-button" onclick="this.parentElement.remove()">&times;</button>
                <div class="panel-content">
                    <div class="parser-header">视频解析器</div>
                    <div class="parser-toggle">
                        <input type="checkbox" id="auto-parse-toggle">
                        <label for="auto-parse-toggle">自动解析</label>
                    </div>
                    <select class="parser-select" id="parser-api-select">
                        ${sortedApiList.map(api => `<option value="${api.value}" data-label="${api.label}">${api.label} (${getApiScore(api.value)})</option>`).join('')}
                    </select>
                    <div class="parser-actions">
                        <button class="parser-action-btn next-btn" id="next-api-btn">下一个</button>
                        <button class="parser-action-btn" id="like-btn">👍</button>
                        <button class="parser-action-btn" id="dislike-btn">👎</button>
                    </div>
                    <button class="parser-button" id="parser-button">开始解析</button>
                    <div class="parser-status" id="parser-status"></div>
                <div class="parser-progress" id="parser-progress">
                    <div class="parser-progress-bar" id="parser-progress-bar"></div>
                </div>
                </div>
            `;
            document.body.appendChild(panel);

            // 添加点击小图标展开/收起的交互
            panel.addEventListener('click', function(e) {
                // 如果点击的是关闭按钮，不处理
                if (e.target.classList.contains('close-button')) {
                    return;
                }
                
                // 如果面板已最小化，则展开
                if (panel.classList.contains('minimized')) {
                    panel.classList.remove('minimized');
                }
                // 如果点击的是面板内容区域且不是输入元素，则最小化
                else if (!e.target.closest('.panel-content') || 
                         (e.target.closest('.panel-content') && 
                          !['INPUT', 'SELECT', 'BUTTON', 'OPTION'].includes(e.target.tagName))) {
                    panel.classList.add('minimized');
                }
            });
        }

        // 加载保存的设置
        await loadSettings();

        // 绑定事件并存储引用
        function bindEvents() {
            // 清理之前的事件监听器
            cleanupEventListeners();
            
            const apiSelect = document.getElementById('parser-api-select');
            if (apiSelect) {
                const apiSelectHandler = async (e) => {
                    currentApi = e.target.value;
                    currentApiIndex = apiList.findIndex(api => api.value === currentApi);
                    await saveSettings();
                };
                apiSelect.addEventListener('change', apiSelectHandler);
                eventListeners.push({ element: apiSelect, event: 'change', handler: apiSelectHandler });
            }

            const parseButton = document.getElementById('parser-button');
            if (parseButton) {
                const parseButtonHandler = () => startParse();
                parseButton.addEventListener('click', parseButtonHandler);
                eventListeners.push({ element: parseButton, event: 'click', handler: parseButtonHandler });
            }

            const autoParseToggle = document.getElementById('auto-parse-toggle');
            if (autoParseToggle) {
                const autoParseHandler = async (e) => {
                    autoParseEnabled = e.target.checked;
                    await saveSettings();
                    if (autoParseEnabled && isVideoPage() && shouldAutoParse() && !isParsing) {
                        setTimeout(() => {
                            startAutoParse();
                        }, 1000);
                    }
                };
                autoParseToggle.addEventListener('change', autoParseHandler);
                eventListeners.push({ element: autoParseToggle, event: 'change', handler: autoParseHandler });
            }

            const nextApiBtn = document.getElementById('next-api-btn');
            if (nextApiBtn) {
                const nextApiHandler = async () => {
                    await switchToNextApi();
                };
                nextApiBtn.addEventListener('click', nextApiHandler);
                eventListeners.push({ element: nextApiBtn, event: 'click', handler: nextApiHandler });
            }

            const likeBtn = document.getElementById('like-btn');
            if (likeBtn) {
                const likeHandler = async () => {
                    await voteApi(currentApi, 1);
                };
                likeBtn.addEventListener('click', likeHandler);
                eventListeners.push({ element: likeBtn, event: 'click', handler: likeHandler });
            }

            const dislikeBtn = document.getElementById('dislike-btn');
            if (dislikeBtn) {
                const dislikeHandler = async () => {
                    await voteApi(currentApi, -1);
                };
                dislikeBtn.addEventListener('click', dislikeHandler);
                eventListeners.push({ element: dislikeBtn, event: 'click', handler: dislikeHandler });
            }
        }
        
        bindEvents();
    }

    // 显示状态
    function showStatus(message, type, options = {}) {
        const statusEl = document.getElementById('parser-status');
        const progressEl = document.getElementById('parser-progress');
        const progressBarEl = document.getElementById('parser-progress-bar');
        
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `parser-status ${type}`;
            
            // 处理进度条
            if (type === 'loading') {
                progressEl.style.display = 'block';
                if (options.progress !== undefined) {
                    progressBarEl.style.width = `${options.progress}%`;
                } else {
                    // 模拟进度
                    let progress = 0;
                    const progressInterval = setInterval(() => {
                        progress += Math.random() * 15;
                        if (progress > 90) progress = 90;
                        progressBarEl.style.width = `${progress}%`;
                        if (progress >= 90) clearInterval(progressInterval);
                    }, 300);
                }
                
                // 记录加载开始时间
                if (!loadingStartTime) {
                    loadingStartTime = Date.now();
                }
            } else {
                progressEl.style.display = 'none';
                progressBarEl.style.width = '0%';
                loadingStartTime = 0;
            }
        }
    }

    // 保存设置（跨域统一存储）
    async function saveSettings() {
        try {
            await GM_setValue(STORAGE_KEYS.AUTO_PARSE, autoParseEnabled);
            await GM_setValue(STORAGE_KEYS.SELECTED_API, currentApi);
            await GM_setValue(STORAGE_KEYS.API_SCORES, apiScores);
        } catch (e) {
            console.warn('无法保存设置:', e);
        }
    }

    // 加载设置（跨域统一存储）
    async function loadSettings() {
        try {
            const savedAutoParse = await GM_getValue(STORAGE_KEYS.AUTO_PARSE, true);  // 默认为true
            const savedApi = await GM_getValue(STORAGE_KEYS.SELECTED_API, apiList[0].value);

            autoParseEnabled = savedAutoParse;
            const toggle = document.getElementById('auto-parse-toggle');
            if (toggle) toggle.checked = autoParseEnabled;

            const apiIndex = apiList.findIndex(api => api.value === savedApi);
            if (apiIndex !== -1) {
                currentApi = savedApi;
                currentApiIndex = apiIndex;
                const select = document.getElementById('parser-api-select');
                if (select) select.value = savedApi;
            }
        } catch (e) {
            console.warn('无法加载设置:', e);
            // 如果加载失败，确保自动解析是开启的
            autoParseEnabled = true;
            const toggle = document.getElementById('auto-parse-toggle');
            if (toggle) toggle.checked = autoParseEnabled;
        }
    }

    // 加载API评分（跨域统一存储）
    async function loadApiScores() {
        try {
            const savedScores = await GM_getValue(STORAGE_KEYS.API_SCORES, null);
            if (savedScores) {
                apiScores = savedScores;
            } else {
                apiScores = {};
                apiList.forEach(api => {
                    apiScores[api.value] = 0;
                });
            }
        } catch (e) {
            console.warn('无法加载API评分:', e);
            apiScores = {};
            apiList.forEach(api => {
                apiScores[api.value] = 0;
            });
        }
    }

    // 获取API评分
    function getApiScore(apiUrl) {
        return apiScores[apiUrl] || 0;
    }

    // 更新API评分
    async function updateApiScore(apiUrl, delta) {
        if (!apiScores[apiUrl]) {
            apiScores[apiUrl] = 0;
        }
        apiScores[apiUrl] += delta;
        await saveSettings();
        updateApiSelectOptions();
    }

    // 投票
    async function voteApi(apiUrl, vote) {
        await updateApiScore(apiUrl, vote);
        showStatus(vote > 0 ? '点赞成功！' : '点踩成功！', 'success');
    }

    // 按评分排序接口列表
    function sortApiListByScore() {
        return [...apiList].sort((a, b) => {
            const scoreA = getApiScore(a.value);
            const scoreB = getApiScore(b.value);
            return scoreB - scoreA;
        });
    }

    // 更新接口选择框选项
    function updateApiSelectOptions() {
        const select = document.getElementById('parser-api-select');
        if (!select) return;

        const currentValue = select.value;
        const sortedList = sortApiListByScore();

        select.innerHTML = sortedList.map(api =>
            `<option value="${api.value}">${api.label} (${getApiScore(api.value)})</option>`
        ).join('');

        select.value = currentValue;
    }

    // 切换到下一个接口
    async function switchToNextApi() {
        // 保存当前接口（被切走的接口）
        const previousApi = currentApi;

        currentApiIndex = (currentApiIndex + 1) % apiList.length;
        currentApi = apiList[currentApiIndex].value;

        const select = document.getElementById('parser-api-select');
        if (select) {
            select.value = currentApi;
        }

        // 给被切走的接口减分（因为不好用才切换）
        await updateApiScore(previousApi, -1);
        await saveSettings();

        showStatus(`已切换到: ${apiList[currentApiIndex].label}`, 'success');

        // 停止所有原生视频播放
        document.querySelectorAll('video').forEach(video => {
            if (!video.paused) video.pause();
        });

        // 自动开始解析新接口
        setTimeout(() => {
            startParse();
        }, 500);
    }

    // 检测是否在视频页面
    function isVideoPage() {
        const url = window.location.href;
        return (
            (url.includes('iqiyi.com/v_') && url.includes('.html')) ||
            url.includes('v.qq.com/x/cover/') ||
            url.includes('mgtv.com/b/') ||
            (url.includes('bilibili.com/bangumi/play/')) ||
            (url.includes('bilibili.com/video/')) || // 普通视频也显示面板，但不自动解析
            url.includes('youku.com/v_show/')
        );
    }

    // 检测是否应该自动解析
    function shouldAutoParse() {
        const url = window.location.href;
        // B站番剧页面自动解析
        if (url.includes('bilibili.com/bangumi/play/')) {
            return true;
        }
        // B站普通视频不自动解析
        if (url.includes('bilibili.com/video/')) {
            return false;
        }
        // 其他平台正常自动解析
        return true;
    }

    // 获取当前视频URL
    function getCurrentVideoUrl() {
        return window.location.href;
    }

    // 开始解析（手动）
    function startParse() {
        if (isParsing) return;
        parseAttempts = 0;
        doParse();
    }

    // 开始自动解析
    function startAutoParse() {
        // 自动解析也使用同样的逻辑
        if (isParsing) return;
        parseAttempts = 0;
        doParse();
    }

    // 执行解析（统一入口）
    async function doParse() {
        const videoUrl = getCurrentVideoUrl();
        if (!videoUrl) {
            showStatus('无法获取视频URL', 'error', { persistent: true });
            return;
        }

        isParsing = true;
        const button = document.getElementById('parser-button');
        if (button) {
            button.disabled = true;
            button.textContent = '解析中...';
        }

        // 立即显示加载状态
        showStatus(`正在使用 ${apiList[currentApiIndex].label} 解析...`, 'loading');

        try {
            // 拼接解析URL
            const parseUrl = currentApi + encodeURIComponent(videoUrl);

            // 注入播放器
            await injectPlayer(parseUrl);

            // 解析成功，增加评分
            await updateApiScore(currentApi, 1);
            await saveSettings();

            showStatus('解析成功！正在播放...', 'success');
        } catch (error) {
            console.error('解析失败:', error);

            let errorMessage = '解析失败';

            if (error.message.includes('网络') || error.message.includes('Failed to fetch') || error.message.includes('net::')) {
                errorMessage = '网络连接失败，请检查网络';
            } else if (error.message.includes('超时') || error.message.includes('timeout')) {
                errorMessage = '解析超时，请重试';
            } else if (error.message.includes('播放器容器') || error.message.includes('未找到')) {
                errorMessage = '页面结构变化，请刷新页面后重试';
            } else {
                errorMessage = `解析失败: ${error.message}`;
            }

            // 自动切换接口重试
            if (parseAttempts < apiList.length - 1) {
                parseAttempts++;

                const failedApi = currentApi;
                currentApiIndex = (currentApiIndex + 1) % apiList.length;
                currentApi = apiList[currentApiIndex].value;

                const select = document.getElementById('parser-api-select');
                if (select) select.value = currentApi;

                await updateApiScore(failedApi, -1);
                await saveSettings();

                showStatus(`${errorMessage}，自动切换到 ${apiList[currentApiIndex].label}...`, 'loading');
                setTimeout(() => doParse(), 1000);
                return;
            } else {
                showStatus(`${errorMessage} (已尝试 ${parseAttempts + 1} 个接口)`, 'error', { persistent: true });
            }
        }

        // 恢复按钮状态
        isParsing = false;
        if (button) {
            button.disabled = false;
            button.textContent = '开始解析';
        }
    }

    // 清除解析
    function clearParse() {
        if (guardianInterval) {
            clearInterval(guardianInterval);
            guardianInterval = null;
        }

        // 移除之前的iframe
        const oldIframe = document.getElementById('void-player-iframe');
        if (oldIframe) {
            oldIframe.remove();
        }

        // 恢复被隐藏的元素
        document.querySelectorAll(nuisanceSelectors.join(',')).forEach(el => {
            el.style.display = '';
        });
        document.querySelectorAll(nativeVideoSelectors.join(',')).forEach(el => {
            el.style.display = '';
        });

        // 清除加载状态
        loadingStartTime = 0;
        isParsing = false;
    }

    // 注入播放器
    async function injectPlayer(parseUrl) {
        // 查找播放器容器
        let playerContainer = null;
        for (const selector of playerContainerSelectors) {
            playerContainer = document.querySelector(selector);
            if (playerContainer) break;
        }

        if (!playerContainer) {
            // 使用备用容器列表（带尺寸检测）
            for (const selector of fallbackContainerSelectors) {
                playerContainer = document.querySelector(selector);
                if (playerContainer && playerContainer.offsetWidth > 300 && playerContainer.offsetHeight > 200) {
                    console.log(`使用备用容器: ${selector}`);
                    break;
                }
            }
        }

        // 最后的兜底：查找任何足够大的 div
        if (!playerContainer) {
            const allDivs = document.querySelectorAll('div');
            for (const div of allDivs) {
                const rect = div.getBoundingClientRect();
                if (rect.width > 400 && rect.height > 300) {
                    playerContainer = div;
                    console.log(`使用动态检测容器: <div> ${rect.width}x${rect.height}`);
                    break;
                }
            }
        }

        if (!playerContainer) {
            throw new Error('未找到播放器容器，可能是不支持的视频页面');
        }

        // 移除之前的iframe
        const existingIframe = document.getElementById('void-player-iframe');
        if (existingIframe) {
            existingIframe.remove();
        }

        // 创建iframe
        const iframe = document.createElement('iframe');
        iframe.id = 'void-player-iframe';
        iframe.src = parseUrl;
        iframe.className = 'void-player-iframe';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;

        // 添加错误处理
        iframe.onerror = () => {
            console.error('iframe加载失败');
            showStatus('解析接口加载失败，请尝试其他接口', 'error', { persistent: true });
            isParsing = false;
            const button = document.getElementById('parser-button');
            if (button) {
                button.disabled = false;
                button.textContent = '开始解析';
            }
        };

        // 添加到容器
        playerContainer.appendChild(iframe);

        // 启动守护进程
        startGuardian();
    }

    // 守护进程 - 持续隐藏广告和原生播放器（自适应轮询）
    function startGuardian() {
        let pollCount = 0;
        const FAST_INTERVAL = 50;   // 前5秒用50ms高频探测
        const SLOW_INTERVAL = 250; // 之后用250ms
        const FAST_DURATION = 100;  // 100 * 50ms = 5秒

        if (guardianInterval) {
            clearInterval(guardianInterval);
        }

        guardianInterval = setInterval(() => {
            pollCount++;

            // 隐藏广告元素
            document.querySelectorAll(nuisanceSelectors.join(',')).forEach(el => {
                if (el.style.display !== 'none') el.style.display = 'none';
            });

            // 隐藏原生视频并停止播放
            document.querySelectorAll(nativeVideoSelectors.join(',')).forEach(el => {
                if (el.style.display !== 'none') el.style.display = 'none';
                if (el.tagName === 'VIDEO' && !el.paused) el.pause();
            });

            // 额外确保所有视频元素都停止播放
            document.querySelectorAll('video').forEach(video => {
                if (!video.paused) video.pause();
            });

            // 确保只显示一个面板
            const allPanels = document.querySelectorAll('.video-parser-panel');
            if (allPanels.length > 1) {
                for (let i = 1; i < allPanels.length; i++) {
                    allPanels[i].style.display = 'none';
                }
            }

            // 5秒后降频
            if (pollCount >= FAST_DURATION) {
                clearInterval(guardianInterval);
                guardianInterval = setInterval(arguments.callee, SLOW_INTERVAL);
            }
        }, FAST_INTERVAL);
    }

    // 监听URL变化（针对SPA应用）- 使用 History API + 防抖
    function setupHistoryListeners() {
        let lastUrl = window.location.href;

        // 检测是否为剧集切换
        function isEpisodeSwitch(oldUrl, newUrl) {
            // 爱奇艺剧集切换
            if (oldUrl.includes('iqiyi.com/v_') && newUrl.includes('iqiyi.com/v_')) {
                const oldEpisode = oldUrl.match(/(\d+)\.html/)?.[1];
                const newEpisode = newUrl.match(/(\d+)\.html/)?.[1];
                return oldEpisode && newEpisode && oldEpisode !== newEpisode;
            }

            // 腾讯视频剧集切换
            if (oldUrl.includes('v.qq.com/x/cover/') && newUrl.includes('v.qq.com/x/cover/')) {
                const oldEpisode = oldUrl.match(/\/(\d+)\.html/)?.[1];
                const newEpisode = newUrl.match(/\/(\d+)\.html/)?.[1];
                return oldEpisode && newEpisode && oldEpisode !== newEpisode;
            }

            // 芒果TV剧集切换
            if (oldUrl.includes('mgtv.com/b/') && newUrl.includes('mgtv.com/b/')) {
                return oldUrl !== newUrl;
            }

            // B站番剧剧集切换
            if (oldUrl.includes('bilibili.com/bangumi/play/') && newUrl.includes('bilibili.com/bangumi/play/')) {
                return oldUrl !== newUrl;
            }

            return false;
        }

        // 处理URL变化的统一函数
        function handleUrlChange() {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                const wasEpisodeSwitch = isEpisodeSwitch(lastUrl, currentUrl);
                lastUrl = currentUrl;

                // URL变化时清除之前的解析（但如果在解析中则不清除）
                if (!isParsing) {
                    clearParse();

                    // 如果是剧集切换且开启了自动解析，自动重新解析
                    if (wasEpisodeSwitch && autoParseEnabled && shouldAutoParse()) {
                        console.log('检测到剧集切换，自动重新解析:', currentUrl);
                        setTimeout(() => {
                            startAutoParse();
                        }, 2000);
                    }
                }
            }
        }

        // 防抖版本的URL处理
        const debouncedHandleUrlChange = debounce(handleUrlChange, 500);

        // 拦截 history.pushState 和 history.replaceState
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function(...args) {
            originalPushState.apply(this, args);
            debouncedHandleUrlChange();
        };

        history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            debouncedHandleUrlChange();
        };

        // 监听 popstate 事件（浏览器前进后退）
        window.addEventListener('popstate', () => {
            debouncedHandleUrlChange();
        });

        // 备用：定时检查（针对某些不触发 pushState 的情况）
        if (urlWatchInterval) {
            clearInterval(urlWatchInterval);
        }
        urlWatchInterval = setInterval(() => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                handleUrlChange();
            }
        }, 2000); // 增加到2秒，减少不必要的检查
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 清理事件监听器
    function cleanupEventListeners() {
        eventListeners.forEach(({ element, event, handler }) => {
            if (element && handler) {
                element.removeEventListener(event, handler);
            }
        });
        eventListeners = [];
    }

    // 清理所有资源
    function cleanup() {
        cleanupEventListeners();
        if (guardianInterval) {
            clearInterval(guardianInterval);
            guardianInterval = null;
        }
        if (urlWatchInterval) {
            clearInterval(urlWatchInterval);
            urlWatchInterval = null;
        }
        clearParse();
    }

    async function init() {
        if (panelCreated) return;
        panelCreated = true;

        // 页面卸载时清理资源
        window.addEventListener('beforeunload', cleanup);

        await createUI();
        setupHistoryListeners();

        // 监听页面可见性变化（标签页切换回来时自动解析）
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // 页面从后台切换回来时检测（不清除旧解析，只在需要时重新触发）
                if (isVideoPage() && autoParseEnabled && shouldAutoParse() && !isParsing) {
                    // 检查是否已有有效的解析iframe
                    const existingIframe = document.getElementById('void-player-iframe');
                    if (!existingIframe || !existingIframe.src) {
                        // 延迟一点确保页面已完全加载
                        setTimeout(() => {
                            startAutoParse();
                        }, 1000);
                    }
                }
            }
        });

        // 如果是视频页面且开启了自动解析
        if (isVideoPage() && autoParseEnabled && shouldAutoParse()) {
            // 等待页面完全加载后再解析
            setTimeout(() => {
                // 再次检查是否已解析
                const existingIframe = document.getElementById('void-player-iframe');
                if (!existingIframe || !existingIframe.src) {
                    startAutoParse();
                }
            }, 3000);
        } else if (isVideoPage()) {
            // 显示不同的提示信息
            const url = window.location.href;
            let message = '检测到视频页面，点击"开始解析"即可播放';
            if (url.includes('bilibili.com/video/')) {
                message = '检测到B站普通视频，可手动点击"开始解析"（番剧页面会自动解析）';
            }
            setTimeout(() => {
                // 只在没有解析状态时显示提示
                const statusEl = document.getElementById('parser-status');
                if (statusEl && !statusEl.textContent) {
                    showStatus(message, 'success');
                }
            }, 1500);
        }
    }

    

})();
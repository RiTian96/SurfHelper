// ==UserScript==
// @name         Video Parser - 视频解析器
// @namespace    https://github.com/RiTian96/SurfHelper
// @version      1.0.0
// @description  支持多平台的视频解析工具，集成15+个解析接口（跨域统一配置）
// @author       RiTian96
// @match        *://v.qq.com/*
// @match        *://*.iqiyi.com/*
// @match        *://*.youku.com/*
// @match        *://*.bilibili.com/*
// @match        *://*.mgtv.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 只在顶层窗口运行，避免在iframe中重复创建面板
    if (window.top !== window.self) {
        return;
    }

    // 解析接口列表
    const apiList = [
        {value: "https://jx.playerjy.com/?url=", label: "Player-JY"},
        {value: "https://jiexi.789jiexi.icu:4433/?url=", label: "789解析"},
        {value: "https://jx.2s0.cn/player/?url=", label: "极速解析"},
        {value: "https://bd.jx.cn/?url=", label: "冰豆解析"},
        {value: "https://jx.973973.xyz/?url=", label: "973解析"},
        {value: "https://jx.xmflv.com/?url=", label: "虾米视频解析"},
        {value: "https://jx.hls.one/?url=", label: "虾米2"},
        {value: "https://www.ckplayer.vip/jiexi/?url=", label: "CK"},
        {value: "https://jx.nnxv.cn/tv.php?url=", label: "七哥解析"},
        {value: "https://www.yemu.xyz/?url=", label: "夜幕"},
        {value: "https://www.pangujiexi.com/jiexi/?url=", label: "盘古"},
        {value: "https://www.playm3u8.cn/jiexi.php?url=", label: "playm3u8"},
        {value: "https://jx.77flv.cc/?url=", label: "七七云解析"},
        {value: "https://video.isyour.love/player/getplayer?url=", label: "芒果TV1"},
        {value: "https://im1907.top/?jx=", label: "芒果TV2"},
        {value: "https://jx.hls.one/?url=", label: "HLS解析"}
    ];

    // 播放器容器选择器（按优先级排序）
    const playerContainerSelectors = [
        '.iqp-player',           // 爱奇艺
        '#flashbox',             // 通用
        '.txp_player_video_wrap', // 腾讯视频
        '#bilibili-player',      // B站
        '.mango-layer',          // 芒果TV
        '#mgtv-player',          // 芒果TV
        '.mgtv-player',          // 芒果TV
        '.player-wrap',          // 通用
        '#player-container',     // 通用
        '#player',               // 通用
        '.player-container',     // 通用
        '.player-view'           // 通用
    ];

    // 需要隐藏的元素选择器
    const nuisanceSelectors = [
        '#playerPopup',
        '#vipCoversBox',
        'div.iqp-player-vipmask',
        'div.iqp-player-paymask',
        'div.iqp-player-loginmask',
        'div[class^=qy-header-login-pop]',
        '.covers_cloudCover__ILy8R',
        '#videoContent > div.loading_loading__vzq4j',
        '.iqp-player-guide',
        'div.m-iqyGuide-layer',
        '.loading_loading__vzq4j',
        '[class*="XPlayer_defaultCover__"]',
        '.iqp-controller'
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
                background: #2a2d42;
                border-radius: 8px;
                padding: 15px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                min-width: 250px;
                border: 1px solid #3a3d5b;
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
                border: 1px solid #3a3d5b;
                border-radius: 4px;
                background: #1e1e2f;
                color: #dcdce4;
                font-size: 14px;
                outline: none;
                transition: border-color 0.2s;
            }

            .parser-select:focus {
                border-color: #ff6768;
            }

            .parser-button {
                width: 100%;
                padding: 10px;
                background: #ff6768;
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                transition: background 0.2s;
            }

            .parser-button:hover {
                background: #e55a5b;
            }

            .parser-button:disabled {
                background: #3a3d5b;
                cursor: not-allowed;
            }

            .parser-status {
                margin-top: 10px;
                padding: 8px;
                border-radius: 4px;
                font-size: 12px;
                text-align: center;
                display: none;
            }

            .parser-status.success {
                background: #4caf50;
                color: white;
                display: block;
            }

            .parser-status.error {
                background: #f44336;
                color: white;
                display: block;
            }

            .parser-status.loading {
                background: #2196f3;
                color: white;
                display: block;
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
                background: #3a3d5b;
                color: #dcdce4;
                border: none;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                transition: background 0.2s;
            }

            .parser-action-btn:hover {
                background: #4a4d6b;
            }

            .parser-action-btn.next-btn {
                background: #ff6768;
                color: white;
            }

            .parser-action-btn.next-btn:hover {
                background: #e55a5b;
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
                background: none;
                border: 1px solid #3a3d5b;
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
            }

            .vote-btn.liked {
                background: #4caf50;
                border-color: #4caf50;
                color: white;
            }

            .vote-btn.disliked {
                background: #f44336;
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
            }

            .close-button:hover {
                color: #ff6768;
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
            panel.className = 'video-parser-panel';
            panel.innerHTML = `
                <button class="close-button" onclick="this.parentElement.style.display='none'">&times;</button>
                <div class="parser-header">🎬 视频解析器</div>
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
            `;
            document.body.appendChild(panel);
        }

        // 加载保存的设置
        await loadSettings();

        // 绑定事件
        document.getElementById('parser-api-select').addEventListener('change', async (e) => {
            currentApi = e.target.value;
            currentApiIndex = apiList.findIndex(api => api.value === currentApi);
            await saveSettings();
        });

        document.getElementById('parser-button').addEventListener('click', startParse);

        document.getElementById('auto-parse-toggle').addEventListener('change', async (e) => {
            autoParseEnabled = e.target.checked;
            await saveSettings();
            if (autoParseEnabled && isVideoPage() && !isParsing) {
                setTimeout(() => {
                    startAutoParse();
                }, 1000);
            }
        });

        document.getElementById('next-api-btn').addEventListener('click', async () => {
            await switchToNextApi();
        });

        document.getElementById('like-btn').addEventListener('click', async () => {
            await voteApi(currentApi, 1);
        });

        document.getElementById('dislike-btn').addEventListener('click', async () => {
            await voteApi(currentApi, -1);
        });
    }

    // 显示状态
    function showStatus(message, type) {
        const statusEl = document.getElementById('parser-status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `parser-status ${type}`;
            if (type !== 'success') {
                setTimeout(() => {
                    if (statusEl.textContent === message) {
                        statusEl.className = 'parser-status';
                        statusEl.textContent = '';
                    }
                }, 5000);
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
            (url.includes('bilibili.com/video/') && isBilibiliPaidContent()) ||
            url.includes('youku.com/v_show/')
        );
    }

    // 检测B站是否为收费内容
    function isBilibiliPaidContent() {
        const url = window.location.href;
        // 只对番剧、电影、付费课程等内容进行解析
        // 排除普通视频 (BV号)
        if (url.includes('bilibili.com/video/BV')) {
            return false;
        }
        // 检查是否为番剧页面
        if (url.includes('bilibili.com/bangumi/play/')) {
            return true;
        }
        // 检查页面中是否有付费标识
        const paidIndicators = [
            '.vip-pay-wrap',
            '.vip-wrap',
            '.bilibili-player-vip-wrap',
            '.vip-limit',
            '.pay-bar',
            '.vip-card',
            '[class*="vip"]',
            '[class*="pay"]',
            '[class*="limit"]'
        ];
        
        for (const selector of paidIndicators) {
            if (document.querySelector(selector)) {
                return true;
            }
        }
        
        // 检查页面标题是否包含付费相关关键词
        const title = document.title.toLowerCase();
        const paidKeywords = ['付费', '会员', '大会员', 'vip', '限免', '独家'];
        return paidKeywords.some(keyword => title.includes(keyword));
    }

    // 获取当前视频URL
    function getCurrentVideoUrl() {
        return window.location.href;
    }

    // 开始解析
    function startParse() {
        if (isParsing) return;
        parseAttempts = 0;
        doParse();
    }

    // 执行解析
    async function doParse() {
        const videoUrl = getCurrentVideoUrl();
        if (!videoUrl) {
            showStatus('无法获取视频URL', 'error');
            return;
        }

        isParsing = true;
        const button = document.getElementById('parser-button');
        button.disabled = true;
        button.textContent = '解析中...';
        showStatus(`正在使用 ${apiList[currentApiIndex].label} 解析...`, 'loading');

        try {
            // 拼接解析URL
            const parseUrl = currentApi + encodeURIComponent(videoUrl);

            // 清除之前的解析
            clearParse();

            // 注入iframe
            injectPlayer(parseUrl);

            // 解析成功，增加评分
            updateApiScore(currentApi, 1);
            await saveSettings();

            showStatus('解析成功！正在播放...', 'success');

            // 解析成功后恢复按钮状态
            isParsing = false;
            button.disabled = false;
            button.textContent = '开始解析';
        } catch (error) {
            console.error('解析失败:', error);
            if (autoParseEnabled && parseAttempts < apiList.length - 1) {
                parseAttempts++;

                // 保存当前失败的接口
                const failedApi = currentApi;

                currentApiIndex = (currentApiIndex + 1) % apiList.length;
                currentApi = apiList[currentApiIndex].value;
                const select = document.getElementById('parser-api-select');
                if (select) select.value = currentApi;

                // 给失败的接口减少评分
                updateApiScore(failedApi, -1);
                saveSettings();

                showStatus(`解析失败，自动切换到 ${apiList[currentApiIndex].label}...`, 'loading');
                setTimeout(() => doParse(), 1000);
            } else {
                showStatus('解析失败: ' + error.message, 'error');
            }
        } finally {
            if (!autoParseEnabled || parseAttempts >= apiList.length - 1) {
                isParsing = false;
                button.disabled = false;
                button.textContent = '开始解析';
            }
        }
    }

    // 开始自动解析
    function startAutoParse() {
        if (!autoParseEnabled || isParsing) return;
        parseAttempts = 0;
        doParse();
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
    }

    // 注入播放器
    function injectPlayer(parseUrl) {
        // 查找播放器容器
        let playerContainer = null;
        for (const selector of playerContainerSelectors) {
            playerContainer = document.querySelector(selector);
            if (playerContainer) break;
        }

        if (!playerContainer) {
            throw new Error('未找到播放器容器，可能是不支持的视频页面');
        }

        // 确保容器定位为relative
        if (window.getComputedStyle(playerContainer).position === 'static') {
            playerContainer.style.position = 'relative';
        }

        // 移除之前的iframe（防止重复显示）
        const existingIframe = document.getElementById('void-player-iframe');
        if (existingIframe && existingIframe.parentElement === playerContainer) {
            existingIframe.remove();
        }

        // 创建iframe
        const iframe = document.createElement('iframe');
        iframe.id = 'void-player-iframe';
        iframe.src = parseUrl;
        iframe.className = 'void-player-iframe';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;

        // 添加到容器
        playerContainer.appendChild(iframe);

        // 启动守护进程
        startGuardian();
    }

    // 守护进程 - 持续隐藏广告和原生播放器
    function startGuardian() {
        guardianInterval = setInterval(() => {
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
                // 保留第一个面板，隐藏其他的
                for (let i = 1; i < allPanels.length; i++) {
                    allPanels[i].style.display = 'none';
                }
            }
        }, 250);
    }

    // 监听URL变化（针对SPA应用）
    function watchUrlChanges() {
        let lastUrl = window.location.href;
        setInterval(() => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                // URL变化时清除之前的解析
                clearParse();
            }
        }, 1000);
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        if (panelCreated) return;
        panelCreated = true;

        await createUI();
        watchUrlChanges();

        // 如果是视频页面且开启了自动解析
        if (isVideoPage() && autoParseEnabled) {
            setTimeout(() => {
                startAutoParse();
            }, 2000);
        } else if (isVideoPage()) {
            setTimeout(() => {
                showStatus('检测到视频页面，点击"开始解析"即可播放', 'success');
            }, 2000);
        }
    }

    // 添加键盘快捷键（Ctrl+Shift+P）
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            const panel = document.querySelector('.video-parser-panel');
            if (panel) {
                panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            }
        }
    });

})();
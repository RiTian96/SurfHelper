// ==UserScript==
// @name         COC阵型复制助手
// @namespace    https://github.com/RiTian96/SurfHelper
// @version      1.2.0
// @description  [核心] 绕过付费/次数限制，后台无感提取阵型链接；[辅助] 鼠标悬停显示高清巨型大图(自适应尺寸，智能避让鼠标)；[资源] 左侧悬浮背包记录历史阵型，支持二维码扫码直连。
// @author       RiTian96
// @match        *://coc.6oh.cn/*
// @icon         https://coc.6oh.cn/favicon.ico
// @icon         https://www.google.com/s2/favicons?sz=64&domain=coc.6oh.cn
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @run-at       document-start
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/coc-layout-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/coc-layout-helper.user.js
// ==/UserScript==

(function() {
    'use strict';

    /**
     * =================================================================
     * 1. 全局配置 (Configuration)
     * =================================================================
     */
    const CONFIG = {
        // 历史记录最大保存条数
        bagMaxItems: 50,
        // 是否开启调试日志
        debug: false,
        // 动画时长配置
        animation: {
            fast: '150ms',
            normal: '300ms',
            slow: '500ms'
        }
    };

    // 运行时状态管理
    const State = {
        historyLog: [],        // 历史记录存储
        currentBtn: null,      // 当前操作的按钮
        isLensVisible: false   // 透镜显示状态
    };

    const log = (...args) => CONFIG.debug && console.log('🛡️ COC Helper:', ...args);


    /**
     * =================================================================
     * 2. 样式注入 (CSS Injection)
     * =================================================================
     */
    function injectStyles() {
        GM_addStyle(`
            /* --- [核心] 屏蔽干扰 --- */
            .layui-layer-shade, .layui-layer-dialog, .layui-layer-msg {
                display: none !important; z-index: -9999 !important; pointer-events: none !important;
            }

            /* --- [视觉] 成功反馈 --- */
            .coc-cracked-card {
                border: 3px solid #00E676 !important;
                box-shadow: 0 0 20px rgba(0, 230, 118, 0.5), 0 0 40px rgba(0, 230, 118, 0.2) !important;
                transform: scale(1.01);
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                z-index: 5;
                position: relative;
            }

            /* --- [组件] 智能巨型透镜 (Magic Lens) - 玻璃拟态版 --- */
            #coc-magic-lens {
                position: fixed;
                top: 50%;
                transform: translateY(-50%);
                width: auto;
                height: auto;
                max-width: 48vw;
                max-height: 90vh;
                background: rgba(20, 20, 25, 0.75);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 20px;
                box-shadow: 0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset;
                z-index: 2147483647;
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                pointer-events: none;
                backdrop-filter: blur(24px) saturate(180%);
                -webkit-backdrop-filter: blur(24px) saturate(180%);
                transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                will-change: opacity, transform;
                padding: 12px;
            }

            #coc-magic-lens img {
                display: block;
                max-width: 100%;
                max-height: 82vh;
                object-fit: contain;
                opacity: 0;
                transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1);
                user-select: none;
                -webkit-user-drag: none;
                border-radius: 12px;
            }

            #coc-magic-lens::after {
                content: "高清原图读取中...";
                position: absolute;
                color: rgba(255, 255, 255, 0.5);
                font-size: 13px;
                font-weight: 500;
                letter-spacing: 0.5px;
                z-index: 1;
                pointer-events: none;
                text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }

            /* --- [组件] 侧边背包 (Loot Bag) - 玻璃拟态版 --- */
            #coc-loot-bag {
                position: fixed;
                top: 25%;
                left: 0;
                width: 44px;
                height: auto;
                background: rgba(30, 30, 35, 0.65);
                border-radius: 0 16px 16px 0;
                z-index: 100000;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-left: none;
                box-shadow: 4px 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset;
                backdrop-filter: blur(20px) saturate(160%);
                -webkit-backdrop-filter: blur(20px) saturate(160%);
                transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                overflow: hidden;
                cursor: pointer;
            }

            #coc-loot-bag:hover {
                width: 280px;
                background: rgba(35, 35, 42, 0.8);
                box-shadow: 8px 8px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset;
            }

            .bag-icon-area {
                width: 44px;
                height: 56px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 22px;
                color: rgba(255, 255, 255, 0.7);
                background: rgba(255,255,255,0.03);
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                text-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }

            #coc-loot-bag:hover .bag-icon-area {
                background: rgba(0, 230, 118, 0.15);
                color: #00E676;
            }

            #coc-loot-list {
                width: 280px;
                max-height: 420px;
                overflow-y: auto;
                padding: 4px 0;
            }

            #coc-loot-list::-webkit-scrollbar {
                width: 5px;
            }

            #coc-loot-list::-webkit-scrollbar-track {
                background: transparent;
            }

            #coc-loot-list::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.15);
                border-radius: 3px;
            }

            #coc-loot-list::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.25);
            }

            .coc-loot-item {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.85);
                padding: 14px 18px;
                margin: 0 8px;
                border-radius: 10px;
                border: 1px solid transparent;
                transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                cursor: pointer;
            }

            .coc-loot-item:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(0, 230, 118, 0.3);
                color: #00E676;
                transform: translateX(4px);
            }

            .coc-loot-item:active {
                transform: translateX(2px) scale(0.98);
            }

            .coc-loot-item:not(:last-child) {
                margin-bottom: 4px;
            }

            /* --- [组件] 结果弹窗 (Modal) - 玻璃拟态版 --- */
            #coc-result-modal {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(28, 28, 32, 0.82);
                backdrop-filter: blur(28px) saturate(180%);
                -webkit-backdrop-filter: blur(28px) saturate(180%);
                color: #fff;
                padding: 28px;
                border-radius: 24px;
                z-index: 2147483647;
                width: 360px;
                max-width: 92vw;
                text-align: center;
                box-shadow: 0 32px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08) inset;
                border: 1px solid rgba(255, 255, 255, 0.12);
                animation: modalPopUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                will-change: transform, opacity;
            }

            @keyframes modalPopUp {
                from { transform: translate(-50%, -45%) scale(0.92); opacity: 0; }
                to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }

            @keyframes modalFadeOut {
                from { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                to { transform: translate(-50%, -48%) scale(0.96); opacity: 0; }
            }

            #coc-result-modal.closing {
                animation: modalFadeOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }

            /* 链接文本域 */
            .coc-link-textarea {
                width: 100%;
                height: 76px;
                background: rgba(0, 0, 0, 0.35);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: #00E676;
                font-size: 12px;
                font-family: 'JetBrains Mono', Consolas, monospace;
                padding: 12px;
                margin: 14px 0;
                border-radius: 12px;
                resize: none;
                outline: none;
                word-break: break-all;
                white-space: pre-wrap;
                box-sizing: border-box;
                text-align: left;
                transition: all 0.2s ease;
            }

            .coc-link-textarea:focus {
                border-color: rgba(0, 230, 118, 0.4);
                background: rgba(0, 0, 0, 0.45);
                box-shadow: 0 0 0 3px rgba(0, 230, 118, 0.1);
            }

            /* 玻璃拟态按钮 */
            .coc-glass-btn {
                flex: 1;
                padding: 12px 16px;
                border: none;
                border-radius: 12px;
                cursor: pointer;
                font-weight: 600;
                font-size: 13px;
                letter-spacing: 0.3px;
                transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                position: relative;
                overflow: hidden;
            }

            .coc-glass-btn::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%);
                opacity: 0;
                transition: opacity 0.2s ease;
            }

            .coc-glass-btn:hover::before {
                opacity: 1;
            }

            .coc-glass-btn:hover {
                transform: translateY(-2px);
                filter: brightness(1.15);
            }

            .coc-glass-btn:active {
                transform: translateY(0) scale(0.97);
                filter: brightness(0.95);
            }

            .coc-btn-primary {
                background: linear-gradient(135deg, #2196F3, #1976D2);
                color: white;
                box-shadow: 0 4px 15px rgba(33, 150, 243, 0.35);
            }

            .coc-btn-primary:hover {
                box-shadow: 0 6px 20px rgba(33, 150, 243, 0.45);
            }

            .coc-btn-secondary {
                background: rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .coc-btn-secondary:hover {
                background: rgba(255, 255, 255, 0.15);
                border-color: rgba(255, 255, 255, 0.2);
            }

            /* 弹窗标题 */
            .coc-modal-title {
                margin: 0 0 18px 0;
                color: #00E676;
                font-size: 20px;
                font-weight: 700;
                letter-spacing: 0.5px;
                text-shadow: 0 2px 10px rgba(0, 230, 118, 0.3);
            }

            /* 二维码容器 */
            .coc-qr-container {
                background: white;
                padding: 8px;
                width: 150px;
                height: 150px;
                margin: 0 auto 18px auto;
                border-radius: 14px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.2);
                transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .coc-qr-container:hover {
                transform: scale(1.03);
            }

            .coc-qr-container img {
                width: 100%;
                height: 100%;
                display: block;
                border-radius: 8px;
            }

            /* 提示文字 */
            .coc-hint-text {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.5);
                margin-bottom: 6px;
                letter-spacing: 0.3px;
            }
        `);
    }


    /**
     * =================================================================
     * 3. 组件初始化 (Initialization)
     * =================================================================
     */
    function initComponents() {
        // 1. 巨型透镜
        const lens = document.createElement('div');
        lens.id = 'coc-magic-lens';
        lens.innerHTML = '<img id="coc-lens-img" src="">';
        document.body.appendChild(lens);

        // 2. 侧边背包
        const bag = document.createElement('div');
        bag.id = 'coc-loot-bag';
        bag.innerHTML = `
            <div style="display:flex; flex-direction: column;">
                <div class="bag-icon-area" title="历史记录">🎒</div>
                <div id="coc-loot-list">
                    <div style="color:rgba(255,255,255,0.35); text-align:center; padding:40px 20px; font-size:13px; line-height:1.6;">
                        <div style="font-size:32px; margin-bottom:12px; opacity:0.5;">🎒</div>
                        <div>暂无历史记录</div>
                        <div style="font-size:11px; margin-top:4px;">复制阵型后将自动加入</div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(bag);
    }


    /**
     * =================================================================
     * 4. 交互逻辑 (Event Handlers)
     * =================================================================
     */
    function initEvents() {

        // --- A. 点击反馈 ---
        document.addEventListener('click', function(e) {
            const target = e.target;
            if (target && (target.classList.contains('copy2') || target.getAttribute('act') === 'zhenxing_fz')) {
                State.currentBtn = target;
                const originalText = target.innerText;

                target.innerText = "⚡ 解析中...";
                target.style.background = "#FF9800";
                target.style.color = "#fff";
                target.style.transition = "all 0.2s";

                // 超时恢复
                setTimeout(() => {
                    if(target.innerText === "⚡ 解析中...") target.innerText = originalText;
                }, 5000);
            }
        }, true);

        // --- B. 智能透镜 (悬停显示) ---
        document.body.addEventListener('mouseover', function(e) {
            const card = e.target.closest('.zxlb2');
            if (card) {
                const lens = document.getElementById('coc-magic-lens');
                const lensImg = document.getElementById('coc-lens-img');
                
                // 安全检查
                if (!lens || !lensImg) return;

                // 提取高清大图
                const bigPicLink = card.querySelector('a[href$=".jpg"], a[href$=".png"]');
                const thumbPic = card.querySelector('img');
                const imgSrc = bigPicLink ? bigPicLink.href : (thumbPic ? thumbPic.src : null);

                if (imgSrc && imgSrc.trim()) {
                    State.isLensVisible = true;
                    lens.style.display = 'flex'; // flex布局保证图片居中

                    if (lensImg.dataset.src !== imgSrc) {
                        lensImg.style.opacity = '0';
                        lensImg.src = imgSrc;
                        lensImg.dataset.src = imgSrc;
                        lensImg.onload = () => { 
                            if (lensImg) lensImg.style.opacity = '1'; 
                        };
                        lensImg.onerror = () => {
                            log("🔥 图片加载失败:", imgSrc);
                            lens.style.display = 'none';
                            State.isLensVisible = false;
                        };
                    }
                }
            }
        });

        document.body.addEventListener('mouseout', function(e) {
            const card = e.target.closest('.zxlb2');
            const related = e.relatedTarget;
            const lens = document.getElementById('coc-magic-lens');
            
            if (card && (!related || !card.contains(related))) {
                State.isLensVisible = false;
                if (lens) lens.style.display = 'none';
            }
        });

        // --- C. 智能避让 (Follow Mouse but Avoid) ---
        document.addEventListener('mousemove', function(e) {
            if (!State.isLensVisible) return;

            const lens = document.getElementById('coc-magic-lens');
            if (!lens) return;
            
            const screenWidth = window.innerWidth;
            const mouseX = e.clientX;
            const margin = 50; // 距离中心的安全边距

            // 逻辑：鼠标在左半屏 -> 图显示在右半屏；反之亦然
            // 配合CSS的 max-width: 48vw，确保图不会遮挡鼠标所在的半区
            if (mouseX < screenWidth / 2) {
                lens.style.left = 'auto';
                lens.style.right = `${margin}px`;
            } else {
                lens.style.right = 'auto';
                lens.style.left = `${margin}px`;
            }
        });
    }


        /**
     * =================================================================
     * 5. 核心破解 (Core Ghost Mode)
     * =================================================================
     */
    function initNetworkHook() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._url = url; this._method = method;
            return originalOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function(body) {
            const isTarget = (body && typeof body === 'string' && body.includes('zhenxing_fz')) ||
                             (this._url && this._url.includes('zhenxing_fz'));

            if (isTarget) {
                log("🔥 捕获复制请求，启动无痕提取...");

                fetch(this._url, {
                    method: this._method || 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: body,
                    credentials: 'omit' // 核心：不带Cookie，模拟新访客
                })
                .then(r => r.text())
                .then(text => {
                    const match = text.match(/https:\/\/link\.clashofclans\.com\/[^"'\s\\]+/);
                    if (match) handleSuccess(match[0]);
                    else handleError();
                })
                .catch(err => handleError());
            }
            return originalSend.apply(this, arguments);
        };
    }


    /**
     * =================================================================
     * 6. 业务逻辑 (Business Logic)
     * =================================================================
     */
    function handleSuccess(link) {
        // UI反馈
        if (State.currentBtn) {
            State.currentBtn.innerText = "✅ 已复制";
            State.currentBtn.style.background = "#00E676";

            const card = State.currentBtn.closest('.zxlb2');
            if(card) {
                card.classList.add('coc-cracked-card');
                const titleEl = card.querySelector('a span') || card.querySelector('img');
                const title = titleEl ? (titleEl.innerText || titleEl.alt) : "阵型分享";
                addToBag(title, link);
            }
        }
        // 剪贴板
        try { GM_setClipboard(link); } catch(e) {}
        // 弹窗
        showModal(link);
    }

    function handleError() {
        if(State.currentBtn) {
            State.currentBtn.innerText = "❌ 失败";
            State.currentBtn.style.background = "#f44336";
        }
    }

    function addToBag(title, link) {
        if (State.historyLog.some(item => item.link === link)) return; // 去重
        State.historyLog.unshift({title, link});
        if(State.historyLog.length > CONFIG.bagMaxItems) State.historyLog.pop();
        renderBag();
    }

    function renderBag() {
        const list = document.getElementById('coc-loot-list');
        if (!list) return;

        list.innerHTML = '';

        if (State.historyLog.length === 0) {
            // 空状态
            list.innerHTML = `
                <div style="color:rgba(255,255,255,0.35); text-align:center; padding:40px 20px; font-size:13px; line-height:1.6;">
                    <div style="font-size:32px; margin-bottom:12px; opacity:0.5;">🎒</div>
                    <div>暂无历史记录</div>
                    <div style="font-size:11px; margin-top:4px;">复制阵型后将自动加入</div>
                </div>
            `;
            return;
        }

        State.historyLog.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'coc-loot-item';
            row.style.animationDelay = `${index * 0.03}s`;

            // 提取ID简写
            const idMatch = item.link.match(/id=([^&]+)/);
            const shortId = idMatch ? idMatch[1].substring(0, 8) : 'Link';

            // 截断标题
            const title = (item.title || '阵型分享').substring(0, 18);

            row.innerHTML = `
                <div style="font-weight:600; font-size:12px; margin-bottom:3px;">${title}</div>
                <div style="color:#00E676; font-size:10px; opacity:0.8; font-family:'JetBrains Mono', monospace;">ID: ${shortId}...</div>
            `;

            row.onclick = () => {
                if (item.link) {
                    showModal(item.link);
                    try { GM_setClipboard(item.link); } catch(e) { log("🔥 复制失败:", e); }
                }
            };

            list.appendChild(row);
        });
    }

    function showModal(link) {
        const old = document.getElementById('coc-result-modal');
        if (old) {
            old.classList.add('closing');
            setTimeout(() => old.remove(), 200);
        }

        const div = document.createElement('div');
        div.id = 'coc-result-modal';
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(link)}`;

        div.innerHTML = `
            <h3 class="coc-modal-title">🎉 提取成功</h3>
            <div class="coc-qr-container" title="手机扫码">
                <img src="${qrUrl}">
            </div>
            <p class="coc-hint-text">链接已自动复制到剪贴板</p>
            <textarea id="coc-result-link" class="coc-link-textarea" readonly>${link}</textarea>
            <div style="display:flex; gap:12px; margin-top: 14px;">
                <button id="coc-btn-go" class="coc-glass-btn coc-btn-primary">🚀 启动游戏</button>
                <button id="coc-btn-cls" class="coc-glass-btn coc-btn-secondary">关闭 (Esc)</button>
            </div>
        `;
        document.body.appendChild(div);

        // 自动选中文本
        setTimeout(() => {
            const textarea = document.getElementById('coc-result-link');
            if (textarea) textarea.select();
        }, 100);

        // 关闭动画
        const close = () => {
            div.classList.add('closing');
            setTimeout(() => div.remove(), 200);
        };

        document.getElementById('coc-btn-cls').onclick = close;
        document.getElementById('coc-btn-go').onclick = () => window.location.href = link;

        // ESC 关闭
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', keyHandler);
            }
        };
        document.addEventListener('keydown', keyHandler);

        // 点击遮罩关闭（可选）
        div.addEventListener('click', (e) => {
            if (e.target === div) close();
        });
    }


    /**
     * =================================================================
     * 7. 启动 (Bootstrap)
     * =================================================================
     */
    function main() {
        injectStyles();
        initNetworkHook(); // 尽早注入网络钩子

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

    main();

})();
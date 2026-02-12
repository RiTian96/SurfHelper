// ==UserScript==
// @name         JavDB影片管理器
// @namespace    https://github.com/RiTian96/SurfHelper
// @version      1.5.4
// @description  [核心] 已看/想看影片自动屏蔽，智能评分过滤；[增强] 高分影片高亮显示，批量导入列表；[管理] 可视化开关控制，智能搜索管理；[新增] 欧美区番号支持，不区分大小写空格匹配；[优化] 番号标准化存储，自动转大写去空格防重复；[新增] 手动数据清理功能，管理窗口一键清理重复数据；[新增] 前缀去重功能，自动删除不完整番号
// @author       RiTian96
// @match        https://javdb.com/*
// @icon         https://javdb.com/favicon.ico
// @icon         https://www.google.com/s2/favicons?sz=64&domain=javdb.com
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/javdb-manager.user.js
// @downloadURL  https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/javdb-manager.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 配置项
    const CONFIG = {
        watchedStorageKey: 'javdb_watched_codes',
        wantedStorageKey: 'javdb_wanted_codes',
        currentPageType: null, // 'watched' 或 'wanted'
        isImporting: false,
        importedCount: 0,
        totalCount: 0,
        
        DEBUG: false, // 生产环境设为false，调试时设为true
        panelCreated: false, // 防止重复创建面板
        
        // 功能开关
        enableWatchedBlock: true, // 是否启用已看屏蔽
        enableWantedBlock: true, // 是否启用想看屏蔽
        enableLowScoreBlock: true // 是否启用低分屏蔽（同时控制高分高亮）
    };

    // 调试日志函数
    function debugLog(...args) {
        if (CONFIG.DEBUG) {
            console.log('[JavDB Manager]', ...args);
        }
    }
    
    // 从影片项中提取番号（支持日式和欧美区）
    function getVideoCodeFromItem(item) {
        // 列表页面：统一使用 .video-title
        const videoTitle = item.querySelector('.video-title');
        if (videoTitle) {
            const strongElement = videoTitle.querySelector('strong');
            if (strongElement) {
                const strongText = strongElement.textContent.trim();
                // 判断是否为日式番号（包含 - 号）
                if (strongText.includes('-')) {
                    const normalizedCode = normalizeCode(strongText);
                    debugLog(`从 video-title strong 获取日式番号: ${strongText} -> 标准化: ${normalizedCode}`);
                    return normalizedCode;
                } else {
                    // 欧美区：使用完整 title
                    const fullTitle = videoTitle.textContent.trim();
                    const normalizedCode = normalizeCode(fullTitle);
                    debugLog(`从 video-title 获取欧美区完整番号: ${fullTitle} -> 标准化: ${normalizedCode}`);
                    return normalizedCode;
                }
            }
        }

        debugLog('无法从影片项中提取番号');
        return null;
    }
    
    // 不区分大小写和空格的匹配函数
    function isCodeMatch(code1, code2) {
        // 标准化：去除空格，转换为小写
        const normalize = (str) => str.replace(/\s+/g, '').toLowerCase();
        return normalize(code1) === normalize(code2);
    }
    
    // 不区分大小写和空格的前缀匹配函数
    function isCodePrefixMatch(prefix, fullCode) {
        const normalize = (str) => str.replace(/\s+/g, '').toLowerCase();
        return normalize(fullCode).startsWith(normalize(prefix));
    }

    // 番号标准化函数：转换为大写并去除空格
    function normalizeCode(code) {
        if (!code || typeof code !== 'string') return code;
        return code.replace(/\s+/g, '').toUpperCase();
    }

    // 前缀去重：删除是其他番号前缀的较短番号
    function removePrefixDuplicates(codeList) {
        const toRemove = new Set();
        
        for (let i = 0; i < codeList.length; i++) {
            for (let j = 0; j < codeList.length; j++) {
                if (i !== j && codeList[j].startsWith(codeList[i])) {
                    // codeList[i] 是 codeList[j] 的前缀，标记删除较短的
                    toRemove.add(i);
                    debugLog(`前缀去重："${codeList[i]}" 是 "${codeList[j]}" 的前缀，将删除`);
                }
            }
        }
        
        return {
            codes: codeList.filter((_, index) => !toRemove.has(index)),
            removed: toRemove.size
        };
    }

    // 数据清理：手动执行，清理和标准化已存储的番号数据
    function cleanupData() {
        debugLog('开始数据清理：清理和标准化已存储的番号');

        const result = {
            before: { watched: 0, wanted: 0, total: 0 },
            after: { watched: 0, wanted: 0, total: 0 },
            removed: { duplicates: 0, crossList: 0, prefix: 0 },
            details: { watchedPrefix: [], wantedPrefix: [] },
            changed: false
        };

        // 处理已看列表
        const watchedCodes = GM_getValue(CONFIG.watchedStorageKey, []);
        result.before.watched = watchedCodes.length;

        // 标准化并去重
        let processedWatched = [...new Set(watchedCodes.map(code => normalizeCode(code)).filter(code => code))];
        result.removed.duplicates += watchedCodes.length - processedWatched.length;

        // 前缀去重
        const prefixResultWatched = removePrefixDuplicates(processedWatched);
        if (prefixResultWatched.removed > 0) {
            result.details.watchedPrefix = processedWatched.filter((_, i) => {
                const afterCodes = prefixResultWatched.codes;
                const code = processedWatched[i];
                return !afterCodes.includes(code);
            });
        }
        processedWatched = prefixResultWatched.codes;
        result.removed.prefix += prefixResultWatched.removed;

        result.after.watched = processedWatched.length;

        // 检查是否有变化
        const watchedChanged = processedWatched.length !== watchedCodes.length ||
                               JSON.stringify(processedWatched) !== JSON.stringify(watchedCodes);
        if (watchedChanged) {
            GM_setValue(CONFIG.watchedStorageKey, processedWatched);
            result.changed = true;
            debugLog(`已看列表：${watchedCodes.length} -> ${processedWatched.length}，清理了 ${watchedCodes.length - processedWatched.length} 项`);
        }

        // 处理想看列表
        const wantedCodes = GM_getValue(CONFIG.wantedStorageKey, []);
        result.before.wanted = wantedCodes.length;

        // 标准化并去重
        let processedWanted = [...new Set(wantedCodes.map(code => normalizeCode(code)).filter(code => code))];
        result.removed.duplicates += wantedCodes.length - processedWanted.length;

        // 前缀去重
        const prefixResultWanted = removePrefixDuplicates(processedWanted);
        if (prefixResultWanted.removed > 0) {
            result.details.wantedPrefix = processedWanted.filter((_, i) => {
                const afterCodes = prefixResultWanted.codes;
                const code = processedWanted[i];
                return !afterCodes.includes(code);
            });
        }
        processedWanted = prefixResultWanted.codes;
        result.removed.prefix += prefixResultWanted.removed;

        result.after.wanted = processedWanted.length;

        // 检查是否有变化
        const wantedChanged = processedWanted.length !== wantedCodes.length ||
                              JSON.stringify(processedWanted) !== JSON.stringify(wantedCodes);
        if (wantedChanged) {
            GM_setValue(CONFIG.wantedStorageKey, processedWanted);
            result.changed = true;
            debugLog(`想看列表：${wantedCodes.length} -> ${processedWanted.length}，清理了 ${wantedCodes.length - processedWanted.length} 项`);
        }

        // 检查两个列表之间的重复（一个番号不能同时在已看和想看中）
        const duplicates = processedWatched.filter(code => processedWanted.includes(code));
        if (duplicates.length > 0) {
            debugLog(`发现跨列表重复项：`, duplicates);
            // 默认保留在已看列表中，从想看列表移除
            const newWanted = processedWanted.filter(code => !processedWatched.includes(code));
            GM_setValue(CONFIG.wantedStorageKey, newWanted);
            result.removed.crossList = duplicates.length;
            result.after.wanted = newWanted.length;
            result.changed = true;
            debugLog(`已清理跨列表重复，从想看列表移除 ${duplicates.length} 项`);
        }

        result.before.total = result.before.watched + result.before.wanted;
        result.after.total = result.after.watched + result.after.wanted;

        const totalRemoved = result.before.total - result.after.total;
        if (totalRemoved > 0 || result.changed) {
            console.log(`[JavDB Manager] 数据清理完成：
- 重复/无效：${result.removed.duplicates}
- 前缀去重：${result.removed.prefix}
- 跨列表重复：${result.removed.crossList}
- 总计清理：${totalRemoved} 个番号`);
        } else {
            debugLog('数据清理完成：没有发现需要清理的数据');
        }

        return result;
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
        const savedWatchedBlock = localStorage.getItem('javdb_enable_watched_block');
        const savedWantedBlock = localStorage.getItem('javdb_enable_wanted_block');
        const savedLowScoreBlock = localStorage.getItem('javdb_enable_low_score_block');
        
        if (savedWatchedBlock !== null) {
            CONFIG.enableWatchedBlock = savedWatchedBlock === 'true';
        }
        if (savedWantedBlock !== null) {
            CONFIG.enableWantedBlock = savedWantedBlock === 'true';
        }
        if (savedLowScoreBlock !== null) {
            CONFIG.enableLowScoreBlock = savedLowScoreBlock === 'true';
        }
        
        debugLog('加载配置:', {
            enableWatchedBlock: CONFIG.enableWatchedBlock,
            enableWantedBlock: CONFIG.enableWantedBlock,
            enableLowScoreBlock: CONFIG.enableLowScoreBlock
        });
    }
    
    // 保存配置
    function saveConfig() {
        localStorage.setItem('javdb_enable_watched_block', CONFIG.enableWatchedBlock.toString());
        localStorage.setItem('javdb_enable_wanted_block', CONFIG.enableWantedBlock.toString());
        localStorage.setItem('javdb_enable_low_score_block', CONFIG.enableLowScoreBlock.toString());
        debugLog('保存配置:', {
            enableWatchedBlock: CONFIG.enableWatchedBlock,
            enableWantedBlock: CONFIG.enableWantedBlock,
            enableLowScoreBlock: CONFIG.enableLowScoreBlock
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
        
        // 应用屏蔽效果
        applyBlockEffect();
        
        // 监听页面变化，动态应用屏蔽效果
        observePageChanges();
        
        // 检查是否有待处理的导入任务
        const pendingImport = localStorage.getItem('javdb_pending_import');
        if (pendingImport && CONFIG.currentPageType === pendingImport) {
            // 延迟一下确保页面完全加载
            setTimeout(() => {
                startImport(pendingImport);
                localStorage.removeItem('javdb_pending_import'); // 清除待处理状态
            }, 1000);
        }
        
        // 检查是否是翻页后的继续导入
        const isImporting = localStorage.getItem('javdb_importing') === 'true';
        if (isImporting && CONFIG.currentPageType) {
            const importType = localStorage.getItem('javdb_import_type');
            const importedCount = localStorage.getItem('javdb_imported_count');
            
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

    // 屏蔽功能相关函数
    // 应用屏蔽效果和高亮评分
    function applyBlockEffect() {
        debugLog('应用屏蔽效果');
        
        // 查找所有影片项
        const movieItems = document.querySelectorAll('.movie-list .item');
        debugLog(`找到 ${movieItems.length} 个影片项`);
        
        movieItems.forEach(item => {
            // 清除所有相关类
            item.classList.remove('javdb-blocked', 'javdb-watched', 'javdb-wanted', 
                               'javdb-low-score', 'javdb-normal-score', 'javdb-high-score', 'javdb-excellent');
            
            // 应用屏蔽效果（已看/想看）
            applyBlockEffectInternal(item);
            
            // 应用评分效果（低分屏蔽+高亮）
        applyScoreHighlight(item);
        });
    }
    
    // 内部屏蔽效果应用函数
    function applyBlockEffectInternal(item) {
        // 获取已保存的番号列表
        const watchedCodes = GM_getValue(CONFIG.watchedStorageKey, []);
        const wantedCodes = GM_getValue(CONFIG.wantedStorageKey, []);
        
        // 使用通用函数提取番号
        const code = getVideoCodeFromItem(item);
        
        if (code) {
            let shouldBlock = false;
            
            // 根据当前页面类型决定屏蔽策略
            // 在看过页面，只屏蔽已看的，不屏蔽想看的
            if (CONFIG.currentPageType === 'watched') {
                if (findMatchingCode(code, watchedCodes) && CONFIG.enableWatchedBlock) {
                    item.classList.add('javdb-watched');
                    shouldBlock = true;
                    debugLog(`看过页面屏蔽已看番号: ${code}`);
                }
                // 在看过页面，想看的影片正常显示，但添加标记以便区分
                else if (findMatchingCode(code, wantedCodes)) {
                    item.classList.add('javdb-wanted');
                    // 不设置shouldBlock，所以不会被屏蔽
                    debugLog(`看过页面显示想看番号: ${code}（不屏蔽）`);
                }
            }
            // 在想看页面，只屏蔽想看的，不屏蔽已看的
            else if (CONFIG.currentPageType === 'wanted') {
                if (findMatchingCode(code, wantedCodes) && CONFIG.enableWantedBlock) {
                    item.classList.add('javdb-wanted');
                    shouldBlock = true;
                    debugLog(`想看页面屏蔽想看番号: ${code}`);
                }
                // 在想看页面，已看的影片正常显示，但添加标记以便区分
                else if (findMatchingCode(code, watchedCodes)) {
                    item.classList.add('javdb-watched');
                    // 不设置shouldBlock，所以不会被屏蔽
                    debugLog(`想看页面显示已看番号: ${code}（不屏蔽）`);
                }
            }
            // 在其他页面，按照原来的逻辑屏蔽所有
            else {
                // 检查是否在已看列表中
                if (findMatchingCode(code, watchedCodes) && CONFIG.enableWatchedBlock) {
                    item.classList.add('javdb-watched');
                    shouldBlock = true;
                    debugLog(`其他页面屏蔽已看番号: ${code}`);
                }
                
                // 检查是否在想看列表中
                if (findMatchingCode(code, wantedCodes) && CONFIG.enableWantedBlock) {
                    item.classList.add('javdb-wanted');
                    shouldBlock = true;
                    debugLog(`其他页面屏蔽想看番号: ${code}`);
                }
            }
            
            // 如果需要屏蔽，添加屏蔽样式
            if (shouldBlock) {
                item.classList.add('javdb-blocked');
            }
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
                           .replace(/=E7=9C=8B/g, '看') // 看的繁体
                           .replace(/=E7=94=B1/g, '由'); // 由的繁体
        
        debugLog(`评分文本: ${scoreText}`);
        
        // 匹配评分格式：X.XX分, 由XXX人評價
        const scoreMatch = scoreText.match(/([\d.]+)分[,，]\s*由(\d+)人(?:評價|评价)/);
        
        if (scoreMatch) {
            const score = parseFloat(scoreMatch[1]);
            const reviewCount = parseInt(scoreMatch[2]);
            
            debugLog(`解析评分: ${score}分, ${reviewCount}人评价`);
            
            // 清除之前的评分相关类
            item.classList.remove('javdb-low-score', 'javdb-normal-score', 'javdb-high-score', 'javdb-excellent');
            
            // 新的评分规则逻辑
            if (CONFIG.enableLowScoreBlock) {
                // 10人以下评价，无论多少分都正常显示
                if (reviewCount <= 10) {
                    debugLog(`评价人数较少(${reviewCount}人)，正常显示: ${score}分`);
                }
                // 10人以上评价的分级规则
                else {
                    // 0-3.5分屏蔽
                    if (score < 3.5) {
                        item.classList.add('javdb-low-score');
                        debugLog(`低分屏蔽: ${score}分, ${reviewCount}人评价`);
                    }
                    // 3.5-4.0分正常显示
                    else if (score >= 3.5 && score < 4.0) {
                        debugLog(`正常显示: ${score}分, ${reviewCount}人评价`);
                    }
                    // 4.0-4.5分推荐
                    else if (score >= 4.0 && score < 4.5) {
                        item.classList.add('javdb-high-score');
                        debugLog(`推荐影片: ${score}分, ${reviewCount}人评价`);
                    }
                    // 4.5分以上必看
                    else if (score >= 4.5) {
                        item.classList.add('javdb-excellent');
                        debugLog(`必看影片: ${score}分, ${reviewCount}人评价`);
                    }
                }
            }
        } else {
            // 如果正则不匹配，尝试更宽松的匹配
            const looseMatch = scoreText.match(/([\d.]+)/);
            if (looseMatch) {
                const score = parseFloat(looseMatch[1]);
                debugLog(`宽松匹配评分: ${score}分`);
                
                // 清除之前的评分相关类
                item.classList.remove('javdb-low-score', 'javdb-normal-score', 'javdb-high-score', 'javdb-excellent');
                
                // 宽松匹配的新评分规则
                if (CONFIG.enableLowScoreBlock) {
                    // 无法确定评价人数时，按原逻辑处理
                    if (score === 0 || scoreText.includes('0人')) {
                        debugLog(`无人评分或0分，正常显示: ${score}分`);
                    }
                    // 0-3.5分屏蔽
                    else if (score < 3.5) {
                        item.classList.add('javdb-low-score');
                        debugLog(`低分屏蔽: ${score}分`);
                    }
                    // 3.5-4.0分正常显示
                    else if (score >= 3.5 && score < 4.0) {
                        debugLog(`正常显示: ${score}分`);
                    }
                    // 4.0-4.5分推荐
                    else if (score >= 4.0 && score < 4.5) {
                        item.classList.add('javdb-high-score');
                        debugLog(`推荐影片: ${score}分`);
                    }
                    // 4.5分以上必看
                    else if (score >= 4.5) {
                        item.classList.add('javdb-excellent');
                        debugLog(`必看影片: ${score}分`);
                    }
                }
            } else {
                // 完全无法解析评分，正常显示
                debugLog(`无法解析评分，正常显示`);
                // 清除之前的评分相关类
                item.classList.remove('javdb-low-score', 'javdb-normal-score', 'javdb-high-score', 'javdb-excellent');
            }
        }
    }
    
    // 监听页面变化
    function observePageChanges() {
        // 创建MutationObserver监听DOM变化
        const observer = new MutationObserver((mutations) => {
            let shouldReapply = false;
            
            mutations.forEach((mutation) => {
                // 检查是否有新的影片项添加
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // 如果是影片列表容器或包含影片项的元素
                            if (node.classList?.contains('movie-list') || 
                                node.querySelector?.('.movie-list .item')) {
                                shouldReapply = true;
                            }
                        }
                    });
                }
            });
            
            // 如果有变化，重新应用屏蔽效果
            if (shouldReapply) {
                setTimeout(() => {
                    applyBlockEffect();
                }, 500); // 延迟一下确保DOM完全加载
            }
        });
        
        // 开始观察整个文档
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // 监听页面导航（SPA应用）
        let lastUrl = window.location.href;
        const urlObserver = new MutationObserver(() => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                
                // 更新页面类型和标识
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
                
                setTimeout(() => {
                    applyBlockEffect();
                }, 1000); // 页面切换后延迟应用
            }
        });
        
        urlObserver.observe(document.body, {
            childList: true,
            subtree: true
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
        const isImportPage = CONFIG.currentPageType === 'watched' || CONFIG.currentPageType === 'wanted';
        const isImporting = CONFIG.isImporting || localStorage.getItem('javdb_importing') === 'true';
        
        // 创建面板
        const floatingWindow = document.createElement('div');
        floatingWindow.id = 'javdb-global-floating-window';
        floatingWindow.className = 'javdb-manager-panel minimized';
        
        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .javdb-manager-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10001;
                background: rgba(44, 62, 80, 0.95);
                color: white;
                font-family: Arial, sans-serif;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255,255,255,0.15);
                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                transition: all 0.3s ease;
                box-sizing: border-box;
            }

            .javdb-manager-panel.minimized {
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

            .javdb-manager-panel.minimized .panel-content {
                display: none;
            }

            .javdb-manager-panel.minimized .close-button {
                position: absolute;
                top: -5px;
                right: -5px;
                width: 20px;
                height: 20px;
                background: #e74c3c;
                border-radius: 50%;
                color: white;
                font-size: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
            }

            .javdb-manager-panel.minimized .manager-icon {
                display: block;
                font-size: 24px;
                color: #3498db;
            }

            .javdb-manager-panel:not(.minimized) .manager-icon {
                display: none;
            }

            .javdb-manager-panel:not(.minimized) {
                width: 400px;
                padding: 15px;
                border-radius: 12px;
                max-height: 80vh;
                overflow-y: auto;
            }

            .javdb-manager-panel * {
                box-sizing: border-box;
            }

            .manager-header {
                color: #3498db;
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 12px;
                text-align: center;
            }

            .manager-count {
                text-align: center;
                margin-bottom: 15px;
                padding: 10px;
                background: rgba(52, 152, 219, 0.1);
                border-radius: 8px;
                border: 1px solid rgba(52, 152, 219, 0.3);
            }

            .manager-count.importing {
                background: rgba(243, 156, 18, 0.1);
                border-color: rgba(243, 156, 18, 0.3);
            }

            .manager-buttons {
                display: flex;
                gap: 8px;
                margin-bottom: 10px;
            }

            .manager-button {
                flex: 1;
                padding: 8px 12px;
                border: none;
                border-radius: 6px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .manager-button.watched {
                background: #e74c3c;
                color: white;
            }

            .manager-button.wanted {
                background: #f39c12;
                color: white;
            }

            .manager-button.stop {
                background: #95a5a6;
                color: white;
                width: 100%;
            }

            .manager-button.stop.active {
                background: #e74c3c;
                opacity: 1;
            }

            .manager-button:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }

            .manager-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }

            .close-button {
                position: absolute;
                top: 5px;
                right: 5px;
                background: rgba(231, 76, 60, 0.8);
                border: none;
                color: white;
                font-size: 14px;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                line-height: 24px;
                text-align: center;
                transition: all 0.2s ease;
                z-index: 100;
                border-radius: 50%;
                font-weight: bold;
            }

            .close-button:hover {
                background: #e74c3c;
                transform: scale(1.1);
            }

            .javdb-manager-panel:not(.minimized):hover {
                transform: scale(1.02);
                box-shadow: 0 6px 25px rgba(0,0,0,0.5);
            }

            .manager-tabs {
                display: flex;
                margin-bottom: 15px;
                border-bottom: 1px solid rgba(255,255,255,0.2);
            }

            .manager-tab {
                flex: 1;
                padding: 8px;
                text-align: center;
                cursor: pointer;
                border: none;
                background: none;
                color: rgba(255,255,255,0.7);
                font-size: 12px;
                transition: all 0.2s ease;
            }

            .manager-tab.active {
                color: #3498db;
                border-bottom: 2px solid #3498db;
            }

            .manager-tab:hover {
                color: white;
            }

            .manager-tab-content {
                display: none;
            }

            .manager-tab-content.active {
                display: block;
            }

            .smart-container {
                margin-bottom: 15px;
            }

            .smart-input {
                width: 100%;
                padding: 10px;
                border: 1px solid rgba(255,255,255,0.3);
                border-radius: 6px;
                background: rgba(255,255,255,0.1);
                color: white;
                font-size: 14px;
                margin-bottom: 10px;
            }

            .smart-input::placeholder {
                color: rgba(255,255,255,0.5);
            }

            .smart-result {
                padding: 12px;
                background: rgba(255,255,255,0.1);
                border-radius: 6px;
                margin-bottom: 10px;
                font-size: 13px;
                text-align: center;
                border: 1px solid rgba(255,255,255,0.2);
            }

            .smart-result.found {
                background: rgba(39, 174, 96, 0.2);
                border: 1px solid rgba(39, 174, 96, 0.5);
            }

            .smart-result.not-found {
                background: rgba(231, 76, 60, 0.2);
                border: 1px solid rgba(231, 76, 60, 0.5);
            }

            .smart-actions {
                display: flex;
                gap: 6px;
                margin-top: 10px;
            }

            .smart-action-button {
                flex: 1;
                padding: 8px 6px;
                border: none;
                border-radius: 6px;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .smart-action-button.add-watched {
                background: #e74c3c;
                color: white;
            }

            .smart-action-button.add-wanted {
                background: #f39c12;
                color: white;
            }

            

            /* 删除按钮样式，优化比例 */
            .javdb-manager-panel .smart-action-button.delete.javdb-delete-btn {
                background: #e74c3c;
                color: white;
                width: 100%;
                padding: 14px 28px;
                font-size: 14px;
                font-weight: bold;
                border-radius: 8px;
                border: none;
                cursor: pointer;
                transition: all 0.2s ease;
                flex: 1;
                text-overflow: visible;
                overflow: visible;
                white-space: nowrap;
                display: flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                position: relative;
                z-index: 10;
                outline: none;
                min-height: 44px;
                letter-spacing: 1px;
                box-shadow: 0 2px 8px rgba(231, 76, 60, 0.2);
            }

            .javdb-manager-panel .smart-action-button.delete.javdb-delete-btn:hover {
                background: #c0392b;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(231, 76, 60, 0.3);
            }

            .javdb-manager-panel .smart-action-button.delete.javdb-delete-btn:active {
                transform: translateY(-1px);
                box-shadow: 0 2px 6px rgba(231, 76, 60, 0.2);
            }

            /* 确保删除按钮内容不被遮挡 */
            .javdb-manager-panel .smart-action-button.delete.javdb-delete-btn::before,
            .javdb-manager-panel .smart-action-button.delete.javdb-delete-btn::after {
                display: none !important;
                content: none !important;
            }

            /* 删除按钮容器样式 */
            .javdb-manager-panel .smart-actions {
                padding: 15px 0 5px 0;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .smart-action-button.add-watched:hover {
                background: #c0392b;
            }

            .smart-action-button.add-wanted:hover {
                background: #e67e22;
            }

            /* 开关样式 */
            .switch-container {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .switch-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 0;
            }

            .switch-label {
                color: white;
                font-size: 13px;
                font-weight: 500;
                flex: 1;
            }

            .switch {
                position: relative;
                display: inline-block;
                width: 44px;
                height: 24px;
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
                background-color: rgba(255, 255, 255, 0.2);
                transition: .4s;
                border-radius: 24px;
            }

            .slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }

            input:checked + .slider {
                background-color: #3498db;
            }

            input:checked + .slider:before {
                transform: translateX(20px);
            }

            .switch:hover .slider {
                background-color: rgba(255, 255, 255, 0.3);
            }

            input:checked + .slider:hover {
                background-color: #2980b9;
            }

            /* 屏蔽效果样式（已看想看） - 只暗淡不变灰 */
            .movie-list .item.javdb-blocked:not(.javdb-low-score) {
                opacity: 0.5 !important;
                filter: none !important;
                transition: all 0.3s ease !important;
                position: relative;
            }

            .movie-list .item.javdb-blocked:not(.javdb-low-score):hover {
                opacity: 0.7 !important;
                filter: none !important;
            }

            /* 屏蔽标记 */
            .movie-list .item.javdb-blocked::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                z-index: 1;
            }

            /* 看过标记 */
            .movie-list .item.javdb-watched::before {
                content: '已看';
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

            /* 想看标记 */
            .movie-list .item.javdb-wanted::before {
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

            /* 如果既是看过又是想看（优先显示看过） */
            .movie-list .item.javdb-watched.javdb-wanted::before {
                content: '已看';
                background: rgba(231, 76, 60, 0.9);
            }
            
            /* 看过页面中的想看影片特殊样式 - 不屏蔽但标记为可转移到看过 */
            body[data-page="watched"] .movie-list .item.javdb-wanted:not(.javdb-blocked) {
                border: 2px dashed rgba(243, 156, 18, 0.6) !important;
                background: rgba(243, 156, 18, 0.05) !important;
            }
            
            /* 想看页面中的已看影片特殊样式 - 不屏蔽但标记为已看过 */
            body[data-page="wanted"] .movie-list .item.javdb-watched:not(.javdb-blocked) {
                border: 2px dashed rgba(231, 76, 60, 0.6) !important;
                background: rgba(231, 76, 60, 0.05) !important;
            }

            /* 低分屏蔽样式（更暗更灰） */
            .movie-list .item.javdb-low-score {
                opacity: 0.2 !important;
                filter: grayscale(90%) !important;
                transition: all 0.3s ease !important;
                position: relative;
            }

            .movie-list .item.javdb-low-score:hover {
                opacity: 0.35 !important;
                filter: grayscale(70%) !important;
            }

            /* 低分屏蔽标记 */
            .movie-list .item.javdb-low-score::before {
                content: '低分';
                position: absolute;
                top: 5px;
                right: 5px;
                background: rgba(149, 165, 166, 0.9);
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: bold;
                z-index: 2;
                pointer-events: none;
            }

            /* 正常评分样式（3.5-4.0分） */
            .movie-list .item.javdb-normal-score {
                /* 保持默认样式，不添加特殊效果 */
            }

            /* 高分高亮样式（4.0分以上）- 更明显 */
            .movie-list .item.javdb-high-score {
                box-shadow: 0 0 0 3px rgba(46, 204, 113, 0.8), 0 4px 12px rgba(46, 204, 113, 0.3) !important;
                border-radius: 6px !important;
                transition: all 0.3s ease !important;
                transform: translateY(-2px) !important;
                background: linear-gradient(135deg, rgba(46, 204, 113, 0.05), rgba(39, 174, 96, 0.02)) !important;
            }

            .movie-list .item.javdb-high-score:hover {
                box-shadow: 0 0 0 4px rgba(46, 204, 113, 1), 0 6px 20px rgba(46, 204, 113, 0.4) !important;
                transform: translateY(-4px) scale(1.02) !important;
                background: linear-gradient(135deg, rgba(46, 204, 113, 0.1), rgba(39, 174, 96, 0.05)) !important;
            }

            /* 高分标记 */
            .movie-list .item.javdb-high-score:not(.javdb-blocked):not(.javdb-low-score)::after {
                content: '推荐';
                position: absolute;
                top: 5px;
                left: 5px;
                background: linear-gradient(135deg, #2ecc71, #27ae60) !important;
                color: white;
                padding: 4px 10px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: bold;
                z-index: 3;
                pointer-events: none;
                box-shadow: 0 3px 8px rgba(46, 204, 113, 0.4);
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            }

            /* 优秀影片样式（4.5分以上且评价人数多）- 超级明显 */
            .movie-list .item.javdb-excellent {
                box-shadow: 0 0 0 4px rgba(241, 196, 15, 0.9), 0 6px 20px rgba(241, 196, 15, 0.4), 0 0 30px rgba(241, 196, 15, 0.2) !important;
                border-radius: 8px !important;
                transition: all 0.3s ease !important;
                transform: translateY(-3px) !important;
                background: linear-gradient(135deg, rgba(241, 196, 15, 0.1), rgba(243, 156, 18, 0.05)) !important;
                position: relative;
                overflow: visible;
            }

            .movie-list .item.javdb-excellent:hover {
                box-shadow: 0 0 0 6px rgba(241, 196, 15, 1), 0 8px 30px rgba(241, 196, 15, 0.6), 0 0 40px rgba(241, 196, 15, 0.3) !important;
                transform: translateY(-6px) scale(1.03) !important;
                background: linear-gradient(135deg, rgba(241, 196, 15, 0.15), rgba(243, 156, 18, 0.08)) !important;
            }

            /* 优秀影片标记 */
            .movie-list .item.javdb-excellent:not(.javdb-blocked):not(.javdb-low-score)::after {
                content: '必看';
                position: absolute;
                top: 5px;
                left: 5px;
                background: linear-gradient(135deg, #f1c40f, #f39c12) !important;
                color: white;
                padding: 5px 12px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: bold;
                z-index: 4;
                pointer-events: none;
                box-shadow: 0 4px 12px rgba(241, 196, 15, 0.5);
                text-shadow: 0 1px 3px rgba(0,0,0,0.3);
                animation: excellentPulse 2s infinite;
            }

            /* 优秀影片闪光效果 */
            @keyframes excellentPulse {
                0% {
                    box-shadow: 0 4px 12px rgba(241, 196, 15, 0.5), 0 0 0 0 rgba(241, 196, 15, 0.7);
                }
                70% {
                    box-shadow: 0 4px 12px rgba(241, 196, 15, 0.5), 0 0 0 15px rgba(241, 196, 15, 0);
                }
                100% {
                    box-shadow: 0 4px 12px rgba(241, 196, 15, 0.5), 0 0 0 0 rgba(241, 196, 15, 0);
                }
            }

            /* 屏蔽的影片不显示评分高亮标记 */
            .movie-list .item.javdb-blocked.javdb-high-score::after,
            .movie-list .item.javdb-blocked.javdb-excellent::after {
                display: none;
            }

            /* 低分屏蔽的影片不显示评分高亮标记 */
            .movie-list .item.javdb-low-score.javdb-high-score::after,
            .movie-list .item.javdb-low-score.javdb-excellent::after {
                display: none;
            }
        `;
        
        // 只添加一次样式
        if (!document.querySelector('style[data-javdb-manager]')) {
            style.setAttribute('data-javdb-manager', 'true');
            document.head.appendChild(style);
        }

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
        importTab.textContent = '导入';
        importTab.setAttribute('data-tab', 'import');

        const manageTab = document.createElement('button');
        manageTab.className = 'manager-tab';
        manageTab.textContent = '管理';
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

        buttonContainer.appendChild(watchedBtn);
        buttonContainer.appendChild(wantedBtn);

        const stopBtn = document.createElement('button');
        stopBtn.id = 'global-stop-btn';
        stopBtn.className = 'manager-button stop';
        stopBtn.textContent = '停止';

        importContent.appendChild(buttonContainer);
        importContent.appendChild(stopBtn);

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
        
        // 已看屏蔽开关
        const watchedSwitch = createSwitch('已看屏蔽', 'enableWatchedBlock', CONFIG.enableWatchedBlock);
        switchContainer.appendChild(watchedSwitch);
        
        // 想看屏蔽开关
        const wantedSwitch = createSwitch('想看屏蔽', 'enableWantedBlock', CONFIG.enableWantedBlock);
        switchContainer.appendChild(wantedSwitch);
        
        // 低分屏蔽开关（同时控制高分高亮）
        const scoreSwitch = createSwitch('评分功能', 'enableLowScoreBlock', CONFIG.enableLowScoreBlock);
        switchContainer.appendChild(scoreSwitch);

        manageContent.appendChild(switchContainer);

        // 添加数据清理按钮
        const cleanupContainer = document.createElement('div');
        cleanupContainer.style.marginTop = '15px';
        cleanupContainer.style.paddingTop = '15px';
        cleanupContainer.style.borderTop = '1px solid rgba(255,255,255,0.2)';

        const cleanupResult = document.createElement('div');
        cleanupResult.id = 'cleanup-result';
        cleanupResult.style.cssText = `
            display: none;
            margin-bottom: 10px;
            padding: 10px;
            border-radius: 6px;
            font-size: 12px;
            text-align: center;
        `;

        const cleanupButton = document.createElement('button');
        cleanupButton.className = 'manager-button';
        cleanupButton.style.cssText = `
            background: linear-gradient(135deg, #e74c3c, #c0392b);
            color: white;
            width: 100%;
            font-size: 13px;
            padding: 10px;
        `;
        cleanupButton.textContent = '🧹 去重并标准化数据';
        cleanupButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const result = cleanupData();

            // 显示结果
            cleanupResult.style.display = 'block';
            if (result.changed) {
                const totalRemoved = result.before.total - result.after.total;
                cleanupResult.style.background = 'rgba(39, 174, 96, 0.2)';
                cleanupResult.style.border = '1px solid rgba(39, 174, 96, 0.5)';
                cleanupResult.style.color = '#27ae60';
                cleanupResult.style.textAlign = 'left';
                
                // 构建详情信息
                let detailsHtml = '';
                if (result.removed.duplicates > 0) {
                    detailsHtml += `<div>• 重复/无效：${result.removed.duplicates} 个</div>`;
                }
                if (result.removed.prefix > 0) {
                    detailsHtml += `<div>• 前缀去重：${result.removed.prefix} 个</div>`;
                    if (result.details.watchedPrefix.length > 0) {
                        detailsHtml += `<div style="margin-left: 10px; font-size: 11px; color: rgba(255,255,255,0.7);">已看移除：${result.details.watchedPrefix.slice(0, 5).join(', ')}${result.details.watchedPrefix.length > 5 ? '...' : ''}</div>`;
                    }
                    if (result.details.wantedPrefix.length > 0) {
                        detailsHtml += `<div style="margin-left: 10px; font-size: 11px; color: rgba(255,255,255,0.7);">想看移除：${result.details.wantedPrefix.slice(0, 5).join(', ')}${result.details.wantedPrefix.length > 5 ? '...' : ''}</div>`;
                    }
                }
                if (result.removed.crossList > 0) {
                    detailsHtml += `<div>• 跨列表重复：${result.removed.crossList} 个</div>`;
                }
                
                cleanupResult.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 8px; text-align: center;">✅ 清理完成</div>
                    <div style="display: flex; justify-content: space-around; margin-bottom: 8px; text-align: center;">
                        <div>已看：${result.before.watched} → ${result.after.watched}</div>
                        <div>想看：${result.before.wanted} → ${result.after.wanted}</div>
                    </div>
                    <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 8px;">
                        ${detailsHtml}
                    </div>
                    <div style="margin-top: 8px; font-weight: bold; text-align: center;">共清理 ${totalRemoved} 个番号</div>
                `;
            } else {
                cleanupResult.style.background = 'rgba(52, 152, 219, 0.2)';
                cleanupResult.style.border = '1px solid rgba(52, 152, 219, 0.5)';
                cleanupResult.style.color = '#3498db';
                cleanupResult.style.textAlign = 'center';
                cleanupResult.innerHTML = `
                    <div style="font-weight: bold;">✓ 数据已是最新状态</div>
                    <div style="font-size: 11px; margin-top: 3px;">没有发现需要清理的数据</div>
                `;
            }

            // 更新显示
            updateGlobalCount();
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
        floatingWindow.addEventListener('click', function(e) {
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
            localStorageImporting: localStorage.getItem('javdb_importing')
        });
        
        const watchedCodes = GM_getValue(CONFIG.watchedStorageKey, []);
        const wantedCodes = GM_getValue(CONFIG.wantedStorageKey, []);
        const totalCount = watchedCodes.length + wantedCodes.length;
        
        // 从localStorage读取当前状态，确保页面刷新后状态正确
        const isImporting = localStorage.getItem('javdb_importing') === 'true';
        const importType = localStorage.getItem('javdb_import_type');
        const importedCount = localStorage.getItem('javdb_imported_count') || '0';
        
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
                    <div style="font-size: 11px; opacity: 0.8; color: #f39c12;">正在导入${typeText}</div>
                    <div style="font-size: 18px; font-weight: bold; color: #f39c12;">${importedCount}</div>
                    <div style="font-size: 10px; opacity: 0.7; margin-top: 2px;">
                        本次导入数量 | 本页: ${currentPageItems} 个
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
                    <div style="font-size: 11px; opacity: 0.8;">已保存总数</div>
                    <div style="font-size: 18px; font-weight: bold; color: #3498db;">${totalCount}</div>
                    <div style="font-size: 10px; opacity: 0.7; margin-top: 2px;">
                        看过: ${watchedCodes.length} | 想看: ${wantedCodes.length}
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

    // 移除快速导入按钮（不再需要）
    function addQuickImportButton() {
        // 功能已整合到全局悬浮窗中，不再需要单独的按钮
    }

    // 开始导入
    function startImport(type) {
        // 如果当前不在对应页面，先跳转并记录待导入状态
        if (type === 'watched' && !window.location.href.includes('watched_videos')) {
            localStorage.setItem('javdb_pending_import', 'watched');
            window.location.href = 'https://javdb.com/users/watched_videos?page=1';
            return;
        }
        // 如果当前不在对应页面，先跳转并记录待导入状态
        if (type === 'wanted' && !window.location.href.includes('want_watch_videos')) {
            localStorage.setItem('javdb_pending_import', 'wanted');
            window.location.href = 'https://javdb.com/users/want_watch_videos?page=1';
            return;
        }
        
        // 设置localStorage状态
        localStorage.setItem('javdb_importing', 'true');
        localStorage.setItem('javdb_imported_count', '0');
        localStorage.setItem('javdb_import_type', type);
        
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
        
        // 立即清除localStorage状态
        localStorage.removeItem('javdb_pending_import');
        localStorage.removeItem('javdb_importing');
        localStorage.removeItem('javdb_imported_count');
        localStorage.removeItem('javdb_import_type');
        
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

    // 保存当前页面的番号
    function saveCurrentPageCodes() {
        debugLog('保存当前页面的番号');
        
        const items = document.querySelectorAll('.movie-list .item');
        const pageCodes = [];

        items.forEach(item => {
            // 使用通用函数提取番号
            const code = getVideoCodeFromItem(item);
            if (code && !pageCodes.includes(code)) {
                pageCodes.push(code);
            }
        });

        if (pageCodes.length > 0) {
            debugLog(`当前页面找到 ${pageCodes.length} 个番号:`, pageCodes);
            
            // 保存番号
            saveCodes(pageCodes);
            
            // 同步到localStorage
            if (CONFIG.isImporting) {
                localStorage.setItem('javdb_imported_count', CONFIG.importedCount.toString());
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
        
        // 清除所有localStorage状态
        localStorage.removeItem('javdb_pending_import');
        localStorage.removeItem('javdb_importing');
        localStorage.removeItem('javdb_imported_count');
        localStorage.removeItem('javdb_import_type');
        
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
        // 移除已存在的提示
        const existingMsg = document.getElementById('javdb-stop-message');
        if (existingMsg) {
            existingMsg.remove();
        }
        
        const stopDiv = document.createElement('div');
        stopDiv.id = 'javdb-stop-message';
        stopDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(231, 76, 60, 0.95);
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 10002;
            font-family: Arial, sans-serif;
            font-size: 14px;
            text-align: center;
            backdrop-filter: blur(10px);
        `;
        stopDiv.textContent = '导入已停止';
        
        document.body.appendChild(stopDiv);
        
        // 2秒后自动移除
        setTimeout(() => {
            if (stopDiv.parentNode) {
                stopDiv.parentNode.removeChild(stopDiv);
            }
            // 停止后自动最小化面板
            const panel = document.getElementById('javdb-global-floating-window');
            if (panel && !panel.classList.contains('minimized')) {
                panel.classList.add('minimized');
            }
        }, 2000);
    }

    // 提取并保存当前页面的番号
    function extractAndSaveCurrentPage() {
        // 双重检查：内存状态和localStorage状态
        if (!CONFIG.isImporting || localStorage.getItem('javdb_importing') !== 'true') {
            debugLog('导入已停止，取消当前页面处理');
            return;
        }

        const items = document.querySelectorAll('.movie-list .item');
        const pageCodes = [];

        items.forEach(item => {
            // 使用通用函数提取番号
            const code = getVideoCodeFromItem(item);
            if (code && !pageCodes.includes(code)) {
                pageCodes.push(code);
            }
        });

        // 保存番号
        saveCodes(pageCodes);

        // 更新计数
        if (pageCodes.length > 0) {
            localStorage.setItem('javdb_imported_count', CONFIG.importedCount.toString());
        }
        
        updateGlobalCount();

        // 检查是否有下一页
        setTimeout(() => {
            // 再次检查状态，防止在等待期间被停止
            if (CONFIG.isImporting && localStorage.getItem('javdb_importing') === 'true') {
                goToNextPage();
            } else {
                debugLog('在等待翻页期间检测到停止信号');
            }
        }, 1000);
    }

    // 保存番号
    function saveCodes(newCodes) {
        const storageKey = CONFIG.currentPageType === 'watched' ? CONFIG.watchedStorageKey : CONFIG.wantedStorageKey;
        const oppositeKey = CONFIG.currentPageType === 'watched' ? CONFIG.wantedStorageKey : CONFIG.watchedStorageKey;
        const existingCodes = GM_getValue(storageKey, []);
        const oppositeCodes = GM_getValue(oppositeKey, []);

        // 对新番号进行标准化处理
        const normalizedNewCodes = newCodes.map(code => normalizeCode(code));

        // 从对面列表中移除当前导入的番号（不区分大小写和空格）
        const newOppositeCodes = oppositeCodes.filter(code => !normalizedNewCodes.some(newCode => isCodeMatch(code, newCode)));
        if (newOppositeCodes.length !== oppositeCodes.length) {
            GM_setValue(oppositeKey, newOppositeCodes);
            debugLog(`从对面列表移除了 ${oppositeCodes.length - newOppositeCodes.length} 个重复番号`);
        }

        // 合并并去重
        const allCodes = [...new Set([...existingCodes, ...normalizedNewCodes])];

        // 保存
        GM_setValue(storageKey, allCodes);

        // 计算新增数量（不包括从对面列表移除的）
        const newCount = allCodes.length - existingCodes.length;

        // 更新内存计数
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
        if (!CONFIG.isImporting || localStorage.getItem('javdb_importing') !== 'true') {
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
            if (localStorage.getItem('javdb_importing') !== 'true') {
                debugLog('翻页前检查到停止信号，取消翻页');
                return;
            }
            
            // 保存当前导入状态到localStorage
            localStorage.setItem('javdb_importing', 'true');
            localStorage.setItem('javdb_imported_count', CONFIG.importedCount.toString());
            localStorage.setItem('javdb_import_type', CONFIG.currentPageType);
            
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
        
        // 创建一个临时的完成提示
        const completionDiv = document.createElement('div');
        completionDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(39, 174, 96, 0.95);
            color: white;
            padding: 20px 30px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10002;
            font-family: Arial, sans-serif;
            font-size: 16px;
            text-align: center;
            backdrop-filter: blur(10px);
        `;
        completionDiv.innerHTML = `
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">导入完成！</div>
            <div>${typeName}影片共导入 ${CONFIG.importedCount} 个</div>
        `;
        
        document.body.appendChild(completionDiv);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (completionDiv.parentNode) {
                completionDiv.parentNode.removeChild(completionDiv);
            }
            // 完成后自动最小化面板
            const panel = document.getElementById('javdb-global-floating-window');
            if (panel && !panel.classList.contains('minimized')) {
                panel.classList.add('minimized');
            }
        }, 3000);
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

    // 智能输入处理
    function handleSmartInput() {
        const smartInput = document.getElementById('smart-input');
        const smartResult = document.getElementById('smart-result');
        const smartActions = document.getElementById('smart-actions');
        const code = smartInput.value.trim();

        // 清除之前的定时器
        if (window.smartInputTimer) {
            clearTimeout(window.smartInputTimer);
        }

        // 如果输入为空，隐藏结果
        if (!code) {
            smartResult.style.display = 'none';
            smartActions.style.display = 'none';
            return;
        }

        // 立即处理，实时匹配
        const watchedCodes = GM_getValue(CONFIG.watchedStorageKey, []);
        const wantedCodes = GM_getValue(CONFIG.wantedStorageKey, []);
        const allCodes = [...watchedCodes, ...wantedCodes];

        let found = false;
        let location = '';
        let candidates = [];

        // 精确匹配（不区分大小写和空格）
        const watchedMatch = findMatchingCode(code, watchedCodes);
        const wantedMatch = findMatchingCode(code, wantedCodes);
        let matchedCode = null;
        
        if (watchedMatch) {
            found = true;
            location = '看过';
            matchedCode = watchedMatch;
        } else if (wantedMatch) {
            found = true;
            location = '想看';
            matchedCode = wantedMatch;
        }

        // 查找候选匹配（不区分大小写和空格，支持前缀匹配）
        if (!found && code.length >= 1) {
            candidates = allCodes.filter(c => 
                isCodeMatch(c, code) || isCodePrefixMatch(code, c)
            ).slice(0, 5); // 最多显示5个候选
        }

        smartResult.style.display = 'block';

        if (found) {
            smartResult.className = 'smart-result found';
            smartResult.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 5px;">已找到</div>
                <div>搜索: ${code}</div>
                <div>匹配: ${matchedCode}</div>
                <div>位置: ${location}列表</div>
            `;

            // 显示删除按钮，居中显示
            smartActions.style.display = 'flex';
            smartActions.style.justifyContent = 'center';
            smartActions.innerHTML = '';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'smart-action-button delete active javdb-delete-btn';
            deleteBtn.textContent = '删除';
            deleteBtn.addEventListener('click', () => smartDeleteCode(matchedCode));
            smartActions.appendChild(deleteBtn);
        } else if (candidates.length > 0) {
            smartResult.className = 'smart-result not-found';
            let candidatesHtml = '<div style="font-weight: bold; margin-bottom: 5px;">候选番号:</div>';
            candidates.forEach(candidate => {
                const location = findMatchingCode(candidate, watchedCodes) ? '看过' : '想看';
                candidatesHtml += `<div style="cursor: pointer; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.1);" data-candidate="${candidate}">${candidate} (${location})</div>`;
            });
            smartResult.innerHTML = candidatesHtml;

            // 添加候选点击事件
            smartResult.querySelectorAll('[data-candidate]').forEach(elem => {
                elem.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const candidate = e.target.getAttribute('data-candidate');
                    selectCandidate(candidate);
                });
            });

            // 隐藏操作按钮，等待用户选择候选
            smartActions.style.display = 'none';
        } else {
            smartResult.className = 'smart-result not-found';
            smartResult.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 5px;">未找到</div>
                <div>番号: ${code}</div>
                <div>可以添加到看过或想看列表</div>
            `;

            // 显示添加按钮
            smartActions.style.display = 'flex';
            smartActions.innerHTML = '';
            
            const addWatchedBtn = document.createElement('button');
            addWatchedBtn.className = 'smart-action-button add-watched';
            addWatchedBtn.textContent = '添加到看过';
            addWatchedBtn.addEventListener('click', () => smartAddCode(code, 'watched'));
            smartActions.appendChild(addWatchedBtn);
            
            const addWantedBtn = document.createElement('button');
            addWantedBtn.className = 'smart-action-button add-wanted';
            addWantedBtn.textContent = '添加到想看';
            addWantedBtn.addEventListener('click', () => smartAddCode(code, 'wanted'));
            smartActions.appendChild(addWantedBtn);
        }
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

        // 获取当前列表
        let codes = GM_getValue(storageKey, []);
        let oppositeCodes = GM_getValue(oppositeKey, []);

        // 检查是否已在列表中（不区分大小写和空格）
        if (findMatchingCode(normalizedCode, codes)) {
            showMessage(`番号 ${normalizedCode} 已在${type === 'watched' ? '看过' : '想看'}列表中`, 'warning');
            return;
        }

        // 检查是否在对面列表中（不区分大小写和空格）
        if (findMatchingCode(normalizedCode, oppositeCodes)) {
            // 从对面列表中移除
            oppositeCodes = oppositeCodes.filter(c => !isCodeMatch(c, normalizedCode));
            GM_setValue(oppositeKey, oppositeCodes);
            showMessage(`番号 ${normalizedCode} 已从${type === 'watched' ? '想看' : '看过'}列表移除，并添加到${type === 'watched' ? '看过' : '想看'}列表`, 'info');
        } else {
            showMessage(`番号 ${normalizedCode} 已添加到${type === 'watched' ? '看过' : '想看'}列表`, 'success');
        }

        // 添加到新列表
        codes.push(normalizedCode);
        GM_setValue(storageKey, codes);

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
        const watchedCodes = GM_getValue(CONFIG.watchedStorageKey, []);
        const wantedCodes = GM_getValue(CONFIG.wantedStorageKey, []);
        
        let deleted = false;
        let deletedFrom = '';
        
        // 检查并从看过列表删除
        const watchedMatch = findMatchingCode(code, watchedCodes);
        if (watchedMatch) {
            const newWatchedCodes = watchedCodes.filter(c => !isCodeMatch(c, code));
            GM_setValue(CONFIG.watchedStorageKey, newWatchedCodes);
            deleted = true;
            deletedFrom = '看过';
        }
        
        // 检查并从想看列表删除
        const wantedMatch = findMatchingCode(code, wantedCodes);
        if (wantedMatch) {
            const newWantedCodes = wantedCodes.filter(c => !isCodeMatch(c, code));
            GM_setValue(CONFIG.wantedStorageKey, newWantedCodes);
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

    // 显示消息提示
    function showMessage(text, type) {
        // 移除已存在的提示
        const existingMsg = document.getElementById('javdb-message');
        if (existingMsg) {
            existingMsg.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.id = 'javdb-message';
        
        let bgColor = '#3498db'; // 默认蓝色
        if (type === 'success') bgColor = '#27ae60';
        else if (type === 'error') bgColor = '#e74c3c';
        else if (type === 'warning') bgColor = '#f39c12';

        messageDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${bgColor};
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 10002;
            font-family: Arial, sans-serif;
            font-size: 14px;
            text-align: center;
            backdrop-filter: blur(10px);
        `;
        messageDiv.textContent = text;

        document.body.appendChild(messageDiv);

        // 2秒后自动移除
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 2000);
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

                    debugLog('点击了删除按钮，准备刷新页面');

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
        // 详情页面：使用 h2.title 提取番号
        const titleElement = document.querySelector('h2.title') || document.querySelector('h2[class*="title"]');
        if (titleElement) {
            const strongElement = titleElement.querySelector('strong');
            if (strongElement) {
                const strongText = strongElement.textContent.trim();
                // 判断是否为日式番号（包含 - 号）
                if (strongText.includes('-')) {
                    const normalizedCode = normalizeCode(strongText);
                    debugLog(`从 h2.title strong 获取日式番号: ${strongText} -> 标准化: ${normalizedCode}`);
                    return normalizedCode;
                } else {
                    // 欧美区：获取完整标题（strong + current-title）
                    let fullTitle = titleElement.textContent.trim();
                    // 去掉日期部分（如 .26.01.31、.20.06.08）
                    fullTitle = fullTitle.replace(/\.\d{2}\.\d{2}\.\d{2}/g, '');
                    // 标准化处理（会自动去除空格并转大写）
                    const normalizedCode = normalizeCode(fullTitle);
                    debugLog(`从 h2.title 获取欧美区完整番号: ${fullTitle} -> 标准化: ${normalizedCode}`);
                    return normalizedCode;
                }
            }
        }

        debugLog('无法从详情页面提取番号');
        return null;
    }
    
    // 添加影片到列表
    function addVideoToList(videoCode, listType) {
        // 标准化番号
        const normalizedCode = normalizeCode(videoCode);
        debugLog(`添加番号 ${videoCode} -> 标准化: ${normalizedCode} 到 ${listType} 列表`);

        const storageKey = listType === 'watched' ? CONFIG.watchedStorageKey : CONFIG.wantedStorageKey;
        const oppositeKey = listType === 'watched' ? CONFIG.wantedStorageKey : CONFIG.watchedStorageKey;

        // 获取现有列表
        let currentList = GM_getValue(storageKey, []);
        let oppositeList = GM_getValue(oppositeKey, []);

        // 检查是否已存在（不区分大小写和空格）
        if (findMatchingCode(normalizedCode, currentList)) {
            showMessage(`番号 ${normalizedCode} 已在${listType === 'watched' ? '看过' : '想看'}列表中`, 'warning');
            return;
        }

        // 从对面列表中移除（如果存在，不区分大小写和空格）
        if (findMatchingCode(normalizedCode, oppositeList)) {
            oppositeList = oppositeList.filter(code => !isCodeMatch(code, normalizedCode));
            GM_setValue(oppositeKey, oppositeList);
            showMessage(`番号 ${normalizedCode} 已从${listType === 'watched' ? '想看' : '看过'}列表移除，并添加到${listType === 'watched' ? '看过' : '想看'}列表`, 'info');
        } else {
            showMessage(`番号 ${normalizedCode} 已添加到${listType === 'watched' ? '看过' : '想看'}列表`, 'success');
        }

        // 添加到新列表
        currentList.push(normalizedCode);
        GM_setValue(storageKey, currentList);

        // 更新UI
        updateGlobalCount();

        // 重新应用屏蔽效果
        setTimeout(() => {
            applyBlockEffect();
        }, 100);

        debugLog(`成功添加 ${normalizedCode} 到 ${listType} 列表`);
    }

    // 清理函数，在页面卸载时调用
    window.addEventListener('beforeunload', () => {
        urlObserver.disconnect();
    });

})();
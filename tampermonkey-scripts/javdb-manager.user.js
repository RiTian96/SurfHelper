// ==UserScript==
// @name         JavDB影片管理器
// @namespace    https://github.com/RiTian96/SurfHelper
// @version      1.9.0
// @description  [核心] 看过/想看影片自动屏蔽，智能评分分级（低分/高分）；[功能] 批量导入，大图预览，数据备份；[支持] 欧美区番号
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
    
    // 从影片项中提取番号（支持日式和欧美区）
    // 规则：
    // - 日式番号（去除日期后仍有数字）：只保留番号，不需要标题，全部大写
    // - 欧美区番号（去除日期后纯字母）：保留完整番号+标题（不含日期），全部大写
    function getVideoCodeFromItem(item) {
        // 列表页面：统一使用 .video-title
        const videoTitle = item.querySelector('.video-title');
        if (videoTitle) {
            const strongElement = videoTitle.querySelector('strong');
            if (strongElement) {
                const strongText = strongElement.textContent.trim();
                
                // 先去除日期格式，再判断是否为欧美区
                let cleanedStrong = strongText;
                cleanedStrong = cleanedStrong.replace(/\.\d{2}\.\d{2}\.\d{2}/g, '');
                cleanedStrong = cleanedStrong.replace(/\.\d{4}\.\d{2}\.\d{2}/g, '');
                
                // 判断去除日期后是否为纯字母（欧美区）
                const isPureLetters = /^[a-zA-Z]+$/.test(cleanedStrong.replace(/\s+/g, ''));
                
                if (isPureLetters) {
                    // 欧美区：使用完整 title（番号+标题），去掉日期
                    let fullTitle = videoTitle.textContent.trim();
                    const normalizedCode = normalizeCode(fullTitle);
                    debugLog(`从 video-title 获取欧美区完整番号: ${fullTitle} -> 标准化: ${normalizedCode}`);
                    return normalizedCode;
                } else {
                    // 日式番号：只需要番号部分，不需要标题
                    // 番号格式可能为：ABC-123, ABC_123, ABC123 等
                    const normalizedCode = normalizeCode(strongText);
                    debugLog(`从 video-title strong 获取日式番号: ${strongText} -> 标准化: ${normalizedCode}`);
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

    // 番号标准化函数
    // 规则：
    // - 欧美区（去除日期后纯字母）：全部大写，保留完整标题
    // - 日厂（去除日期后仍有数字）：全部大写，只保留字母、数字、-、_
    function normalizeCode(code) {
        if (!code || typeof code !== 'string') return code;
        
        // 先去除空格
        let normalized = code.replace(/\s+/g, '');
        
        // 去除日期格式（欧美区常见）
        // 格式1: .YY.MM.DD 如 .26.02.26
        // 格式2: .YYYY.MM.DD 如 .2026.02.26
        normalized = normalized.replace(/\.\d{2}\.\d{2}\.\d{2}/g, '');
        normalized = normalized.replace(/\.\d{4}\.\d{2}\.\d{2}/g, '');
        
        // 判断是否为纯字母（欧美区）- 去除日期后再判断
        const isPureLetters = /^[a-zA-Z]+$/.test(normalized);
        
        if (isPureLetters) {
            // 纯字母（欧美区）：全部大写，保留完整标题
            return normalized.toUpperCase();
        } else {
            // 带数字（日厂）：
            // 1. 全部大写
            // 2. 只保留字母、数字、-、_
            normalized = normalized.toUpperCase();
            normalized = normalized.replace(/[^A-Z0-9\-_]/g, '');
            return normalized;
        }
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

    // 清理番号：用于清理已存储的旧数据
    // 规则：
    // 1. 去日期、转大写
    // 2. 尝试匹配标准番号格式，只保留番号部分
    // 3. 如果不匹配标准格式，只保留字母、数字、-、_
    function cleanCodeForNewRule(code) {
        if (!code || typeof code !== 'string') return null;
        
        // 先去除空格
        let cleaned = code.replace(/\s+/g, '');
        
        // 去除日期格式
        cleaned = cleaned.replace(/\.\d{2}\.\d{2}\.\d{2}/g, '');
        cleaned = cleaned.replace(/\.\d{4}\.\d{2}\.\d{2}/g, '');
        
        // 统一转大写
        cleaned = cleaned.toUpperCase();
        
        // 尝试匹配标准日厂番号格式（优先匹配，只保留番号部分）
        
        // 格式1: 带连接符 XXX-123 或 XXX_123（字母或数字开头）
        // 如: FCP-089, 111315_189, ABC_123
        const matchWithSeparator = cleaned.match(/^([A-Z0-9]+[-_][A-Z0-9]+)/);
        if (matchWithSeparator) {
            return matchWithSeparator[1];
        }
        
        // 格式2: 纯字母+数字（无连接符）XXX123 或 XXX123XXX
        // 如: FZ65, ABC123
        // 但要避免把标题里的 VOL65AV 也混进去，只取第一个"字母+数字"组合
        const matchAlphaNum = cleaned.match(/^([A-Z]+[0-9]+)/);
        if (matchAlphaNum) {
            return matchAlphaNum[1];
        }
        
        // 格式3: 纯数字开头（一些特殊番号）
        // 如: 123456
        const matchPureNum = cleaned.match(/^([0-9]+)/);
        if (matchPureNum && !cleaned.match(/^[0-9]+[A-Z]/)) {
            return matchPureNum[1];
        }
        
        // 如果都不匹配，保留全部字母、数字、-、_
        cleaned = cleaned.replace(/[^A-Z0-9\-_]/g, '');
        return cleaned || null;
    }

    // 数据清理：手动执行，清理和标准化已存储的番号数据
    function cleanupData() {
        debugLog('开始数据清理：清理和标准化已存储的番号');

        const result = {
            before: { watched: 0, wanted: 0, total: 0 },
            after: { watched: 0, wanted: 0, total: 0 },
            removed: { duplicates: 0, invalid: 0, crossList: 0, prefix: 0 },
            details: { watchedPrefix: [], wantedPrefix: [] },
            changed: false
        };

        // 处理看过列表
        const watchedCodes = GM_getValue(CONFIG.watchedStorageKey, []);
        result.before.watched = watchedCodes.length;

        // 使用新的清理规则标准化
        let processedWatched = watchedCodes
            .map(code => cleanCodeForNewRule(code))
            .filter(code => code); // 移除无效番号
        
        result.removed.invalid = watchedCodes.length - processedWatched.length;

        // 去重
        const beforeDedup = processedWatched.length;
        processedWatched = [...new Set(processedWatched)];
        result.removed.duplicates += beforeDedup - processedWatched.length;

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

        // 排序
        processedWatched = processedWatched.sort();

        result.after.watched = processedWatched.length;

        // 检查是否有变化
        const watchedChanged = processedWatched.length !== watchedCodes.length ||
                               JSON.stringify(processedWatched) !== JSON.stringify(watchedCodes);
        if (watchedChanged) {
            GM_setValue(CONFIG.watchedStorageKey, processedWatched);
            result.changed = true;
            debugLog(`看过列表：${watchedCodes.length} -> ${processedWatched.length}，清理了 ${watchedCodes.length - processedWatched.length} 项`);
        }

        // 处理想看列表
        const wantedCodes = GM_getValue(CONFIG.wantedStorageKey, []);
        result.before.wanted = wantedCodes.length;

        // 使用新的清理规则标准化
        let processedWanted = wantedCodes
            .map(code => cleanCodeForNewRule(code))
            .filter(code => code);

        result.removed.invalid += wantedCodes.length - processedWanted.length;

        // 去重
        const beforeDedupWanted = processedWanted.length;
        processedWanted = [...new Set(processedWanted)];
        result.removed.duplicates += beforeDedupWanted - processedWanted.length;

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

        // 排序
        processedWanted = processedWanted.sort();

        result.after.wanted = processedWanted.length;

        // 检查是否有变化
        const wantedChanged = processedWanted.length !== wantedCodes.length ||
                              JSON.stringify(processedWanted) !== JSON.stringify(wantedCodes);
        if (wantedChanged) {
            GM_setValue(CONFIG.wantedStorageKey, processedWanted);
            result.changed = true;
            debugLog(`想看列表：${wantedCodes.length} -> ${processedWanted.length}，清理了 ${wantedCodes.length - processedWanted.length} 项`);
        }

        // 检查两个列表之间的重复（一个番号不能同时在看过和想看中）
        // 注意：现在大小写敏感，需要精确匹配
        const duplicates = processedWatched.filter(code => processedWanted.includes(code));
        if (duplicates.length > 0) {
            debugLog(`发现跨列表重复项：`, duplicates);
            // 默认保留在看过列表中，从想看列表移除
            const newWanted = processedWanted.filter(code => !processedWatched.includes(code)).sort();
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
- 无效/标准化：${result.removed.invalid}
- 重复：${result.removed.duplicates}
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
        const savedImagePreview = localStorage.getItem('javdb_enable_image_preview');
        
        if (savedWatchedBlock !== null) {
            CONFIG.enableWatchedBlock = savedWatchedBlock === 'true';
        }
        if (savedWantedBlock !== null) {
            CONFIG.enableWantedBlock = savedWantedBlock === 'true';
        }
        if (savedLowScoreBlock !== null) {
            CONFIG.enableLowScoreBlock = savedLowScoreBlock === 'true';
        }
        if (savedImagePreview !== null) {
            CONFIG.enableImagePreview = savedImagePreview === 'true';
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
        localStorage.setItem('javdb_enable_watched_block', CONFIG.enableWatchedBlock.toString());
        localStorage.setItem('javdb_enable_wanted_block', CONFIG.enableWantedBlock.toString());
        localStorage.setItem('javdb_enable_low_score_block', CONFIG.enableLowScoreBlock.toString());
        localStorage.setItem('javdb_enable_image_preview', CONFIG.enableImagePreview.toString());
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
            
            // 应用屏蔽效果（看过/想看）
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
            // 在看过页面，只屏蔽看过的，不屏蔽想看的
            if (CONFIG.currentPageType === 'watched') {
                if (findMatchingCode(code, watchedCodes) && CONFIG.enableWatchedBlock) {
                    item.classList.add('javdb-watched');
                    shouldBlock = true;
                    debugLog(`看过页面屏蔽看过番号: ${code}`);
                }
                // 在看过页面，想看的影片正常显示，但添加标记以便区分
                else if (findMatchingCode(code, wantedCodes)) {
                    item.classList.add('javdb-wanted');
                    // 不设置shouldBlock，所以不会被屏蔽
                    debugLog(`看过页面显示想看番号: ${code}（不屏蔽）`);
                }
            }
            // 在想看页面，只屏蔽想看的，不屏蔽看过的
            else if (CONFIG.currentPageType === 'wanted') {
                if (findMatchingCode(code, wantedCodes) && CONFIG.enableWantedBlock) {
                    item.classList.add('javdb-wanted');
                    shouldBlock = true;
                    debugLog(`想看页面屏蔽想看番号: ${code}`);
                }
                // 在想看页面，看过的影片正常显示，但添加标记以便区分
                else if (findMatchingCode(code, watchedCodes)) {
                    item.classList.add('javdb-watched');
                    // 不设置shouldBlock，所以不会被屏蔽
                    debugLog(`想看页面显示看过番号: ${code}（不屏蔽）`);
                }
            }
            // 在其他页面，按照原来的逻辑屏蔽所有
            else {
                // 检查是否在看过列表中
                if (findMatchingCode(code, watchedCodes) && CONFIG.enableWatchedBlock) {
                    item.classList.add('javdb-watched');
                    shouldBlock = true;
                    debugLog(`其他页面屏蔽看过番号: ${code}`);
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

    /**
     * =================================================================
     * 大图预览组件 (Magic Lens)
     * =================================================================
     */
    
    // 大图预览状态
    const LensState = {
        isVisible: false,
        currentSrc: null
    };

    // 初始化大图预览组件
    function initMagicLens() {
        // 创建透镜容器
        const lens = document.createElement('div');
        lens.id = 'javdb-magic-lens';
        lens.innerHTML = '<img id="javdb-lens-img" src="">';
        document.body.appendChild(lens);

        // 绑定事件
        bindMagicLensEvents();
        
        debugLog('大图预览组件初始化完成');
    }

    // 绑定大图预览事件
    function bindMagicLensEvents() {
        // 鼠标悬停显示大图
        document.body.addEventListener('mouseover', function(e) {
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
        document.body.addEventListener('mouseout', function(e) {
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
        document.addEventListener('mousemove', function(e) {
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

        buttonContainer.appendChild(watchedBtn);
        buttonContainer.appendChild(wantedBtn);

        const stopBtn = document.createElement('button');
        stopBtn.id = 'global-stop-btn';
        stopBtn.className = 'manager-button stop';
        stopBtn.textContent = '停止';

        importContent.appendChild(buttonContainer);
        importContent.appendChild(stopBtn);

        // === 数据导入导出功能 ===
        const ioContainer = document.createElement('div');
        ioContainer.style.cssText = `
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid rgba(255,255,255,0.2);
        `;

        const ioTitle = document.createElement('div');
        ioTitle.style.cssText = `
            font-size: 13px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #3498db;
            text-align: center;
        `;
        ioTitle.textContent = '💾 数据备份';

        // 导入结果提示区域
        const ioResult = document.createElement('div');
        ioResult.id = 'io-result';
        ioResult.style.cssText = `
            display: none;
            margin-bottom: 10px;
            padding: 10px;
            border-radius: 6px;
            font-size: 12px;
            text-align: left;
        `;

        // 按钮容器
        const ioButtons = document.createElement('div');
        ioButtons.style.cssText = `
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
        `;

        // 导出按钮
        const exportBtn = document.createElement('button');
        exportBtn.className = 'manager-button';
        exportBtn.style.cssText = `
            background: linear-gradient(135deg, #27ae60, #2ecc71);
            color: white;
            flex: 1;
        `;
        exportBtn.textContent = '📤 导出数据';
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportData();
        });

        // 导入按钮
        const importBtn = document.createElement('button');
        importBtn.className = 'manager-button';
        importBtn.style.cssText = `
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            flex: 1;
        `;
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
        cleanupButton.textContent = '🗑️ 清空所有数据';
        cleanupButton.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const watchedCodes = GM_getValue(CONFIG.watchedStorageKey, []);
            const wantedCodes = GM_getValue(CONFIG.wantedStorageKey, []);
            const totalCount = watchedCodes.length + wantedCodes.length;
            
            if (totalCount === 0) {
                showMessage('没有数据需要清空', 'warning');
                return;
            }
            
            // 二次确认对话框
            if (confirm(`⚠️ 确认清空所有数据？\n\n此操作将删除：\n• 看过列表：${watchedCodes.length} 个\n• 想看列表：${wantedCodes.length} 个\n\n此功能用于清除过去错误格式的历史数据，清空后不可恢复！`)) {
                // 清空数据
                GM_setValue(CONFIG.watchedStorageKey, []);
                GM_setValue(CONFIG.wantedStorageKey, []);
                
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
                    <div style="font-size: 12px; color: #f39c12; text-align: center;">正在导入${typeText}</div>
                    <div style="display: flex; justify-content: space-around; margin-top: 8px; text-align: center;">
                        <div>
                            <div style="font-size: 20px; font-weight: bold; color: #f39c12;">${importedCount}</div>
                            <div style="font-size: 10px; opacity: 0.7;">已导入</div>
                        </div>
                        <div>
                            <div style="font-size: 20px; font-weight: bold; color: #3498db;">${currentPageItems}</div>
                            <div style="font-size: 10px; opacity: 0.7;">本页</div>
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
            GM_setValue(oppositeKey, newOppositeCodes.sort());
            debugLog(`从对面列表移除了 ${oppositeCodes.length - newOppositeCodes.length} 个重复番号`);
        }

        // 合并、去重并排序
        const allCodes = [...new Set([...existingCodes, ...normalizedNewCodes])].sort();

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
            // 从对面列表中移除并排序
            oppositeCodes = oppositeCodes.filter(c => !isCodeMatch(c, normalizedCode)).sort();
            GM_setValue(oppositeKey, oppositeCodes);
            showMessage(`番号 ${normalizedCode} 已从${type === 'watched' ? '想看' : '看过'}列表移除，并添加到${type === 'watched' ? '看过' : '想看'}列表`, 'info');
        } else {
            showMessage(`番号 ${normalizedCode} 已添加到${type === 'watched' ? '看过' : '想看'}列表`, 'success');
        }

        // 添加到新列表并排序
        codes.push(normalizedCode);
        GM_setValue(storageKey, codes.sort());

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
            const newWatchedCodes = watchedCodes.filter(c => !isCodeMatch(c, code)).sort();
            GM_setValue(CONFIG.watchedStorageKey, newWatchedCodes);
            deleted = true;
            deletedFrom = '看过';
        }
        
        // 检查并从想看列表删除
        const wantedMatch = findMatchingCode(code, wantedCodes);
        if (wantedMatch) {
            const newWantedCodes = wantedCodes.filter(c => !isCodeMatch(c, code)).sort();
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

    // === 数据导入导出功能实现 ===

    // 导出数据到本地JSON文件
    function exportData() {
        const watchedCodes = GM_getValue(CONFIG.watchedStorageKey, []);
        const wantedCodes = GM_getValue(CONFIG.wantedStorageKey, []);
        
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
            background: rgba(44, 62, 80, 0.98);
            color: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            z-index: 10003;
            font-family: Arial, sans-serif;
            min-width: 320px;
            max-width: 90vw;
            border: 1px solid rgba(255,255,255,0.15);
        `;
        
        // 获取当前数据统计
        const currentWatched = GM_getValue(CONFIG.watchedStorageKey, []);
        const currentWanted = GM_getValue(CONFIG.wantedStorageKey, []);
        
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
            result.watched.before = GM_getValue(CONFIG.watchedStorageKey, []).length;
            result.wanted.before = GM_getValue(CONFIG.wantedStorageKey, []).length;
            
            // 看过优先：从想看中移除看过中已有的番号
            const watchedSet = new Set(importWatched);
            const finalWatched = [...new Set(importWatched)].sort();
            const finalWanted = importWanted.filter(code => !watchedSet.has(code)).sort();
            
            GM_setValue(CONFIG.watchedStorageKey, finalWatched);
            GM_setValue(CONFIG.wantedStorageKey, finalWanted);
            
            result.watched.after = finalWatched.length;
            result.wanted.after = finalWanted.length;
            result.watched.added = finalWatched.length;
            result.wanted.added = finalWanted.length;
            
        } else {
            // 合并模式：合并、去重并排序
            const currentWatched = GM_getValue(CONFIG.watchedStorageKey, []);
            const currentWanted = GM_getValue(CONFIG.wantedStorageKey, []);
            
            result.watched.before = currentWatched.length;
            result.wanted.before = currentWanted.length;
            
            // 合并看过列表
            const mergedWatched = [...new Set([...currentWatched, ...importWatched])].sort();
            
            // 合并想看列表
            const mergedWanted = [...new Set([...currentWanted, ...importWanted])].sort();
            
            // 看过优先：从想看中移除看过中已有的番号
            const watchedSet = new Set(mergedWatched);
            const finalWanted = mergedWanted.filter(code => !watchedSet.has(code)).sort();
            
            GM_setValue(CONFIG.watchedStorageKey, mergedWatched);
            GM_setValue(CONFIG.wantedStorageKey, finalWanted);
            
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
    // 规则：
    // - 日式番号（去除日期后仍有数字）：只保留番号，不需要标题，全部大写
    // - 欧美区番号（去除日期后纯字母）：保留完整番号+标题（不含日期），全部大写
    function getCurrentVideoCode() {
        // 详情页面：使用 h2.title 提取番号
        const titleElement = document.querySelector('h2.title') || document.querySelector('h2[class*="title"]');
        if (titleElement) {
            const strongElement = titleElement.querySelector('strong');
            if (strongElement) {
                const strongText = strongElement.textContent.trim();
                
                // 先去除日期格式，再判断是否为欧美区
                let cleanedStrong = strongText;
                cleanedStrong = cleanedStrong.replace(/\.\d{2}\.\d{2}\.\d{2}/g, '');
                cleanedStrong = cleanedStrong.replace(/\.\d{4}\.\d{2}\.\d{2}/g, '');
                
                // 判断去除日期后是否为纯字母（欧美区）
                const isPureLetters = /^[a-zA-Z]+$/.test(cleanedStrong.replace(/\s+/g, ''));
                
                if (isPureLetters) {
                    // 欧美区：获取完整标题（strong + current-title），去掉日期
                    let fullTitle = titleElement.textContent.trim();
                    const normalizedCode = normalizeCode(fullTitle);
                    debugLog(`从 h2.title 获取欧美区完整番号: ${fullTitle} -> 标准化: ${normalizedCode}`);
                    return normalizedCode;
                } else {
                    // 日式番号：只需要番号部分，不需要标题
                    const normalizedCode = normalizeCode(strongText);
                    debugLog(`从 h2.title strong 获取日式番号: ${strongText} -> 标准化: ${normalizedCode}`);
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
            oppositeList = oppositeList.filter(code => !isCodeMatch(code, normalizedCode)).sort();
            GM_setValue(oppositeKey, oppositeList);
            showMessage(`番号 ${normalizedCode} 已从${listType === 'watched' ? '想看' : '看过'}列表移除，并添加到${listType === 'watched' ? '看过' : '想看'}列表`, 'info');
        } else {
            showMessage(`番号 ${normalizedCode} 已添加到${listType === 'watched' ? '看过' : '想看'}列表`, 'success');
        }

        // 添加到新列表并排序
        currentList.push(normalizedCode);
        GM_setValue(storageKey, currentList.sort());

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
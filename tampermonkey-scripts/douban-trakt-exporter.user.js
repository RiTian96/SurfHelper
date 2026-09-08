// ==UserScript==
// @name         豆瓣观影数据导出Trakt
// @namespace    https://github.com/RiTian96/SurfHelper
// @version      1.2.0
// @description  [核心] 抓取豆瓣看过/想看的电影与剧集，自动匹配IMDb编号并导出Trakt可导入JSON；[辅助] 豆瓣ID自动识别、断点续传、暂停续跑、IMDb缓存、安全验证自动暂停、未匹配清单；[资源] 右上角玻璃拟态面板与实时日志。
// @author       RiTian96
// @match        *://movie.douban.com/*
// @match        *://www.douban.com/*
// @match        *://douban.com/*
// @icon         https://www.douban.com/favicon.ico
// @icon         https://www.google.com/s2/favicons?sz=64&domain=douban.com
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      movie.douban.com
// @connect      sec.douban.com
// @run-at       document-idle
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/douban-trakt-exporter.user.js
// @downloadURL  https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/douban-trakt-exporter.user.js
// ==/UserScript==

(function () {
    'use strict';

    /**
     * =================================================================
     * 1. 全局配置 (Configuration)
     * =================================================================
     */
    const CONFIG = {
        DEBUG: false,          // 生产环境设为 false，调试时设为 true
        uid: '',               // 豆瓣用户 ID
        isRunning: false,      // 任务是否在运行
        isPaused: false,       // 是否处于暂停（含安全验证等待）
        isStopped: false,      // 是否被手动停止
        speedTier: 'normal'    // 请求间隔档位：slow / normal / fast
    };

    // GM 存储键
    // Trakt 官方 JSON 导入入口（模式必须是 media + trakt-json）
    const TRAKT_IMPORT_URL = 'https://app.trakt.tv/settings/data?mode=media&source=trakt-json';

    const STORAGE_KEY = {
        UID: 'db_trakt_uid',
        ITEMS: 'db_trakt_items_v1',       // { doubanId: Item }
        IMDB: 'db_trakt_imdb_v1',         // { doubanId: 'tt1234567' } 断点续传核心
        TASK: 'db_trakt_task_v1',         // 未完成任务状态
        OPTIONS: 'db_trakt_options_v1',   // 面板选项
        PANEL_OPEN: 'db_trakt_panel_open_v1' // 面板展开/收起状态
    };

    // 四个可导出的列表（豆瓣影视页用 type=movie / type=tv 区分电影与剧集）
    const RANGES = [
        { key: 'movie_collect', label: '电影·看过', list: 'collect', type: 'movie', watched: true },
        { key: 'movie_wish', label: '电影·想看', list: 'wish', type: 'movie', watched: false },
        { key: 'tv_collect', label: '剧集·看过', list: 'collect', type: 'tv', watched: true },
        { key: 'tv_wish', label: '剧集·想看', list: 'wish', type: 'tv', watched: false }
    ];

    // 请求间隔档位（毫秒，区间内随机）
    const SPEED_TIERS = {
        slow: [2500, 4000],
        normal: [1500, 3000],
        fast: [800, 1600]
    };

    // 列表页每页条数不固定：列表模式 30 条、网格模式 15 条。
    // 因此分页步长取「本页实际解析条数」，不设常量，避免漏采。
    const TIME_SUFFIX = 'T12:00:00Z'; // 豆瓣只给到日期，统一补正午（UTC）
    const CHUNK_SIZE = 1000;     // 单个 JSON 文件最大条数
    const FLUSH_EVERY = 20;      // 每解析 N 条写一次 GM 存储
    const MAX_LOG_LINES = 200;   // 日志区最大行数

    const log = (...args) => CONFIG.DEBUG && console.log('[豆瓣→Trakt]', ...args);

    // 运行时状态
    const State = {
        items: {},        // doubanId -> Item
        order: [],        // 保持插入顺序
        imdb: {},         // doubanId -> imdbId
        imdbDirty: 0,
        selectedKeys: [],   // 当前任务选择的列表
        rangesDone: [],     // 已采集完成的列表
        resumeStart: 0,     // 续传时的起始游标
        crawlStart: 0,
        imdbCursor: 0,
        stats: { crawled: 0, matched: 0, unmatched: 0, skipped: 0 }
    };

    /**
     * =================================================================
     * 2. 存储层 (GM Storage)
     * =================================================================
     */
    const DataCache = {
        _cache: new Map(),
        _ttl: 5000,
        get(key) {
            const item = this._cache.get(key);
            if (!item) return null;
            if (Date.now() - item.timestamp > this._ttl) {
                this._cache.delete(key);
                return null;
            }
            return item.value;
        },
        set(key, value) { this._cache.set(key, { value, timestamp: Date.now() }); },
        invalidate(key) { this._cache.delete(key); }
    };

    function safeExecute(fn, context = '', defaultValue = null) {
        try {
            return fn();
        } catch (error) {
            console.error(`[豆瓣→Trakt] ${context} 出错:`, error);
            return defaultValue;
        }
    }

    function getCachedValue(key, defaultValue = null) {
        const cacheKey = `gm_${key}`;
        const cached = DataCache.get(cacheKey);
        if (cached !== null) return cached;
        const value = safeExecute(() => GM_getValue(key, defaultValue), `获取 ${key}`);
        DataCache.set(cacheKey, value);
        return value;
    }

    function setCachedValue(key, value) {
        safeExecute(() => {
            GM_setValue(key, value);
            DataCache.invalidate(`gm_${key}`);
        }, `设置 ${key}`);
    }

    function deleteCachedValue(key) {
        safeExecute(() => {
            GM_deleteValue(key);
            DataCache.invalidate(`gm_${key}`);
        }, `删除 ${key}`);
    }

    function readJson(key, defaultValue) {
        const raw = getCachedValue(key, null);
        if (raw === null || raw === undefined || raw === '') return defaultValue;
        try {
            const parsed = JSON.parse(raw);
            return (parsed === null || parsed === undefined) ? defaultValue : parsed;
        } catch (e) {
            log(`解析 ${key} 失败，使用默认值`, e);
            return defaultValue;
        }
    }

    function writeJson(key, obj) {
        setCachedValue(key, JSON.stringify(obj));
    }

    /**
     * =================================================================
     * 3. 网络层 (Fetch & 反爬判定)
     * =================================================================
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function randDelay() {
        const range = SPEED_TIERS[CONFIG.speedTier] || SPEED_TIERS.normal;
        return range[0] + Math.random() * (range[1] - range[0]);
    }

    // 最终跳转地址（兼容 GM_xmlhttpRequest 的 finalUrl 与 fetch 的 url）
    function finalUrlOf(res) {
        return (res && (res.finalUrl || res.url)) || '';
    }

    // 被送去登录页 = 请求没带上登录态
    function isLoginRedirect(res) {
        const u = finalUrlOf(res);
        return u.indexOf('accounts.douban.com') !== -1 || /\/accounts\/login/.test(u);
    }

    // 判定是否被豆瓣安全校验拦截
    function isBlocked(res, html) {
        if (res.status === 403 || res.status === 429) return true;
        const u = finalUrlOf(res);
        if (u.indexOf('sec.douban.com') !== -1) return true;
        if (isLoginRedirect(res)) return true;
        if (res.type === 'opaqueredirect' || res.status === 0) return true; // fetch manual 下的重定向
        const text = html || '';
        const head = text.slice(0, 6000);
        if (/请完成安全验证|检测到有异常请求|异常请求来自/.test(head)) return true;
        // 安全校验中间页：HTTP 200，标题是纯「豆瓣」，正文只有约 3KB（正常页 30KB 以上）
        if (text.length < 10000 && /<title>\s*豆瓣\s*<\/title>/.test(head)) return true;
        return false;
    }

    // 用油猴原生 API 发请求。相比页面里的 fetch，它不受 CORS 限制，
    // 且会跟随重定向并给出 finalUrl —— 这是判断「被送去安全校验页还是登录页」的唯一可靠依据。
    // 页面 fetch 在油猴沙箱里常常直接抛 Failed to fetch，连响应对象都拿不到，无法诊断。
    function gmRequest(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('GM_xmlhttpRequest 不可用'));
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'text',
                timeout: 30000,
                headers: { 'Accept': 'text/html,application/xhtml+xml' },
                onload: (res) => resolve(res),
                onerror: (e) => reject(new Error((e && e.error) || '请求失败')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    // 页面 fetch 兜底（GM 不可用时）
    async function pageFetch(url) {
        const res = await fetch(url, {
            credentials: 'include',
            redirect: 'manual',
            headers: { 'Accept': 'text/html,application/xhtml+xml' }
        });
        return {
            status: res.status,
            url: res.url,
            type: res.type,
            responseText: await res.text()
        };
    }

    async function fetchText(url, retries) {
        const max = (retries === undefined || retries === null) ? 2 : retries;
        let lastErr = null;

        for (let attempt = 0; attempt <= max; attempt++) {
            if (attempt > 0) await sleep(2500 * attempt);

            let res;
            try {
                res = typeof GM_xmlhttpRequest === 'function'
                    ? await gmRequest(url)
                    : await pageFetch(url);
            } catch (e) {
                lastErr = e; // 网络层失败，重试
                continue;
            }

            const html = res.responseText || '';
            if (isBlocked(res, html)) {
                const err = new Error(isLoginRedirect(res) ? 'NEED_LOGIN' : 'SEC_CHECK');
                err.blocked = true;
                err.status = res.status;
                throw err;
            }
            if (res.status >= 400) {
                const err = new Error(`HTTP_${res.status}`);
                err.status = res.status;
                if (res.status >= 500) { lastErr = err; continue; } // 服务端错误可重试
                throw err;
            }
            return html;
        }
        throw lastErr || new Error('请求失败');
    }

    /**
     * =================================================================
     * 4. 解析层 (Parsers)
     * =================================================================
     */
    function toDoc(html) {
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function buildListUrl(range, start) {
        return `https://movie.douban.com/people/${CONFIG.uid}/${range.list}` +
               `?type=${range.type}&start=${start}&sort=time&filter=all&mode=list`;
    }

    // 解析单个列表页
    // 豆瓣有两种浏览模式，脚本必须都能吃下：
    //   列表模式 ul.list-view > li.item     （mode=list，每页 30 条，评分在 .date 内部）
    //   网格模式 div.grid-view > div.item   （默认/ mode=grid，每页 15 条，评分是 .date 的兄弟节点）
    function parseListPage(html, range) {
        const doc = toDoc(html);
        let nodes = Array.prototype.slice.call(doc.querySelectorAll('ul.list-view li.item'));
        if (!nodes.length) {
            nodes = Array.prototype.slice.call(doc.querySelectorAll('div.grid-view div.item'));
        }
        const out = [];

        nodes.forEach(li => {
            // 豆瓣 ID：优先 li#list1300522，兜底取条目链接
            let id = '';
            if (li.id && li.id.indexOf('list') === 0) {
                id = li.id.slice(4);
            }
            if (!id) {
                const link = li.querySelector('a[href*="/subject/"]');
                const m = link && link.getAttribute('href').match(/subject\/(\d+)/);
                id = m ? m[1] : '';
            }
            if (!id) return;

            // 标题（用于日志与未匹配清单）
            const titleEl = li.querySelector('.title a') || li.querySelector('.pic a[title]');
            let title = '';
            if (titleEl) {
                title = (titleEl.getAttribute('title') || titleEl.textContent || '')
                    .replace(/\s+/g, ' ').trim();
            }

            // 评分：rating1-t ~ rating5-t，未评分时该元素不存在
            // 注意：列表模式里评分嵌在 .date 内，网格模式里它是 .date 的兄弟节点，
            // 所以这里在整条目范围内查找，不做层级限定。
            let rating = null;
            const ratingEl = li.querySelector('span[class^="rating"]');
            if (ratingEl) {
                const m = ratingEl.className.match(/rating(\d)/);
                if (m) rating = parseInt(m[1], 10) * 2; // 5星制 ×2 → 2/4/6/8/10
            }

            // 标记日期：只有年月日
            let date = null;
            const dateEl = li.querySelector('.date');
            if (dateEl) {
                const dm = dateEl.textContent.match(/(\d{4}-\d{2}-\d{2})/);
                if (dm) date = dm[1];
            }

            out.push({
                id: id,
                title: title,
                traktType: range.type === 'tv' ? 'show' : 'movie',
                watched: !!range.watched,
                watchlist: !range.watched,
                watchedDate: range.watched ? date : null,
                watchlistDate: range.watched ? null : date,
                rating: rating
            });
        });

        return out;
    }

    // 列表总条数（.subject-num：1-30 / 2531）
    function parseTotal(html) {
        const doc = toDoc(html);
        const el = doc.querySelector('.subject-num');
        if (!el) return null;
        const text = el.textContent.replace(/\u00a0/g, ' ');
        const m = text.match(/(\d+)\s*\/\s*(\d+)/);
        return m ? parseInt(m[2], 10) : null;
    }

    // 是否有下一页
    function hasNextPage(html) {
        const doc = toDoc(html);
        if (doc.querySelector('.paginator .next a, .paginator a.next')) return true;
        return /后页/.test(html);
    }

    // 从条目页提取 IMDb 编号
    function extractImdb(html) {
        const doc = toDoc(html);
        const info = doc.querySelector('#info');
        const text = info ? info.textContent : (doc.body ? doc.body.textContent : '');
        const m = text.match(/(tt\d{5,10})/);
        return m ? m[1] : null;
    }

    // 判断是否为正常的条目页：拦截页/空页没有 #info 资料区块
    function isSubjectPage(html) {
        if (!html) return false;
        if (/id="info"/.test(html)) return true;
        return html.length > 25000; // 有些页面结构不同，正文够长也认为是正常页
    }

    /**
     * =================================================================
     * 5. 组装层 (Merge & Build)
     * =================================================================
     */
    function mergeItems(list) {
        list.forEach(item => {
            const cur = State.items[item.id];
            if (!cur) {
                State.items[item.id] = item;
                State.order.push(item.id);
                return;
            }
            // 同一条目出现在多个列表时合并（如既看过又想看）
            if (item.watched && item.watchedDate) {
                cur.watched = true;
                cur.watchedDate = cur.watchedDate || item.watchedDate;
            }
            if (item.watchlist && item.watchlistDate) {
                cur.watchlist = true;
                cur.watchlistDate = cur.watchlistDate || item.watchlistDate;
            }
            if (cur.rating === null && item.rating !== null) cur.rating = item.rating;
            if (!cur.title && item.title) cur.title = item.title;
        });
        State.stats.crawled = State.order.length;
    }

    function buildTraktArray() {
        const matched = [];
        const unmatched = [];
        const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

        State.order.forEach(id => {
            const item = State.items[id];
            const imdbId = State.imdb[id];
            if (!imdbId) {
                unmatched.push({
                    douban_id: id,
                    title: item.title,
                    type: item.traktType,
                    url: `https://movie.douban.com/subject/${id}/`
                });
                return;
            }

            // 字段顺序严格按 Trakt 导入要求
            const rec = {
                imdb_id: imdbId,
                type: item.traktType
            };
            if (item.watched) {
                rec.watched_at = item.watchedDate ? item.watchedDate + TIME_SUFFIX : 'unknown';
            }
            if (item.watchlist) {
                rec.watchlisted_at = item.watchlistDate ? item.watchlistDate + TIME_SUFFIX : nowIso;
            }
            if (item.rating !== null && item.rating !== undefined) {
                rec.rating = item.rating;
                const d = item.watchedDate || item.watchlistDate;
                rec.rated_at = d ? d + TIME_SUFFIX : nowIso;
            }
            matched.push(rec);
        });

        return { matched, unmatched };
    }

    function splitChunks(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * =================================================================
     * 6. 导出层 (Download)
     * =================================================================
     */
    function downloadJson(fileName, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function todayStr() {
        return new Date().toISOString().split('T')[0];
    }

    function exportResult(onlyUnmatched) {
        const { matched, unmatched } = buildTraktArray();
        const day = todayStr();

        if (onlyUnmatched) {
            if (!unmatched.length) {
                showToast('没有未匹配条目 🎉', { type: 'success' });
                return;
            }
            downloadJson(`douban_trakt_unmatched_${day}.json`, unmatched);
            showToast(`已导出 ${unmatched.length} 条未匹配清单`, { type: 'success' });
            return;
        }

        if (!matched.length) {
            showToast('暂无可导出的数据，请先执行导出任务', { type: 'warning' });
            return;
        }

        const chunks = splitChunks(matched, CHUNK_SIZE);
        chunks.forEach((chunk, i) => {
            const name = chunks.length > 1
                ? `douban_trakt_${day}_${i + 1}.json`
                : `douban_trakt_${day}.json`;
            downloadJson(name, chunk);
        });

        if (unmatched.length) {
            downloadJson(`douban_trakt_unmatched_${day}.json`, unmatched);
        }

        showToast(`已导出 ${matched.length} 条（${chunks.length} 个文件），未匹配 ${unmatched.length} 条`,
            { type: 'success', duration: 4000 });
        appendLog(`✅ 导出完成：${matched.length} 条匹配，${unmatched.length} 条未匹配`, 'success');
    }

    /**
     * =================================================================
     * 7. 任务调度层 (State Machine)
     * =================================================================
     */
    function isAborted() {
        return !CONFIG.isRunning || CONFIG.isStopped;
    }

    // 暂停时挂起，直到「继续」或被停止
    async function waitIfPaused() {
        while (CONFIG.isPaused && !isAborted()) {
            await sleep(400);
        }
    }

    function saveTask(extra) {
        const task = Object.assign({
            uid: CONFIG.uid,
            phase: 'crawl',
            ranges: CONFIG.selectedRanges,
            rangesDone: State.rangesDone || [],
            crawlStart: State.crawlStart || 0,
            imdbCursor: State.imdbCursor || 0,
            speedTier: CONFIG.speedTier,
            stats: State.stats,
            savedAt: Date.now()
        }, extra || {});
        writeJson(STORAGE_KEY.TASK, task);
    }

    function flushItems() {
        writeJson(STORAGE_KEY.ITEMS, State.items);
    }

    function flushImdb(force) {
        if (!force && State.imdbDirty < FLUSH_EVERY) return;
        writeJson(STORAGE_KEY.IMDB, State.imdb);
        State.imdbDirty = 0;
    }

    // 触发安全验证：暂停并等待用户处理后继续
    async function handleBlocked(url, reason) {
        // 允许直接传豆瓣条目 ID，自动拼成条目页地址
        const pageUrl = /^\d+$/.test(String(url))
            ? `https://movie.douban.com/subject/${url}/`
            : String(url);
        CONFIG.isPaused = true;
        updateButtons();
        const why = reason || '触发豆瓣安全验证';
        appendLog(`⚠ ${why}，请手动打开 <a href="${pageUrl}" target="_blank" rel="noopener">该页面</a> 完成验证后点「继续」`, 'warn');
        showToast(`⚠ ${why}，完成验证后点面板「继续」`, { type: 'warning', duration: 0 });
        await waitIfPaused();
        // 清除常驻的验证提示
        const toast = document.getElementById('db-trakt-toast');
        if (toast) toast.remove();
        if (isAborted()) return true;
        await sleep(1500); // 恢复后稍作缓冲，避免立刻再次被拦截
        return false;
    }

    // 阶段 A：翻页采集列表
    async function crawlPhase(ranges) {
        State.rangesDone = State.rangesDone || [];
        for (const range of ranges) {
            if (isAborted()) return;
            if (State.rangesDone.indexOf(range.key) !== -1) {
                appendLog(`跳过已完成列表：${range.label}`);
                continue;
            }
            appendLog(`开始采集 ${range.label} ...`);
            let start = 0;
            let pageNo = 1;
            let guard = 0;
            let failGuard = 0;

            while (true) {
                if (isAborted()) return;
                await waitIfPaused();
                if (isAborted()) return;

                let html;
                try {
                    html = await fetchText(buildListUrl(range, start));
                } catch (err) {
                    // 不直接放弃整个列表（那样会丢掉几百条），而是挂起等用户处理，
                    // 点「继续」后重试当前页。多数情况下手动打开一次页面即可解除。
                    let why;
                    if (err && err.blocked && err.message === 'NEED_LOGIN') {
                        why = '请求被跳转到登录页，登录态未生效';
                    } else if (err && err.blocked) {
                        why = '触发豆瓣安全验证';
                    } else {
                        why = `请求失败（${err.message}）`;
                    }
                    appendLog(`⚠ ${range.label} 第 ${pageNo} 页${why}，已暂停`, 'warn');
                    const stopped = await handleBlocked(buildListUrl(range, start), why);
                    if (stopped) return;
                    if (++failGuard > 20) {
                        appendLog(`❌ ${range.label} 反复失败，跳过该列表`, 'error');
                        break;
                    }
                    continue; // 重试当前页
                }

                const items = parseListPage(html, range);
                if (!items.length) {
                    appendLog(`${range.label} 第 ${pageNo} 页无数据，结束该列表`);
                    break;
                }
                mergeItems(items);
                flushItems();
                saveTask({ phase: 'crawl', crawlStart: start });

                const total = parseTotal(html);
                updateProgress(`采集中 · ${range.label} · 已采集 ${State.order.length} 条`,
                    total ? Math.min(1, (start + items.length) / total) : null);
                appendLog(`  ${range.label} 第 ${pageNo} 页 +${items.length} 条（累计 ${State.order.length}）`);

                // 步长取本页实际条数：列表模式 30、网格模式 15，写死会漏掉一半数据
                const nextStart = start + items.length;

                if (total !== null && nextStart >= total) break;
                if (!hasNextPage(html)) break;

                start = nextStart;
                pageNo++;
                if (++guard > 1000) break; // 安全阀
                await sleep(randDelay());
            }

            State.rangesDone.push(range.key);
            saveTask({ phase: 'crawl' });
        }
    }

    // 阶段 B：逐条匹配 IMDb
    async function imdbPhase() {
        const pending = State.order.filter(id => !State.imdb[id]);
        const total = pending.length;
        appendLog(`开始匹配 IMDb，共 ${total} 个条目（已缓存 ${Object.keys(State.imdb).length} 个）`);
        let anomaly = 0;   // 连续异常页计数，用于自动降速

        // 预检：先试抓一个条目页，确认能正常访问。
        // 否则会白白跑完几百条，最后发现 imdb_id 全是空的。
        if (total > 0) {
            try {
                const probe = await fetchText(`https://movie.douban.com/subject/${pending[0]}/`);
                if (!isSubjectPage(probe)) {
                    appendLog('⚠ 预检未通过：豆瓣条目页返回异常，可能已触发安全验证。', 'warn');
                    appendLog('  请在新标签页手动打开任意一个豆瓣条目页完成验证，再回到面板点「继续」。', 'warn');
                    const stopped = await handleBlocked(pending[0]);
                    if (stopped) return;
                }
            } catch (err) {
                if (err && err.blocked) {
                    const stopped = await handleBlocked(pending[0]);
                    if (stopped) return;
                } else {
                    appendLog(`⚠ 预检请求失败：${err.message}，稍后仍会继续尝试`, 'warn');
                }
            }
        }

        for (let i = 0; i < pending.length; i++) {
            if (isAborted()) return;
            await waitIfPaused();
            if (isAborted()) return;

            const id = pending[i];
            const name = (State.items[id] && State.items[id].title) || id;
            try {
                const html = await fetchText(`https://movie.douban.com/subject/${id}/`);

                // 页面没正常返回（拦截页漏网/空页）时，不能记成「该片无 IMDb」，
                // 否则华语片和被风控的条目会混在一起，永远补不回来。
                if (!isSubjectPage(html)) {
                    anomaly++;
                    State.stats.skipped++;
                    appendLog(`  ! ${name} 页面未正常返回，已跳过（重跑可补全）`, 'warn');
                    if (anomaly === 3 && CONFIG.speedTier !== 'slow') {
                        CONFIG.speedTier = 'slow';
                        appendLog('⚠ 连续返回异常页，已自动降速到「慢速」以降低风控概率', 'warn');
                    }
                } else {
                    anomaly = 0;
                    const imdbId = extractImdb(html);
                    if (imdbId) {
                        State.imdb[id] = imdbId;
                        State.imdbDirty++;
                        State.stats.matched = Object.keys(State.imdb).length;
                        appendLog(`  ✓ ${name} → ${imdbId}`);
                    } else {
                        State.stats.unmatched++;
                        appendLog(`  ✗ ${name} 无 IMDb 编号`, 'warn');
                    }
                }
            } catch (err) {
                if (err && err.blocked) {
                    const stopped = await handleBlocked(id);
                    if (stopped) return;
                    i--; // 验证完成后重试该条目
                    continue;
                }
                // 网络失败不等于「该片没有 IMDb」，记成待重跑，别污染未匹配清单
                State.stats.skipped++;
                appendLog(`  ! ${name} 请求失败：${err.message}，已跳过（重跑可补全）`, 'warn');
            }

            State.imdbCursor = i + 1;
            flushImdb(false);
            updateProgress(`匹配 IMDb · ${i + 1}/${total}`, total ? (i + 1) / total : 0);
            if (i < pending.length - 1) await sleep(randDelay());
        }

        flushImdb(true);
        saveTask({ phase: 'imdb' });
    }

    async function runTask(ranges) {
        CONFIG.isRunning = true;
        CONFIG.isStopped = false;
        CONFIG.isPaused = false;
        updateButtons();

        try {
            await crawlPhase(ranges);
            if (isAborted()) { finalize('已停止'); return; }

            await imdbPhase();
            if (isAborted()) { finalize('已停止'); return; }

            finalize('完成');
            const { matched, unmatched } = buildTraktArray();
            showToast(`采集完成：${State.order.length} 条，匹配 ${matched.length} 条，未匹配 ${unmatched.length} 条`,
                { type: 'success', duration: 5000 });
            exportResult(false);
        } catch (err) {
            console.error('[豆瓣→Trakt] 任务异常:', err);
            appendLog(`❌ 任务异常：${err.message}`, 'error');
            showToast(`任务异常：${err.message}`, { type: 'error', duration: 5000 });
            finalize('异常中断');
        }
    }

    function finalize(reason) {
        CONFIG.isRunning = false;
        CONFIG.isPaused = false;
        flushItems();
        flushImdb(true);
        CONFIG.isStopped = false;
        updateButtons();
        appendLog(`任务${reason}`, reason === '完成' ? 'success' : 'warn');
        if (reason === '完成') {
            deleteCachedValue(STORAGE_KEY.TASK);
        } else {
            saveTask({ phase: State.rangesDone && State.rangesDone.length ? 'imdb' : 'crawl' });
        }
    }

    function startTask() {
        const selected = getSelectedRanges();
        if (!selected.length) {
            showToast('请至少勾选一个导出范围', { type: 'warning' });
            return;
        }
        const uid = readUidInput();
        if (!uid) {
            showToast('请填写豆瓣 ID（个人主页链接中的那串 ID）', { type: 'warning' });
            return;
        }
        CONFIG.uid = uid;
        setCachedValue(STORAGE_KEY.UID, uid);
        saveOptions();

        // 断点续传：发现未完成任务时询问
        const task = readJson(STORAGE_KEY.TASK, null);
        let resume = false;
        if (task && task.uid === uid) {
            resume = window.confirm(
                `发现未完成的任务（阶段：${task.phase === 'imdb' ? '匹配 IMDb' : '采集列表'}，已采集 ${task.stats ? task.stats.crawled : 0} 条）。\n\n` +
                `点「确定」继续上次进度（自动跳过已解析的 IMDb），点「取消」重新开始采集。`
            );
        }

        State.items = resume ? readJson(STORAGE_KEY.ITEMS, {}) : {};
        State.order = Object.keys(State.items);
        State.imdb = readJson(STORAGE_KEY.IMDB, {});
        State.rangesDone = resume && task && task.rangesDone ? task.rangesDone : [];
        State.crawlStart = resume && task ? (task.crawlStart || 0) : 0;
        State.imdbCursor = resume && task ? (task.imdbCursor || 0) : 0;
        State.stats = {
            crawled: State.order.length,
            matched: Object.keys(State.imdb).length,
            unmatched: 0,
            skipped: 0
        };
        if (!resume) {
            deleteCachedValue(STORAGE_KEY.TASK);
        }

        updateStats();
        runTask(selected);
    }

    function stopTask() {
        if (!CONFIG.isRunning) return;
        CONFIG.isStopped = true;
        CONFIG.isPaused = false;
        showToast('已停止，进度已保存，下次可继续', { type: 'info' });
    }

    /**
     * =================================================================
     * 8. UI 层 (Glass Panel)
     * =================================================================
     */
    function injectStyles() {
        if (document.querySelector('style[data-douban-trakt]')) return;
        GM_addStyle(`
            /* === 基础面板：Apple 玻璃拟态（与 JavDB Manager 同一套设计语言） ===
               豆瓣是浅色站，面板底色比 JavDB 版更实一点，保证浅色页面上的可读性 */
            .db-trakt-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10001;
                background: rgba(20, 20, 25, 0.88);
                color: #f5f5f7;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 13px;
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                box-sizing: border-box;
            }
            .db-trakt-panel, .db-trakt-panel * { box-sizing: border-box !important; }

            /* --- 收起态：右上角 54px 圆球入口（与其他脚本一致） --- */
            .db-trakt-panel.minimized {
                width: 54px;
                height: 54px;
                min-width: 54px;
                padding: 0;
                border-radius: 27px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                overflow: hidden;
            }
            .db-trakt-panel.minimized:hover {
                transform: scale(1.05);
                background: rgba(40, 40, 45, 0.9);
            }
            .db-trakt-panel.minimized .db-trakt-header,
            .db-trakt-panel.minimized .db-trakt-body,
            .db-trakt-panel.minimized .db-trakt-close { display: none; }
            .db-trakt-panel.minimized .db-trakt-icon { display: block; }
            .db-trakt-panel:not(.minimized) .db-trakt-icon { display: none; }

            .db-trakt-icon {
                font-size: 26px;
                line-height: 1;
                user-select: none;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
            }

            /* --- 展开态 --- */
            .db-trakt-panel:not(.minimized) {
                width: 380px;
                max-width: calc(100vw - 40px);
                max-height: 85vh;
                padding: 20px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            /* 关闭/收起按钮 */
            .db-trakt-close {
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
            .db-trakt-close:hover {
                background: rgba(255, 69, 58, 0.8);
                color: white;
                transform: rotate(90deg);
            }

            .db-trakt-header {
                flex-shrink: 0;
                color: #ffffff;
                font-size: 18px;
                font-weight: 700;
                margin-bottom: 16px;
                text-align: center;
                letter-spacing: 0.5px;
                text-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }

            .db-trakt-body { flex: 1; overflow-y: auto; }
            .db-trakt-body::-webkit-scrollbar { width: 6px; }
            .db-trakt-body::-webkit-scrollbar-track { background: transparent; }
            .db-trakt-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
            .db-trakt-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }

            /* --- 导出范围卡片 --- */
            .db-trakt-section-label {
                font-size: 12px; color: rgba(235,235,245,0.6);
                font-weight: 600; letter-spacing: 0.3px; margin-bottom: 8px;
            }
            .db-trakt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
            .db-trakt-check {
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 12px;
                padding: 10px;
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                font-size: 12px;
                color: rgba(235,235,245,0.85);
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                user-select: none;
            }
            .db-trakt-check:hover {
                background: rgba(255,255,255,0.1);
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(0,0,0,0.2);
            }
            .db-trakt-check.checked {
                border-color: rgba(65,189,85,0.5);
                background: rgba(65,189,85,0.12);
                color: #ffffff;
            }
            .db-trakt-check input { accent-color: #41bd55; cursor: pointer; margin: 0; flex-shrink: 0; }

            /* --- 表单行 --- */
            .db-trakt-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
            .db-trakt-label { font-size: 12px; color: rgba(235,235,245,0.6); font-weight: 600; letter-spacing: 0.3px; white-space: nowrap; }
            .db-trakt-panel select, .db-trakt-panel input[type="text"] {
                flex: 1;
                min-width: 0;
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: #ffffff;
                border-radius: 10px;
                padding: 9px 12px;
                font-size: 12px;
                outline: none;
                transition: all 0.3s ease;
                box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
            }
            .db-trakt-panel select:focus, .db-trakt-panel input[type="text"]:focus {
                border-color: rgba(10, 132, 255, 0.6);
                background: rgba(0, 0, 0, 0.3);
                box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.2);
            }
            .db-trakt-panel input::placeholder { color: rgba(235,235,245,0.4); }
            .db-trakt-panel select option { background: #1e1e22; color: #f5f5f7; }

            /* --- 按钮 --- */
            .db-trakt-btns { display: flex; gap: 10px; margin-bottom: 14px; }
            .db-trakt-btn {
                flex: 1;
                padding: 10px 8px;
                border: none;
                border-radius: 10px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                color: #fff;
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                white-space: nowrap;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .db-trakt-btn:hover { transform: translateY(-2px); filter: brightness(1.1); box-shadow: 0 6px 16px rgba(0,0,0,0.25); }
            .db-trakt-btn:active { transform: translateY(0); filter: brightness(0.95); }
            .db-trakt-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; filter: none; box-shadow: none; }

            .db-trakt-btn-primary { background: linear-gradient(135deg, #41bd55, #2e9e46); box-shadow: 0 4px 12px rgba(65,189,85,0.3); }
            .db-trakt-btn-warn    { background: linear-gradient(135deg, #ff9f0a, #ff9500); box-shadow: 0 4px 12px rgba(255,159,10,0.3); }
            .db-trakt-btn-info    { background: linear-gradient(135deg, #0a84ff, #0071e3); box-shadow: 0 4px 12px rgba(10,132,255,0.3); }
            .db-trakt-btn-danger  { background: linear-gradient(135deg, #ff453a, #ff3b30); box-shadow: 0 4px 12px rgba(255,69,58,0.3); }
            .db-trakt-btn-ghost {
                background: rgba(255,255,255,0.1);
                color: #ebebf5;
                border: 1px solid rgba(255,255,255,0.1);
                font-size: 12px;
                padding: 9px 6px;
                text-shadow: none;
            }
            .db-trakt-btn-ghost:hover { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.2); }

            /* --- 进度与统计 --- */
            .db-trakt-progress { flex-shrink: 0; margin-bottom: 12px; }
            .db-trakt-progress-text { font-size: 12px; color: rgba(235,235,245,0.85); margin-bottom: 7px; }
            .db-trakt-bar { height: 6px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
            .db-trakt-bar-inner {
                height: 100%; width: 0%;
                background: linear-gradient(90deg, #41bd55, #7ed957);
                border-radius: 4px;
                transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .db-trakt-stats { flex-shrink: 0; font-size: 12px; color: rgba(235,235,245,0.6); margin-bottom: 12px; line-height: 1.6; }

            /* --- 日志 --- */
            .db-trakt-log {
                flex-shrink: 0;
                margin-bottom: 4px;
                background: rgba(0, 0, 0, 0.25);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 12px;
                padding: 10px 12px;
                height: 128px;
                overflow-y: auto;
                font-size: 11px;
                line-height: 1.7;
                color: rgba(255,255,255,0.7);
                font-family: 'JetBrains Mono', Consolas, monospace;
            }
            .db-trakt-log::-webkit-scrollbar { width: 4px; }
            .db-trakt-log::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
            .db-trakt-log div { word-break: break-all; }
            .db-trakt-log a { color: #30d158; }
            .db-trakt-log .warn { color: #ff9f0a; }
            .db-trakt-log .error { color: #ff453a; }
            .db-trakt-log .success { color: #30d158; }

            .db-trakt-tip { font-size: 11px; color: rgba(255,255,255,0.45); line-height: 1.7; }
            .db-trakt-tip a { color: #30d158; text-decoration: none; }
            .db-trakt-tip a:hover { text-decoration: underline; }

            /* === Toast 滑入动画 === */
            @keyframes dbTraktToastIn {
                from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }

            /* === 移动端适配 === */
            @media (max-width: 480px) {
                .db-trakt-panel:not(.minimized) {
                    left: 10px !important;
                    right: 10px !important;
                    top: 10px !important;
                    width: auto !important;
                    max-width: none !important;
                }
                .db-trakt-panel.minimized {
                    left: auto !important;
                    right: 10px !important;
                    top: 10px !important;
                }
            }
        `);
    }

    function showToast(content, options = {}) {
        const existing = document.getElementById('db-trakt-toast');
        if (existing) existing.remove();

        const { type = 'info', duration = 2200 } = options;
        // 与仓库其他脚本统一的 Apple 系统色板
        let bgColor = 'rgba(10, 132, 255, 0.95)';
        if (type === 'success') bgColor = 'rgba(48, 209, 88, 0.95)';
        else if (type === 'error') bgColor = 'rgba(255, 69, 58, 0.95)';
        else if (type === 'warning') bgColor = 'rgba(255, 159, 10, 0.95)';

        const div = document.createElement('div');
        div.id = 'db-trakt-toast';
        div.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            background: ${bgColor}; color: #fff; padding: 13px 22px; border-radius: 10px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.35); z-index: 10002;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            font-size: 13px; max-width: 70vw; text-align: center; line-height: 1.5;
            backdrop-filter: blur(10px); animation: dbTraktToastIn 0.35s cubic-bezier(0.16,1,0.3,1);
        `;
        div.textContent = content;
        document.body.appendChild(div);

        if (duration > 0) {
            setTimeout(() => { if (div.parentNode) div.remove(); }, duration);
        }
    }

    function appendLog(msg, type) {
        const box = document.getElementById('db-trakt-log');
        if (!box) return;
        const line = document.createElement('div');
        if (type) line.className = type;
        const time = new Date().toTimeString().slice(0, 8);
        line.innerHTML = `<span style="opacity:0.45">[${time}]</span> ${msg}`;
        box.appendChild(line);
        while (box.childNodes.length > MAX_LOG_LINES) box.removeChild(box.firstChild);
        box.scrollTop = box.scrollHeight;
    }

    function updateProgress(text, ratio) {
        const textEl = document.getElementById('db-trakt-phase');
        const barEl = document.getElementById('db-trakt-bar');
        if (textEl) textEl.textContent = text;
        if (barEl && ratio !== null && ratio !== undefined) {
            barEl.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
        }
    }

    function updateStats() {
        const el = document.getElementById('db-trakt-stats');
        if (!el) return;
        const skipped = State.stats.skipped || 0;
        const cached = Object.keys(State.imdb).length;
        el.textContent = `采集 ${State.stats.crawled} · 匹配 ${State.stats.matched} · 未匹配 ${State.stats.unmatched}` +
            (skipped ? ` · 待重跑 ${skipped}` : '') +
            `　IMDb 缓存 ${cached} 条`;
    }

    function updateButtons() {
        const start = document.getElementById('db-trakt-start');
        const pause = document.getElementById('db-trakt-pause');
        const resume = document.getElementById('db-trakt-resume');
        const stop = document.getElementById('db-trakt-stop');
        if (!start) return;

        if (CONFIG.isRunning) {
            start.disabled = true;
            stop.disabled = false;
            if (CONFIG.isPaused) {
                pause.style.display = 'none';
                resume.style.display = '';
            } else {
                pause.style.display = '';
                resume.style.display = 'none';
            }
        } else {
            start.disabled = false;
            stop.disabled = true;
            pause.style.display = '';
            resume.style.display = 'none';
        }
        updateStats();
    }

    function getSelectedRanges() {
        const boxes = document.querySelectorAll('#db-trakt-panel input[data-range]');
        const keys = [];
        boxes.forEach(b => { if (b.checked) keys.push(b.dataset.range); });
        return RANGES.filter(r => keys.indexOf(r.key) !== -1);
    }

    function readUidInput() {
        const el = document.getElementById('db-trakt-uid');
        return el ? el.value.trim() : '';
    }

    // 从任意 href 中抽取豆瓣用户 ID
    function uidFromHref(href) {
        if (!href) return '';
        const m = String(href).match(/\/people\/([^/?#]+)/);
        if (!m) return '';
        let id = m[1];
        try { id = decodeURIComponent(id); } catch (e) { /* 保持原值 */ }
        return /^[A-Za-z0-9_.-]{2,}$/.test(id) ? id : '';
    }

    // 自动识别当前登录用户的豆瓣 ID
    // 优先级：① 当前网址 /people/xxx ② 站内导航里指向自己主页的链接 ③ 上次手动填写的值
    function detectUid() {
        // ① 网址：https://www.douban.com/people/202745100/
        const fromUrl = uidFromHref(window.location.pathname);
        if (fromUrl) return fromUrl;

        // ② 登录态下，豆瓣各站点的顶栏/侧栏都有指向自己主页的链接
        const NAV_SELECTORS = [
            '.top-nav-info a[href*="/people/"]',
            '.nav-user-account a[href*="/people/"]',
            '#db-global-nav a[href*="/people/"]',
            '.global-nav a[href*="/people/"]',
            '.nav-primary a[href*="/people/"]',
            '.nav-secondary a[href*="/people/"]',
            '.side-links a[href*="/people/"]',
            '#db-nav-sns a[href*="/people/"]',
            'header a[href*="/people/"]'
        ];
        for (const sel of NAV_SELECTORS) {
            const a = safeExecute(() => document.querySelector(sel), `detectUid:${sel}`, null);
            const id = uidFromHref(a ? a.getAttribute('href') : '');
            if (id) return id;
        }

        // ③ 兜底：导航栏区域内的第一个数字型 people 链接（数字 ID 才是自己主页的常见形式）
        const links = safeExecute(
            () => document.querySelectorAll('a[href*="douban.com/people/"], a[href^="/people/"]'),
            'detectUid:links', []
        );
        for (const a of links) {
            const inNav = safeExecute(
                () => !!a.closest('[class*="nav"], [id*="nav"], header'),
                'detectUid:closest', false
            );
            if (!inNav) continue;
            const id = uidFromHref(a.getAttribute('href'));
            if (id && /^\d+$/.test(id)) return id;
        }

        // ④ 上次用过的值
        return getCachedValue(STORAGE_KEY.UID, '');
    }

    function saveOptions() {
        const boxes = document.querySelectorAll('#db-trakt-panel input[data-range]');
        const checked = {};
        boxes.forEach(b => { checked[b.dataset.range] = b.checked; });
        writeJson(STORAGE_KEY.OPTIONS, { checked, speedTier: CONFIG.speedTier });
    }

    // 展开/收起面板（状态写入 GM 存储，刷新后保持）
    function setPanelExpanded(expanded) {
        const panel = document.getElementById('db-trakt-panel');
        if (!panel) return;
        panel.classList.toggle('minimized', !expanded);
        setCachedValue(STORAGE_KEY.PANEL_OPEN, !!expanded);
    }

    // 同步范围卡片的选中样式
    function syncCheckCards() {
        const cards = document.querySelectorAll('#db-trakt-panel .db-trakt-check');
        cards.forEach(card => {
            const box = card.querySelector('input[data-range]');
            if (box) card.classList.toggle('checked', box.checked);
        });
    }

    function createUI() {
        if (document.getElementById('db-trakt-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'db-trakt-panel';
        panel.className = 'db-trakt-panel minimized';
        panel.innerHTML = `
            <span class="db-trakt-icon" title="豆瓣 → Trakt 导出">🎬</span>
            <button class="db-trakt-close" id="db-trakt-min" title="收起 (Esc)">×</button>
            <div class="db-trakt-header">🎬 豆瓣 → Trakt 导出</div>
            <div class="db-trakt-body">
                <div class="db-trakt-section-label">导出范围</div>
                <div class="db-trakt-grid">
                    ${RANGES.map(r => `<label class="db-trakt-check checked"><input type="checkbox" data-range="${r.key}" checked> ${r.label}</label>`).join('')}
                </div>

                <div class="db-trakt-row">
                    <span class="db-trakt-label">请求间隔</span>
                    <select id="db-trakt-speed">
                        <option value="slow">保守 2.5-4s</option>
                        <option value="normal" selected>标准 1.5-3s</option>
                        <option value="fast">快速 0.8-1.6s</option>
                    </select>
                </div>

                <div class="db-trakt-row">
                    <span class="db-trakt-label">豆瓣 ID</span>
                    <input id="db-trakt-uid" type="text" placeholder="自动识别，可手动修改" title="个人主页链接 https://www.douban.com/people/你的ID/ 中的那串 ID">
                </div>

                <div class="db-trakt-btns">
                    <button id="db-trakt-start" class="db-trakt-btn db-trakt-btn-primary">▶ 开始</button>
                    <button id="db-trakt-pause" class="db-trakt-btn db-trakt-btn-warn">⏸ 暂停</button>
                    <button id="db-trakt-resume" class="db-trakt-btn db-trakt-btn-info" style="display:none">⏵ 继续</button>
                    <button id="db-trakt-stop" class="db-trakt-btn db-trakt-btn-danger" disabled>⏹ 停止</button>
                </div>

                <div class="db-trakt-progress">
                    <div class="db-trakt-progress-text" id="db-trakt-phase">就绪</div>
                    <div class="db-trakt-bar"><div class="db-trakt-bar-inner" id="db-trakt-bar"></div></div>
                </div>

                <div class="db-trakt-stats" id="db-trakt-stats">采集 0 · 匹配 0 · 未匹配 0</div>

                <div class="db-trakt-btns" style="margin-bottom:14px;">
                    <button id="db-trakt-export" class="db-trakt-btn db-trakt-btn-ghost">⬇ 导出 JSON</button>
                    <button id="db-trakt-export-miss" class="db-trakt-btn db-trakt-btn-ghost">未匹配</button>
                    <button id="db-trakt-clear" class="db-trakt-btn db-trakt-btn-ghost">清缓存</button>
                </div>

                <div class="db-trakt-log" id="db-trakt-log"></div>
                <div class="db-trakt-tip">
                    📥 导入：<a href="${TRAKT_IMPORT_URL}" target="_blank" rel="noopener">app.trakt.tv/settings/data</a>（source 选 trakt-json）<br>
                    观看日期取豆瓣标记日期 + 12:00Z；评分按 5 星制 ×2 换算。
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        // 事件绑定：点击圆球展开，点 × 或 Esc 收起
        panel.addEventListener('click', (e) => {
            if (panel.classList.contains('minimized')) {
                setPanelExpanded(true);
                e.stopPropagation();
            }
        });
        document.getElementById('db-trakt-min').addEventListener('click', (e) => {
            e.stopPropagation();
            setPanelExpanded(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !panel.classList.contains('minimized')) setPanelExpanded(false);
        });

        const uidInput = document.getElementById('db-trakt-uid');
        uidInput.value = detectUid();
        uidInput.addEventListener('change', () => {
            CONFIG.uid = uidInput.value.trim();
            setCachedValue(STORAGE_KEY.UID, CONFIG.uid);
        });

        const speedSelect = document.getElementById('db-trakt-speed');
        speedSelect.addEventListener('change', () => {
            CONFIG.speedTier = speedSelect.value;
            saveOptions();
        });

        document.getElementById('db-trakt-start').addEventListener('click', startTask);
        document.getElementById('db-trakt-pause').addEventListener('click', () => {
            if (!CONFIG.isRunning) return;
            CONFIG.isPaused = true;
            updateButtons();
            showToast('已暂停', { type: 'info' });
        });
        document.getElementById('db-trakt-resume').addEventListener('click', () => {
            CONFIG.isPaused = false;
            updateButtons();
            showToast('继续执行', { type: 'info' });
        });
        document.getElementById('db-trakt-stop').addEventListener('click', stopTask);
        document.getElementById('db-trakt-export').addEventListener('click', () => exportResult(false));
        document.getElementById('db-trakt-export-miss').addEventListener('click', () => exportResult(true));
        document.getElementById('db-trakt-clear').addEventListener('click', () => {
            if (!window.confirm('清除 IMDb 缓存与已采集清单？下次需要重新采集（不会删除已导出的文件）。')) return;
            deleteCachedValue(STORAGE_KEY.IMDB);
            deleteCachedValue(STORAGE_KEY.ITEMS);
            deleteCachedValue(STORAGE_KEY.TASK);
            State.items = {};
            State.order = [];
            State.imdb = {};
            State.rangesDone = [];
            State.stats = { crawled: 0, matched: 0, unmatched: 0 };
            updateButtons();
            updateProgress('就绪', 0);
            showToast('缓存已清除', { type: 'success' });
            appendLog('缓存已清除');
        });

        panel.querySelectorAll('input[data-range]').forEach(b => {
            b.addEventListener('change', () => { syncCheckCards(); saveOptions(); });
        });

        // 恢复上次选项
        const opts = readJson(STORAGE_KEY.OPTIONS, null);
        if (opts) {
            if (opts.checked) {
                panel.querySelectorAll('input[data-range]').forEach(b => {
                    if (Object.prototype.hasOwnProperty.call(opts.checked, b.dataset.range)) {
                        b.checked = !!opts.checked[b.dataset.range];
                    }
                });
            }
            if (opts.speedTier && SPEED_TIERS[opts.speedTier]) {
                speedSelect.value = opts.speedTier;
                CONFIG.speedTier = opts.speedTier;
            }
        }
        syncCheckCards();

        // 恢复上次的展开/收起状态（首次使用默认收起为右上角圆球）
        if (getCachedValue(STORAGE_KEY.PANEL_OPEN, false)) {
            panel.classList.remove('minimized');
        }

        CONFIG.uid = uidInput.value.trim();
        State.imdb = readJson(STORAGE_KEY.IMDB, {});
        State.items = readJson(STORAGE_KEY.ITEMS, {});
        State.order = Object.keys(State.items);
        State.stats = { crawled: State.order.length, matched: Object.keys(State.imdb).length, unmatched: 0 };

        updateButtons();
        updateProgress('就绪', 0);
        appendLog('脚本就绪，勾选范围后点「开始」');
        if (!CONFIG.uid) {
            appendLog('未自动识别到豆瓣 ID，请在「豆瓣 ID」框手动填写（个人主页链接里的那串数字）', 'warn');
        }

        const task = readJson(STORAGE_KEY.TASK, null);
        if (task) {
            appendLog(`发现未完成任务（${task.phase === 'imdb' ? '匹配 IMDb' : '采集列表'}，${task.stats ? task.stats.crawled : 0} 条），点「开始」可继续`, 'warn');
        }
    }

    /**
     * =================================================================
     * 9. 启动 (Bootstrap)
     * =================================================================
     */
    function main() {
        if (window.top !== window.self) return; // 避免在 iframe 中重复注入面板
        injectStyles();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createUI);
        } else {
            createUI();
        }
    }

    main();
})();

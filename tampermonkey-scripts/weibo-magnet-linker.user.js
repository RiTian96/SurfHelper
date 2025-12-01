// ==UserScript==
// @name         Weibo Magnet Linker (微博磁力链自动补全)
// @namespace    https://github.com/RiTian96/SurfHelper
// @version      1.1.0
// @description  在微博识别 40 位磁力哈希值，自动补全 magnet 头并转换为可点击链接
// @author       RiTian96
// @match        *://weibo.com/*
// @match        *://s.weibo.com/*
// @match        *://d.weibo.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=weibo.com
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/weibo-magnet-linker.user.js
// @downloadURL  https://raw.githubusercontent.com/RiTian96/SurfHelper/main/tampermonkey-scripts/weibo-magnet-linker.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 磁力链哈希的正则：40位，数字或A-F字母，忽略大小写
    // \b 确保是独立单词，避免匹配到长URL中间的一部分
    const MAGNET_REGEX = /\b([a-fA-F0-9]{40})\b/g;
    const MAGNET_PREFIX = 'magnet:?xt=urn:btih:';

    // 处理文本节点的函数
    function processTextNode(textNode) {
        // 如果父节点已经是链接、脚本、样式或输入框，则跳过
        const parentTag = textNode.parentNode.tagName;
        if (['A', 'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE'].includes(parentTag)) {
            return;
        }

        const text = textNode.nodeValue;

        // 如果没有匹配到 40 位哈希，直接返回
        if (!MAGNET_REGEX.test(text)) return;

        // 创建文档片段用于替换
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match;

        // 重置正则索引
        MAGNET_REGEX.lastIndex = 0;

        while ((match = MAGNET_REGEX.exec(text)) !== null) {
            const hash = match[1];
            const matchIndex = match.index;

            // 添加匹配前的文本
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, matchIndex)));

            // 创建链接元素
            const a = document.createElement('a');
            const fullLink = MAGNET_PREFIX + hash;

            a.href = fullLink;
            a.textContent = fullLink; // 按照你的要求，显示出来的文字也带上头子
            // a.textContent = hash;  // 如果只想显示哈希但点击是磁力链，用这一行

            // 设置样式，使其醒目（参考微博链接颜色）
            a.style.color = '#eb7350';
            a.style.textDecoration = 'underline';
            a.target = '_blank'; // 新窗口打开（通常会唤起下载软件）

            // 加上一个标识，防止重复处理（虽然通过检测父节点是 A 已经规避了，但双重保险）
            a.dataset.generatedMagnet = "true";

            fragment.appendChild(a);

            lastIndex = matchIndex + hash.length;
        }

        // 添加剩余的文本
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));

        // 用处理后的片段替换原文本节点
        textNode.parentNode.replaceChild(fragment, textNode);
    }

    // 遍历 DOM 节点的函数
    function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            processTextNode(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // 忽略特定标签
            if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'IMG'].includes(node.tagName)) return;

            // 遍历子节点
            // 使用 Array.from防止在遍历过程中修改DOM导致的死循环风险
            Array.from(node.childNodes).forEach(walk);
        }
    }

    // 1. 初次加载：处理页面现有的内容
    walk(document.body);

    // 2. 监听器：处理动态加载的内容（瀑布流、评论展开等）
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                walk(node);
            }
        }
    });

    // 开始监听 document.body 的变化
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
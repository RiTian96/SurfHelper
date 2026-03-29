@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ==================================================
echo       FongMi APK 智能加速下载 (基于实测排名)
echo ==================================================
echo.

:: 【完全基于 best_performance.txt 测速结果的前十名】
set "TOP_PROXIES=ghfile.geekertao.top gh.llkk.cc github.tbedu.top gh.chjina.com gh.catmak.name github.geekery.cn ghproxy.cxkpro.top gitproxy.mrhjx.cn gh.xxooo.cf ghproxy.imciel.com"

:: 默认回退代理 (如果前十个都由于临时网络波动没响应)
set "BEST_PROXY=https://gh.llkk.cc/"
set "NODE_COUNT=0"

echo [步骤 1/2] 正在筛选响应最快的节点...
echo --------------------------------------------------

for %%P in (%TOP_PROXIES%) do (
    set /a "NODE_COUNT+=1"
    <nul set /p "=正在探测第 !NODE_COUNT!/10 个节点: %%P ... "
    
    set "TEST_URL=https://%%P/https://github.com/favicon.ico"
    
    :: 快速检测 1.2 秒内是否响应 HTTP 200
    curl -I -s --connect-timeout 1.2 --max-time 1.5 "!TEST_URL!" 2>nul | findstr "HTTP/1.1 200 HTTP/2 200" >nul
    if !errorlevel! == 0 (
        set "BEST_PROXY=https://%%P/"
        echo [ 命中极速节点 ]
        goto START_DOWNLOAD
    ) else (
        echo [ 跳过 ]
    )
)

echo.
echo [!] 提示：前十优选节点均未在阈值内响应，将使用默认备用线路。

:START_DOWNLOAD
echo.
echo [步骤 2/2] 开始执行下载任务
echo --------------------------------------------------
echo [选定线路]: %BEST_PROXY%
echo.

:: 确保在脚本目录
cd /d "%~dp0"

:: 定义下载配置
set "BASE_URL=https://raw.githubusercontent.com/FongMi/Release/fongmi/apk/"
set "FILE1=leanback-arm64_v8a.apk"
set "FILE2=leanback-armeabi_v7a.apk"
set "FILE3=mobile-arm64_v8a.apk"

:: 任务 1
echo [任务 1/3] 正在下载 %FILE1% ...
curl.exe -L -# -O %BEST_PROXY%%BASE_URL%%FILE1%
if !errorlevel! == 0 (echo  ^> %FILE1% 下载完成。) else (echo  ^> [错误] %FILE1% 下载失败。)
echo.

:: 任务 2
echo [任务 2/3] 正在下载 %FILE2% ...
curl.exe -L -# -O %BEST_PROXY%%BASE_URL%%FILE2%
if !errorlevel! == 0 (echo  ^> %FILE2% 下载完成。) else (echo  ^> [错误] %FILE2% 下载失败。)
echo.

:: 任务 3
echo [任务 3/3] 正在下载 %FILE3% ...
curl.exe -L -# -O %BEST_PROXY%%BASE_URL%%FILE3%
if !errorlevel! == 0 (echo  ^> %FILE3% 下载完成。) else (echo  ^> [错误] %FILE3% 下载失败。)

echo.
echo ==================================================
echo [状态] 所有流程执行完毕！
pause

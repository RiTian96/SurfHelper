@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

REM FongMi APK 手动下载器 v2.2.0 (2026-04-21)

set "P0=raw.githubusercontent.com"
set "P1=gh.xxooo.cf"
set "P2=gh.llkk.cc"
set "P3=ghfile.geekertao.top"
set "P4=github.tbedu.top"
set "BASE_PATH=FongMi/Release/fongmi/apk/"

cd /d "%~dp0"

:menu_file
echo.
echo ==================================================
echo       FongMi APK 手动下载器 v2.2.0
echo ==================================================
echo.
echo [1] 选择要下载的文件
echo --------------------------------------------------
echo   [1] leanback-arm64_v8a     (电视版 - 64位)
echo   [2] leanback-armeabi_v7a   (电视版 - 32位)
echo   [3] mobile-arm64_v8a       (手机版 - 64位)
echo   [4] 全部下载 (1+2+3)
echo.
choice /c 1234 /n /m "请输入数字 (1/2/3/4): "
set "FC=!errorlevel!"

set "F1=" & set "F2=" & set "F3="
if !FC! == 1 set "F1=leanback-arm64_v8a.apk"
if !FC! == 2 set "F1=leanback-armeabi_v7a.apk"
if !FC! == 3 set "F1=mobile-arm64_v8a.apk"
if !FC! == 4 (
    set "F1=leanback-arm64_v8a.apk"
    set "F2=leanback-armeabi_v7a.apk"
    set "F3=mobile-arm64_v8a.apk"
)

if "!F1!" == "" (
    echo [提示] 无效输入，请重新选择
    pause
    goto :menu_file
)

REM ========== 节点选择循环（失败后回到这里）==========
:menu_node
echo.
echo [2] 选择下载节点
echo --------------------------------------------------
echo   [0] 不加速  - 直连 GitHub (!P0!)
echo   [1] !P1!
echo   [2] !P2!
echo   [3] !P3!
echo   [4] !P4!
echo.
choice /c 01234 /n /m "请输入数字 (0/1/2/3/4): "
set "NC=!errorlevel!"

set "NODE="
if !NC! == 1 set "NODE=!P0!"
if !NC! == 2 set "NODE=!P1!"
if !NC! == 3 set "NODE=!P2!"
if !NC! == 4 set "NODE=!P3!"
if !NC! == 5 set "NODE=!P4!"

if "!NODE!" == "" (
    echo [提示] 无效输入，请重新选择
    pause
    goto :menu_node
)

REM ========== 下载 ==========
echo.
echo ==================================================
echo [开始下载] 节点: !NODE!
echo ==================================================

set "ALL_OK=1"

if not "!F1!" == "" (
    call :dl_one "!F1!" "!NODE!"
    if !OK! == 0 set "ALL_OK=0"
)
if not "!F2!" == "" (
    call :dl_one "!F2!" "!NODE!"
    if !OK! == 0 set "ALL_OK=0"
)
if not "!F3!" == "" (
    call :dl_one "!F3!" "!NODE!"
    if !OK! == 0 set "ALL_OK=0"
)

REM ========== 结果处理 ==========
if !ALL_OK! == 1 (
    echo.
    echo [全部完成] 所有文件下载成功！
    pause
    exit /b
)

REM 有文件失败，询问是否换节点重试
echo.
echo [注意] 部分文件下载失败，当前节点可能已失效。
choice /c YN /n /m "按 Y 换节点重试，按 N 退出: "
if !errorlevel! == 1 goto :menu_node

echo [退出]
pause
exit /b

REM ==========================================
REM 下载单个文件（已存在且完整则跳过）
REM ==========================================
:dl_one
set "FN=%~1"
set "T_NODE=%~2"
set "OK=0"

REM 检查是否已存在且完整
set "SZ=0"
if exist "!FN!" for %%S in ("!FN!") do set "SZ=%%~zS"
if !SZ! GTR 1048576 (
    set /a "MB=SZ/1048576"
    echo   [跳过] !FN! 已存在  !MB! MB
    set "OK=1"
    goto :eof
)

REM 构造URL
if "!T_NODE!" == "!P0!" (
    set "URL=https://!T_NODE!/!BASE_PATH!!FN!"
) else (
    set "URL=https://!T_NODE!/https://raw.githubusercontent.com/!BASE_PATH!!FN!"
)

echo   [下载] !FN!  ^<- !T_NODE!
if exist "!FN!" del "!FN!" >nul 2>nul
curl -L -sS --connect-timeout 10 --max-time 300 -o "!FN!" "!URL!"

REM 检查结果
set "SZ=0"
if exist "!FN!" for %%S in ("!FN!") do set "SZ=%%~zS"
if !SZ! GTR 1048576 (
    set /a "MB=SZ/1048576"
    echo   [OK]   !FN!   !MB! MB
    set "OK=1"
) else (
    if exist "!FN!" del "!FN!" >nul 2>nul
    echo   [失败] !FN!  文件不存在或小于1MB
)
goto :eof

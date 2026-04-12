@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

REM FongMi APK 智能加速下载 v2.0.0 (2026-04-12)

echo ==================================================
echo       FongMi APK 智能加速下载 v2.0.0
echo ==================================================
echo.

set "P1=gh.xxooo.cf"
set "P2=gh.llkk.cc"
set "P3=ghfile.geekertao.top"
set "P4=github.tbedu.top"
set "BASE_URL=https://raw.githubusercontent.com/FongMi/Release/fongmi/apk/"

echo [步骤 1/2] 选择下载版本
echo --------------------------------------------------
echo.
echo  可选版本：
echo   [1] leanback-arm64_v8a     (电视版 - 64位)
echo   [2] leanback-armeabi_v7a   (电视版 - 32位)
echo   [3] mobile-arm64_v8a       (手机版 - 64位)
echo.
echo  1 秒后自动下载全部 (按 1/2/3 手动选择)

choice /c 123A /n /t 1 /d A /m ""
set "CHOICE=!errorlevel!"

set "F1="
set "F2="
set "F3="

if !CHOICE! == 1 set "F1=leanback-arm64_v8a.apk"
if !CHOICE! == 2 set "F1=leanback-armeabi_v7a.apk"
if !CHOICE! == 3 set "F1=mobile-arm64_v8a.apk"
if !CHOICE! == 4 set "F1=leanback-arm64_v8a.apk"
if !CHOICE! == 4 set "F2=leanback-armeabi_v7a.apk"
if !CHOICE! == 4 set "F3=mobile-arm64_v8a.apk"

cd /d "%~dp0"

echo.
echo [步骤 2/2] 下载文件
echo --------------------------------------------------

REM --- 文件1 ---
if not "!F1!" == "" call :dl_file "!F1!"

REM --- 文件2 ---
if not "!F2!" == "" call :dl_file "!F2!"

REM --- 文件3 ---
if not "!F3!" == "" call :dl_file "!F3!"

echo.
echo ==================================================
echo [状态] 所有下载任务执行完毕！
pause
exit /b

:dl_file
set "FN=%~1"
set "OK=0"

:dl_p1
if !OK! == 1 goto dl_done
echo   [下载] !FN! ← !P1!
if exist "!FN!" del "!FN!" >nul 2>nul
curl -L -sS --connect-timeout 10 --max-time 120 --speed-limit 524288 --speed-time 4 -o "!FN!" "https://!P1!/!BASE_URL!!FN!"
call :check_result
if !OK! == 1 goto dl_done
echo   [失败] !P1! 无法下载，换下一个节点

:dl_p2
if !OK! == 1 goto dl_done
echo   [下载] !FN! ← !P2!
if exist "!FN!" del "!FN!" >nul 2>nul
curl -L -sS --connect-timeout 10 --max-time 120 --speed-limit 524288 --speed-time 4 -o "!FN!" "https://!P2!/!BASE_URL!!FN!"
call :check_result
if !OK! == 1 goto dl_done
echo   [失败] !P2! 无法下载，换下一个节点

:dl_p3
if !OK! == 1 goto dl_done
echo   [下载] !FN! ← !P3!
if exist "!FN!" del "!FN!" >nul 2>nul
curl -L -sS --connect-timeout 10 --max-time 120 --speed-limit 524288 --speed-time 4 -o "!FN!" "https://!P3!/!BASE_URL!!FN!"
call :check_result
if !OK! == 1 goto dl_done
echo   [失败] !P3! 无法下载，换下一个节点

:dl_p4
if !OK! == 1 goto dl_done
echo   [下载] !FN! ← !P4!
if exist "!FN!" del "!FN!" >nul 2>nul
curl -L -sS --connect-timeout 10 --max-time 120 --speed-limit 524288 --speed-time 4 -o "!FN!" "https://!P4!/!BASE_URL!!FN!"
call :check_result
if !OK! == 1 goto dl_done
echo   [X] !FN! - 所有节点均失败

:dl_done
goto :eof

:check_result
set "SZ=0"
if exist "!FN!" for %%S in ("!FN!") do set "SZ=%%~zS"
if !SZ! GTR 1048576 set /a "MB=SZ/1048576"
if !SZ! GTR 1048576 echo   [OK] !FN!  (!MB! MB)
if !SZ! GTR 1048576 set "OK=1"
if !SZ! LEQ 1048576 if exist "!FN!" del "!FN!" >nul 2>nul
goto :eof

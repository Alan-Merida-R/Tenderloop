@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo [INFO] OPEN_OPPORTUNITYOS_BROWSER.bat is a compatibility alias.
echo [INFO] The primary entry point is engine_opportunityos.bat.
call "%~dp0engine_opportunityos.bat" VISIBLE TAB
exit /b %ERRORLEVEL%

@echo off
echo ========================================================
echo Building All Symvonia Plugins (Single-File Releases)...
echo ========================================================

echo.
echo [1/2] Building Unified Audio Engine Plugin...
call build-plugin-audio.bat
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo.
echo [2/2] Building AI Lyrics Plugin...
call build-plugin-lyrics.bat
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo.
echo [3/3] Building Standalone Wallpaper Engine Plugin...
call build-plugin-wallpaper.bat
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo.
echo ========================================================
echo All 3 Symvonia plugins built successfully!
echo ========================================================

pause
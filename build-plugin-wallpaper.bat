@echo off
setlocal

echo Building Symvonia Standalone Wallpaper Engine...

cmake -S plugin/src-wallpaper-engine -B plugin/src-wallpaper-engine/build -A x64
if %ERRORLEVEL% NEQ 0 (
    echo Retrying CMake configure without architecture flag...
    cmake -S plugin/src-wallpaper-engine -B plugin/src-wallpaper-engine/build
    if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
)

cmake --build plugin/src-wallpaper-engine/build --config Release
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

if not exist "plugin\src-wallpaper-engine\publish\" mkdir "plugin\src-wallpaper-engine\publish"
if not exist "plugin\src-wallpaper-engine\publish\shaders\" mkdir "plugin\src-wallpaper-engine\publish\shaders"

if exist "plugin\src-wallpaper-engine\build\bin\Release\symvonia-wallpaper-engine.exe" (
    copy /Y "plugin\src-wallpaper-engine\build\bin\Release\symvonia-wallpaper-engine.exe" "plugin\src-wallpaper-engine\publish\symvonia-wallpaper-engine.exe" >NUL
) else if exist "plugin\src-wallpaper-engine\build\bin\symvonia-wallpaper-engine.exe" (
    copy /Y "plugin\src-wallpaper-engine\build\bin\symvonia-wallpaper-engine.exe" "plugin\src-wallpaper-engine\publish\symvonia-wallpaper-engine.exe" >NUL
) else (
    echo Error: Built binary not found in build directory.
    exit /b 1
)

copy /Y "plugin\src-wallpaper-engine\shaders\*.hlsl" "plugin\src-wallpaper-engine\publish\shaders\" >NUL
copy /Y "plugin\src-wallpaper-engine\manifest.json" "plugin\src-wallpaper-engine\publish\manifest.json" >NUL

if not exist "plugin\src-wallpaper-engine\publish\symvonia-wallpaper-engine.exe" (
    echo Error: Destination binary missing!
    exit /b 1
)

echo Build success: plugin/src-wallpaper-engine/publish/symvonia-wallpaper-engine.exe
endlocal

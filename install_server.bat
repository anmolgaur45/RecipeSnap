@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" 2>nul
set PATH=C:\Program Files\nodejs;%PATH%
cd /d C:\Anmol\RecipeSnap\server
echo Installing server dependencies in %CD%...
npm install --legacy-peer-deps
echo Done. Exit code: %ERRORLEVEL%

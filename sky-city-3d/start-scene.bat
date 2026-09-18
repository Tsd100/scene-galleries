@echo off
cd /d "%~dp0"
node tools\scene-server.mjs start
if errorlevel 1 pause

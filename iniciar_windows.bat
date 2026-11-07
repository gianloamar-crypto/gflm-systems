@echo off
cd /d "%~dp0"
py -3 app.py
if errorlevel 1 (
  echo.
  echo Instala Python 3 de python.org y ejecuta instalar_dependencias.bat.
  pause
)

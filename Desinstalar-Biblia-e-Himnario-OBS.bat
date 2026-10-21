@echo off
chcp 65001 >nul
title Desinstalador y Limpiador - Biblia e Himnario OBS
color 0B

echo ============================================================================
echo   HERRAMIENTA DE CIERRE Y DESINSTALACION - BIBLIA E HIMNARIO OBS
echo   Autor: Ing. Ruben Humberto Armendariz Tamayo
echo ============================================================================
echo.
echo   NOTA: Tus pistas MP3 en "Documentos\Biblia e Himnario OBS" NO se borraran.
echo.

echo [1/5] Cerrando procesos en segundo plano (sin bloqueo WMI)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process | Where-Object { $_.ProcessName -like '*Biblia e Himnario*' -or $_.ProcessName -like '*old-uninstaller*' } | Stop-Process -Force -ErrorAction SilentlyContinue"

echo [2/5] Quitando inicio automatico de Windows...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "electron.app.Biblia e Himnario OBS" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Biblia e Himnario OBS" /f >nul 2>&1

echo [3/5] Eliminando archivos de la version anterior...
if exist "%LOCALAPPDATA%\Programs\biblia-e-himnario-obs" (
    rmdir /S /Q "%LOCALAPPDATA%\Programs\biblia-e-himnario-obs" >nul 2>&1
)
if exist "%LOCALAPPDATA%\Programs\Biblia e Himnario OBS" (
    rmdir /S /Q "%LOCALAPPDATA%\Programs\Biblia e Himnario OBS" >nul 2>&1
)
if exist "%PROGRAMFILES%\Biblia e Himnario OBS" (
    rmdir /S /Q "%PROGRAMFILES%\Biblia e Himnario OBS" >nul 2>&1
)
if exist "%LOCALAPPDATA%\biblia-e-himnario-obs-updater" (
    rmdir /S /Q "%LOCALAPPDATA%\biblia-e-himnario-obs-updater" >nul 2>&1
)

echo [4/5] Limpiando registro de desinstalacion anterior para evitar bloqueos...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$paths = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*');" ^
  "Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*Biblia e Himnario OBS*' -or $_.UninstallString -like '*Biblia e Himnario OBS*' } | ForEach-Object { Remove-Item -Path $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue }"

echo [5/5] Eliminando accesos directos antiguos...
del /F /Q "%USERPROFILE%\Desktop\Biblia e Himnario OBS.lnk" >nul 2>&1
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Biblia e Himnario OBS.lnk" >nul 2>&1

echo.
echo ============================================================================
echo   LISTO: La version anterior ha sido cerrada y desinstalada por completo.
echo   Ahora ya puedes ejecutar el nuevo instalador sin ningun bloqueo.
echo ============================================================================
echo.
pause

@echo off
title Actualizar Repositorio GitHub - SorteoCaoz
color 0A
chcp 65001 >nul

echo ================================================================
echo   ACTUALIZADOR AUTOMATICO DE REPOSITORIO GITHUB / GITHUB PAGES
echo ================================================================
echo.

:: 1. Verificar si git esta instalado
git --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [ERROR] Git no esta instalado o no se encuentra en el PATH.
    echo Por favor instala Git o verifica su configuracion.
    echo.
    pause
    exit /b 1
)

:: 2. Anadir todos los cambios
echo [1/3] Preparando cambios (git add -A)...
git add -A

:: 3. Obtener fecha y hora para el commit automatico
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set datetime=%%I
if defined datetime (
    set YYYY=%datetime:~0,4%
    set MM=%datetime:~4,2%
    set DD=%datetime:~6,2%
    set HH=%datetime:~8,2%
    set Min=%datetime:~10,2%
    set COMMIT_MSG=Actualizacion automatica %datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2% %datetime:~8,2%:%datetime:~10,2%
) else (
    set COMMIT_MSG=Actualizacion automatica del proyecto
)

:: 4. Realizar el commit
echo.
echo [2/3] Creando commit: "%COMMIT_MSG%"...
git commit -m "%COMMIT_MSG%"

:: 5. Subir a GitHub
echo.
echo [3/3] Subiendo cambios a GitHub (git push origin main)...
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ================================================================
    echo   ¡REPOSITORIO Y GITHUB PAGES ACTUALIZADOS CON EXITO!
    echo ================================================================
) else (
    color 0C
    echo.
    echo ================================================================
    echo   [ERROR] Hubo un problema al subir los cambios a GitHub.
    echo ================================================================
)

echo.
pause

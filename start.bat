@echo off
title OPS Terminal - Stock Gastro
color 0A

echo.
echo  ==========================================
echo   OPS TERMINAL - Stock Gastro
echo  ==========================================
echo.

:: Verificar que Node.js este instalado
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Node.js no esta instalado.
    echo.
    echo  Descargalo desde: https://nodejs.org
    echo  Instala la version LTS y vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
)

echo  Node.js detectado. Iniciando...
echo.

:: Instalar dependencias si no existen
if not exist "node_modules" (
    echo  Instalando dependencias por primera vez...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERROR] No se pudieron instalar las dependencias.
        pause
        exit /b 1
    )
)

:: Inicializar base de datos si no existe
if not exist "packages\backend\data\stock-gastro.db" (
    echo  Inicializando base de datos...
    call npm run db:push
    call npm run db:seed
)

:: Compilar si no existe el build
if not exist "packages\backend\dist\server.js" (
    echo  Compilando la aplicacion...
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERROR] Fallo la compilacion.
        pause
        exit /b 1
    )
)

echo.
echo  Iniciando servidor...
echo  Presiona Ctrl+C para detener.
echo.

:: Iniciar el servidor
npm run start
pause

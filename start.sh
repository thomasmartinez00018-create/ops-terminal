#!/bin/bash

echo ""
echo " =========================================="
echo "  OPS TERMINAL - Stock Gastro"
echo " =========================================="
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo " [ERROR] Node.js no está instalado."
    echo ""
    echo " Instalalo desde: https://nodejs.org"
    echo " Elegí la versión LTS y volvé a ejecutar este script."
    echo ""
    exit 1
fi

echo " Node.js $(node --version) detectado."
echo ""

# Instalar dependencias si no existen
if [ ! -d "node_modules" ]; then
    echo " Instalando dependencias por primera vez..."
    npm install
fi

# Inicializar base de datos si no existe
if [ ! -f "packages/backend/data/stock-gastro.db" ]; then
    echo " Inicializando base de datos..."
    npm run db:push
    npm run db:seed
fi

# Compilar si no existe el build
if [ ! -f "packages/backend/dist/server.js" ]; then
    echo " Compilando la aplicación..."
    npm run build
fi

echo ""
echo " Iniciando servidor... Presioná Ctrl+C para detener."
echo ""

npm run start

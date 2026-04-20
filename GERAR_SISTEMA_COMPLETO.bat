@echo off
echo ===========================================================
echo   BUILD SYSTEM - DEVSISTEM AUDIO
echo ===========================================================

echo [1/3] Configurando Servidor Docker...
cd server
docker-compose down
docker-compose up -d --build
cd ..

echo [2/3] Instalando dependencias do Cliente...
cd client
npm install

echo [3/3] Gerando Executavel (.exe)...
npm run dist
cd ..

echo ===========================================================
echo   PROCESSO CONCLUIDO!
echo   O arquivo PORTABLE (.exe) esta na pasta client\dist-electron
echo   Basta copiar o "DevSistemAudio_Portable.exe" e usar!
echo   O servidor esta rodando em Docker na porta 3001
echo ===========================================================
pause

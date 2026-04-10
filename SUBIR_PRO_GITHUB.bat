@echo off
echo ===========================================
echo   SUBINDO SERVIDOR PARA O GITHUB (CORRECAO)
echo ===========================================
echo.

:: Configura nome e email temporarios para o commit funcionar
git config user.email "celio@devsistem.com.br"
git config user.name "Celio Cruz"

:: Inicializa o Git se não existir
if not exist .git (
    git init
    git remote add origin https://github.com/CelioCruz/radio-b2b-server.git
)

:: Cria o .gitignore para não subir arquivos pesados/desnecessários
echo node_modules/ > .gitignore
echo storage/ >> .gitignore
echo .env >> .gitignore
echo SUBIR_PRO_GITHUB.bat >> .gitignore

:: Adiciona os arquivos e faz o commit
git add .
git commit -m "Upload inicial do servidor de radio"

:: Sobe para o GitHub (Pode pedir sua senha/token no navegador)
echo.
echo [ATENCAO] Uma janela do navegador pode abrir para voce autorizar o login no GitHub.
echo.
git branch -M main
git push -u origin main --force

echo.
echo ===========================================
echo   CONCLUIDO! Verifique seu GitHub.
echo ===========================================
pause
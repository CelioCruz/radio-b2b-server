# Use a imagem oficial do Node.js
FROM node:20-slim

# Instale dependências para o Node-Canvas ou outras bibliotecas se necessário
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Crie o diretório de trabalho
WORKDIR /app

# Copie os arquivos de dependências
COPY package*.json ./

# Instale as dependências
RUN npm install --production

# Copie o restante do código
COPY . .

# Crie as pastas de storage se não existirem
RUN mkdir -p storage/musics storage/ads

# Exponha a porta
EXPOSE 3001

# Variáveis de ambiente padrão
ENV PORT=3001
ENV NODE_ENV=production

# Comando para rodar a aplicação
CMD ["node", "index.js"]

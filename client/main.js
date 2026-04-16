const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// --- CONFIGURAÇÃO ---
const REMOTE_SERVER_URL = 'http://localhost:3001'; 
const PORT_INTERNA = 3002; 
let win;
let isQuitting = false;

// Caminho para a pasta de anúncios acessível ao usuário (Pasta Física nos Documentos)
const USER_ADS_PATH = path.join(os.homedir(), 'Documents', 'DevSistem_Audio_ANUNCIOS');

// Função Utilitária para Download
const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      } else if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        reject(new Error(`Falha no download: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

// Função para validar licença e gerenciar sincronização
const validateLicense = (key, hwid) => {
  return new Promise((resolve) => {
    const data = JSON.stringify({ key, hwid });
    
    const options = {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Content-Length': data.length 
      }
    };

    const req = http.request(`${REMOTE_SERVER_URL}/api/license/validate`, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { 
          const result = JSON.parse(body);
          if (result.valid && result.musics) {
            syncMusicsLocally(result.musics);
          }
          resolve(result); 
        } 
        catch (e) { resolve({ valid: false, error: 'Erro no servidor' }); }
      });
    });

    req.on('error', (err) => {
      console.log("Servidor remoto offline, tentando modo offline...");
      resolve({ valid: 'maybe_offline', error: 'offline' });
    });

    req.write(data);
    req.end();
  });
};

async function syncMusicsLocally(musics) {
  const userDataPath = app.getPath('userData');
  const musicPath = path.join(userDataPath, 'storage', 'musics');
  
  if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });

  for (const url of musics) {
    const fileName = url.split('/').pop();
    const dest = path.join(musicPath, fileName);
    if (!fs.existsSync(dest)) {
      try { await downloadFile(url, dest); } catch (err) {}
    }
  }
}

const serverApp = express();
serverApp.use(cors());
serverApp.use(express.json());

function createWindow() {
  win = new BrowserWindow({
    width: 480, height: 720,
    title: "DevSistem Audio",
    icon: path.join(__dirname, 'radio.png'),
    webPreferences: { 
      preload: path.join(__dirname, 'scr/preload.js'), 
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const distPath = path.join(__dirname, 'dist/renderer/index.html');
  if (fs.existsSync(distPath)) {
    win.loadFile(distPath);
  } else {
    const fallbackPath = path.join(__dirname, 'dist/index.html');
    if (fs.existsSync(fallbackPath)) {
      win.loadFile(fallbackPath);
    } else if (process.env.VITE_DEV_SERVER_URL) {
      win.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
  }

  win.on('close', (e) => { 
    if (!isQuitting) { 
      e.preventDefault(); 
      win.hide(); 
    } 
    return false; 
  });
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  const musicPath = path.join(userDataPath, 'storage', 'musics');
  
  // Garante a existência da pasta física de anúncios para o cliente
  if (!fs.existsSync(USER_ADS_PATH)) {
    fs.mkdirSync(USER_ADS_PATH, { recursive: true });
    fs.writeFileSync(path.join(USER_ADS_PATH, 'LEIA-ME.txt'), 'Coloque seus arquivos de anuncio (.mp3) nesta pasta para que toquem apos cada musica.');
  }

  if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });

  serverApp.use('/storage/musics', express.static(musicPath));
  serverApp.use('/storage/ads', express.static(USER_ADS_PATH));
  
  serverApp.post('/api/license/validate', async (req, res) => {
    const { key, hwid } = req.body;
    const result = await validateLicense(key, hwid);
    
    // Busca anúncios na pasta física local
    const localAds = fs.existsSync(USER_ADS_PATH) 
      ? fs.readdirSync(USER_ADS_PATH).filter(f => f.endsWith('.mp3'))
      : [];
    const adUrls = localAds.map(f => `http://localhost:${PORT_INTERNA}/storage/ads/${f}`);

    if (result.valid === 'maybe_offline') {
      const localMusics = fs.readdirSync(musicPath).filter(f => f.endsWith('.mp3'));
      if (localMusics.length > 0) {
        return res.json({
          valid: true,
          company: "DevSistem Audio (Modo Offline)",
          musics: localMusics.map(f => `http://localhost:${PORT_INTERNA}/storage/musics/${f}`),
          ads: adUrls,
          offline: true
        });
      } else {
        return res.json({ valid: false, error: 'Sem internet e sem músicas baixadas.' });
      }
    }

    if (result.valid && result.musics) {
      result.musics = result.musics.map(url => {
        const fileName = url.split('/').pop();
        return `http://localhost:${PORT_INTERNA}/storage/musics/${fileName}`;
      });
      result.ads = adUrls; // Envia os anúncios locais para o rádio
    }

    res.json(result);
  });

  try {
    serverApp.listen(PORT_INTERNA, () => console.log(`Servidor interno: ${PORT_INTERNA}`));
  } catch (err) {}
  
  createWindow();
});

ipcMain.handle('get-hwid', () => `${os.hostname()}-${os.platform()}`);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

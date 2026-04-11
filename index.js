const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JAMENDO_CLIENT_ID = '4760AD12';
const MAX_MUSICS = 1000;

// Músicas de reserva ESTÁVEIS com VOZ (Vocals) que permitem download direto
const BACKUP_MUSICS = [
  { id: 'vocal_backup_1', audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', name: 'Ambient 1' },
  { id: 'vocal_backup_2', audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', name: 'Ambient 2' },
  { id: 'vocal_backup_3', audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', name: 'Ambient 3' },
  { id: 'vocal_backup_4', audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', name: 'Ambient 4' }
];

app.use('/storage', express.static(path.join(__dirname, 'storage')));
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = path.join(__dirname, 'db.json');
const loadDB = () => {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], companies: [], licenses: [], heartbeats: [], ads: [] }));
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
};
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// --- FUNÇÃO DE DOWNLOAD ---
const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      // Tratar redirecionamentos (301, 302)
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location, (res2) => {
          res2.pipe(file);
          res2.on('end', () => { file.close(); resolve(); });
          res2.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
        });
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); 
      reject(err);
    });
  });
};

// --- LOGICA DE SINCRONIZAÇÃO (1000 MUSICAS) ---
async function syncMusics(retryCount = 0) {
  const MAX_RETRIES = 5;
  console.log(`🎵 [AUTOSYNC] Tentativa ${retryCount + 1}: Sincronizando músicas...`);
  
  const musicPath = path.join(__dirname, 'storage', 'musics');
  if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });

  const startDownload = async (tracks) => {
    // Só apaga se realmente tiver novas músicas para baixar para não deixar sem som
    if (tracks && tracks.length > 0) {
      console.log('🗑️ [AUTOSYNC] Substituindo músicas antigas...');
      const oldFiles = fs.readdirSync(musicPath);
      for (const file of oldFiles) {
        if (file.toLowerCase().endsWith('.mp3')) {
          try { fs.unlinkSync(path.join(musicPath, file)); } catch (e) {}
        }
      }
      
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const dest = path.join(musicPath, `${track.id}.mp3`);
        try {
          await downloadFile(track.audio, dest);
          if (i % 50 === 0) console.log(`🚀 [AUTOSYNC] Progresso: ${i+1}/${tracks.length} músicas...`);
        } catch (e) { console.error(`❌ Erro no download (${track.name}):`, e.message); }
      }
      console.log('✨ [AUTOSYNC] Concluído com sucesso!');
    }
  };

  try {
    const apiUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=${MAX_MUSICS}&audioformat=mp32&vocalinstrumental=vocal&tags=ambient,lounge,pop`;
    
    https.get(apiUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.results && parsed.results.length > 0) {
            await startDownload(parsed.results);
          } else if (retryCount < MAX_RETRIES) {
            console.log('⚠️ [AUTOSYNC] API Jamendo vazia. Tentando novamente em 1 minuto...');
            setTimeout(() => syncMusics(retryCount + 1), 60000);
          } else {
            console.log('⚠️ [AUTOSYNC] Usando músicas de backup após falhas consecutivas...');
            await startDownload(BACKUP_MUSICS);
          }
        } catch (e) {
          console.error('❌ [AUTOSYNC] Erro ao parsear API, tentando backup...');
          await startDownload(BACKUP_MUSICS);
        }
      });
    }).on('error', (err) => {
      console.error('❌ [AUTOSYNC] Erro de conexão:', err.message);
      if (retryCount < MAX_RETRIES) {
        setTimeout(() => syncMusics(retryCount + 1), 30000);
      } else {
        startDownload(BACKUP_MUSICS);
      }
    });
  } catch (error) {
    console.error('❌ [AUTOSYNC] Erro crítico:', error);
    startDownload(BACKUP_MUSICS);
  }
}

// Agendar para rodar a cada 24 horas
setInterval(syncMusics, 24 * 60 * 60 * 1000);

// --- ROTAS ---

// API para forçar a sincronização agora
app.post('/api/admin/sync-musics', (req, res) => {
  syncMusics(); // Roda em background
  res.json({ success: true, message: 'Sincronização iniciada em segundo plano.' });
});

// NOVA ROTA: Download Manual de Música
app.post('/api/admin/download-manual', async (req, res) => {
  const { url, name } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL é obrigatória' });

  const fileName = name ? `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp3` : `${uuidv4()}.mp3`;
  const musicPath = path.join(__dirname, 'storage', 'musics');
  const dest = path.join(musicPath, fileName);

  try {
    if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });
    await downloadFile(url, dest);
    res.json({ success: true, message: `Música baixada com sucesso: ${fileName}` });
  } catch (error) {
    res.status(500).json({ success: false, error: `Erro ao baixar: ${error.message}` });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.username === username && u.password === password);
  if (user) res.json({ success: true, token: 'fake-admin-token-' + user.id, username: user.username });
  else res.status(401).json({ success: false, error: 'Credenciais inválidas' });
});

app.post('/api/admin/companies', (req, res) => {
  const { name, licenseType } = req.body;
  const db = loadDB();
  const companyId = uuidv4();
  const licenseKey = 'LIC-' + Math.random().toString(36).substring(2, 10).toUpperCase();

  let expiresAt = new Date();
  if (licenseType === 'semanal' || licenseType === 'trial') {
    expiresAt.setDate(expiresAt.getDate() + 7);
  } else if (licenseType === 'mensal') {
    expiresAt.setDate(expiresAt.getDate() + 30);
  } else if (licenseType === 'anual') {
    expiresAt.setDate(expiresAt.getDate() + 365);
  } else {
    expiresAt.setDate(expiresAt.getDate() + 30); // Default 30 days
  }

  const newCompany = { id: companyId, name, license_key: licenseKey, created_at: new Date().toISOString() };
  const newLicense = { id: uuidv4(), company_id: companyId, key: licenseKey, hwid: null, expires_at: expiresAt.toISOString(), status: 'active', type: licenseType || 'mensal' };
  db.companies.push(newCompany);
  db.licenses.push(newLicense);
  const adPath = path.join(__dirname, 'storage', 'ads', companyId);
  if (!fs.existsSync(adPath)) fs.mkdirSync(adPath, { recursive: true });
  saveDB(db);
  res.json({ success: true, company: newCompany, license: newLicense });
});

app.get('/api/admin/companies', (req, res) => {
  const db = loadDB();
  res.json(db.companies.map(c => ({ ...c, license: db.licenses.find(l => l.company_id === c.id) })));
});

app.post('/api/license/validate', (req, res) => {
  const { key, hwid } = req.body;
  const db = loadDB();
  const lic = db.licenses.find(l => l.key === key);
  if (!lic) return res.json({ valid: false, error: 'Chave inválida' });
  if (new Date(lic.expires_at) < new Date()) return res.json({ valid: false, error: 'Licença expirada' });
  if (!lic.hwid) { lic.hwid = hwid; saveDB(db); }
  else if (lic.hwid !== hwid) return res.json({ valid: false, error: 'HWID não corresponde.' });
  const company = db.companies.find(c => c.id === lic.company_id);
  const adPath = path.join(__dirname, 'storage', 'ads', lic.company_id);
  const adFiles = fs.existsSync(adPath) ? fs.readdirSync(adPath).filter(f => f.toLowerCase().endsWith('.mp3') || f.toLowerCase().endsWith('.mpeg')) : [];
  const musicPath = path.join(__dirname, 'storage', 'musics');
  const musicFiles = fs.existsSync(musicPath) ? fs.readdirSync(musicPath).filter(f => f.toLowerCase().endsWith('.mp3') || f.toLowerCase().endsWith('.mpeg')) : [];
  res.json({ valid: true, expiresAt: lic.expires_at, company: company.name, companyId: company.id, ads: adFiles.map(f => `https://radio-b2b-server.onrender.com/storage/ads/${company.id}/${f}`), musics: musicFiles.map(f => `https://radio-b2b-server.onrender.com/storage/musics/${f}`) });
});

app.listen(PORT, () => {
  console.log(`✅ API rodando em https://radio-b2b-server.onrender.com`);
  syncMusics(); // Chamada para iniciar o download ao ligar o servidor
});

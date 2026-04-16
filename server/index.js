const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const JAMENDO_CLIENT_ID = '4760AD12';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Nome do Sistema: DevSistem Audio
const SYSTEM_NAME = 'DevSistem Audio';

app.use('/storage', express.static(path.join(__dirname, 'storage')));
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = path.join(__dirname, 'db.json');

const loadDB = () => {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initialData = { 
        users: [{id: 'admin-id-001', username:'DevSistem', password:'Devsistem@300723#'}], 
        companies: [], 
        licenses: [], 
        heartbeats: [], 
        ads: [] 
      };
      fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    console.error('Erro ao ler banco de dados:', err);
    return { users: [], companies: [], licenses: [], heartbeats: [], ads: [] };
  }
};

const saveDB = (data) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    console.log(`[${new Date().toLocaleTimeString()}] 💾 Banco de dados atualizado.`);
  } catch (err) {
    console.error('Erro ao salvar banco de dados:', err);
  }
};

// Download Utilitário
const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location, (res2) => { res2.pipe(file); res2.on('end', () => { file.close(); resolve(); }); });
      } else { response.pipe(file); file.on('finish', () => { file.close(); resolve(); }); }
    }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
  });
};

async function syncMusics() {
  const musicPath = path.join(__dirname, 'storage', 'musics');
  if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });
  
  console.log(`[${new Date().toLocaleTimeString()}] 🎵 ${SYSTEM_NAME}: Buscando 400 músicas...`);
  
  try {
    const genres = 'pop,rock,jazz,soul,funk,motown,lofi,classic';
    // Aumentado para 400 músicas conforme solicitado
    const apiUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=400&audioformat=mp32&vocalinstrumental=vocal&tags=${genres}&order=popularity_total`;
    
    https.get(apiUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.results && parsed.results.length > 0) {
            let downloadsIniciados = 0;
            for (const track of parsed.results) {
              const dest = path.join(musicPath, `${track.id}.mp3`);
              if (!fs.existsSync(dest)) {
                downloadsIniciados++;
                downloadFile(track.audio, dest).catch((err) => {});
              }
            }
            if (downloadsIniciados > 0) console.log(`✅ ${SYSTEM_NAME}: Baixando ${downloadsIniciados} novas músicas.`);
          }
        } catch (e) {}
      });
    });
  } catch (e) {}
}

const SEIS_HORAS = 6 * 60 * 60 * 1000;
setInterval(syncMusics, SEIS_HORAS);

// --- ROTAS API ---

app.post('/api/admin/sync-musics', async (req, res) => {
  syncMusics();
  res.json({ success: true });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.username === username && u.password === password);
  if (user) res.json({ success: true, token: 'fake-token-' + user.id, username: user.username });
  else res.status(401).json({ success: false, error: 'Credenciais inválidas' });
});

app.get('/api/admin/companies', (req, res) => {
  const db = loadDB();
  const companiesWithLicenses = db.companies.map(c => {
    const license = db.licenses.find(l => l.company_id === c.id);
    return { ...c, license };
  });
  res.json(companiesWithLicenses);
});

// Tabela de Preços e Prazos Corrigida
const LICENSE_PLANS = {
  'semanal': { days: 7, price: 0 },
  'mensal': { days: 30, price: 75.00 },
  'trimestral': { days: 90, price: 192.00 },
  'semestral': { days: 180, price: 400.00 },
  'anual': { days: 365, price: 900.00 }
};

app.post('/api/admin/companies', (req, res) => {
  const { name, licenseType } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const db = loadDB();
  const companyId = uuidv4();
  const licenseKey = 'LIC-' + Math.random().toString(36).substring(2, 10).toUpperCase();

  const plan = LICENSE_PLANS[licenseType] || LICENSE_PLANS['semanal'];
  let expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + plan.days);

  const newCompany = { id: companyId, name, license_key: licenseKey, created_at: new Date().toISOString() };
  const newLicense = { 
    id: uuidv4(), 
    company_id: companyId, 
    key: licenseKey, 
    hwid: null, 
    expires_at: expiresAt.toISOString(), 
    status: 'active', 
    type: licenseType || 'semanal',
    price: plan.price
  };
  
  db.companies.push(newCompany);
  db.licenses.push(newLicense);
  saveDB(db);
  
  console.log(`🚀 Loja cadastrada: ${name} (Plano: ${licenseType}, Vence: ${expiresAt.toLocaleDateString()})`);
  res.json({ success: true, company: newCompany, license: newLicense });
});

app.post('/api/license/validate', (req, res) => {
  const { key, hwid } = req.body;
  const db = loadDB();
  const lic = db.licenses.find(l => l.key === key);
  
  if (!lic) return res.json({ valid: false, error: 'Chave inválida' });
  if (new Date(lic.expires_at) < new Date()) return res.json({ valid: false, error: 'Licença expirada' });
  
  if (!lic.hwid) { lic.hwid = hwid; saveDB(db); }
  else if (lic.hwid !== hwid) return res.json({ valid: false, error: 'HWID já registrado.' });

  const company = db.companies.find(c => c.id === lic.company_id);
  const musicPath = path.join(__dirname, 'storage', 'musics');
  const musicFiles = fs.existsSync(musicPath) ? fs.readdirSync(musicPath).filter(f => f.endsWith('.mp3')) : [];
  
  res.json({ 
    valid: true, 
    company: company.name, 
    expiresAt: lic.expires_at,
    musics: musicFiles.map(f => `${BASE_URL}/storage/musics/${f}`),
    ads: [] 
  });
});

app.listen(PORT, () => {
  console.log(`✅ ${SYSTEM_NAME} rodando na porta ${PORT}`);
  syncMusics();
});


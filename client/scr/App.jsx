import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

const API_URL = 'http://localhost:3002'; // Corrigido para a porta interna 3002

function AdminPanel({ onBack }) {
  // ... (código anterior igual)
}

function App() {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [license, setLicense] = useState(null);
  const [licenseInput, setLicenseInput] = useState('');
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAdPlaying, setIsAdPlaying] = useState(false);
  const [currentMusicIndex, setCurrentMusicIndex] = useState(0);
  const [currentTrackName, setCurrentTrackName] = useState('Buscando músicas...');
  const [isLoading, setIsLoading] = useState(true); // Adicionado para controle de tela branca
  
  const audioRef = useRef(null);
  const adAudioRef = useRef(null);

  const validate = async (key) => {
    setIsLoading(true);
    try {
      const hwid = await window.electronAPI.getHWID();
      console.log("Validando chave:", key || licenseInput);
      
      const res = await fetch(`${API_URL}/api/license/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key || licenseInput, hwid })
      });
      
      const result = await res.json();
      
      if (result.valid) {
        setLicense(key || licenseInput);
        setConfig(result);
        localStorage.setItem('license_key', key || licenseInput);
        setError('');
        if (result.musics && result.musics.length > 0) {
          const fileName = result.musics[currentMusicIndex].split('/').pop();
          setCurrentTrackName(decodeURIComponent(fileName));
        }
      } else {
        setError(result.error || 'Chave de licença inválida.');
      }
    } catch (e) {
      console.error("Erro de conexão:", e);
      setError("Não foi possível conectar ao servidor interno.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('license_key');
    if (saved) {
      validate(saved);
    } else {
      setIsLoading(false);
    }
  }, []);

  // ... (resto do código igual)

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', backgroundColor: '#0f172a', color: 'white', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h2 style={{ color: '#38bdf8' }}>Iniciando Rádio...</h2>
      </div>
    );
  }

  if (isAdminMode) return <AdminPanel onBack={() => setIsAdminMode(false)} />;

  if (!config) {
    return (
      <div style={{ padding: 40, textAlign: 'center', backgroundColor: '#0f172a', color: 'white', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h1 style={{ color: '#38bdf8' }}>DevSistem Audio</h1>
        <div style={{ background: '#1e293b', padding: 25, borderRadius: 12 }}>
          <input 
            type="text" 
            placeholder="Digite sua Chave (Ex: TESTE)"
            value={licenseInput}
            onChange={(e) => setLicenseInput(e.target.value)}
            style={{ width: '100%', padding: 12, marginBottom: 15, borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: 'white', textAlign: 'center' }}
          />
          <button onClick={() => validate()} style={{ padding: 12, width: '100%', background: '#38bdf8', color: '#0f172a', fontWeight: 'bold', border: 'none', borderRadius: 6 }}>ATIVAR</button>
          {error && <p style={{ color: '#ef4444', marginTop: 15 }}>{error}</p>}
        </div>
        <button onClick={() => setIsAdminMode(true)} style={{ marginTop: 20, background: 'none', color: '#475569', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>Painel do Diretor</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, backgroundColor: '#0f172a', color: 'white', height: '100vh', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: 20, width: '100%', left: 0 }}>
        <h2 style={{ color: '#38bdf8', margin: 0 }}>{config.company}</h2>
        {config.expiresAt && (
           <span style={{ fontSize: 10, color: '#10b981' }}>
             Licença Ativa: {new Date(config.expiresAt).toLocaleDateString()}
           </span>
        )}
      </div>

      <div style={{ margin: '40px 0' }}>
        <div style={{ fontSize: 80, marginBottom: 10 }}>{isAdPlaying ? '📢' : '📻'}</div>
        <h3>{isAdPlaying ? 'Propaganda' : 'No Ar'}</h3>
        <p style={{ color: '#38bdf8', fontWeight: 'bold' }}>{isAdPlaying ? 'Anúncio Local' : currentTrackName}</p>
      </div>

      <audio ref={audioRef} src={config.musics[currentMusicIndex]} onEnded={() => {
          if (config && config.ads && config.ads.length > 0) {
            setIsAdPlaying(true);
            const randomAd = config.ads[Math.floor(Math.random() * config.ads.length)];
            if (adAudioRef.current) {
              adAudioRef.current.src = randomAd;
              adAudioRef.current.play().catch(() => { setIsAdPlaying(false); playNextMusic(); });
            }
          } else {
            let nextIndex = (currentMusicIndex + 1) % config.musics.length;
            setCurrentMusicIndex(nextIndex);
            const fileName = config.musics[nextIndex].split('/').pop();
            setCurrentTrackName(decodeURIComponent(fileName));
          }
      }} />
      <audio ref={adAudioRef} onEnded={() => { 
          setIsAdPlaying(false); 
          let nextIndex = (currentMusicIndex + 1) % config.musics.length;
          setCurrentMusicIndex(nextIndex);
          const fileName = config.musics[nextIndex].split('/').pop();
          setCurrentTrackName(decodeURIComponent(fileName));
      }} />

      <button 
        onClick={() => {
          if (isPlaying) {
             audioRef.current.pause();
             setIsPlaying(false);
          } else {
             audioRef.current.play().catch(e => console.error("Erro ao tocar:", e));
             setIsPlaying(true);
          }
        }}
        style={{ padding: '20px', borderRadius: 50, border: 'none', backgroundColor: isPlaying ? '#ef4444' : '#10b981', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
      >
        {isPlaying ? 'PAUSAR RÁDIO' : 'OUVIR AGORA'}
      </button>

      <button onClick={() => setIsAdminMode(true)} style={{ position: 'absolute', bottom: 20, background: 'none', color: '#334155', border: 'none', cursor: 'pointer', fontSize: 10, left: '50%', transform: 'translateX(-50%)' }}>
        ⚙️ Configurações do Diretor
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);


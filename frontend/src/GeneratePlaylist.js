import React, { useState } from 'react';
import { generatePlaylist } from './api';

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modal = {
  background: '#1e1e1e', borderRadius: '16px', padding: '32px',
  width: '100%', maxWidth: '480px', color: '#fff',
};
const input = {
  width: '100%', padding: '12px 16px', borderRadius: '8px',
  border: '1px solid #444', background: '#111', color: '#fff',
  fontSize: '15px', boxSizing: 'border-box', marginTop: '12px',
};
const btn = (color = '#1db954') => ({
  padding: '10px 24px', borderRadius: '20px', border: 'none',
  background: color, color: color === '#1db954' ? '#000' : '#fff',
  fontWeight: '700', fontSize: '14px', cursor: 'pointer',
});

export default function GeneratePlaylist({ userId, accessToken, onClose, initialRequest = '' }) {
  const [request, setRequest] = useState(initialRequest);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleGenerate() {
    if (!request.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await generatePlaylist(userId, accessToken, request);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Generate a Playlist</h2>
        <p style={{ color: '#999', fontSize: '13px', margin: '0 0 16px' }}>
          Describe the vibe — your listening history does the rest.
        </p>

        {!result ? (
          <>
            <input
              style={input}
              placeholder='e.g. "late night mellow drive" or "hype gym session"'
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
            {error && <p style={{ color: '#e74c3c', fontSize: '13px', marginTop: '8px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button style={btn()} onClick={handleGenerate} disabled={loading || !request.trim()}>
                {loading ? 'Analyzing…' : 'Create Playlist'}
              </button>
              <button style={btn('#444')} onClick={onClose}>Cancel</button>
            </div>
          </>
        ) : (
          <div>
            <div style={{ background: '#111', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#1db954', fontWeight: '700', marginBottom: '4px' }}>
                {result.clusterLabel}
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{result.playlistName}</div>
              <div style={{ fontSize: '13px', color: '#aaa', marginTop: '6px' }}>{result.rationale}</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                {result.trackCount} tracks added
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <a href={result.playlistUrl} target="_blank" rel="noreferrer">
                <button style={btn()}>Open in Spotify</button>
              </a>
              <button style={btn('#444')} onClick={() => { setResult(null); setRequest(''); }}>
                Generate Another
              </button>
              <button style={btn('#333')} onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React from 'react';

const MOOD_COLORS = {
  happy: '#f7d060',
  energetic: '#e74c3c',
  calm: '#3498db',
  sad: '#7f8c8d',
  angry: '#c0392b',
  romantic: '#e91e8c',
  nostalgic: '#9b59b6',
  anxious: '#e67e22',
};

const WEATHER_ICONS = {
  Clear: '☀️', Clouds: '☁️', Rain: '🌧️',
  Drizzle: '🌦️', Thunderstorm: '⛈️', Snow: '❄️', Unknown: '🌡️',
};

const TIME_ICONS = {
  morning: '🌅', afternoon: '☀️', evening: '🌆', night: '🌙',
};

const container = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '16px',
  padding: '16px 0',
};

function moodColor(label) {
  const lower = (label || '').toLowerCase();
  for (const [mood, color] of Object.entries(MOOD_COLORS)) {
    if (lower.includes(mood)) return color;
  }
  return '#1db954';
}

export default function ClusterView({ clusters, onGenerateFromCluster }) {
  if (!clusters || clusters.length === 0) {
    return (
      <div style={{ color: '#888', textAlign: 'center', padding: '40px 0', fontSize: '14px' }}>
        No clusters yet. Sync your listening data to get started.
      </div>
    );
  }

  return (
    <div style={container}>
      {clusters.map((c) => {
        const accent = moodColor(c.clusterLabel);
        return (
          <div
            key={c.clusterId}
            style={{
              background: '#1e1e1e',
              borderRadius: '12px',
              padding: '18px',
              borderTop: `3px solid ${accent}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>
              {c.clusterLabel}
            </div>
            <div style={{ fontSize: '12px', color: '#aaa', lineHeight: 1.4 }}>
              {c.clusterDescription}
            </div>
            <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: '#888', marginTop: '4px' }}>
              <span>{TIME_ICONS[c.dominantTimeOfDay] || '🎵'} {c.dominantTimeOfDay}</span>
              <span>{WEATHER_ICONS[c.dominantWeather] || '🌡️'} {c.dominantWeather}</span>
            </div>
            <div style={{ fontSize: '11px', color: '#666' }}>
              {c.trackCount} songs · ⚡{Math.round((c.avgEnergy || 0) * 100)}% energy
            </div>
            <button
              onClick={() => onGenerateFromCluster(c.clusterLabel)}
              style={{
                marginTop: '8px',
                padding: '7px 14px',
                borderRadius: '20px',
                border: 'none',
                background: accent,
                color: '#000',
                fontWeight: '700',
                fontSize: '12px',
                cursor: 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              Generate Playlist
            </button>
          </div>
        );
      })}
    </div>
  );
}

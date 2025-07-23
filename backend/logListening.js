const axios = require('axios');
const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore();

async function logListening(userId, accessToken) {
  try {
    // 1. Get recently played tracks from Spotify
    const playedRes = await axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=10', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const recentTracks = playedRes.data.items;

    for (let item of recentTracks) {
      const track = item.track;
      const trackId = track.id;
      const timestamp = item.played_at;

      // 2. Get audio features
      const featuresRes = await axios.get(`https://api.spotify.com/v1/audio-features/${trackId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const features = featuresRes.data;

      // 3. Get mock location (replace later with real location)
      const lat = 49.25;
      const lon = -123.1;

      // 4. Get weather
      const weatherRes = await axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);
      const weather = weatherRes.data;

      // 5. Format and store in Firestore
      await db.collection('users')
        .doc(userId)
        .collection('listening_data')
        .doc(timestamp)
        .set({
          trackId,
          trackName: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          audioFeatures: {
            energy: features.energy,
            danceability: features.danceability,
            valence: features.valence,
            tempo: features.tempo
          },
          location: { lat, lon },
          weather: {
            condition: weather.weather[0].main,
            temp: weather.main.temp
          },
          timeOfDay: getTimeOfDay(new Date(timestamp)),
          source: 'recently-played'
        });

      console.log(`✅ Logged track: ${track.name}`);
    }

  } catch (err) {
    console.error('❌ Error logging listening history:', err.response?.data || err.message);
  }
}

function getTimeOfDay(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

module.exports = logListening;

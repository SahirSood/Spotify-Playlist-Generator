const express = require('express');
const cors = require('cors');
const querystring = require('querystring');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Spotify OAuth endpoints
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

async function getAppAccessToken() {
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const response = await axios.post('https://accounts.spotify.com/api/token',
    querystring.stringify({ grant_type: 'client_credentials' }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${creds}`
      }
    }
  );
  return response.data.access_token;
}

const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5000/callback';

// Generate random string for state parameter
const generateRandomString = (length) => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

// Login route - redirects to Spotify
app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  const scope = 'user-read-private user-read-email playlist-read-private user-library-read user-read-recently-played user-read-playback-state';

  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT_URI,
      state: state
    }));
});

// Callback route - handles Spotify's response
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;

  if (state === null) {
    res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
  } else {
    try {
      const response = await axios.post('https://accounts.spotify.com/api/token', 
        querystring.stringify({
          code: code,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        }),
        {
          headers: {
            'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, refresh_token } = response.data;

      // Log the access token for debugging
      console.log('✅ Tokens received successfully');
      console.log('🔑 Access Token:', access_token);
      console.log('🔄 Refresh Token:', refresh_token);

      // Redirect to frontend with tokens
      res.redirect(
        `http://localhost:3000/dashboard?${querystring.stringify({
          access_token,
          refresh_token
        })}`
      );

    } catch (error) {
      console.error('Error getting tokens:', error.response?.data || error.message);
      res.redirect(`http://localhost:3000/dashboard?` +
        querystring.stringify({ error: 'invalid_token' }));
    }
  }
});

// Token refresh endpoint
app.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const response = await axios.post('https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      }),
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token } = response.data;
    
    console.log('✅ Token refreshed successfully');
    console.log('🔑 New Access Token:', access_token);
    res.json({ access_token });

  } catch (error) {
    console.error('❌ Error refreshing token:', error.response?.data || error.message);
    res.status(400).json({ 
      error: 'Failed to refresh token',
      details: error.response?.data || error.message 
    });
  }
});

// FIXED: GET version without audio features
app.get('/log-listening', async (req, res) => {
  const { userId, access_token } = req.query;
  
  if (!access_token) {
    return res.status(400).json({
      error: 'Access token is required as query parameter',
      example: '/log-listening?access_token=YOUR_TOKEN_HERE&userId=test123'
    });
  }

  try {
    // Get recently played tracks
    const recentlyPlayed = await axios.get(
      'https://api.spotify.com/v1/me/player/recently-played?limit=10',
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    
    const tracks = recentlyPlayed.data.items;
    console.log(`📊 Found ${tracks.length} recently played tracks`);

    // Process tracks with ALL available data (except audio features)
    const processed = tracks.map(({ track, played_at }, index) => ({
      index: index + 1,
      trackId: track.id,
      trackName: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: {
        name: track.album.name,
        id: track.album.id,
        release_date: track.album.release_date,
        total_tracks: track.album.total_tracks,
        images: track.album.images
      },
      duration_ms: track.duration_ms,
      duration_formatted: formatDuration(track.duration_ms),
      popularity: track.popularity,
      explicit: track.explicit,
      preview_url: track.preview_url,
      external_urls: track.external_urls,
      timestamp: played_at,
      timeOfDay: getTimeOfDay(new Date(played_at)),
      // Add some derived insights instead of audio features
      insights: {
        isPopular: track.popularity > 70,
        isRecent: new Date(track.album.release_date) > new Date('2020-01-01'),
        hasPreview: !!track.preview_url,
        albumSize: track.album.total_tracks > 10 ? 'album' : 'ep/single'
      }
    }));

    console.log(`✅ Successfully processed ${processed.length} tracks with full metadata`);

    res.json({
      success: true,
      message: `Successfully processed ${processed.length} tracks with detailed metadata`,
      note: "Audio features unavailable due to Spotify API restrictions",
      data: processed,
      summary: {
        totalTracks: processed.length,
        uniqueArtists: [...new Set(processed.map(t => t.artist))].length,
        timeRange: {
          earliest: processed[processed.length - 1]?.timestamp,
          latest: processed[0]?.timestamp
        }
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get listening data',
      details: error.response?.data || error.message 
    });
  }
});

// FIXED: POST version without audio features
app.post('/log-listening', async (req, res) => {
  const { access_token, user_id } = req.body;

  if (!access_token) {
    return res.status(400).json({ error: 'Access token is required' });
  }

  try {
    const recentlyPlayedResponse = await axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=10', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const recentTracks = recentlyPlayedResponse.data.items;
    console.log(`📊 Found ${recentTracks.length} recently played tracks`);

    const processedTracks = recentTracks.map((item, index) => ({
      index: index + 1,
      trackId: item.track.id,
      trackName: item.track.name,
      artist: item.track.artists.map(a => a.name).join(', '),
      album: item.track.album.name,
      duration_ms: item.track.duration_ms,
      duration_formatted: formatDuration(item.track.duration_ms),
      popularity: item.track.popularity,
      timestamp: item.played_at,
      timeOfDay: getTimeOfDay(new Date(item.played_at)),
      insights: {
        isPopular: item.track.popularity > 70,
        hasPreview: !!item.track.preview_url
      }
    }));

    console.log(`✅ Successfully processed ${processedTracks.length} tracks`);

    res.json({
      success: true,
      message: `Successfully processed ${processedTracks.length} tracks`,
      data: processedTracks
    });

  } catch (error) {
    console.error('❌ Error logging listening data:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to log listening data',
      details: error.response?.data || error.message 
    });
  }
});

// Helper function to format duration
function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Helper function to determine time of day
function getTimeOfDay(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'Spotify Playlist Generator Backend is running!',
    endpoints: [
      'GET /login - Start Spotify OAuth',
      'GET /callback - OAuth callback',
      'POST /refresh - Refresh access token',
      'GET /log-listening - Get listening analytics',
      'POST /log-listening - Log listening data'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Login URL: http://localhost:${PORT}/login`);
  console.log(`📊 Log Listening URL: http://localhost:${PORT}/log-listening`);
});

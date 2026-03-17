const express = require('express');
const cors = require('cors');
const querystring = require('querystring');
const axios = require('axios');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
require('dotenv').config();
const { annotateChronologicalTracks } = require('./services/playbackHeuristics');

const lambdaClient = new LambdaClient({ region: process.env.DYNAMODB_REGION || 'us-east-1' });
const { getItem, putItem, queryItems } = require('./services/dynamodb');
const { saveUserTokens, setProcessing } = require('./services/tokenStore');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Spotify OAuth endpoints
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5000/callback';

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return cookies;
      const key = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function setOAuthStateCookie(res, state) {
  const cookieParts = [
    `spotify_oauth_state=${encodeURIComponent(state)}`,
    'HttpOnly',
    'Path=/',
    'Max-Age=600',
    'SameSite=Lax',
  ];

  if (FRONTEND_URL.startsWith('https://')) {
    cookieParts.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function clearOAuthStateCookie(res) {
  res.setHeader('Set-Cookie', 'spotify_oauth_state=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Login route - redirects to Spotify
app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  const scope = 'user-read-private user-read-email playlist-read-private user-library-read user-read-recently-played user-read-playback-state playlist-modify-public playlist-modify-private';
  setOAuthStateCookie(res, state);

  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope,
      redirect_uri: REDIRECT_URI,
      state,
    }));
});

// Callback route - handles Spotify's response
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = parseCookies(req.headers.cookie).spotify_oauth_state || null;

  if (state === null || storedState === null || state !== storedState) {
    clearOAuthStateCookie(res);
    res.redirect(`${FRONTEND_URL}/dashboard?` + querystring.stringify({ error: 'state_mismatch' }));
  } else {
    try {
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        querystring.stringify({
          code,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, refresh_token } = response.data;
      clearOAuthStateCookie(res);

      console.log('Spotify OAuth tokens received successfully');

      res.redirect(
        `${FRONTEND_URL}/dashboard?${querystring.stringify({
          access_token,
          refresh_token,
        })}`
      );
    } catch (error) {
      clearOAuthStateCookie(res);
      console.error('Error getting tokens:', error.response?.data || error.message);
      res.redirect(`${FRONTEND_URL}/dashboard?` +
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
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token,
      }),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token } = response.data;

    console.log('Spotify access token refreshed successfully');
    res.json({ access_token });
  } catch (error) {
    console.error('Error refreshing token:', error.response?.data || error.message);
    res.status(400).json({
      error: 'Failed to refresh token',
      details: error.response?.data || error.message,
    });
  }
});

// GET version without audio features
app.get('/log-listening', async (req, res) => {
  const { access_token } = req.query;

  if (!access_token) {
    return res.status(400).json({
      error: 'Access token is required as query parameter',
      example: '/log-listening?access_token=YOUR_TOKEN_HERE&userId=test123',
    });
  }

  try {
    const recentlyPlayed = await axios.get(
      'https://api.spotify.com/v1/me/player/recently-played?limit=10',
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const tracks = annotateChronologicalTracks([...recentlyPlayed.data.items].reverse()).reverse();
    console.log(`Found ${tracks.length} recently played tracks`);

    const processed = tracks.map(({ track, played_at, playbackHeuristics }, index) => ({
      index: index + 1,
      trackId: track.id,
      trackName: track.name,
      artist: track.artists.map((artist) => artist.name).join(', '),
      album: {
        name: track.album.name,
        id: track.album.id,
        release_date: track.album.release_date,
        total_tracks: track.album.total_tracks,
        images: track.album.images,
      },
      duration_ms: track.duration_ms,
      duration_formatted: formatDuration(track.duration_ms),
      popularity: track.popularity,
      explicit: track.explicit,
      preview_url: track.preview_url,
      external_urls: track.external_urls,
      timestamp: played_at,
      timeOfDay: getTimeOfDay(new Date(played_at)),
      playback: {
        estimated_listen_ms: playbackHeuristics?.listenWindowMs,
        estimated_completion_ratio: playbackHeuristics?.estimatedCompletionRatio,
        is_skipped: playbackHeuristics?.isSkipped || false,
        is_spam: playbackHeuristics?.isSpam || false,
        include_in_ml: playbackHeuristics?.includeInMl !== false,
        skip_reason: playbackHeuristics?.skipReason || null,
      },
      // Add derived insights instead of Spotify audio features.
      insights: {
        isPopular: track.popularity > 70,
        isRecent: new Date(track.album.release_date) > new Date('2020-01-01'),
        hasPreview: !!track.preview_url,
        albumSize: track.album.total_tracks > 10 ? 'album' : 'ep/single',
      },
    }));

    console.log(`Successfully processed ${processed.length} tracks with full metadata`);

    res.json({
      success: true,
      message: `Successfully processed ${processed.length} tracks with detailed metadata`,
      note: 'Audio features unavailable due to Spotify API restrictions',
      data: processed,
      summary: {
        totalTracks: processed.length,
        skippedTracks: processed.filter((track) => track.playback.is_skipped).length,
        spamTracks: processed.filter((track) => track.playback.is_spam).length,
        uniqueArtists: [...new Set(processed.map((track) => track.artist))].length,
        timeRange: {
          earliest: processed[processed.length - 1]?.timestamp,
          latest: processed[0]?.timestamp,
        },
      },
    });
  } catch (error) {
    console.error('Error getting listening data:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to get listening data',
      details: error.response?.data || error.message,
    });
  }
});

// POST version without audio features
app.post('/log-listening', async (req, res) => {
  const { access_token } = req.body;

  if (!access_token) {
    return res.status(400).json({ error: 'Access token is required' });
  }

  try {
    const recentlyPlayedResponse = await axios.get(
      'https://api.spotify.com/v1/me/player/recently-played?limit=10',
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const recentTracks = annotateChronologicalTracks([...recentlyPlayedResponse.data.items].reverse()).reverse();
    console.log(`Found ${recentTracks.length} recently played tracks`);

    const processedTracks = recentTracks.map((item, index) => ({
      index: index + 1,
      trackId: item.track.id,
      trackName: item.track.name,
      artist: item.track.artists.map((artist) => artist.name).join(', '),
      album: item.track.album.name,
      duration_ms: item.track.duration_ms,
      duration_formatted: formatDuration(item.track.duration_ms),
      popularity: item.track.popularity,
      timestamp: item.played_at,
      timeOfDay: getTimeOfDay(new Date(item.played_at)),
      playback: {
        estimated_listen_ms: item.playbackHeuristics?.listenWindowMs,
        estimated_completion_ratio: item.playbackHeuristics?.estimatedCompletionRatio,
        is_skipped: item.playbackHeuristics?.isSkipped || false,
        is_spam: item.playbackHeuristics?.isSpam || false,
        include_in_ml: item.playbackHeuristics?.includeInMl !== false,
        skip_reason: item.playbackHeuristics?.skipReason || null,
      },
      insights: {
        isPopular: item.track.popularity > 70,
        hasPreview: !!item.track.preview_url,
      },
    }));

    console.log(`Successfully processed ${processedTracks.length} tracks`);

    res.json({
      success: true,
      message: `Successfully processed ${processedTracks.length} tracks`,
      data: processedTracks,
    });
  } catch (error) {
    console.error('Error logging listening data:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to log listening data',
      details: error.response?.data || error.message,
    });
  }
});

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getTimeOfDay(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// POST /save-tokens - store tokens after OAuth for background sync
app.post('/save-tokens', async (req, res) => {
  const { user_id, access_token, refresh_token } = req.body;
  if (!user_id || !access_token || !refresh_token) {
    return res.status(400).json({ error: 'user_id, access_token and refresh_token are required' });
  }
  try {
    await saveUserTokens(user_id, { accessToken: access_token, refreshToken: refresh_token });
    res.json({ success: true });
  } catch (err) {
    console.error('save-tokens error:', err);
    res.status(500).json({ error: 'Failed to save tokens' });
  }
});

// POST /sync-and-cluster - manually trigger data sync + recluster
app.post('/sync-and-cluster', async (req, res) => {
  const { user_id, access_token, refresh_token } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    if (access_token && refresh_token) {
      await saveUserTokens(user_id, { accessToken: access_token, refreshToken: refresh_token });
    }
    await setProcessing(user_id, true);

    const syncArn = process.env.SYNC_LAMBDA_ARN || null;
    const mlArn = process.env.ML_LAMBDA_ARN || null;

    if (syncArn) {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: syncArn,
        InvocationType: 'Event',
        Payload: JSON.stringify({ userId: user_id }),
      }));
    }
    if (mlArn) {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: mlArn,
        InvocationType: 'Event',
        Payload: JSON.stringify({ action: 'run_clustering', userId: user_id }),
      }));
    }

    res.status(202).json({ message: 'Sync and cluster started. Check /cluster-status for updates.' });
  } catch (err) {
    console.error('sync-and-cluster error:', err);
    res.status(500).json({ error: 'Failed to start sync' });
  }
});

// GET /clusters - fetch latest clusters for a user
app.get('/clusters', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    const items = await queryItems('UserClusters', 'userId = :uid', { ':uid': user_id });
    res.json({ clusters: items });
  } catch (err) {
    console.error('clusters error:', err);
    res.status(500).json({ error: 'Failed to fetch clusters' });
  }
});

// GET /cluster-status - sync status for the user
app.get('/cluster-status', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    const meta = await getItem('UserMeta', { userId: user_id });
    const clusterItems = await queryItems('UserClusters', 'userId = :uid', { ':uid': user_id });
    res.json({
      lastSyncAt: meta?.lastSyncAt || null,
      clusterCount: clusterItems.length,
      isProcessing: meta?.isProcessing || false,
    });
  } catch (err) {
    console.error('cluster-status error:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// POST /generate-playlist - natural language playlist generation
app.post('/generate-playlist', async (req, res) => {
  const { access_token, user_id, request: userRequest } = req.body;
  if (!access_token || !user_id || !userRequest) {
    return res.status(400).json({ error: 'access_token, user_id, and request are required' });
  }

  try {
    const clusters = await queryItems('UserClusters', 'userId = :uid', { ':uid': user_id });
    if (!clusters.length) {
      return res.status(400).json({ error: 'No clusters found. Please sync your listening data first.' });
    }

    const mlArn = process.env.ML_LAMBDA_ARN;
    if (!mlArn) return res.status(500).json({ error: 'ML service not configured' });

    const matchPayload = {
      action: 'match_cluster',
      userId: user_id,
      userRequest,
      clusters: clusters.map((cluster) => ({
        clusterId: cluster.clusterId,
        clusterLabel: cluster.clusterLabel,
        clusterDescription: cluster.clusterDescription,
        avgEnergy: cluster.avgEnergy,
        avgValence: cluster.avgValence,
      })),
    };

    const invResult = await lambdaClient.send(new InvokeCommand({
      FunctionName: mlArn,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(matchPayload),
    }));

    const mlResponse = JSON.parse(Buffer.from(invResult.Payload).toString());
    const { clusterId, rationale } = mlResponse.body || mlResponse;

    const matchedCluster = clusters.find((cluster) => cluster.clusterId === clusterId);
    if (!matchedCluster) return res.status(400).json({ error: 'Cluster match failed' });

    const trackIds = [...(matchedCluster.trackIds || [])].sort(() => Math.random() - 0.5).slice(0, 30);
    const trackUris = trackIds.map((id) => `spotify:track:${id}`);

    const profileRes = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const spotifyUserId = profileRes.data.id;

    const playlistName = matchedCluster.clusterLabel;
    const createRes = await axios.post(
      `https://api.spotify.com/v1/users/${spotifyUserId}/playlists`,
      { name: playlistName, description: matchedCluster.clusterDescription, public: false },
      { headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' } }
    );
    const playlistId = createRes.data.id;
    const playlistUrl = createRes.data.external_urls?.spotify;

    if (trackUris.length > 0) {
      await axios.post(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        { uris: trackUris },
        { headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' } }
      );
    }

    await putItem('GeneratedPlaylists', {
      userId: user_id,
      generatedAt: new Date().toISOString(),
      playlistId,
      playlistName,
      userRequest,
      matchedClusterId: clusterId,
      clusterLabel: matchedCluster.clusterLabel,
      gptRationale: rationale || '',
      trackIds,
      spotifyUrl: playlistUrl,
    });

    res.json({
      playlistUrl,
      playlistName,
      clusterLabel: matchedCluster.clusterLabel,
      rationale,
      trackCount: trackUris.length,
    });
  } catch (err) {
    console.error('generate-playlist error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate playlist', details: err.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'Spotify Playlist Generator Backend is running!',
    endpoints: [
      'GET /login - Start Spotify OAuth',
      'GET /callback - OAuth callback',
      'POST /refresh - Refresh access token',
      'GET /log-listening - Get listening analytics',
      'POST /log-listening - Log listening data',
      'POST /save-tokens - Store OAuth tokens for background sync',
      'POST /sync-and-cluster - Trigger data sync and clustering',
      'GET /clusters - Get user music clusters',
      'GET /cluster-status - Get sync status',
      'POST /generate-playlist - Generate playlist from natural language request',
    ],
  });
});

if (!process.env.AWS_EXECUTION_ENV) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Login URL: http://localhost:${PORT}/login`);
  });
}

module.exports = app;

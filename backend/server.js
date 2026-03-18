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
const localState = require('./services/localState');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5000/callback';
const LOCAL_SYNC_MODE = !process.env.SYNC_LAMBDA_ARN || !process.env.ML_LAMBDA_ARN;

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

function getLatestClusters(clusters = []) {
  if (!clusters.length) return [];

  const withVersion = clusters.filter((cluster) => Number.isFinite(Number(cluster.clusteringVersion)));
  if (withVersion.length) {
    const latestVersion = Math.max(...withVersion.map((cluster) => Number(cluster.clusteringVersion)));
    return withVersion.filter((cluster) => Number(cluster.clusteringVersion) === latestVersion);
  }

  const withCreatedAt = clusters.filter((cluster) => cluster.createdAt);
  if (withCreatedAt.length) {
    const latestCreatedAt = withCreatedAt
      .map((cluster) => cluster.createdAt)
      .sort()
      .pop();
    return withCreatedAt.filter((cluster) => cluster.createdAt === latestCreatedAt);
  }

  return clusters;
}

async function fetchSpotifyProfile(accessToken) {
  const response = await axios.get('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data;
}

async function fetchRecentTracks(accessToken, limit = 30) {
  const response = await axios.get(
    `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const seen = new Set();
  return response.data.items
    .map((item) => item.track)
    .filter((track) => track?.id)
    .filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
}

async function fetchLikedTracks(accessToken, limit = 30) {
  const response = await axios.get(
    `https://api.spotify.com/v1/me/tracks?limit=${limit}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const seen = new Set();
  return response.data.items
    .map((item) => item.track)
    .filter((track) => track?.id)
    .filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
}

function dedupeTracks(tracks) {
  const seen = new Set();
  return tracks.filter((track) => {
    if (!track?.id || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

async function buildLocalClusters(accessToken) {
  const [recentTracks, likedTracks] = await Promise.all([
    fetchRecentTracks(accessToken, 30),
    fetchLikedTracks(accessToken, 30),
  ]);

  const recentClusterTracks = dedupeTracks(recentTracks).slice(0, 30);
  const likedClusterTracks = dedupeTracks(
    likedTracks.filter((track) => !recentClusterTracks.some((recent) => recent.id === track.id))
  ).slice(0, 30);

  const clusters = [];
  if (recentClusterTracks.length) {
    clusters.push({
      clusterId: 'local_recent_rotation',
      clusterLabel: 'Recent Rotation',
      clusterDescription: 'Freshly played tracks from your current listening cycle.',
      trackIds: recentClusterTracks.map((track) => track.id),
      trackCount: recentClusterTracks.length,
      dominantTimeOfDay: 'mixed',
      dominantWeather: 'Unknown',
      avgEnergy: 0.6,
      avgValence: 0.5,
    });
  }

  if (likedClusterTracks.length) {
    clusters.push({
      clusterId: 'local_liked_favorites',
      clusterLabel: 'Liked Favorites',
      clusterDescription: 'Saved tracks pulled from your liked songs library.',
      trackIds: likedClusterTracks.map((track) => track.id),
      trackCount: likedClusterTracks.length,
      dominantTimeOfDay: 'mixed',
      dominantWeather: 'Unknown',
      avgEnergy: 0.55,
      avgValence: 0.55,
    });
  }

  return clusters;
}

async function chooseLocalTracksWithOpenAI({ accessToken, userRequest, clusters }) {
  const candidateIds = [...new Set(clusters.flatMap((cluster) => cluster.trackIds || []))].slice(0, 40);
  if (!candidateIds.length) {
    return {
      trackIds: [],
      rationale: 'No local candidate tracks were available yet.',
      clusterLabel: clusters[0]?.clusterLabel || 'Local Mix',
    };
  }

  const trackResponse = await axios.get(`https://api.spotify.com/v1/tracks?ids=${candidateIds.join(',')}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const candidates = (trackResponse.data.tracks || [])
    .filter(Boolean)
    .map((track) => ({
      id: track.id,
      name: track.name,
      artists: track.artists.map((artist) => artist.name).join(', '),
      album: track.album?.name || '',
      popularity: track.popularity || 0,
    }));

  const prompt = {
    request: userRequest,
    instruction: 'Pick 15 to 25 tracks that best fit the request. Use only provided ids.',
    candidates,
  };

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a music curator. Respond with valid JSON only.',
          },
          {
            role: 'user',
            content: JSON.stringify(prompt),
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const parsed = JSON.parse(response.data.choices[0].message.content);
    const chosenIds = (parsed.trackIds || []).filter((id) => candidateIds.includes(id)).slice(0, 25);
    return {
      trackIds: chosenIds.length ? chosenIds : candidateIds.slice(0, 20),
      rationale: parsed.rationale || 'Picked from your recent and liked tracks to match the requested vibe.',
      clusterLabel: parsed.clusterLabel || clusters[0]?.clusterLabel || 'Local Mix',
    };
  } catch (error) {
    console.error('local playlist selection error:', error.response?.data || error.message);
    return {
      trackIds: candidateIds.slice(0, 20),
      rationale: 'Using a fallback selection from your recent and liked tracks.',
      clusterLabel: clusters[0]?.clusterLabel || 'Local Mix',
    };
  }
}

async function createSpotifyPlaylist({ accessToken, playlistName, description, trackIds }) {
  const profile = await fetchSpotifyProfile(accessToken);
  const createResponse = await axios.post(
    `https://api.spotify.com/v1/users/${profile.id}/playlists`,
    { name: playlistName, description, public: false },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );

  const playlistId = createResponse.data.id;
  const playlistUrl = createResponse.data.external_urls?.spotify;
  const trackUris = trackIds.map((id) => `spotify:track:${id}`);

  if (trackUris.length) {
    await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      { uris: trackUris },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
  }

  return {
    playlistId,
    playlistUrl,
    trackCount: trackUris.length,
  };
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

app.post('/save-tokens', async (req, res) => {
  const { user_id, access_token, refresh_token } = req.body;
  if (!user_id || !access_token || !refresh_token) {
    return res.status(400).json({ error: 'user_id, access_token and refresh_token are required' });
  }

  try {
    if (LOCAL_SYNC_MODE) {
      localState.saveTokens(user_id, {
        accessToken: access_token,
        refreshToken: refresh_token,
      });
      return res.json({ success: true, mode: 'local' });
    }

    await saveUserTokens(user_id, { accessToken: access_token, refreshToken: refresh_token });
    res.json({ success: true });
  } catch (err) {
    console.error('save-tokens error:', err);
    res.status(500).json({ error: 'Failed to save tokens' });
  }
});

app.post('/sync-and-cluster', async (req, res) => {
  const { user_id, access_token, refresh_token } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    if (LOCAL_SYNC_MODE) {
      const existingTokens = localState.getTokens(user_id) || {};
      const tokens = {
        accessToken: access_token || existingTokens.accessToken,
        refreshToken: refresh_token || existingTokens.refreshToken,
      };

      if (!tokens.accessToken) {
        return res.status(400).json({ error: 'Access token is required to run local sync' });
      }

      localState.saveTokens(user_id, tokens);
      localState.setStatus(user_id, { isProcessing: true });

      const clusters = await buildLocalClusters(tokens.accessToken);
      localState.setClusters(user_id, clusters);
      localState.setStatus(user_id, {
        isProcessing: false,
        lastSyncAt: new Date().toISOString(),
        clusterCount: clusters.length,
      });

      return res.status(202).json({
        message: 'Local sync and cluster completed.',
        mode: 'local',
        clusterCount: clusters.length,
      });
    }

    if (access_token && refresh_token) {
      await saveUserTokens(user_id, { accessToken: access_token, refreshToken: refresh_token });
    }
    await setProcessing(user_id, true);

    const syncArn = process.env.SYNC_LAMBDA_ARN || null;
    if (syncArn) {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: syncArn,
        InvocationType: 'Event',
        Payload: JSON.stringify({ userId: user_id, runClustering: true }),
      }));
    }

    res.status(202).json({ message: 'Sync and cluster started. Check /cluster-status for updates.' });
  } catch (err) {
    console.error('sync-and-cluster error:', err);
    res.status(500).json({ error: 'Failed to start sync' });
  }
});

app.get('/clusters', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    if (LOCAL_SYNC_MODE) {
      return res.json({ clusters: localState.getClusters(user_id) || [] });
    }

    const items = await queryItems('UserClusters', 'userId = :uid', { ':uid': user_id });
    const latestClusters = getLatestClusters(items);
    res.json({ clusters: latestClusters });
  } catch (err) {
    console.error('clusters error:', err);
    res.status(500).json({ error: 'Failed to fetch clusters' });
  }
});

app.get('/cluster-status', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    if (LOCAL_SYNC_MODE) {
      return res.json(localState.getStatus(user_id));
    }

    const meta = await getItem('UserMeta', { userId: user_id });
    const clusterItems = await queryItems('UserClusters', 'userId = :uid', { ':uid': user_id });
    const latestClusters = getLatestClusters(clusterItems);
    res.json({
      lastSyncAt: meta?.lastSyncAt || null,
      clusterCount: latestClusters.length,
      isProcessing: meta?.isProcessing || false,
      lastSyncSummary: meta?.lastSyncSummary || null,
      lastClusterResult: meta?.lastClusterResult || null,
      lastSyncError: meta?.lastSyncError || null,
      lastPipelineUpdatedAt: meta?.lastPipelineUpdatedAt || null,
    });
  } catch (err) {
    console.error('cluster-status error:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

app.post('/generate-playlist', async (req, res) => {
  const { access_token, user_id, request: userRequest } = req.body;
  if (!access_token || !user_id || !userRequest) {
    return res.status(400).json({ error: 'access_token, user_id, and request are required' });
  }

  try {
    if (LOCAL_SYNC_MODE) {
      const clusters = localState.getClusters(user_id) || [];
      if (!clusters.length) {
        return res.status(400).json({ error: 'No local clusters found. Please sync first.' });
      }

      const localSelection = await chooseLocalTracksWithOpenAI({
        accessToken: access_token,
        userRequest,
        clusters,
      });

      const playlistName = `${localSelection.clusterLabel} - ${userRequest}`.slice(0, 100);
      const playlist = await createSpotifyPlaylist({
        accessToken: access_token,
        playlistName,
        description: localSelection.rationale,
        trackIds: localSelection.trackIds,
      });

      return res.json({
        playlistUrl: playlist.playlistUrl,
        playlistName,
        clusterLabel: localSelection.clusterLabel,
        rationale: localSelection.rationale,
        trackCount: playlist.trackCount,
        mode: 'local',
      });
    }

    const clusters = getLatestClusters(
      await queryItems('UserClusters', 'userId = :uid', { ':uid': user_id })
    );
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
    const playlist = await createSpotifyPlaylist({
      accessToken: access_token,
      playlistName: matchedCluster.clusterLabel,
      description: matchedCluster.clusterDescription,
      trackIds,
    });

    await putItem('GeneratedPlaylists', {
      userId: user_id,
      generatedAt: new Date().toISOString(),
      playlistId: playlist.playlistId,
      playlistName: matchedCluster.clusterLabel,
      userRequest,
      matchedClusterId: clusterId,
      clusterLabel: matchedCluster.clusterLabel,
      gptRationale: rationale || '',
      trackIds,
      spotifyUrl: playlist.playlistUrl,
    });

    res.json({
      playlistUrl: playlist.playlistUrl,
      playlistName: matchedCluster.clusterLabel,
      clusterLabel: matchedCluster.clusterLabel,
      rationale,
      trackCount: playlist.trackCount,
    });
  } catch (err) {
    console.error('generate-playlist error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate playlist', details: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: 'Spotify Playlist Generator Backend is running!',
    mode: LOCAL_SYNC_MODE ? 'local' : 'aws',
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
    console.log(`Sync mode: ${LOCAL_SYNC_MODE ? 'local' : 'aws'}`);
  });
}

module.exports = app;

/**
 * syncListening.js
 * AWS Lambda handler triggered by EventBridge every 30 minutes.
 * Fetches recently played tracks from Spotify for all registered users,
 * enriches with weather and artist genres, detects listening sessions,
 * writes to DynamoDB ListeningEvents, and triggers GPT feature extraction.
 */
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { putItem, getItem, scanItems } = require('../services/dynamodb');
const { getUserTokens, updateSyncCursor, setProcessing } = require('../services/tokenStore');
const { annotateChronologicalTracks } = require('../services/playbackHeuristics');

const lambdaClient = new LambdaClient({ region: process.env.DYNAMODB_REGION || 'us-east-1' });
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

// ── Entry point ────────────────────────────────────────────────────────────────
module.exports.handler = async (event) => {
  console.log('syncListening triggered', JSON.stringify(event));

  // Allow manual invocation with a specific userId, otherwise process all users
  const targetUserId = event.userId || null;

  let users;
  if (targetUserId) {
    const tokens = await getUserTokens(targetUserId);
    users = tokens ? [{ userId: targetUserId, ...tokens }] : [];
  } else {
    // Scan UserMeta to get all registered users
    const userMetas = await scanItems('UserMeta');
    users = userMetas.map((m) => ({ userId: m.userId }));
  }

  const results = [];
  for (const { userId } of users) {
    try {
      const result = await syncUser(userId);
      results.push({ userId, ...result });
    } catch (err) {
      console.error(`Error syncing user ${userId}:`, err);
      results.push({ userId, error: err.message });
    }
  }

  return { statusCode: 200, body: JSON.stringify(results) };
};

// ── Per-user sync ──────────────────────────────────────────────────────────────
async function syncUser(userId) {
  const tokenData = await getUserTokens(userId);
  if (!tokenData) throw new Error('No tokens found for user');

  let { accessToken, refreshToken, locationLat, locationLon, lastSyncCursor } = tokenData;

  // Refresh token if needed (attempt the request; on 401 refresh and retry)
  let tracks = await fetchRecentlyPlayed(accessToken, lastSyncCursor);
  if (tracks === null) {
    accessToken = await refreshAccessToken(refreshToken, userId);
    tracks = await fetchRecentlyPlayed(accessToken, lastSyncCursor);
  }

  if (!tracks || tracks.length === 0) {
    console.log(`No new tracks for user ${userId}`);
    return { synced: 0 };
  }

  // Tracks come newest-first from Spotify; reverse to process chronologically
  tracks.reverse();
  tracks = annotateChronologicalTracks(tracks);

  // Enrich with artist genres (batch by unique artist IDs)
  const allArtistIds = [...new Set(tracks.flatMap((t) => t.track.artists.map((a) => a.id)))];
  const genreMap = await fetchArtistGenres(allArtistIds, accessToken);

  // Assign session IDs
  const tracksWithSessions = computeSessionIds(userId, tracks);

  // Get weather once per sync (uses stored location)
  const weather = await fetchWeather(locationLat || 49.25, locationLon || -123.1);

  // Write each track to DynamoDB
  const newTrackIds = new Set();
  for (const t of tracksWithSessions) {
    const { track, played_at, sessionId, sessionPosition, playbackHeuristics } = t;
    const artistIds = track.artists.map((a) => a.id);
    const artistGenres = [...new Set(artistIds.flatMap((id) => genreMap[id] || []))];
    const item = {
      userId,
      playedAt: played_at,
      trackId: track.id,
      trackName: track.name,
      artistIds,
      artistNames: track.artists.map((a) => a.name).join(', '),
      artistGenres,
      albumId: track.album?.id || '',
      albumName: track.album?.name || '',
      durationMs: track.duration_ms,
      popularity: track.popularity,
      explicit: track.explicit,
      timeOfDay: getTimeOfDay(new Date(played_at)),
      sessionId,
      sessionPosition,
      estimatedListenMs: playbackHeuristics?.listenWindowMs,
      estimatedCompletionRatio: playbackHeuristics?.estimatedCompletionRatio,
      isSkipped: playbackHeuristics?.isSkipped || false,
      isSpam: playbackHeuristics?.isSpam || false,
      includeInMl: playbackHeuristics?.includeInMl !== false,
      skipReason: playbackHeuristics?.skipReason || null,
      weatherCondition: weather?.condition || 'Unknown',
      weatherTempC: weather?.tempC || 0,
      syncedAt: new Date().toISOString(),
    };
    await putItem('ListeningEvents', item);
    newTrackIds.add(track.id);
  }

  // Async-invoke Python ML Lambda to classify any new songs not yet in SongFeatures
  const uniqueNewTracks = tracksWithSessions
    .filter((t) => t.playbackHeuristics?.includeInMl && newTrackIds.has(t.track.id))
    .reduce((acc, t) => {
      if (!acc.find((x) => x.id === t.track.id)) acc.push(t.track);
      return acc;
    }, []);

  await triggerFeatureExtraction(uniqueNewTracks, genreMap);

  // Save the cursor (timestamp of the most recent track, which is last after reverse)
  const latestPlayedAt = tracksWithSessions[tracksWithSessions.length - 1].played_at;
  await updateSyncCursor(userId, latestPlayedAt);

  return {
    synced: tracks.length,
    mlEligible: tracksWithSessions.filter((t) => t.playbackHeuristics?.includeInMl).length,
    skipped: tracksWithSessions.filter((t) => t.playbackHeuristics?.isSkipped).length,
    spam: tracksWithSessions.filter((t) => t.playbackHeuristics?.isSpam).length,
  };
}

// ── Spotify API helpers ────────────────────────────────────────────────────────
async function fetchRecentlyPlayed(accessToken, afterCursor) {
  const url = new URL('https://api.spotify.com/v1/me/player/recently-played');
  url.searchParams.set('limit', '50');
  if (afterCursor) {
    url.searchParams.set('after', String(new Date(afterCursor).getTime()));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) return null; // signal to refresh token
  if (!res.ok) throw new Error(`Spotify recently-played error: ${res.status}`);

  const data = await res.json();
  return data.items || [];
}

async function refreshAccessToken(refreshToken, userId) {
  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json();

  // Persist new access token (refresh token may or may not be rotated)
  const { saveUserTokens, getUserTokens } = require('../services/tokenStore');
  const existing = await getUserTokens(userId);
  await saveUserTokens(userId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    locationLat: existing?.locationLat,
    locationLon: existing?.locationLon,
  });

  return data.access_token;
}

async function fetchArtistGenres(artistIds, accessToken) {
  const genreMap = {};
  // Batch in groups of 50 (Spotify limit)
  for (let i = 0; i < artistIds.length; i += 50) {
    const batch = artistIds.slice(i, i + 50);
    const res = await fetch(
      `https://api.spotify.com/v1/artists?ids=${batch.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) continue;
    const data = await res.json();
    for (const artist of data.artists || []) {
      if (artist) genreMap[artist.id] = artist.genres || [];
    }
  }
  return genreMap;
}

async function fetchWeather(lat, lon) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      condition: data.weather?.[0]?.main || 'Unknown',
      tempC: Math.round(data.main?.temp || 0),
    };
  } catch {
    return null;
  }
}

// ── Session detection ──────────────────────────────────────────────────────────
function computeSessionIds(userId, tracks) {
  // tracks are in chronological order (oldest first after reversing Spotify's newest-first)
  let counter = 0;
  let sessionPosition = 0;
  return tracks.map((t, i) => {
    if (i > 0) {
      const prevMs = new Date(tracks[i - 1].played_at).getTime();
      const currMs = new Date(t.played_at).getTime();
      if (currMs - prevMs > SESSION_GAP_MS) {
        counter++;
        sessionPosition = 0;
      } else {
        sessionPosition++;
      }
    }
    return {
      ...t,
      sessionId: `${userId}_s${counter}`,
      sessionPosition,
    };
  });
}

// ── Time-of-day helper ─────────────────────────────────────────────────────────
function getTimeOfDay(date) {
  const hour = date.getUTCHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ── Trigger Python feature extraction ─────────────────────────────────────────
async function triggerFeatureExtraction(tracks, genreMap) {
  const mlArn = process.env.ML_LAMBDA_ARN;
  if (!mlArn) {
    console.warn('ML_LAMBDA_ARN not set — skipping feature extraction');
    return;
  }

  for (const track of tracks) {
    const artistIds = track.artists.map((a) => a.id);
    const artistGenres = [...new Set(artistIds.flatMap((id) => genreMap[id] || []))];
    const payload = {
      action: 'extract_features',
      trackId: track.id,
      trackName: track.name,
      artistNames: track.artists.map((a) => a.name).join(', '),
      artistGenres,
    };
    try {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: mlArn,
        InvocationType: 'Event', // async — fire and forget
        Payload: JSON.stringify(payload),
      }));
    } catch (err) {
      console.error(`Failed to invoke ML Lambda for track ${track.id}:`, err.message);
    }
  }
}

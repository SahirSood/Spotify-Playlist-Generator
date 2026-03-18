/**
 * syncListening.js
 * AWS Lambda handler triggered by EventBridge every 30 minutes.
 * Fetches recently played tracks from Spotify for all registered users,
 * enriches with historical weather and artist genres, detects listening sessions,
 * writes to DynamoDB ListeningEvents, and triggers song feature extraction.
 */
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { putItem, scanItems, updateItem } = require('../services/dynamodb');
const { getUserTokens, updateSyncCursor, setProcessing } = require('../services/tokenStore');
const { annotateChronologicalTracks } = require('../services/playbackHeuristics');

const lambdaClient = new LambdaClient({ region: process.env.DYNAMODB_REGION || 'us-east-1' });
const SESSION_GAP_MS = 30 * 60 * 1000;

module.exports.handler = async (event) => {
  console.log('syncListening triggered', JSON.stringify(event));

  const targetUserId = event.userId || null;
  const shouldRunClustering = Boolean(event.runClustering);

  let users;
  if (targetUserId) {
    const tokens = await getUserTokens(targetUserId);
    users = tokens ? [{ userId: targetUserId }] : [];
  } else {
    const userMetas = await scanItems('UserMeta');
    users = userMetas.map((item) => ({ userId: item.userId }));
  }

  const results = [];
  for (const { userId } of users) {
    try {
      const result = await syncUser(userId, { waitForFeatureExtraction: shouldRunClustering });
      let clusterResult = null;
      if (shouldRunClustering) {
        clusterResult = await triggerClustering(userId);
      }
      await persistPipelineStatus(userId, { summary: result, clusterResult, error: null });
      results.push({ userId, ...result });
    } catch (err) {
      console.error(`Error syncing user ${userId}:`, err);
      await persistPipelineStatus(userId, { summary: null, clusterResult: null, error: err.message });
      results.push({ userId, error: err.message });
    } finally {
      if (shouldRunClustering) {
        await setProcessing(userId, false);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify(results) };
};

async function syncUser(userId, { waitForFeatureExtraction = false } = {}) {
  const tokenData = await getUserTokens(userId);
  if (!tokenData) throw new Error('No tokens found for user');

  let { accessToken, refreshToken, locationLat, locationLon, lastSyncCursor } = tokenData;

  let tracks = await fetchRecentlyPlayed(accessToken, lastSyncCursor);
  if (tracks === null) {
    accessToken = await refreshAccessToken(refreshToken, userId);
    tracks = await fetchRecentlyPlayed(accessToken, lastSyncCursor);
  }

  if (!tracks || tracks.length === 0) {
    console.log(`No new tracks for user ${userId}`);
    return { synced: 0, mlEligible: 0, skipped: 0, spam: 0 };
  }

  tracks.reverse();
  tracks = annotateChronologicalTracks(tracks);

  const allArtistIds = [...new Set(tracks.flatMap((item) => item.track.artists.map((artist) => artist.id)))];
  const genreMap = await fetchArtistGenres(allArtistIds, accessToken);

  const tracksWithSessions = computeSessionIds(userId, tracks);
  const weatherCache = new Map();

  const newTrackIds = new Set();
  for (const item of tracksWithSessions) {
    const { track, played_at, sessionId, sessionPosition, playbackHeuristics } = item;
    const artistIds = track.artists.map((artist) => artist.id);
    const artistGenres = [...new Set(artistIds.flatMap((id) => genreMap[id] || []))];
    const weather = await fetchHistoricalWeather(
      locationLat || 49.25,
      locationLon || -123.1,
      played_at,
      weatherCache
    );
    await putItem('ListeningEvents', {
      userId,
      playedAt: played_at,
      trackId: track.id,
      trackName: track.name,
      artistIds,
      artistNames: track.artists.map((artist) => artist.name).join(', '),
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
    });
    newTrackIds.add(track.id);
  }

  const uniqueNewTracks = tracksWithSessions
    .filter((item) => item.playbackHeuristics?.includeInMl && newTrackIds.has(item.track.id))
    .reduce((acc, item) => {
      if (!acc.find((track) => track.id === item.track.id)) acc.push(item.track);
      return acc;
    }, []);

  const featureExtraction = await triggerFeatureExtraction(uniqueNewTracks, genreMap, { waitForCompletion: waitForFeatureExtraction });

  const latestPlayedAt = tracksWithSessions[tracksWithSessions.length - 1].played_at;
  await updateSyncCursor(userId, latestPlayedAt);

  return {
    synced: tracks.length,
    mlEligible: tracksWithSessions.filter((item) => item.playbackHeuristics?.includeInMl).length,
    skipped: tracksWithSessions.filter((item) => item.playbackHeuristics?.isSkipped).length,
    spam: tracksWithSessions.filter((item) => item.playbackHeuristics?.isSpam).length,
    featureExtraction,
  };
}

async function fetchRecentlyPlayed(accessToken, afterCursor) {
  const url = new URL('https://api.spotify.com/v1/me/player/recently-played');
  url.searchParams.set('limit', '50');
  if (afterCursor) {
    url.searchParams.set('after', String(new Date(afterCursor).getTime()));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) return null;
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

function getWeatherHourKey(playedAt) {
  return new Date(playedAt).toISOString().slice(0, 13);
}

async function fetchCurrentWeather(lat, lon) {
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

async function fetchHistoricalWeather(lat, lon, playedAt, cache = new Map()) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  const cacheKey = getWeatherHourKey(playedAt);
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const fallback = await fetchCurrentWeather(lat, lon);

  try {
    const unixSeconds = Math.floor(new Date(playedAt).getTime() / 1000);
    const res = await fetch(
      `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${lat}&lon=${lon}&dt=${unixSeconds}&appid=${apiKey}&units=metric`
    );

    if (!res.ok) {
      cache.set(cacheKey, fallback);
      return fallback;
    }

    const data = await res.json();
    const source = Array.isArray(data?.data) ? data.data[0] : data?.current;
    const weather = {
      condition: source?.weather?.[0]?.main || fallback?.condition || 'Unknown',
      tempC: Math.round(source?.temp ?? fallback?.tempC ?? 0),
    };

    cache.set(cacheKey, weather);
    return weather;
  } catch {
    cache.set(cacheKey, fallback);
    return fallback;
  }
}

function computeSessionIds(userId, tracks) {
  let counter = 0;
  let sessionPosition = 0;

  return tracks.map((item, index) => {
    if (index > 0) {
      const prevMs = new Date(tracks[index - 1].played_at).getTime();
      const currMs = new Date(item.played_at).getTime();
      if (currMs - prevMs > SESSION_GAP_MS) {
        counter++;
        sessionPosition = 0;
      } else {
        sessionPosition++;
      }
    }

    return {
      ...item,
      sessionId: `${userId}_s${counter}`,
      sessionPosition,
    };
  });
}

function getTimeOfDay(date) {
  const hour = date.getUTCHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

async function triggerFeatureExtraction(tracks, genreMap, { waitForCompletion = false } = {}) {
  const mlArn = process.env.ML_LAMBDA_ARN;
  if (!mlArn) {
    console.warn('ML_LAMBDA_ARN not set - skipping feature extraction');
    return {
      requested: 0,
      classified: 0,
      cached: 0,
      failed: 0,
      skipped: true,
    };
  }

  const stats = {
    requested: tracks.length,
    classified: 0,
    cached: 0,
    failed: 0,
    skipped: false,
  };

  for (const track of tracks) {
    const artistIds = track.artists.map((artist) => artist.id);
    const artistGenres = [...new Set(artistIds.flatMap((id) => genreMap[id] || []))];
    const payload = {
      action: 'extract_features',
      trackId: track.id,
      trackName: track.name,
      artistNames: track.artists.map((artist) => artist.name).join(', '),
      artistGenres,
    };

    try {
      const result = await lambdaClient.send(new InvokeCommand({
        FunctionName: mlArn,
        InvocationType: waitForCompletion ? 'RequestResponse' : 'Event',
        Payload: JSON.stringify(payload),
      }));

      if (waitForCompletion && result?.Payload) {
        const parsed = JSON.parse(Buffer.from(result.Payload).toString());
        const body = typeof parsed?.body === 'string' ? JSON.parse(parsed.body) : parsed?.body;
        if (body?.cached) {
          stats.cached += 1;
        } else {
          stats.classified += 1;
        }
      }
    } catch (err) {
      console.error(`Failed to invoke ML Lambda for track ${track.id}:`, err.message);
      stats.failed += 1;
    }
  }

  return stats;
}

async function triggerClustering(userId) {
  const mlArn = process.env.ML_LAMBDA_ARN;
  if (!mlArn) {
    console.warn('ML_LAMBDA_ARN not set - skipping clustering');
    return { skipped: true };
  }

  const result = await lambdaClient.send(new InvokeCommand({
    FunctionName: mlArn,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({ action: 'run_clustering', userId }),
  }));

  if (!result?.Payload) {
    return { status: 'unknown' };
  }

  const parsed = JSON.parse(Buffer.from(result.Payload).toString());
  return typeof parsed?.body === 'string' ? JSON.parse(parsed.body) : (parsed?.body || parsed);
}

async function persistPipelineStatus(userId, { summary, clusterResult, error }) {
  await updateItem(
    'UserMeta',
    { userId },
    'SET lastSyncSummary = :summary, lastClusterResult = :clusterResult, lastSyncError = :error, lastPipelineUpdatedAt = :updatedAt',
    {
      ':summary': summary,
      ':clusterResult': clusterResult,
      ':error': error,
      ':updatedAt': new Date().toISOString(),
    }
  );
}

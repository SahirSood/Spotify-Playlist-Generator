# Product Requirements Document

## Spotify Playlist Generator

### Purpose

This document is the canonical product and implementation brief for the current repository. It is written to help future AI coding sessions work from the system that already exists, instead of proposing a new stack or duplicating work.

Primary product goal:

- Generate Spotify playlists from a natural-language mood, vibe, or moment prompt.

Secondary product goal:

- Learn a user's listening habits over time and use those patterns to make playlist generation more personal and cheaper to run.

For MVP, the product is already biased toward the first goal. The current implementation supports the second goal through sync, feature extraction, clustering, and cluster matching.

## Product Summary

Users sign in with Spotify, sync their listening history, let the system cluster their taste patterns, then generate a playlist by describing a mood or scenario in natural language. Instead of asking an LLM to invent a full tracklist on every request, the system uses precomputed user clusters and only asks the LLM to:

- classify uncached songs into compact musical features
- label discovered clusters
- match a user request to the best cluster

This is the main token-saving design choice in the current architecture.

## Current Stack

### Frontend

- React 19 app in `frontend/`
- React Router for navigation
- Hosted locally in development and intended for AWS Amplify in deployment

### Backend

- Node.js 18 Express API in `backend/`
- Wrapped for AWS Lambda with `serverless-http`
- Exposed through API Gateway

### ML / Intelligence Layer

- Python 3.11 Lambda in `backend-python/`
- Uses NumPy and scikit-learn for clustering
- Uses OpenAI for song feature classification, cluster labeling, and request-to-cluster matching

### Data + Infra

- DynamoDB for persistent storage
- AWS KMS envelope encryption for stored Spotify tokens in production
- EventBridge scheduled sync every 30 minutes
- Optional OpenWeather enrichment during sync

## Current MVP Scope

### Included Now

- Spotify OAuth login
- Token storage for background processing
- Scheduled and manual listening-history sync
- Skip / spam filtering heuristics
- Weather and time-of-day enrichment
- Song feature extraction and caching
- User listening clusters
- Natural-language playlist generation
- Spotify playlist creation and track insertion
- Frontend views for library, analytics, clusters, and generation

### Included But Lightweight

- Weather context
- Location, but only as stored latitude/longitude for weather lookup
- Explanation text, but only as the playlist-match rationale returned by the cluster matcher

### Not Yet Implemented

- Direct song-by-song LLM playlist generation
- Embeddings-based retrieval
- Explicit user habit learning from skip rate beyond current heuristics
- Recommendation feed or autoplay suggestions
- Redis / Upstash cache
- Separate recommendation system outside playlist generation

## User Experience

### Main Flow

1. User logs in with Spotify.
2. Frontend receives access and refresh tokens after OAuth callback.
3. Backend stores tokens in `UserMeta`.
4. User triggers sync manually, or scheduled sync runs later.
5. Sync Lambda fetches recent listens, adds context, stores listening events, and triggers song feature extraction for new tracks.
6. Python Lambda clusters the user's listening history and stores labeled clusters.
7. User enters a request like "late-night polished drive".
8. Backend asks the Python Lambda to choose the best existing cluster for that request.
9. Backend creates a Spotify playlist from tracks already associated with that cluster.
10. User opens the playlist in Spotify.

### UX Views Already Present

- Dashboard
- Sync status
- Library browser
- Listening analytics panel
- Cluster view / "music map"
- Playlist generation modal

## Functional Requirements

### Authentication

- Support Spotify OAuth authorization code flow.
- Store both access and refresh tokens after login.
- Refresh access tokens when needed.
- Redirect back to the frontend dashboard after auth.

### Listening Sync

- Sync recently played tracks from Spotify.
- Support manual sync for a single user.
- Support scheduled sync across saved users every 30 minutes.
- Track a sync cursor to avoid reprocessing older listens.

### Listening Event Enrichment

Each synced listening event should capture:

- user ID
- played timestamp
- track ID and track name
- artist IDs and artist names
- artist genres
- album info
- duration and popularity
- explicit flag
- time of day
- session ID and session position
- estimated listen duration
- estimated completion ratio
- skipped / spam / include-in-ML flags
- skip reason
- weather condition and temperature
- sync timestamp

### Feature Extraction

For new tracks, classify and cache compact audio-like metadata using OpenAI. Current extracted features:

- energy
- valence
- danceability
- tempo
- acousticness
- mood
- primary genre

This exists because Spotify audio features are no longer relied on in the current codebase.

### Clustering

- Build normalized feature vectors from listening events plus cached song features.
- Include time-of-day and weather in the vector.
- Blend in session co-occurrence context.
- Run K-means.
- Store cluster label, description, centroid, representative track IDs, averages, and dominant context.

### Playlist Generation

- Accept a natural-language request from the user.
- Match the request to one cluster from the user's saved clusters.
- Build a playlist from the matched cluster's representative tracks.
- Create the playlist in Spotify as private.
- Save generation metadata in DynamoDB.

## Current API Contracts

### `GET /login`

Starts Spotify OAuth.

### `GET /callback`

Handles Spotify OAuth callback and redirects to the frontend with:

- `access_token`
- `refresh_token`

### `POST /refresh`

Request:

```json
{
  "refresh_token": "..."
}
```

Response:

```json
{
  "access_token": "..."
}
```

### `POST /save-tokens`

Request:

```json
{
  "user_id": "spotify:user:abc",
  "access_token": "...",
  "refresh_token": "..."
}
```

Response:

```json
{
  "success": true
}
```

### `POST /sync-and-cluster`

Request:

```json
{
  "user_id": "spotify:user:abc",
  "access_token": "...",
  "refresh_token": "..."
}
```

Response:

```json
{
  "message": "Sync and cluster started. Check /cluster-status for updates."
}
```

### `GET /cluster-status?user_id=...`

Response:

```json
{
  "lastSyncAt": "2026-03-17T00:00:00.000Z",
  "clusterCount": 4,
  "isProcessing": false
}
```

### `GET /clusters?user_id=...`

Response:

```json
{
  "clusters": [
    {
      "userId": "spotify:user:abc",
      "clusterId": "cluster_0_1740000000",
      "clusterLabel": "Late Night Rain Focus",
      "clusterDescription": "Songs for focused, reflective sessions after dark.",
      "trackIds": ["..."],
      "trackCount": 24,
      "dominantTimeOfDay": "night",
      "dominantWeather": "Rain",
      "avgEnergy": 0.42,
      "avgValence": 0.31,
      "avgTempo": 104.5,
      "createdAt": "2026-03-17T00:00:00.000Z"
    }
  ]
}
```

### `POST /generate-playlist`

Request:

```json
{
  "user_id": "spotify:user:abc",
  "access_token": "...",
  "request": "late-night polished drive"
}
```

Response:

```json
{
  "playlistUrl": "https://open.spotify.com/playlist/...",
  "playlistName": "Late Night Rain Focus",
  "clusterLabel": "Late Night Rain Focus",
  "rationale": "This cluster best matches the polished night-driving mood in your listening history.",
  "trackCount": 24
}
```

### `GET /log-listening`

Debug / analytics endpoint for recent listening metadata and skip heuristics. Used by the frontend analytics panel.

## Data Model

### `UserMeta`

Purpose:

- user registration marker
- encrypted Spotify token storage
- sync status / cursor state
- optional location for weather enrichment

Key fields:

- `userId`
- `accessToken`
- `refreshToken`
- `locationLat`
- `locationLon`
- `lastSyncCursor`
- `lastSyncAt`
- `isProcessing`
- `updatedAt`

### `ListeningEvents`

Partition / sort key:

- `userId`
- `playedAt`

Key fields:

- `trackId`
- `trackName`
- `artistIds`
- `artistNames`
- `artistGenres`
- `albumId`
- `albumName`
- `durationMs`
- `popularity`
- `explicit`
- `timeOfDay`
- `sessionId`
- `sessionPosition`
- `estimatedListenMs`
- `estimatedCompletionRatio`
- `isSkipped`
- `isSpam`
- `includeInMl`
- `skipReason`
- `weatherCondition`
- `weatherTempC`
- `syncedAt`

### `SongFeatures`

Purpose:

- cache LLM-derived song features so repeated songs do not incur repeated token cost

Key fields:

- `trackId`
- `trackName`
- `artistNames`
- `artistGenres`
- `energy`
- `valence`
- `danceability`
- `tempo`
- `acousticness`
- `mood`
- `genre_primary`
- `classificationVersion`
- `classifiedAt`
- `gptModel`

### `UserClusters`

Purpose:

- store generated taste / context clusters per user

Key fields:

- `userId`
- `clusterId`
- `clusterLabel`
- `clusterDescription`
- `centroidVector`
- `trackIds`
- `trackCount`
- `dominantTimeOfDay`
- `dominantWeather`
- `avgEnergy`
- `avgValence`
- `avgTempo`
- `createdAt`
- `clusteringVersion`

### `GeneratedPlaylists`

Purpose:

- audit playlist generations and support future analytics

Key fields:

- `userId`
- `generatedAt`
- `playlistId`
- `playlistName`
- `userRequest`
- `matchedClusterId`
- `clusterLabel`
- `gptRationale`
- `trackIds`
- `spotifyUrl`

## Intelligence Design

### Why This Design Is Cheap

The current architecture avoids the most expensive approach, which would be sending a user's listening history plus a long prompt to an LLM every time they ask for a playlist.

Instead:

- songs are classified once and cached in `SongFeatures`
- listening events are clustered offline
- user requests only trigger a small cluster-matching prompt
- generated playlists reuse stored cluster track IDs

### Current OpenAI Responsibilities

1. Song feature classification
2. Cluster naming and description
3. Matching a user request to the best cluster

### What the LLM Does Not Currently Do

- choose every song in real time from the full Spotify catalog
- search Spotify directly
- generate playlists from raw history every request

## Cost Optimization Requirements

### Must Preserve

- Cached `SongFeatures` table with versioning
- Cluster-first generation instead of direct full-tracklist generation
- Small JSON-only prompts
- Optional weather enrichment, not mandatory
- Manual + scheduled sync rather than constant background processing

### Recommended Next Improvements

1. Add a request-result cache for repeated prompts per user and cluster state.
2. Store a compact user summary object so future recommendations can avoid scanning full cluster payloads.
3. Batch feature extraction invocations when traffic grows.
4. Move from `gpt-4o` to a cheaper structured-output model after quality validation.
5. Add a stale-cluster policy so reclustering only runs when enough new listening data exists.

## Non-Goals For The Next Iteration

- Do not rebuild this around Redis unless caching is proven necessary.
- Do not replace the cluster architecture with a fully agentic recommender flow.
- Do not add embeddings before validating that the current cluster matcher is insufficient.
- Do not redesign the stack away from React + Node Lambda + Python Lambda + DynamoDB.

## Constraints And Assumptions

- MVP scale is small, roughly tens of users, not thousands.
- Full listening history is stored in DynamoDB.
- Spotify data availability is constrained by current Spotify APIs.
- Weather is contextual enrichment, not a core dependency.
- Audio features are inferred by the ML Lambda rather than fetched from Spotify.

## Implementation Notes For Future AI Sessions

When extending this product, assume the following:

- The playlist generator is cluster-based, not direct-song-generation based.
- The Node backend is the orchestration layer.
- The Python Lambda owns feature extraction, clustering, and cluster matching.
- DynamoDB table names and schema already exist in Serverless config.
- Frontend generation UX already expects a playlist URL, label, rationale, and track count.

If proposing a new feature, prefer extending the existing flow:

1. enrich sync data
2. improve feature extraction or clustering
3. improve cluster matching
4. only then consider a new generation path

## Roadmap

### Near-Term

- Add prompt-result caching for repeated generation requests
- Save more generation analytics for quality review
- Improve sync progress visibility
- Allow user-controlled location instead of default coordinates

### Mid-Term

- Personal habit summaries by time of day and session type
- Better cluster freshness rules
- Hybrid generation: cluster retrieval plus limited track expansion

### Later

- Embeddings or semantic retrieval for cluster search
- Recommendation feed beyond playlist generation
- More advanced personalization based on repeated playlist actions

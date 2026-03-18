"""
feature_builder.py
Constructs normalized feature vectors from listening events + song features
for K-means clustering. Incorporates co-occurrence context blending.
"""
import math
import numpy as np
from collections import defaultdict
from datetime import datetime, timezone

# Feature vector column indices
IDX_ENERGY = 0
IDX_VALENCE = 1
IDX_DANCEABILITY = 2
IDX_ACOUSTICNESS = 3
IDX_TEMPO = 4
IDX_TIME_MORNING = 5
IDX_TIME_AFTERNOON = 6
IDX_TIME_EVENING = 7
IDX_TIME_NIGHT = 8
IDX_WEATHER = 9
FEATURE_DIM = 10

WEATHER_ENCODING = {
    'Clear': 0.0,
    'Clouds': 0.25,
    'Drizzle': 0.5,
    'Rain': 0.5,
    'Thunderstorm': 0.75,
    'Snow': 0.75,
    'Unknown': 0.5,
}

TIME_OF_DAY_COLS = {
    'morning': IDX_TIME_MORNING,
    'afternoon': IDX_TIME_AFTERNOON,
    'evening': IDX_TIME_EVENING,
    'night': IDX_TIME_NIGHT,
}

CO_OCCURRENCE_WEIGHT = 0.20  # 20% context blend, 80% base features
RECENCY_HALFLIFE_DAYS = 60


def build_feature_matrix(listening_events, song_features_map, half_life_days=RECENCY_HALFLIFE_DAYS):
    """
    Build a feature matrix and metadata list from listening events.

    Args:
        listening_events: list of DynamoDB ListeningEvents items
        song_features_map: dict of trackId -> SongFeatures item

    Returns:
        (feature_matrix np.ndarray shape [N, FEATURE_DIM],
         event_metadata list of dicts with userId, trackId, sessionId, playedAt,
         sample_weights np.ndarray shape [N])
    """
    rows = []
    meta = []
    now = datetime.now(timezone.utc)

    for event in listening_events:
        if not event.get('includeInMl', True):
            continue
        track_id = event.get('trackId')
        features = song_features_map.get(track_id)
        if not features:
            continue  # skip tracks not yet classified

        vec = _build_base_vector(event, features)
        recency_weight = _compute_recency_weight(event.get('playedAt'), now, half_life_days)
        rows.append(vec)
        meta.append({
            'trackId': track_id,
            'trackName': event.get('trackName', ''),
            'artistNames': event.get('artistNames', ''),
            'userId': event.get('userId', ''),
            'sessionId': event.get('sessionId', ''),
            'sessionPosition': event.get('sessionPosition', 0),
            'playedAt': event.get('playedAt', ''),
            'timeOfDay': event.get('timeOfDay', ''),
            'weatherCondition': event.get('weatherCondition', 'Unknown'),
            'recencyWeight': recency_weight,
        })

    if not rows:
        return np.empty((0, FEATURE_DIM)), [], np.empty((0,), dtype=np.float32)

    base_matrix = np.array(rows, dtype=np.float32)
    sample_weights = np.array([m.get('recencyWeight', 1.0) for m in meta], dtype=np.float32)
    blended = _blend_cooccurrence(base_matrix, meta)
    return blended, meta, sample_weights


def _compute_recency_weight(played_at, reference_time, half_life_days):
    """Exponential decay where weight halves every configured half-life window."""
    try:
        played_dt = datetime.fromisoformat((played_at or '').replace('Z', '+00:00'))
        if played_dt.tzinfo is None:
            played_dt = played_dt.replace(tzinfo=timezone.utc)
    except Exception:
        return 1.0

    age_days = max(0.0, (reference_time - played_dt).total_seconds() / 86400.0)
    return float(math.exp(-math.log(2) * (age_days / max(1.0, float(half_life_days)))))


def _build_base_vector(event, features):
    """Convert a single event + its song features into a 10-dim vector."""
    vec = np.zeros(FEATURE_DIM, dtype=np.float32)

    vec[IDX_ENERGY] = float(features.get('energy', 0.5))
    vec[IDX_VALENCE] = float(features.get('valence', 0.5))
    vec[IDX_DANCEABILITY] = float(features.get('danceability', 0.5))
    vec[IDX_ACOUSTICNESS] = float(features.get('acousticness', 0.5))
    vec[IDX_TEMPO] = min(float(features.get('tempo', 120)), 220) / 220.0

    time_col = TIME_OF_DAY_COLS.get(event.get('timeOfDay', 'night'), IDX_TIME_NIGHT)
    vec[time_col] = 1.0

    weather = event.get('weatherCondition', 'Unknown')
    vec[IDX_WEATHER] = WEATHER_ENCODING.get(weather, 0.5)

    return vec


def _blend_cooccurrence(base_matrix, meta):
    """
    Blend each track's feature vector with the mean feature vector of songs
    it was listened to in the same session (co-occurrence context).
    """
    if len(meta) < 2:
        return base_matrix

    # Group row indices by sessionId
    session_indices = defaultdict(list)
    for i, m in enumerate(meta):
        session_id = m.get('sessionId', '')
        if session_id:
            session_indices[session_id].append(i)

    blended = base_matrix.copy()
    for indices in session_indices.values():
        if len(indices) < 2:
            continue
        session_vecs = base_matrix[indices]
        session_mean = session_vecs.mean(axis=0)
        for i in indices:
            blended[i] = (1 - CO_OCCURRENCE_WEIGHT) * base_matrix[i] + CO_OCCURRENCE_WEIGHT * session_mean

    return blended


def get_cluster_stats(indices, meta, song_features_map):
    """
    Compute summary statistics for a cluster given its event indices.
    Returns dict suitable for storing in UserClusters.
    """
    from collections import Counter

    times = [meta[i]['timeOfDay'] for i in indices]
    weathers = [meta[i]['weatherCondition'] for i in indices]

    energies, valences, tempos = [], [], []
    track_ids = []
    seen = set()
    for i in indices:
        tid = meta[i]['trackId']
        f = song_features_map.get(tid, {})
        energies.append(float(f.get('energy', 0.5)))
        valences.append(float(f.get('valence', 0.5)))
        tempos.append(float(f.get('tempo', 120)))
        if tid not in seen:
            track_ids.append(tid)
            seen.add(tid)

    return {
        'trackIds': track_ids[:50],  # store up to 50 representative tracks
        'trackCount': len(track_ids),
        'dominantTimeOfDay': Counter(times).most_common(1)[0][0] if times else 'night',
        'dominantWeather': Counter(weathers).most_common(1)[0][0] if weathers else 'Unknown',
        'avgEnergy': round(float(np.mean(energies)), 3) if energies else 0.5,
        'avgValence': round(float(np.mean(valences)), 3) if valences else 0.5,
        'avgTempo': round(float(np.mean(tempos)), 1) if tempos else 120.0,
    }


def get_sample_tracks_for_label(indices, meta, n=10):
    """Return up to n unique tracks from a cluster for GPT labeling."""
    seen = set()
    samples = []
    for i in indices:
        tid = meta[i]['trackId']
        if tid not in seen:
            seen.add(tid)
            samples.append({
                'trackName': meta[i]['trackName'],
                'artistNames': meta[i]['artistNames'],
                'timeOfDay': meta[i]['timeOfDay'],
                'weatherCondition': meta[i]['weatherCondition'],
            })
        if len(samples) >= n:
            break
    return samples

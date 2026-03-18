"""
handler.py
AWS Lambda entry point for the Spotify ML pipeline.
Dispatches to one of three actions:
  - extract_features: GPT-classify a single song and cache in SongFeatures
  - run_clustering:   K-means cluster a user's listening history
  - match_cluster:    GPT-pick the best cluster for a natural language request
"""
import json
import os
import boto3
import urllib.request
from decimal import Decimal
import prompts
import feature_builder
import clustering as clust

dynamodb = boto3.resource('dynamodb', region_name=os.environ.get('DYNAMODB_REGION', 'us-east-1'))
OPENAI_API_KEY = os.environ['OPENAI_API_KEY']

CLASSIFICATION_VERSION = 1


# ── Entry point ────────────────────────────────────────────────────────────────
def handler(event, context):
    action = event.get('action')
    try:
        if action == 'extract_features':
            return extract_features(event)
        elif action == 'run_clustering':
            return run_clustering(event)
        elif action == 'backfill_features':
            return backfill_features(event)
        elif action == 'match_cluster':
            return match_cluster(event)
        else:
            return _error(400, f"Unknown action: {action}")
    except Exception as e:
        print(f"Handler error [{action}]: {e}")
        raise


# ── Action: extract_features ───────────────────────────────────────────────────
def extract_features(event):
    track_id = event['trackId']
    track_name = event['trackName']
    artist_names = event['artistNames']
    artist_genres = event.get('artistGenres', [])

    table = dynamodb.Table('SongFeatures')

    # Check cache
    existing = table.get_item(Key={'trackId': track_id}).get('Item')
    if existing and existing.get('classificationVersion') == CLASSIFICATION_VERSION:
        print(f"Cache hit for {track_id}")
        return _ok({'cached': True, 'trackId': track_id})

    genres_str = ', '.join(artist_genres[:10]) if artist_genres else 'Unknown'
    prompt = prompts.SONG_CLASSIFICATION_USER.format(
        track_name=track_name,
        artist_names=artist_names,
        genres=genres_str,
    )

    raw = _openai_json_completion(
        model='gpt-4o',
        temperature=0,
        system_prompt=prompts.SONG_CLASSIFICATION_SYSTEM,
        user_prompt=prompt,
    )
    features = json.loads(raw)
    _validate_features(features)

    item = {
        'trackId': track_id,
        'trackName': track_name,
        'artistNames': artist_names,
        'artistGenres': artist_genres,
        'energy': _to_decimal(features['energy']),
        'valence': _to_decimal(features['valence']),
        'danceability': _to_decimal(features['danceability']),
        'tempo': int(features['tempo']),
        'acousticness': _to_decimal(features['acousticness']),
        'mood': features['mood'],
        'genre_primary': features['genre_primary'],
        'classificationVersion': CLASSIFICATION_VERSION,
        'classifiedAt': _now(),
        'gptModel': 'gpt-4o',
    }
    table.put_item(Item=item)
    print(f"Classified and cached {track_id} ({track_name})")
    return _ok({'cached': False, 'trackId': track_id, 'features': features})


# ── Action: run_clustering ─────────────────────────────────────────────────────
def run_clustering(event):
    user_id = event.get('userId')

    # Determine which users to process
    if user_id:
        user_ids = [user_id]
    else:
        # Scan UserMeta for all users
        meta_table = dynamodb.Table('UserMeta')
        scan_result = meta_table.scan(ProjectionExpression='userId')
        user_ids = [item['userId'] for item in scan_result.get('Items', [])]

    total_clusters = 0
    for uid in user_ids:
        try:
            n = _cluster_user(uid)
            total_clusters += n
            print(f"Clustered user {uid}: {n} clusters")
        except Exception as e:
            print(f"Error clustering user {uid}: {e}")

    return _ok({'usersProcessed': len(user_ids), 'clustersCreated': total_clusters})


def _cluster_user(user_id):
    import numpy as np
    from datetime import datetime

    # Fetch all listening events for this user
    events_table = dynamodb.Table('ListeningEvents')
    events = []
    kwargs = {
        'KeyConditionExpression': boto3.dynamodb.conditions.Key('userId').eq(user_id),
    }
    while True:
        result = events_table.query(**kwargs)
        events.extend(result.get('Items', []))
        last = result.get('LastEvaluatedKey')
        if not last:
            break
        kwargs['ExclusiveStartKey'] = last

    if len(events) < 10:
        print(f"Not enough events for user {user_id} ({len(events)})")
        return 0

    # Batch-get song features for all unique track IDs
    track_ids = list({e['trackId'] for e in events})
    features_table = dynamodb.Table('SongFeatures')
    song_features_map = {}
    for i in range(0, len(track_ids), 100):
        batch = track_ids[i:i + 100]
        result = dynamodb.batch_get_item(
            RequestItems={'SongFeatures': {'Keys': [{'trackId': tid} for tid in batch]}}
        )
        for item in result['Responses'].get('SongFeatures', []):
            # Convert Decimal to float
            song_features_map[item['trackId']] = {
                k: float(v) if isinstance(v, Decimal) else v
                for k, v in item.items()
            }

    # Build feature matrix
    X, meta = feature_builder.build_feature_matrix(events, song_features_map)
    if len(X) < 10:
        print(f"Not enough classified tracks for user {user_id}")
        return 0

    # Scale + cluster
    X_scaled, scaler = clust.scale_features(X)
    k = clust.choose_k(X_scaled)
    km, labels = clust.run_kmeans(X_scaled, k)

    # Write clusters to DynamoDB
    now = datetime.utcnow().isoformat() + 'Z'
    clusters_table = dynamodb.Table('UserClusters')
    version = int(datetime.utcnow().timestamp())

    for cluster_idx in range(k):
        indices = [i for i, l in enumerate(labels) if l == cluster_idx]
        if not indices:
            continue

        stats = feature_builder.get_cluster_stats(indices, meta, song_features_map)
        sample_tracks = feature_builder.get_sample_tracks_for_label(indices, meta)

        # GPT labeling is best-effort. If it fails, still persist the cluster.
        try:
            label_data = _gpt_label_cluster(sample_tracks, stats)
        except Exception as ex:
            print(f"Cluster label fallback for user {user_id}, cluster {cluster_idx}: {ex}")
            label_data = _fallback_cluster_label(cluster_idx, stats)
        cluster_id = f"cluster_{cluster_idx}_{version}"

        centroid = km.cluster_centers_[cluster_idx].tolist()

        item = {
            'userId': user_id,
            'clusterId': cluster_id,
            'clusterLabel': label_data.get('label', f'Cluster {cluster_idx + 1}'),
            'clusterDescription': label_data.get('description', ''),
            'centroidVector': [_to_decimal(v) for v in centroid],
            'trackIds': stats['trackIds'],
            'trackCount': stats['trackCount'],
            'dominantTimeOfDay': stats['dominantTimeOfDay'],
            'dominantWeather': stats['dominantWeather'],
            'avgEnergy': _to_decimal(stats['avgEnergy']),
            'avgValence': _to_decimal(stats['avgValence']),
            'avgTempo': _to_decimal(stats['avgTempo']),
            'createdAt': now,
            'clusteringVersion': version,
        }
        clusters_table.put_item(Item=item)

    return k


def _gpt_label_cluster(sample_tracks, stats):
    tracks_str = json.dumps(sample_tracks, indent=2)
    prompt = prompts.CLUSTER_LABEL_USER.format(
        sample_tracks=tracks_str,
        avg_energy=stats['avgEnergy'],
        avg_valence=stats['avgValence'],
        avg_tempo=stats['avgTempo'],
        dominant_time=stats['dominantTimeOfDay'],
        dominant_weather=stats['dominantWeather'],
    )
    raw = _openai_json_completion(
        model='gpt-4o',
        temperature=0.3,
        system_prompt=prompts.CLUSTER_LABEL_SYSTEM,
        user_prompt=prompt,
    )
    return json.loads(raw)


def _fallback_cluster_label(cluster_idx, stats):
    tone = 'balanced'
    if stats['avgEnergy'] >= 0.67:
        tone = 'high-energy'
    elif stats['avgEnergy'] <= 0.33:
        tone = 'low-energy'

    mood = 'uplifting' if stats['avgValence'] >= 0.5 else 'moody'
    time_of_day = stats.get('dominantTimeOfDay', 'mixed')

    return {
        'label': f"{time_of_day.title()} {tone} {mood}".strip(),
        'description': (
            f"Auto-labeled fallback cluster for mostly {time_of_day} listening with "
            f"{tone} and {mood} characteristics."
        ),
    }


# ── Action: backfill_features ─────────────────────────────────────────────────
def backfill_features(event):
    """Classify all unclassified tracks already in ListeningEvents for a user."""
    user_id = event.get('userId')
    if not user_id:
        return _error(400, 'userId is required')

    events_table = dynamodb.Table('ListeningEvents')
    features_table = dynamodb.Table('SongFeatures')

    # Fetch all listening events for this user
    events = []
    kwargs = {'KeyConditionExpression': boto3.dynamodb.conditions.Key('userId').eq(user_id)}
    while True:
        result = events_table.query(**kwargs)
        events.extend(result.get('Items', []))
        last = result.get('LastEvaluatedKey')
        if not last:
            break
        kwargs['ExclusiveStartKey'] = last

    # Collect unique unclassified tracks
    seen = set()
    to_classify = []
    for e in events:
        tid = e.get('trackId')
        if not tid or tid in seen:
            continue
        seen.add(tid)
        existing = features_table.get_item(Key={'trackId': tid}).get('Item')
        if existing and existing.get('classificationVersion') == CLASSIFICATION_VERSION:
            continue
        to_classify.append(e)

    print(f"Backfill: {len(events)} events, {len(to_classify)} tracks need classification")

    classified = 0
    failed = 0
    for e in to_classify:
        try:
            extract_features({
                'trackId': e['trackId'],
                'trackName': e.get('trackName', ''),
                'artistNames': e.get('artistNames', ''),
                'artistGenres': e.get('artistGenres', []),
            })
            classified += 1
            print(f"Classified {e.get('trackName')} ({e['trackId']})")
        except Exception as ex:
            print(f"Failed to classify {e['trackId']}: {ex}")
            failed += 1

    return _ok({'eventsFound': len(events), 'classified': classified, 'failed': failed})


# ── Action: match_cluster ──────────────────────────────────────────────────────
def match_cluster(event):
    user_request = event['userRequest']
    clusters = event['clusters']  # list of {clusterId, clusterLabel, clusterDescription, ...}

    if not clusters:
        return _error(400, 'No clusters available for this user')

    cluster_list = '\n'.join([
        f'{i + 1}. [{c["clusterId"]}] "{c["clusterLabel"]}" — {c.get("clusterDescription", "")}'
        for i, c in enumerate(clusters)
    ])

    prompt = prompts.PLAYLIST_MATCH_USER.format(
        user_request=user_request,
        cluster_list=cluster_list,
    )

    raw = _openai_json_completion(
        model='gpt-4o',
        temperature=0.2,
        system_prompt=prompts.PLAYLIST_MATCH_SYSTEM,
        user_prompt=prompt,
    )
    result = json.loads(raw)
    return _ok(result)


# ── Utilities ──────────────────────────────────────────────────────────────────
def _validate_features(f):
    required = ['energy', 'valence', 'danceability', 'tempo', 'acousticness', 'mood', 'genre_primary']
    for key in required:
        if key not in f:
            raise ValueError(f"GPT response missing key: {key}")
    for key in ['energy', 'valence', 'danceability', 'acousticness']:
        if not (0.0 <= float(f[key]) <= 1.0):
            raise ValueError(f"Feature {key}={f[key]} out of range [0,1]")


def _to_decimal(value):
    return Decimal(str(round(float(value), 4)))


def _openai_json_completion(model, temperature, system_prompt, user_prompt):
    payload = json.dumps({
        'model': model,
        'temperature': temperature,
        'response_format': {'type': 'json_object'},
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt},
        ],
    }).encode('utf-8')

    request = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {OPENAI_API_KEY}',
        },
        method='POST',
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        body = json.loads(response.read().decode('utf-8'))

    return body['choices'][0]['message']['content']


def _now():
    from datetime import datetime
    return datetime.utcnow().isoformat() + 'Z'


def _ok(body):
    return {'statusCode': 200, 'body': body}


def _error(code, message):
    return {'statusCode': code, 'body': {'error': message}}

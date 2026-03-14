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
from decimal import Decimal
from openai import OpenAI
import prompts
import feature_builder
import clustering as clust

dynamodb = boto3.resource('dynamodb', region_name=os.environ.get('DYNAMODB_REGION', 'us-east-1'))
openai_client = OpenAI(api_key=os.environ['OPENAI_API_KEY'])

CLASSIFICATION_VERSION = 1


# ── Entry point ────────────────────────────────────────────────────────────────
def handler(event, context):
    action = event.get('action')
    try:
        if action == 'extract_features':
            return extract_features(event)
        elif action == 'run_clustering':
            return run_clustering(event)
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

    response = openai_client.chat.completions.create(
        model='gpt-4o',
        temperature=0,
        response_format={'type': 'json_object'},
        messages=[
            {'role': 'system', 'content': prompts.SONG_CLASSIFICATION_SYSTEM},
            {'role': 'user', 'content': prompt},
        ],
    )

    raw = response.choices[0].message.content
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

        # GPT label
        label_data = _gpt_label_cluster(sample_tracks, stats)
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
    response = openai_client.chat.completions.create(
        model='gpt-4o',
        temperature=0.3,
        response_format={'type': 'json_object'},
        messages=[
            {'role': 'system', 'content': prompts.CLUSTER_LABEL_SYSTEM},
            {'role': 'user', 'content': prompt},
        ],
    )
    return json.loads(response.choices[0].message.content)


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

    response = openai_client.chat.completions.create(
        model='gpt-4o',
        temperature=0.2,
        response_format={'type': 'json_object'},
        messages=[
            {'role': 'system', 'content': prompts.PLAYLIST_MATCH_SYSTEM},
            {'role': 'user', 'content': prompt},
        ],
    )

    result = json.loads(response.choices[0].message.content)
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


def _now():
    from datetime import datetime
    return datetime.utcnow().isoformat() + 'Z'


def _ok(body):
    return {'statusCode': 200, 'body': body}


def _error(code, message):
    return {'statusCode': code, 'body': {'error': message}}

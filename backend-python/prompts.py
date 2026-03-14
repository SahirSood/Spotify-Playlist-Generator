"""GPT prompt templates for the Spotify Playlist Generator ML pipeline."""

SONG_CLASSIFICATION_SYSTEM = """You are a music analysis expert. Given a song's title, artist name, \
and genre tags, estimate its musical characteristics as numeric values. \
Respond ONLY with valid JSON — no markdown, no explanation."""

SONG_CLASSIFICATION_USER = """Classify this song:
Title: "{track_name}"
Artist: "{artist_names}"
Genres: {genres}

Return JSON with exactly these keys:
{{
  "energy": <float 0.0-1.0, how energetic/intense the track is>,
  "valence": <float 0.0-1.0, 0=very sad/dark, 1=very happy/euphoric>,
  "danceability": <float 0.0-1.0, how suitable for dancing>,
  "tempo": <integer BPM, e.g. 120>,
  "acousticness": <float 0.0-1.0, 0=fully electronic, 1=fully acoustic>,
  "mood": <one of: "happy", "sad", "angry", "calm", "anxious", "romantic", "nostalgic", "energetic">,
  "genre_primary": <one of: "pop", "rock", "hip-hop", "electronic", "r&b", "country", "jazz", "classical", "indie", "metal", "folk", "latin", "reggae", "other">
}}"""

CLUSTER_LABEL_SYSTEM = """You are a music curator creating evocative playlist names. \
Given information about a cluster of songs from a user's listening history, \
create a short name and description that captures the mood and context. \
Respond ONLY with valid JSON."""

CLUSTER_LABEL_USER = """Here are representative songs from this listening cluster:
{sample_tracks}

Cluster statistics:
- Average energy: {avg_energy:.2f}
- Average valence (happiness): {avg_valence:.2f}
- Average tempo: {avg_tempo:.0f} BPM
- Most common listening time: {dominant_time}
- Most common weather: {dominant_weather}

Return JSON:
{{
  "label": "<3-5 word evocative name, e.g. 'Late Night Rain Focus'>",
  "description": "<one sentence describing when and why someone listens to these songs>"
}}"""

PLAYLIST_MATCH_SYSTEM = """You are a music recommendation engine. A user wants to generate a playlist \
based on their historical listening patterns. Pick the single cluster that best matches their request. \
Respond ONLY with valid JSON."""

PLAYLIST_MATCH_USER = """User's playlist request: "{user_request}"

Available clusters from this user's listening history:
{cluster_list}

Return JSON:
{{
  "clusterId": "<exact cluster ID string from the list above>",
  "rationale": "<one sentence explaining why this cluster matches the request>"
}}"""

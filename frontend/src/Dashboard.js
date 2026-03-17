import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import GeneratePlaylist from "./GeneratePlaylist";
import ClusterView from "./ClusterView";
import SyncStatus from "./SyncStatus";
import { fetchClusters, fetchClusterStatus, saveClusters } from "./api";
import "./Dashboard.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
const LIKED_SONGS_ID = "liked-songs";
const LIKED_SONGS_NAME = "Liked Songs";

function formatPercent(ratio) {
  if (ratio === null || ratio === undefined) return "Live now";
  return `${Math.round(ratio * 100)}%`;
}

function getPlaybackBadge(playback) {
  if (!playback) return { label: "Tracked", tone: "neutral" };
  if (playback.is_spam) return { label: "Rapid replay", tone: "warn" };
  if (playback.is_skipped) return { label: "Skipped", tone: "danger" };
  if (playback.include_in_ml === false) return { label: "Excluded", tone: "warn" };
  return { label: "Tracked", tone: "ok" };
}

function Dashboard() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [playlists, setPlaylists] = useState([]);
  const [likedSongs, setLikedSongs] = useState([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedPlaylistName, setSelectedPlaylistName] = useState("");
  const [nextLikedSongsUrl, setNextLikedSongsUrl] = useState("");
  const [nextPlaylistSongsUrl, setNextPlaylistSongsUrl] = useState("");
  const [listeningData, setListeningData] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [userId, setUserId] = useState("");
  const [clusters, setClusters] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const [generatePrefill, setGeneratePrefill] = useState("");

  const closePanels = useCallback(() => {
    setShowSidebar(false);
    setShowAnalytics(false);
    setShowClusters(false);
  }, []);

  const handleLogout = useCallback(() => {
    setAccessToken("");
    setRefreshToken("");
    localStorage.removeItem("spotify_access_token");
    localStorage.removeItem("spotify_refresh_token");
    localStorage.removeItem("spotify_user_id");
    setPlaylists([]);
    setLikedSongs([]);
    setSelectedPlaylistName("");
    setNextLikedSongsUrl("");
    setNextPlaylistSongsUrl("");
    setListeningData(null);
    setClusters([]);
    setSyncStatus(null);
    setShowGenerateModal(false);
    closePanels();
    navigate("/");
  }, [closePanels, navigate]);

  const refreshAccessToken = useCallback(async () => {
    if (!refreshToken) {
      handleLogout();
      return null;
    }

    try {
      const response = await fetch(`${API_BASE}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        throw new Error("Failed to refresh token");
      }

      const data = await response.json();
      const newAccessToken = data.access_token;
      setAccessToken(newAccessToken);
      localStorage.setItem("spotify_access_token", newAccessToken);
      return newAccessToken;
    } catch (error) {
      console.error("Error refreshing token:", error);
      handleLogout();
      return null;
    }
  }, [handleLogout, refreshToken]);

  const spotifyFetch = useCallback(async (url, options = {}) => {
    let token = accessToken;

    let response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      token = await refreshAccessToken();
      if (!token) {
        throw new Error("Unable to refresh token");
      }

      response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });
    }

    return response;
  }, [accessToken, refreshAccessToken]);

  const fetchListeningAnalytics = useCallback(async () => {
    try {
      setShowAnalytics(true);
      setShowSidebar(false);
      setShowClusters(false);

      const response = await fetch(
        `${API_BASE}/log-listening?access_token=${accessToken}&userId=dashboard_user`
      );

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      setListeningData(data);
    } catch (error) {
      console.error("Error fetching listening analytics:", error);
      alert("Failed to load listening analytics. Please try again.");
    }
  }, [accessToken]);

  const loadClusterData = useCallback(async (uid) => {
    try {
      const [clusterRes, statusRes] = await Promise.all([
        fetchClusters(uid),
        fetchClusterStatus(uid),
      ]);
      setClusters(clusterRes.clusters || []);
      setSyncStatus(statusRes);
    } catch (error) {
      console.error("Failed to load cluster data:", error);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access_token =
      params.get("access_token") || localStorage.getItem("spotify_access_token");
    const refresh_token =
      params.get("refresh_token") || localStorage.getItem("spotify_refresh_token");

    if (!access_token || !refresh_token) {
      return;
    }

    setAccessToken(access_token);
    setRefreshToken(refresh_token);
    localStorage.setItem("spotify_access_token", access_token);
    localStorage.setItem("spotify_refresh_token", refresh_token);

    if (params.get("access_token")) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    })
      .then((response) => response.json())
      .then((profile) => {
        const uid = `spotify:user:${profile.id}`;
        setUserId(uid);
        localStorage.setItem("spotify_user_id", uid);
        saveClusters(uid, access_token, refresh_token).catch(() => {});
        loadClusterData(uid);
      })
      .catch(() => {});
  }, [loadClusterData]);

  useEffect(() => {
    if (!accessToken || !refreshToken) return;

    const fetchPlaylists = async () => {
      try {
        const response = await spotifyFetch("https://api.spotify.com/v1/me/playlists");
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        const likedSongsPlaceholder = { id: LIKED_SONGS_ID, name: LIKED_SONGS_NAME };
        setPlaylists([likedSongsPlaceholder, ...(data.items || [])]);
      } catch (error) {
        console.error("Error fetching playlists:", error);
      }
    };

    fetchPlaylists();
  }, [accessToken, refreshToken, spotifyFetch]);

  const fetchLikedSongs = useCallback(async () => {
    setSelectedPlaylistName(LIKED_SONGS_NAME);
    setShowSidebar(true);
    setShowAnalytics(false);
    setShowClusters(false);
    setLikedSongs([]);

    try {
      const response = await spotifyFetch("https://api.spotify.com/v1/me/tracks");
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      setLikedSongs(data.items || []);
      setNextLikedSongsUrl(data.next || "");
      setNextPlaylistSongsUrl("");
    } catch (error) {
      console.error("Error fetching liked songs:", error);
      alert("Failed to fetch liked songs. Please try again.");
    }
  }, [spotifyFetch]);

  const loadMoreLikedSongs = useCallback(async () => {
    if (!nextLikedSongsUrl) return;

    try {
      const response = await spotifyFetch(nextLikedSongsUrl);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      setLikedSongs((prevSongs) => [...prevSongs, ...(data.items || [])]);
      setNextLikedSongsUrl(data.next || "");
    } catch (error) {
      console.error("Error fetching more liked songs:", error);
      alert("Failed to load more liked songs. Please try again.");
    }
  }, [nextLikedSongsUrl, spotifyFetch]);

  const fetchPlaylistSongs = useCallback(async (playlist) => {
    setSelectedPlaylistName(playlist.name);
    setShowSidebar(true);
    setShowAnalytics(false);
    setShowClusters(false);
    setLikedSongs([]);
    setNextPlaylistSongsUrl("");

    try {
      const response = await spotifyFetch(
        `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`
      );

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      setLikedSongs(data.items || []);
      setNextPlaylistSongsUrl(data.next || "");
      setNextLikedSongsUrl("");
    } catch (error) {
      console.error("Error fetching playlist songs:", error);
      alert("Failed to fetch playlist songs. Please try again.");
    }
  }, [spotifyFetch]);

  const loadMorePlaylistSongs = useCallback(async () => {
    if (!nextPlaylistSongsUrl) return;

    try {
      const response = await spotifyFetch(nextPlaylistSongsUrl);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      setLikedSongs((prevSongs) => [...prevSongs, ...(data.items || [])]);
      setNextPlaylistSongsUrl(data.next || "");
    } catch (error) {
      console.error("Error fetching more songs for playlist:", error);
    }
  }, [nextPlaylistSongsUrl, spotifyFetch]);

  const handlePlaylistClick = useCallback((playlist) => {
    if (playlist.id === LIKED_SONGS_ID) {
      fetchLikedSongs();
      return;
    }
    fetchPlaylistSongs(playlist);
  }, [fetchLikedSongs, fetchPlaylistSongs]);

  const handleScroll = useCallback((event) => {
    const { scrollTop, scrollHeight, clientHeight } = event.target;
    if (scrollTop + clientHeight < scrollHeight - 12) return;

    if (selectedPlaylistName === LIKED_SONGS_NAME) {
      loadMoreLikedSongs();
    } else {
      loadMorePlaylistSongs();
    }
  }, [loadMoreLikedSongs, loadMorePlaylistSongs, selectedPlaylistName]);

  const trackCount = listeningData?.data?.length || 0;
  const skippedTracks = listeningData?.summary?.skippedTracks || 0;
  const spamTracks = listeningData?.summary?.spamTracks || 0;
  const stats = [
    { label: "Playlists", value: playlists.length ? playlists.length - 1 : 0 },
    { label: "Clusters", value: clusters.length },
    { label: "Recent Tracks", value: trackCount },
    { label: "Filtered", value: skippedTracks + spamTracks },
  ];

  const syncHeadline = syncStatus?.isProcessing
    ? "Sync is running"
    : syncStatus?.lastSyncAt
      ? "Data is ready"
      : "Ready to sync";

  return (
    <div className="dashboard-shell">
      <div className="dashboard-glow dashboard-glow-left" aria-hidden="true" />
      <div className="dashboard-glow dashboard-glow-right" aria-hidden="true" />

      <main className="dashboard-main">
        <section className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <span className="dashboard-kicker">Taste Graph</span>
            <h1>Your listening brain, cleaned up.</h1>
            <p>
              Browse playlists, inspect recent behavior, and build smarter clusters from
              real plays instead of accidental skips and spam loops.
            </p>
          </div>

          <div className="dashboard-hero-actions">
            <button
              className="dashboard-action dashboard-action-primary"
              onClick={() => {
                setGeneratePrefill("");
                setShowGenerateModal(true);
              }}
            >
              Generate playlist
            </button>
            <button
              className="dashboard-action"
              onClick={() => {
                setShowClusters(true);
                setShowSidebar(false);
                setShowAnalytics(false);
              }}
            >
              Open clusters
            </button>
            <button
              className="dashboard-action"
              onClick={fetchListeningAnalytics}
            >
              View analytics
            </button>
            <button
              className="dashboard-action dashboard-action-ghost"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </section>

        <section className="dashboard-stats">
          {stats.map((stat) => (
            <article key={stat.label} className="dashboard-stat-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </section>

        <section className="dashboard-grid">
          <article className="dashboard-panel dashboard-panel-wide">
            <div className="dashboard-panel-head">
              <div>
                <span className="dashboard-section-tag">Pipeline</span>
                <h2>{syncHeadline}</h2>
              </div>
            </div>
            <p className="dashboard-panel-copy">
              Tracks under 25% estimated completion and rapid replays are now marked so
              clustering can focus on meaningful listening sessions.
            </p>
            <div className="dashboard-pill-row">
              <span className="dashboard-pill">Skip threshold: 25%</span>
              <span className="dashboard-pill">Rapid replay guarded</span>
              <span className="dashboard-pill">
                Last sync: {syncStatus?.lastSyncAt ? "Recorded" : "Not yet"}
              </span>
            </div>
            <div className="dashboard-sync-card">
              <SyncStatus
                userId={userId}
                accessToken={accessToken}
                refreshToken={refreshToken}
                status={syncStatus}
                onStatusChange={setSyncStatus}
                onSynced={() => {
                  if (userId) loadClusterData(userId);
                }}
              />
            </div>
          </article>

          <article className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <span className="dashboard-section-tag">Machine Taste</span>
                <h2>Cluster snapshot</h2>
              </div>
            </div>
            <p className="dashboard-panel-copy">
              Your model groups music by how and when you listen, not just genre labels.
            </p>
            <div className="dashboard-cluster-preview">
              <strong>{clusters.length}</strong>
              <span>clusters detected</span>
            </div>
          </article>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <span className="dashboard-section-tag">Library</span>
              <h2>Your playlists</h2>
            </div>
            <span className="dashboard-panel-meta">
              {playlists.length ? `${playlists.length} sources ready` : "Loading"}
            </span>
          </div>

          <div className="dashboard-playlist-grid">
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className="dashboard-playlist-card"
                onClick={() => handlePlaylistClick(playlist)}
              >
                <span className="dashboard-playlist-icon">
                  {playlist.id === LIKED_SONGS_ID ? "Saved" : "List"}
                </span>
                <strong>{playlist.name}</strong>
                <span>Open tracks</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      <aside className={`side-panel ${showSidebar ? "is-open" : ""}`}>
        <div className="side-panel-head">
          <div>
            <span className="dashboard-section-tag">Tracks</span>
            <h2>{selectedPlaylistName}</h2>
            <p>{likedSongs.length} loaded</p>
          </div>
          <button type="button" className="side-close" onClick={() => setShowSidebar(false)}>
            Close
          </button>
        </div>
        <div className="side-panel-body" onScroll={handleScroll}>
          {likedSongs.length > 0 ? (
            likedSongs.map((song, index) => (
              <article key={`${song.track.id}-${index}`} className="song-row">
                <span className="song-row-index">{index + 1}</span>
                <div className="song-row-copy">
                  <strong>{song.track.name}</strong>
                  <span>{song.track.artists.map((artist) => artist.name).join(", ")}</span>
                </div>
              </article>
            ))
          ) : (
            <div className="side-empty">No tracks loaded yet.</div>
          )}
        </div>
      </aside>

      <aside className={`side-panel side-panel-analytics ${showAnalytics ? "is-open" : ""}`}>
        <div className="side-panel-head">
          <div>
            <span className="dashboard-section-tag">Analytics</span>
            <h2>Recent listening</h2>
            <p>
              {listeningData
                ? `${listeningData.data?.length || 0} tracks inspected`
                : "Loading"}
            </p>
          </div>
          <button type="button" className="side-close" onClick={() => setShowAnalytics(false)}>
            Close
          </button>
        </div>

        <div className="side-panel-body analytics-body">
          {listeningData ? (
            <>
              <section className="analytics-summary-grid">
                <article className="analytics-summary-card">
                  <span>Tracked</span>
                  <strong>{listeningData.summary?.totalTracks || 0}</strong>
                </article>
                <article className="analytics-summary-card">
                  <span>Skipped</span>
                  <strong>{listeningData.summary?.skippedTracks || 0}</strong>
                </article>
                <article className="analytics-summary-card">
                  <span>Rapid replay</span>
                  <strong>{listeningData.summary?.spamTracks || 0}</strong>
                </article>
                <article className="analytics-summary-card">
                  <span>Artists</span>
                  <strong>{listeningData.summary?.uniqueArtists || 0}</strong>
                </article>
              </section>

              <section className="analytics-note">
                Skip filtering is estimated from the time gap between consecutive plays,
                so it is a smart heuristic, not a perfect read of exact playback progress.
              </section>

              <section className="analytics-track-list">
                {(listeningData.data || []).map((track, index) => {
                  const badge = getPlaybackBadge(track.playback);
                  return (
                    <article key={`${track.trackId}-${index}`} className="analytics-track-card">
                      <div className="analytics-track-top">
                        <div>
                          <strong>{track.trackName}</strong>
                          <span>{track.artist}</span>
                        </div>
                        <span className={`analytics-badge tone-${badge.tone}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="analytics-track-meta">
                        <span>{track.timeOfDay}</span>
                        <span>{formatPercent(track.playback?.estimated_completion_ratio)}</span>
                      </div>
                    </article>
                  );
                })}
              </section>
            </>
          ) : (
            <div className="side-empty">Loading your listening analytics...</div>
          )}
        </div>
      </aside>

      <aside className={`side-panel side-panel-clusters ${showClusters ? "is-open" : ""}`}>
        <div className="side-panel-head">
          <div>
            <span className="dashboard-section-tag">Clusters</span>
            <h2>Your music map</h2>
            <p>{clusters.length} clusters available</p>
          </div>
          <button type="button" className="side-close" onClick={() => setShowClusters(false)}>
            Close
          </button>
        </div>
        <div className="side-panel-body">
          <ClusterView
            clusters={clusters}
            onGenerateFromCluster={(label) => {
              setShowClusters(false);
              setGeneratePrefill(label);
              setShowGenerateModal(true);
            }}
          />
        </div>
      </aside>

      {(showSidebar || showAnalytics || showClusters) && (
        <button type="button" className="dashboard-overlay" onClick={closePanels} aria-label="Close panel" />
      )}

      {showGenerateModal && (
        <GeneratePlaylist
          userId={userId}
          accessToken={accessToken}
          initialRequest={generatePrefill}
          onClose={() => setShowGenerateModal(false)}
        />
      )}
    </div>
  );
}

export default Dashboard;

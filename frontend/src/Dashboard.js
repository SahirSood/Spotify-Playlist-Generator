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

/* ─── SVG icons ─── */
function IconSpotify() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}

function IconLibrary() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  );
}

function IconClusters() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><circle cx="5" cy="19" r="2"/>
      <line x1="12" y1="9" x2="17.5" y2="6.5"/><line x1="12" y1="9" x2="6.5" y2="6.5"/><line x1="12" y1="15" x2="17.5" y2="17.5"/><line x1="12" y1="15" x2="6.5" y2="17.5"/>
    </svg>
  );
}

function IconAnalytics() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}

function IconGenerate() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function IconPlaylist() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  );
}

function IconHeart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}

const PROMPT_SUGGESTIONS = [
  "late-night motion with polish",
  "rainy walk but optimistic",
  "gym songs that still feel stylish",
  "soft focus coffee shop energy",
];

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
    if (!refreshToken) { handleLogout(); return null; }
    try {
      const response = await fetch(`${API_BASE}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) throw new Error("Failed to refresh token");
      const data = await response.json();
      setAccessToken(data.access_token);
      localStorage.setItem("spotify_access_token", data.access_token);
      return data.access_token;
    } catch {
      handleLogout();
      return null;
    }
  }, [handleLogout, refreshToken]);

  const spotifyFetch = useCallback(async (url, options = {}) => {
    let token = accessToken;
    let response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (response.status === 401) {
      token = await refreshAccessToken();
      if (!token) throw new Error("Unable to refresh token");
      response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...options.headers },
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
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      setListeningData(data);
    } catch (error) {
      console.error("Error fetching listening analytics:", error);
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
    const access_token = params.get("access_token") || localStorage.getItem("spotify_access_token");
    const refresh_token = params.get("refresh_token") || localStorage.getItem("spotify_refresh_token");
    if (!access_token || !refresh_token) return;

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
      .then((r) => r.json())
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
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        setPlaylists([{ id: LIKED_SONGS_ID, name: LIKED_SONGS_NAME }, ...(data.items || [])]);
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
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      setLikedSongs(data.items || []);
      setNextLikedSongsUrl(data.next || "");
      setNextPlaylistSongsUrl("");
    } catch (error) {
      console.error("Error fetching liked songs:", error);
    }
  }, [spotifyFetch]);

  const loadMoreLikedSongs = useCallback(async () => {
    if (!nextLikedSongsUrl) return;
    try {
      const response = await spotifyFetch(nextLikedSongsUrl);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      setLikedSongs((prev) => [...prev, ...(data.items || [])]);
      setNextLikedSongsUrl(data.next || "");
    } catch (error) {
      console.error("Error loading more liked songs:", error);
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
      const response = await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      setLikedSongs(data.items || []);
      setNextPlaylistSongsUrl(data.next || "");
      setNextLikedSongsUrl("");
    } catch (error) {
      console.error("Error fetching playlist songs:", error);
    }
  }, [spotifyFetch]);

  const loadMorePlaylistSongs = useCallback(async () => {
    if (!nextPlaylistSongsUrl) return;
    try {
      const response = await spotifyFetch(nextPlaylistSongsUrl);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      setLikedSongs((prev) => [...prev, ...(data.items || [])]);
      setNextPlaylistSongsUrl(data.next || "");
    } catch (error) {
      console.error("Error loading more playlist songs:", error);
    }
  }, [nextPlaylistSongsUrl, spotifyFetch]);

  const handlePlaylistClick = useCallback((playlist) => {
    if (playlist.id === LIKED_SONGS_ID) { fetchLikedSongs(); return; }
    fetchPlaylistSongs(playlist);
  }, [fetchLikedSongs, fetchPlaylistSongs]);

  const handleScroll = useCallback((event) => {
    const { scrollTop, scrollHeight, clientHeight } = event.target;
    if (scrollTop + clientHeight < scrollHeight - 12) return;
    if (selectedPlaylistName === LIKED_SONGS_NAME) loadMoreLikedSongs();
    else loadMorePlaylistSongs();
  }, [loadMoreLikedSongs, loadMorePlaylistSongs, selectedPlaylistName]);

  const trackCount = listeningData?.data?.length || 0;
  const skippedTracks = listeningData?.summary?.skippedTracks || 0;
  const spamTracks = listeningData?.summary?.spamTracks || 0;
  const stats = [
    { label: "Playlists",     value: playlists.length ? playlists.length - 1 : 0, sub: "sources" },
    { label: "Clusters",      value: clusters.length,                               sub: "mood maps" },
    { label: "Recent Tracks", value: trackCount,                                    sub: "inspected" },
    { label: "Filtered",      value: skippedTracks + spamTracks,                    sub: "removed" },
  ];

  const clusterSpotlight = clusters.slice(0, 3);
  const anyPanelOpen = showSidebar || showAnalytics || showClusters;

  return (
    <div className="dashboard-shell">
      <div className="dash-orb dash-orb-a" aria-hidden="true" />
      <div className="dash-orb dash-orb-b" aria-hidden="true" />

      {/* ── Sidebar ── */}
      <nav className="dash-sidebar" aria-label="Main navigation">
        <div className="dash-sidebar-brand" aria-label="Flowstate">
          <IconSpotify />
        </div>

        <button
          type="button"
          className={`dash-nav-btn${showSidebar ? " is-active" : ""}`}
          onClick={() => { setShowSidebar(true); setShowAnalytics(false); setShowClusters(false); }}
          aria-label="Library"
          title="Library"
        >
          <IconLibrary />
        </button>

        <button
          type="button"
          className={`dash-nav-btn${showClusters ? " is-active" : ""}`}
          onClick={() => { setShowClusters(true); setShowSidebar(false); setShowAnalytics(false); }}
          aria-label="Clusters"
          title="Clusters"
        >
          <IconClusters />
        </button>

        <button
          type="button"
          className={`dash-nav-btn${showAnalytics ? " is-active" : ""}`}
          onClick={fetchListeningAnalytics}
          aria-label="Analytics"
          title="Analytics"
        >
          <IconAnalytics />
        </button>

        <button
          type="button"
          className="dash-nav-btn"
          onClick={() => { setGeneratePrefill(""); setShowGenerateModal(true); }}
          aria-label="Generate playlist"
          title="Generate playlist"
        >
          <IconGenerate />
        </button>

        <div className="dash-nav-spacer" />

        <button
          type="button"
          className="dash-logout-btn"
          onClick={handleLogout}
          aria-label="Log out"
          title="Log out"
        >
          <IconLogout />
        </button>
      </nav>

      {/* ── Main ── */}
      <main className="dashboard-main">
        <div className="dash-topbar">
          <span className="dash-topbar-title">Flowstate</span>
          <span className="dash-topbar-meta">Listening Intelligence</span>
          <div className="dash-topbar-end">
            <SyncStatus
              userId={userId}
              accessToken={accessToken}
              refreshToken={refreshToken}
              status={syncStatus}
              onStatusChange={setSyncStatus}
              onSynced={() => { if (userId) loadClusterData(userId); }}
            />
          </div>
        </div>

        <div className="dash-content">

          {/* ── Generate bar ── */}
          <div>
            <button
              type="button"
              className="dash-generate-bar"
              onClick={() => { setGeneratePrefill(""); setShowGenerateModal(true); }}
            >
              <div className="dash-generate-icon">
                <IconGenerate />
              </div>
              <div className="dash-generate-text">
                <div className="dash-generate-label">Generate playlist</div>
                <div className="dash-generate-placeholder">Describe a mood, moment, or vibe…</div>
              </div>
              <div className="dash-generate-arrow">
                <IconArrow />
              </div>
            </button>

            <div className="dash-prompt-pills">
              {PROMPT_SUGGESTIONS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="dash-prompt-pill"
                  onClick={() => { setGeneratePrefill(prompt); setShowGenerateModal(true); }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* ── Stats ── */}
          <div className="dash-stats">
            {stats.map((stat) => (
              <div key={stat.label} className="dash-stat">
                <div className="dash-stat-label">{stat.label}</div>
                <div className="dash-stat-value">{stat.value}</div>
                <div className="dash-stat-sub">{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Pipeline + Cluster snapshot ── */}
          <div className="dash-grid-2">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-tag">Pipeline</div>
                  <h2 className="dash-panel-title">
                    {syncStatus?.isProcessing ? "Sync running" : syncStatus?.lastSyncAt ? "Data ready" : "Ready to sync"}
                  </h2>
                </div>
              </div>
              <p className="dash-panel-copy">
                Tracks under 25% completion and rapid replays are filtered so clusters
                reflect genuine listening sessions.
              </p>
              <div className="dash-pill-row">
                <span className="dash-pill">Skip threshold: 25%</span>
                <span className="dash-pill">Rapid replay guarded</span>
                <span className="dash-pill">Last sync: {syncStatus?.lastSyncAt ? "Recorded" : "Not yet"}</span>
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-tag">Mood Map</div>
                  <h2 className="dash-panel-title">Cluster spotlight</h2>
                </div>
              </div>

              {clusterSpotlight.length > 0 ? (
                <div className="dash-cluster-stack">
                  {clusterSpotlight.map((cluster) => (
                    <button
                      key={cluster.clusterId}
                      type="button"
                      className="dash-cluster-tease"
                      onClick={() => { setShowClusters(true); setShowSidebar(false); setShowAnalytics(false); }}
                    >
                      <div className="dash-cluster-tease-left">
                        <div className="dash-cluster-tease-name">{cluster.clusterLabel}</div>
                        <div className="dash-cluster-tease-desc">
                          {cluster.clusterDescription || `${cluster.trackCount || 0} songs`}
                        </div>
                      </div>
                      <span className="dash-cluster-tease-arrow">
                        <IconChevronRight />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="dash-cluster-empty">
                  Sync once and your mood clusters will appear here.
                </div>
              )}

              <div className="cluster-orbit-wrap" aria-hidden="true">
                <div className="cluster-orbit">
                  <div className="cluster-orbit-core">
                    <strong>{clusters.length}</strong>
                    <span>clusters</span>
                  </div>
                  <div className="cluster-orbit-dot cluster-orbit-dot-a" />
                  <div className="cluster-orbit-dot cluster-orbit-dot-b" />
                  <div className="cluster-orbit-dot cluster-orbit-dot-c" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Playlists ── */}
          <div className="dash-section">
            <div className="dash-section-head">
              <span className="dash-section-title">Your Library</span>
              <span className="dash-panel-meta">
                {playlists.length ? `${playlists.length} sources` : "Loading…"}
              </span>
            </div>
            <div className="dash-playlist-grid">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  className="dash-playlist-card"
                  onClick={() => handlePlaylistClick(playlist)}
                >
                  <span className="dash-playlist-icon">
                    {playlist.id === LIKED_SONGS_ID ? <IconHeart /> : <IconPlaylist />}
                  </span>
                  <span className="dash-playlist-name">{playlist.name}</span>
                  <span className="dash-playlist-action">View tracks</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </main>

      {/* ── Tracks panel ── */}
      <aside className={`side-panel${showSidebar ? " is-open" : ""}`} aria-label="Tracks">
        <div className="side-panel-head">
          <div>
            <div className="side-panel-tag">Tracks</div>
            <h2 className="side-panel-title">{selectedPlaylistName}</h2>
            <p className="side-panel-sub">{likedSongs.length} loaded</p>
          </div>
          <button type="button" className="side-close" onClick={() => setShowSidebar(false)} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="side-panel-body" onScroll={handleScroll}>
          {likedSongs.length > 0 ? (
            likedSongs.map((song, index) => (
              <article key={`${song.track.id}-${index}`} className="song-row">
                <span className="song-row-index">{index + 1}</span>
                <div className="song-row-copy">
                  <strong>{song.track.name}</strong>
                  <span>{song.track.artists.map((a) => a.name).join(", ")}</span>
                </div>
              </article>
            ))
          ) : (
            <div className="side-empty">No tracks loaded yet.</div>
          )}
        </div>
      </aside>

      {/* ── Analytics panel ── */}
      <aside className={`side-panel${showAnalytics ? " is-open" : ""}`} aria-label="Analytics">
        <div className="side-panel-head">
          <div>
            <div className="side-panel-tag">Analytics</div>
            <h2 className="side-panel-title">Recent listening</h2>
            <p className="side-panel-sub">
              {listeningData ? `${listeningData.data?.length || 0} tracks inspected` : "Loading…"}
            </p>
          </div>
          <button type="button" className="side-close" onClick={() => setShowAnalytics(false)} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="side-panel-body">
          {listeningData ? (
            <>
              <div className="analytics-summary-grid">
                <div className="analytics-summary-card">
                  <span>Tracked</span>
                  <strong>{listeningData.summary?.totalTracks || 0}</strong>
                </div>
                <div className="analytics-summary-card">
                  <span>Skipped</span>
                  <strong>{listeningData.summary?.skippedTracks || 0}</strong>
                </div>
                <div className="analytics-summary-card">
                  <span>Rapid replay</span>
                  <strong>{listeningData.summary?.spamTracks || 0}</strong>
                </div>
                <div className="analytics-summary-card">
                  <span>Artists</span>
                  <strong>{listeningData.summary?.uniqueArtists || 0}</strong>
                </div>
              </div>

              <p className="analytics-note">
                Skip filtering is estimated from time gaps between consecutive plays — a smart
                heuristic, not exact playback data.
              </p>

              <div className="analytics-track-list">
                {(listeningData.data || []).map((track, index) => {
                  const badge = getPlaybackBadge(track.playback);
                  return (
                    <article key={`${track.trackId}-${index}`} className="analytics-track-card">
                      <div className="analytics-track-top">
                        <div>
                          <strong>{track.trackName}</strong>
                          <span>{track.artist}</span>
                        </div>
                        <span className={`analytics-badge tone-${badge.tone}`}>{badge.label}</span>
                      </div>
                      <div className="analytics-track-meta">
                        <span>{track.timeOfDay}</span>
                        <span>{formatPercent(track.playback?.estimated_completion_ratio)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="side-empty">Loading your listening analytics…</div>
          )}
        </div>
      </aside>

      {/* ── Clusters panel ── */}
      <aside className={`side-panel${showClusters ? " is-open" : ""}`} aria-label="Clusters">
        <div className="side-panel-head">
          <div>
            <div className="side-panel-tag">Clusters</div>
            <h2 className="side-panel-title">Your music map</h2>
            <p className="side-panel-sub">{clusters.length} clusters</p>
          </div>
          <button type="button" className="side-close" onClick={() => setShowClusters(false)} aria-label="Close">
            <IconClose />
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

      {anyPanelOpen && (
        <button
          type="button"
          className="dashboard-overlay"
          onClick={closePanels}
          aria-label="Close panel"
        />
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

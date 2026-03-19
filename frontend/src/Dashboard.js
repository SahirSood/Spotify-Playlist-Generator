import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClusterView from "./ClusterView";
import SyncStatus from "./SyncStatus";
import {
  fetchClusters,
  fetchClusterStatus,
  generatePlaylist,
  refreshToken as requestFreshAccessToken,
  saveClusters,
} from "./api";
import "./Dashboard.css";

const VIBE_SUGGESTIONS = [
  "Late night drive",
  "Gym motivation",
  "Sad rainy evening",
  "Chill study session",
  "Beach day",
];

const SIDEBAR_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "clusters", label: "Clusters" },
  { id: "recent", label: "Recent songs" },
];

function IconSpark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </svg>
  );
}

function IconSpotify() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconWave() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-12 5-12 2.5 6 5 6" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function formatPlayedAt(value) {
  if (!value) return "Recently";

  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "Recently";
  }
}

function DetailRail({
  activePanel,
  profileName,
  clusters,
  syncStatus,
  recentSongs,
  recentSongsLoading,
  recentSongsError,
  onGenerateFromCluster,
}) {
  if (activePanel === "clusters") {
    return (
      <>
        <div className="dashboard-rail-header">
          <p className="dashboard-rail-kicker">Extra view</p>
          <h3>Clusters</h3>
          <p>Browse the moods we've learned from your listening and generate from one directly.</p>
        </div>
        <div className="dashboard-rail-scroll">
          <ClusterView clusters={clusters} onGenerateFromCluster={onGenerateFromCluster} />
        </div>
      </>
    );
  }

  if (activePanel === "recent") {
    return (
      <>
        <div className="dashboard-rail-header">
          <p className="dashboard-rail-kicker">Extra view</p>
          <h3>Recent songs</h3>
          <p>A quick look at what you've played lately on Spotify.</p>
        </div>
        <div className="dashboard-rail-scroll">
          {recentSongsLoading ? (
            <div className="dashboard-rail-empty">Loading your recent songs...</div>
          ) : recentSongsError ? (
            <div className="dashboard-rail-empty">{recentSongsError}</div>
          ) : recentSongs.length ? (
            <div className="dashboard-song-list">
              {recentSongs.map((item) => (
                <article key={`${item.played_at}-${item.track?.id || item.track?.name}`} className="dashboard-song-card">
                  <strong>{item.track?.name || "Unknown track"}</strong>
                  <span>{item.track?.artists?.map((artist) => artist.name).join(", ") || "Unknown artist"}</span>
                  <em>{formatPlayedAt(item.played_at)}</em>
                </article>
              ))}
            </div>
          ) : (
            <div className="dashboard-rail-empty">No recent songs found yet.</div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="dashboard-rail-header">
        <p className="dashboard-rail-kicker">Extra view</p>
        <h3>Overview</h3>
        <p>Hi {profileName || "there"}, here's a quick snapshot of your playlist setup.</p>
      </div>
      <div className="dashboard-rail-scroll">
        <div className="dashboard-overview-grid">
          <article className="dashboard-overview-card">
            <div className="dashboard-overview-icon">
              <IconLayers />
            </div>
            <span>Clusters</span>
            <strong>{syncStatus?.clusterCount || 0}</strong>
          </article>
          <article className="dashboard-overview-card">
            <div className="dashboard-overview-icon">
              <IconClock />
            </div>
            <span>Last sync</span>
            <strong>{syncStatus?.lastSyncAt ? formatPlayedAt(syncStatus.lastSyncAt) : "Not yet"}</strong>
          </article>
          <article className="dashboard-overview-card">
            <div className="dashboard-overview-icon">
              <IconWave />
            </div>
            <span>Recent songs loaded</span>
            <strong>{recentSongs.length}</strong>
          </article>
        </div>

        <div className="dashboard-rail-note">
          Use the sidebar to jump into clusters or recent songs without crowding the main playlist flow.
        </div>
      </div>
    </>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [userId, setUserId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [syncStatus, setSyncStatus] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [recentSongs, setRecentSongs] = useState([]);
  const [recentSongsLoading, setRecentSongsLoading] = useState(false);
  const [recentSongsError, setRecentSongsError] = useState("");
  const [activePanel, setActivePanel] = useState("overview");
  const [request, setRequest] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleLogout = useCallback(() => {
    setAccessToken("");
    setRefreshToken("");
    setUserId("");
    setProfileName("");
    setSyncStatus(null);
    setClusters([]);
    setRecentSongs([]);
    setRecentSongsError("");
    setRequest("");
    setResult(null);
    setError("");
    localStorage.removeItem("spotify_access_token");
    localStorage.removeItem("spotify_refresh_token");
    localStorage.removeItem("spotify_user_id");
    navigate("/");
  }, [navigate]);

  const refreshSpotifyAccessToken = useCallback(async () => {
    if (!refreshToken) {
      handleLogout();
      return null;
    }

    try {
      const tokenResponse = await requestFreshAccessToken(refreshToken);
      setAccessToken(tokenResponse.access_token);
      localStorage.setItem("spotify_access_token", tokenResponse.access_token);
      return tokenResponse.access_token;
    } catch (refreshError) {
      console.error("Failed to refresh access token:", refreshError);
      handleLogout();
      return null;
    }
  }, [handleLogout, refreshToken]);

  const spotifyFetch = useCallback(
    async (url) => {
      let token = accessToken;
      let response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        token = await refreshSpotifyAccessToken();
        if (!token) {
          throw new Error("Unable to refresh Spotify session.");
        }

        response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      if (!response.ok) {
        throw new Error(`Spotify request failed: ${response.status}`);
      }

      return response.json();
    },
    [accessToken, refreshSpotifyAccessToken]
  );

  const loadClusterStatus = useCallback(async (uid) => {
    try {
      const status = await fetchClusterStatus(uid);
      setSyncStatus(status);
      return status;
    } catch (loadError) {
      console.error("Failed to load cluster status:", loadError);
      return null;
    }
  }, []);

  const loadClusters = useCallback(async (uid) => {
    try {
      const clusterResponse = await fetchClusters(uid);
      setClusters(clusterResponse.clusters || []);
    } catch (loadError) {
      console.error("Failed to load clusters:", loadError);
    }
  }, []);

  const loadRecentSongs = useCallback(async () => {
    if (!accessToken) return;

    setRecentSongsLoading(true);
    setRecentSongsError("");

    try {
      const data = await spotifyFetch("https://api.spotify.com/v1/me/player/recently-played?limit=12");
      setRecentSongs(data.items || []);
    } catch (loadError) {
      console.error("Failed to load recent songs:", loadError);
      setRecentSongsError("We couldn't load your recent songs right now.");
    } finally {
      setRecentSongsLoading(false);
    }
  }, [accessToken, spotifyFetch]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextAccessToken =
      params.get("access_token") || localStorage.getItem("spotify_access_token");
    const nextRefreshToken =
      params.get("refresh_token") || localStorage.getItem("spotify_refresh_token");

    if (!nextAccessToken || !nextRefreshToken) {
      navigate("/");
      return;
    }

    setAccessToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
    localStorage.setItem("spotify_access_token", nextAccessToken);
    localStorage.setItem("spotify_refresh_token", nextRefreshToken);

    if (params.get("access_token")) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const storedUserId = localStorage.getItem("spotify_user_id");

    fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${nextAccessToken}` },
    })
      .then((response) => response.json())
      .then((profile) => {
        if (!profile?.id) {
          throw new Error("Missing Spotify profile");
        }

        const nextUserId = `spotify:user:${profile.id}`;
        setUserId(nextUserId);
        setProfileName(profile.display_name || profile.id || "there");
        localStorage.setItem("spotify_user_id", nextUserId);
        saveClusters(nextUserId, nextAccessToken, nextRefreshToken).catch(() => {});
        loadClusterStatus(nextUserId);
        loadClusters(nextUserId);
      })
      .catch(() => {
        if (storedUserId) {
          setUserId(storedUserId);
          loadClusterStatus(storedUserId);
          loadClusters(storedUserId);
        }
      });
  }, [loadClusterStatus, loadClusters, navigate]);

  useEffect(() => {
    if (activePanel === "recent" && !recentSongs.length && !recentSongsLoading) {
      loadRecentSongs();
    }
  }, [activePanel, loadRecentSongs, recentSongs.length, recentSongsLoading]);

  const hasTasteProfile = useMemo(() => {
    if (!syncStatus) return false;
    return Boolean(syncStatus.lastSyncAt) || Number(syncStatus.clusterCount || 0) > 0;
  }, [syncStatus]);

  const isSyncing = Boolean(syncStatus?.isProcessing);
  const canGenerate = Boolean(
    userId && accessToken && request.trim() && hasTasteProfile && !isGenerating && !isSyncing
  );

  const statusCopy = useMemo(() => {
    if (isSyncing) {
      return {
        badge: "Preparing your taste",
        title: "We're getting your listening profile ready.",
        body: "Once syncing finishes, you can generate playlists from any vibe you describe.",
      };
    }

    if (hasTasteProfile) {
      return {
        badge: "Ready",
        title: "Your playlist generator is ready.",
        body: "Describe a mood, moment, or scene and we'll turn it into a playlist that feels like you.",
      };
    }

    return {
      badge: "One quick step",
      title: "Sync your Spotify listening once to personalize your playlists.",
      body: "After that, you can come back anytime and generate from a simple vibe.",
    };
  }, [hasTasteProfile, isSyncing]);

  const handleGenerate = useCallback(async () => {
    if (!request.trim() || !userId || !accessToken) {
      return;
    }

    if (!hasTasteProfile) {
      setError("Sync your Spotify listening first so we can personalize your playlist.");
      return;
    }

    setIsGenerating(true);
    setError("");

    try {
      const nextResult = await generatePlaylist(userId, accessToken, request.trim());
      setResult(nextResult);
    } catch (generationError) {
      setError(generationError.message || "Something went wrong while generating your playlist.");
    } finally {
      setIsGenerating(false);
    }
  }, [accessToken, hasTasteProfile, request, userId]);

  const handleRefine = useCallback((nextPrompt = "") => {
    setRequest(nextPrompt);
    inputRef.current?.focus();
  }, []);

  const greetingName = profileName || "there";

  return (
    <div className="dashboard-page">
      <div className="dashboard-glow dashboard-glow-left" aria-hidden="true" />
      <div className="dashboard-glow dashboard-glow-right" aria-hidden="true" />

      <header className="dashboard-topbar">
        <div className="dashboard-brand-wrap">
          <div className="dashboard-brand-mark" aria-hidden="true">
            <IconSpotify />
          </div>
          <div>
            <div className="dashboard-brand">Flowstate</div>
            <div className="dashboard-brand-sub">Playlists from your vibe</div>
          </div>
        </div>

        <div className="dashboard-topbar-actions">
          <SyncStatus
            userId={userId}
            accessToken={accessToken}
            refreshToken={refreshToken}
            status={syncStatus}
            onStatusChange={setSyncStatus}
            onSynced={() => {
              if (userId) {
                loadClusterStatus(userId);
                loadClusters(userId);
              }
            }}
          />
          <button type="button" className="dashboard-quiet-button" onClick={handleLogout}>
            <IconLogout />
            Log out
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-layout">
          <aside className="dashboard-sidebar">
            <div className="dashboard-sidebar-card">
              <p className="dashboard-sidebar-kicker">Explore</p>
              <div className="dashboard-sidebar-nav">
                {SIDEBAR_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`dashboard-sidebar-link${activePanel === item.id ? " is-active" : ""}`}
                    onClick={() => setActivePanel(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="dashboard-content">
            <section className="dashboard-hero">
              <p className="dashboard-eyebrow">Made for your listening taste</p>
              <h1 className="dashboard-title">What vibe do you want today?</h1>
              <p className="dashboard-subtitle">
                Type a mood, moment, or energy and we'll build a Spotify playlist around it.
              </p>
            </section>

            <section className="dashboard-vibe-card">
              <div className="dashboard-vibe-card-head">
                <div>
                  <p className="dashboard-card-kicker">{statusCopy.badge}</p>
                  <h2>{statusCopy.title}</h2>
                </div>
                <div className={`dashboard-status-pill${hasTasteProfile ? " is-ready" : ""}${isSyncing ? " is-syncing" : ""}`}>
                  {isSyncing ? "Syncing" : hasTasteProfile ? "Ready to generate" : "Needs sync"}
                </div>
              </div>

              <p className="dashboard-card-copy">{statusCopy.body}</p>

              <label className="dashboard-input-label" htmlFor="vibe-input">
                Tell us the vibe for your playlist
              </label>
              <div className="dashboard-input-wrap">
                <textarea
                  id="vibe-input"
                  ref={inputRef}
                  className="dashboard-input"
                  rows="3"
                  placeholder="Late night drive, beach day, heartbreak, deep focus..."
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  disabled={isGenerating}
                />
              </div>

              <div className="dashboard-chip-row" aria-label="Suggested vibes">
                {VIBE_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="dashboard-chip"
                    onClick={() => handleRefine(suggestion)}
                    disabled={isGenerating}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              {error ? <p className="dashboard-error">{error}</p> : null}

              <div className="dashboard-actions">
                <button
                  type="button"
                  className="dashboard-primary-button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                >
                  {isGenerating ? (
                    <>
                      <span className="dashboard-spinner" aria-hidden="true" />
                      Generating playlist
                    </>
                  ) : (
                    <>
                      <IconSpark />
                      Generate Playlist
                    </>
                  )}
                </button>

                {!hasTasteProfile ? (
                  <div className="dashboard-support-action">
                    <span>First time here?</span>
                    <SyncStatus
                      compact
                      userId={userId}
                      accessToken={accessToken}
                      refreshToken={refreshToken}
                      status={syncStatus}
                      onStatusChange={setSyncStatus}
                      onSynced={() => {
                        if (userId) {
                          loadClusterStatus(userId);
                          loadClusters(userId);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="dashboard-secondary-button"
                    onClick={() => handleRefine(request)}
                    disabled={isGenerating}
                  >
                    Edit vibe
                  </button>
                )}
              </div>
            </section>

            <section className="dashboard-results">
              {result ? (
                <article className="dashboard-result-card">
                  <div className="dashboard-result-copy">
                    <p className="dashboard-result-kicker">Playlist ready for {greetingName}</p>
                    <h2>{result.playlistName}</h2>
                    <p className="dashboard-result-description">{result.rationale}</p>
                  </div>

                  <div className="dashboard-result-meta">
                    <div className="dashboard-result-stat">
                      <span>Tracks</span>
                      <strong>{result.trackCount || "?"}</strong>
                    </div>
                    <div className="dashboard-result-stat">
                      <span>Based on</span>
                      <strong>{request.trim()}</strong>
                    </div>
                  </div>

                  <div className="dashboard-result-actions">
                    <a
                      href={result.playlistUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="dashboard-primary-button is-link"
                    >
                      <IconSpotify />
                      Open in Spotify
                    </a>
                    <button
                      type="button"
                      className="dashboard-secondary-button"
                      onClick={() => {
                        setResult(null);
                        handleRefine("");
                      }}
                    >
                      Try another vibe
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button"
                      onClick={() => {
                        setResult(null);
                        handleRefine(request);
                      }}
                    >
                      Refine vibe
                    </button>
                  </div>
                </article>
              ) : (
                <article className="dashboard-empty-state">
                  <div className="dashboard-empty-icon" aria-hidden="true">
                    <IconRefresh />
                  </div>
                  <h2>Your playlist will show up here.</h2>
                  <p>
                    Keep it simple: describe a mood like "sunny morning" or
                    "late night drive" and generate when you're ready.
                  </p>
                </article>
              )}
            </section>
          </section>

          <aside className="dashboard-detail-rail">
            <DetailRail
              activePanel={activePanel}
              profileName={profileName}
              clusters={clusters}
              syncStatus={syncStatus}
              recentSongs={recentSongs}
              recentSongsLoading={recentSongsLoading}
              recentSongsError={recentSongsError}
              onGenerateFromCluster={(label) => {
                setActivePanel("clusters");
                setResult(null);
                handleRefine(label);
              }}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;

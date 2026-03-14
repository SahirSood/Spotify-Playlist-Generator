import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import GeneratePlaylist from "./GeneratePlaylist";
import ClusterView from "./ClusterView";
import SyncStatus from "./SyncStatus";
import { fetchClusters, fetchClusterStatus, saveClusters } from "./api";

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function Dashboard() {
    const navigate = useNavigate();
    const [accessToken, setAccessToken] = useState('');
    const [refreshToken, setRefreshToken] = useState('');
    const [playlists, setPlaylists] = useState([]);
    const [likedSongs, setLikedSongs] = useState([]);
    const [showSidebar, setShowSidebar] = useState(false);
    const [selectedPlaylistName, setSelectedPlaylistName] = useState('');
    const [nextLikedSongsUrl, setNextLikedSongsUrl] = useState('');
    const [nextPlaylistSongsUrl, setNextPlaylistSongsUrl] = useState('');
    // NEW: Add listening analytics state
    const [listeningData, setListeningData] = useState(null);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [userId, setUserId] = useState('');
    const [clusters, setClusters] = useState([]);
    const [syncStatus, setSyncStatus] = useState(null);
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [showClusters, setShowClusters] = useState(false);
    const [generatePrefill, setGeneratePrefill] = useState('');

    // Function to refresh access token
    const refreshAccessToken = async () => {
        if (!refreshToken) {
            console.error('No refresh token available');
            handleLogout();
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refresh_token: refreshToken })
            });

            if (!response.ok) {
                throw new Error('Failed to refresh token');
            }

            const data = await response.json();
            const newAccessToken = data.access_token;

            // Update tokens
            setAccessToken(newAccessToken);
            localStorage.setItem('spotify_access_token', newAccessToken);

            console.log('✅ Token refreshed successfully');
            return newAccessToken;

        } catch (error) {
            console.error('❌ Error refreshing token:', error);
            handleLogout(); // Force re-login if refresh fails
            return null;
        }
    };

    // Enhanced fetch function with automatic token refresh
    const spotifyFetch = async (url, options = {}) => {
        let token = accessToken;

        // First attempt with current token
        let response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                ...options.headers
            }
        });

        // If token expired, refresh and retry
        if (response.status === 401) {
            console.log('🔄 Token expired, refreshing...');
            token = await refreshAccessToken();
            
            if (!token) {
                throw new Error('Unable to refresh token');
            }

            // Retry with new token
            response = await fetch(url, {
                ...options,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...options.headers
                }
            });
        }

        return response;
    };

    // NEW: Function to fetch and analyze listening data
    const fetchListeningAnalytics = async () => {
        try {
            setShowAnalytics(true);
            console.log('📊 Fetching listening analytics...');
            
            const response = await fetch(`${API_BASE}/log-listening?access_token=${accessToken}&userId=dashboard_user`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            setListeningData(data);
            console.log('✅ Listening analytics loaded!', data);
            
        } catch (error) {
            console.error('❌ Error fetching listening analytics:', error);
            alert('Failed to load listening analytics. Please try again.');
        }
    };

    // Load clusters/status when userId is available
    const loadClusterData = useCallback(async (uid) => {
        try {
            const [clusterRes, statusRes] = await Promise.all([
                fetchClusters(uid),
                fetchClusterStatus(uid),
            ]);
            setClusters(clusterRes.clusters || []);
            setSyncStatus(statusRes);
        } catch (err) {
            console.error('Failed to load cluster data:', err);
        }
    }, []);

    // Extract tokens from URL or LocalStorage
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const access_token = params.get('access_token') || localStorage.getItem('spotify_access_token');
        const refresh_token = params.get('refresh_token') || localStorage.getItem('spotify_refresh_token');

        if (access_token && refresh_token) {
            setAccessToken(access_token);
            setRefreshToken(refresh_token);

            localStorage.setItem('spotify_access_token', access_token);
            localStorage.setItem('spotify_refresh_token', refresh_token);

            if (params.get('access_token')) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            // Fetch Spotify user profile to get userId, then load clusters
            fetch('https://api.spotify.com/v1/me', {
                headers: { Authorization: `Bearer ${access_token}` },
            })
                .then((r) => r.json())
                .then((profile) => {
                    const uid = `spotify:user:${profile.id}`;
                    setUserId(uid);
                    localStorage.setItem('spotify_user_id', uid);
                    // Persist tokens to backend for background sync
                    saveClusters(uid, access_token, refresh_token).catch(() => {});
                    loadClusterData(uid);
                })
                .catch(() => {});
        }
    }, [loadClusterData]);

    // Fetch playlists with token refresh
    useEffect(() => {
        if (!accessToken || !refreshToken) return;

        const fetchPlaylists = async () => {
            try {
                const response = await spotifyFetch('https://api.spotify.com/v1/me/playlists');
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();

                // Add "Liked Songs" as the first fake playlist
                const likedSongsPlaceholder = { id: 'liked-songs', name: '❤️ Liked Songs' };
                const allPlaylists = [likedSongsPlaceholder, ...(data.items || [])];

                setPlaylists(allPlaylists);
            } catch (error) {
                console.error('Error fetching playlists:', error);
            }
        };

        fetchPlaylists();
    }, [accessToken, refreshToken]);

    // Fetch all liked songs (with pagination) - Updated with token refresh
    const fetchLikedSongs = async () => {
        setSelectedPlaylistName('❤️ Liked Songs');
        setShowSidebar(true);
        setLikedSongs([]);   // Clear any old songs
    
        try {
            const response = await spotifyFetch('https://api.spotify.com/v1/me/tracks');
    
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            const data = await response.json();
    
            setLikedSongs(data.items);  // Show the first 50 songs
            setNextLikedSongsUrl(data.next);  // Save the next page URL for later
        } catch (error) {
            console.error('Error fetching liked songs:', error);
            alert('Failed to fetch liked songs. Please try again.');
        }
    };

    const loadMoreLikedSongs = async () => {
        if (!nextLikedSongsUrl) return;  // No more pages
    
        try {
            const response = await spotifyFetch(nextLikedSongsUrl);
    
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            const data = await response.json();
    
            setLikedSongs((prevSongs) => [...prevSongs, ...data.items]);  // Add new songs to list
            setNextLikedSongsUrl(data.next);  // Update next page URL (or null if no more)
        } catch (error) {
            console.error('Error fetching more liked songs:', error);
            alert('Failed to load more liked songs. Please try again.');
        }
    };

    const fetchPlaylistSongs = async(playlist) => {
        setSelectedPlaylistName(playlist.name); // Playlist has an id and a name
        setShowSidebar(true); // this is what we use to show the sidebar, can change to a generic name that works for both palylists and likedsongs
        setLikedSongs([]);  // Same as above, list of songs that will be showing, we are clearing it
        setNextPlaylistSongsUrl('');  // Clear any old next URL
        
        try {
            const firstPageUrl = `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`;

            const response = await spotifyFetch(firstPageUrl);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setLikedSongs(data.items);
            setNextPlaylistSongsUrl(data.next);
        } catch (error) {
            console.error('Error fetching playlist songs:', error);
            alert('Failed to fetch playlist songs. Please try again.');
        }
    }

    const loadMorePlaylistSongs = async () => {
        if (!nextPlaylistSongsUrl) return;
    
        try {
            const response = await spotifyFetch(nextPlaylistSongsUrl);
    
            const data = await response.json();
    
            setLikedSongs((prevSongs) => [...prevSongs, ...data.items]); // Append new songs
            setNextPlaylistSongsUrl(data.next); // Update next page URL
        } catch (error) {
            console.error('Error fetching more songs for playlist:', error);
        }
    };

    const handlePlaylistClick = (playlist) => {
        if (playlist.id === 'liked-songs') {
            fetchLikedSongs();
        } else {
            fetchPlaylistSongs(playlist);
        }
    };

    const handleScroll = (event) => {
        const { scrollTop, scrollHeight, clientHeight } = event.target;
    
        if (scrollTop + clientHeight >= scrollHeight - 5) {
            // If viewing Liked Songs, load more liked songs
            if (selectedPlaylistName === '❤️ Liked Songs') {
                loadMoreLikedSongs();
            } else {
                loadMorePlaylistSongs();
            }
        }
    };

    // Add logout function
    const handleLogout = () => {
        // Clear tokens from state
        setAccessToken('');
        setRefreshToken('');
        
        // Clear tokens from localStorage
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        
        // Clear other state
        setPlaylists([]);
        setLikedSongs([]);
        setShowSidebar(false);
        setSelectedPlaylistName('');
        setNextLikedSongsUrl('');
        setNextPlaylistSongsUrl('');
        setListeningData(null);
        setShowAnalytics(false);
        setClusters([]);
        setSyncStatus(null);
        setShowClusters(false);
        setShowGenerateModal(false);

        // Redirect to home page
        navigate('/');
    };

    return (
        <div style={{ 
            height: '100vh', 
            width: '100vw',
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #1db954 0%, #191414 100%)',
            fontFamily: '"Circular", "Helvetica Neue", Arial, sans-serif'
        }}>
            {/* Main Dashboard */}
            <div style={{
                height: '100%',
                padding: '30px',
                transition: 'transform 0.3s ease-in-out',
                transform: showSidebar || showAnalytics ? 'translateX(-350px)' : 'translateX(0)',
                overflowY: 'auto'
            }}>
                {/* Header with Logout Button */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '40px'
                }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <h1 style={{
                            color: 'white',
                            fontSize: '3rem',
                            fontWeight: 'bold',
                            margin: '0 0 10px 0',
                            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                        }}>
                            🎵 Spotify Dashboard
                        </h1>
                        <p style={{
                            color: 'rgba(255,255,255,0.8)',
                            fontSize: '1.1rem',
                            margin: '0'
                        }}>
                            Discover and explore your music collection
                        </p>
                    </div>
                    
                    {accessToken && (
                        <div style={{ display: 'flex', gap: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
                            {/* Generate Playlist Button */}
                            <button
                                onClick={() => { setGeneratePrefill(''); setShowGenerateModal(true); }}
                                style={{
                                    background: 'rgba(29, 185, 84, 0.2)',
                                    border: '2px solid #1db954',
                                    borderRadius: '12px',
                                    color: '#1db954',
                                    padding: '12px 20px',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.3s ease',
                                }}
                            >
                                ✨ Generate Playlist
                            </button>

                            {/* My Music Clusters Button */}
                            <button
                                onClick={() => setShowClusters(true)}
                                style={{
                                    background: 'rgba(52, 152, 219, 0.2)',
                                    border: '2px solid #3498db',
                                    borderRadius: '12px',
                                    color: '#3498db',
                                    padding: '12px 20px',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.3s ease',
                                }}
                            >
                                🧠 My Music Clusters
                            </button>

                            {/* Analytics Button */}
                            <button
                                onClick={fetchListeningAnalytics}
                                style={{
                                    background: 'rgba(156, 39, 176, 0.2)',
                                    border: '2px solid #9c27b0',
                                    borderRadius: '12px',
                                    color: '#9c27b0',
                                    padding: '12px 20px',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.3s ease',
                                    backdropFilter: 'blur(10px)'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.background = '#9c27b0';
                                    e.target.style.color = 'white';
                                    e.target.style.transform = 'translateY(-2px)';
                                    e.target.style.boxShadow = '0 5px 15px rgba(156, 39, 176, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.background = 'rgba(156, 39, 176, 0.2)';
                                    e.target.style.color = '#9c27b0';
                                    e.target.style.transform = 'translateY(0)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            >
                                📊 Analytics
                            </button>
                            
                            <button
                                onClick={handleLogout}
                                style={{
                                    background: 'rgba(231, 76, 60, 0.2)',
                                    border: '2px solid #e74c3c',
                                    borderRadius: '12px',
                                    color: '#e74c3c',
                                    padding: '12px 20px',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.3s ease',
                                    backdropFilter: 'blur(10px)'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.background = '#e74c3c';
                                    e.target.style.color = 'white';
                                    e.target.style.transform = 'translateY(-2px)';
                                    e.target.style.boxShadow = '0 5px 15px rgba(231, 76, 60, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.background = 'rgba(231, 76, 60, 0.2)';
                                    e.target.style.color = '#e74c3c';
                                    e.target.style.transform = 'translateY(0)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            >
                                🚪 Logout
                            </button>
                        </div>
                    )}
                </div>

                {/* Connection Status */}
                {accessToken ? (
                    <div style={{
                        background: 'rgba(29, 185, 84, 0.2)',
                        border: '2px solid #1db954',
                        borderRadius: '12px',
                        padding: '15px',
                        marginBottom: '30px',
                        textAlign: 'center'
                    }}>
                        <span style={{
                            color: '#1db954',
                            fontSize: '1.1rem',
                            fontWeight: 'bold'
                        }}>
                            ✅ Connected to Spotify
                        </span>
                    </div>
                ) : (
                    <div style={{
                        background: 'rgba(231, 76, 60, 0.2)',
                        border: '2px solid #e74c3c',
                        borderRadius: '12px',
                        padding: '15px',
                        marginBottom: '30px',
                        textAlign: 'center'
                    }}>
                        <span style={{
                            color: '#e74c3c',
                            fontSize: '1.1rem',
                            fontWeight: 'bold'
                        }}>
                            ❌ Not Connected to Spotify
                        </span>
                        <div style={{ marginTop: '10px' }}>
                            <button
                                onClick={() => navigate('/')}
                                style={{
                                    background: 'rgba(29, 185, 84, 0.2)',
                                    border: '2px solid #1db954',
                                    borderRadius: '8px',
                                    color: '#1db954',
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.background = '#1db954';
                                    e.target.style.color = 'white';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.background = 'rgba(29, 185, 84, 0.2)';
                                    e.target.style.color = '#1db954';
                                }}
                            >
                                Go to Login
                            </button>
                        </div>
                    </div>
                )}

                {/* Sync Status Bar */}
                {accessToken && userId && (
                    <SyncStatus
                        userId={userId}
                        accessToken={accessToken}
                        refreshToken={refreshToken}
                        status={syncStatus}
                        onStatusChange={(s) => {
                            setSyncStatus(s);
                            if (!s.isProcessing) loadClusterData(userId);
                        }}
                    />
                )}

                {/* Playlists Grid */}
                <div style={{
                    marginBottom: '20px'
                }}>
                    <h2 style={{
                        color: 'white',
                        fontSize: '2rem',
                        marginBottom: '25px',
                        textAlign: 'center'
                    }}>
                        Your Playlists
                    </h2>
                    
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '20px',
                        maxWidth: '1200px',
                        margin: '0 auto'
                    }}>
                        {playlists.map((playlist) => (
                            <div
                                key={playlist.id}
                                onClick={() => handlePlaylistClick(playlist)}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    backdropFilter: 'blur(10px)',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '16px',
                                    padding: '20px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    textAlign: 'center',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.transform = 'translateY(-5px)';
                                    e.target.style.boxShadow = '0 10px 25px rgba(0,0,0,0.3)';
                                    e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.transform = 'translateY(0)';
                                    e.target.style.boxShadow = 'none';
                                    e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                                }}
                            >
                                <div style={{
                                    fontSize: '2.5rem',
                                    marginBottom: '10px'
                                }}>
                                    {playlist.id === 'liked-songs' ? '❤️' : '🎵'}
                                </div>
                                <h3 style={{
                                    color: 'white',
                                    fontSize: '1.2rem',
                                    fontWeight: 'bold',
                                    margin: '0 0 5px 0',
                                    wordBreak: 'break-word'
                                }}>
                                    {playlist.name}
                                </h3>
                                <p style={{
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    fontSize: '0.9rem',
                                    margin: '0'
                                }}>
                                    Click to view tracks
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Playlist Sidebar (existing) */}
            <div style={{
                position: 'fixed',
                top: '0',
                right: showSidebar && !showAnalytics ? '0' : '-400px',
                width: '400px',
                height: '100vh',
                background: 'rgba(25, 20, 20, 0.95)',
                backdropFilter: 'blur(15px)',
                borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'right 0.3s ease-in-out',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    background: 'rgba(29, 185, 84, 0.1)'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '10px'
                    }}>
                        <h2 style={{
                            color: 'white',
                            fontSize: '1.5rem',
                            margin: '0',
                            wordBreak: 'break-word'
                        }}>
                            {selectedPlaylistName}
                        </h2>
                        <button
                            onClick={() => setShowSidebar(false)}
                            style={{
                                background: 'rgba(231, 76, 60, 0.2)',
                                border: '1px solid #e74c3c',
                                borderRadius: '8px',
                                color: '#e74c3c',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: 'bold',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.background = '#e74c3c';
                                e.target.style.color = 'white';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.background = 'rgba(231, 76, 60, 0.2)';
                                e.target.style.color = '#e74c3c';
                            }}
                        >
                            ✕ Close
                        </button>
                    </div>
                    <p style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.9rem',
                        margin: '0'
                    }}>
                        {likedSongs.length} tracks loaded
                    </p>
                </div>

                <div
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '0'
                    }}
                    onScroll={handleScroll}
                >
                    {likedSongs.length > 0 ? (
                        <div>
                            {likedSongs.map((song, index) => (
                                <div
                                    key={song.track.id}
                                    style={{
                                        padding: '15px 20px',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                        transition: 'background 0.2s ease',
                                        cursor: 'pointer'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.background = 'transparent';
                                    }}
                                >
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '15px'
                                    }}>
                                        <div style={{
                                            minWidth: '30px',
                                            color: 'rgba(255, 255, 255, 0.5)',
                                            fontSize: '0.9rem',
                                            textAlign: 'center'
                                        }}>
                                            {index + 1}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{
                                                color: 'white',
                                                fontSize: '1rem',
                                                fontWeight: '500',
                                                marginBottom: '4px',
                                                wordBreak: 'break-word'
                                            }}>
                                                {song.track.name}
                                            </div>
                                            <div style={{
                                                color: 'rgba(255, 255, 255, 0.7)',
                                                fontSize: '0.85rem',
                                                wordBreak: 'break-word'
                                            }}>
                                                {song.track.artists.map(a => a.name).join(', ')}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{
                            padding: '40px 20px',
                            textAlign: 'center',
                            color: 'rgba(255, 255, 255, 0.5)'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🎵</div>
                            <p>No tracks found</p>
                        </div>
                    )}
                </div>
            </div>

            {/* NEW: Analytics Sidebar */}
            <div style={{
                position: 'fixed',
                top: '0',
                right: showAnalytics ? '0' : '-400px',
                width: '400px',
                height: '100vh',
                background: 'rgba(25, 20, 20, 0.95)',
                backdropFilter: 'blur(15px)',
                borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'right 0.3s ease-in-out',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    background: 'rgba(156, 39, 176, 0.1)'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '10px'
                    }}>
                        <h2 style={{
                            color: 'white',
                            fontSize: '1.5rem',
                            margin: '0'
                        }}>
                            📊 Listening Analytics
                        </h2>
                        <button
                            onClick={() => setShowAnalytics(false)}
                            style={{
                                background: 'rgba(231, 76, 60, 0.2)',
                                border: '1px solid #e74c3c',
                                borderRadius: '8px',
                                color: '#e74c3c',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: 'bold',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.background = '#e74c3c';
                                e.target.style.color = 'white';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.background = 'rgba(231, 76, 60, 0.2)';
                                e.target.style.color = '#e74c3c';
                            }}
                        >
                            ✕ Close
                        </button>
                    </div>
                    <p style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.9rem',
                        margin: '0'
                    }}>
                        {listeningData ? `${listeningData.data?.length || 0} recent tracks analyzed` : 'Loading...'}
                    </p>
                </div>

                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px'
                }}>
                    {listeningData ? (
                        <div>
                            {/* Summary Stats */}
                            <div style={{
                                background: 'rgba(156, 39, 176, 0.1)',
                                borderRadius: '12px',
                                padding: '15px',
                                marginBottom: '20px'
                            }}>
                                <h3 style={{ color: 'white', margin: '0 0 10px 0' }}>Summary</h3>
                                <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem' }}>
                                    <p>📈 Total Tracks: {listeningData.data?.length || 0}</p>
                                    <p>🎤 Unique Artists: {listeningData.summary?.uniqueArtists || 'N/A'}</p>
                                    <p>⏰ Time Range: {listeningData.summary?.timeRange ? 'Recent activity' : 'Loading...'}</p>
                                </div>
                            </div>

                            {/* Recent Tracks */}
                            <h3 style={{ color: 'white', marginBottom: '15px' }}>Recent Tracks</h3>
                            {listeningData.data?.map((track, index) => (
                                <div
                                    key={track.trackId || index}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        marginBottom: '10px',
                                        border: '1px solid rgba(255, 255, 255, 0.1)'
                                    }}
                                >
                                    <div style={{
                                        color: 'white',
                                        fontSize: '0.95rem',
                                        fontWeight: '500',
                                        marginBottom: '4px'
                                    }}>
                                        {track.trackName}
                                    </div>
                                    <div style={{
                                        color: 'rgba(255, 255, 255, 0.7)',
                                        fontSize: '0.8rem',
                                        marginBottom: '6px'
                                    }}>
                                        {track.artist}
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: '0.75rem',
                                        color: 'rgba(255, 255, 255, 0.5)'
                                    }}>
                                        <span>🕐 {track.timeOfDay}</span>
                                        <span>⭐ {track.popularity || 'N/A'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{
                            textAlign: 'center',
                            color: 'rgba(255, 255, 255, 0.5)',
                            padding: '40px 20px'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>📊</div>
                            <p>Loading your listening analytics...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Clusters Sidebar */}
            <div style={{
                position: 'fixed',
                top: '0',
                right: showClusters ? '0' : '-500px',
                width: '480px',
                height: '100vh',
                background: 'rgba(15, 15, 25, 0.97)',
                backdropFilter: 'blur(15px)',
                borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'right 0.3s ease-in-out',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                padding: '20px',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ color: '#fff', margin: 0, fontSize: '1.4rem' }}>🧠 My Music Clusters</h2>
                    <button
                        onClick={() => setShowClusters(false)}
                        style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '1.4rem', cursor: 'pointer' }}
                    >✕</button>
                </div>
                <ClusterView
                    clusters={clusters}
                    onGenerateFromCluster={(label) => {
                        setShowClusters(false);
                        setGeneratePrefill(label);
                        setShowGenerateModal(true);
                    }}
                />
            </div>

            {/* Overlay when sidebar is open */}
            {(showSidebar || showAnalytics || showClusters) && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        background: 'rgba(0, 0, 0, 0.3)',
                        zIndex: 999
                    }}
                    onClick={() => {
                        setShowSidebar(false);
                        setShowAnalytics(false);
                        setShowClusters(false);
                    }}
                />
            )}

            {/* Generate Playlist Modal */}
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

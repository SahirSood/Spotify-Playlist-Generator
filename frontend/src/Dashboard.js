import React, { useEffect, useState } from "react";

function Dashboard() {
    const [accessToken, setAccessToken] = useState('');
    const [refreshToken, setRefreshToken] = useState('');
    const [playlists, setPlaylists] = useState([]);
    const [likedSongs, setLikedSongs] = useState([]);
    const [showSidebar, setShowSidebar] = useState(false);  // Fix 1 - Added this
    const [selectedPlaylistName, setSelectedPlaylistName] = useState('');
    const [nextLikedSongsUrl, setNextLikedSongsUrl] = useState('');
    const [nextPlaylistSongsUrl, setNextPlaylistSongsUrl] = useState('');


    // Extract tokens from URL or LocalStorage
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const access_token = params.get('access_token') || localStorage.getItem('spotify_access_token');
        const refresh_token = params.get('refresh_token') || localStorage.getItem('spotify_refresh_token');

        if (access_token && refresh_token) {
            setAccessToken(access_token);
            setRefreshToken(refresh_token);

            // Save tokens for future use
            localStorage.setItem('spotify_access_token', access_token);
            localStorage.setItem('spotify_refresh_token', refresh_token);
        }
    }, []);

    // Fetch playlists
    useEffect(() => {
        if (!accessToken) return;

        const fetchPlaylists = async () => {
            try {
                const response = await fetch('https://api.spotify.com/v1/me/playlists', {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
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
    }, [accessToken]);


    // Fetch all liked songs (with pagination)
    const fetchLikedSongs = async () => {
        setSelectedPlaylistName('❤️ Liked Songs');
        setShowSidebar(true);
        setLikedSongs([]);   // Clear any old songs
    
        try {
            const response = await fetch('https://api.spotify.com/v1/me/tracks', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
    
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
            const response = await fetch(nextLikedSongsUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
    
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

            const response = await fetch(firstPageUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

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
            const response = await fetch(nextPlaylistSongsUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
    
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
                transform: showSidebar ? 'translateX(-350px)' : 'translateX(0)',
                overflowY: 'auto'
            }}>
                {/* Header */}
                <div style={{
                    marginBottom: '40px',
                    textAlign: 'center'
                }}>
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
                    </div>
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

            {/* Sliding Sidebar */}
            <div style={{
                position: 'fixed',
                top: '0',
                right: showSidebar ? '0' : '-400px',
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
                {/* Sidebar Header */}
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

                {/* Songs List */}
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

            {/* Overlay when sidebar is open */}
            {showSidebar && (
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
                    onClick={() => setShowSidebar(false)}
                />
            )}
        </div>
    );
}

export default Dashboard;

import React, { useEffect, useState } from "react";

function Dashboard() {
    const [accessToken, setAccessToken] = useState('');
    const [refreshToken, setRefreshToken] = useState('');
    const [playlists, setPlaylists] = useState([]);
    const [likedSongs, setLikedSongs] = useState([]);
    const [showLikedSongs, setShowLikedSongs] = useState(false);  // Fix 1 - Added this

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
        let allSongs = [];
        let nextUrl = 'https://api.spotify.com/v1/me/tracks';

        try {
            while (nextUrl) {
                const response = await fetch(nextUrl, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });

                const data = await response.json();  // Fix 2 - Added this
                allSongs = [...allSongs, ...data.items];
                nextUrl = data.next;  // Get URL for next page (null if none)
            }

            setLikedSongs(allSongs);
            setShowLikedSongs(true);
        } catch (error) {
            console.error('Error fetching liked songs:', error);
        }
    };

    const handlePlaylistClick = (playlist) => {
        if (playlist.id === 'liked-songs') {
            fetchLikedSongs();
        } else {
            console.log(`Playlist clicked: ${playlist.name}`);
        }
    };

    return (
        <div style={{ display: 'flex' }}>
            {/* Main content (left side) */}
            <div style={{ flex: 1, padding: '20px' }}>
                <h1>Spotify Dashboard</h1>
                <p>Access Token: {accessToken}</p>
                <p>Refresh Token: {refreshToken}</p>

                <h2>Your Playlists</h2>
                <ul style={{ listStyleType: 'none', padding: 0 }}>
                    {playlists.map((playlist) => (
                        <li 
                            key={playlist.id}
                            onClick={() => handlePlaylistClick(playlist)}
                            style={{
                                cursor: 'pointer',
                                padding: '8px',
                                border: '1px solid #ccc',
                                marginBottom: '5px'
                            }}
                        >
                            {playlist.name}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Sidebar (right side) - shows liked songs only when needed */}
            {showLikedSongs && (
                <div style={{
                    width: '300px',
                    padding: '20px',
                    borderLeft: '1px solid #ccc',
                    backgroundColor: '#f9f9f9'
                }}>
                    <h2>❤️ Your Liked Songs</h2>
                    <button onClick={() => setShowLikedSongs(false)}>Close</button>
                    <ul style={{ listStyleType: 'none', padding: 0 }}>
                        {likedSongs.map((song) => (
                            <li key={song.track.id}>
                                {song.track.name} - {song.track.artists.map(a => a.name).join(', ')}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default Dashboard;

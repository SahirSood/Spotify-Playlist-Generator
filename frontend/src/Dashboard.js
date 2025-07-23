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
            {showSidebar && (
            <div style={{
                width: '300px',
                padding: '20px',
                borderLeft: '1px solid #ccc',
                backgroundColor: '#f9f9f9'
            }}>
                <h2>{selectedPlaylistName}</h2>

                <button onClick={() => setShowSidebar(false)}>Close</button>
                
                {/* Scrollable liked songs list */}
                <div 
                    style={{ 
                        height: '400px', 
                        overflowY: 'auto', 
                        border: '1px solid #ddd' 
                    }} 
                    onScroll={handleScroll}
                >
                    <ul style={{ listStyleType: 'none', padding: 0 }}>
                        {likedSongs.map((song) => (
                            <li key={song.track.id}>
                                {song.track.name} - {song.track.artists.map(a => a.name).join(', ')}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        )}

        </div>
    );
}

export default Dashboard;

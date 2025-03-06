const express = require('express');    // Import Express
const cors = require('cors');          // Import CORS middleware
require('dotenv').config();            // Load .env variables 

const app = express();                  // Create Express app

// Middleware
app.use(cors());                        // Allow requests from your React frontend
app.use(express.json());                // Allow JSON request bodies

// Test route - just to check if your server works
app.get('/', (req, res) => {
    res.send('Spotify Playlist Generator Backend is Running!');
});

const querystring = require('querystring');

app.get('/login',(req, res) => {
    const scope = [
        'user-read-private',
        'user-read-email',
        'playlist-modify-public',
        'playlist-modify-private',
        'user-read-recently-played',
        'user-top-read'
        ].join(' ');

    const params = querystring.stringify({
        response_type: 'code',
        client_id: process.env.SPOTIFY_CLIENT_ID,
        scope: scope,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    });
    res.redirect(`https://accounts.spotify.com/authorize?${params}`);
})

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;

    const authOptions = {
        method: 'post',
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(
                process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
            ).toString('base64')
        },
        data: new URLSearchParams({
            code: code,
            redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
            grant_type: 'authorization_code'
        }).toString()
    };

    try {
        const axios = require('axios');
        const response = await axios(authOptions);
        const { access_token, refresh_token } = response.data;

        // Redirect the user directly to dashboard with tokens in URL
        res.redirect(`http://localhost:3000/dashboard?access_token=${access_token}&refresh_token=${refresh_token}`);
    } catch (error) {
        console.error('Error exchanging code for token:', error.response?.data || error.message);
        res.status(500).send('Authentication failed');
    }
});


// Start the server
const PORT = process.env.PORT || 5000;  // Use port 5000 unless specified in .env
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

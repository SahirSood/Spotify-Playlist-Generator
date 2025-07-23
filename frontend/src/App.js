import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Dashboard from './Dashboard';
import './App.css';

function HomePage() {
    return (
        <div style={{
            height: '100vh',
            width: '100vw',
            background: 'linear-gradient(135deg, #1db954 0%, #191414 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '"Circular", "Helvetica Neue", Arial, sans-serif',
            textAlign: 'center',
            padding: '20px'
        }}>
            <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '20px',
                padding: '40px',
                maxWidth: '500px',
                width: '100%'
            }}>
                <h1 style={{
                    color: 'white',
                    fontSize: '3rem',
                    fontWeight: 'bold',
                    margin: '0 0 20px 0',
                    textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}>
                    🎵 Spotify Playlist Generator
                </h1>
                <p style={{
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: '1.2rem',
                    marginBottom: '30px',
                    lineHeight: '1.6'
                }}>
                    Connect your Spotify account to explore your playlists and discover your music collection
                </p>
                <a
                    href="http://localhost:5000/login"
                    style={{
                        display: 'inline-block',
                        background: '#1db954',
                        color: 'white',
                        padding: '15px 30px',
                        borderRadius: '50px',
                        textDecoration: 'none',
                        fontSize: '1.1rem',
                        fontWeight: 'bold',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 4px 15px rgba(29, 185, 84, 0.3)',
                        border: 'none'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.background = '#1ed760';
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 6px 20px rgba(29, 185, 84, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.background = '#1db954';
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 4px 15px rgba(29, 185, 84, 0.3)';
                    }}
                >
                    🎧 Connect with Spotify
                </a>
            </div>
        </div>
    );
}

function App() {
    return (
        <Router>
            <div className="App">
                <Routes>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/" element={<HomePage />} />
                </Routes>
            </div>
        </Router>
    );
}

export default App;

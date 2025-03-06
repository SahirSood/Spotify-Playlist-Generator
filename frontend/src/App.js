import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Dashboard from './Dashboard';

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/" element={<h1>Welcome to Spotify Playlist Generator</h1>} />
            </Routes>
        </Router>
    );
}

export default App;

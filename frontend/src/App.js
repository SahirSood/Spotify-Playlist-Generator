import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Dashboard from "./Dashboard";
import { getLoginUrl } from "./api";
import "./App.css";

function HomePage() {
  return (
    <div className="home-shell">
      <div className="home-aurora" aria-hidden="true" />
      <div className="home-card">
        <div className="home-copy">
          <span className="home-kicker">Listening Intelligence</span>
          <h1 className="home-title">
            Build playlists from
            <span className="home-title-accent"> how you actually listen.</span>
          </h1>
          <p className="home-text">
            This app turns your Spotify history into clusters, moods, and context-aware
            playlist ideas. Connect your account, inspect your real listening patterns,
            and generate something sharper than a generic "chill mix."
          </p>
          <div className="home-actions">
            <a href={getLoginUrl()} className="home-primary">
              Connect with Spotify
            </a>
            <div className="home-secondary">
              Private by default. Built around your own taste graph.
            </div>
          </div>
          <div className="home-note">
            Local-first for setup, AWS-ready for deployment.
          </div>
        </div>

        <div className="home-preview">
          <div className="home-preview-panel preview-orb">
            <div className="preview-vinyl" />
          </div>
          <div className="preview-grid">
            <div className="preview-chip">
              <strong>Cluster your habits</strong>
              <span>
                Group late-night loops, gym runs, comfort tracks, and everything in
                between.
              </span>
            </div>
            <div className="preview-chip">
              <strong>Prompt the vibe</strong>
              <span>
                Ask for "rainy commute with momentum" and generate from your own history.
              </span>
            </div>
          </div>
        </div>
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

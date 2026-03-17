import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Dashboard from "./Dashboard";
import { getLoginUrl } from "./api";
import "./App.css";

function SpotifyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

const MOOD_CARDS = [
  { label: "Night drive",    name: "Silk momentum",   tag: "tag-purple", tagText: "late night" },
  { label: "Rainy commute",  name: "Soft pressure",   tag: "tag-green",  tagText: "focus" },
  { label: "Workout",        name: "Voltage bloom",   tag: "tag-amber",  tagText: "high energy" },
];

function HomePage() {
  return (
    <div className="home-shell">
      <div className="home-orb home-orb-a" aria-hidden="true" />
      <div className="home-orb home-orb-b" aria-hidden="true" />
      <div className="home-orb home-orb-c" aria-hidden="true" />

      <header className="home-topbar">
        <div className="home-brand">
          Flowstate
          <span className="home-brand-dot" aria-hidden="true" />
        </div>
      </header>

      <main className="home-hero">
        <span className="home-kicker">
          <span className="home-kicker-dot" aria-hidden="true" />
          Listening Intelligence
        </span>

        <h1 className="home-title">
          Your taste,<br />
          <span className="home-title-accent">finally mapped.</span>
        </h1>

        <p className="home-subtitle">
          Flowstate turns your Spotify history into ML mood clusters and
          AI-powered playlists built from your own listening — not generic filler.
        </p>

        <div className="home-actions">
          <a href={getLoginUrl()} className="home-cta">
            <SpotifyIcon />
            Connect with Spotify
          </a>
        </div>

        <p className="home-note">
          <LockIcon />
          Private by default — your data, your clusters.
        </p>
      </main>

      <div className="home-cards" aria-hidden="true">
        {MOOD_CARDS.map((card) => (
          <div key={card.name} className="home-mood-card">
            <div className="home-mood-label">{card.label}</div>
            <div className="home-mood-name">{card.name}</div>
            <span className={`home-mood-tag ${card.tag}`}>{card.tagText}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [, setTheme] = useState(() => localStorage.getItem("flowstate_theme") || "dark");

  useEffect(() => {
    // Always dark — remove theme toggle for cleaner UX
    localStorage.setItem("flowstate_theme", "dark");
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

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

import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Dashboard from "./Dashboard";
import { getLoginUrl } from "./api";
import "./App.css";

function HomePage({ theme, onToggleTheme }) {
  return (
    <div className="home-shell">
      <div className="home-aurora" aria-hidden="true" />
      <header className="site-topbar">
        <div className="site-brand">Flowstate</div>
        <button type="button" className="theme-toggle" onClick={onToggleTheme}>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </header>

      <div className="home-card">
        <div className="home-copy">
          <span className="home-kicker">Listening Intelligence</span>
          <h1 className="home-title">
            Your taste has a shape.
            <span className="home-title-accent"> Now the product does too.</span>
          </h1>
          <p className="home-text">
            Flowstate turns your Spotify history into moving mood clusters, smart
            playlist prompts, and a personal listening map that feels more like a
            premium music product than a boring utility.
          </p>
          <div className="home-actions">
            <a href={getLoginUrl()} className="home-primary">
              Connect with Spotify
            </a>
            <div className="home-secondary">
              Private by default. Built around your own listening patterns.
            </div>
          </div>
          <div className="home-note">
            Clusters, generation, and playback cleanup designed around your actual taste.
          </div>
        </div>

        <div className="home-preview">
          <div className="home-preview-panel preview-stage">
            <div className="preview-stack">
              <div className="preview-card preview-card-a">
                <span>Night drive</span>
                <strong>Silk momentum</strong>
              </div>
              <div className="preview-card preview-card-b">
                <span>Rainy commute</span>
                <strong>Soft pressure</strong>
              </div>
              <div className="preview-card preview-card-c">
                <span>Workout</span>
                <strong>Voltage bloom</strong>
              </div>
            </div>
          </div>
          <div className="preview-grid">
            <div className="preview-chip">
              <strong>Magical generation</strong>
              <span>Prompt a vibe and get a playlist from your own history, not generic filler.</span>
            </div>
            <div className="preview-chip">
              <strong>Cleaner inputs</strong>
              <span>Fast skips and spam loops get filtered so your clusters feel more human.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("flowstate_theme") || "dark");

  useEffect(() => {
    localStorage.setItem("flowstate_theme", theme);
  }, [theme]);

  return (
    <Router>
      <div className={`App theme-${theme}`}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <Dashboard
                theme={theme}
                onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              />
            }
          />
          <Route
            path="/"
            element={
              <HomePage
                theme={theme}
                onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              />
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

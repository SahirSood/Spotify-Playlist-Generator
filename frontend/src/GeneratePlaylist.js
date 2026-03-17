import React, { useEffect, useRef, useState } from "react";
import { generatePlaylist } from "./api";

const SUGGESTIONS = [
  "late-night polished drive",
  "rainy walk with confidence",
  "soft-focus morning reset",
  "workout songs with style",
];

function IconGenerate() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function IconSpotify() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

export default function GeneratePlaylist({ userId, accessToken, onClose, initialRequest = "" }) {
  const [request, setRequest] = useState(initialRequest);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleGenerate() {
    if (!request.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await generatePlaylist(userId, accessToken, request);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gen-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gen-shell">
        {/* Close */}
        <button type="button" className="gen-close" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>

        {!result ? (
          <>
            <div className="gen-icon-wrap" aria-hidden="true">
              <IconGenerate />
            </div>
            <h2 className="gen-title">Generate a playlist</h2>
            <p className="gen-subtitle">
              Describe the feeling you want — mood, moment, energy, or vibe.
              The AI matches it to your own listening clusters.
            </p>

            <div className="gen-input-wrap">
              <input
                ref={inputRef}
                className="gen-input"
                placeholder='e.g. "clean-focus commute" or "expensive-feeling cardio"'
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                disabled={loading}
              />
            </div>

            <div className="gen-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="gen-suggestion"
                  onClick={() => setRequest(s)}
                  disabled={loading}
                >
                  {s}
                </button>
              ))}
            </div>

            {error && <p className="gen-error">{error}</p>}

            <div className="gen-actions">
              <button
                type="button"
                className="gen-primary"
                onClick={handleGenerate}
                disabled={loading || !request.trim()}
              >
                {loading ? (
                  <>
                    <span className="gen-spinner" aria-hidden="true" />
                    Generating…
                  </>
                ) : (
                  <>
                    <IconArrow />
                    Create playlist
                  </>
                )}
              </button>
              <button type="button" className="gen-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>

            <p className="gen-hint">Best results: describe a mood, moment, or energy level.</p>
          </>
        ) : (
          <>
            <div className="gen-result-card">
              <span className="gen-result-cluster">{result.clusterLabel}</span>
              <strong className="gen-result-name">{result.playlistName}</strong>
              <p className="gen-result-rationale">{result.rationale}</p>
              <span className="gen-result-meta">{result.trackCount} tracks</span>
            </div>

            <div className="gen-actions">
              <a
                href={result.playlistUrl}
                target="_blank"
                rel="noreferrer"
                className="gen-spotify-btn"
              >
                <IconSpotify />
                Open in Spotify
              </a>
              <button
                type="button"
                className="gen-ghost"
                onClick={() => { setResult(null); setRequest(""); }}
              >
                Generate another
              </button>
              <button type="button" className="gen-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .gen-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 500;
          padding: 24px;
          animation: gen-fade-in 200ms ease both;
        }
        @keyframes gen-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .gen-shell {
          position: relative;
          background: #0E0E1A;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 24px;
          padding: 40px;
          width: 100%;
          max-width: 500px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.6);
          animation: gen-rise 250ms cubic-bezier(0.4,0,0.2,1) both;
        }
        @keyframes gen-rise {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .gen-close {
          position: absolute;
          top: 16px; right: 16px;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          color: #94A3B8;
          cursor: pointer;
          transition: background 150ms, color 150ms;
        }
        .gen-close:hover { background: rgba(255,255,255,0.1); color: #F1F5F9; }
        .gen-icon-wrap {
          width: 44px; height: 44px;
          background: rgba(29,185,84,0.15);
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          color: #1DB954;
        }
        .gen-title {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #F1F5F9;
          margin: 0;
        }
        .gen-subtitle {
          font-size: 14px;
          color: #94A3B8;
          line-height: 1.6;
          margin: 0;
        }
        .gen-input-wrap { position: relative; }
        .gen-input {
          width: 100%;
          padding: 14px 18px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #F1F5F9;
          font-family: "Space Grotesk", sans-serif;
          font-size: 15px;
          outline: none;
          transition: border-color 150ms, box-shadow 150ms;
        }
        .gen-input:focus {
          border-color: rgba(29,185,84,0.5);
          box-shadow: 0 0 0 3px rgba(29,185,84,0.12);
        }
        .gen-input::placeholder { color: #475569; }
        .gen-input:disabled { opacity: 0.6; cursor: not-allowed; }
        .gen-suggestions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .gen-suggestion {
          padding: 6px 14px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 99px;
          font-family: inherit;
          font-size: 13px;
          color: #94A3B8;
          cursor: pointer;
          transition: background 150ms, border-color 150ms, color 150ms;
        }
        .gen-suggestion:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.14);
          color: #F1F5F9;
        }
        .gen-suggestion:disabled { opacity: 0.5; cursor: not-allowed; }
        .gen-error {
          font-size: 13px;
          color: #F43F5E;
          background: rgba(244,63,94,0.1);
          border: 1px solid rgba(244,63,94,0.2);
          border-radius: 8px;
          padding: 10px 14px;
          margin: 0;
        }
        .gen-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .gen-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 22px;
          background: #1DB954;
          color: #000;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          border-radius: 99px;
          border: none;
          cursor: pointer;
          transition: background 150ms, box-shadow 150ms, transform 150ms;
          letter-spacing: -0.01em;
        }
        .gen-primary:hover:not(:disabled) {
          background: #22d461;
          box-shadow: 0 0 0 3px rgba(29,185,84,0.2);
        }
        .gen-primary:active { transform: scale(0.97); }
        .gen-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .gen-ghost {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 18px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 99px;
          font-family: inherit;
          font-size: 14px;
          color: #94A3B8;
          cursor: pointer;
          transition: background 150ms, color 150ms;
        }
        .gen-ghost:hover { background: rgba(255,255,255,0.09); color: #F1F5F9; }
        .gen-spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(0,0,0,0.3);
          border-top-color: #000;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .gen-hint {
          font-size: 12px;
          color: #475569;
          margin: 0;
        }
        /* Result card */
        .gen-result-card {
          background: rgba(29,185,84,0.07);
          border: 1px solid rgba(29,185,84,0.2);
          border-radius: 16px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .gen-result-cluster {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #1DB954;
        }
        .gen-result-name {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #F1F5F9;
        }
        .gen-result-rationale {
          font-size: 14px;
          color: #94A3B8;
          line-height: 1.6;
          margin: 0;
        }
        .gen-result-meta {
          font-size: 12px;
          color: #475569;
          font-weight: 500;
        }
        .gen-spotify-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 22px;
          background: #1DB954;
          color: #000;
          font-family: "Space Grotesk", sans-serif;
          font-size: 14px;
          font-weight: 600;
          border-radius: 99px;
          text-decoration: none;
          transition: background 150ms, box-shadow 150ms;
          letter-spacing: -0.01em;
        }
        .gen-spotify-btn:hover {
          background: #22d461;
          box-shadow: 0 0 0 3px rgba(29,185,84,0.2);
        }
      `}</style>
    </div>
  );
}

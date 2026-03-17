import React, { useState } from "react";
import { generatePlaylist } from "./api";

const SUGGESTIONS = [
  "late-night polished drive",
  "rainy walk with confidence",
  "soft-focus morning reset",
  "workout songs with style",
];

export default function GeneratePlaylist({
  userId,
  accessToken,
  onClose,
  initialRequest = "",
}) {
  const [request, setRequest] = useState(initialRequest);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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
    <div
      className="modal-overlay"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal-shell">
        <h2>Generate a playlist</h2>
        <p className="modal-subtitle">
          Describe the feeling you want. The app will match it to your listening
          history and build from your own clusters.
        </p>

        {!result ? (
          <>
            <input
              className="modal-input"
              placeholder='Try "clean-focus commute" or "expensive-feeling cardio"'
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleGenerate()}
            />
            <div className="modal-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="modal-suggestion"
                  onClick={() => setRequest(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {error && <p className="modal-error">{error}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-primary"
                onClick={handleGenerate}
                disabled={loading || !request.trim()}
              >
                {loading ? "Generating" : "Create playlist"}
              </button>
              <button type="button" className="modal-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
            <p className="modal-note">
              Best results come from describing a mood, moment, or energy level.
            </p>
          </>
        ) : (
          <>
            <div className="modal-result-card">
              <span className="modal-result-label">{result.clusterLabel}</span>
              <strong className="modal-result-title">{result.playlistName}</strong>
              <p className="modal-result-rationale">{result.rationale}</p>
              <span className="modal-result-meta">{result.trackCount} tracks added</span>
            </div>
            <div className="modal-result-actions">
              <a href={result.playlistUrl} target="_blank" rel="noreferrer" className="home-primary">
                Open in Spotify
              </a>
              <button
                type="button"
                className="modal-tertiary"
                onClick={() => {
                  setResult(null);
                  setRequest("");
                }}
              >
                Generate another
              </button>
              <button type="button" className="modal-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

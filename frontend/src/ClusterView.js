import React from "react";

const TONE_MAP = {
  sun:   { accent: "#F59E0B", bg: "rgba(245,158,11,0.08)",   border: "rgba(245,158,11,0.2)",  label: "rgba(245,158,11,1)" },
  ocean: { accent: "#38BDF8", bg: "rgba(56,189,248,0.08)",   border: "rgba(56,189,248,0.2)",  label: "rgba(56,189,248,1)" },
  flare: { accent: "#F43F5E", bg: "rgba(244,63,94,0.08)",    border: "rgba(244,63,94,0.2)",   label: "rgba(244,63,94,1)" },
  leaf:  { accent: "#1DB954", bg: "rgba(29,185,84,0.08)",    border: "rgba(29,185,84,0.2)",   label: "rgba(29,185,84,1)" },
  violet:{ accent: "#A259FF", bg: "rgba(162,89,255,0.08)",   border: "rgba(162,89,255,0.2)",  label: "rgba(162,89,255,1)" },
};

function toneForCluster(label = "") {
  const l = label.toLowerCase();
  if (l.includes("happy") || l.includes("sun") || l.includes("morning")) return "sun";
  if (l.includes("calm") || l.includes("rain") || l.includes("chill"))   return "ocean";
  if (l.includes("energy") || l.includes("workout") || l.includes("hype")) return "flare";
  if (l.includes("night") || l.includes("late") || l.includes("dark"))   return "violet";
  return "leaf";
}

function IconArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

export default function ClusterView({ clusters, onGenerateFromCluster }) {
  if (!clusters || clusters.length === 0) {
    return (
      <div style={{
        padding: "48px 0",
        textAlign: "center",
        color: "var(--text-3)",
        fontSize: "14px",
        lineHeight: "1.6",
      }}>
        No clusters yet.<br />
        <span style={{ color: "var(--text-3)", fontSize: "13px" }}>Run a sync and your music map will appear here.</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {clusters.map((cluster) => {
        const toneKey = toneForCluster(cluster.clusterLabel);
        const tone = TONE_MAP[toneKey];

        return (
          <article
            key={cluster.clusterId}
            style={{
              background: tone.bg,
              border: `1px solid ${tone.border}`,
              borderRadius: "14px",
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
              <div>
                <span style={{
                  display: "inline-block",
                  fontSize: "10px",
                  fontWeight: "600",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: tone.accent,
                  marginBottom: "4px",
                }}>
                  {cluster.dominantTimeOfDay || "mixed"}
                </span>
                <h3 style={{
                  margin: "0",
                  fontSize: "15px",
                  fontWeight: "700",
                  letterSpacing: "-0.02em",
                  color: "var(--text)",
                }}>
                  {cluster.clusterLabel}
                </h3>
              </div>
              <span style={{
                fontSize: "11px",
                color: "var(--text-3)",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
                paddingTop: "2px",
              }}>
                {cluster.trackCount || 0} songs
              </span>
            </div>

            {/* Description */}
            {cluster.clusterDescription && (
              <p style={{
                margin: "0",
                fontSize: "13px",
                color: "var(--text-2)",
                lineHeight: "1.55",
              }}>
                {cluster.clusterDescription}
              </p>
            )}

            {/* Meta chips */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[
                `Energy ${Math.round((cluster.avgEnergy || 0) * 100)}%`,
                `Valence ${Math.round((cluster.avgValence || 0) * 100)}%`,
                cluster.dominantWeather && `${cluster.dominantWeather} weather`,
              ].filter(Boolean).map((chip) => (
                <span
                  key={chip}
                  style={{
                    display: "inline-block",
                    fontSize: "11px",
                    padding: "3px 9px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: "99px",
                    color: "var(--text-3)",
                    fontWeight: "500",
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>

            {/* Generate button */}
            <button
              type="button"
              onClick={() => onGenerateFromCluster(cluster.clusterLabel)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                background: tone.accent,
                color: toneKey === "sun" ? "#000" : "#fff",
                fontFamily: "inherit",
                fontSize: "12px",
                fontWeight: "600",
                borderRadius: "99px",
                border: "none",
                cursor: "pointer",
                letterSpacing: "-0.01em",
                alignSelf: "flex-start",
                transition: "opacity 150ms, transform 150ms",
              }}
              onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
              onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              Generate from this cluster
              <IconArrow />
            </button>
          </article>
        );
      })}
    </div>
  );
}

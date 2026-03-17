import React from "react";

function toneForCluster(label = "") {
  const lower = label.toLowerCase();
  if (lower.includes("happy") || lower.includes("sun")) return "tone-sun";
  if (lower.includes("calm") || lower.includes("night")) return "tone-ocean";
  if (lower.includes("energy") || lower.includes("workout")) return "tone-flare";
  return "tone-leaf";
}

export default function ClusterView({ clusters, onGenerateFromCluster }) {
  if (!clusters || clusters.length === 0) {
    return (
      <div className="cluster-empty">
        No clusters yet. Run a sync first and the app will build a music map for you.
      </div>
    );
  }

  return (
    <div className="cluster-grid">
      {clusters.map((cluster) => (
        <article
          key={cluster.clusterId}
          className={`cluster-card ${toneForCluster(cluster.clusterLabel)}`}
        >
          <span className="cluster-badge">{cluster.dominantTimeOfDay || "mixed"}</span>
          <h3>{cluster.clusterLabel}</h3>
          <p>{cluster.clusterDescription}</p>
          <div className="cluster-meta">
            <span>{cluster.trackCount || 0} songs</span>
            <span>{cluster.dominantWeather || "Unknown"} weather</span>
          </div>
          <div className="cluster-meta">
            <span>Energy {Math.round((cluster.avgEnergy || 0) * 100)}%</span>
            <span>Valence {Math.round((cluster.avgValence || 0) * 100)}%</span>
          </div>
          <button
            type="button"
            className="cluster-button"
            onClick={() => onGenerateFromCluster(cluster.clusterLabel)}
          >
            Generate from this cluster
          </button>
        </article>
      ))}
    </div>
  );
}

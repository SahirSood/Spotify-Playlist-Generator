import React, { useEffect, useRef } from "react";
import { fetchClusterStatus, triggerSyncAndCluster } from "./api";

export default function SyncStatus({
  userId,
  accessToken,
  refreshToken,
  status,
  onStatusChange,
  onSynced,
}) {
  const pollRef = useRef(null);

  useEffect(() => {
    if (!status?.isProcessing || !userId) {
      return () => clearInterval(pollRef.current);
    }

    pollRef.current = setInterval(async () => {
      try {
        const nextStatus = await fetchClusterStatus(userId);
        onStatusChange?.(nextStatus);
        if (!nextStatus.isProcessing) {
          clearInterval(pollRef.current);
          onSynced?.(nextStatus);
        }
      } catch (error) {
        console.error("Failed to poll cluster status:", error);
      }
    }, 5000);

    return () => clearInterval(pollRef.current);
  }, [onStatusChange, onSynced, status?.isProcessing, userId]);

  async function handleSync() {
    try {
      await triggerSyncAndCluster(userId, accessToken, refreshToken);
      onStatusChange?.({ ...status, isProcessing: true });
    } catch (error) {
      alert(`Sync failed: ${error.message}`);
    }
  }

  const lastSync = status?.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  const isProcessing = status?.isProcessing;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      {/* Status indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span
          style={{
            display: "inline-block",
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: isProcessing ? "#F59E0B" : lastSync ? "#1DB954" : "#475569",
            boxShadow: isProcessing
              ? "0 0 0 3px rgba(245,158,11,0.2)"
              : lastSync
              ? "0 0 0 3px rgba(29,185,84,0.15)"
              : "none",
            animation: isProcessing ? "sync-pulse 1.4s ease-in-out infinite" : "none",
          }}
        />
        <span style={{ fontSize: "13px", color: "var(--text-3)" }}>
          {isProcessing
            ? "Syncing…"
            : lastSync
            ? `Synced ${lastSync}`
            : "Not synced"}
        </span>
      </div>

      <button
        type="button"
        onClick={handleSync}
        disabled={isProcessing || !userId}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "7px 14px",
          background: isProcessing ? "var(--surface)" : "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "99px",
          fontFamily: "inherit",
          fontSize: "13px",
          fontWeight: "600",
          color: isProcessing ? "var(--text-3)" : "var(--text-2)",
          cursor: isProcessing || !userId ? "not-allowed" : "pointer",
          opacity: isProcessing || !userId ? 0.5 : 1,
          transition: "background 150ms, color 150ms, border-color 150ms",
          letterSpacing: "-0.01em",
        }}
        onMouseOver={(e) => {
          if (!isProcessing && userId) {
            e.currentTarget.style.borderColor = "var(--border-2)";
            e.currentTarget.style.color = "var(--text)";
          }
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.color = isProcessing ? "var(--text-3)" : "var(--text-2)";
        }}
      >
        {isProcessing ? (
          <>
            <span style={{
              display: "inline-block",
              width: "11px",
              height: "11px",
              border: "2px solid rgba(255,255,255,0.2)",
              borderTopColor: "var(--text-2)",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }} />
            Syncing
          </>
        ) : "Sync now"}
      </button>

      <style>{`
        @keyframes sync-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.8); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

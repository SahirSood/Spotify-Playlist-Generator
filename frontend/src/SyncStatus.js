import React, { useEffect, useRef } from "react";
import { fetchClusterStatus, triggerSyncAndCluster } from "./api";

export default function SyncStatus({
  userId,
  accessToken,
  refreshToken,
  status,
  onStatusChange,
  onSynced,
  compact = false,
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
    ? new Date(status.lastSyncAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const isProcessing = Boolean(status?.isProcessing);
  const label = isProcessing
    ? "Syncing"
    : lastSync
    ? `Synced ${lastSync}`
    : "Not synced yet";

  if (compact) {
    return (
      <button
        type="button"
        className="dashboard-secondary-button"
        onClick={handleSync}
        disabled={isProcessing || !userId}
      >
        {isProcessing ? "Syncing..." : "Sync Spotify"}
      </button>
    );
  }

  return (
    <div className="sync-status">
      <div className="sync-status-copy">
        <span className={`sync-status-dot${isProcessing ? " is-processing" : lastSync ? " is-ready" : ""}`} />
        <span>{label}</span>
      </div>

      <button
        type="button"
        className="dashboard-secondary-button"
        onClick={handleSync}
        disabled={isProcessing || !userId}
      >
        {isProcessing ? "Syncing..." : "Sync Spotify"}
      </button>
    </div>
  );
}

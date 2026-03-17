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
    ? new Date(status.lastSyncAt).toLocaleString()
    : "Never";

  return (
    <div className="sync-widget">
      <div className={`sync-dot ${status?.isProcessing ? "is-busy" : ""}`} />
      <div className="sync-copy">
        <strong>{status?.isProcessing ? "Syncing your listening graph" : "Cluster pipeline"}</strong>
        <span>
          {status?.isProcessing
            ? "We are fetching history, filtering skips, and rebuilding clusters."
            : `Last sync: ${lastSync}${status?.clusterCount ? ` | ${status.clusterCount} clusters` : ""}`}
        </span>
      </div>
      <button
        type="button"
        className="sync-button"
        onClick={handleSync}
        disabled={status?.isProcessing || !userId}
      >
        {status?.isProcessing ? "Syncing" : "Sync now"}
      </button>
    </div>
  );
}

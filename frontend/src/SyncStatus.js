import React, { useEffect, useRef } from 'react';
import { fetchClusterStatus, triggerSyncAndCluster } from './api';

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.07)',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#ccc',
  },
  dot: (isProcessing) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: isProcessing ? '#ffa500' : '#1db954',
    flexShrink: 0,
  }),
  button: {
    marginLeft: 'auto',
    padding: '6px 14px',
    borderRadius: '20px',
    border: 'none',
    background: '#1db954',
    color: '#000',
    fontWeight: '600',
    fontSize: '12px',
    cursor: 'pointer',
  },
};

export default function SyncStatus({ userId, accessToken, refreshToken, status, onStatusChange }) {
  const pollRef = useRef(null);

  useEffect(() => {
    if (status?.isProcessing) {
      pollRef.current = setInterval(async () => {
        try {
          const s = await fetchClusterStatus(userId);
          onStatusChange(s);
          if (!s.isProcessing) clearInterval(pollRef.current);
        } catch {}
      }, 5000);
    }
    return () => clearInterval(pollRef.current);
  }, [status?.isProcessing, userId, onStatusChange]);

  async function handleSync() {
    try {
      await triggerSyncAndCluster(userId, accessToken, refreshToken);
      onStatusChange({ ...status, isProcessing: true });
    } catch (err) {
      alert('Sync failed: ' + err.message);
    }
  }

  const lastSync = status?.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleString()
    : 'Never';

  return (
    <div style={styles.bar}>
      <div style={styles.dot(status?.isProcessing)} />
      {status?.isProcessing ? (
        <span>Syncing and clustering your listening data…</span>
      ) : (
        <>
          <span>Last sync: {lastSync}</span>
          {status?.clusterCount > 0 && <span>· {status.clusterCount} clusters</span>}
        </>
      )}
      <button style={styles.button} onClick={handleSync} disabled={status?.isProcessing}>
        {status?.isProcessing ? 'Syncing…' : 'Sync Now'}
      </button>
    </div>
  );
}

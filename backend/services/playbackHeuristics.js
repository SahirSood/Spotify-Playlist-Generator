const MIN_COMPLETION_RATIO = 0.25;
const SPAM_REPLAY_WINDOW_MS = 2 * 60 * 1000;

function annotateChronologicalTracks(items) {
  return items.map((item, index, arr) => {
    const nextItem = arr[index + 1] || null;
    const durationMs = item.track?.duration_ms || 0;
    const listenWindowMs = nextItem
      ? Math.max(0, new Date(nextItem.played_at).getTime() - new Date(item.played_at).getTime())
      : null;
    const estimatedCompletionRatio = listenWindowMs !== null && durationMs > 0
      ? Math.max(0, Math.min(1, listenWindowMs / durationMs))
      : null;
    const sameTrackReplay = Boolean(nextItem?.track?.id && nextItem.track.id === item.track?.id);
    const isSkipped = estimatedCompletionRatio !== null && estimatedCompletionRatio < MIN_COMPLETION_RATIO;
    const isSpam = sameTrackReplay && listenWindowMs !== null && listenWindowMs < SPAM_REPLAY_WINDOW_MS;

    return {
      ...item,
      playbackHeuristics: {
        listenWindowMs,
        estimatedCompletionRatio,
        isSkipped,
        isSpam,
        includeInMl: !isSkipped && !isSpam,
        skipReason: isSpam ? 'rapid_replay' : isSkipped ? 'under_25_percent' : null,
      },
    };
  });
}

module.exports = {
  annotateChronologicalTracks,
  MIN_COMPLETION_RATIO,
};

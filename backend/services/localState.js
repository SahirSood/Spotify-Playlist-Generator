const users = new Map();

function getUser(userId) {
  if (!users.has(userId)) {
    users.set(userId, {
      tokens: null,
      status: {
        lastSyncAt: null,
        clusterCount: 0,
        isProcessing: false,
      },
      clusters: [],
    });
  }

  return users.get(userId);
}

function saveTokens(userId, tokens) {
  const user = getUser(userId);
  user.tokens = {
    ...user.tokens,
    ...tokens,
    updatedAt: new Date().toISOString(),
  };
}

function getTokens(userId) {
  return getUser(userId).tokens;
}

function setStatus(userId, updates) {
  const user = getUser(userId);
  user.status = {
    ...user.status,
    ...updates,
  };
}

function getStatus(userId) {
  return getUser(userId).status;
}

function setClusters(userId, clusters) {
  const user = getUser(userId);
  user.clusters = clusters;
  user.status.clusterCount = clusters.length;
}

function getClusters(userId) {
  return getUser(userId).clusters;
}

module.exports = {
  saveTokens,
  getTokens,
  setStatus,
  getStatus,
  setClusters,
  getClusters,
};

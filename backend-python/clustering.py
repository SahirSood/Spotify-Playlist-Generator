"""
clustering.py
K-means clustering pipeline with automatic K selection (elbow method).
"""
import json
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler


def choose_k(X, k_min=3, k_max=10, sample_weights=None):
    """
    Choose optimal K using the elbow method (second derivative of inertia).
    Applies practical caps based on data size.
    """
    n = len(X)
    if n < 20:
        return 3
    if n < 50:
        k_max = min(k_max, 3)
    elif n < 200:
        k_max = min(k_max, 8)

    k_min = min(k_min, k_max)
    if k_min == k_max:
        return k_min

    inertias = []
    for k in range(k_min, k_max + 1):
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        if sample_weights is not None:
            km.fit(X, sample_weight=sample_weights)
        else:
            km.fit(X)
        inertias.append(km.inertia_)

    if len(inertias) < 3:
        return k_min

    diffs = np.diff(inertias)
    second_diffs = np.diff(diffs)
    optimal_idx = int(np.argmax(second_diffs))
    return k_min + optimal_idx + 1


def run_kmeans(X_scaled, k, sample_weights=None):
    """Fit K-means and return (model, labels, centroids_unscaled_hint)."""
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    if sample_weights is not None:
        labels = km.fit_predict(X_scaled, sample_weight=sample_weights)
    else:
        labels = km.fit_predict(X_scaled)
    return km, labels


def scale_features(X):
    """Fit and apply StandardScaler. Returns (X_scaled, scaler)."""
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    return X_scaled, scaler

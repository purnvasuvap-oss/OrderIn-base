import React from "react";

// Staged/shimmer placeholder shown while usePublicMenuData is loading —
// fits a flipbook's progressive-reveal feel better than the blocking
// full-screen spinner the rest of the app uses (src/Loading.jsx).
function PageSkeleton() {
  return (
    <div className="pm-skeleton" role="status" aria-label="Loading menu">
      <div className="pm-skeleton-logo" />
      <div className="pm-skeleton-line pm-skeleton-line-lg" />
      <div className="pm-skeleton-line pm-skeleton-line-md" />
      <div className="pm-skeleton-card" />
      <div className="pm-skeleton-card" />
    </div>
  );
}

export default PageSkeleton;

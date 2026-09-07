import React from "react";
import { RefreshCw } from "lucide-react";

// Shown when the restaurant/menu can't be found or the fetch failed.
function BookEmptyState({ message, onRetry }) {
  return (
    <div className="pm-empty-state" role="alert">
      <p className="pm-empty-message">{message || "We couldn't load this restaurant's menu right now."}</p>
      {onRetry && (
        <button type="button" className="pm-empty-retry-btn" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" />
          Try Again
        </button>
      )}
    </div>
  );
}

export default BookEmptyState;

import React, { useState } from "react";
import { X } from "lucide-react";
import "./RejectReasonModal.css";

const REJECT_REASONS = [
  "Item Sold Out",
  "Temporarily Unavailable",
  "Long Prep Time",
  "Customization Not Possible",
];

function RejectReasonModal({ isOpen, onClose, onConfirm }) {
  const [selectedReason, setSelectedReason] = useState("");

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedReason) return;
    onConfirm(selectedReason);
    setSelectedReason("");
  };

  const handleClose = () => {
    setSelectedReason("");
    onClose();
  };

  return (
    <div className="RejectReason-overlay" onClick={handleClose}>
      <div className="RejectReason-modal" onClick={(e) => e.stopPropagation()}>
        <div className="RejectReason-header">
          <h3>Select Reason</h3>
          <button className="RejectReason-close" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <div className="RejectReason-body">
          <p className="RejectReason-prompt">Let the customer know why this order can't be fulfilled:</p>
          {REJECT_REASONS.map((reason) => (
            <label key={reason} className="RejectReason-option">
              <input
                type="radio"
                name="reject-reason"
                value={reason}
                checked={selectedReason === reason}
                onChange={() => setSelectedReason(reason)}
              />
              <span>{reason}</span>
            </label>
          ))}
        </div>

        <div className="RejectReason-footer">
          <button className="RejectReason-btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="RejectReason-btn-primary"
            onClick={handleConfirm}
            disabled={!selectedReason}
          >
            Send Update to Customer
          </button>
        </div>
      </div>
    </div>
  );
}

export default RejectReasonModal;

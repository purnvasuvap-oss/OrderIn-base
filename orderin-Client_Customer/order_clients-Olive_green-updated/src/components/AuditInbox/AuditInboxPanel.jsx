import { useEffect, useMemo, useState } from "react";
import { Clock, Package, Settings2, CheckSquare, Square, X } from "lucide-react";
import "./AuditInboxPanel.css";
import {
  AUDIT_ACTION_TYPES,
  getAuditActionMeta,
  getAuditWindowSettings,
  saveAuditWindowSettings,
  fetchAuditLog,
  applyBulkAuditAction,
} from "../../services/inventoryAuditService";
import { isActionAllowed, actionCategoryFor, DEFAULT_AUDIT_WINDOWS } from "../../utils/auditWindow";

const AuditInboxPanel = ({ items, onChanged }) => {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [actionType, setActionType] = useState("received");
  const [bulkQuantity, setBulkQuantity] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [windows, setWindows] = useState(DEFAULT_AUDIT_WINDOWS);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [log, setLog] = useState([]);
  const [loadingLog, setLoadingLog] = useState(true);
  const [search, setSearch] = useState("");

  const loadWindows = async () => setWindows(await getAuditWindowSettings());
  const loadLog = async () => {
    setLoadingLog(true);
    try {
      setLog(await fetchAuditLog(50));
    } finally {
      setLoadingLog(false);
    }
  };

  useEffect(() => {
    loadWindows();
    loadLog();
  }, []);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (items || []).filter(
      (it) => !term || it.name.toLowerCase().includes(term) || it.itemCategory?.toLowerCase().includes(term)
    );
  }, [items, search]);

  const actionMeta = getAuditActionMeta(actionType);
  const gateCheck = isActionAllowed(actionMeta.category, windows);

  const toggleItem = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const resetForm = () => {
    setSelectedIds(new Set());
    setBulkQuantity("");
    setNote("");
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      alert("Select at least one item.");
      return;
    }
    if (!bulkQuantity || Number(bulkQuantity) <= 0) {
      alert("Enter a valid quantity to apply to every selected item.");
      return;
    }
    if (!gateCheck.allowed) {
      alert(
        `${actionMeta.label} is only allowed during the "${gateCheck.label}" window (${gateCheck.window?.start} - ${gateCheck.window?.end}). This restriction is set by the owner to prevent midday tampering.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const lines = Array.from(selectedIds)
        .map((id) => items.find((i) => i.id === id))
        .filter(Boolean)
        .map((item) => ({ item, quantity: bulkQuantity }));

      await applyBulkAuditAction({ actionType, lines, note, performedBy: "Kitchen Staff" });
      resetForm();
      await loadLog();
      onChanged && onChanged();
      alert(`${actionMeta.label} applied to ${lines.length} item(s).`);
    } catch (error) {
      console.error("Bulk audit action failed:", error);
      alert("Error applying bulk action: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await saveAuditWindowSettings(windows);
      setShowSettings(false);
      alert("Timing windows updated.");
    } catch (error) {
      alert("Error saving settings: " + error.message);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="AuditInbox-wrapper">
      <div className="AuditInbox-header">
        <div>
          <h3>Audit Inbox</h3>
          <p className="AuditInbox-subtitle">
            Tick items, pick a reason, and apply it in one go. Every change is timestamped and logged below.
          </p>
        </div>
        <button className="AuditInbox-settings-btn" onClick={() => setShowSettings(true)}>
          <Settings2 size={16} /> Timing Rules
        </button>
      </div>

      <div className={`AuditInbox-gate ${gateCheck.allowed ? "is-open" : "is-closed"}`}>
        <Clock size={16} />
        {windows.enforce ? (
          gateCheck.allowed ? (
            <span>
              Window open for <strong>{actionMeta.label}</strong> ({gateCheck.window?.start} – {gateCheck.window?.end})
            </span>
          ) : (
            <span>
              <strong>{actionMeta.label}</strong> is locked right now. Allowed only {gateCheck.window?.start} – {gateCheck.window?.end}
              {" "}({gateCheck.label} window).
            </span>
          )
        ) : (
          <span>Timing restrictions are currently off. Turn them on in Timing Rules to enforce Stock In / Stock Out hours.</span>
        )}
      </div>

      <div className="AuditInbox-toolbar">
        <input
          className="AuditInbox-search"
          placeholder="Search item or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="AuditInbox-select">
          {AUDIT_ACTION_TYPES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <input
          className="AuditInbox-qty"
          type="number"
          min="0"
          placeholder="Qty (per item)"
          value={bulkQuantity}
          onChange={(e) => setBulkQuantity(e.target.value)}
        />
        <input
          className="AuditInbox-note"
          placeholder="Note (optional) e.g. supplier name"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="AuditInbox-apply-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Applying..." : `Apply to ${selectedIds.size} item(s)`}
        </button>
      </div>

      <div className="AuditInbox-list">
        <div className="AuditInbox-list-header" onClick={toggleAll}>
          {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? (
            <CheckSquare size={16} />
          ) : (
            <Square size={16} />
          )}
          <span>Select all ({filteredItems.length})</span>
        </div>
        {filteredItems.map((item) => (
          <label key={item.id} className="AuditInbox-row">
            <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleItem(item.id)} />
            <Package size={14} className="AuditInbox-row-icon" />
            <span className="AuditInbox-row-name">{item.name}</span>
            <span className="AuditInbox-row-cat">{item.itemCategory}</span>
            <span className="AuditInbox-row-qty">{item.quantity}</span>
          </label>
        ))}
        {filteredItems.length === 0 && <p className="AuditInbox-empty">No items match your search.</p>}
      </div>

      <div className="AuditInbox-log">
        <h4>Recent Audit Entries</h4>
        {loadingLog ? (
          <p className="AuditInbox-empty">Loading log...</p>
        ) : log.length === 0 ? (
          <p className="AuditInbox-empty">No audit entries yet.</p>
        ) : (
          log.map((entry) => (
            <div key={entry.id} className="AuditInbox-log-entry">
              <div className="AuditInbox-log-top">
                <span className={`AuditInbox-log-badge tag-${entry.actionType}`}>{entry.actionLabel}</span>
                <span className="AuditInbox-log-time">
                  {entry.performedAt?.toDate ? entry.performedAt.toDate().toLocaleString("en-GB") : ""}
                </span>
              </div>
              <div className="AuditInbox-log-items">
                {(entry.items || []).map((li, idx) => (
                  <span key={idx} className="AuditInbox-log-item-chip">
                    {li.itemName}: {li.quantity} {li.unit}
                  </span>
                ))}
              </div>
              {entry.note && <p className="AuditInbox-log-note">"{entry.note}" — {entry.performedBy}</p>}
            </div>
          ))
        )}
      </div>

      {showSettings && (
        <div className="AuditInbox-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="AuditInbox-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="AuditInbox-modal-header">
              <h3>Custom Zones / Timing</h3>
              <button onClick={() => setShowSettings(false)}><X size={20} /></button>
            </div>
            <div className="AuditInbox-modal-body">
              <label className="AuditInbox-toggle-row">
                <input
                  type="checkbox"
                  checked={windows.enforce}
                  onChange={(e) => setWindows((w) => ({ ...w, enforce: e.target.checked }))}
                />
                Enforce timing restrictions (prevents midday updates)
              </label>

              <div className="AuditInbox-window-group">
                <h5>Stock In (Received Delivery)</h5>
                <div className="AuditInbox-time-row">
                  <input
                    type="time"
                    value={windows.stockIn?.start || "08:00"}
                    onChange={(e) => setWindows((w) => ({ ...w, stockIn: { ...w.stockIn, start: e.target.value } }))}
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={windows.stockIn?.end || "11:00"}
                    onChange={(e) => setWindows((w) => ({ ...w, stockIn: { ...w.stockIn, end: e.target.value } }))}
                  />
                </div>
              </div>

              <div className="AuditInbox-window-group">
                <h5>Stock Out (Spoiled / Personal Use / Correction)</h5>
                <div className="AuditInbox-time-row">
                  <input
                    type="time"
                    value={windows.stockOut?.start || "23:00"}
                    onChange={(e) => setWindows((w) => ({ ...w, stockOut: { ...w.stockOut, start: e.target.value } }))}
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={windows.stockOut?.end || "23:59"}
                    onChange={(e) => setWindows((w) => ({ ...w, stockOut: { ...w.stockOut, end: e.target.value } }))}
                  />
                </div>
              </div>

              <button className="AuditInbox-apply-btn AuditInbox-full" onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? "Saving..." : "Save Timing Rules"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditInboxPanel;

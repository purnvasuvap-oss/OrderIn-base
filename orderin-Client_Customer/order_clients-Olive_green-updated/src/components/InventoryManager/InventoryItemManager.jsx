import { useMemo, useState } from "react";
import { PauseCircle, PlayCircle, Trash2, LayoutGrid, List, Package, X } from "lucide-react";
import "./InventoryItemManager.css";
import { pauseItems, continueItems, softDeleteItems } from "../../services/inventoryStatusService";

const STATUS_LABEL = { active: "Active", paused: "Paused", deleted: "Deleted" };
const ACTION_LABEL = { pause: "Pause", continue: "Continue", delete: "Delete" };

const getItemStatus = (item) => item.itemStatus || "active";

// Which items in a category are eligible to move into the target state.
// Pause only touches active items, Delete only touches active/paused items,
// Continue restores anything paused or deleted — mirrors the single-item button gating below.
const itemIdsToTransition = (categoryItems, action) =>
  categoryItems
    .filter((item) => {
      const status = getItemStatus(item);
      if (action === "pause") return status === "active";
      if (action === "continue") return status === "paused" || status === "deleted";
      return status === "active" || status === "paused"; // delete
    })
    .map((item) => item.id);

const categoryStatus = (categoryItems) => {
  const active = categoryItems.filter((i) => getItemStatus(i) === "active").length;
  const deleted = categoryItems.filter((i) => getItemStatus(i) === "deleted").length;
  if (active === 0 && deleted === categoryItems.length && categoryItems.length > 0) return "deleted";
  if (active === 0 && categoryItems.length > 0) return "paused";
  return "active";
};

const confirmMessage = (target) => {
  const count = target.itemIds.length;
  if (target.kind === "item") {
    if (target.action === "pause") return `Pause "${target.label}"? It will be hidden from the main inventory view until resumed.`;
    if (target.action === "continue") return `Continue "${target.label}"? It will reappear in the live inventory exactly as it was.`;
    return `Delete "${target.label}"? It will be hidden from the live inventory, but its data is kept and can be restored with Continue.`;
  }
  if (target.action === "pause") return `Pause all ${count} active item(s) in "${target.label}"? They will be hidden from the main inventory view until resumed.`;
  if (target.action === "continue") return `Continue all ${count} paused/deleted item(s) in "${target.label}"? They will reappear in the live inventory.`;
  return `Delete all ${count} item(s) in "${target.label}"? They will be hidden from the live inventory, but can be restored with Continue.`;
};

const InventoryItemManager = ({ items, onChanged }) => {
  const [viewMode, setViewMode] = useState("category");
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = {};
    (items || []).forEach((item) => {
      const cat = item.itemCategory || "Uncategorized";
      (map[cat] ||= []).push(item);
    });
    return map;
  }, [items]);

  const term = searchTerm.trim().toLowerCase();

  const filteredItems = useMemo(
    () =>
      (items || []).filter(
        (item) => !term || item.name.toLowerCase().includes(term) || (item.itemCategory || "").toLowerCase().includes(term)
      ),
    [items, term]
  );

  const filteredCategories = useMemo(
    () =>
      Object.entries(grouped).filter(
        ([cat, catItems]) =>
          !term || cat.toLowerCase().includes(term) || catItems.some((i) => i.name.toLowerCase().includes(term))
      ),
    [grouped, term]
  );

  const openItemConfirm = (item, action) => {
    setConfirmTarget({ kind: "item", action, itemIds: [item.id], label: item.name });
  };

  const openCategoryConfirm = (cat, catItems, action) => {
    const itemIds = itemIdsToTransition(catItems, action);
    if (itemIds.length === 0) return;
    setConfirmTarget({ kind: "category", action, itemIds, label: cat });
  };

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    try {
      const fn = confirmTarget.action === "pause" ? pauseItems : confirmTarget.action === "continue" ? continueItems : softDeleteItems;
      const { failed } = await fn(confirmTarget.itemIds);
      if (failed.length > 0) {
        alert(`${failed.length} item(s) could not be updated. Please try again.`);
      }
      onChanged && onChanged();
    } catch (error) {
      console.error("Inventory status update failed:", error);
      alert("Error updating item status: " + error.message);
    } finally {
      setBusy(false);
      setConfirmTarget(null);
    }
  };

  return (
    <div className="ItemManager-wrapper">
      <div className="ItemManager-header">
        <div>
          <h3>Inventory Item Manager</h3>
          <p className="ItemManager-subtitle">
            Pause or delete items or whole categories to hide them from the live inventory. Continue brings them back exactly as they were.
          </p>
        </div>
        <div className="ItemManager-view-toggle">
          <button
            className={viewMode === "category" ? "is-active" : ""}
            onClick={() => setViewMode("category")}
          >
            <LayoutGrid size={14} /> Category View
          </button>
          <button
            className={viewMode === "item" ? "is-active" : ""}
            onClick={() => setViewMode("item")}
          >
            <List size={14} /> Item View
          </button>
        </div>
      </div>

      <input
        className="ItemManager-search"
        placeholder="Search item or category..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="ItemManager-list">
        {viewMode === "category"
          ? filteredCategories.map(([cat, catItems]) => {
              const active = catItems.filter((i) => getItemStatus(i) === "active").length;
              const paused = catItems.filter((i) => getItemStatus(i) === "paused").length;
              const deleted = catItems.filter((i) => getItemStatus(i) === "deleted").length;
              const status = categoryStatus(catItems);
              return (
                <div key={cat} className="ItemManager-row">
                  <div className="ItemManager-row-main">
                    <span className="ItemManager-row-name">{cat}</span>
                    <span className={`ItemManager-badge ItemManager-badge-${status}`}>{STATUS_LABEL[status]}</span>
                    <span className="ItemManager-row-meta">
                      {catItems.length} item(s) — {active} active · {paused} paused · {deleted} deleted
                    </span>
                  </div>
                  <div className="ItemManager-row-actions">
                    <button
                      className="ItemManager-btn ItemManager-btn-pause"
                      disabled={active === 0}
                      onClick={() => openCategoryConfirm(cat, catItems, "pause")}
                    >
                      <PauseCircle size={14} /> Pause
                    </button>
                    <button
                      className="ItemManager-btn ItemManager-btn-continue"
                      disabled={paused + deleted === 0}
                      onClick={() => openCategoryConfirm(cat, catItems, "continue")}
                    >
                      <PlayCircle size={14} /> Continue
                    </button>
                    <button
                      className="ItemManager-btn ItemManager-btn-delete"
                      disabled={active + paused === 0}
                      onClick={() => openCategoryConfirm(cat, catItems, "delete")}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              );
            })
          : filteredItems.map((item) => {
              const status = getItemStatus(item);
              return (
                <div key={item.id} className="ItemManager-row">
                  <div className="ItemManager-row-main">
                    <Package size={14} className="ItemManager-row-icon" />
                    <span className="ItemManager-row-name">{item.name}</span>
                    <span className="ItemManager-row-cat">{item.itemCategory}</span>
                    <span className="ItemManager-row-qty">{item.quantity}</span>
                    <span className={`ItemManager-badge ItemManager-badge-${status}`}>{STATUS_LABEL[status]}</span>
                  </div>
                  <div className="ItemManager-row-actions">
                    {status === "active" && (
                      <>
                        <button className="ItemManager-btn ItemManager-btn-pause" onClick={() => openItemConfirm(item, "pause")}>
                          <PauseCircle size={14} /> Pause
                        </button>
                        <button className="ItemManager-btn ItemManager-btn-delete" onClick={() => openItemConfirm(item, "delete")}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </>
                    )}
                    {status === "paused" && (
                      <>
                        <button className="ItemManager-btn ItemManager-btn-continue" onClick={() => openItemConfirm(item, "continue")}>
                          <PlayCircle size={14} /> Continue
                        </button>
                        <button className="ItemManager-btn ItemManager-btn-delete" onClick={() => openItemConfirm(item, "delete")}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </>
                    )}
                    {status === "deleted" && (
                      <button className="ItemManager-btn ItemManager-btn-continue" onClick={() => openItemConfirm(item, "continue")}>
                        <PlayCircle size={14} /> Continue
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        {(viewMode === "category" ? filteredCategories.length : filteredItems.length) === 0 && (
          <p className="ItemManager-empty">No {viewMode === "category" ? "categories" : "items"} match your search.</p>
        )}
      </div>

      {confirmTarget && (
        <div className="ItemManager-modal-overlay" onClick={() => !busy && setConfirmTarget(null)}>
          <div className="ItemManager-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="ItemManager-modal-header">
              <h3>Confirm {ACTION_LABEL[confirmTarget.action]}</h3>
              <button className="ItemManager-modal-close" onClick={() => setConfirmTarget(null)} disabled={busy}>
                <X size={20} />
              </button>
            </div>
            <div className="ItemManager-modal-body">
              <p>{confirmMessage(confirmTarget)}</p>
              <div className="ItemManager-modal-footer">
                <button className="ItemManager-btn ItemManager-btn-gray" onClick={() => setConfirmTarget(null)} disabled={busy}>
                  Cancel
                </button>
                <button
                  className={`ItemManager-btn ItemManager-btn-${confirmTarget.action}`}
                  onClick={handleConfirm}
                  disabled={busy}
                >
                  {busy ? "Working..." : ACTION_LABEL[confirmTarget.action]}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryItemManager;

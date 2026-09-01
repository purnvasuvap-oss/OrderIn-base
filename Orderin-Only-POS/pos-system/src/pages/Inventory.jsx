import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Boxes, ArrowDownCircle, ArrowUpCircle, History, Trash, AlertTriangle, PowerOff, Power } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import {
  listInventory, saveInventoryItem, deleteInventoryItem, adjustStock, listInventoryTx, inventoryStatus,
  recordWastage, isInventoryItemActive, setInventoryItemActive,
} from "../lib/repo";
import { EVENTS } from "../lib/bus";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";

const EMPTY_ITEM = { name: "", sku: "", category: "", unit: "g", stock: 0, minStock: 0, maxStock: 0, purchasePrice: 0, location: "", active: true };

export default function Inventory() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: items } = useLiveQuery(listInventory, [EVENTS.INVENTORY_CHANGED], []);
  const { data: tx } = useLiveQuery(listInventoryTx, [EVENTS.INVENTORY_CHANGED], []);

  const [tab, setTab] = useState("stock");
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [txTarget, setTxTarget] = useState(null);
  const [wastageTarget, setWastageTarget] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDiscontinued, setShowDiscontinued] = useState(false);
  const [discontinueTarget, setDiscontinueTarget] = useState(null);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items
      .filter((i) => showDiscontinued || isInventoryItemActive(i))
      .filter((i) => statusFilter === "all" || inventoryStatus(i) === statusFilter);
  }, [items, statusFilter, showDiscontinued]);

  // Discontinued items aren't being restocked on purpose, so they don't
  // belong in a "needs attention" alert — only active items count here.
  const lowStock = useMemo(
    () => (items || []).filter((i) => isInventoryItemActive(i) && ["low", "critical", "out"].includes(inventoryStatus(i))),
    [items]
  );

  const valuation = useMemo(() => (items || []).reduce((s, i) => s + i.stock * i.purchasePrice, 0), [items]);

  const save = async (item) => {
    await saveInventoryItem({
      ...item, stock: Number(item.stock) || 0, minStock: Number(item.minStock) || 0,
      maxStock: Number(item.maxStock) || 0, purchasePrice: Number(item.purchasePrice) || 0,
    }, user);
    toast.success("Inventory item saved");
    setEditing(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Inventory Management</h2>
          <p className="page-subtitle">Ingredients, stock levels, valuation ₹{valuation.toFixed(0)} and history.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY_ITEM })}><Plus size={16} /> Add item</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`pos-cat-chip ${tab === "stock" ? "active" : ""}`} onClick={() => setTab("stock")}>Stock</button>
        <button className={`pos-cat-chip ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>Transaction history</button>
      </div>

      {tab === "stock" ? (
        <>
          {lowStock.length > 0 && (
            <div className="card" style={{ padding: "12px 14px", marginBottom: 14, display: "flex", flexDirection: "column", gap: 6, background: "var(--danger-bg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--danger)", fontWeight: 600, fontSize: 13.5 }}>
                <AlertTriangle size={16} /> {lowStock.length} item{lowStock.length > 1 ? "s" : ""} at or below their threshold
              </div>
              <div style={{ fontSize: 12.5, color: "var(--danger)" }}>
                {lowStock.map((i) => `${i.name} (${i.stock} ${i.unit})`).join(" · ")}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select className="input" style={{ maxWidth: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="in_stock">In Stock</option>
              <option value="low">Low Stock</option>
              <option value="critical">Critical</option>
              <option value="out">Out of Stock</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
              <input type="checkbox" checked={showDiscontinued} onChange={(e) => setShowDiscontinued(e.target.checked)} />
              Show discontinued items
            </label>
          </div>
          <div className="table-wrap">
            {!filtered.length ? (
              <EmptyState icon={Boxes} title="No inventory items" />
            ) : (
              <table className="data-table">
                <thead><tr><th>Item</th><th>Stock</th><th>Min / Max</th><th>Unit price</th><th>Location</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filtered.map((i) => {
                    const active = isInventoryItemActive(i);
                    return (
                    <tr key={i.id} style={active ? undefined : { opacity: 0.55 }}>
                      <td data-label="Item">
                        <strong>{i.name}</strong>{!active && <span className="badge badge-neutral" style={{ marginLeft: 6, fontSize: 10 }}>Discontinued</span>}
                        <br /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{i.sku}</span>
                      </td>
                      <td data-label="Stock">{i.stock} {i.unit}</td>
                      <td data-label="Min / Max">{i.minStock} / {i.maxStock} {i.unit}</td>
                      <td data-label="Unit price">₹{i.purchasePrice}</td>
                      <td data-label="Location">{i.location || "—"}</td>
                      <td data-label="Status"><StatusBadge status={inventoryStatus(i)} /></td>
                      <td data-label="">
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" title="Stock in" onClick={() => setTxTarget({ item: i, type: "in" })}><ArrowUpCircle size={14} /></button>
                          <button className="btn btn-ghost btn-sm" title="Stock out" onClick={() => setTxTarget({ item: i, type: "out" })}><ArrowDownCircle size={14} /></button>
                          <button className="btn btn-ghost btn-sm" title="Record wastage" onClick={() => setWastageTarget(i)}><Trash size={14} /></button>
                          <button className="btn btn-ghost btn-sm" title={active ? "Discontinue" : "Reactivate"} onClick={() => setDiscontinueTarget(i)}>
                            {active ? <PowerOff size={14} /> : <Power size={14} />}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(i)}><Pencil size={14} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(i)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <div className="table-wrap">
          {!tx?.length ? (
            <EmptyState icon={History} title="No transactions yet" />
          ) : (
            <table className="data-table">
              <thead><tr><th>Item</th><th>Type</th><th>Qty</th><th>Reason</th><th>By</th><th>Time</th></tr></thead>
              <tbody>
                {tx.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Item">{t.itemName}</td>
                    <td data-label="Type" style={{ textTransform: "capitalize" }}>{t.type}</td>
                    <td data-label="Qty">{t.qty} {t.unit}</td>
                    <td data-label="Reason">{t.reason}</td>
                    <td data-label="By">{t.employeeName}</td>
                    <td data-label="Time" style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(t.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <ItemModal open={!!editing} item={editing} onClose={() => setEditing(null)} onSave={save} />

      <ConfirmDialog open={!!discontinueTarget} title={discontinueTarget && isInventoryItemActive(discontinueTarget) ? "Discontinue item" : "Reactivate item"}
        danger={discontinueTarget ? isInventoryItemActive(discontinueTarget) : false}
        message={discontinueTarget && isInventoryItemActive(discontinueTarget)
          ? `Stop purchasing/restocking "${discontinueTarget?.name}"? It'll disappear from the default Stock view, but its full transaction history stays intact and it can be reactivated any time.`
          : `Bring "${discontinueTarget?.name}" back into active use?`}
        confirmLabel={discontinueTarget && isInventoryItemActive(discontinueTarget) ? "Discontinue" : "Reactivate"}
        onConfirm={async () => {
          const goingActive = !isInventoryItemActive(discontinueTarget);
          await setInventoryItemActive(discontinueTarget.id, goingActive, user);
          toast.info(goingActive ? "Item reactivated" : "Item discontinued");
          setDiscontinueTarget(null);
        }}
        onCancel={() => setDiscontinueTarget(null)} />

      <ConfirmDialog open={!!deleteTarget} title="Delete inventory item" danger
        message={`Remove "${deleteTarget?.name}" from inventory?`} confirmLabel="Delete"
        onConfirm={async () => { await deleteInventoryItem(deleteTarget.id, user); toast.info("Item deleted"); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)} />

      <StockTxModal target={txTarget} onClose={() => setTxTarget(null)} onSubmit={async (qty, reason) => {
        await adjustStock({ itemId: txTarget.item.id, type: txTarget.type, qty, reason, user });
        toast.success("Stock updated");
        setTxTarget(null);
      }} />

      <WastageModal item={wastageTarget} onClose={() => setWastageTarget(null)} onSubmit={async (qty, reason) => {
        await recordWastage({ itemId: wastageTarget.id, qty, reason, user });
        toast.info("Wastage recorded");
        setWastageTarget(null);
      }} />
    </div>
  );
}

function ItemModal({ open, item, onClose, onSave }) {
  const [form, setForm] = useState(item);
  useMemo(() => setForm(item), [item]);
  if (!form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  return (
    <Modal open={open} onClose={onClose} title={item?.id ? "Edit inventory item" : "Add inventory item"} width={480}
      footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onSave(form)}>Save item</button></>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Item name" span={2}><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="SKU"><input className="input" value={form.sku} onChange={(e) => set({ sku: e.target.value })} /></Field>
        <Field label="Category"><input className="input" value={form.category} onChange={(e) => set({ category: e.target.value })} /></Field>
        <Field label="Unit">
          <select className="input" value={form.unit} onChange={(e) => set({ unit: e.target.value })}>
            <option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option><option value="pc">pc</option>
          </select>
        </Field>
        <Field label="Current stock"><input className="input" type="number" value={form.stock} onChange={(e) => set({ stock: e.target.value })} /></Field>
        <Field label="Minimum stock"><input className="input" type="number" value={form.minStock} onChange={(e) => set({ minStock: e.target.value })} /></Field>
        <Field label="Maximum stock"><input className="input" type="number" value={form.maxStock} onChange={(e) => set({ maxStock: e.target.value })} /></Field>
        <Field label="Purchase price (₹)"><input className="input" type="number" value={form.purchasePrice} onChange={(e) => set({ purchasePrice: e.target.value })} /></Field>
        <Field label="Storage location"><input className="input" value={form.location} onChange={(e) => set({ location: e.target.value })} /></Field>
        <Field label="Expiry date"><input className="input" type="date" value={form.expiryDate || ""} onChange={(e) => set({ expiryDate: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function StockTxModal({ target, onClose, onSubmit }) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  useMemo(() => { setQty(""); setReason(""); }, [target]);
  if (!target) return null;
  return (
    <Modal open={!!target} onClose={onClose} title={`${target.type === "in" ? "Stock in" : "Stock out"}: ${target.item.name}`} width={360}
      footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!qty} onClick={() => onSubmit(Number(qty), reason || "Manual adjustment")}>Confirm</button></>}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Quantity ({target.item.unit})</label>
      <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={{ marginBottom: 10, marginTop: 4 }} />
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Reason</label>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Purchase order #204" style={{ marginTop: 4 }} />
    </Modal>
  );
}

function WastageModal({ item, onClose, onSubmit }) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("Spoiled");
  useMemo(() => { setQty(""); setReason("Spoiled"); }, [item]);
  if (!item) return null;
  return (
    <Modal open={!!item} onClose={onClose} title={`Record wastage: ${item.name}`} width={360}
      footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" disabled={!qty} onClick={() => onSubmit(Number(qty), reason)}>Record wastage</button></>}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Quantity ({item.unit})</label>
      <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={{ marginBottom: 10, marginTop: 4 }} />
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Reason</label>
      <select className="input" value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginTop: 4 }}>
        <option>Spoiled</option><option>Expired</option><option>Damaged</option><option>Preparation waste</option>
      </select>
    </Modal>
  );
}

function Field({ label, children, span }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

import { useState } from "react";
import { Plus, Pencil, Trash2, Truck } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listSuppliers, saveSupplier, deleteSupplier } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";

const EMPTY = { name: "", contact: "", phone: "", email: "", address: "", gst: "", products: "" };

export default function Suppliers() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: suppliers, reload } = useLiveQuery(listSuppliers, [EVENTS.SUPPLIERS_CHANGED], []);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const save = async (s) => {
    await saveSupplier(s, user);
    toast.success("Supplier saved");
    setEditing(null);
    reload();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Suppliers</h2>
          <p className="page-subtitle">Manage vendor details for purchasing and inventory replenishment.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}><Plus size={16} /> Add supplier</button>
      </div>

      <div className="table-wrap">
        {!suppliers?.length ? (
          <EmptyState icon={Truck} title="No suppliers yet" />
        ) : (
          <table className="data-table">
            <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>GST</th><th>Products supplied</th><th></th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td data-label="Supplier"><strong>{s.name}</strong><br /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.address}</span></td>
                  <td data-label="Contact">{s.contact}</td>
                  <td data-label="Phone">{s.phone}</td>
                  <td data-label="GST">{s.gst || "—"}</td>
                  <td data-label="Products supplied">{s.products}</td>
                  <td data-label="">
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}><Pencil size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(s)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit supplier" : "Add supplier"} width={480}
        footer={<><button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={() => save(editing)}>Save</button></>}>
        {editing && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <F label="Supplier name" span={2}><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></F>
            <F label="Contact person"><input className="input" value={editing.contact} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} /></F>
            <F label="Phone"><input className="input" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></F>
            <F label="Email"><input className="input" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></F>
            <F label="GST / Tax ID"><input className="input" value={editing.gst} onChange={(e) => setEditing({ ...editing, gst: e.target.value })} /></F>
            <F label="Address" span={2}><input className="input" value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></F>
            <F label="Products supplied" span={2}><input className="input" value={editing.products} onChange={(e) => setEditing({ ...editing, products: e.target.value })} /></F>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Delete supplier" danger message={`Remove "${deleteTarget?.name}"?`} confirmLabel="Delete"
        onConfirm={async () => { await deleteSupplier(deleteTarget.id, user); toast.info("Supplier deleted"); setDeleteTarget(null); reload(); }}
        onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}

function F({ label, children, span }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

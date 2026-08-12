import { useState } from "react";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listEmployees, saveEmployee, deleteEmployee, listOrders } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ROLE_LABELS, ROLES } from "../lib/auth";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";

const EMPTY = { empId: "", name: "", role: ROLES.CASHIER, phone: "", email: "", status: "active", joiningDate: new Date().toISOString().slice(0, 10) };

export default function Employees() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: employees, reload } = useLiveQuery(listEmployees, [EVENTS.EMPLOYEES_CHANGED], []);
  const { data: orders } = useLiveQuery(listOrders, [EVENTS.ORDERS_CHANGED], []);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const activity = (empName) => {
    const handled = (orders || []).filter((o) => o.cashierName === empName);
    return { count: handled.length, sales: handled.reduce((s, o) => s + o.total, 0) };
  };

  const save = async () => {
    await saveEmployee(editing, user);
    toast.success("Employee saved");
    setEditing(null);
    reload();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Employees</h2>
          <p className="page-subtitle">Staff records, roles and order activity.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}><Plus size={16} /> Add employee</button>
      </div>

      <div className="table-wrap">
        {!employees?.length ? (
          <EmptyState icon={Users} title="No employees yet" />
        ) : (
          <table className="data-table">
            <thead><tr><th>Employee</th><th>Role</th><th>Phone</th><th>Orders handled</th><th>Sales handled</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {employees.map((e) => {
                const a = activity(e.name);
                return (
                  <tr key={e.id}>
                    <td data-label="Employee"><strong>{e.name}</strong><br /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{e.empId}</span></td>
                    <td data-label="Role">{ROLE_LABELS[e.role]}</td>
                    <td data-label="Phone">{e.phone}</td>
                    <td data-label="Orders handled">{a.count}</td>
                    <td data-label="Sales handled">₹{a.sales.toFixed(0)}</td>
                    <td data-label="Status"><StatusBadge status={e.status} /></td>
                    <td data-label="">
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(e)}><Pencil size={14} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(e)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit employee" : "Add employee"} width={440}
        footer={<><button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
        {editing && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input className="input" placeholder="Employee ID" value={editing.empId} onChange={(e) => setEditing({ ...editing, empId: e.target.value })} />
            <input className="input" placeholder="Full name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <select className="input" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
              {Object.values(ROLES).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <select className="input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
              <option value="active">Active</option><option value="disabled">Disabled</option>
            </select>
            <input className="input" placeholder="Phone" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            <input className="input" placeholder="Email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            <input className="input" type="date" value={editing.joiningDate} onChange={(e) => setEditing({ ...editing, joiningDate: e.target.value })} />
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Remove employee" danger message={`Remove "${deleteTarget?.name}"?`} confirmLabel="Remove"
        onConfirm={async () => { await deleteEmployee(deleteTarget.id, user); toast.info("Employee removed"); setDeleteTarget(null); reload(); }}
        onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}

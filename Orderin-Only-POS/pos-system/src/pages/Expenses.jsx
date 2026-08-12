import { useMemo, useState } from "react";
import { Plus, Trash2, Receipt } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listExpenses, saveExpense, deleteExpense } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";

const CATEGORIES = ["Rent", "Electricity", "Gas", "Salaries", "Ingredients", "Packaging", "Maintenance", "Transportation", "Marketing", "Other"];
const EMPTY = { amount: "", category: "Ingredients", date: new Date().toISOString().slice(0, 10), description: "", paymentMethod: "Cash" };

export default function Expenses() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: expenses, reload } = useLiveQuery(listExpenses, [EVENTS.EXPENSES_CHANGED], []);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const total = useMemo(() => (expenses || []).reduce((s, e) => s + Number(e.amount), 0), [expenses]);

  const save = async () => {
    await saveExpense({ ...editing, amount: Number(editing.amount) || 0, date: new Date(editing.date).getTime() }, user);
    toast.success("Expense recorded");
    setEditing(null);
    reload();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Expenses</h2>
          <p className="page-subtitle">Total recorded: ₹{total.toFixed(2)}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}><Plus size={16} /> Add expense</button>
      </div>

      <div className="table-wrap">
        {!expenses?.length ? (
          <EmptyState icon={Receipt} title="No expenses recorded" />
        ) : (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Payment</th><th>Added by</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td data-label="Date">{new Date(e.date).toLocaleDateString()}</td>
                  <td data-label="Category">{e.category}</td>
                  <td data-label="Description">{e.description}</td>
                  <td data-label="Payment">{e.paymentMethod}</td>
                  <td data-label="Added by">{e.addedBy}</td>
                  <td data-label="Amount">₹{Number(e.amount).toFixed(2)}</td>
                  <td data-label=""><button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(e)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Add expense" width={420}
        footer={<><button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save expense</button></>}>
        {editing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input className="input" type="number" placeholder="Amount (₹)" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
            <select className="input" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className="input" type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
            <input className="input" placeholder="Description" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <select className="input" value={editing.paymentMethod} onChange={(e) => setEditing({ ...editing, paymentMethod: e.target.value })}>
              <option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option>
            </select>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Delete expense" danger message="Remove this expense record?" confirmLabel="Delete"
        onConfirm={async () => { await deleteExpense(deleteTarget.id, user); toast.info("Expense deleted"); setDeleteTarget(null); reload(); }}
        onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}

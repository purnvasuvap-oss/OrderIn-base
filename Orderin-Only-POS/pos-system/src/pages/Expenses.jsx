import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Receipt } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listExpenses, saveExpense, deleteExpense } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import { toLocalDateInputValue, fromLocalDateInputValue } from "../lib/dates";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";

// Same fixed categorical order used on the Dashboard's charts — reused here
// rather than re-picked, so a category reads as the same color everywhere.
const COLORS = ["#c19548", "#fab63f", "#edca8d", "#3b6ea5", "#2e8b57", "#c1442e"];

const CATEGORIES = ["Rent", "Electricity", "Gas", "Salaries", "Ingredients", "Packaging", "Maintenance", "Transportation", "Marketing", "Other"];
const EMPTY = { amount: "", category: "Ingredients", date: toLocalDateInputValue(), description: "", paymentMethod: "Cash" };

const GRANULARITIES = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
function startOfWeek(d) {
  const x = new Date(d);
  const diff = (x.getDay() + 6) % 7; // Monday-start week
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
function startOfMonth(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

// Builds `count` empty buckets ending today (so days/weeks/months with zero
// spend still show up as a real $0 bar, not a gap), then folds every expense
// into the bucket it falls in.
function buildBuckets(expenses, count, stepDays, keyOf, labelOf) {
  const buckets = [...Array(count)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (count - 1 - i) * stepDays);
    const key = keyOf(d);
    return { key, label: labelOf(new Date(key)), total: 0 };
  });
  (expenses || []).forEach((e) => {
    const key = keyOf(new Date(e.date));
    const bucket = buckets.find((b) => b.key === key);
    if (bucket) bucket.total += Number(e.amount) || 0;
  });
  return buckets;
}

export default function Expenses() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: expenses, reload } = useLiveQuery(listExpenses, [EVENTS.EXPENSES_CHANGED], []);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [granularity, setGranularity] = useState("daily");

  // Recharts' ResponsiveContainer measures its container via ResizeObserver
  // on mount; that first measurement can race the browser's own layout pass
  // right after navigation and come back zero-width, leaving a chart blank
  // until something else forces a resize. Forcing one clean remount just
  // after the initial paint (once layout has settled) reliably fixes it —
  // this is the standard workaround for that known Recharts/RO timing gap.
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    // Two rAFs, not one — the first only guarantees "before the next paint,"
    // the second guarantees that paint (and the layout it depends on) has
    // actually happened, which is what ResizeObserver needs to have settled.
    let id2;
    const id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setChartsReady(true)); });
    return () => { cancelAnimationFrame(id1); if (id2) cancelAnimationFrame(id2); };
  }, []);

  const total = useMemo(() => (expenses || []).reduce((s, e) => s + Number(e.amount), 0), [expenses]);

  const dailyData = useMemo(
    () => buildBuckets(expenses, 30, 1, startOfDay, (d) => d.toLocaleDateString([], { day: "2-digit", month: "short" })),
    [expenses]
  );
  const weeklyData = useMemo(
    () => buildBuckets(expenses, 12, 7, startOfWeek, (d) => d.toLocaleDateString([], { day: "2-digit", month: "short" })),
    [expenses]
  );
  const monthlyData = useMemo(() => {
    const months = [...Array(12)].map((_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (11 - i));
      const key = startOfMonth(d);
      return { key, label: d.toLocaleDateString([], { month: "short", year: "2-digit" }), total: 0 };
    });
    (expenses || []).forEach((e) => {
      const key = startOfMonth(new Date(e.date));
      const bucket = months.find((m) => m.key === key);
      if (bucket) bucket.total += Number(e.amount) || 0;
    });
    return months;
  }, [expenses]);

  const trendData = granularity === "daily" ? dailyData : granularity === "weekly" ? weeklyData : monthlyData;

  const categoryTotals = useMemo(() => {
    if (!expenses?.length) return [];
    const map = {};
    expenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + (Number(e.amount) || 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  const openAdd = () => setEditing({ ...EMPTY });
  const openEdit = (e) => setEditing({ ...e, amount: String(e.amount), date: toLocalDateInputValue(e.date) });

  const save = async () => {
    const isEdit = !!editing.id;
    await saveExpense({ ...editing, amount: Number(editing.amount) || 0, date: fromLocalDateInputValue(editing.date) }, user);
    toast.success(isEdit ? "Expense updated" : "Expense recorded");
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
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add expense</button>
      </div>

      {/* Both charts stay mounted unconditionally — including their very
          first render, before any expense ever exists — rather than
          appearing only once data shows up. Recharts' ResponsiveContainer
          measures its container on first mount; if that first mount happens
          later, mid-session, right as two charts appear in the same commit
          (e.g. both flip from hidden to shown together), the measurement can
          race and leave one chart blank until something else forces a
          re-layout. Mounting both at page load, with placeholder data when
          empty, means that race never has a moment to happen. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 20 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>Spend over time</h3>
              <div style={{ display: "flex", gap: 6 }}>
                {GRANULARITIES.map((g) => (
                  <button key={g.key} className={`pos-cat-chip ${granularity === g.key ? "active" : ""}`} onClick={() => setGranularity(g.key)}>{g.label}</button>
                ))}
              </div>
            </div>
            <ResponsiveContainer key={chartsReady ? "bar-ready" : "bar-loading"} width="100%" height={240}>
              <BarChart data={trendData}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                <Tooltip formatter={(v) => [`₹${Number(v).toFixed(2)}`, "Spent"]} />
                <Bar dataKey="total" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {!expenses?.length && <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--text-muted)", marginTop: -10 }}>Add an expense to see spend over time.</div>}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0, fontSize: 14 }}>By category</h3>
            <ResponsiveContainer key={chartsReady ? "pie-ready" : "pie-loading"} width="100%" height={240}>
              <PieChart>
                <Pie data={categoryTotals.length ? categoryTotals : [{ name: "No data", value: 1 }]}
                  dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={categoryTotals.length ? 3 : 0}
                  isAnimationActive={false}>
                  {(categoryTotals.length ? categoryTotals : [{ name: "No data" }]).map((_, i) => (
                    <Cell key={i} fill={categoryTotals.length ? COLORS[i % COLORS.length] : "var(--border)"} />
                  ))}
                </Pie>
                {categoryTotals.length > 0 && <Tooltip formatter={(v) => [`₹${Number(v).toFixed(2)}`, "Spent"]} />}
                {categoryTotals.length > 0 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              </PieChart>
            </ResponsiveContainer>
            {!categoryTotals.length && <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--text-muted)", marginTop: -10 }}>No categories yet.</div>}
          </div>
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
                  <td data-label="">
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}><Pencil size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(e)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit expense" : "Add expense"} width={420}
        footer={<><button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>{editing?.id ? "Save changes" : "Save expense"}</button></>}>
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

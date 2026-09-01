import { useMemo, useState } from "react";
import { Search, Printer, XCircle, RotateCcw, Eye } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listOrders, cancelOrder, refundOrder } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { printReceiptForOrder } from "../lib/printer";
import { canAccess, ROLES } from "../lib/auth";
import StatusBadge from "../components/StatusBadge";
import Modal from "../components/Modal";
import Receipt from "../components/Receipt";
import EmptyState from "../components/EmptyState";
import ConfirmDialog from "../components/ConfirmDialog";
import { ClipboardList } from "lucide-react";

const STATUS_FILTERS = ["all", "new", "preparing", "ready", "completed", "cancelled", "refunded"];
const TYPE_FILTERS = ["all", "dine-in", "takeaway", "delivery", "counter"];

export default function Orders() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: orders } = useLiveQuery(listOrders, [EVENTS.ORDERS_CHANGED], []);
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);

  const canManage = user && user.role !== ROLES.KITCHEN;

  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders
      .filter((o) => (status === "all" ? true : o.status === status))
      .filter((o) => (type === "all" ? true : o.orderType === type))
      .filter((o) => !search || o.orderNo.toLowerCase().includes(search.toLowerCase()) || o.invoiceNo.toLowerCase().includes(search.toLowerCase()));
  }, [orders, status, type, search]);

  const doCancel = async () => {
    await cancelOrder(cancelTarget.id, "Cancelled by staff", user);
    toast.info(`Order ${cancelTarget.orderNo} cancelled`);
    setCancelTarget(null);
  };
  const doRefund = async () => {
    await refundOrder(refundTarget.id, refundTarget.total, "Customer refund", user);
    toast.info(`Order ${refundTarget.orderNo} refunded`);
    setRefundTarget(null);
  };
  const doReprint = async () => {
    const res = await printReceiptForOrder(selected);
    if (res.ok) toast.success(`Reprinted via ${res.method}`);
    else toast.error(`Reprint failed: ${res.error}`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Orders</h2>
          <p className="page-subtitle">Track, filter and manage every order across your restaurant.</p>
        </div>
      </div>

      <div className="card" style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div className="pos-search" style={{ maxWidth: 260 }}>
          <Search size={15} />
          <input placeholder="Search order / invoice…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input" style={{ maxWidth: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
        </select>
        <select className="input" style={{ maxWidth: 160 }} value={type} onChange={(e) => setType(e.target.value)}>
          {TYPE_FILTERS.map((t) => <option key={t} value={t}>{t === "all" ? "All order types" : t}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        {!filtered.length ? (
          <EmptyState icon={ClipboardList} title="No orders found" subtitle="Try adjusting your filters or create a new order from POS." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th><th>Type</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Time</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td data-label="Order"><strong>{o.orderNo}</strong><br /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{o.invoiceNo}</span></td>
                  <td data-label="Type" style={{ textTransform: "capitalize" }}>{o.orderType}{o.tableNo ? ` · T${o.tableNo}` : ""}</td>
                  <td data-label="Items">{o.items.reduce((s, i) => s + i.qty, 0)} items</td>
                  <td data-label="Total">₹{o.total.toFixed(2)}</td>
                  <td data-label="Payment"><StatusBadge status={o.paymentStatus} /></td>
                  <td data-label="Status"><StatusBadge status={o.status} /></td>
                  <td data-label="Time" style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                  <td data-label="">
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelected(o)} title="View / reprint"><Eye size={14} /></button>
                      {canManage && !["cancelled", "refunded"].includes(o.status) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setCancelTarget(o)} title="Cancel"><XCircle size={14} /></button>
                      )}
                      {canManage && o.status === "completed" && o.paymentStatus !== "refunded" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setRefundTarget(o)} title="Refund"><RotateCcw size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Order details" width={340}
        footer={<button className="btn btn-outline" onClick={doReprint}><Printer size={14} /> Reprint</button>}>
        {selected && <Receipt order={selected} />}
      </Modal>

      <ConfirmDialog open={!!cancelTarget} title="Cancel order" danger
        message={`Cancel order ${cancelTarget?.orderNo}? This cannot be undone.`}
        confirmLabel="Cancel order" onConfirm={doCancel} onCancel={() => setCancelTarget(null)} />

      <ConfirmDialog open={!!refundTarget} title="Refund order"
        message={`Refund ₹${refundTarget?.total?.toFixed(2)} for order ${refundTarget?.orderNo}?`}
        confirmLabel="Confirm refund" onConfirm={doRefund} onCancel={() => setRefundTarget(null)} />
    </div>
  );
}

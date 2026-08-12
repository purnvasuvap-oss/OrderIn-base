import { useMemo, useState } from "react";
import { Printer, FileText, Search } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listOrders } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import { printReceiptForOrder } from "../lib/printer";
import { useToast } from "../context/ToastContext";
import Modal from "../components/Modal";
import Receipt from "../components/Receipt";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";

export default function Invoices() {
  const toast = useToast();
  const { data: orders } = useLiveQuery(listOrders, [EVENTS.ORDERS_CHANGED], []);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const doPrint = async () => {
    const res = await printReceiptForOrder(selected);
    if (res.ok) toast.success(`Printed via ${res.method}`);
    else toast.error(`Print failed: ${res.error}`);
  };

  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => !search || o.invoiceNo.toLowerCase().includes(search.toLowerCase()));
  }, [orders, search]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Invoices</h2>
          <p className="page-subtitle">Every generated invoice, searchable and reprintable.</p>
        </div>
      </div>

      <div className="pos-search" style={{ maxWidth: 280, marginBottom: 16 }}>
        <Search size={15} />
        <input placeholder="Search invoice number…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="table-wrap">
        {!filtered.length ? (
          <EmptyState icon={FileText} title="No invoices found" />
        ) : (
          <table className="data-table">
            <thead><tr><th>Invoice</th><th>Order</th><th>Total</th><th>Payment</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td data-label="Invoice"><strong>{o.invoiceNo}</strong></td>
                  <td data-label="Order">{o.orderNo}</td>
                  <td data-label="Total">₹{o.total.toFixed(2)}</td>
                  <td data-label="Payment"><StatusBadge status={o.paymentStatus} /></td>
                  <td data-label="Date" style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(o.createdAt).toLocaleString()}</td>
                  <td data-label=""><button className="btn btn-ghost btn-sm" onClick={() => setSelected(o)}><Printer size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Invoice" width={340}
        footer={<button className="btn btn-outline" onClick={doPrint}><Printer size={14} /> Print</button>}>
        {selected && <Receipt order={selected} />}
      </Modal>
    </div>
  );
}

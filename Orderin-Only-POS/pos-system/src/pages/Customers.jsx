import { Contact } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listCustomers } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import EmptyState from "../components/EmptyState";

export default function Customers() {
  const { data: customers } = useLiveQuery(listCustomers, [EVENTS.ORDERS_CHANGED, EVENTS.CUSTOMERS_CHANGED], []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Customers</h2>
          <p className="page-subtitle">Internal billing records only — not a customer-facing feature.</p>
        </div>
      </div>

      <div className="table-wrap">
        {!customers?.length ? (
          <EmptyState icon={Contact} title="No customer records yet" subtitle="Capture a phone number at checkout to start building history." />
        ) : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Phone</th><th>Orders</th><th>Total spent</th><th>Last order</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td data-label="Name">{c.name}</td>
                  <td data-label="Phone">{c.phone}</td>
                  <td data-label="Orders">{c.orders}</td>
                  <td data-label="Total spent">₹{c.totalSpent.toFixed(2)}</td>
                  <td data-label="Last order">{new Date(c.lastOrder).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { DEFAULT_RESTAURANT_ID } from "../config/restaurant";

const STATUS = ["free", "ordered", "eating", "bill requested", "paid"];

export default function LiveTableBar() {
  const [sessions, setSessions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [tables, setTables] = useState([]);
  const [fromTable, setFromTable] = useState("");
  const [toTable, setToTable] = useState("");
  const [discount, setDiscount] = useState({ orderId: "", percent: "", reason: "" });
  const [note, setNote] = useState("");

  useEffect(() => {
    const rid = DEFAULT_RESTAURANT_ID;
    const stops = [
      onSnapshot(collection(db, "Restaurant", rid, "tableSessions"), (snap) => {
        setSessions(snap.docs.map((row) => ({ id: row.id, ...row.data() })));
      }, () => setSessions([])),
      onSnapshot(collection(db, "Restaurant", rid, "serviceRequests"), (snap) => {
        setRequests(snap.docs.map((row) => ({ id: row.id, ...row.data() })));
      }, () => setRequests([])),
      onSnapshot(collection(db, "Restaurant", rid, "tables"), (snap) => {
        setTables(snap.docs.map((row) => ({ id: row.id, ...row.data() })));
      }, () => setTables([])),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  const statusFor = (table) => {
    const id = String(table.num || table.id);
    const openBill = requests.some((row) => String(row.table) === id && row.kind === "bill" && row.status !== "done");
    const session = sessions.find((row) => String(row.table || row.id) === id);
    if (openBill) return "bill requested";
    if (session?.status === "paid" || session?.paymentStatus === "paid") return "paid";
    if (session?.status === "served") return "eating";
    if (session?.items?.length) return "ordered";
    if (table.status === "reserved") return "free";
    return table.status === "occupied" ? "ordered" : "free";
  };

  const merge = async () => {
    const source = sessions.find((row) => String(row.table || row.id) === String(fromTable));
    if (!source) {
      setNote("That first table has no open order.");
      return;
    }
    const targetId = String(toTable);
    const target = sessions.find((row) => String(row.table || row.id) === targetId) || { items: [], total: 0 };
    await setDoc(doc(db, "Restaurant", DEFAULT_RESTAURANT_ID, "tableSessions", targetId), {
      table: targetId,
      items: [...(target.items || []), ...(source.items || [])],
      total: Number(target.total || 0) + Number(source.total || 0),
      status: "ordered",
      mergedFrom: String(fromTable),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    await setDoc(doc(db, "Restaurant", DEFAULT_RESTAURANT_ID, "tableSessions", String(fromTable)), {
      status: "paid",
      mergedInto: targetId,
      items: [],
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    await setDoc(doc(db, "Restaurant", DEFAULT_RESTAURANT_ID, "auditLogs", `merge-${Date.now()}`), {
      type: "merge-tables",
      from: String(fromTable),
      to: targetId,
      at: new Date().toISOString(),
    });
    setNote(`Table ${fromTable} is now on table ${targetId}'s bill.`);
  };

  const approveDiscount = async () => {
    const percent = Number(discount.percent);
    if (!discount.orderId || !discount.reason.trim() || !(percent > 0)) {
      setNote("Enter the order, a percent, and a reason.");
      return;
    }
    await setDoc(doc(db, "Restaurant", DEFAULT_RESTAURANT_ID, "auditLogs", `discount-${Date.now()}`), {
      type: "discount",
      orderId: discount.orderId,
      percent,
      reason: discount.reason.trim(),
      approvedBy: "manager",
      at: new Date().toISOString(),
    });
    setNote(`Discount of ${percent}% saved on order ${discount.orderId}.`);
  };

  return (
    <section style={{ margin: "12px 0", padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>Live tables</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STATUS.map((label) => <span key={label}>{label}</span>)}
      </div>
      {(tables.length ? tables : sessions).map((table) => {
        const id = String(table.num || table.table || table.id);
        const reservation = table.reservedName || table.reservedAt;
        return (
          <div key={id}>
            Table {id}: {statusFor(table)}
            {reservation ? ` · reserved ${table.reservedName || ""}` : ""}
          </div>
        );
      })}
      <div style={{ marginTop: 8 }}>
        <input placeholder="From table" value={fromTable} onChange={(event) => setFromTable(event.target.value)} />
        <input placeholder="Onto table" value={toTable} onChange={(event) => setToTable(event.target.value)} />
        <button type="button" onClick={merge}>Merge bills</button>
      </div>
      <div>
        <input placeholder="Order id" value={discount.orderId} onChange={(event) => setDiscount({ ...discount, orderId: event.target.value })} />
        <input placeholder="Percent" value={discount.percent} onChange={(event) => setDiscount({ ...discount, percent: event.target.value })} />
        <input placeholder="Reason" value={discount.reason} onChange={(event) => setDiscount({ ...discount, reason: event.target.value })} />
        <button type="button" onClick={approveDiscount}>Approve discount</button>
      </div>
      {note ? <p>{note}</p> : null}
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  applyRecipeDeduction,
  dayCloseTotals,
  escPosTicket,
  groupByStation,
  gstSplit,
  invoiceNumber,
  loyaltyStamp,
  tableTimerLabel,
  toCsv,
} from '../../../../shared/orderin-dine/logic.js';

const wrap = { padding: 16, fontFamily: 'inherit', color: 'inherit' };
const card = { border: '1px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: 12, marginBottom: 12 };

export default function FloorDesk({ db, restaurantId }) {
  const [requests, setRequests] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidId, setVoidId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!db || !restaurantId) return undefined;
    const unsub = [];
    unsub.push(onSnapshot(collection(db, 'Restaurant', restaurantId, 'serviceRequests'), (snap) => {
      setRequests(snap.docs.map((row) => ({ id: row.id, ...row.data() })));
    }, () => setRequests([])));
    unsub.push(onSnapshot(collection(db, 'Restaurant', restaurantId, 'tableSessions'), (snap) => {
      setSessions(snap.docs.map((row) => ({ id: row.id, ...row.data() })));
    }, () => setSessions([])));
    unsub.push(onSnapshot(collection(db, 'Restaurant', restaurantId, 'tables'), (snap) => {
      setTables(snap.docs.map((row) => ({ id: row.id, ...row.data() })));
    }, () => setTables([])));
    unsub.push(onSnapshot(doc(db, 'Restaurant', restaurantId), (snap) => {
      setProfile(snap.exists() ? snap.data() : null);
    }, () => setProfile(null)));
    unsub.push(onSnapshot(collection(db, 'Restaurant', restaurantId, 'customers'), (snap) => {
      const list = [];
      snap.docs.forEach((row) => {
        const data = row.data() || {};
        (data.pastOrders || []).forEach((order) => list.push({ ...order, customerPhone: row.id }));
      });
      setOrders(list);
    }, () => setOrders([])));
    return () => unsub.forEach((stop) => stop && stop());
  }, [db, restaurantId]);

  const close = dayCloseTotals(orders.filter((order) => {
    const when = Date.parse(order.paidAt || order.createdAt || '');
    if (!Number.isFinite(when)) return true;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return when >= start.getTime();
  }));

  const stations = useMemo(() => {
    const items = [];
    sessions.forEach((session) => {
      (session.items || []).forEach((item) => items.push({ ...item, table: session.table || session.id }));
    });
    return groupByStation(items);
  }, [sessions]);

  const markRequest = async (row, status) => {
    await updateDoc(doc(db, 'Restaurant', restaurantId, 'serviceRequests', row.id), { status });
  };

  const markServed = async (session) => {
    const items = (session.items || []).map((item) => ({ ...item, kitchenStatus: 'Served' }));
    await setDoc(doc(db, 'Restaurant', restaurantId, 'tableSessions', session.id), {
      ...session,
      items,
      status: 'served',
      servedAt: new Date().toISOString(),
    }, { merge: true });
  };

  const moveTable = async (session, nextTable) => {
    const table = String(nextTable || '').trim();
    if (!table) return;
    await setDoc(doc(db, 'Restaurant', restaurantId, 'tableSessions', table), {
      ...session,
      table,
      movedFrom: session.table || session.id,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    setMessage(`Table ${session.table || session.id} moved to ${table}`);
  };

  const recordVoid = async () => {
    if (!voidId || !voidReason.trim()) {
      setMessage('Enter the order id and a reason');
      return;
    }
    await addDoc(collection(db, 'Restaurant', restaurantId, 'auditLogs'), {
      type: 'void',
      orderId: voidId,
      reason: voidReason.trim(),
      createdAt: serverTimestamp(),
    });
    setMessage('Void saved in the audit log');
    setVoidReason('');
  };

  const deductForSession = async (session) => {
    const menuSnap = await getDocs(collection(db, 'Restaurant', restaurantId, 'menu'));
    const inventorySnap = await getDocs(collection(db, 'Restaurant', restaurantId, 'inventory'));
    const menu = menuSnap.docs.map((row) => ({ id: row.id, ...row.data() }));
    let inventory = inventorySnap.docs.map((row) => ({ id: row.id, ...row.data() }));
    const low = [];
    (session.items || []).forEach((item) => {
      const dish = menu.find((row) => row.name === item.name || row.id === item.id);
      if (!dish?.recipe) return;
      const result = applyRecipeDeduction(inventory, dish.recipe, item.quantity || 1);
      inventory = result.inventory;
      low.push(...result.low);
    });
    await Promise.all(inventory.map((row) => setDoc(doc(db, 'Restaurant', restaurantId, 'inventory', row.id), { stock: row.stock }, { merge: true })));
    setMessage(low.length ? `Low stock: ${low.map((row) => row.name || row.id).join(', ')}` : 'Recipe stock updated');
  };

  const exportToday = () => {
    const csv = toCsv(orders.map((order) => ({
      id: order.id,
      table: order.tableNo,
      total: order.total,
      method: order.paymentMethod || order.OnlinePayMethod || '',
      status: order.paymentStatus || '',
    })));
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'orders.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const printKot = (session) => {
    const ticket = escPosTicket({
      title: profile?.Restaurant_name || profile?.name || 'KOT',
      table: session.table || session.id,
      lines: session.items || [],
    });
    const popup = window.open('', '_blank', 'noopener,width=400,height=600');
    if (!popup) return;
    popup.document.write(`<pre>${ticket}</pre>`);
    popup.print();
  };

  const gst = gstSplit(close.total / 1.05);
  const nextInvoice = invoiceNumber((profile?.invoiceSequence || 0) + 1);

  const profiles = useMemo(() => {
    const byPhone = new Map();
    orders.forEach((order) => {
      const phone = order.customerPhone;
      if (!phone) return;
      const row = byPhone.get(phone) || { phone, visits: 0, spend: 0 };
      row.visits += 1;
      if (String(order.paymentStatus || '').toLowerCase() === 'paid') row.spend += Number(order.total) || 0;
      byPhone.set(phone, row);
    });
    return [...byPhone.values()].sort((a, b) => b.spend - a.spend).slice(0, 12);
  }, [orders]);

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 22 }}>Floor</h1><p><a href="/kitchen">Kitchen</a> · <a href="/table-management">Tables</a> · <a href="/onboarding">Setup</a> · <a href="/staff-pay">Staff pay</a></p>
      <p style={{ opacity: 0.75 }}>Calls, tables, kitchen stations, and today’s close. Invoice preview {nextInvoice}.</p>
      {message ? <p>{message}</p> : null}

      <section style={card}>
        <h2>Calls</h2>
        {requests.filter((row) => row.status !== 'done').map((row) => (
          <div key={row.id}>
            Table {row.table}: {row.kind}
            <button type="button" onClick={() => markRequest(row, 'done')}>Done</button>
          </div>
        ))}
        {!requests.filter((row) => row.status !== 'done').length ? <p>No open calls.</p> : null}
      </section>

      <section style={card}>
        <h2>Tables</h2>
        {sessions.map((session) => (
          <div key={session.id} style={{ marginBottom: 8 }}>
            <strong>Table {session.table || session.id}</strong> {session.status || 'ordered'} {tableTimerLabel(session.updatedAt || session.createdAt)}
            <button type="button" onClick={() => markServed(session)}>Mark served</button>
            <button type="button" onClick={() => moveTable(session, window.prompt('Move to table number'))}>Move</button>
            <button type="button" onClick={() => printKot(session)}>Print KOT</button>
            <button type="button" onClick={() => deductForSession(session)}>Deduct recipe</button>
          </div>
        ))}
        {tables.filter((table) => table.status === 'reserved' || table.reservedName).map((table) => (
          <div key={table.id}>Reserved {table.num || table.id} {table.reservedName || ''}</div>
        ))}
      </section>

      <section style={card}>
        <h2>Stations</h2>
        {stations.map((group) => (
          <div key={group.station}>
            <strong>{group.station}</strong>
            {group.items.map((item, index) => (
              <div key={`${item.name}-${index}`}>{item.qty || item.quantity || 1} × {item.name} · table {item.table}</div>
            ))}
          </div>
        ))}
      </section>

      <section style={card}>
        <h2>GST and day close</h2>
        <p>GSTIN {profile?.gstin || 'not set'} · FSSAI {profile?.fssai || 'not set'} · SAC {profile?.sac || '996331'}</p>
        <p>Taxable ₹{gst.taxable} · CGST ₹{gst.cgst} · SGST ₹{gst.sgst}</p>
        <p>Cash ₹{close.cash} · UPI ₹{close.upi} · Card ₹{close.card} · Other ₹{close.other} · Bills {close.count}</p>
        <button type="button" onClick={exportToday}>Download Excel (CSV)</button>
      </section>

      <section style={card}>
        <h2>Void</h2>
        <input placeholder="Order id" value={voidId} onChange={(event) => setVoidId(event.target.value)} />
        <input placeholder="Reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
        <button type="button" onClick={recordVoid}>Save void</button>
      </section>

      <section style={card}>
        <h2>Guests</h2>
        {profiles.map((row) => (
          <div key={row.phone}>{row.phone} · {row.visits} orders · ₹{Math.round(row.spend)} · points {loyaltyStamp(row.spend).points}</div>
        ))}
      </section>
    </div>
  );
}

import { db } from '../firebase';
import { DEFAULT_RESTAURANT_ID } from '../config/restaurant';

export function FloorPage() {
  return <FloorDesk db={db} restaurantId={DEFAULT_RESTAURANT_ID} />;
}

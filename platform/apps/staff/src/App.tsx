import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  can,
  dayClose,
  gstReport,
  itemWise,
  netPay,
  parseMenuCsv,
  salesSummary,
  staffPerformance,
  tableQrUrl,
  tableStatusFromOrder,
  tallyVoucherRows,
  toCsv,
  PRESETS,
} from '@orderin/core';
import type { FloorData, StaffGateway, StaffUser } from './types';

const NAV = [
  ['tables', 'Tables', 'tables.move'],
  ['kds', 'Kitchen', 'orders.status.preparing'],
  ['requests', 'Requests', 'orders.read'],
  ['reservations', 'Reservations', 'reservations'],
  ['counter', 'Counter', 'counter.view'],
  ['close', 'Day close', 'day.close'],
  ['reports', 'Reports', 'reports'],
  ['crm', 'Customers', 'crm'],
  ['onboarding', 'Setup', 'onboarding'],
  ['payroll', 'Payroll', 'payroll'],
  ['outlets', 'Outlets', 'outlets'],
] as const;

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function StaffApp({ gateway }: { gateway: StaffGateway }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [panel, setPanel] = useState('tables');
  const [restaurantId, setRestaurantId] = useState('');
  const [floor, setFloor] = useState<FloorData | null>(null);
  const [notice, setNotice] = useState('');

  async function refresh(id: string) {
    setFloor(await gateway.load(id));
  }

  useEffect(() => {
    if (user && restaurantId) refresh(restaurantId).catch((err: Error) => setError(err.message));
  }, [user, restaurantId]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const next = await gateway.login(email, password);
      setUser(next);
      setRestaurantId(next.restaurantId);
      setPanel(can(next.role, 'orders.status.preparing') && !can(next.role, 'tables.move') ? 'kds' : 'tables');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  if (!user) {
    return (
      <form className="login" onSubmit={signIn}>
        <h1>OrderIn staff</h1>
        <p>Sign in with the email your owner created. There is no demo password.</p>
        <label>Email<input aria-label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    );
  }

  const links = NAV.filter(([, , action]) => {
    if (action === 'orders.read' && user.role === 'kitchen') return false;
    return can(user.role, action);
  });

  return (
    <div className="shell">
      <nav>
        <strong>{floor?.profile?.name || 'Restaurant'}</strong>
        <span>{user.role}</span>
        {user.restaurantIds.length > 1 && (
          <select aria-label="Outlet" value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>
            {user.restaurantIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        )}
        {links.map(([id, label]) => (
          <button type="button" key={id} onClick={() => setPanel(id)}>{label}</button>
        ))}
        <button type="button" onClick={() => gateway.clock(restaurantId, 'in')}>Clock in</button>
        <button type="button" onClick={() => gateway.clock(restaurantId, 'out')}>Clock out</button>
        <button type="button" onClick={() => { gateway.logout(); setUser(null); }}>Sign out</button>
      </nav>
      <main className="main">
        {notice && <p role="status">{notice}</p>}
        {floor && panel === 'tables' && <Tables floor={floor} restaurantId={restaurantId} gateway={gateway} onChange={setNotice} />}
        {floor && panel === 'kds' && <Kitchen floor={floor} restaurantId={restaurantId} role={user.role} gateway={gateway} onChange={() => refresh(restaurantId)} />}
        {floor && panel === 'requests' && <Requests floor={floor} restaurantId={restaurantId} gateway={gateway} onChange={() => refresh(restaurantId)} />}
        {floor && panel === 'reservations' && <Reservations restaurantId={restaurantId} floor={floor} gateway={gateway} onChange={setNotice} />}
        {floor && panel === 'counter' && <Counter role={user.role} floor={floor} restaurantId={restaurantId} gateway={gateway} onChange={setNotice} />}
        {floor && panel === 'close' && <Close floor={floor} restaurantId={restaurantId} gateway={gateway} />}
        {floor && panel === 'reports' && <Reports floor={floor} />}
        {floor && panel === 'crm' && <Customers floor={floor} />}
        {panel === 'onboarding' && <Setup restaurantId={restaurantId} user={user} gateway={gateway} onChange={setNotice} />}
        {panel === 'payroll' && <Payroll restaurantId={restaurantId} role={user.role} gateway={gateway} />}
        {panel === 'outlets' && <Outlets user={user} gateway={gateway} onChange={setNotice} />}
      </main>
    </div>
  );
}

function Tables({ floor, restaurantId, gateway, onChange }: { floor: FloorData; restaurantId: string; gateway: StaffGateway; onChange: (text: string) => void }) {
  const [to, setTo] = useState('');
  return (
    <section>
      <h1>Tables</h1>
      <div className="grid">
        {floor.tables.map((table) => {
          const order = floor.orders.find((row) => row.tableId === table.id && !['paid', 'void'].includes(row.status));
          const status = order ? tableStatusFromOrder(order) : (table.status || 'free');
          const opened = order?.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000)) : 0;
          return (
            <article key={table.id} className={`card ${status}`}>
              <strong>Table {table.label || table.id}</strong>
              <div>{status}</div>
              <div>{opened} min</div>
              {order && (
                <>
                  <input aria-label={`Move ${table.id}`} value={to} onChange={(event) => setTo(event.target.value)} placeholder="New table" />
                  <button type="button" onClick={() => gateway.move(restaurantId, order.id, to).then(() => onChange(`Moved to ${to}`))}>Move</button>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Kitchen({ floor, restaurantId, role, gateway, onChange }: { floor: FloorData; restaurantId: string; role: string; gateway: StaffGateway; onChange: () => void }) {
  const lanes = useMemo(() => {
    const groups = new Map<string, any[]>();
    floor.orders.filter((order) => !['paid', 'void'].includes(order.status)).forEach((order) => {
      (order.lines || []).forEach((line: any) => {
        const station = line.station || 'kitchen';
        groups.set(station, [...(groups.get(station) || []), { ...line, orderId: order.id, tableId: order.tableId }]);
      });
    });
    return [...groups.entries()];
  }, [floor.orders]);
  return (
    <section>
      <h1>Kitchen</h1>
      {lanes.map(([station, lines]) => (
        <div key={station} className="lane">
          <h2>{station}</h2>
          {lines.map((line) => (
            <article key={`${line.orderId}-${line.key}`} className="card">
              <div>Table {line.tableId}: {line.qty} × {line.name}</div>
              <div>{line.status}</div>
              {line.status === 'placed' && can(role, 'orders.status.preparing') && (
                <button type="button" onClick={() => gateway.updateItem({ restaurantId, orderId: line.orderId, lineKey: line.key, from: 'placed', status: 'preparing' }).then(onChange)}>Start preparing</button>
              )}
              {line.status === 'preparing' && can(role, 'orders.status.served') && (
                <button type="button" onClick={() => gateway.updateItem({ restaurantId, orderId: line.orderId, lineKey: line.key, from: 'preparing', status: 'served' }).then(onChange)}>Mark served</button>
              )}
            </article>
          ))}
        </div>
      ))}
    </section>
  );
}

function Requests({ floor, restaurantId, gateway, onChange }: { floor: FloorData; restaurantId: string; gateway: StaffGateway; onChange: () => void }) {
  return (
    <section>
      <h1>Requests</h1>
      {floor.requests.filter((row) => row.status === 'open').map((row) => (
        <article key={row.id} className="card">
          <div>Table {row.tableId}: {row.type}</div>
          <button type="button" onClick={() => gateway.ack(restaurantId, row.id).then(onChange)}>Done</button>
        </article>
      ))}
    </section>
  );
}

function Reservations({ restaurantId, floor, gateway, onChange }: { restaurantId: string; floor: FloorData; gateway: StaffGateway; onChange: (text: string) => void }) {
  const [form, setForm] = useState({ tableId: '', startAt: '', endAt: '', name: '', phone: '' });
  return (
    <section>
      <h1>Reservations</h1>
      <ul>{floor.reservations.map((row) => <li key={row.id}>{row.name} · table {row.tableId} · {row.startAt}</li>)}</ul>
      {(['tableId', 'startAt', 'endAt', 'name', 'phone'] as const).map((field) => (
        <label key={field}>{field}<input aria-label={field} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>
      ))}
      <button type="button" onClick={() => gateway.reserve({ restaurantId, ...form }).then(() => onChange('Reservation saved'))}>Save reservation</button>
    </section>
  );
}

function Counter({ role, floor, restaurantId, gateway, onChange }: { role: string; floor: FloorData; restaurantId: string; gateway: StaffGateway; onChange: (text: string) => void }) {
  return (
    <section>
      <h1>Counter</h1>
      {floor.orders.filter((order) => order.status !== 'void').map((order) => (
        <article key={order.id} className="card">
          <div>Table {order.tableId} · ₹{order.total} · {order.status}</div>
          {order.invoiceNumber && <div>Invoice {order.invoiceNumber}</div>}
          <div>CGST ₹{order.cgst} · SGST ₹{order.sgst}</div>
          <button type="button" onClick={() => gateway.issueCode(restaurantId, order.id).then((code) => onChange(`Counter code ${code}`))}>Show counter code</button>
          <button type="button" onClick={() => gateway.printOrder(order, floor.profile).then(onChange)}>Print KOT</button>
          {can(role, 'discount.approve') && (
            <button type="button" onClick={() => gateway.discount(restaurantId, order.id, 10, 'Manager comp').then(() => onChange('Discount sent for approval'))}>₹10 manager discount</button>
          )}
          {can(role, 'void') && (
            <button type="button" onClick={() => {
              const reason = window.prompt('Why is this voided?') || '';
              if (reason) gateway.voidOrder(restaurantId, order.id, reason).then(() => onChange('Voided'));
            }}>Void</button>
          )}
        </article>
      ))}
    </section>
  );
}

function Close({ floor, restaurantId, gateway }: { floor: FloorData; restaurantId: string; gateway: StaffGateway }) {
  const [cash, setCash] = useState('0');
  const [result, setResult] = useState<any>(null);
  const preview = dayClose(floor.orders, { cashCounted: Number(cash) || 0 });
  return (
    <section>
      <h1>Day close</h1>
      <p>Expected cash ₹{preview.expectedCash}. UPI ₹{preview.byMethod.upi || 0}. Card ₹{preview.byMethod.card || 0}.</p>
      <label>Cash counted<input aria-label="Cash counted" value={cash} onChange={(event) => setCash(event.target.value)} /></label>
      <p>Variance ₹{preview.variance}</p>
      <button type="button" onClick={() => gateway.closeDay(restaurantId, new Date().toISOString().slice(0, 10), Number(cash) || 0).then(setResult)}>Close the day</button>
      {result && <p>Saved. Variance ₹{result.variance}</p>}
    </section>
  );
}

function Reports({ floor }: { floor: FloorData }) {
  const summary = salesSummary(floor.orders);
  const items = itemWise(floor.orders);
  const gst = gstReport(floor.orders);
  const people = staffPerformance(floor.orders);
  return (
    <section>
      <h1>Reports</h1>
      <p>Today’s sales ₹{summary.sales} from {summary.orders} bills. Peak hour {summary.peakHour ?? '—'}. Top dish {items[0]?.name || '—'}.</p>
      <ul>{people.map((row: any) => <li key={row.id}>{row.name}: ₹{row.sales}</li>)}</ul>
      <button type="button" onClick={() => download('gst.csv', toCsv(gst))}>Download GST report</button>
      <button type="button" onClick={() => download('tally.csv', toCsv(tallyVoucherRows(floor.orders)))}>Download Tally CSV</button>
    </section>
  );
}

function Customers({ floor }: { floor: FloorData }) {
  return (
    <section>
      <h1>Customers</h1>
      <p>Only people who opted in are listed.</p>
      <ul>
        {floor.customers.filter((row) => row.optIn).map((row) => (
          <li key={row.phone || row.id}>{row.name || row.phone}: {row.visitCount || 0} visits, ₹{row.spend || 0}, likes {row.favouriteDish || '—'}, {row.points || 0} points, {row.stamps || 0} stamps</li>
        ))}
      </ul>
    </section>
  );
}

function Setup({ restaurantId, user, gateway, onChange }: { restaurantId: string; user: StaffUser; gateway: StaffGateway; onChange: (text: string) => void }) {
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [fssai, setFssai] = useState('');
  const [review, setReview] = useState('');
  const [preset, setPreset] = useState('olive');
  const [cgst, setCgst] = useState('2.5');
  const [sgst, setSgst] = useState('2.5');
  const [csv, setCsv] = useState('name,price,category,diet,station,allergens,spice,priceLarge\n');
  const [tables, setTables] = useState('1,2,3,4');
  const [qr, setQr] = useState<string[]>([]);
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState('captain');
  const [staffName, setStaffName] = useState('');
  return (
    <section>
      <h1>Restaurant setup</h1>
      <p>GST rates are a starting point of 2.5% CGST and 2.5% SGST. Confirm them with your chartered accountant before you issue bills.</p>
      <label>Name<input aria-label="Restaurant name" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>GSTIN<input aria-label="GSTIN" value={gstin} onChange={(event) => setGstin(event.target.value)} /></label>
      <label>FSSAI<input aria-label="FSSAI" value={fssai} onChange={(event) => setFssai(event.target.value)} /></label>
      <label>Google review link<input aria-label="Google review link" value={review} onChange={(event) => setReview(event.target.value)} /></label>
      <label>Theme
        <select aria-label="Theme" value={preset} onChange={(event) => setPreset(event.target.value)}>
          {Object.values(PRESETS).map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
        </select>
      </label>
      <label>CGST %<input aria-label="CGST" value={cgst} onChange={(event) => setCgst(event.target.value)} /></label>
      <label>SGST %<input aria-label="SGST" value={sgst} onChange={(event) => setSgst(event.target.value)} /></label>
      <button type="button" onClick={() => gateway.saveProfile(restaurantId, {
        name, gstin, fssai, googleReviewUrl: review, theme: { preset }, cgstRate: Number(cgst), sgstRate: Number(sgst), sac: '996331',
      }).then(() => onChange('Profile saved'))}>Save profile</button>
      <label>Menu CSV (Excel: File → Save as CSV)<textarea aria-label="Menu CSV" value={csv} onChange={(event) => setCsv(event.target.value)} rows={5} /></label>
      <button type="button" onClick={() => {
        const items = parseMenuCsv(csv);
        gateway.importMenu(restaurantId, csv).then((count) => onChange(`Imported ${count || items.length} dishes`));
      }}>Import menu</button>
      <label>Table numbers<input aria-label="Tables" value={tables} onChange={(event) => setTables(event.target.value)} /></label>
      <button type="button" onClick={() => {
        const ids = tables.split(',').map((item) => item.trim()).filter(Boolean);
        gateway.saveTables(restaurantId, ids).then((links) => setQr(links.length ? links : ids.map((id) => tableQrUrl({
          origin: import.meta.env.VITE_CUSTOMER_ORIGIN || window.location.origin,
          restaurantId,
          tableId: id,
        }))));
      }}>Make table QR codes</button>
      <ul>{qr.map((link) => <li key={link}><a href={link}>{link}</a></li>)}</ul>
      <h2>Staff login</h2>
      <label>Name<input aria-label="Staff name" value={staffName} onChange={(event) => setStaffName(event.target.value)} /></label>
      <label>Email<input aria-label="Staff email" value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} /></label>
      <label>Temporary password<input aria-label="Staff password" type="password" value={staffPassword} onChange={(event) => setStaffPassword(event.target.value)} /></label>
      <label>Role
        <select aria-label="Staff role" value={staffRole} onChange={(event) => setStaffRole(event.target.value)}>
          {['manager', 'captain', 'cashier', 'kitchen'].filter((role) => user.role === 'owner' || role !== 'manager').map((role) => <option key={role}>{role}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => gateway.createStaff({
        restaurantId, email: staffEmail, password: staffPassword, role: staffRole, name: staffName,
      }).then(() => onChange('Staff login created in Firebase Auth. The password is not saved in the database.'))}>Create staff login</button>
    </section>
  );
}

function Payroll({ restaurantId, role, gateway }: { restaurantId: string; role: string; gateway: StaffGateway }) {
  const [agreed, setAgreed] = useState('10000');
  const [tax, setTax] = useState('0');
  const [deductions, setDeductions] = useState('0');
  const [message, setMessage] = useState('');
  function preview() {
    try {
      const pay = netPay({ agreed: Number(agreed), tax: Number(tax), deductions: Number(deductions), allowNegative: false });
      setMessage(`Net ₹${pay.net}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not calculate pay');
    }
  }
  return (
    <section>
      <h1>Payroll</h1>
      <label>Agreed pay<input aria-label="Agreed pay" value={agreed} onChange={(event) => setAgreed(event.target.value)} /></label>
      <label>Tax<input aria-label="Tax" value={tax} onChange={(event) => setTax(event.target.value)} /></label>
      <label>Deductions<input aria-label="Deductions" value={deductions} onChange={(event) => setDeductions(event.target.value)} /></label>
      <button type="button" onClick={preview}>Preview net</button>
      {message && <p className={message.includes('below zero') ? 'error' : ''}>{message}</p>}
      <button type="button" onClick={() => gateway.payroll(restaurantId, [{ agreed: Number(agreed), tax: Number(tax), deductions: Number(deductions) }], role === 'owner').then(() => setMessage('Payroll finalised')).catch((error: Error) => setMessage(error.message))}>Finalise</button>
    </section>
  );
}

function Outlets({ user, gateway, onChange }: { user: StaffUser; gateway: StaffGateway; onChange: (text: string) => void }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  return (
    <section>
      <h1>Outlets</h1>
      <p>Signed in as {user.email}. Outlets: {user.restaurantIds.join(', ') || user.restaurantId}</p>
      <label>New outlet id<input aria-label="Outlet id" value={id} onChange={(event) => setId(event.target.value)} /></label>
      <label>Name<input aria-label="Outlet name" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button type="button" onClick={() => gateway.addOutlet({ restaurantId: id, name }).then((ids) => onChange(`Outlets: ${ids.join(', ')}`))}>Add outlet</button>
    </section>
  );
}

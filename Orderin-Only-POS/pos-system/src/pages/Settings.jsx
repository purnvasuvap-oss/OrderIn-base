import { useEffect, useState } from "react";
import { Printer, Save, CheckCircle2, XCircle, Usb, Bluetooth, Wifi, KeyRound, Bell } from "lucide-react";
import { getSettings, saveSettings } from "../lib/repo";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { ROLE_LABELS, ROLES } from "../lib/auth";
import {
  connectSerial, connectBluetooth, disconnectPrinter, getConnectionInfo,
  isSerialSupported, isBluetoothSupported, printJob, listPrintJobs,
} from "../lib/printer";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { EVENTS, on } from "../lib/bus";
import SyncPanel from "../components/SyncPanel";
import {
  notifySupported, permission as notifyPermission, requestPermission,
  getPrefs as getNotifyPrefs, setPrefs as setNotifyPrefs,
  sendTestNotification, NOTIFY_CATEGORIES,
} from "../lib/notifications";

// Restaurant-wide configuration (billing, printer, sync, etc.) stays
// Admin-only — everyone else gets just "My Account" to change their own
// password, which is the only reason non-admin roles can reach this page
// at all now (see ROLE_ACCESS in lib/auth.js).
const ADMIN_ONLY_TABS = ["Restaurant", "Billing", "Printer", "Order", "Sync"];
// "Notifications" is per-device (browser permission + local prefs), so every
// role gets it — kitchen staff want new-order/delay popups too.
const TABS = ["My Account", ...ADMIN_ONLY_TABS, "Notifications"];

// Currency choices for the billing currency field. Value is the symbol that
// gets stored / printed on receipts; label spells out the currency + code.
// Symbols are shared across many countries (e.g. "$", "kr", "₨"), so this is
// deduplicated by symbol rather than one row per country.
const CURRENCY_SYMBOLS = [
  { value: "₹", label: "₹ — Indian Rupee (INR)" },
  { value: "$", label: "$ — Dollar (USD / CAD / AUD / NZD / SGD / HKD / MXN …)" },
  { value: "€", label: "€ — Euro (EUR)" },
  { value: "£", label: "£ — Pound Sterling (GBP)" },
  { value: "¥", label: "¥ — Yen / Yuan (JPY / CNY)" },
  { value: "₩", label: "₩ — Won (KRW / KPW)" },
  { value: "₽", label: "₽ — Russian Ruble (RUB)" },
  { value: "₺", label: "₺ — Turkish Lira (TRY)" },
  { value: "₴", label: "₴ — Ukrainian Hryvnia (UAH)" },
  { value: "₪", label: "₪ — Israeli New Shekel (ILS)" },
  { value: "₫", label: "₫ — Vietnamese Dong (VND)" },
  { value: "₱", label: "₱ — Philippine Peso (PHP)" },
  { value: "฿", label: "฿ — Thai Baht (THB)" },
  { value: "₨", label: "₨ — Rupee (PKR / LKR / NPR / MUR)" },
  { value: "৳", label: "৳ — Bangladeshi Taka (BDT)" },
  { value: "₦", label: "₦ — Nigerian Naira (NGN)" },
  { value: "₵", label: "₵ — Ghanaian Cedi (GHS)" },
  { value: "R", label: "R — South African Rand (ZAR)" },
  { value: "R$", label: "R$ — Brazilian Real (BRL)" },
  { value: "kr", label: "kr — Krona / Krone (SEK / NOK / DKK / ISK)" },
  { value: "zł", label: "zł — Polish Złoty (PLN)" },
  { value: "Kč", label: "Kč — Czech Koruna (CZK)" },
  { value: "Ft", label: "Ft — Hungarian Forint (HUF)" },
  { value: "лв", label: "лв — Bulgarian Lev (BGN)" },
  { value: "CHF", label: "CHF — Swiss Franc (CHF)" },
  { value: "﷼", label: "﷼ — Riyal / Rial (SAR / QAR / IRR / YER / OMR)" },
  { value: "د.إ", label: "د.إ — UAE Dirham (AED)" },
  { value: "د.ك", label: "د.ك — Kuwaiti Dinar (KWD)" },
  { value: "ج.م", label: "ج.م — Egyptian Pound (EGP)" },
  { value: "RM", label: "RM — Malaysian Ringgit (MYR)" },
  { value: "Rp", label: "Rp — Indonesian Rupiah (IDR)" },
  { value: "₮", label: "₮ — Mongolian Tögrög (MNT)" },
  { value: "₸", label: "₸ — Kazakhstani Tenge (KZT)" },
  { value: "₾", label: "₾ — Georgian Lari (GEL)" },
  { value: "₡", label: "₡ — Costa Rican Colón (CRC)" },
  { value: "₲", label: "₲ — Paraguayan Guaraní (PYG)" },
  { value: "S/", label: "S/ — Peruvian Sol (PEN)" },
  { value: "₼", label: "₼ — Azerbaijani Manat (AZN)" },
  { value: "₭", label: "₭ — Lao Kip (LAK)" },
  { value: "៛", label: "៛ — Cambodian Riel (KHR)" },
];

const SAMPLE_ORDER = {
  id: "sample", orderNo: "ORD-TEST", invoiceNo: "INV-TEST", orderType: "counter", tableNo: null,
  createdAt: Date.now(), cashierName: "Test Print",
  items: [{ name: "Sample Item", price: 100, qty: 1, notes: "" }],
  subtotal: 100, discount: 0, tax: 5, total: 105, payments: [{ method: "Cash", amount: 105 }],
};

export default function Settings() {
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const { online, firebaseEnabled, lastSyncAt } = useOnlineStatus();
  const isAdmin = user?.role === ROLES.ADMIN;
  const visibleTabs = isAdmin ? TABS : ["My Account", "Notifications"];
  const [tab, setTab] = useState(isAdmin ? "Restaurant" : "My Account");
  const [restaurant, setRestaurant] = useState(null);
  const [billing, setBilling] = useState(null);
  const [printer, setPrinter] = useState(null);
  const [order, setOrder] = useState(null);
  const [conn, setConn] = useState(getConnectionInfo());
  const [connecting, setConnecting] = useState(false);
  const { data: printJobs } = useLiveQuery(listPrintJobs, [EVENTS.PRINT_JOBS_CHANGED], []);

  useEffect(() => {
    // Restaurant/Billing/Printer/Order settings each fetch once here rather
    // than through useLiveQuery (one hook, one loader — these are 4
    // independent docs sharing a single change event), so without this
    // listener this page would only ever show whatever was true at the
    // moment it mounted — stale the instant someone changes a setting from
    // another device, or Firestore pulls in a change, while this tab stays open.
    const reload = () => {
      getSettings("restaurant").then(setRestaurant);
      getSettings("billing").then(setBilling);
      getSettings("printer").then(setPrinter);
      getSettings("order").then(setOrder);
    };
    reload();
    return on(EVENTS.SETTINGS_CHANGED, reload);
  }, []);

  const save = async (id, value, setter) => {
    const saved = await saveSettings(id, value, user);
    setter(saved);
    toast.success("Settings saved");
  };

  const doConnect = async (type) => {
    setConnecting(true);
    try {
      const info = type === "serial" ? await connectSerial() : await connectBluetooth();
      setConn(info);
      await save("printer", { ...printer, connectionType: type }, setPrinter);
      toast.success(`Connected to ${info.name}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const doDisconnect = () => {
    disconnectPrinter();
    setConn(null);
    toast.info("Printer disconnected");
  };

  const testPrint = async () => {
    const res = await printJob("receipt", SAMPLE_ORDER, { restaurant, billing, paperWidth: printer?.paperWidth });
    if (res.ok) toast.success(`Test print sent via ${res.method}`);
    else toast.error(`Test print failed: ${res.error}`);
  };

  const recentFailures = (printJobs || []).filter((j) => j.status === "failed").slice(0, 5);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="page-subtitle">Restaurant, billing, printer, order and sync configuration.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {visibleTabs.map((t) => (
          <button key={t} className={`pos-cat-chip ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 20, maxWidth: tab === "Sync" ? 760 : 560 }}>
        {tab === "My Account" && <ChangePasswordForm user={user} changePassword={changePassword} />}
        {tab === "Notifications" && <NotificationSettings toast={toast} />}
        {isAdmin && <>
        {tab === "Restaurant" && restaurant && (
          <SettingsForm value={restaurant} onSave={(v) => save("restaurant", v, setRestaurant)} fields={[
            ["name", "Restaurant name"], ["address", "Address"], ["phone", "Phone"], ["email", "Email"], ["gstin", "GSTIN"],
          ]} />
        )}
        {tab === "Billing" && billing && (
          <SettingsForm value={billing} onSave={(v) => save("billing", v, setBilling)} fields={[
            ["invoicePrefix", "Invoice prefix"], ["orderPrefix", "Order prefix"], ["defaultTax", "Default tax (%)"],
            ["currency", "Currency symbol", { options: CURRENCY_SYMBOLS }], ["footerMessage", "Receipt footer message"],
          ]} />
        )}
        {tab === "Printer" && printer && (
          <>
            <SettingsForm value={printer} onSave={(v) => save("printer", v, setPrinter)} fields={[
              ["paperWidth", "Paper width (58mm / 80mm)"],
              ["printCopies", "Print copies"],
            ]} />

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <strong style={{ fontSize: 13.5 }}>Hardware connection</strong>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
                Connect a USB/serial or Bluetooth thermal printer for direct ESC/POS printing. Network printers
                and unconnected devices fall back to your browser's print dialog.
              </p>

              {conn ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, padding: 12, background: "var(--success-bg)", borderRadius: 8 }}>
                  <CheckCircle2 size={16} color="var(--success)" />
                  <span style={{ fontSize: 13, color: "var(--success)", flex: 1 }}>Connected: {conn.name} ({conn.type})</span>
                  <button className="btn btn-ghost btn-sm" onClick={doDisconnect}>Disconnect</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, padding: 12, background: "var(--warning-bg)", borderRadius: 8 }}>
                  <XCircle size={16} color="var(--warning)" />
                  <span style={{ fontSize: 13, color: "var(--warning)" }}>No hardware printer connected — printing uses the browser dialog</span>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button className="btn btn-outline" disabled={connecting || !isSerialSupported()} onClick={() => doConnect("serial")}>
                  <Usb size={15} /> {isSerialSupported() ? "Connect USB / Serial" : "USB not supported here"}
                </button>
                <button className="btn btn-outline" disabled={connecting || !isBluetoothSupported()} onClick={() => doConnect("bluetooth")}>
                  <Bluetooth size={15} /> {isBluetoothSupported() ? "Connect Bluetooth" : "Bluetooth not supported here"}
                </button>
                <button className="btn btn-outline" disabled title="Network printers require a local print-agent; browser dialog is used instead">
                  <Wifi size={15} /> Network (via browser)
                </button>
              </div>

              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={testPrint}><Printer size={15} /> Test print</button>

              {recentFailures.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--danger)", marginBottom: 6 }}>Recent failed print jobs</div>
                  {recentFailures.map((j) => (
                    <div key={j.id} style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                      {j.kind} · {j.target} · {new Date(j.createdAt).toLocaleTimeString()} — {j.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {tab === "Order" && order && (
          <SettingsForm value={order} onSave={(v) => save("order", v, setOrder)} fields={[
            ["avgPrepTimeAlertMin", "Kitchen delay alert threshold (min)"],
          ]} />
        )}
        {tab === "Sync" && <SyncPanel online={online} firebaseEnabled={firebaseEnabled} lastSyncAt={lastSyncAt} />}
        </>}
      </div>
    </div>
  );
}

// Self-service password change. For an accessControl-sourced login (the
// normal case — see AuthContext.changePassword) this updates the actual
// Firestore login doc, not just a local copy, so it takes effect everywhere
// immediately — including whatever an employee was assigned as their
// starting password (their employee ID) when they were first added.
function ChangePasswordForm({ user, changePassword }) {
  const toast = useToast();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!next) return toast.error("Enter a new password.");
    if (next !== confirm) return toast.error("Passwords don't match.");
    setSaving(true);
    try {
      await changePassword(user.id, next);
      setNext("");
      setConfirm("");
      toast.success("Password updated.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320 }}>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
        Signed in as <strong>{user?.name}</strong> — {ROLE_LABELS[user?.role]}
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>New password</label>
        <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" />
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Confirm new password</label>
        <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" />
      </div>
      <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={saving} onClick={submit}>
        <KeyRound size={15} /> Update password
      </button>
    </div>
  );
}

// Per-device notification controls. Browser permission and the "which screen
// pops a toast" choice are inherently device-local, so prefs live in
// localStorage (see lib/notifications.js), not the synced settings doc.
function NotificationSettings({ toast }) {
  const supported = notifySupported();
  const [perm, setPerm] = useState(notifyPermission());
  const [prefs, setPrefs] = useState(getNotifyPrefs());

  const update = (patch) => setPrefs(setNotifyPrefs(patch));

  const enable = async () => {
    const result = await requestPermission();
    setPerm(result);
    if (result === "granted") toast.success("Browser notifications enabled");
    else if (result === "denied") toast.error("Notifications blocked — enable them in your browser's site settings");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 420 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Bell size={16} />
        <strong style={{ fontSize: 14 }}>Browser notifications</strong>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
        Pop up alerts for new orders, kitchen delays, low stock and print failures — on this
        device, while the POS is open in a tab (a background tab is fine). Works on desktop and
        Android Chrome; on iPhone only when added to the home screen.
      </p>

      {!supported ? (
        <div style={{ fontSize: 13, color: "var(--warning)" }}>This browser doesn't support notifications.</div>
      ) : perm === "granted" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--success)" }}>
          <CheckCircle2 size={15} /> Enabled on this device
        </div>
      ) : perm === "denied" ? (
        <div style={{ fontSize: 13, color: "var(--danger)" }}>
          Blocked. Re-enable it in your browser's site settings (padlock icon → Notifications → Allow), then reload.
        </div>
      ) : (
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={enable}>
          <Bell size={15} /> Enable browser notifications
        </button>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={prefs.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        All notifications
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 22, opacity: prefs.enabled ? 1 : 0.5 }}>
        {NOTIFY_CATEGORIES.map((c) => (
          <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              disabled={!prefs.enabled}
              checked={prefs[c.key] !== false}
              onChange={(e) => update({ [c.key]: e.target.checked })}
            />
            {c.label}
          </label>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            disabled={!prefs.enabled}
            checked={prefs.sound !== false}
            onChange={(e) => update({ sound: e.target.checked })}
          />
          Play a sound
        </label>
      </div>

      <button
        className="btn btn-outline btn-sm"
        style={{ alignSelf: "flex-start" }}
        disabled={perm !== "granted"}
        onClick={() => { if (!sendTestNotification()) toast.info("Enable notifications first"); }}
      >
        Send test notification
      </button>
    </div>
  );
}

function SettingsForm({ value, onSave, fields }) {
  const [form, setForm] = useState(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {fields.map(([key, label, opts]) => (
        <div key={key}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{label}</label>
          {opts?.options ? (
            <select className="input" value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
              {opts.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input className="input" value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
          )}
        </div>
      ))}
      <button className="btn btn-primary" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => onSave(form)}>
        <Save size={15} /> Save changes
      </button>
    </div>
  );
}

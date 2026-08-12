import { useEffect, useState } from "react";
import { Printer, Save, CheckCircle2, XCircle, Usb, Bluetooth, Wifi } from "lucide-react";
import { getSettings, saveSettings } from "../lib/repo";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import {
  connectSerial, connectBluetooth, disconnectPrinter, getConnectionInfo,
  isSerialSupported, isBluetoothSupported, printJob, listPrintJobs,
} from "../lib/printer";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { EVENTS } from "../lib/bus";
import SyncPanel from "../components/SyncPanel";

const TABS = ["Restaurant", "Billing", "Printer", "Order", "Sync"];

const SAMPLE_ORDER = {
  id: "sample", orderNo: "ORD-TEST", invoiceNo: "INV-TEST", orderType: "counter", tableNo: null,
  createdAt: Date.now(), cashierName: "Test Print",
  items: [{ name: "Sample Item", price: 100, qty: 1, notes: "" }],
  subtotal: 100, discount: 0, tax: 5, total: 105, payments: [{ method: "Cash", amount: 105 }],
};

export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const { online, firebaseEnabled, lastSyncAt } = useOnlineStatus();
  const [tab, setTab] = useState("Restaurant");
  const [restaurant, setRestaurant] = useState(null);
  const [billing, setBilling] = useState(null);
  const [printer, setPrinter] = useState(null);
  const [order, setOrder] = useState(null);
  const [conn, setConn] = useState(getConnectionInfo());
  const [connecting, setConnecting] = useState(false);
  const { data: printJobs } = useLiveQuery(listPrintJobs, [EVENTS.PRINT_JOBS_CHANGED], []);

  useEffect(() => {
    getSettings("restaurant").then(setRestaurant);
    getSettings("billing").then(setBilling);
    getSettings("printer").then(setPrinter);
    getSettings("order").then(setOrder);
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
        {TABS.map((t) => (
          <button key={t} className={`pos-cat-chip ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 20, maxWidth: tab === "Sync" ? 760 : 560 }}>
        {tab === "Restaurant" && restaurant && (
          <SettingsForm value={restaurant} onSave={(v) => save("restaurant", v, setRestaurant)} fields={[
            ["name", "Restaurant name"], ["address", "Address"], ["phone", "Phone"], ["email", "Email"], ["gstin", "GSTIN"],
          ]} />
        )}
        {tab === "Billing" && billing && (
          <SettingsForm value={billing} onSave={(v) => save("billing", v, setBilling)} fields={[
            ["invoicePrefix", "Invoice prefix"], ["orderPrefix", "Order prefix"], ["defaultTax", "Default tax (%)"],
            ["currency", "Currency symbol"], ["footerMessage", "Receipt footer message"],
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
      </div>
    </div>
  );
}

function SettingsForm({ value, onSave, fields }) {
  const [form, setForm] = useState(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {fields.map(([key, label]) => (
        <div key={key}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{label}</label>
          <input className="input" value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        </div>
      ))}
      <button className="btn btn-primary" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => onSave(form)}>
        <Save size={15} /> Save changes
      </button>
    </div>
  );
}

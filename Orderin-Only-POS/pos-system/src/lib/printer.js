import { STORES, putOne, getAll, genId, getOne } from "./db";
import { emit, EVENTS } from "./bus";

// --- ESC/POS byte builder -------------------------------------------------
const ESC = 0x1b, GS = 0x1d;

class EscPosBuilder {
  constructor(width = 48) {
    this.width = width;
    this.bytes = [];
    this.bytes.push(ESC, 0x40); // initialize
  }
  bold(on) { this.bytes.push(ESC, 0x45, on ? 1 : 0); return this; }
  align(a) { this.bytes.push(ESC, 0x61, { left: 0, center: 1, right: 2 }[a] ?? 0); return this; }
  big(on) { this.bytes.push(GS, 0x21, on ? 0x11 : 0x00); return this; }
  raw(str) { this.bytes.push(...Array.from(new TextEncoder().encode(str))); return this; }
  line(str = "") { return this.raw(str + "\n"); }
  divider(ch = "-") { return this.line(ch.repeat(this.width)); }
  row(left, right) {
    left = String(left); right = String(right);
    const space = Math.max(1, this.width - left.length - right.length);
    return this.line(left + " ".repeat(space) + right);
  }
  feed(n = 3) { for (let i = 0; i < n; i++) this.bytes.push(0x0a); return this; }
  cut() { this.bytes.push(GS, 0x56, 0x00); return this; }
  build() { return new Uint8Array(this.bytes); }
}

function paperWidthCols(paperWidth) {
  return paperWidth === "58mm" ? 32 : 48;
}

export function buildReceiptBytes(order, { restaurant, billing, paperWidth = "80mm" } = {}) {
  const w = paperWidthCols(paperWidth);
  const b = new EscPosBuilder(w);
  b.align("center").bold(true).big(true).line(restaurant?.name || "Restaurant").big(false).bold(false);
  if (restaurant?.address) b.line(restaurant.address);
  if (restaurant?.phone) b.line(restaurant.phone);
  if (restaurant?.gstin) b.line(`GSTIN: ${restaurant.gstin}`);
  b.align("left").divider();
  b.row("Invoice", order.invoiceNo);
  b.row("Order", order.orderNo);
  b.line(new Date(order.createdAt).toLocaleString());
  b.row("Type", `${order.orderType}${order.tableNo ? ` T${order.tableNo}` : ""}`);
  b.row("Cashier", order.cashierName || "");
  b.divider();
  order.items.forEach((it) => {
    b.row(`${it.name} x${it.qty}`, `Rs${(it.price * it.qty).toFixed(2)}`);
    if (it.notes) b.line(`  Note: ${it.notes}`);
  });
  b.divider();
  b.row("Subtotal", `Rs${order.subtotal.toFixed(2)}`);
  b.row("Discount", `-Rs${order.discount.toFixed(2)}`);
  b.row("Tax", `Rs${order.tax.toFixed(2)}`);
  b.divider();
  b.bold(true).big(true).row("TOTAL", `Rs${order.total.toFixed(2)}`).big(false).bold(false);
  b.row("Payment", (order.payments || []).map((p) => p.method).join(" + ") || "-");
  b.divider();
  b.align("center").line(billing?.footerMessage || "Thank you!");
  b.feed(4).cut();
  return b.build();
}

export function buildKitchenTicketBytes(order, { paperWidth = "80mm" } = {}) {
  const w = paperWidthCols(paperWidth);
  const b = new EscPosBuilder(w);
  b.align("center").bold(true).big(true).line(order.orderNo).big(false).bold(false);
  b.line(`${order.orderType}${order.tableNo ? ` · Table ${order.tableNo}` : ""}`);
  b.align("left").divider();
  b.bold(true);
  order.items.forEach((it) => {
    b.line(`${it.qty}x  ${it.name}`);
    if (it.notes) b.line(`     "${it.notes}"`);
  });
  b.bold(false);
  if (order.notes) { b.divider(); b.line(`Note: ${order.notes}`); }
  b.divider();
  b.line(new Date(order.createdAt).toLocaleTimeString());
  b.feed(4).cut();
  return b.build();
}

// --- Connection manager ----------------------------------------------------
// Browser hardware printing is inherently limited: Web Serial covers most
// USB/RS-232 thermal printers, Web Bluetooth covers BLE printers that expose
// a writable characteristic, and network (LAN/WiFi) printers cannot be
// reached directly from a browser (no raw TCP sockets) — those fall back to
// the OS print dialog via window.print(), same as when nothing is connected.

let serialPort = null;
let bleDevice = null;
let bleWriteChar = null;
let connectionInfo = null; // { type: 'serial'|'bluetooth', name }

const BLE_PRINTER_CANDIDATES = [
  { service: 0x18f0, char: 0x2af1 },
  { service: "49535343-fe7d-4ae5-8fa9-9fafd205e455", char: "49535343-8841-43f4-a8d4-ecbe34729bb3" },
  { service: "000018f0-0000-1000-8000-00805f9b34fb", char: "00002af1-0000-1000-8000-00805f9b34fb" },
];

export function isSerialSupported() { return typeof navigator !== "undefined" && "serial" in navigator; }
export function isBluetoothSupported() { return typeof navigator !== "undefined" && "bluetooth" in navigator; }

export function getConnectionInfo() { return connectionInfo; }

export async function tryAutoReconnectSerial() {
  if (!isSerialSupported()) return null;
  try {
    const ports = await navigator.serial.getPorts();
    if (!ports.length) return null;
    const port = ports[0];
    await port.open({ baudRate: 9600 });
    serialPort = port;
    connectionInfo = { type: "serial", name: "USB / Serial printer" };
    emit(EVENTS.PRINTER_STATUS_CHANGED, {});
    return connectionInfo;
  } catch {
    return null;
  }
}

export async function connectSerial() {
  if (!isSerialSupported()) throw new Error("Web Serial isn't supported in this browser. Use Chrome or Edge on desktop.");
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 9600 });
  serialPort = port;
  connectionInfo = { type: "serial", name: "USB / Serial printer" };
  emit(EVENTS.SYNC_STATUS_CHANGED, {});
  return connectionInfo;
}

export async function connectBluetooth() {
  if (!isBluetoothSupported()) throw new Error("Web Bluetooth isn't supported in this browser. Use Chrome or Edge on desktop/Android.");
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: BLE_PRINTER_CANDIDATES.map((c) => c.service),
  });
  const server = await device.gatt.connect();
  let writeChar = null;
  for (const candidate of BLE_PRINTER_CANDIDATES) {
    try {
      const service = await server.getPrimaryService(candidate.service);
      writeChar = await service.getCharacteristic(candidate.char);
      break;
    } catch {
      // try next candidate
    }
  }
  if (!writeChar) {
    device.gatt.disconnect();
    throw new Error(`Connected to "${device.name || "device"}" but couldn't find a known printer write characteristic. This model may need a vendor-specific driver.`);
  }
  bleDevice = device;
  bleWriteChar = writeChar;
  connectionInfo = { type: "bluetooth", name: device.name || "Bluetooth printer" };
  emit(EVENTS.PRINTER_STATUS_CHANGED, {});
  device.addEventListener("gattserverdisconnected", () => {
    bleDevice = null; bleWriteChar = null; connectionInfo = null;
    emit(EVENTS.PRINTER_STATUS_CHANGED, {});
  });
  return connectionInfo;
}

export function disconnectPrinter() {
  if (serialPort) { serialPort.close().catch(() => {}); serialPort = null; }
  if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect();
  bleDevice = null; bleWriteChar = null; connectionInfo = null;
  emit(EVENTS.PRINTER_STATUS_CHANGED, {});
}

async function writeBytes(bytes) {
  if (connectionInfo?.type === "serial" && serialPort) {
    const writer = serialPort.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
    return true;
  }
  if (connectionInfo?.type === "bluetooth" && bleWriteChar) {
    const chunkSize = 180; // BLE MTU-safe chunking
    for (let i = 0; i < bytes.length; i += chunkSize) {
      await bleWriteChar.writeValueWithoutResponse(bytes.slice(i, i + chunkSize));
    }
    return true;
  }
  return false;
}

// --- High-level print + job tracking ---------------------------------------
async function recordJob({ kind, target, method, status, error }) {
  const job = {
    id: genId("prn"), kind, target, method, status, error: error || null, createdAt: Date.now(),
  };
  await putOne(STORES.printJobs, job);
  emit(EVENTS.PRINT_JOBS_CHANGED);
  return job;
}

export async function listPrintJobs() {
  return (await getAll(STORES.printJobs)).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Print a receipt or kitchen ticket. Uses the connected hardware printer
 * (Web Serial / Web Bluetooth) when available, otherwise falls back to the
 * browser print dialog via window.print() against the #print-receipt node.
 */
export async function printJob(kind, order, opts) {
  const target = order.orderNo || order.invoiceNo || order.id;
  try {
    const bytes = kind === "kitchen" ? buildKitchenTicketBytes(order, opts) : buildReceiptBytes(order, opts);
    const wroteToHardware = await writeBytes(bytes);
    if (wroteToHardware) {
      await recordJob({ kind, target, method: connectionInfo.type, status: "success" });
      return { ok: true, method: connectionInfo.type };
    }
    window.print();
    await recordJob({ kind, target, method: "browser", status: "success" });
    return { ok: true, method: "browser" };
  } catch (err) {
    await recordJob({ kind, target, method: connectionInfo?.type || "browser", status: "failed", error: String(err?.message || err) });
    return { ok: false, error: String(err?.message || err) };
  }
}

/** Convenience wrapper that pulls restaurant/billing/printer settings itself. */
export async function printReceiptForOrder(order) {
  const [restaurant, billing, printer] = await Promise.all([
    getOne(STORES.settings, "restaurant"),
    getOne(STORES.settings, "billing"),
    getOne(STORES.settings, "printer"),
  ]);
  return printJob("receipt", order, { restaurant, billing, paperWidth: printer?.paperWidth });
}

export async function printKitchenTicketForOrder(order) {
  const printer = await getOne(STORES.settings, "printer");
  return printJob("kitchen", order, { paperWidth: printer?.paperWidth });
}

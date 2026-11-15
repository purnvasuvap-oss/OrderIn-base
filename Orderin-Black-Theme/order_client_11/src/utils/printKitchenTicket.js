// Shared by Orders.jsx and KitchenDisplay.jsx — opens a small popup window
// containing just the ticket, then triggers the browser print dialog on it.
// A plain window.open + print() (rather than @media print on the whole app)
// keeps this independent of either page's own layout/CSS.

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatTicketTime = (timestamp) => {
  try {
    const date =
      timestamp && typeof timestamp.toDate === "function"
        ? timestamp.toDate()
        : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

export const printKitchenTicket = (order) => {
  if (!order) return;

  const win = window.open("", "_blank", "width=380,height=640");
  if (!win) {
    // Popup blocked — nothing else we can do without a print library.
    console.warn("printKitchenTicket: popup blocked, could not open ticket window.");
    return;
  }

  const orderTypeLine =
    order.orderType && order.orderType !== "Dine-in"
      ? order.orderType
      : `Table ${order.tableNumber ?? order.tableNo ?? "-"}`;

  const itemsHtml = Array.isArray(order.items)
    ? order.items
        .map(
          (it) => `
            <div class="kot-item">
              <div class="kot-item-line">
                <span class="kot-qty">${escapeHtml(it.quantity || 1)}x</span>
                <span class="kot-name">${escapeHtml(it.name)}</span>
              </div>
              ${it.instructions ? `<div class="kot-instructions">${escapeHtml(it.instructions)}</div>` : ""}
            </div>`,
        )
        .join("")
    : "";

  win.document.write(`
    <html>
      <head>
        <title>KOT ${escapeHtml(order.id)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
            padding: 16px;
            color: #111;
            max-width: 340px;
            margin: 0 auto;
          }
          h1 {
            font-size: 16px;
            text-align: center;
            margin: 0 0 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .kot-id { text-align: center; font-weight: 700; font-size: 14px; }
          .kot-meta { text-align: center; font-size: 12px; color: #444; margin-top: 2px; }
          hr { border: none; border-top: 1px dashed #999; margin: 12px 0; }
          .kot-item { margin-bottom: 10px; }
          .kot-item-line { display: flex; gap: 8px; font-size: 15px; font-weight: 600; }
          .kot-qty { min-width: 28px; }
          .kot-instructions { font-size: 12px; font-style: italic; color: #444; margin-left: 36px; }
          .kot-footer { text-align: center; font-size: 11px; color: #777; margin-top: 16px; }
        </style>
      </head>
      <body>
        <h1>Kitchen Order Ticket</h1>
        <div class="kot-id">${escapeHtml(order.id)}</div>
        <div class="kot-meta">${escapeHtml(orderTypeLine)}</div>
        <div class="kot-meta">${escapeHtml(formatTicketTime(order.timestamp))}</div>
        <hr />
        ${itemsHtml}
        <hr />
        <div class="kot-footer">${escapeHtml((order.items || []).reduce((n, it) => n + (Number(it.quantity) || 1), 0))} item(s)</div>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();

  // Give the popup a tick to lay out before invoking print, and close it
  // automatically once the print dialog is dismissed so tickets don't pile
  // up as open tabs.
  win.onload = () => {
    win.print();
  };
  win.onafterprint = () => win.close();
};

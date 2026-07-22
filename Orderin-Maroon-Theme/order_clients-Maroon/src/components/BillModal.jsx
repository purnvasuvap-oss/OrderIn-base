import React from 'react';
import './BillModal.css';

const formatCurrency = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

const toDisplayDate = (ts) => {
  try {
    const d = ts && ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return String(ts || '');
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } catch (e) {
    return String(ts || '');
  }
};

export default function BillModal({ order, open, onClose }) {
  if (!open) return null;

  const ord = order || {};
  const items = Array.isArray(ord.itemDetails) && ord.itemDetails.length ? ord.itemDetails : (Array.isArray(ord.items) ? ord.items : []);
  const subtotal = ord.subtotal ?? ord.paidAmount ?? items.reduce((s, it) => s + (Number(it.total ?? (it.price && it.quantity ? (Number(it.price) * Number(it.quantity)) : 0)) || 0), 0);
  const tax = ord.tax ?? 0;
  const total = ord.totalCost ?? ord.total ?? subtotal + tax;

  const transactionId = ord.verificationCode || ord.transactionId || ord.txn || (`TX-${ord.id || Date.now()}`);

  const downloadBill = async () => {
    try {
      const el = document.getElementById('bill-modal-content');
      if (!el) return;

      const getHtml2Pdf = () => new Promise((resolve, reject) => {
        if (typeof window !== 'undefined' && window.html2pdf) return resolve(window.html2pdf);
        // inject CDN script
        const existing = document.querySelector('script[data-html2pdf]');
        if (existing) {
          existing.addEventListener('load', () => resolve(window.html2pdf));
          existing.addEventListener('error', () => reject(new Error('Failed to load html2pdf')));
          return;
        }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.3/html2pdf.bundle.min.js';
        s.async = true;
        s.setAttribute('data-html2pdf', '1');
        s.onload = () => {
          if (window.html2pdf) resolve(window.html2pdf);
          else reject(new Error('html2pdf loaded but global not found'));
        };
        s.onerror = () => reject(new Error('Failed to load html2pdf script'));
        document.head.appendChild(s);
      });

      const html2pdf = await getHtml2Pdf();
      const opt = {
        margin: 0.2,
        filename: `receipt-${transactionId}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
      };
      html2pdf().set(opt).from(el).save();
    } catch (e) {
      console.error('PDF generation failed:', e);
      alert('PDF generation failed. Please run `npm install html2pdf.js` or allow loading from CDN.');
    }
  };

  const printReceipt = () => {
    const el = document.getElementById('bill-modal-content');
    if (!el) return;
    const w = window.open('', '_blank', 'toolbar=0,location=0,menubar=0');
    if (!w) { alert('Popup blocked. Allow popups to print.'); return; }
    const css = document.getElementById('bill-modal-styles')?.innerText || '';
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>${css}</style></head><body>${el.outerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  return (
    <div className="bill-modal-overlay">
      <div className="bill-modal">
        <style id="bill-modal-styles">
      {`.receipt { width: 320px; max-width: 88vw; margin: 20px auto; font-family: 'Courier New', Courier, monospace; color: #111; background: #fff; padding: 14px 18px; }
      .receipt .business { text-align: center; font-weight: 700; font-size: 18px; letter-spacing: 1px; }
      .receipt .address { text-align: center; font-size: 12px; margin-top: 6px; color: #333 }
      .receipt .dotted { border-top: 2px dotted #444; margin: 10px 0; }
      .receipt .items { font-size: 13px; margin-top: 6px; }
      .receipt .item-row { display: flex; justify-content: space-between; gap: 8px; }
      .receipt .item-name { flex: 1 1 auto; }
      .receipt .item-price { width: 70px; text-align: right; }
      .receipt .summary { margin-top: 8px; font-size: 13px; }
      .receipt .summary .row { display:flex; justify-content:space-between; margin:4px 0; }
      .receipt .total { font-weight: 700; font-size: 16px; margin-top: 6px; display:flex; justify-content:space-between }
      .receipt .paid-by { margin-top: 8px; display:flex; justify-content:space-between; font-size:13px }
      .receipt .meta { font-size:11px; color:#333; margin-top:10px }
      .receipt .thankyou { text-align:center; font-weight:700; margin-top:12px }
      `}
        </style>

        <div id="bill-modal-content" className="receipt">
          <div className="business">BUSINESS NAME</div>
          <div className="address small">1234 Main Street<br/>Suite 567<br/>City Name, State 54321<br/>123-456-7890</div>
          <div className="dotted" />

          <div className="items">
            {items.map((it, i) => {
              // support multiple item shapes
              const name = (it && (it.name || it.title || it.itemName)) || String(it || `Item ${i+1}`);
              const qty = Number(it && (it.quantity ?? it.qty ?? it.count)) || 1;
              const unitPriceCandidate = it && (it.price ?? it.priceValue ?? it.priceText ?? it.amount ?? it.cost) || 0;
              const unitPrice = Number(String(unitPriceCandidate).replace(/[^0-9.-]+/g, '')) || 0;
              const itemTotal = Number(it && (it.total ?? (unitPrice * qty))) || (unitPrice * qty);
              return (
                <div key={i} className="item-row">
                  <div className="item-name">{qty}x {name}</div>
                  <div className="item-price" style={{ textAlign: 'right', fontSize: 12 }}>
                    <div>₹{formatCurrency(unitPrice)} × {qty}</div>
                    <div style={{ fontWeight: 700 }}>₹{formatCurrency(itemTotal)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dotted" />

          <div className="summary">
            <div className="row"><span>Sub Total</span><span>₹{formatCurrency(subtotal)}</span></div>
            <div className="row"><span>Sales Tax</span><span>₹{formatCurrency(tax)}</span></div>
            <div className="total"><span>TOTAL</span><span>₹{formatCurrency(total)}</span></div>
          </div>

          <div className="dotted" />

          <div className="paid-by"><span>Paid By:</span><span>{ord.paymentType || ord.paymentMethod || ord.payment || 'Unknown'}</span></div>

          <div className="meta small">
            <div>{toDisplayDate(ord.timestamp || ord.time || ord.createdAt)}</div>
            <div>Transaction ID: {transactionId}</div>
            <div>Order ID: {ord.id}</div>
          </div>

          <div className="dotted" />
          <div className="thankyou">Thank You For Supporting Local Business!</div>
        </div>

        <div className="bill-modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn" onClick={printReceipt}>Print</button>
          <button className="btn btn-primary" onClick={downloadBill}>Download</button>
        </div>
      </div>
    </div>
  );
}

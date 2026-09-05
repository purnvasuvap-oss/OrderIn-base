import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "./context/CartContext";
import { useTableNumber } from "./hooks/useTableNumber";
// html2pdf.js (and its jsPDF/html2canvas dependencies, ~250KB+ gzipped) is
// loaded on demand in downloadBill() below, not imported here — it was
// previously a static import, which meant every visitor downloaded the PDF
// library on page load even though it's only needed if they tap "Download".
import { X, Star } from "lucide-react";
import "./Bill.css";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { db } from "./firebaseConfig";
import { parseOrderTimestamp } from "./utils/orderDateTime";
import { calculateBilling } from "./utils/billing";
import { parsePriceValue } from "./utils/pricing";

function Bill() {
  const navigate = useNavigate();
  const { orderHistory } = useCart();
  const { getPathWithTable } = useTableNumber();
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [restaurantName, setRestaurantName] = useState("Our Restaurant");
  const [restaurantAddress, setRestaurantAddress] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "Restaurant", "orderin_restaurant_3"));
        if (alive && snap.exists()) {
          const data = snap.data();
          if (data.name) setRestaurantName(data.name);
          if (data.address) setRestaurantAddress(data.address);
        }
      } catch (e) {
        /* keep defaults */
      }
    })();
    return () => { alive = false; };
  }, []);


  // Resolve order data: the real order lives in Firestore (Cart.jsx's
  // checkout writes straight there and never touches CartContext's
  // orderHistory, so that state is always empty in the live app — it can
  // only be used as an offline/legacy fallback, never the primary source).
  const [order, setOrder] = useState(null);
  const [orderLoading, setOrderLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const resolveOrder = async () => {
      const pendingFromSession = sessionStorage.getItem('pendingOrderId');
      const pendingFromLocal = localStorage.getItem('orderin_countercode_orderId') || localStorage.getItem('orderin_orderId');
      const orderId = pendingFromSession || pendingFromLocal || null;

      try {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        if (user && user.phone) {
          const customerRef = doc(db, "Restaurant", "orderin_restaurant_3", "customers", user.phone);
          const snap = await getDoc(customerRef);
          if (snap.exists()) {
            const pastOrders = Array.isArray(snap.data().pastOrders) ? snap.data().pastOrders : [];
            let found = orderId ? pastOrders.find(o => String(o.id) === String(orderId)) : null;
            if (!found) {
              // No (or stale) pending id — fall back to the most recently
              // paid/manual order, same source PaymentSuccess.jsx already uses.
              found = pastOrders
                .filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'manual')
                .sort((a, b) => parseOrderTimestamp(b) - parseOrderTimestamp(a))[0] || null;
            }
            if (found) {
              if (alive) { setOrder(found); setOrderLoading(false); }
              return;
            }
          }
        }
      } catch (e) {
        console.warn('Bill: Firestore order lookup failed', e);
      }

      // Offline/legacy fallback: local orderHistory (rarely populated, kept for
      // safety). This key may have been written by an older/different version
      // of the app, so only accept entries that actually look like an order
      // (an items array) rather than trusting whatever shape is stored.
      const looksLikeOrder = (o) => o && typeof o === 'object' && Array.isArray(o.items);
      try {
        let history = Array.isArray(orderHistory) ? orderHistory.filter(looksLikeOrder) : [];
        if (!history.length) {
          const storedHistory = JSON.parse(localStorage.getItem('orderHistory') || '[]');
          history = Array.isArray(storedHistory) ? storedHistory.filter(looksLikeOrder) : [];
        }
        let found = null;
        if (orderId && history.length) found = history.find(o => String(o.id) === String(orderId));
        if (!found && history.length) found = history[history.length - 1];
        if (alive) { setOrder(found || null); setOrderLoading(false); }
      } catch (e) {
        console.warn('Bill: resolveOrder fallback error', e);
        if (alive) { setOrder(null); setOrderLoading(false); }
      }
    };

    resolveOrder();
    return () => { alive = false; };
  }, [orderHistory]);

  if (orderLoading) {
    return (
      <div className="bill-container">
        <div className="bill-empty">
          <h2>Preparing your receipt…</h2>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="bill-container">
        <div className="bill-empty">
          <h2>Receipt Not Available</h2>
          <p>We could not find a completed order for this receipt.</p>
          <button className="btn btn-primary" onClick={() => navigate(getPathWithTable('/menu'))}>Back to Menu</button>
        </div>
      </div>
    );
  }

  const id = order.id || localStorage.getItem('orderin_countercode_orderId') || localStorage.getItem('orderin_orderId') || 'unknown-order';
  const tableNo = order.tableNo || localStorage.getItem('tableNumber') || 1;
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = order.subtotal ?? order.sub_total ?? order.subtotalAmount ?? null;
  const taxes = order.taxes ?? order.tax ?? order.taxesAmount ?? '0.00';
  const total = order.total ?? order.amount ?? order.totalAmount ?? '0.00';
  const paymentMethod = order.paymentMethod || order.payment || 'Cash';
  const orderDate = parseOrderTimestamp(order);
  // parseOrderTimestamp silently falls back to "now" when an order has no
  // usable timestamp field at all — fine for sorting, but showing today's
  // date on a receipt for an order that isn't actually from today would be
  // actively misleading, so detect that case and say so instead.
  const hasRealTimestamp = Boolean(
    order.createdAt || order.createdAtMs || order.timestamp || order.time || order.paidAt || order.deliveredAt
  );

  // Ensure numeric parsing and compute subtotal from items if missing
  const parsedTaxes = parseFloat(taxes);
  const parsedTotal = parseFloat(total) || 0;
  const computedSubtotal = items.reduce((acc, it) => {
    const unit = parseFloat(it.price) || 0;
    const qty = parseInt(it.quantity ?? it.qty ?? 1, 10) || 1;
    return acc + unit * qty;
  }, 0);
  const safeSubtotal = subtotal != null ? (parseFloat(subtotal) || computedSubtotal) : computedSubtotal;
  const computedBilling = calculateBilling(safeSubtotal, paymentMethod);
  const safeTaxes = (parsedTaxes || parsedTaxes === 0) ? parsedTaxes : computedBilling.taxes;
  const safeTotal = parsedTotal || computedBilling.total;

  // Transaction ID: persist a unique transaction id per order in localStorage map so it's stable forever
  const getOrCreateTransactionId = (orderId, method) => {
    try {
      const key = 'orderin_txns';
      const raw = localStorage.getItem(key);
      const map = raw ? JSON.parse(raw) : {};
      if (map && map[orderId]) return map[orderId];
      // create new id - prefer crypto.randomUUID when available
      const prefix = (method || 'TX').toString().toUpperCase().replace(/\s+/g, '')
        .replace(/[^A-Z0-9]/g, '') || 'TX';
      let uid = null;
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        uid = crypto.randomUUID();
      } else {
        uid = Date.now().toString(36) + Math.floor(Math.random() * 900000 + 100000).toString(36);
      }
      const txn = `${prefix}-${uid}`;
      map[orderId] = txn;
      try {
        localStorage.setItem(key, JSON.stringify(map));
      } catch (e) {
        console.warn('Could not persist transaction map', e);
      }
      return txn;
    } catch (e) {
      console.warn('getOrCreateTransactionId failed', e);
      return `${(paymentMethod||'TX').toUpperCase().replace(/\s+/g,'')}-${Date.now()}`;
    }
  };

  const transactionId = order.transactionId || getOrCreateTransactionId(id, paymentMethod);

  const handleBackClick = () => {
    setShowFeedback(true);
  };

  const submitFeedback = () => {
    // Save feedback to Firestore under customer's document
    (async () => {
      let errorOccurred = false;
      try {
        setFeedbackError('');
        setSavingFeedback(true);
        const user = JSON.parse(localStorage.getItem('user'));
        if (!user || !user.phone) {
          const msg = 'No logged-in user (missing phone). Please log in to save feedback.';
          console.warn('submitFeedback:', msg);
          setFeedbackError(msg);
          errorOccurred = true;
          return;
        }

        const phone = user.phone;
        const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_3', 'customers', phone);
        console.log('Bill.submitFeedback: user=', user, 'saving to', customerRef.path);
        const entry = { stars: rating, text: feedback || '', createdAt: new Date().toISOString() };

        try {
          const snap = await getDoc(customerRef);
          if (snap.exists()) {
            try {
              await updateDoc(customerRef, { feedback: arrayUnion(entry), updatedAt: serverTimestamp() });
              console.log('Bill: updated feedback for', phone, entry);
            } catch (uErr) {
              console.warn('Bill: updateDoc failed, falling back to setDoc merge', uErr);
              await setDoc(customerRef, { feedback: arrayUnion(entry), updatedAt: serverTimestamp() }, { merge: true });
              console.log('Bill: setDoc merge saved feedback for', phone);
            }
          } else {
            await setDoc(customerRef, { feedback: [entry], createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
            console.log('Bill: created customer doc and saved feedback for', phone);
          }
        } catch (errInner) {
          console.error('Bill: error saving feedback to Firestore', errInner);
          setFeedbackError(String(errInner?.message || errInner));
          errorOccurred = true;
        }
      } catch (err) {
        console.error('Error saving feedback:', err);
        setFeedbackError(String(err?.message || err));
        errorOccurred = true;
      } finally {
        setSavingFeedback(false);
        if (errorOccurred) {
          // keep modal open so user can try again
          return;
        }
        navigate(getPathWithTable('/menu'));
      }
    })();
  };

  const downloadBill = async () => {
    const element = document.getElementById("bill-content");
    if (!element) return;
    // Clone element and remove action buttons so they don't appear in PDF
    const clone = element.cloneNode(true);
    const actions = clone.querySelector('.actions');
    if (actions) actions.remove();

    // Create a temporary container for html2pdf
    const temp = document.createElement('div');
    temp.style.position = 'fixed';
    temp.style.left = '-10000px';
    temp.appendChild(clone);
    document.body.appendChild(temp);

    // Capture at the receipt's own rendered width/height so html2pdf builds a
    // page sized to the receipt instead of stretching its capture container to
    // a full A4 page and stranding the (much narrower) receipt in blank space.
    const receiptEl = clone.querySelector('.receipt') || clone;
    const pxPerIn = 96;
    const receiptWidthPx = receiptEl.offsetWidth || 320;
    const receiptHeightPx = receiptEl.offsetHeight || 500;
    const marginIn = 0.2;
    const pageWidthIn = receiptWidthPx / pxPerIn + marginIn * 2;
    const pageHeightIn = receiptHeightPx / pxPerIn + marginIn * 2;

    const opt = {
      margin: marginIn,
      filename: `receipt-${transactionId}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, width: receiptWidthPx, windowWidth: receiptWidthPx },
      jsPDF: { unit: "in", format: [pageWidthIn, pageHeightIn], orientation: "portrait" },
      pagebreak: { mode: ["css"] },
    };

    const { default: html2pdf } = await import("html2pdf.js");

    html2pdf().set(opt).from(clone).save().then(() => {
      // cleanup
      document.body.removeChild(temp);
    }).catch((e) => {
      console.error('Error generating PDF', e);
      document.body.removeChild(temp);
    });
  };

  // Reads the live, currently-applied stylesheets instead of a hand-copied CSS
  // string, so the print window always matches Bill.css exactly (no drift).
  const getDocumentStylesText = () => {
    let css = '';
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (const rule of rules) {
          css += rule.cssText + '\n';
        }
      } catch (e) {
        // Cross-origin stylesheet (e.g. an @import'd web font) - can't be read, skip it.
      }
    }
    return css;
  };

  const printReceipt = () => {
    const content = document.getElementById('bill-content');
    if (!content) return;
    // Clone and remove actions so buttons aren't printed
    const clone = content.cloneNode(true);
    const actions = clone.querySelector('.actions');
    if (actions) actions.remove();

    const css = `<style>${getDocumentStylesText()}</style>`;
    const newWin = window.open('', '_blank', 'toolbar=0,location=0,menubar=0');
    if (!newWin) {
      alert('Popup blocked. Allow popups for this site to print the bill.');
      return;
    }
    newWin.document.open();
    newWin.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title>${css}</head><body>${clone.outerHTML}</body></html>`);
    newWin.document.close();
    setTimeout(() => {
      newWin.focus();
      newWin.print();
    }, 300);
  };

  return (
    <div className="bill-container">
      <div className="bill-card" id="bill-content">
        <div className="receipt">
          <div className="business">{restaurantName}</div>
          {restaurantAddress && <div className="address small">{restaurantAddress}</div>}
          <div className="dotted" />

          <div className="items">
            {items.length > 0 ? items.map((item, idx) => {
              const unit = item.effectivePrice ?? parsePriceValue(item.price);
              const qty = parseInt(item.quantity ?? item.qty ?? 1, 10) || 1;
              const lineTotal = (unit * qty).toFixed(2);
              return (
                <div key={idx} className="item-row">
                  <div className="item-name">
                    {item.name}
                    {Array.isArray(item.customizations) && item.customizations.length > 0 && (
                      <div className="item-customizations">
                        {item.customizations.map((c, cIdx) => (
                          <span key={cIdx}>{c.label}: {c.option} (+₹{c.price})</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="item-qty">{qty} x ₹{unit.toFixed(2)}</div>
                  <div className="item-price">₹{lineTotal}</div>
                </div>
              );
            }) : (
              <div className="item-row item-row-empty">
                <div className="item-name">No items recorded</div>
              </div>
            )}
          </div>

          <div className="dotted" />

          <div className="summary">
            <div className="row"><span>Sub Total</span><span>₹{safeSubtotal.toFixed(2)}</span></div>
            <div className="row"><span>Additional Charges</span><span>₹{safeTaxes.toFixed(2)}</span></div>
            <div className="total"><span>TOTAL</span><span>₹{safeTotal.toFixed(2)}</span></div>
          </div>

          <div className="dotted" />

          <div className="paid-by"><span>Paid By:</span><span>{paymentMethod}</span></div>

          <div className="meta small">
            <div>{hasRealTimestamp ? `${orderDate.toLocaleDateString()} ${orderDate.toLocaleTimeString()}` : "Date unavailable"}</div>
            <div>Transaction ID: {transactionId}</div>
            <div>Order ID: {id}</div>
          </div>

          <div className="dotted" />
          <div className="thankyou">Thank You For Supporting Local Business!</div>

          <div className="actions">
            <button className="btn" onClick={() => navigate(getPathWithTable('/menu'))}>Done</button>
            <button className="btn" onClick={printReceipt}>Print</button>
            <button className="btn btn-primary" onClick={downloadBill}>Download</button>
          </div>
        </div>
      </div>

      {showFeedback && (
        <div className="feedback-modal">
          <div className="feedback-card">
            <h3>Rate Your Experience</h3>
            <div className="stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  size={32}
                  fill={rating >= star ? "#00a693" : "none"}
                  stroke="#00a693"
                  onClick={() => setRating(star)}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </div>
            <textarea
              placeholder="Tell us what you think..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
            />
            {feedbackError && (
              <p style={{ color: 'crimson', fontSize: '13px', marginTop: '8px' }}>{feedbackError}</p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="submit-feedback-btn" onClick={submitFeedback} disabled={savingFeedback}>
                {savingFeedback ? 'Saving...' : 'Submit Feedback'}
              </button>
              <button
                className="submit-feedback-btn"
                onClick={() => { setShowFeedback(false); navigate(getPathWithTable('/menu')); }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
     
    </div>
  );
}

export default Bill;

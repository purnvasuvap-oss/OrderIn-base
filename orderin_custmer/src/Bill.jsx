import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "./context/CartContext";
import { useTableNumber } from "./hooks/useTableNumber";
import html2pdf from "html2pdf.js";
import { X, Star } from "lucide-react";
import "./Bill.css";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { db } from "./firebaseConfig";

function Bill() {
  const navigate = useNavigate();
  const { orderHistory } = useCart();
  const { getPathWithTable } = useTableNumber();
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');


  // Resolve order data dynamically: prefer pending order id, then orderHistory last item, then fallback
  const resolveOrder = () => {
    try {
      const pendingFromSession = sessionStorage.getItem('pendingOrderId');
      const pendingFromLocal = localStorage.getItem('orderin_countercode_orderId') || localStorage.getItem('orderin_orderId');
      const orderId = pendingFromSession || pendingFromLocal || null;

      let found = null;
      if (orderId && Array.isArray(orderHistory)) {
        found = orderHistory.find(o => String(o.id) === String(orderId));
      }
      if (!found && Array.isArray(orderHistory) && orderHistory.length) {
        found = orderHistory[orderHistory.length - 1];
      }

      if (found) return found;

      // fallback minimal order
      return {
        id: `local-${Date.now()}`,
        tableNo: localStorage.getItem('tableNumber') || 1,
        items: [{ name: 'Sample Item', price: '0.00' }],
        subtotal: '0.00',
        taxes: '0.00',
        total: '0.00',
        paymentMethod: 'Cash',
        createdAt: new Date().toISOString(),
      };
    } catch (e) {
      console.warn('resolveOrder error', e);
      return {
        id: `local-${Date.now()}`,
        tableNo: localStorage.getItem('tableNumber') || 1,
        items: [{ name: 'Sample Item', price: '0.00' }],
        subtotal: '0.00',
        taxes: '0.00',
        total: '0.00',
        paymentMethod: 'Cash',
        createdAt: new Date().toISOString(),
      };
    }
  };

  const order = resolveOrder();
  const id = order.id;
  const tableNo = order.tableNo || localStorage.getItem('tableNumber') || 1;
  const items = Array.isArray(order.items) && order.items.length ? order.items : [{ name: 'Sample Item', price: '0.00', quantity: 1 }];
  const subtotal = order.subtotal ?? order.sub_total ?? order.subtotalAmount ?? null;
  const taxes = order.taxes ?? order.tax ?? order.taxesAmount ?? '0.00';
  const total = order.total ?? order.amount ?? order.totalAmount ?? '0.00';
  const paymentMethod = order.paymentMethod || order.payment || 'Cash';
  const time = order.createdAt || order.time || new Date().toISOString();

  // Ensure numeric parsing and compute subtotal from items if missing
  const parsedTaxes = parseFloat(taxes);
  const parsedTotal = parseFloat(total) || 0;
  const computedSubtotal = items.reduce((acc, it) => {
    const unit = parseFloat(it.price) || 0;
    const qty = parseInt(it.quantity ?? it.qty ?? 1, 10) || 1;
    return acc + unit * qty;
  }, 0);
  const safeSubtotal = subtotal != null ? (parseFloat(subtotal) || computedSubtotal) : computedSubtotal;
  // Tax policy: ₹1 for every ₹100 (minimum ₹1 for amounts up to ₹100)
  const computedTax = Math.max(1, Math.ceil(safeSubtotal / 100));
  const safeTaxes = (parsedTaxes || parsedTaxes === 0) ? parsedTaxes : computedTax;
  const safeTotal = parsedTotal || (safeSubtotal + safeTaxes);

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
        const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_1', 'customers', phone);
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

  const downloadBill = () => {
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

    const opt = {
      margin: 0.2,
      filename: `receipt-${transactionId}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
    };

    html2pdf().set(opt).from(clone).save().then(() => {
      // cleanup
      document.body.removeChild(temp);
    }).catch((e) => {
      console.error('Error generating PDF', e);
      document.body.removeChild(temp);
    });
  };

  const printReceipt = () => {
    const content = document.getElementById('bill-content');
    if (!content) return;
    // Clone and remove actions so buttons aren't printed
    const clone = content.cloneNode(true);
    const actions = clone.querySelector('.actions');
    if (actions) actions.remove();

    const styles = document.getElementById('bill-styles') ? document.getElementById('bill-styles').innerText : '';
    const css = `<style>${styles}</style>`;
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
      <div id="bill-styles" style={{display: 'none'}}>
{`.receipt { width: 320px; max-width: 88vw; margin: 20px auto; font-family: 'Courier New', Courier, monospace; color: #111; background: #fff; padding: 14px 18px; }
.receipt .business { text-align: center; font-weight: 700; font-size: 18px; letter-spacing: 1px; }
.receipt .address { text-align: center; font-size: 12px; margin-top: 6px; color: #333 }
.receipt .dotted { border-top: 2px dotted #444; margin: 10px 0; }
.receipt .items { font-size: 13px; margin-top: 6px; }
.receipt .item-row { display: flex; justify-content: space-between; gap: 8px; }
.receipt .item-name { flex: 1 1 auto; }
.receipt .item-price { width: 70px; text-align: right; }
.receipt .leaders { flex: 0 1 8px; text-align: center; color: #666 }
.receipt .summary { margin-top: 8px; font-size: 13px; }
.receipt .summary .row { display:flex; justify-content:space-between; margin:4px 0; }
.receipt .total { font-weight: 700; font-size: 16px; margin-top: 6px; display:flex; justify-content:space-between }
.receipt .paid-by { margin-top: 8px; display:flex; justify-content:space-between; font-size:13px }
.receipt .meta { font-size:11px; color:#333; margin-top:10px }
.receipt .thankyou { text-align:center; font-weight:700; margin-top:12px }
.receipt .small { font-size:11px }
.receipt .actions { display:flex; gap:8px; margin-top:12px }
.receipt .btn { flex:1; padding:8px 10px; border-radius:6px; border:1px solid #111; background:transparent; cursor:pointer; font-weight:600 }
.receipt .btn-primary { background:#111; color:#fff }
`}
      </div>

      <div className="bill-card" id="bill-content">
        <div className="receipt">
          <div className="business">BUSINESS NAME</div>
          <div className="address small">1234 Main Street<br/>Suite 567<br/>City Name, State 54321<br/>123-456-7890</div>
          <div className="dotted" />

          <div className="items">
            {items.map((item, idx) => {
              const unit = parseFloat(String(item.price || '').replace(/[^0-9.\-]/g, '')) || 0;
              const qty = parseInt(item.quantity ?? item.qty ?? 1, 10) || 1;
              const lineTotal = (unit * qty).toFixed(2);
              return (
                <div key={idx} className="item-row">
                  <div className="item-name">{item.name}</div>
                  <div className="item-qty">{qty} x ₹{unit.toFixed(2)}</div>
                  <div className="item-price">₹{lineTotal}</div>
                </div>
              );
            })}
          </div>

          <div className="dotted" />

          <div className="summary">
            <div className="row"><span>Sub Total</span><span>₹{safeSubtotal.toFixed(2)}</span></div>
            <div className="row"><span>Sales Tax</span><span>₹{safeTaxes.toFixed(2)}</span></div>
            <div className="total"><span>TOTAL</span><span>₹{safeTotal.toFixed(2)}</span></div>
          </div>

          <div className="dotted" />

          <div className="paid-by"><span>Paid By:</span><span>{paymentMethod}</span></div>

          <div className="meta small">
            <div>{(() => { try { const d = new Date(time); return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}` } catch(e){ return time } })()}</div>
            <div>Transaction ID: {transactionId}</div>
            <div>Order ID: {id}</div>
          </div>

          <div className="dotted" />
          <div className="thankyou">Thank You For Supporting Local Business!</div>

          <div className="actions">
            <button className="btn" onClick={() => navigate(getPathWithTable('/menu'))}>Done</button>
            <button className="btn" onClick={printReceipt}>Print</button>
            <button className="btn btn-primary download-btn" onClick={downloadBill}>Download</button>
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
            <button className="submit-feedback-btn" onClick={submitFeedback}>
              Submit Feedback
            </button>
          </div>
        </div>
      )}
     
    </div>
  );
}

export default Bill;

import { useMemo, useState } from "react";
import { Search, Plus, Minus, Trash2, StickyNote, Percent } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listCategories, listProducts, createOrder, computeOrderTotals, getSettings } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { printReceiptForOrder, printKitchenTicketForOrder } from "../lib/printer";
import Modal from "../components/Modal";
import Receipt from "../components/Receipt";
import "./POS.css";

const ORDER_TYPES = [
  { key: "dine-in", label: "Dine-in" },
  { key: "takeaway", label: "Takeaway" },
  { key: "delivery", label: "Delivery" },
  { key: "counter", label: "Counter" },
];

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Other"];

export default function POS() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: categories } = useLiveQuery(listCategories, [EVENTS.MENU_CHANGED], []);
  const { data: products } = useLiveQuery(listProducts, [EVENTS.MENU_CHANGED], []);

  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState("dine-in");
  const [tableNo, setTableNo] = useState("");
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [notesFor, setNotesFor] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products
      .filter((p) => p.available !== false)
      .filter((p) => (activeCat === "all" ? true : p.categoryId === activeCat))
      .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [products, activeCat, search]);

  const addToCart = (product) => {
    setCart((c) => {
      const existing = c.find((l) => l.productId === product.id && !l._locked);
      if (existing) {
        return c.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...c, { productId: product.id, name: product.name, price: product.price, tax: product.tax || 0, qty: 1, notes: "", discount: 0 }];
    });
  };

  const updateLine = (idx, patch) => {
    setCart((c) => c.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const removeLine = (idx) => setCart((c) => c.filter((_, i) => i !== idx));

  const totals = useMemo(() => computeOrderTotals(cart, Number(orderDiscount) || 0), [cart, orderDiscount]);

  const resetOrder = () => {
    setCart([]);
    setOrderDiscount(0);
    setTableNo("");
  };

  const completeOrder = async (payments) => {
    if (!cart.length) return;
    const order = await createOrder({
      items: cart,
      orderType,
      tableNo,
      discount: Number(orderDiscount) || 0,
      payments,
      cashier: user,
    });
    toast.success(`Order ${order.orderNo} sent to kitchen`);
    setPayOpen(false);
    setReceipt(order);
    resetOrder();

    const printerSettings = await getSettings("printer");
    if (printerSettings?.autoPrint) {
      const res = await printKitchenTicketForOrder(order);
      if (!res.ok) toast.error(`Kitchen ticket print failed: ${res.error}`);
    }
  };

  const handlePrintReceipt = async () => {
    const res = await printReceiptForOrder(receipt);
    if (res.ok) toast.success(`Receipt sent via ${res.method}`);
    else toast.error(`Print failed: ${res.error}`);
  };

  return (
    <div className="pos-layout">
      <div className="pos-catalog">
        <div className="pos-toolbar">
          <div className="pos-search">
            <Search size={16} />
            <input placeholder="Search menu items…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="pos-cats">
          <button className={`pos-cat-chip ${activeCat === "all" ? "active" : ""}`} onClick={() => setActiveCat("all")}>All</button>
          {(categories || []).map((c) => (
            <button key={c.id} className={`pos-cat-chip ${activeCat === c.id ? "active" : ""}`} onClick={() => setActiveCat(c.id)}>{c.name}</button>
          ))}
        </div>
        <div className="pos-grid">
          {filteredProducts.map((p) => (
            <button key={p.id} className="pos-product" onClick={() => addToCart(p)}>
              <div className="pos-product-badge">{p.veg ? "🟢" : "🔴"}</div>
              <div className="pos-product-name">{p.name}</div>
              <div className="pos-product-price">₹{p.price.toFixed(0)}</div>
            </button>
          ))}
          {!filteredProducts.length && (
            <div className="pos-empty">No items match your search.</div>
          )}
        </div>
      </div>

      <div className="pos-cart">
        <div className="pos-cart-header">
          <div className="pos-type-tabs">
            {ORDER_TYPES.map((t) => (
              <button key={t.key} className={`pos-type-tab ${orderType === t.key ? "active" : ""}`} onClick={() => setOrderType(t.key)}>{t.label}</button>
            ))}
          </div>
          {orderType === "dine-in" && (
            <input className="input" style={{ marginTop: 10 }} placeholder="Table number" value={tableNo} onChange={(e) => setTableNo(e.target.value)} />
          )}
        </div>

        <div className="pos-cart-items">
          {!cart.length && <div className="pos-empty" style={{ padding: "40px 12px" }}>Cart is empty. Tap a menu item to add it.</div>}
          {cart.map((line, idx) => (
            <div className="pos-cart-line" key={idx}>
              <div className="pos-cart-line-top">
                <div className="pos-cart-line-name">{line.name}</div>
                <button className="btn btn-ghost btn-sm" onClick={() => removeLine(idx)}><Trash2 size={14} /></button>
              </div>
              {line.notes && <div className="pos-cart-line-note"><StickyNote size={12} /> {line.notes}</div>}
              <div className="pos-cart-line-bottom">
                <div className="pos-qty-stepper">
                  <button onClick={() => updateLine(idx, { qty: Math.max(1, line.qty - 1) })}><Minus size={13} /></button>
                  <span>{line.qty}</span>
                  <button onClick={() => updateLine(idx, { qty: line.qty + 1 })}><Plus size={13} /></button>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setNotesFor(idx)}><StickyNote size={13} /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  const val = prompt("Item discount (₹)", line.discount || 0);
                  if (val !== null) updateLine(idx, { discount: Number(val) || 0 });
                }}><Percent size={13} /></button>
                <div className="pos-cart-line-price">₹{(line.price * line.qty - (line.discount || 0)).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="pos-cart-summary">
          <div className="pos-summary-row">
            <span>Order discount (₹)</span>
            <input className="input" style={{ width: 90, textAlign: "right" }} type="number" min={0} value={orderDiscount}
              onChange={(e) => setOrderDiscount(e.target.value)} />
          </div>
          <div className="pos-summary-row"><span>Subtotal</span><span>₹{totals.subtotal.toFixed(2)}</span></div>
          <div className="pos-summary-row"><span>Discount</span><span>-₹{totals.discount.toFixed(2)}</span></div>
          <div className="pos-summary-row"><span>Tax</span><span>₹{totals.tax.toFixed(2)}</span></div>
          <div className="pos-summary-row pos-summary-total"><span>Total</span><span>₹{totals.total.toFixed(2)}</span></div>
          <button className="btn btn-primary" style={{ width: "100%", height: 46, marginTop: 10 }} disabled={!cart.length} onClick={() => setPayOpen(true)}>
            Charge ₹{totals.total.toFixed(2)}
          </button>
        </div>
      </div>

      <Modal open={notesFor !== null} onClose={() => setNotesFor(null)} title="Item note" width={360}
        footer={<button className="btn btn-primary" onClick={() => setNotesFor(null)}>Save</button>}>
        <textarea className="input" rows={3} placeholder="e.g. No onions, extra spicy"
          value={notesFor !== null ? cart[notesFor]?.notes || "" : ""}
          onChange={(e) => notesFor !== null && updateLine(notesFor, { notes: e.target.value })} />
      </Modal>

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} total={totals.total} onConfirm={completeOrder} />

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Order complete" width={340}
        footer={<>
          <button className="btn btn-outline" onClick={handlePrintReceipt}>Print receipt</button>
          <button className="btn btn-primary" onClick={() => setReceipt(null)}>New order</button>
        </>}>
        {receipt && <Receipt order={receipt} />}
      </Modal>
    </div>
  );
}

function PaymentModal({ open, onClose, total, onConfirm }) {
  const [splits, setSplits] = useState([{ method: "Cash", amount: 0 }]);

  useMemo(() => {
    if (open) setSplits([{ method: "Cash", amount: total }]);
  }, [open, total]);

  const paid = splits.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = +(total - paid).toFixed(2);

  const updateSplit = (i, patch) => setSplits((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addSplit = () => setSplits((s) => [...s, { method: "Cash", amount: 0 }]);
  const removeSplit = (i) => setSplits((s) => s.filter((_, idx) => idx !== i));

  return (
    <Modal open={open} onClose={onClose} title="Take payment" width={400}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={Math.abs(balance) > 0.01}
          onClick={() => onConfirm(splits.map((s) => ({ method: s.method, amount: Number(s.amount) || 0 })))}>
          Confirm payment
        </button>
      </>}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 14 }}>₹{total.toFixed(2)}</div>
      {splits.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select className="input" value={s.method} onChange={(e) => updateSplit(i, { method: e.target.value })}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input className="input" type="number" value={s.amount} onChange={(e) => updateSplit(i, { amount: e.target.value })} />
          {splits.length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => removeSplit(i)}><Trash2 size={14} /></button>}
        </div>
      ))}
      <button className="btn btn-outline btn-sm" onClick={addSplit}>+ Split payment</button>
      <div style={{ marginTop: 12, fontSize: 13, color: balance === 0 ? "var(--success)" : "var(--danger)" }}>
        {balance === 0 ? "Fully paid" : balance > 0 ? `Balance due: ₹${balance.toFixed(2)}` : `Change due: ₹${Math.abs(balance).toFixed(2)}`}
      </div>
    </Modal>
  );
}

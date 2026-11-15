import { useEffect, useMemo, useState } from 'react';
import { featureOn, quoteCart, themeToCssVars } from '@orderin/core';
import type { CartLine, Gateway, MenuItem, Profile } from './types';

function dietLabel(diet?: string) {
  if (diet === 'veg') return 'Veg';
  if (diet === 'nonveg') return 'Non-veg';
  if (diet === 'egg') return 'Egg';
  return 'Diet not set';
}

export function CustomerApp({ gateway }: { gateway: Gateway }) {
  const ref = gateway.resolve();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [view, setView] = useState<'menu' | 'cart' | 'order' | 'done'>('menu');
  const [order, setOrder] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [review, setReview] = useState<{ show: boolean; url?: string } | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    if (!ref.restaurantId && !ref.subdomain) {
      setStatus('missing');
      return;
    }
    gateway.load({ restaurantId: ref.restaurantId, subdomain: ref.subdomain }).then((result) => {
      if (cancelled) return;
      if (!result.profile) {
        setStatus('missing');
        return;
      }
      setProfile(result.profile);
      setMenu(result.menu);
      setStatus('ready');
    }).catch((error: Error) => {
      if (cancelled) return;
      setStatus('error');
      setMessage(error.message || 'Could not load the menu');
    });
    return () => {
      cancelled = true;
    };
  }, [gateway, ref.restaurantId, ref.subdomain]);

  useEffect(() => {
    if (!profile) return;
    const vars = themeToCssVars(profile.theme || {});
    Object.entries(vars).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
  }, [profile]);

  const quote = useMemo(() => {
    if (!cart.length || !profile) return null;
    return quoteCart(menu, cart, { cgstRate: profile.cgstRate, sgstRate: profile.sgstRate, sac: profile.sac });
  }, [cart, menu, profile]);

  if (status === 'loading') return <main className="screen"><p>Loading the menu…</p></main>;
  if (status === 'missing') {
    return (
      <main className="screen">
        <h1>Scan the QR on your table</h1>
        <p>This page does not know which restaurant you are in. Ask the staff for the table QR.</p>
      </main>
    );
  }
  if (status === 'error' || !profile) return <main className="screen"><p>{message || 'Could not load the menu'}</p></main>;

  const visible = menu.filter((item) => filter === 'all' || item.diet === filter);

  async function add(item: MenuItem, size?: string) {
    if (ref.tableId) await gateway.ensureSession(ref.tableId);
    setCart((current) => {
      const chosen = size || 'regular';
      const found = current.find((line) => line.menuItemId === item.id && (line.size || 'regular') === chosen);
      if (found) return current.map((line) => (line === found ? { ...line, qty: line.qty + 1 } : line));
      return [...current, { menuItemId: item.id, qty: 1, size }];
    });
  }

  async function send(type: 'call_waiter' | 'water' | 'bill') {
    if (!ref.tableId) {
      setNotice('Scan the table QR before calling the staff.');
      return;
    }
    await gateway.ensureSession(ref.tableId);
    await gateway.request(type);
    setNotice(type === 'bill' ? 'Bill requested.' : type === 'water' ? 'Water requested.' : 'Waiter called.');
  }

  async function place() {
    if (!ref.tableId) {
      setNotice('Scan the table QR before ordering.');
      return;
    }
    await gateway.ensureSession(ref.tableId);
    const placed = await gateway.place({ lines: cart, name, phone, loyaltyOptIn: optIn });
    setOrder(placed.order || placed);
    setCart([]);
    setView('order');
  }

  return (
    <main className="screen">
      <header className="top">
        <div>
          <h1>{profile.name}</h1>
          {ref.tableId ? <p>Table {ref.tableId}</p> : <p>Browse the menu. Scan a table QR to order.</p>}
        </div>
        <button type="button" onClick={() => setView('cart')}>Cart {cart.reduce((sum, line) => sum + line.qty, 0)}</button>
      </header>
      {featureOn(profile, 'callWaiter') && (
        <div className="requests">
          <button type="button" onClick={() => send('call_waiter')}>Call waiter</button>
          <button type="button" onClick={() => send('water')}>Request water</button>
          <button type="button" onClick={() => send('bill')}>Request bill</button>
        </div>
      )}
      {notice && <p className="notice" role="status">{notice}</p>}
      {view === 'menu' && (
        <section>
          <div className="filters" aria-label="Diet filter">
            {['all', 'veg', 'nonveg', 'egg'].map((value) => (
              <button type="button" key={value} onClick={() => setFilter(value)}>{value}</button>
            ))}
          </div>
          <ul className="menu">
            {visible.map((item) => (
              <li key={item.id} className="card">
                <div className="card-head">
                  <strong>{item.name}</strong>
                  <span className={`diet diet-${item.diet || 'unknown'}`}>{dietLabel(item.diet)}</span>
                </div>
                {item.description && <p>{item.description}</p>}
                <p className="meta">
                  {item.spice ? `Spice: ${item.spice}` : 'Spice not set'}
                  {item.allergens?.length ? ` · Allergens: ${item.allergens.join(', ')}` : ' · No allergens listed'}
                </p>
                <p className="price">₹{item.price}{item.priceLarge ? ` · Large ₹${item.priceLarge}` : ''}</p>
                <button type="button" onClick={() => add(item)}>Add</button>
                {item.priceLarge ? <button type="button" onClick={() => add(item, 'large')}>Add large</button> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
      {view === 'cart' && (
        <section>
          <h2>Your order</h2>
          {!quote && <p>Your cart is empty.</p>}
          {quote && (
            <>
              <ul>
                {quote.lines.map((line: any) => (
                  <li key={line.key}>{line.qty} × {line.name} {line.size !== 'regular' ? `(${line.size})` : ''} — ₹{line.lineTotal}</li>
                ))}
              </ul>
              <p>Subtotal ₹{quote.subtotal}</p>
              <p>CGST ₹{quote.cgst}</p>
              <p>SGST ₹{quote.sgst}</p>
              <p>Total ₹{quote.total}</p>
              <label>Name (optional)<input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label>Phone, only if you want the bill or loyalty<input aria-label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
              <label><input type="checkbox" checked={optIn} onChange={(event) => setOptIn(event.target.checked)} /> Save my phone for loyalty. I can say no and still order.</label>
              <button type="button" onClick={place}>Place order</button>
            </>
          )}
          <button type="button" onClick={() => setView('menu')}>Back to menu</button>
        </section>
      )}
      {view === 'order' && order && (
        <section>
          <h2>Order {order.id}</h2>
          <ul>
            {(order.lines || []).map((line: any) => (
              <li key={line.key}>{line.name}: {line.status}</li>
            ))}
          </ul>
          <p>Total ₹{order.total}</p>
          <p>Pay part online and the rest at the counter, or pay it all here.</p>
          <button type="button" onClick={() => gateway.payOnline().then(() => setView('done'))}>Pay online</button>
          <button type="button" onClick={() => setView('done')}>Pay at the counter</button>
          <button type="button" onClick={() => setView('menu')}>Add more items</button>
        </section>
      )}
      {view === 'done' && (
        <section>
          <h2>How was the meal?</h2>
          <div>
            {[1, 2, 3, 4, 5].map((value) => (
              <button type="button" key={value} onClick={() => setRating(value)}>{value}</button>
            ))}
          </div>
          <textarea aria-label="Feedback" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Tell the restaurant" />
          <button type="button" onClick={async () => setReview(await gateway.feedback(rating, comment))}>Send feedback</button>
          {review?.show && review.url && <a href={review.url}>Leave a Google review</a>}
          {review && !review.show && <p>Thanks. We kept this with the restaurant.</p>}
        </section>
      )}
    </main>
  );
}

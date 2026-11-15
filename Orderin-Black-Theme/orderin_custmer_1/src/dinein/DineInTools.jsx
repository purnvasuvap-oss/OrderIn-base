import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import {
  allergenList,
  billMessage,
  dietLabel,
  dietMark,
  gstSplit,
  itemStatusLabel,
  smsLink,
  spiceLevel,
  splitEqual,
  tableSessionId,
  whatsAppLink,
  serviceRequest,
} from '../../../../shared/orderin-dine/logic.js';

const barStyle = {
  position: 'fixed',
  left: 12,
  right: 12,
  bottom: 74,
  zIndex: 30,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  padding: 8,
  borderRadius: 14,
  background: 'rgba(20, 16, 12, 0.92)',
  color: '#fff',
  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
  fontFamily: 'inherit',
};

const buttonStyle = {
  border: 0,
  borderRadius: 999,
  padding: '8px 12px',
  background: '#fff',
  color: '#1a1a1a',
  fontWeight: 700,
  fontSize: 13,
};

export function DishMeta({ item }) {
  const mark = dietMark(item);
  const allergens = allergenList(item);
  const spice = spiceLevel(item);
  if (!mark && !allergens.length && !spice) return null;
  return (
    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'inherit', opacity: 0.85 }}>
      {mark ? <strong>{dietLabel(mark)}</strong> : null}
      {spice ? <span>{mark ? ' · ' : ''}Spice {spice}/3</span> : null}
      {allergens.length ? <span>{(mark || spice) ? ' · ' : ''}{allergens.join(', ')}</span> : null}
    </p>
  );
}

export function DineInTools({ db, restaurantId }) {
  const location = useLocation();
  const table = tableSessionId(new URLSearchParams(location.search).get('table') || (typeof localStorage !== 'undefined' ? localStorage.getItem('tableNumber') : ''));
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [parts, setParts] = useState(2);
  const [paidHere, setPaidHere] = useState('');

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const showBar = ['/menu', '/cart', '/payments', '/payment-success', '/bill'].some((path) => location.pathname === path)
    || location.pathname.startsWith('/item');

  useEffect(() => {
    if (!db || !restaurantId || !table) return undefined;
    const ref = doc(db, 'Restaurant', restaurantId, 'tableSessions', table);
    return onSnapshot(ref, (snap) => setSession(snap.exists() ? snap.data() : null), () => setSession(null));
  }, [db, restaurantId, table]);

  useEffect(() => {
    if (!db || !restaurantId) return undefined;
    const ref = doc(db, 'Restaurant', restaurantId);
    return onSnapshot(ref, (snap) => setProfile(snap.exists() ? snap.data() : null), () => setProfile(null));
  }, [db, restaurantId]);

  const ask = async (kind) => {
    if (!db || !restaurantId) return;
    try {
      await addDoc(collection(db, 'Restaurant', restaurantId, 'serviceRequests'), {
        ...serviceRequest(table, kind),
        createdAt: serverTimestamp(),
      });
      setNotice(kind === 'bill' ? 'Bill requested' : kind === 'water' ? 'Water requested' : 'Waiter called');
    } catch (error) {
      setNotice('Could not reach the staff screen');
    }
  };

  const cart = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('orderin_cart') || '[]');
    } catch (error) {
      return [];
    }
  }, [location.pathname]);

  const subtotal = cart.reduce((sum, item) => sum + (Number(item.effectivePrice ?? item.price) || 0) * (Number(item.quantity) || 1), 0);
  const shares = splitEqual(gstSplit(subtotal).total, parts);
  useEffect(() => {
    if (paidHere) localStorage.setItem('orderin_split_online', String(paidHere));
  }, [paidHere]);
  const reviewUrl = profile?.googleReviewUrl || profile?.googleReviewLink || profile?.reviewUrl || '';
  const billText = billMessage({
    restaurantName: profile?.Restaurant_name || profile?.name,
    table,
    total: session?.total,
    link: typeof window !== 'undefined' ? window.location.origin : '',
  });

  if (!showBar && online) return null;

  return (
    <div style={barStyle}>
      {!online ? <strong style={{ flexBasis: '100%' }}>No connection. This screen needs the internet. It will retry when you are back online.</strong> : null}
      <button type="button" style={buttonStyle} onClick={() => ask('waiter')}>Call waiter</button>
      <button type="button" style={buttonStyle} onClick={() => ask('water')}>Water</button>
      <button type="button" style={buttonStyle} onClick={() => ask('bill')}>Bill</button>
      {notice ? <span style={{ fontSize: 12, alignSelf: 'center' }}>{notice}</span> : null}
      {session?.items?.length ? (
        <div style={{ flexBasis: '100%', fontSize: 12 }}>
          {session.items.map((item, index) => (
            <div key={`${item.name}-${index}`}>{item.name} · {itemStatusLabel(item.kitchenStatus)}</div>
          ))}
        </div>
      ) : null}
      {location.pathname === '/cart' || location.pathname === '/payments' ? (
        <div style={{ flexBasis: '100%', fontSize: 12 }}>
          <div>Split this bill</div>
          <label>
            People{' '}
            <input value={parts} onChange={(event) => setParts(event.target.value)} style={{ width: 48 }} />
          </label>
          {shares.map((share) => (
            <div key={share.label}>{share.label}: ₹{share.amount}</div>
          ))}
          <label>
            Pay online now ₹{' '}
            <input value={paidHere} onChange={(event) => setPaidHere(event.target.value)} style={{ width: 72 }} />
          </label>
          <span> The rest can be paid at the counter.</span>
        </div>
      ) : null}
      {location.pathname === '/payment-success' ? (
        <div style={{ flexBasis: '100%', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a style={{ ...buttonStyle, textDecoration: 'none' }} href={whatsAppLink(profile?.phone, billText)}>WhatsApp bill</a>
          <a style={{ ...buttonStyle, textDecoration: 'none' }} href={smsLink(profile?.phone, billText)}>SMS bill</a>
          {reviewUrl ? <a style={{ ...buttonStyle, textDecoration: 'none' }} href={reviewUrl} target="_blank" rel="noreferrer">Google review</a> : null}
        </div>
      ) : null}
    </div>
  );
}

export function TableHome({ children }) {
  const table = new URLSearchParams(window.location.search).get('table');
  if (table) return <Navigate to={`/menu?table=${encodeURIComponent(table)}`} replace />;
  return children;
}

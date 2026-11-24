import { useCallback, useEffect, useMemo, useState } from "react";
import "./Expiry.css";
import { collectExpiringBatches, EXPIRY_STATUS, formatDateTime } from "../../utils/expiryRules";
import {
  applyPercent,
  isOfferActive,
  parseMoney,
  percentFromPrices,
  rankDishesForExpiringStock,
  getDishIngredients,
} from "../../utils/expiryOffers";
import {
  applyExpiryOffer,
  DEFAULT_OFFER_HOURS,
  endExpiryOffer,
  fetchMenuItems,
  revertExpiredOffers,
} from "../../services/expiryOfferService";

const DURATION_CHOICES = [6, 12, 24, 48];
const MAX_SUGGESTIONS = 6;

const SuggestionCard = ({ s, onApplied }) => {
  const [percent, setPercent] = useState(String(s.suggestedPercent));
  const [price, setPrice] = useState(String(s.suggestedPrice));
  const [hours, setHours] = useState(DEFAULT_OFFER_HOURS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onPercent = (val) => {
    setPercent(val);
    setPrice(String(applyPercent(s.originalPrice, val)));
  };
  const onPrice = (val) => {
    setPrice(val);
    setPercent(String(percentFromPrices(s.originalPrice, val)));
  };

  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      await applyExpiryOffer({ menuItem: s.dish, offerPrice: price, durationHours: hours, ingredients: s.matched });
      onApplied();
    } catch (e) {
      setError(e.message || "Could not apply the offer.");
    } finally {
      setBusy(false);
    }
  };

  const img = s.dish.image_url || s.dish.image || s.dish.imageURL;
  return (
    <li className={`xp-suggestion ${s.isCombo ? "is-combo" : ""}`}>
      <div className="xp-suggestion-head">
        {img && /^https?:/.test(img) ? <img src={img} alt="" loading="lazy" /> : <div className="xp-thumb" aria-hidden="true" />}
        <div>
          <strong>{s.dish.name}</strong>
          {s.isCombo && <span className="xp-badge">Uses {s.matched.length} expiring items</span>}
          <p className="xp-uses">
            {s.matched.map((m) => `${m.itemName} (${m.hoursLeft < 1 ? "now" : m.hoursLeft < 48 ? `${Math.round(m.hoursLeft)}h` : `${Math.round(m.hoursLeft / 24)}d`})`).join(" · ")}
          </p>
        </div>
      </div>

      {s.onOffer ? (
        <p className="xp-live">
          Offer live: <s>₹{Math.round(parseMoney(s.dish.offer.originalPrice))}</s> ₹{Math.round(parseMoney(s.dish.price))} until{" "}
          {formatDateTime(s.dish.offer.endsAt)}
        </p>
      ) : (
        <>
          <div className="xp-offer-row">
            <div className="xp-field">
              <label>Was</label>
              <span className="xp-was">₹{Math.round(s.originalPrice)}</span>
            </div>
            <div className="xp-field">
              <label htmlFor={`xp-pct-${s.dish.id}`}>Off %</label>
              <input id={`xp-pct-${s.dish.id}`} type="number" inputMode="numeric" min="1" max="90" value={percent} onChange={(e) => onPercent(e.target.value)} />
            </div>
            <div className="xp-field">
              <label htmlFor={`xp-price-${s.dish.id}`}>Offer ₹</label>
              <input id={`xp-price-${s.dish.id}`} type="number" inputMode="numeric" min="1" value={price} onChange={(e) => onPrice(e.target.value)} />
            </div>
            <div className="xp-field">
              <label htmlFor={`xp-hours-${s.dish.id}`}>For</label>
              <select id={`xp-hours-${s.dish.id}`} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {DURATION_CHOICES.map((h) => (
                  <option key={h} value={h}>
                    {h === 24 ? "1 day" : h === 48 ? "2 days" : `${h} hours`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="xp-error" role="alert">{error}</p>}
          <button type="button" className="xp-apply" onClick={apply} disabled={busy}>
            {busy ? "Applying…" : "Apply offer + promotion"}
          </button>
        </>
      )}
    </li>
  );
};

/**
 * Inventory panel: stock in its alert window, the dishes that use it (dishes
 * that use several expiring items first), and one-tap offers.
 */
const ExpiringSoonPanel = ({ batchesByItem, onChanged }) => {
  const [menu, setMenu] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [notice, setNotice] = useState("");

  const loadMenu = useCallback(async () => {
    try {
      const items = await fetchMenuItems();
      const reverted = await revertExpiredOffers(items);
      setMenu(reverted ? await fetchMenuItems() : items);
    } catch (e) {
      console.error("Could not load the menu for expiry offers:", e);
    } finally {
      setLoadingMenu(false);
    }
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const expiring = useMemo(() => collectExpiringBatches(batchesByItem), [batchesByItem]);
  const suggestions = useMemo(() => rankDishesForExpiringStock(expiring, menu), [expiring, menu]);
  const runningOffers = useMemo(() => menu.filter((m) => isOfferActive(m)), [menu]);
  const dishesWithoutIngredients = useMemo(
    () => menu.filter((m) => getDishIngredients(m).length === 0).length,
    [menu]
  );

  if (expiring.length === 0 && runningOffers.length === 0) return null;

  const afterApply = async (msg) => {
    setNotice(msg);
    await loadMenu();
    onChanged && onChanged();
  };

  return (
    <section className="xp-panel" aria-labelledby="xp-panel-title">
      <header className="xp-panel-head">
        <h3 id="xp-panel-title">Expiring soon</h3>
        <span>{expiring.length} batch{expiring.length === 1 ? "" : "es"} need attention</span>
      </header>

      {expiring.length > 0 && (
        <ul className="xp-stock">
          {expiring.map((b) => (
            <li key={b.firestoreId || b.batchId} className={b.expiryState.status === EXPIRY_STATUS.EXPIRED ? "is-expired" : ""}>
              <strong>{b.itemName}</strong>
              <span>
                {b.remainingQty} {b.unit} · {b.expiryState.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {notice && <p className="xp-notice" role="status">{notice}</p>}

      {expiring.length > 0 && (
        <>
          <h4 className="xp-subtitle">Suggested dishes to push</h4>
          {loadingMenu ? (
            <p className="xp-hint">Loading menu…</p>
          ) : suggestions.length === 0 ? (
            <p className="xp-hint">
              No dish lists these items as ingredients yet. Add ingredients to dishes on the Menu page and they'll show up here.
            </p>
          ) : (
            <ul className="xp-suggestions">
              {suggestions.slice(0, MAX_SUGGESTIONS).map((s) => (
                <SuggestionCard
                  key={s.dish.id}
                  s={s}
                  onApplied={() => afterApply(`Offer applied to ${s.dish.name}. A one-day promotion is now live in the customer app.`)}
                />
              ))}
            </ul>
          )}
          {!loadingMenu && dishesWithoutIngredients > 0 && (
            <p className="xp-hint">
              {dishesWithoutIngredients} dish{dishesWithoutIngredients === 1 ? " has" : "es have"} no ingredients set, so
              {dishesWithoutIngredients === 1 ? " it isn't" : " they aren't"} suggested or deducted from stock.
            </p>
          )}
        </>
      )}

      {runningOffers.length > 0 && (
        <>
          <h4 className="xp-subtitle">Offers running now</h4>
          <ul className="xp-running">
            {runningOffers.map((m) => (
              <li key={m.id}>
                <span>
                  <strong>{m.name}</strong> <s>₹{Math.round(parseMoney(m.offer.originalPrice))}</s> ₹{Math.round(parseMoney(m.price))} · ends{" "}
                  {formatDateTime(m.offer.endsAt)}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await endExpiryOffer(m);
                    afterApply(`Offer on ${m.name} ended. Price is back to ₹${Math.round(parseMoney(m.offer.originalPrice))}.`);
                  }}
                >
                  End offer
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

export default ExpiringSoonPanel;

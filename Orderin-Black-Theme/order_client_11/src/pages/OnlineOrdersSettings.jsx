import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import routes from "../routes";
import {
  PLATFORM_LABEL,
  RESTAURANT_ID,
  simulateAggregatorOrder,
} from "../services/aggregatorService";
import "../components/AggregatorInbox/AggregatorInbox.css";
import "./OnlineOrdersSettings.css";

const PLATFORMS = ["swiggy", "zomato"];

/**
 * Swiggy / Zomato settings:
 *  - which outlets are linked to this restaurant (set up by OrderIn; read-only here)
 *  - item mapping: the platform's item id -> this restaurant's menu item, so
 *    online orders count against stock and sales like dine-in orders
 *  - accept window, and "Send test order" to rehearse the flow
 */
function OnlineOrdersSettings() {
  const navigate = useNavigate();
  const [menuItems, setMenuItems] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [configs, setConfigs] = useState({ swiggy: { itemMap: {} }, zomato: { itemMap: {} } });
  const [drafts, setDrafts] = useState({ swiggy: { id: "", menuId: "" }, zomato: { id: "", menuId: "" } });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [menuSnap, outletSnap, ...cfgSnaps] = await Promise.all([
          getDocs(collection(db, "Restaurant", RESTAURANT_ID, "menu")),
          // Top-level collection: stricter Firestore rules may not allow staff
          // to read it yet — show "not linked" rather than failing the page.
          getDocs(query(collection(db, "aggregatorOutlets"), where("restaurantId", "==", RESTAURANT_ID))).catch(() => ({ docs: [] })),
          ...PLATFORMS.map((p) => getDoc(doc(db, "Restaurant", RESTAURANT_ID, "aggregatorConfig", p))),
        ]);
        if (!alive) return;
        setMenuItems(
          menuSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((m) => m.name)
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        );
        setOutlets(outletSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const next = {};
        PLATFORMS.forEach((p, i) => {
          const data = cfgSnaps[i].exists() ? cfgSnaps[i].data() : {};
          next[p] = { itemMap: data.itemMap || {}, acceptWindowSeconds: data.acceptWindowSeconds || 180 };
        });
        setConfigs(next);
      } catch (e) {
        if (alive) setStatus({ kind: "error", text: `Couldn't load settings: ${e.message}` });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const menuName = useMemo(() => Object.fromEntries(menuItems.map((m) => [m.id, m.name])), [menuItems]);

  const save = async (platform, nextConfig) => {
    setSaving(platform);
    try {
      await setDoc(doc(db, "Restaurant", RESTAURANT_ID, "aggregatorConfig", platform), nextConfig, { merge: true });
      setConfigs((c) => ({ ...c, [platform]: { ...c[platform], ...nextConfig } }));
      setStatus({ kind: "ok", text: `${PLATFORM_LABEL[platform]} settings saved.` });
    } catch (e) {
      setStatus({ kind: "error", text: `Couldn't save: ${e.message}` });
    } finally {
      setSaving(null);
    }
  };

  const addMapping = (platform) => {
    const { id, menuId } = drafts[platform];
    const externalId = id.trim();
    if (!externalId || !menuId) return;
    const itemMap = { ...configs[platform].itemMap, [externalId]: menuId };
    save(platform, { itemMap });
    setDrafts((d) => ({ ...d, [platform]: { id: "", menuId: "" } }));
  };

  const removeMapping = (platform, externalId) => {
    const itemMap = { ...configs[platform].itemMap };
    delete itemMap[externalId];
    // setDoc with merge can't delete a map key, so write the whole map.
    setSaving(platform);
    setDoc(doc(db, "Restaurant", RESTAURANT_ID, "aggregatorConfig", platform), { ...configs[platform], itemMap })
      .then(() => {
        setConfigs((c) => ({ ...c, [platform]: { ...c[platform], itemMap } }));
        setStatus({ kind: "ok", text: "Mapping removed." });
      })
      .catch((e) => setStatus({ kind: "error", text: `Couldn't remove: ${e.message}` }))
      .finally(() => setSaving(null));
  };

  const sendTest = async (platform) => {
    try {
      await simulateAggregatorOrder(platform, menuItems);
      navigate(routes.onlineOrders);
    } catch (e) {
      setStatus({ kind: "error", text: `Couldn't create the test order: ${e.message}` });
    }
  };

  return (
    <div className="orders-page online-settings">
      <div className="pagehead">
        <div>
          <h1 className="page-h1">Swiggy / Zomato settings</h1>
          <div className="page-sub">Connection, item mapping and test orders.</div>
        </div>
        <button className="back-btn" onClick={() => navigate(routes.onlineOrders)}>
          ← Back to Online orders
        </button>
      </div>

      {status && (
        <div className={`os-status ${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
          {status.text}
        </div>
      )}

      <section className="os-card">
        <h2>Connection</h2>
        <p className="os-muted">
          Orders reach this app through OrderIn's aggregator service, which is waiting for its billing review and
          for Swiggy/Zomato partner approval. Until then, use <b>Send test order</b> to practise — test orders are
          never sent to Swiggy or Zomato.
        </p>
        {outlets.length === 0 ? (
          <p className="os-muted">No Swiggy or Zomato outlet is linked to this restaurant yet. OrderIn links it when the account is approved.</p>
        ) : (
          <ul className="os-list">
            {outlets.map((o) => (
              <li key={o.id}>
                <span className={`agg-source ${o.id.split("_")[0]}`}>{PLATFORM_LABEL[o.id.split("_")[0]] || o.id}</span>{" "}
                Outlet <code>{o.id.split("_").slice(1).join("_")}</code> · {o.enabled === false ? "paused" : "active"}
              </li>
            ))}
          </ul>
        )}
        <div className="os-row">
          {PLATFORMS.map((p) => (
            <button key={p} type="button" className="agg-btn ghost" onClick={() => sendTest(p)}>
              Send test {PLATFORM_LABEL[p]} order
            </button>
          ))}
        </div>
      </section>

      {PLATFORMS.map((p) => {
        const entries = Object.entries(configs[p].itemMap || {});
        return (
          <section className="os-card" key={p}>
            <h2>
              <span className={`agg-source ${p}`}>{PLATFORM_LABEL[p]}</span> settings
            </h2>

            <label className="os-field">
              <span>Time to accept a new order</span>
              <select
                value={configs[p].acceptWindowSeconds || 180}
                disabled={saving === p}
                onChange={(e) => save(p, { acceptWindowSeconds: Number(e.target.value) })}
              >
                {[120, 180, 240, 300].map((s) => (
                  <option key={s} value={s}>
                    {s / 60} minutes
                  </option>
                ))}
              </select>
              <small className="os-muted">Used only when {PLATFORM_LABEL[p]} doesn't send its own deadline.</small>
            </label>

            <h3>Item mapping</h3>
            <p className="os-muted">
              Link each {PLATFORM_LABEL[p]} item id to your menu so online orders count towards stock and sales.
              Unlinked items still reach the kitchen by name.
            </p>
            {entries.length > 0 && (
              <ul className="os-list">
                {entries.map(([ext, menuId]) => (
                  <li key={ext}>
                    <code>{ext}</code> → {menuName[menuId] || <span className="agg-warn">menu item removed</span>}
                    <button
                      type="button"
                      className="os-link"
                      disabled={saving === p}
                      onClick={() => removeMapping(p, ext)}
                      aria-label={`Remove mapping for ${ext}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="os-row">
              <input
                placeholder={`${PLATFORM_LABEL[p]} item id`}
                value={drafts[p].id}
                onChange={(e) => setDrafts((d) => ({ ...d, [p]: { ...d[p], id: e.target.value } }))}
                aria-label={`${PLATFORM_LABEL[p]} item id`}
              />
              <select
                value={drafts[p].menuId}
                onChange={(e) => setDrafts((d) => ({ ...d, [p]: { ...d[p], menuId: e.target.value } }))}
                aria-label="Menu item"
              >
                <option value="">Choose a menu item</option>
                {menuItems.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="agg-btn primary"
                disabled={saving === p || !drafts[p].id.trim() || !drafts[p].menuId}
                onClick={() => addMapping(p)}
              >
                Add
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default OnlineOrdersSettings;

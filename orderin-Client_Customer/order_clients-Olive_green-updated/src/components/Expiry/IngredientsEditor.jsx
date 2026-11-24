import { useEffect, useId, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import "./Expiry.css";
import { db } from "../../firebase";
import { RESTAURANT_PATH } from "../../services/inventoryBatchService";
import { normalizeName } from "../../utils/expiryOffers";

let inventoryCache = null;
const loadInventoryNames = async () => {
  if (inventoryCache) return inventoryCache;
  const snap = await getDocs(collection(db, RESTAURANT_PATH, "inventory"));
  inventoryCache = snap.docs
    .map((d) => ({ name: d.data().name || d.id, unit: d.data().unit || "", status: d.data().itemStatus }))
    .filter((i) => i.status !== "deleted")
    .sort((a, b) => a.name.localeCompare(b.name));
  return inventoryCache;
};

/**
 * Ingredients used by ONE portion of a dish. Each row names an inventory item
 * and how much of it (in that item's unit). Used for automatic stock
 * deduction when an order is accepted, and for expiry offer suggestions.
 */
// Editor rows are stored as-is in the dish's `recipe` field:
// { itemId, inventoryItemName, quantity, unit }. Rows saved by older theme
// editors ({ itemId, quantity } or { inventoryItemName, quantity }) are shown too.
const nameOf = (row) => row?.inventoryItemName || row?.name || row?.itemId || "";
const qtyOf = (row) => row?.quantity ?? row?.qty ?? "";

const IngredientsEditor = ({ value, onChange }) => {
  const rows = Array.isArray(value) ? value : [];
  const [inventory, setInventory] = useState([]);
  const listId = useId();

  useEffect(() => {
    let alive = true;
    loadInventoryNames()
      .then((list) => alive && setInventory(list))
      .catch((e) => console.warn("Could not load inventory for ingredients:", e));
    return () => {
      alive = false;
    };
  }, []);

  const byName = useMemo(() => new Map(inventory.map((i) => [normalizeName(i.name), i])), [inventory]);

  const update = (idx, patch) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };

  const setName = (idx, name) => {
    const match = byName.get(normalizeName(name));
    const finalName = match ? match.name : name;
    update(idx, { itemId: finalName, inventoryItemName: finalName, unit: match ? match.unit : rows[idx]?.unit || "" });
  };

  return (
    <div className="xp-ingredients">
      <div className="xp-ingredients-head">
        <span>Ingredients per portion</span>
        <small>Taken from inventory automatically when an order is accepted.</small>
      </div>

      <datalist id={listId}>
        {inventory.map((i) => (
          <option key={i.name} value={i.name} />
        ))}
      </datalist>

      {rows.length === 0 && <p className="xp-hint">No ingredients yet.</p>}

      {rows.map((row, idx) => {
        const known = !nameOf(row) || inventory.length === 0 || byName.has(normalizeName(nameOf(row)));
        return (
          <div className="xp-ingredient-row" key={idx}>
            <input
              type="text"
              list={listId}
              aria-label={`Ingredient ${idx + 1}`}
              placeholder="Inventory item, e.g. Milk"
              value={nameOf(row)}
              onChange={(e) => setName(idx, e.target.value)}
            />
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              aria-label={`Quantity of ingredient ${idx + 1}`}
              placeholder={row.unit ? `Qty (${row.unit})` : "Qty"}
              value={qtyOf(row)}
              onChange={(e) => update(idx, { quantity: e.target.value })}
            />
            <span className="xp-unit">{row.unit || "unit"}</span>
            <button
              type="button"
              className="xp-remove"
              aria-label={`Remove ingredient ${idx + 1}`}
              onClick={() => onChange(rows.filter((_, i) => i !== idx))}
            >
              ×
            </button>
            {!known && <small className="xp-warn">Not in inventory, so it won't be deducted.</small>}
          </div>
        );
      })}

      <button type="button" className="xp-add" onClick={() => onChange([...rows, { itemId: "", inventoryItemName: "", quantity: "", unit: "" }])}>
        + Add ingredient
      </button>
    </div>
  );
};

export default IngredientsEditor;

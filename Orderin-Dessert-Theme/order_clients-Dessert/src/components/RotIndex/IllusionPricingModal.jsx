import { useEffect, useMemo, useState } from "react";
import { X, Flame } from "lucide-react";
import "./IllusionPricingModal.css";
import { fetchMenuItems, createIllusionPricingPromo } from "../../services/illusionPricingService";

const IllusionPricingModal = ({ inventoryItem, onClose, onCreated }) => {
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(inventoryItem?.name || "");
  const [selectedMenuItemId, setSelectedMenuItemId] = useState("");
  const [discountPercent, setDiscountPercent] = useState(30);
  const [durationHours, setDurationHours] = useState(6);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setMenuItems(await fetchMenuItems());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const suggestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return menuItems.filter((m) => !term || m.name?.toLowerCase().includes(term));
  }, [menuItems, search]);

  const selectedMenuItem = menuItems.find((m) => m.id === selectedMenuItemId);

  const handleActivate = async () => {
    if (!selectedMenuItem) {
      alert("Pick a dish to link the promo to.");
      return;
    }
    setCreating(true);
    try {
      await createIllusionPricingPromo({
        menuItem: selectedMenuItem,
        discountPercent: Number(discountPercent),
        durationHours: Number(durationHours),
        sourceInventoryItemName: inventoryItem?.name,
      });
      alert(`Illusion Pricing activated for ${selectedMenuItem.name}! It's now live on the customer app.`);
      onCreated && onCreated();
      onClose();
    } catch (error) {
      console.error("createIllusionPricingPromo failed:", error);
      alert("Error activating promo: " + error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="Illusion-modal-overlay" onClick={onClose}>
      <div className="Illusion-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="Illusion-modal-header">
          <h3><Flame size={18} color="#dc2626" /> Activate Illusion Pricing</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="Illusion-modal-body">
          <p className="Illusion-intro">
            <strong>{inventoryItem?.name}</strong> is in the Red Zone and about to spoil. Push a flash discount
            on a dish that uses it, to clear stock tonight.
          </p>

          <label>Search for a dish</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Paneer Butter Masala"
          />

          {loading ? (
            <p className="Illusion-empty">Loading menu...</p>
          ) : (
            <div className="Illusion-menu-list">
              {suggestions.slice(0, 8).map((m) => (
                <label key={m.id} className={`Illusion-menu-row ${selectedMenuItemId === m.id ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="illusion-menu-item"
                    checked={selectedMenuItemId === m.id}
                    onChange={() => setSelectedMenuItemId(m.id)}
                  />
                  <span className="Illusion-menu-name">{m.name}</span>
                  <span className="Illusion-menu-cat">{m.category}</span>
                  <span className="Illusion-menu-price">₹{m.price}</span>
                </label>
              ))}
              {suggestions.length === 0 && <p className="Illusion-empty">No dishes match.</p>}
            </div>
          )}

          <div className="Illusion-fields-row">
            <div>
              <label>Discount %</label>
              <input
                type="number"
                min="5"
                max="80"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
              />
            </div>
            <div>
              <label>Active for (hours)</label>
              <input
                type="number"
                min="1"
                max="24"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
              />
            </div>
          </div>

          {selectedMenuItem && (
            <p className="Illusion-preview">
              Customers will see {selectedMenuItem.name} at{" "}
              <strong>₹{Math.round((Number(String(selectedMenuItem.price).replace(/[^0-9.-]+/g, "")) || 0) * (1 - discountPercent / 100))}</strong>{" "}
              (was ₹{selectedMenuItem.price}) for the next {durationHours}h.
            </p>
          )}

          <button className="Illusion-activate-btn" onClick={handleActivate} disabled={creating || !selectedMenuItem}>
            {creating ? "Activating..." : "Activate Promo Banner"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IllusionPricingModal;

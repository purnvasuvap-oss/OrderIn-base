import "./Inventory.css";
import { CheckCircle, AlertTriangle, XCircle, X, Flame, Settings2, ClipboardList } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import routes from "../routes";
import { useNotification } from "../hooks/useNotification";
import { db } from "../firebase";
import { collection, getDocs, doc, setDoc, updateDoc, arrayUnion, Timestamp } from "firebase/firestore";
import ActiveInventory from "./landingpage/good_inventory.svg";
import LowInventory from "./landingpage/low_inventory.svg";
import VeryLowInventory from "./landingpage/very_low_interventory.svg";
import { withRotIndex, ROT_BANDS } from "../utils/rotIndex";
import RotBadge from "../components/RotIndex/RotBadge";
import IllusionPricingModal from "../components/RotIndex/IllusionPricingModal";
import InventoryItemManager from "../components/InventoryManager/InventoryItemManager";
import {
  addInventoryBatch,
  getItemBatches,
  consumeFromSpecificBatches,
  getItemActionHistory,
  recordInventoryAction,
  getAllBatchesWithExpiry,
} from "../services/inventoryBatchService";

const isItemActive = (item) => !item.itemStatus || item.itemStatus === "active";

function App() {
  const navigate = useNavigate();
  const { addActivity } = useNotification();
  const [showModal, setShowModal] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [unit, setUnit] = useState("Kgs");
  const [customUnit, setCustomUnit] = useState("");
  const [selectedAction, setSelectedAction] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState("");
  const [alertItemName, setAlertItemName] = useState("");
  const [alertItemCategory, setAlertItemCategory] = useState("");
  const [selectedAlertCategory, setSelectedAlertCategory] = useState("");
  const [selectedAlertItem, setSelectedAlertItem] = useState("");
  const [alertItems, setAlertItems] = useState([]);
  const [alertLowThreshold, setAlertLowThreshold] = useState("0");
  const [alertVeryLowThreshold, setAlertVeryLowThreshold] = useState("0");
  const [alertLowUnit, setAlertLowUnit] = useState("Kgs");
  const [alertVeryLowUnit, setAlertVeryLowUnit] = useState("Kgs");
  const [alertLowCustomUnit, setAlertLowCustomUnit] = useState("");
  const [alertVeryLowCustomUnit, setAlertVeryLowCustomUnit] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [filteredData, setFilteredData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedItem, setSelectedItem] = useState("");
  const [isNewItem, setIsNewItem] = useState(false);
  const [itemName, setItemName] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoryItems, setCategoryItems] = useState([]);

  const [isNewCategory, setIsNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [existingLocations, setExistingLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [isNewLocation, setIsNewLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");

  // Rot Index (predictive expiry) fields for the stock-update form
  const [arrivalDate, setArrivalDate] = useState("");
  const [shelfLifeDays, setShelfLifeDays] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  // Batch tracking for the Rot Index (item name -> active batches with expiry)
  const [batchesByItem, setBatchesByItem] = useState({});

  // Take Out: batch multi-select
  const [takeOutBatches, setTakeOutBatches] = useState([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [loadingTakeOutBatches, setLoadingTakeOutBatches] = useState(false);

  // Actions history modal
  const [historyModalItem, setHistoryModalItem] = useState(null);
  const [itemActionHistory, setItemActionHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Tabs: "inventory" | "manager"
  const [activeTab, setActiveTab] = useState("inventory");

  // Illusion Pricing modal (Red Zone flash-discount promo)
  const [illusionModalItem, setIllusionModalItem] = useState(null);

  // Excludes paused/deleted items from every active-inventory view; the raw `data`
  // (all items, any lifecycle status) is still passed to the Item Manager tab.
  const activeData = useMemo(() => data.filter(isItemActive), [data]);

  const goodCount = activeData.filter(item => item.status === "Good").length;
  const lowCount = activeData.filter(item => item.status === "Low").length;
  const veryLowCount = activeData.filter(item => item.status === "Very Low").length;

  const rotData = useMemo(() => withRotIndex(activeData, batchesByItem), [activeData, batchesByItem]);
  const redZoneItems = useMemo(
    () => rotData.filter(item => item.rotBand === ROT_BANDS.RED),
    [rotData]
  );

  const handleActivateIllusionPricing = (item) => {
    setIllusionModalItem(item);
  };

  const loadBatchesByItem = async () => {
    try {
      const allBatches = await getAllBatchesWithExpiry();
      const grouped = {};
      allBatches.forEach(batch => {
        if (!grouped[batch.itemName]) grouped[batch.itemName] = [];
        grouped[batch.itemName].push(batch);
      });
      setBatchesByItem(grouped);
    } catch (error) {
      console.error("Error loading batches for Rot Index:", error);
    }
  };

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const inventoryCollection = collection(db, "Restaurant", "orderin_restaurant_1", "inventory");
        const inventorySnapshot = await getDocs(inventoryCollection);
        const items = inventorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setData(items);

        const activeItems = items.filter(isItemActive);
        const uniqueCategories = [...new Set(activeItems.map(item => item.itemCategory))];
        setCategories(uniqueCategories);

        const uniqueLocations = [...new Set(activeItems.map(item => item.locationOfStorage).filter(Boolean))];
        setExistingLocations(uniqueLocations);

        const allActions = [];
        items.forEach(item => {
          if (item.actions && Array.isArray(item.actions)) {
            item.actions.forEach(action => {
              allActions.push({
                message: `${item.name} of ${item.itemCategory} is ${action.type}d ${action.quantity} ${item.unit} at ${item.locationOfStorage}`,
                timestamp: action.timestamp.toDate().toLocaleString('en-GB', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', hour12: true
                })
              });
            });
          }
        });
        allActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setActivities(allActions.slice(0, 6));

        loadBatchesByItem();
      } catch (error) {
        console.error("Error fetching inventory:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchInventory();
  }, []);

  useEffect(() => {
    if (!selectedCategory || isNewCategory) { setCategoryItems([]); return; }
    setCategoryItems(activeData.filter(item => item.itemCategory === selectedCategory));
  }, [selectedCategory, isNewCategory, activeData]);

  useEffect(() => {
    if (!selectedItem) return;
    const item = activeData.find(i => i.name === selectedItem);
    if (!item) return;
    setItemName(item.name);
    setUnit(item.unit);
    setLocation(item.locationOfStorage);
    setAlertLowThreshold(String(item.thresholdLow ?? 0));
    setAlertVeryLowThreshold(String(item.thresholdVeryLow ?? 0));
  }, [selectedItem, activeData]);

  useEffect(() => {
    if (selectedAction !== "take" || !selectedItem) {
      setTakeOutBatches([]);
      setSelectedBatchIds([]);
      return;
    }
    setLoadingTakeOutBatches(true);
    getItemBatches(selectedItem)
      .then(batches => {
        const active = batches.filter(b => b.status === "active" && b.remainingQty > 0);
        setTakeOutBatches(active);
        setSelectedBatchIds([]);
      })
      .catch(error => console.error("Error loading batches for take out:", error))
      .finally(() => setLoadingTakeOutBatches(false));
  }, [selectedAction, selectedItem]);

  useEffect(() => {
    if (!selectedAlertCategory) { setAlertItems([]); return; }
    setAlertItems(activeData.filter(item => item.itemCategory === selectedAlertCategory));
  }, [selectedAlertCategory, activeData]);

  useEffect(() => {
    if (!selectedAlertItem) return;
    const item = activeData.find(i => i.name === selectedAlertItem);
    if (!item) return;
    setAlertItemName(item.name);
    setAlertItemCategory(item.itemCategory);
    setAlertLowThreshold(String(item.thresholdLow ?? 0));
    setAlertVeryLowThreshold(String(item.thresholdVeryLow ?? 0));
    setAlertLowUnit(item.unit);
    setAlertVeryLowUnit(item.unit);
  }, [selectedAlertItem, activeData]);

  useEffect(() => {
    if (!arrivalDate || !shelfLifeDays) return;
    const days = parseFloat(shelfLifeDays);
    if (isNaN(days) || days <= 0) return;
    const computedExpiry = new Date(arrivalDate);
    computedExpiry.setDate(computedExpiry.getDate() + days);
    setExpiryDate(computedExpiry.toISOString().split("T")[0]);
  }, [arrivalDate, shelfLifeDays]);

  useEffect(() => {
    const term = searchTerm.toLowerCase();
    const filtered = rotData.filter(item => {
      const matchesSearch = !term ||
        item.name.toLowerCase().includes(term) ||
        item.itemCategory.toLowerCase().includes(term);
      const matchesLocation = !filterLocation || item.locationOfStorage === filterLocation;
      const matchesStatus = !filterStatus || item.status === filterStatus;
      return matchesSearch && matchesLocation && matchesStatus;
    });
    setFilteredData(filtered);
  }, [searchTerm, filterLocation, filterStatus, rotData]);

  const resetStockForm = () => {
    setSelectedAction(null);
    setQuantity("");
    setLocation("");
    setUnit("Kgs");
    setCustomUnit("");
    setSelectedCategory("");
    setSelectedItem("");
    setItemName("");
    setIsNewItem(false);
    setIsNewCategory(false);
    setNewCategoryName("");
    setSelectedLocation("");
    setIsNewLocation(false);
    setNewLocationName("");
    setArrivalDate("");
    setShelfLifeDays("");
    setExpiryDate("");
    setTakeOutBatches([]);
    setSelectedBatchIds([]);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setTimeout(() => resetStockForm(), 0);
  };

  const resetAlertForm = () => {
    setSelectedAlertCategory("");
    setSelectedAlertItem("");
    setAlertLowThreshold("0");
    setAlertVeryLowThreshold("0");
    setAlertLowUnit("Kgs");
    setAlertVeryLowUnit("Kgs");
    setAlertLowCustomUnit("");
    setAlertVeryLowCustomUnit("");
    setAlertItemCategory("");
    setAlertItemName("");
  };

  const handleCloseAlertsModal = () => {
    setShowAlertsModal(false);
    setTimeout(() => resetAlertForm(), 0);
  };

  const logActivity = (itemName, itemCategory, action, location) => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
    const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const message = `${itemName} of ${itemCategory} is ${action} ${location} at ${time} on ${date}`;
    addActivity(message);
    const timestamp = now.toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
    setActivities(prev => [{ message, timestamp }, ...prev.slice(0, 5)]);
  };

  const logAlertActivity = (itemName, category, low, veryLow, action = "updated") => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
    const date = now.toLocaleDateString("en-GB");
    const message = `Alert ${action} for ${itemName} (${category}) — Low: ${low} / Very Low: ${veryLow}`;
    addActivity(message);
    setActivities(prev => [{ message, timestamp: `${date} ${time}` }, ...prev.slice(0, 5)]);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "Good":     return <span className="Inventory-status Inventory-good"><CheckCircle size={16} /> Good</span>;
      case "Low":      return <span className="Inventory-status Inventory-low"><AlertTriangle size={16} /> Low</span>;
      case "Very Low": return <span className="Inventory-status Inventory-verylow"><XCircle size={16} /> Very Low</span>;
      default:         return status;
    }
  };

  const updateStatusBasedOnQuantity = (quantity, itemLowThreshold, itemVeryLowThreshold) => {
    const qty = parseFloat(quantity);
    if (qty <= itemVeryLowThreshold) return "Very Low";
    else if (qty <= itemLowThreshold) return "Low";
    else return "Good";
  };

  const handleBackToDashboard = () => {
    sessionStorage.removeItem("inventoryAuth");
    navigate(routes.dashboard, { replace: true });
  };

  const finalCategory = isNewCategory ? newCategoryName.trim() : selectedCategory;
  const finalLocation = isNewCategory
    ? (isNewLocation ? newLocationName.trim() : selectedLocation)
    : location;

  const refetchAndSync = async (inventoryCollection) => {
    const updatedSnapshot = await getDocs(inventoryCollection);
    const updatedItems = updatedSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setData(updatedItems);
    const activeUpdatedItems = updatedItems.filter(isItemActive);
    setCategories([...new Set(activeUpdatedItems.map(i => i.itemCategory))]);
    setExistingLocations([...new Set(activeUpdatedItems.map(i => i.locationOfStorage).filter(Boolean))]);
    const allActions = [];
    updatedItems.forEach(item => {
      if (item.actions && Array.isArray(item.actions)) {
        item.actions.forEach(action => {
          allActions.push({
            message: `${item.name} of ${item.itemCategory} is ${action.type}d ${action.quantity} ${item.unit} at ${item.locationOfStorage}`,
            timestamp: action.timestamp.toDate().toLocaleString('en-GB', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: true
            })
          });
        });
      }
    });
    allActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    setActivities(allActions.slice(0, 6));
    loadBatchesByItem();
  };

  const openHistoryModal = async (item) => {
    setHistoryModalItem(item);
    setLoadingHistory(true);
    try {
      const history = await getItemActionHistory(item.name);
      setItemActionHistory(history);
    } catch (error) {
      console.error("Error loading item action history:", error);
      setItemActionHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const closeHistoryModal = () => {
    setHistoryModalItem(null);
    setItemActionHistory([]);
  };

  const historyItemExpiryChips = useMemo(() => {
    if (!historyModalItem) return [];
    const batches = batchesByItem[historyModalItem.name] || [];
    const groups = {};
    batches.forEach((batch) => {
      if (batch.status === "consumed") return;
      const qty = Number(batch.remainingQty) || 0;
      if (qty <= 0) return;
      const dateKey = batch.expiryDate ? batch.expiryDate.toDate().toLocaleDateString('en-GB') : "No expiry";
      const unit = batch.unit || "Kgs";
      const key = `${dateKey}__${unit}`;
      if (!groups[key]) {
        groups[key] = {
          dateKey,
          unit,
          qty: 0,
          sortValue: batch.expiryDate ? batch.expiryDate.toDate().getTime() : Infinity,
        };
      }
      groups[key].qty += qty;
    });
    return Object.values(groups).sort((a, b) => a.sortValue - b.sortValue);
  }, [historyModalItem, batchesByItem]);

  const writeAddBatchAndAction = async (itemNameValue, qty, unitValue, locationOfStorage) => {
    try {
      const batchArrivalDate = arrivalDate || new Date().toISOString().split("T")[0];
      const createdBatch = await addInventoryBatch(itemNameValue, {
        quantity: qty,
        unit: unitValue,
        arrivalDate: batchArrivalDate,
        expiryDate: expiryDate || null,
        shelfLifeDays: shelfLifeDays ? parseFloat(shelfLifeDays) : 0,
        locationOfStorage,
      });
      await recordInventoryAction(itemNameValue, "add", {
        quantity: qty,
        unit: unitValue,
        batchId: createdBatch.batchId,
        expiryDate: expiryDate ? Timestamp.fromDate(new Date(expiryDate)) : null,
        arrivalDate: Timestamp.fromDate(new Date(batchArrivalDate)),
        locationOfStorage,
      });
    } catch (error) {
      console.error("Non-fatal: batch/history tracking failed for add stock", error);
    }
  };

  return (
    <div className="inventory-container">

      {/* Header */}
      <div className="Inventory-app-header">
        <button className="Inventory-btn-back" onClick={handleBackToDashboard}>Back</button>
        <h2 className="Inventory-title-main">Inventory Management</h2>
      </div>

      {/* Dashboard */}
      <div className="Inventory-dashboard-wrapper">
        <div className="Inventory-stats-row">
          <div className="Inventory-card-stat Inventory-card-good">
            <div className="Inventory-card-top">
              <img src={ActiveInventory} alt="Good Stock" className="Inventory-card-icon" style={{ width: '24px', height: '24px' }} />
              <h4>Good Stock Items</h4>
            </div>
            <p>No. of items in good stock</p>
            <div className="Inventory-green-container"><h2>{goodCount}</h2></div>
          </div>

          <div className="Inventory-card-stat Inventory-card-low">
            <div className="Inventory-card-top">
              <img src={LowInventory} alt="Low Stock" className="Inventory-card-icon" style={{ width: '24px', height: '24px' }} />
              <h4>Low Stock Items</h4>
            </div>
            <p>No. of items running low</p>
            <h2>{lowCount}</h2>
          </div>

          <div className="Inventory-card-stat Inventory-card-verylow">
            <div className="Inventory-card-top">
              <img src={VeryLowInventory} alt="Very Low Stock" className="Inventory-card-icon" style={{ width: '24px', height: '24px' }} />
              <h4>Very Low Stock Items</h4>
            </div>
            <p>No. of items very low in stock</p>
            <h2>{veryLowCount}</h2>
          </div>

          <div className="Inventory-card-stat Inventory-card-activity">
            <div className="Inventory-activity-header">
              <h4 className="Inventory-activity-heading">Recent Activity</h4>
              {activities.length > 0 && (
                <button
                  type="button"
                  className="Inventory-activity-viewall"
                  onClick={() => setShowActivityModal(true)}
                >
                  View All
                </button>
              )}
            </div>
            <div className="Inventory-activity-list">
              {activities.map((activity, index) => (
                <div key={index} className="Inventory-activity-entry">
                  <p>{activity.message}</p>
                  <span>{activity.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Red Zone Banner (Rot Index) ── */}
      {redZoneItems.length > 0 && (
        <div className="Inventory-redzone-banner">
          <div className="Inventory-redzone-title">
            <Flame size={16} color="#dc2626" />
            <span>{redZoneItems.length} item(s) about to spoil — clear stock before it's wasted</span>
          </div>
          <div className="Inventory-redzone-list">
            {redZoneItems.map(item => (
              <div key={item.id} className="Inventory-redzone-chip">
                <span>{item.name} · {item.rotIndex.score}% used</span>
                <button onClick={() => handleActivateIllusionPricing(item)}>Activate Illusion Pricing</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="Inventory-tabs">
        <button
          className={`Inventory-tab-btn ${activeTab === "inventory" ? "is-active" : ""}`}
          onClick={() => setActiveTab("inventory")}
        >
          <ClipboardList size={16} /> Inventory
        </button>
        <button
          className={`Inventory-tab-btn ${activeTab === "manager" ? "is-active" : ""}`}
          onClick={() => setActiveTab("manager")}
        >
          <Settings2 size={16} /> Item Manager
        </button>
      </div>

      {activeTab === "manager" ? (
        <InventoryItemManager items={data} onChanged={() => refetchAndSync(collection(db, "Restaurant", "orderin_restaurant_1", "inventory"))} />
      ) : (
      <>
      {/* ── Toolbar ── */}
      <div className="Inventory-toolbar-container">
        <div className="Inventory-toolbar-left">

          <input
            id="inventory-search"
            name="inventorySearch"
            type="text"
            className="Inventory-field-search"
            placeholder="Search by item or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoComplete="on"
          />

          <select
            id="inventory-filter-location"
            name="inventoryFilterLocation"
            className="Inventory-filter-select"
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
          >
            <option value="">All Locations</option>
            {existingLocations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>

          <select
            id="inventory-filter-status"
            name="inventoryFilterStatus"
            className="Inventory-filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="Good">Good</option>
            <option value="Low">Low</option>
            <option value="Very Low">Very Low</option>
          </select>

          {(searchTerm || filterLocation || filterStatus) && (
            <button
              className="Inventory-btn-clear-filters"
              onClick={() => { setSearchTerm(""); setFilterLocation(""); setFilterStatus(""); }}
            >
              <X size={14} /> Clear
            </button>
          )}
        </div>

        <div className="Inventory-toolbar-right">
          <button className="Inventory-btn-action Inventory-btn-update" onClick={() => setShowModal(true)}>Stock Update</button>
          <button className="Inventory-btn-action Inventory-btn-alert" onClick={() => setShowAlertsModal(true)}>Set Alerts</button>
        </div>
      </div>

      {/* ── Inventory Table ── */}
      <div className="Inventory-container">
        <div className="Inventory-table-wrapper">
          <table className="Inventory-inventory-table">
            <thead className="Inventory-table-header">
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Quantity Available</th>
                <th>Storage Location</th>
                <th>Item Status</th>
                <th>Rot Index</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length > 0 ? (
                filteredData.map((item, i) => (
                  <tr key={i} className={item.rotBand === ROT_BANDS.RED ? "Inventory-row-verylow" : (item.status === "Very Low" ? "Inventory-row-verylow" : "")}>
                    <td>{item.name}</td>
                    <td>{item.itemCategory}</td>
                    <td>{item.quantity}</td>
                    <td>{item.locationOfStorage}</td>
                    <td>{getStatusIcon(item.status)}</td>
                    <td><RotBadge rotIndex={item.rotIndex} rotBand={item.rotBand} /></td>
                    <td><button className="Inventory-btn-actions-cell" onClick={() => openHistoryModal(item)}>Actions</button></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "24px", color: "#888" }}>
                    No items match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {illusionModalItem && (
        <IllusionPricingModal
          inventoryItem={illusionModalItem}
          onClose={() => setIllusionModalItem(null)}
          onCreated={() => {}}
        />
      )}

      {/* ── Stock Update Modal ── */}
      {showModal && (
        <div className="Inventory-modal-overlay">
          <div className="Inventory-modal-box">
            <div className="Inventory-modal-header">
              <h3>Update stock</h3>
              <button className="Inventory-modal-close" onClick={handleCloseModal}><X size={20} /></button>
            </div>

            <div className="Inventory-modal-body">

              <div className="Inventory-form-group">
                <label htmlFor="stock-category">Category</label>
                <select
                  id="stock-category"
                  name="stockCategory"
                  value={isNewCategory ? "__new__" : selectedCategory}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setIsNewCategory(true);
                      setSelectedCategory("");
                      setSelectedItem("");
                      setItemName("");
                      setIsNewItem(true);
                      setSelectedLocation("");
                      setIsNewLocation(false);
                      setNewLocationName("");
                    } else {
                      setIsNewCategory(false);
                      setNewCategoryName("");
                      setSelectedCategory(e.target.value);
                      setSelectedItem("");
                      setItemName("");
                      setIsNewItem(false);
                    }
                  }}
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  <option value="__new__">+ Add New Category</option>
                </select>
              </div>

              {isNewCategory && (
                <div className="Inventory-form-group">
                  <label htmlFor="stock-new-category">New Category Name</label>
                  <input
                    id="stock-new-category"
                    name="stockNewCategory"
                    type="text"
                    placeholder="Enter new category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}

              {!isNewCategory && (
                <div className="Inventory-form-group">
                  <label htmlFor="stock-item">Item</label>
                  <select
                    id="stock-item"
                    name="stockItem"
                    value={selectedItem}
                    onChange={(e) => {
                      if (e.target.value === "__new__") { setIsNewItem(true); setSelectedItem(""); setItemName(""); }
                      else { setSelectedItem(e.target.value); setIsNewItem(false); }
                    }}
                    disabled={!selectedCategory}
                  >
                    <option value="">Select Item</option>
                    {categoryItems.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                    <option value="__new__">+ Add New Item</option>
                  </select>
                </div>
              )}

              {(isNewCategory || isNewItem) && (
                <div className="Inventory-form-group">
                  <label htmlFor="stock-new-item">New Item Name</label>
                  <input
                    id="stock-new-item"
                    name="stockNewItem"
                    type="text"
                    placeholder="Enter new item name"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}

              <label htmlFor="stock-quantity">Quantity</label>
              <div className="Inventory-quantity-field">
                <input
                  id="stock-quantity"
                  name="stockQuantity"
                  type="number"
                  placeholder="Enter the Quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  autoComplete="off"
                />
                <select
                  id="stock-unit"
                  name="stockUnit"
                  className="Inventory-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="Kgs">Kgs</option>
                  <option value="lit">lit</option>
                  <option value="gram">gram</option>
                  <option value="items">items</option>
                  <option value="Custom">Custom</option>
                </select>
                {unit === "Custom" && (
                  <input
                    id="stock-custom-unit"
                    name="stockCustomUnit"
                    type="text"
                    className="Inventory-custom-unit-input"
                    placeholder="Enter custom unit"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    autoComplete="off"
                  />
                )}
              </div>

              {isNewCategory ? (
                <div className="Inventory-form-group">
                  <label htmlFor="stock-location">Storage Location</label>
                  <select
                    id="stock-location"
                    name="stockLocation"
                    value={isNewLocation ? "__new__" : selectedLocation}
                    onChange={(e) => {
                      if (e.target.value === "__new__") { setIsNewLocation(true); setSelectedLocation(""); setNewLocationName(""); }
                      else { setIsNewLocation(false); setSelectedLocation(e.target.value); setNewLocationName(""); }
                    }}
                  >
                    <option value="">Select Storage Location</option>
                    {existingLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                    <option value="__new__">+ Add New Location</option>
                  </select>
                  {isNewLocation && (
                    <input
                      id="stock-new-location"
                      name="stockNewLocation"
                      type="text"
                      placeholder="Enter new storage location"
                      value={newLocationName}
                      onChange={(e) => setNewLocationName(e.target.value)}
                      style={{ marginTop: "8px" }}
                      autoComplete="off"
                    />
                  )}
                </div>
              ) : (
                selectedAction === "add" && (
                  <>
                    <div className="Inventory-form-group">
                      <label htmlFor="stock-location-text">Storage Location</label>
                      <input
                        id="stock-location-text"
                        name="stockLocationText"
                        type="text"
                        placeholder="Storage Location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        disabled={!isNewItem && !!selectedItem}
                        autoComplete="off"
                      />
                    </div>
                    <div className="Inventory-quantity-field">
                      <div className="Inventory-form-group" style={{ flex: 1 }}>
                        <label htmlFor="stock-arrival-date">Arrival Date (Rot Index)</label>
                        <input
                          id="stock-arrival-date"
                          name="stockArrivalDate"
                          type="date"
                          value={arrivalDate}
                          onChange={(e) => setArrivalDate(e.target.value)}
                        />
                      </div>
                      <div className="Inventory-form-group" style={{ flex: 1 }}>
                        <label htmlFor="stock-shelf-life">Shelf Life (days)</label>
                        <input
                          id="stock-shelf-life"
                          name="stockShelfLife"
                          type="number"
                          min="1"
                          placeholder="e.g. 3"
                          value={shelfLifeDays}
                          onChange={(e) => setShelfLifeDays(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="Inventory-form-group Inventory-expiry-field">
                      <label htmlFor="stock-expiry-date">Expiry Date</label>
                      <input
                        id="stock-expiry-date"
                        name="stockExpiryDate"
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                      />
                    </div>
                  </>
                )
              )}

              {!isNewCategory && selectedAction === "take" && (
                <div className="Inventory-form-group">
                  <label>Batches to Take From</label>
                  {loadingTakeOutBatches ? (
                    <p className="Inventory-batch-empty">Loading batches...</p>
                  ) : takeOutBatches.length === 0 ? (
                    <p className="Inventory-batch-empty">No tracked batches for this item — stock will be deducted from total quantity only.</p>
                  ) : (
                    <div className="Inventory-batch-selector">
                      <label className="Inventory-batch-option Inventory-batch-selectall">
                        <input
                          type="checkbox"
                          checked={selectedBatchIds.length === takeOutBatches.length}
                          onChange={(e) => setSelectedBatchIds(e.target.checked ? takeOutBatches.map(b => b.firestoreId) : [])}
                        />
                        <span>Select All</span>
                      </label>
                      {takeOutBatches.map(b => (
                        <label key={b.firestoreId} className="Inventory-batch-option">
                          <input
                            type="checkbox"
                            checked={selectedBatchIds.includes(b.firestoreId)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedBatchIds(prev => [...prev, b.firestoreId]);
                              else setSelectedBatchIds(prev => prev.filter(id => id !== b.firestoreId));
                            }}
                          />
                          <span>{b.remainingQty} {b.unit} — Expires {b.expiryDate ? b.expiryDate.toDate().toLocaleDateString('en-GB') : "N/A"}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="Inventory-btn-group">
                <button
                  className={`Inventory-btn ${selectedAction === "take" ? "Inventory-green" : "Inventory-red"}`}
                  onClick={() => setSelectedAction("take")}
                >Take Out</button>
                <button
                  className={`Inventory-btn ${selectedAction === "add" ? "Inventory-gray" : "Inventory-red"}`}
                  onClick={() => setSelectedAction("add")}
                >Add Stock</button>
              </div>

              <button className="Inventory-btn Inventory-full Inventory-red" onClick={async () => {
                const itemNameValue = itemName.trim() || selectedItem;
                const itemCategoryValue = finalCategory;
                const locationValue = finalLocation;
                const qty = parseFloat(quantity);

                if (!itemNameValue || !itemCategoryValue || !qty || !selectedAction) {
                  alert("Please complete all required fields."); return;
                }
                if ((isNewCategory || isNewItem) && !locationValue) {
                  alert("Please select or enter a storage location."); return;
                }

                const inventoryCollection = collection(db, "Restaurant", "orderin_restaurant_1", "inventory");
                const itemDocRef = doc(inventoryCollection, itemNameValue);

                try {
                  if (selectedAction === "take") {
                    const existingSnapshot = await getDocs(inventoryCollection);
                    const existingItem = existingSnapshot.docs.find(d => d.id === itemNameValue)?.data();
                    if (!existingItem) { alert("Item not found."); return; }
                    const currentQty = parseFloat(existingItem.quantity.split(' ')[0]);
                    if (qty > currentQty) { alert("Not enough stock available."); return; }
                    if (takeOutBatches.length > 0 && selectedBatchIds.length === 0) {
                      alert("Please select at least one batch to take stock from."); return;
                    }
                    const newQty = currentQty - qty;
                    const newStatus = updateStatusBasedOnQuantity(newQty, existingItem.thresholdLow, existingItem.thresholdVeryLow);
                    await updateDoc(itemDocRef, {
                      quantity: `${newQty} ${existingItem.unit}`, status: newStatus,
                      updatedAt: Timestamp.now(),
                      actions: arrayUnion({ type: "take", quantity: qty, timestamp: Timestamp.now() })
                    });
                    logActivity(itemNameValue, itemCategoryValue, "taken from", existingItem.locationOfStorage);

                    try {
                      if (selectedBatchIds.length > 0) {
                        const consumeResult = await consumeFromSpecificBatches(itemNameValue, selectedBatchIds, qty);
                        await recordInventoryAction(itemNameValue, "take", {
                          quantity: qty,
                          unit: existingItem.unit,
                          batchIds: selectedBatchIds,
                          consumptionLog: consumeResult.consumptionLog,
                          locationOfStorage: existingItem.locationOfStorage,
                        });
                      } else {
                        await recordInventoryAction(itemNameValue, "take", {
                          quantity: qty,
                          unit: existingItem.unit,
                          locationOfStorage: existingItem.locationOfStorage,
                        });
                      }
                    } catch (batchErr) {
                      console.error("Non-fatal: batch/history tracking failed for take out", batchErr);
                    }

                  } else if (selectedAction === "add") {
                    const existingSnapshot = await getDocs(inventoryCollection);
                    const existingItem = existingSnapshot.docs.find(d => d.id === itemNameValue)?.data();

                    const rotFields = {};
                    if (arrivalDate) rotFields.arrivalDate = Timestamp.fromDate(new Date(arrivalDate));
                    if (shelfLifeDays) rotFields.shelfLifeDays = parseFloat(shelfLifeDays);

                    const unitValue = unit === "Custom" ? customUnit : unit;

                    if (existingItem) {
                      const currentQty = parseFloat(existingItem.quantity.split(' ')[0]);
                      const newQty = currentQty + qty;
                      const newStatus = updateStatusBasedOnQuantity(newQty, existingItem.thresholdLow, existingItem.thresholdVeryLow);
                      await updateDoc(itemDocRef, {
                        quantity: `${newQty} ${existingItem.unit}`, status: newStatus,
                        updatedAt: Timestamp.now(),
                        actions: arrayUnion({ type: "add", quantity: qty, timestamp: Timestamp.now() }),
                        ...rotFields
                      });
                      logActivity(itemNameValue, itemCategoryValue, "added to", existingItem.locationOfStorage);
                      await writeAddBatchAndAction(itemNameValue, qty, existingItem.unit, existingItem.locationOfStorage);
                    } else {
                      if (!locationValue) { alert("Please enter storage location for new item."); return; }
                      const newItem = {
                        name: itemNameValue, itemCategory: itemCategoryValue,
                        quantity: `${qty} ${unitValue}`,
                        unit: unitValue,
                        status: updateStatusBasedOnQuantity(qty, 0, 0),
                        thresholdLow: 0, thresholdVeryLow: 0,
                        locationOfStorage: locationValue,
                        updatedAt: Timestamp.now(),
                        actions: [{ type: "add", quantity: qty, timestamp: Timestamp.now() }],
                        ...rotFields
                      };
                      await setDoc(itemDocRef, newItem);
                      logActivity(itemNameValue, itemCategoryValue, "added to", locationValue);
                      await writeAddBatchAndAction(itemNameValue, qty, unitValue, locationValue);
                    }
                  }

                  await refetchAndSync(inventoryCollection);
                  alert("Changes saved successfully!");
                } catch (error) {
                  console.error("Error saving changes:", error);
                  alert("Error saving changes: " + error.message);
                }
                setShowModal(false);
                resetStockForm();
              }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Set Alerts Modal ── */}
      {showAlertsModal && (
        <div className="Inventory-modal-overlay">
          <div className="Inventory-modal-box">
            <div className="Inventory-modal-header">
              <h3>Set Alerts</h3>
              <button className="Inventory-modal-close" onClick={handleCloseAlertsModal}><X size={22} /></button>
            </div>

            <div className="Inventory-modal-body">
              <div className="Inventory-form-group">
                <label htmlFor="alert-category">Category</label>
                <select
                  id="alert-category"
                  name="alertCategory"
                  value={selectedAlertCategory}
                  onChange={(e) => { setSelectedAlertCategory(e.target.value); setSelectedAlertItem(""); }}
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div className="Inventory-form-group">
                <label htmlFor="alert-item">Item</label>
                <select
                  id="alert-item"
                  name="alertItem"
                  value={selectedAlertItem}
                  onChange={(e) => setSelectedAlertItem(e.target.value)}
                  disabled={!selectedAlertCategory}
                >
                  <option value="">Select Item</option>
                  {alertItems.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                </select>
              </div>

              <label className="Inventory-alert-label" htmlFor="alert-low-qty">Low</label>
              <div className="Inventory-quantity-field">
                <input
                  id="alert-low-qty"
                  name="alertLowQty"
                  type="number"
                  placeholder="Low Alert Quantity"
                  value={alertLowThreshold}
                  onChange={(e) => setAlertLowThreshold(e.target.value)}
                  autoComplete="off"
                />
                <select
                  id="alert-low-unit"
                  name="alertLowUnit"
                  className="Inventory-unit"
                  value={alertLowUnit}
                  onChange={(e) => setAlertLowUnit(e.target.value)}
                >
                  <option value="Kgs">Kgs</option>
                  <option value="lit">lit</option>
                  <option value="gram">gram</option>
                  <option value="items">items</option>
                  <option value="Custom">Custom</option>
                </select>
                {alertLowUnit === "Custom" && (
                  <input
                    id="alert-low-custom-unit"
                    name="alertLowCustomUnit"
                    type="text"
                    className="Inventory-custom-unit-input"
                    placeholder="Enter custom unit"
                    value={alertLowCustomUnit}
                    onChange={(e) => setAlertLowCustomUnit(e.target.value)}
                    autoComplete="off"
                  />
                )}
              </div>

              <label className="Inventory-alert-label" htmlFor="alert-verylow-qty">Very Low</label>
              <div className="Inventory-quantity-field">
                <input
                  id="alert-verylow-qty"
                  name="alertVeryLowQty"
                  type="number"
                  placeholder="Very Low Alert Quantity"
                  value={alertVeryLowThreshold}
                  onChange={(e) => setAlertVeryLowThreshold(e.target.value)}
                  autoComplete="off"
                />
                <select
                  id="alert-verylow-unit"
                  name="alertVeryLowUnit"
                  className="Inventory-unit"
                  value={alertVeryLowUnit}
                  onChange={(e) => setAlertVeryLowUnit(e.target.value)}
                >
                  <option value="Kgs">Kgs</option>
                  <option value="lit">lit</option>
                  <option value="gram">gram</option>
                  <option value="items">items</option>
                  <option value="Custom">Custom</option>
                </select>
                {alertVeryLowUnit === "Custom" && (
                  <input
                    id="alert-verylow-custom-unit"
                    name="alertVeryLowCustomUnit"
                    type="text"
                    className="Inventory-custom-unit-input"
                    placeholder="Enter custom unit"
                    value={alertVeryLowCustomUnit}
                    onChange={(e) => setAlertVeryLowCustomUnit(e.target.value)}
                    autoComplete="off"
                  />
                )}
              </div>

              <button className="Inventory-btn Inventory-full Inventory-red" onClick={async () => {
                if (!selectedAlertCategory || !selectedAlertItem || !alertLowThreshold || !alertVeryLowThreshold) {
                  alert("Please complete all fields."); return;
                }
                const inventoryCollection = collection(db, "Restaurant", "orderin_restaurant_1", "inventory");
                const itemDocRef = doc(inventoryCollection, selectedAlertItem);
                try {
                  const existingSnapshot = await getDocs(inventoryCollection);
                  const existingItem = existingSnapshot.docs.find(d => d.id === selectedAlertItem)?.data();
                  if (!existingItem) { alert("Item not found in inventory."); return; }
                  const currentQty = parseFloat(existingItem.quantity.split(' ')[0]);
                  const newStatus = updateStatusBasedOnQuantity(currentQty, parseFloat(alertLowThreshold), parseFloat(alertVeryLowThreshold));
                  await updateDoc(itemDocRef, {
                    thresholdLow: parseFloat(alertLowThreshold),
                    thresholdVeryLow: parseFloat(alertVeryLowThreshold),
                    status: newStatus, updatedAt: Timestamp.now()
                  });
                  logAlertActivity(selectedAlertItem, selectedAlertCategory, alertLowThreshold, alertVeryLowThreshold,
                    existingItem.thresholdLow === undefined ? "created" : "updated");
                  await refetchAndSync(inventoryCollection);
                  alert("Alerts set for the item");
                } catch (error) {
                  console.error("Error setting alerts:", error);
                  alert("Error setting alerts: " + error.message);
                }
                setShowAlertsModal(false);
                resetAlertForm();
              }}>Set Alerts</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Actions History Modal ── */}
      {historyModalItem && (
        <div className="Inventory-modal-overlay" onClick={closeHistoryModal}>
          <div className="Inventory-actions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="Inventory-modal-header">
              <h3>History — {historyModalItem.name}</h3>
              <button className="Inventory-modal-close" onClick={closeHistoryModal}><X size={20} /></button>
            </div>
            {historyItemExpiryChips.length > 0 && (
              <div className="Inventory-expiry-chips-row">
                {historyItemExpiryChips.map((chip, idx) => (
                  <span key={idx} className="Inventory-expiry-chip">
                    {chip.dateKey} × {chip.qty} {chip.unit}
                  </span>
                ))}
              </div>
            )}
            <div className="Inventory-actions-modal-content">
              {loadingHistory ? (
                <p>Loading...</p>
              ) : itemActionHistory.length === 0 ? (
                <p>No recorded history for this item yet.</p>
              ) : (
                itemActionHistory.map(h => (
                  <div key={h.firestoreId} className="Inventory-actions-entry">
                    <span className="Inventory-actions-entry-type">{h.type === "add" ? "Added" : "Taken Out"}</span>
                    <span>{h.quantity} {h.unit}</span>
                    <span>Expiry: {h.expiryDate ? h.expiryDate.toDate().toLocaleDateString('en-GB') : "—"}</span>
                    <span>{h.timestamp?.toDate ? h.timestamp.toDate().toLocaleString('en-GB') : "—"}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Activity Modal ── */}
      {showActivityModal && (
        <div className="Inventory-modal-overlay" onClick={() => setShowActivityModal(false)}>
          <div className="Inventory-actions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="Inventory-modal-header">
              <h3>Recent Activity</h3>
              <button className="Inventory-modal-close" onClick={() => setShowActivityModal(false)}><X size={20} /></button>
            </div>
            <div className="Inventory-actions-modal-content">
              {activities.length === 0 ? (
                <p>No recent activity yet.</p>
              ) : (
                activities.map((activity, index) => (
                  <div key={index} className="Inventory-activity-entry Inventory-activity-entry-full">
                    <p>{activity.message}</p>
                    <span>{activity.timestamp}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;

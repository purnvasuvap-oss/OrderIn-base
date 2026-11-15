import "./Inventory.css";
import { CheckCircle, AlertTriangle, XCircle, Edit, MoreVertical, X, Filter, Utensils, ShoppingCart, AlertCircle,PlusCircle,MinusCircle, Flame, Settings2, ClipboardList } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import routes from "../routes";
import { useNotification } from "../hooks/useNotification";
import { db } from "../firebase";
import { collection, getDocs, doc, setDoc, updateDoc, arrayUnion, Timestamp } from "firebase/firestore";
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

const NEW_OPTION_VALUE = "__new__";
const isItemActive = (item) => !item.itemStatus || item.itemStatus === "active";

function App() {
  const navigate = useNavigate();
  const { addActivity } = useNotification();

  // ----- Data -----
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);

  // ----- Filters -----
  const [filters, setFilters] = useState({
    searchTerm: "",
    location: "",
    status: "",
    filterBy: {
      name: true,
      category: false,
      location: false,
    },
  });
  const [filteredData, setFilteredData] = useState([]);

  // ----- Stock Update modal -----
  const [showModal, setShowModal] = useState(false);
  const [categoryMode, setCategoryMode] = useState("select"); // "select" | "new"
  const [selectedCategory, setSelectedCategory] = useState("");
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [itemMode, setItemMode] = useState("select"); // "select" | "new"
  const [selectedItemId, setSelectedItemId] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("Kgs");
  const [customUnit, setCustomUnit] = useState("");
  const [locationMode, setLocationMode] = useState("select"); // "select" | "new"
  const [selectedLocation, setSelectedLocation] = useState("");
  const [newLocationInput, setNewLocationInput] = useState("");
  const [selectedAction, setSelectedAction] = useState(null); // "add" | "take"

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

  // Recent Activity "View All" modal
  const [showActivityModal, setShowActivityModal] = useState(false);

  // Tabs: "inventory" | "manager"
  const [activeTab, setActiveTab] = useState("inventory");

  // Illusion Pricing modal (Red Zone flash-discount promo)
  const [illusionModalItem, setIllusionModalItem] = useState(null);

  // ----- Set Alerts modal -----
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [alertCategory, setAlertCategory] = useState("");
  const [alertItemId, setAlertItemId] = useState("");
  const [alertUnit, setAlertUnit] = useState("");
  const [alertLowThreshold, setAlertLowThreshold] = useState("");
  const [alertVeryLowThreshold, setAlertVeryLowThreshold] = useState("");

  // Excludes paused/deleted items from every active-inventory view; the raw `data`
  // (all items, any lifecycle status) is still passed to the Item Manager tab.
  const activeData = useMemo(() => data.filter(isItemActive), [data]);

  // ----- Derived data (auto-refreshes whenever `data` changes) -----
  const categories = useMemo(
    () => [...new Set(activeData.map((item) => item.itemCategory).filter(Boolean))].sort(),
    [activeData]
  );
  const locations = useMemo(
    () => [...new Set(activeData.map((item) => item.locationOfStorage).filter(Boolean))].sort(),
    [activeData]
  );
  const itemsInSelectedCategory = useMemo(
    () => activeData.filter((item) => item.itemCategory === selectedCategory),
    [activeData, selectedCategory]
  );
  const itemsInAlertCategory = useMemo(
    () => activeData.filter((item) => item.itemCategory === alertCategory),
    [activeData, alertCategory]
  );
  const selectedExistingItem = useMemo(
    () => (itemMode === "select" ? activeData.find((item) => item.id === selectedItemId) : null),
    [activeData, itemMode, selectedItemId]
  );
  const selectedAlertItem = useMemo(
    () => activeData.find((item) => item.id === alertItemId),
    [activeData, alertItemId]
  );

  const totalItems = activeData.length;
  const goodCount = activeData.filter((item) => item.status === "Good").length;
  const lowCount = activeData.filter((item) => item.status === "Low").length;
  const veryLowCount = activeData.filter((item) => item.status === "Very Low").length;

  const rotData = useMemo(() => withRotIndex(activeData, batchesByItem), [activeData, batchesByItem]);
  const redZoneItems = useMemo(
    () => rotData.filter((item) => item.rotBand === ROT_BANDS.RED),
    [rotData]
  );

  const handleActivateIllusionPricing = (item) => {
    setIllusionModalItem(item);
  };

  const loadBatchesByItem = async () => {
    try {
      const allBatches = await getAllBatchesWithExpiry();
      const grouped = {};
      allBatches.forEach((batch) => {
        if (!grouped[batch.itemName]) grouped[batch.itemName] = [];
        grouped[batch.itemName].push(batch);
      });
      setBatchesByItem(grouped);
    } catch (error) {
      console.error("Error loading batches for Rot Index:", error);
    }
  };

  const ACTION_LABELS = { add: "added to", take: "taken from" };

  const buildActivityFromAction = (item, action) => ({
    message: `${item.name} of ${item.itemCategory} is ${ACTION_LABELS[action.type] || action.type} ${action.quantity} ${item.unit} at ${item.locationOfStorage}`,
    timestamp: action.timestamp.toDate().toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  });

  const fetchInventory = async () => {
    try {
      const inventoryCollection = collection(db, "Restaurant", "orderin_restaurant_2", "inventory");
      const inventorySnapshot = await getDocs(inventoryCollection);
      const items = inventorySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setData(items);
      return items;
    } catch (error) {
      console.error("Error fetching inventory:", error);
      return [];
    }
  };

  // Initial load: pull inventory + seed Recent Activity from stored action history
  useEffect(() => {
    (async () => {
      const items = await fetchInventory();
      const allActions = [];
      items.forEach((item) => {
        if (Array.isArray(item.actions)) {
          item.actions.forEach((action) => allActions.push(buildActivityFromAction(item, action)));
        }
      });
      allActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setActivities(allActions.slice(0, 6));
      setLoading(false);
      loadBatchesByItem();
    })();
  }, []);

  // Filters stay active and search results refresh automatically whenever
  // the underlying inventory data or the filter/search state changes.
  useEffect(() => {
    const term = filters.searchTerm.trim().toLowerCase();
    const filtered = rotData.filter((item) => {
      let matchesSearch = true;
      if (term) {
        const matches = [];
        if (filters.filterBy.name) matches.push((item.name || "").toLowerCase().includes(term));
        if (filters.filterBy.category) matches.push((item.itemCategory || "").toLowerCase().includes(term));
        if (filters.filterBy.location) matches.push((item.locationOfStorage || "").toLowerCase().includes(term));
        matchesSearch = matches.length > 0 ? matches.some(Boolean) : true;
      }
      const matchesLocation = !filters.location || item.locationOfStorage === filters.location;
      const matchesStatus = !filters.status || item.status === filters.status;
      return matchesSearch && matchesLocation && matchesStatus;
    });
    setFilteredData(filtered);
  }, [filters, rotData]);

  useEffect(() => {
    if (selectedAction !== "take" || !selectedExistingItem) {
      setTakeOutBatches([]);
      setSelectedBatchIds([]);
      return;
    }
    setLoadingTakeOutBatches(true);
    getItemBatches(selectedExistingItem.name)
      .then((batches) => {
        const active = batches.filter((b) => b.status === "active" && b.remainingQty > 0);
        setTakeOutBatches(active);
        setSelectedBatchIds([]);
      })
      .catch((error) => console.error("Error loading batches for take out:", error))
      .finally(() => setLoadingTakeOutBatches(false));
  }, [selectedAction, selectedExistingItem]);

  useEffect(() => {
    if (!arrivalDate || !shelfLifeDays) return;
    const days = parseFloat(shelfLifeDays);
    if (isNaN(days) || days <= 0) return;
    const computedExpiry = new Date(arrivalDate);
    computedExpiry.setDate(computedExpiry.getDate() + days);
    setExpiryDate(computedExpiry.toISOString().split("T")[0]);
  }, [arrivalDate, shelfLifeDays]);

  const handleCloseModal = () => {
    setShowModal(false);
    resetStockModal();
  };

  const handleCloseAlertsModal = () => {
    setShowAlertsModal(false);
    resetAlertsModal();
  };

  const resetStockModal = () => {
    setCategoryMode("select");
    setSelectedCategory("");
    setNewCategoryInput("");
    setItemMode("select");
    setSelectedItemId("");
    setNewItemName("");
    setQuantity("");
    setUnit("Kgs");
    setCustomUnit("");
    setLocationMode("select");
    setSelectedLocation("");
    setNewLocationInput("");
    setSelectedAction(null);
    setArrivalDate("");
    setShelfLifeDays("");
    setExpiryDate("");
    setTakeOutBatches([]);
    setSelectedBatchIds([]);
  };

  const resetAlertsModal = () => {
    setAlertCategory("");
    setAlertItemId("");
    setAlertUnit("");
    setAlertLowThreshold("");
    setAlertVeryLowThreshold("");
  };

  const logActivity = (message) => {
    addActivity(message);
    const now = new Date();
    const timestamp = now.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    setActivities((prev) => [{ message, timestamp }, ...prev.slice(0, 5)]);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "Good":
        return <span className="Inventory-status Inventory-good"><CheckCircle size={16} /> Good</span>;
      case "Low":
        return <span className="Inventory-status Inventory-low"><AlertTriangle size={16} /> Low</span>;
      case "Very Low":
        return <span className="Inventory-status Inventory-verylow"><XCircle size={16} /> Very Low</span>;
      default:
        return status;
    }
  };

  const updateStatusBasedOnQuantity = (qty, itemLowThreshold, itemVeryLowThreshold) => {
    const value = parseFloat(qty);
    if (value <= itemVeryLowThreshold) return "Very Low";
    if (value <= itemLowThreshold) return "Low";
    return "Good";
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
      const dateKey = batch.expiryDate ? batch.expiryDate.toDate().toLocaleDateString("en-GB") : "No expiry";
      const unitLabel = batch.unit || "Kgs";
      const key = `${dateKey}__${unitLabel}`;
      if (!groups[key]) {
        groups[key] = {
          dateKey,
          unit: unitLabel,
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

  // ----- Stock Update modal handlers -----
  const handleCategoryChange = (e) => {
    const val = e.target.value;
    if (val === NEW_OPTION_VALUE) {
      setCategoryMode("new");
      setSelectedCategory("");
      setNewCategoryInput("");
      setItemMode("new");
      setSelectedItemId("");
      setNewItemName("");
      setLocationMode("select");
      setSelectedLocation("");
      setNewLocationInput("");
      setUnit("Kgs");
      setCustomUnit("");
    } else {
      setCategoryMode("select");
      setSelectedCategory(val);
      setItemMode("select");
      setSelectedItemId("");
      setNewItemName("");
      setLocationMode("select");
      setSelectedLocation("");
      setNewLocationInput("");
    }
  };

  const handleItemChange = (e) => {
    const val = e.target.value;
    if (val === NEW_OPTION_VALUE) {
      setItemMode("new");
      setSelectedItemId("");
      setNewItemName("");
      setLocationMode("select");
      setSelectedLocation("");
      setNewLocationInput("");
      setUnit("Kgs");
      setCustomUnit("");
      setSelectedAction(null);
    } else {
      setItemMode("select");
      setSelectedItemId(val);
      const item = activeData.find((d) => d.id === val);
      if (item) {
        setUnit(item.unit || "Kgs");
        setCustomUnit("");
        setLocationMode("select");
        setSelectedLocation(item.locationOfStorage || "");
      }
    }
  };

  const handleLocationChange = (e) => {
    const val = e.target.value;
    if (val === NEW_OPTION_VALUE) {
      setLocationMode("new");
      setSelectedLocation("");
    } else {
      setLocationMode("select");
      setSelectedLocation(val);
      setNewLocationInput("");
    }
  };

  const isNewItem = categoryMode === "new" || itemMode === "new";

  const handleSaveStock = async () => {
    const category = categoryMode === "new" ? newCategoryInput.trim() : selectedCategory;
    const itemName = isNewItem ? newItemName.trim() : (selectedExistingItem?.name || "");
    const qty = parseFloat(quantity);
    const finalUnit = isNewItem ? (unit === "Custom" ? customUnit.trim() : unit) : (selectedExistingItem?.unit || unit);
    const finalLocation = isNewItem
      ? (locationMode === "new" ? newLocationInput.trim() : selectedLocation)
      : (selectedExistingItem?.locationOfStorage || "");

    if (!category || !itemName || !quantity || isNaN(qty) || qty <= 0 || !selectedAction) {
      alert("Please fill all required fields and select an action.");
      return;
    }
    if (isNewItem && !finalUnit) {
      alert("Please select or enter a unit.");
      return;
    }
    if (isNewItem && !finalLocation) {
      alert("Please provide a storage location for the new item.");
      return;
    }
    if (selectedAction === "take" && isNewItem) {
      alert("Cannot take stock from an item that doesn't exist yet. Add stock first.");
      return;
    }

    const inventoryCollection = collection(db, "Restaurant", "orderin_restaurant_2", "inventory");
    const itemDocRef = isNewItem ? doc(inventoryCollection, itemName) : doc(inventoryCollection, selectedItemId);

    try {
      if (!isNewItem) {
        const existingItem = selectedExistingItem;
        const currentQty = parseFloat(existingItem.quantity.split(" ")[0]);
        let newQty;
        if (selectedAction === "take") {
          if (qty > currentQty) {
            alert("Not enough stock available.");
            return;
          }
          if (takeOutBatches.length > 0 && selectedBatchIds.length === 0) {
            alert("Please select at least one batch to take stock from.");
            return;
          }
          newQty = currentQty - qty;
        } else {
          newQty = currentQty + qty;
        }
        const newStatus = updateStatusBasedOnQuantity(newQty, existingItem.thresholdLow, existingItem.thresholdVeryLow);
        const rotFields = {};
        if (selectedAction === "add") {
          if (arrivalDate) rotFields.arrivalDate = Timestamp.fromDate(new Date(arrivalDate));
          if (shelfLifeDays) rotFields.shelfLifeDays = parseFloat(shelfLifeDays);
        }
        await updateDoc(itemDocRef, {
          quantity: `${newQty} ${existingItem.unit}`,
          status: newStatus,
          updatedAt: Timestamp.now(),
          actions: arrayUnion({ type: selectedAction, quantity: qty, timestamp: Timestamp.now() }),
          ...rotFields,
        });
        logActivity(
          `${itemName} of ${existingItem.itemCategory} is ${ACTION_LABELS[selectedAction]} ${qty} ${existingItem.unit} at ${existingItem.locationOfStorage}`
        );

        if (selectedAction === "take") {
          try {
            if (selectedBatchIds.length > 0) {
              const consumeResult = await consumeFromSpecificBatches(itemName, selectedBatchIds, qty);
              await recordInventoryAction(itemName, "take", {
                quantity: qty,
                unit: existingItem.unit,
                batchIds: selectedBatchIds,
                consumptionLog: consumeResult.consumptionLog,
                locationOfStorage: existingItem.locationOfStorage,
              });
            } else {
              await recordInventoryAction(itemName, "take", {
                quantity: qty,
                unit: existingItem.unit,
                locationOfStorage: existingItem.locationOfStorage,
              });
            }
          } catch (batchErr) {
            console.error("Non-fatal: batch/history tracking failed for take out", batchErr);
          }
        } else {
          await writeAddBatchAndAction(itemName, qty, existingItem.unit, existingItem.locationOfStorage);
        }
      } else {
        const rotFields = {};
        if (arrivalDate) rotFields.arrivalDate = Timestamp.fromDate(new Date(arrivalDate));
        if (shelfLifeDays) rotFields.shelfLifeDays = parseFloat(shelfLifeDays);

        const newItem = {
          name: itemName,
          itemCategory: category,
          quantity: `${qty} ${finalUnit}`,
          unit: finalUnit,
          status: updateStatusBasedOnQuantity(qty, 0, 0),
          thresholdLow: 0,
          thresholdVeryLow: 0,
          locationOfStorage: finalLocation,
          updatedAt: Timestamp.now(),
          actions: [{ type: "add", quantity: qty, timestamp: Timestamp.now() }],
          ...rotFields,
        };
        await setDoc(itemDocRef, newItem);
        logActivity(`${itemName} of ${category} is added to ${qty} ${finalUnit} at ${finalLocation}`);
        await writeAddBatchAndAction(itemName, qty, finalUnit, finalLocation);
      }

      await fetchInventory();
      loadBatchesByItem();
      alert("Changes saved successfully!");
      setShowModal(false);
      resetStockModal();
    } catch (error) {
      console.error("Error saving changes:", error);
      alert("Error saving changes: " + error.message);
    }
  };

  // ----- Set Alerts modal handlers -----
  const handleAlertCategoryChange = (e) => {
    setAlertCategory(e.target.value);
    setAlertItemId("");
    setAlertUnit("");
    setAlertLowThreshold("");
    setAlertVeryLowThreshold("");
  };

  const handleAlertItemChange = (e) => {
    const val = e.target.value;
    setAlertItemId(val);
    const item = activeData.find((d) => d.id === val);
    if (item) {
      setAlertUnit(item.unit || "");
      setAlertLowThreshold(String(item.thresholdLow ?? 0));
      setAlertVeryLowThreshold(String(item.thresholdVeryLow ?? 0));
    } else {
      setAlertUnit("");
      setAlertLowThreshold("");
      setAlertVeryLowThreshold("");
    }
  };

  const handleSaveAlerts = async () => {
    if (!alertCategory || !alertItemId || alertLowThreshold === "" || alertVeryLowThreshold === "") {
      alert("Please fill all fields.");
      return;
    }
    const low = parseFloat(alertLowThreshold);
    const veryLow = parseFloat(alertVeryLowThreshold);
    if (isNaN(low) || isNaN(veryLow) || low < 0 || veryLow < 0) {
      alert("Thresholds must be valid non-negative numbers.");
      return;
    }

    const item = selectedAlertItem;
    if (!item) {
      alert("Item not found in inventory.");
      return;
    }

    const inventoryCollection = collection(db, "Restaurant", "orderin_restaurant_2", "inventory");
    const itemDocRef = doc(inventoryCollection, item.id);
    const currentQty = parseFloat(item.quantity.split(" ")[0]);
    const newStatus = updateStatusBasedOnQuantity(currentQty, low, veryLow);

    try {
      await updateDoc(itemDocRef, {
        thresholdLow: low,
        thresholdVeryLow: veryLow,
        status: newStatus,
        updatedAt: Timestamp.now(),
      });
      logActivity(`Alert updated for ${item.name}`);
      await fetchInventory();
      alert("Alerts set for the item");
      setShowAlertsModal(false);
      resetAlertsModal();
    } catch (error) {
      console.error("Error setting alerts:", error);
      alert("Error setting alerts: " + error.message);
    }
  };

  return (
    <div className="inventory-container">
      {/* Header */}
      <div className="Inventory-app-header">
        <button className="Inventory-btn-back" onClick={() => navigate(routes.dashboard)}>Back</button>
        <h2 className="Inventory-title-main">Inventory Management</h2>
      </div>

      {/* Dashboard */}
      <div className="Inventory-dashboard-wrapper">
        <div className="Inventory-stats-row">
          <div className="Inventory-card-stat Inventory-card-good">
            <div className="Inventory-card-icon-badge">
              <Utensils size={26} />
            </div>
            <div className="Inventory-card-text">
              <h4>Good Stock Items</h4>
              <p>No. of items in good stock</p>
              <h2>{goodCount}</h2>
            </div>
          </div>

          <div className="Inventory-card-stat Inventory-card-low">
            <div className="Inventory-card-icon-badge">
              <ShoppingCart size={26} />
            </div>
            <div className="Inventory-card-text">
              <h4>Low Stock Items</h4>
              <p>No. of items running low</p>
              <h2>{lowCount}</h2>
            </div>
          </div>

          <div className="Inventory-card-stat Inventory-card-verylow">
            <div className="Inventory-card-icon-badge">
              <AlertCircle size={26} />
            </div>
            <div className="Inventory-card-text">
              <h4>Very Low Stock Items</h4>
              <p>No. of items very low in stock</p>
              <h2>{veryLowCount}</h2>
            </div>
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
              {activities.slice(0, 3).map((activity, index) => (
                <div key={index} className="Inventory-activity-entry">
                  <div className="Inventory-activity-icon">
                    {activity.type === "add" ? (
                      <MinusCircle size={20} />
                    ) : (
                      <PlusCircle size={20} />
                    )}
                  </div>

                  <div className="Inventory-activity-content">
                    <p>{activity.message}</p>
                    <span>{activity.timestamp}</span>
                  </div>
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
            {redZoneItems.map((item) => (
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
        <InventoryItemManager items={data} onChanged={fetchInventory} />
      ) : (
      <>
      {/* Inventory List Header */}
      <div className="Inventory-toolbar-container">
        <div className="Inventory-toolbar-left">

            <input
              type="text"
              className="Inventory-field-search"
              placeholder="Search by item or category..."
              value={filters.searchTerm}
              onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
            />


          <select
            className="Inventory-dropdown-filter"
            value={filters.location || ""}
            onChange={(e) => setFilters({ ...filters, location: e.target.value })}
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>

          <select
            className="Inventory-dropdown-filter"
            value={filters.status || ""}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All Statuses</option>
            <option value="Good">Good</option>
            <option value="Low">Low</option>
            <option value="Very Low">Very Low</option>
          </select>
        </div>

        <div className="Inventory-toolbar-right">
          <button className="Inventory-btn-action Inventory-btn-update" onClick={() => setShowModal(true)}>Stock Update</button>
          <button className="Inventory-btn-action Inventory-btn-alert" onClick={() => setShowAlertsModal(true)}>Set Alerts</button>
        </div>
      </div>

      {/* === INVENTORY TABLE === */}
      <div className="Inventory-container">
        <div className="Inventory-table-wrapper">
          <table className="Inventory-inventory-table">
            <thead className="Inventory-table-header">
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Quantity Available</th>
                <th>Storage location</th>
                <th>Item Status</th>
                <th>Rot Index</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, i) => (
                <tr key={item.id || i} className={item.rotBand === ROT_BANDS.RED ? "Inventory-row-verylow" : (item.status === "Very Low" ? "Inventory-row-verylow" : "")}>
                  <td data-label="Item Name">{item.name}</td>
                  <td data-label="Category">{item.itemCategory}</td>
                  <td data-label="Quantity">{item.quantity}</td>
                  <td data-label="Storage">{item.locationOfStorage}</td>
                  <td data-label="Status">{getStatusIcon(item.status)}</td>
                  <td><RotBadge rotIndex={item.rotIndex} rotBand={item.rotBand} /></td>
                  <td><button className="Inventory-btn-actions-cell" onClick={() => openHistoryModal(item)}>Actions</button></td>
                </tr>
              ))}
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

      {/* Stock Update Modal */}
      {showModal && (
        <div className="Inventory-modal-overlay">
          <div className="Inventory-modal-box">
            <div className="Inventory-modal-header">
              <h3>Update stock</h3>
              <button className="Inventory-modal-close" onClick={handleCloseModal}>
                <X size={20} />
              </button>
            </div>

            <div className="Inventory-modal-body">
              {/* Category */}
              <select
                className="Inventory-dropdown-filter"
                value={categoryMode === "new" ? NEW_OPTION_VALUE : selectedCategory}
                onChange={handleCategoryChange}
              >
                <option value="">Select Category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value={NEW_OPTION_VALUE}>+ Add New Category</option>
              </select>
              {categoryMode === "new" && (
                <input
                  type="text"
                  placeholder="New category name:"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                />
              )}

              {/* Item */}
              {categoryMode === "select" && selectedCategory && (
                <select
                  className="Inventory-dropdown-filter"
                  value={itemMode === "new" ? NEW_OPTION_VALUE : selectedItemId}
                  onChange={handleItemChange}
                >
                  <option value="">Select Item</option>
                  {itemsInSelectedCategory.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                  <option value={NEW_OPTION_VALUE}>+ Add New Item</option>
                </select>
              )}
              {(itemMode === "new" || categoryMode === "new") && (
                <input
                  type="text"
                  placeholder="Item Name:"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                />
              )}

              {/* Quantity + Unit */}
              <div className="Inventory-quantity-field">
                <input
                  type="number"
                  placeholder="Quantity:"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <select
                  className="Inventory-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  disabled={!isNewItem}
                >
                  <option value="Kgs">Kgs</option>
                  <option value="lit">lit</option>
                  <option value="gram">gram</option>
                  <option value="items">items</option>
                  <option value="Custom">Custom</option>
                </select>
                {isNewItem && unit === "Custom" && (
                  <input
                    type="text"
                    className="Inventory-custom-unit-input"
                    placeholder="Enter custom unit"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                  />
                )}
              </div>

              {/* Storage location */}
              {isNewItem ? (
                <>
                  <select
                    className="Inventory-dropdown-filter"
                    value={locationMode === "new" ? NEW_OPTION_VALUE : selectedLocation}
                    onChange={handleLocationChange}
                  >
                    <option value="">Select Storage Location</option>
                    {locations.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                    <option value={NEW_OPTION_VALUE}>+ Add New Location</option>
                  </select>
                  {locationMode === "new" && (
                    <input
                      type="text"
                      placeholder="New storage location:"
                      value={newLocationInput}
                      onChange={(e) => setNewLocationInput(e.target.value)}
                    />
                  )}
                </>
              ) : (
                selectedExistingItem && (
                  <input type="text" value={selectedExistingItem.locationOfStorage || ""} disabled />
                )
              )}

              {selectedAction === "add" && (
                <div className="Inventory-quantity-field">
                  <div className="Inventory-form-group" style={{ flex: 1 }}>
                    <label htmlFor="stock-arrival-date">Arrival Date (Rot Index)</label>
                    <input
                      id="stock-arrival-date"
                      type="date"
                      value={arrivalDate}
                      onChange={(e) => setArrivalDate(e.target.value)}
                    />
                  </div>
                  <div className="Inventory-form-group" style={{ flex: 1 }}>
                    <label htmlFor="stock-shelf-life">Shelf Life (days)</label>
                    <input
                      id="stock-shelf-life"
                      type="number"
                      min="1"
                      placeholder="e.g. 3"
                      value={shelfLifeDays}
                      onChange={(e) => setShelfLifeDays(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {!isNewItem && selectedAction === "take" && (
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
                          onChange={(e) => setSelectedBatchIds(e.target.checked ? takeOutBatches.map((b) => b.firestoreId) : [])}
                        />
                        <span>Select All</span>
                      </label>
                      {takeOutBatches.map((b) => (
                        <label key={b.firestoreId} className="Inventory-batch-option">
                          <input
                            type="checkbox"
                            checked={selectedBatchIds.includes(b.firestoreId)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedBatchIds((prev) => [...prev, b.firestoreId]);
                              else setSelectedBatchIds((prev) => prev.filter((id) => id !== b.firestoreId));
                            }}
                          />
                          <span>{b.remainingQty} {b.unit} — Expires {b.expiryDate ? b.expiryDate.toDate().toLocaleDateString("en-GB") : "N/A"}</span>
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
                  disabled={isNewItem}
                  title={isNewItem ? "Cannot take stock from a new item" : ""}
                >Take Out</button>
                <button
                  className={`Inventory-btn ${selectedAction === "add" ? "Inventory-gray" : "Inventory-red"}`}
                  onClick={() => setSelectedAction("add")}
                >Add Stock</button>
              </div>
              <button className="Inventory-btn Inventory-full Inventory-red" onClick={handleSaveStock}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Alerts Modal */}
      {showAlertsModal && (
        <div className="Inventory-modal-overlay">
          <div className="Inventory-modal-box">
            <div className="Inventory-modal-header">
              <h3>Set Alerts</h3>
              <button className="Inventory-modal-close" onClick={handleCloseAlertsModal}>
                <X size={22} />
              </button>
            </div>

            <div className="Inventory-modal-body">
              <select
                className="Inventory-dropdown-filter"
                value={alertCategory}
                onChange={handleAlertCategoryChange}
              >
                <option value="">Select Category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <select
                className="Inventory-dropdown-filter"
                value={alertItemId}
                onChange={handleAlertItemChange}
                disabled={!alertCategory}
              >
                <option value="">Select Item</option>
                {itemsInAlertCategory.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>

              {selectedAlertItem && (
                <p className="Inventory-alert-unit-note">
                  Unit: <strong>{alertUnit || "—"}</strong> · Current quantity: <strong>{selectedAlertItem.quantity}</strong>
                </p>
              )}

              <div className="Inventory-quantity-field">
                <input
                  type="number"
                  placeholder="Low threshold (e.g., 0)"
                  value={alertLowThreshold}
                  onChange={(e) => setAlertLowThreshold(e.target.value)}
                  disabled={!alertItemId}
                />
                <span className="Inventory-unit">{alertUnit || "unit"}</span>
              </div>
              <div className="Inventory-quantity-field">
                <input
                  type="number"
                  placeholder="Very low threshold (e.g., 0)"
                  value={alertVeryLowThreshold}
                  onChange={(e) => setAlertVeryLowThreshold(e.target.value)}
                  disabled={!alertItemId}
                />
                <span className="Inventory-unit">{alertUnit || "unit"}</span>
              </div>

              <button className="Inventory-btn Inventory-full Inventory-red" onClick={handleSaveAlerts}>
                Set Alerts
              </button>
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
                itemActionHistory.map((h) => (
                  <div key={h.firestoreId} className="Inventory-actions-entry">
                    <span className="Inventory-actions-entry-type">{h.type === "add" ? "Added" : "Taken Out"}</span>
                    <span>{h.quantity} {h.unit}</span>
                    <span>Expiry: {h.expiryDate ? h.expiryDate.toDate().toLocaleDateString("en-GB") : "—"}</span>
                    <span>{h.timestamp?.toDate ? h.timestamp.toDate().toLocaleString("en-GB") : "—"}</span>
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

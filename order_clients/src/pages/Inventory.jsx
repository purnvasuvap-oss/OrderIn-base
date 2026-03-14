import "./Inventory.css";
import { CheckCircle, AlertTriangle, XCircle, Edit, MoreVertical, X, Filter } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import routes from "../routes";
import { useNotification } from "../hooks/useNotification";
import { db } from "../firebase";
import { collection, getDocs, doc, setDoc, updateDoc, arrayUnion, Timestamp } from "firebase/firestore";

function App() {
  const navigate = useNavigate();
  const { addActivity } = useNotification();
  const [showModal, setShowModal] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [unit, setUnit] = useState("Kgs");
  const [customUnit, setCustomUnit] = useState("");
  const [selectedAction, setSelectedAction] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState("");
  const [alertItemName, setAlertItemName] = useState("");
  const [alertItemCategory, setAlertItemCategory] = useState("");
  const [alertLowThreshold, setAlertLowThreshold] = useState("0");
  const [alertVeryLowThreshold, setAlertVeryLowThreshold] = useState("0");
  const [alertLowUnit, setAlertLowUnit] = useState("Kgs");
  const [alertVeryLowUnit, setAlertVeryLowUnit] = useState("Kgs");
  const [alertLowCustomUnit, setAlertLowCustomUnit] = useState("");
  const [alertVeryLowCustomUnit, setAlertVeryLowCustomUnit] = useState("");
  const [filters, setFilters] = useState({
    searchTerm: "",
    filterBy: {
      name: true,
      category: false,
      location: false,
    },
  });
  const [filteredData, setFilteredData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Calculate dynamic counts
  const totalItems = data.length;
  const goodCount = data.filter(item => item.status === "Good").length;
  const lowCount = data.filter(item => item.status === "Low").length;
  const veryLowCount = data.filter(item => item.status === "Very Low").length;


  // Fetch inventory data from Firestore on component mount
  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const inventoryCollection = collection(db, "Restaurant", "orderin_restaurant_1", "inventory");
        const inventorySnapshot = await getDocs(inventoryCollection);
        const items = inventorySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setData(items);

        // Collect all actions from all items, sort by timestamp descending, take last 2
        const allActions = [];
        items.forEach(item => {
          if (item.actions && Array.isArray(item.actions)) {
            item.actions.forEach(action => {
              allActions.push({
                message: `${item.name} of ${item.itemCategory} is ${action.type}d ${action.quantity} ${item.unit} at ${item.locationOfStorage}`,
                timestamp: action.timestamp.toDate().toLocaleString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })
              });
            });
          }
        });
        allActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setActivities(allActions.slice(0, 2));
      } catch (error) {
        console.error("Error fetching inventory:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchInventory();
  }, []);

  // Filter data based on search input and selected filters
  useEffect(() => {
    const filtered = data.filter(item => {
      const term = filters.searchTerm.toLowerCase();
      if (!term) return true;

      const matches = [];
      if (filters.filterBy.name) {
        matches.push(item.name.toLowerCase().includes(term));
      }
      if (filters.filterBy.category) {
        matches.push(item.itemCategory.toLowerCase().includes(term));
      }
      if (filters.filterBy.location) {
        matches.push(item.locationOfStorage.toLowerCase().includes(term));
      }

      return matches.some(match => match);
    });
    setFilteredData(filtered);
  }, [filters.searchTerm, filters.filterBy.name, filters.filterBy.category, filters.filterBy.location, data]);

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleCloseAlertsModal = () => {
    setShowAlertsModal(false);
  };

  const logActivity = (itemName, itemCategory, action, location) => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
    const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const message = `${itemName} of ${itemCategory} is ${action} ${location} at ${time} on ${date}`;
    addActivity(message);
    const timestamp = now.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const newActivity = { message, timestamp };
    setActivities(prev => [newActivity, ...prev.slice(0, 1)]); // Keep only last 2 activities for inventory page
  };



  const getStatusIcon = (status) => {
    switch (status) {
      case "Good":
        return <span className="Inventory-status Inventory-good"><CheckCircle size={16}/> Good</span>;
      case "Low":
        return <span className="Inventory-status Inventory-low"><AlertTriangle size={16}/> Low</span>;
      case "Very Low":
        return <span className="Inventory-status Inventory-verylow"><XCircle size={16}/> Very Low</span>;
      default:
        return status;
    }
  };

  const updateStatusBasedOnQuantity = (quantity, itemLowThreshold, itemVeryLowThreshold) => {
    const qty = parseFloat(quantity);
    if (qty <= itemVeryLowThreshold) {
      return "Very Low";
    } else if (qty <= itemLowThreshold) {
      return "Low";
    } else {
      return "Good";
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
            <div className="Inventory-card-top">
              <img src="/images/good.png" alt="Good Stock" className="Inventory-card-icon" style={{ width: '24px', height: '24px' }} />
              <h4>Good Stock Items</h4>
            </div>
            <p>No. of items in good stock</p>
            <div className="Inventory-green-container">
              <h2>{goodCount}</h2>
            </div>
          </div>

          <div className="Inventory-card-stat Inventory-card-low">
            <div className="Inventory-card-top">
              <img src="/images/low.png" alt="Low Stock" className="Inventory-card-icon" style={{ width: '24px', height: '24px' }} />
              <h4>Low Stock Items</h4>
            </div>
            <p>No. of items running low</p>
            <h2>{lowCount}</h2>
          </div>

          <div className="Inventory-card-stat Inventory-card-verylow">
            <div className="Inventory-card-top">
              <img src="/images/very-low.png" alt="Very Low Stock" className="Inventory-card-icon" style={{ width: '24px', height: '24px' }} />
              <h4>Very Low Stock Items</h4>
            </div>
            <p>No. of items very low in stock</p>
            <h2>{veryLowCount}</h2>
          </div>

          <div className="Inventory-card-stat Inventory-card-activity">
            <h4 className="Inventory-activity-heading">Recent Activity</h4>
            {activities.slice(0, 2).map((activity, index) => (
              <div key={index} className="Inventory-activity-entry">
                <p>{activity.message}</p>
                <span>{activity.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Inventory List Header */}
      <div className="Inventory-toolbar-container">
        <div className="Inventory-toolbar-left">
          <h4 className="Inventory-toolbar-title">Inventory List</h4>

          <div className="Inventory-input-search">
            <input
              type="text"
              className="Inventory-field-search"
              placeholder="Find Item..."
              value={filters.searchTerm}
              onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
            />
            <Filter
              className="Inventory-icon-filter"
              onClick={() => setShowFilterModal(true)}
              style={{ cursor: 'pointer' }}
            />
          </div>


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
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, i) => (
              <tr key={i} className={item.status === "Very Low" ? "Inventory-row-verylow" : ""}>
                <td>{item.name}</td>
                <td>{item.itemCategory}</td>
                <td>{item.quantity}</td>
                <td>{item.locationOfStorage}</td>
                <td>{getStatusIcon(item.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Modal */}
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
              <input type="text" placeholder="Item Name:" />
              <input type="text" placeholder="Item Category:" />
              <div className="Inventory-quantity-field">
                <input
                  type="number"
                  placeholder="Quantity:"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <select className="Inventory-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="Kgs">Kgs</option>
                  <option value="lit">lit</option>
                  <option value="gram">gram</option>
                  <option value="items">items</option>
                  <option value="Custom">Custom</option>
                </select>
                {unit === "Custom" && (
                  <input
                    type="text"
                    className="Inventory-custom-unit-input"
                    placeholder="Enter custom unit"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                  />
                )}
              </div>
              {selectedAction === "add" && (
                <input
                  type="text"
                  placeholder="Storage Location:"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
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
                const itemName = document.querySelector('input[placeholder="Item Name:"]').value;
                const itemCategory = document.querySelector('input[placeholder="Item Category:"]').value;
                const qty = parseFloat(quantity);
                if (!itemName || !qty || !selectedAction) {
                  alert("Please fill all fields and select an action.");
                  return;
                }

                const inventoryCollection = collection(db, "Restaurant", "orderin_restaurant_1", "inventory");
                const itemDocRef = doc(inventoryCollection, itemName);

                try {
                  if (selectedAction === "take") {
                    // Fetch existing item
                    const existingSnapshot = await getDocs(inventoryCollection);
                    const existingItem = existingSnapshot.docs.find(doc => doc.id === itemName)?.data();
                    if (!existingItem) {
                      alert("Item not found.");
                      return;
                    }
                    const currentQty = parseFloat(existingItem.quantity.split(' ')[0]);
                    if (qty > currentQty) {
                      alert("Not enough stock available.");
                      return;
                    }
                    const newQty = currentQty - qty;
                    const newStatus = updateStatusBasedOnQuantity(newQty, existingItem.thresholdLow, existingItem.thresholdVeryLow);
                    await updateDoc(itemDocRef, {
                      quantity: `${newQty} ${existingItem.unit}`,
                      status: newStatus,
                      updatedAt: Timestamp.now(),
                      actions: arrayUnion({
                        type: "take",
                        quantity: qty,
                        timestamp: Timestamp.now()
                      })
                    });
                    logActivity(itemName, itemCategory, "taken from", existingItem.locationOfStorage);
                  } else if (selectedAction === "add") {
                    const existingSnapshot = await getDocs(inventoryCollection);
                    const existingItem = existingSnapshot.docs.find(doc => doc.id === itemName)?.data();
                    if (existingItem) {
                      const currentQty = parseFloat(existingItem.quantity.split(' ')[0]);
                      const newQty = currentQty + qty;
                      const newStatus = updateStatusBasedOnQuantity(newQty, existingItem.thresholdLow, existingItem.thresholdVeryLow);
                      await updateDoc(itemDocRef, {
                        quantity: `${newQty} ${existingItem.unit}`,
                        status: newStatus,
                        updatedAt: Timestamp.now(),
                        actions: arrayUnion({
                          type: "add",
                          quantity: qty,
                          timestamp: Timestamp.now()
                        })
                      });
                      logActivity(itemName, itemCategory, "added to", existingItem.locationOfStorage);
                    } else {
                      if (!location) {
                        alert("Please enter storage location for new item.");
                        return;
                      }
                      const newItem = {
                        name: itemName,
                        itemCategory: itemCategory,
                        quantity: `${qty} ${unit === "Custom" ? customUnit : unit}`,
                        unit: unit === "Custom" ? customUnit : unit,
                        status: updateStatusBasedOnQuantity(qty, 0, 0),
                        thresholdLow: 0,
                        thresholdVeryLow: 0,
                        locationOfStorage: location,
                        updatedAt: Timestamp.now(),
                        actions: [{
                          type: "add",
                          quantity: qty,
                          timestamp: Timestamp.now()
                        }]
                      };
                      await setDoc(itemDocRef, newItem);
                      logActivity(itemName, itemCategory, "added to", location);
                    }
                  }
                  // Refetch data
                  const updatedSnapshot = await getDocs(inventoryCollection);
                  const updatedItems = updatedSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                  }));
                  setData(updatedItems);

                  // Update activities after save
                  const allActions = [];
                  updatedItems.forEach(item => {
                    if (item.actions && Array.isArray(item.actions)) {
                      item.actions.forEach(action => {
                        allActions.push({
                          message: `${item.name} of ${item.itemCategory} is ${action.type}d ${action.quantity} ${item.unit} at ${item.locationOfStorage}`,
                          timestamp: action.timestamp.toDate().toLocaleString('en-GB', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })
                        });
                      });
                    }
                  });
                  allActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                  setActivities(allActions.slice(0, 2));
                  alert("Changes saved successfully!");
                } catch (error) {
                  console.error("Error saving changes:", error);
                  alert("Error saving changes: " + error.message);
                }
                setShowModal(false);
                setSelectedAction(null);
                setQuantity("");
                setLocation("");
              }}>Save Changes</button>
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
              <input type="text" placeholder="Item Name:" value={alertItemName} onChange={(e) => setAlertItemName(e.target.value)} />
              <input type="text" placeholder="Item Category:" value={alertItemCategory} onChange={(e) => setAlertItemCategory(e.target.value)} />
              <div className="Inventory-quantity-field">
                <input type="number" placeholder="Low threshold (e.g., 0)" value={alertLowThreshold} onChange={(e) => setAlertLowThreshold(e.target.value)} />
                <select className="Inventory-unit" value={alertLowUnit} onChange={(e) => setAlertLowUnit(e.target.value)}>
                  <option value="Kgs">Kgs</option>
                  <option value="lit">lit</option>
                  <option value="gram">gram</option>
                  <option value="items">items</option>
                  <option value="Custom">Custom</option>
                </select>
                {alertLowUnit === "Custom" && (
                  <input
                    type="text"
                    className="Inventory-custom-unit-input"
                    placeholder="Enter custom unit"
                    value={alertLowCustomUnit}
                    onChange={(e) => setAlertLowCustomUnit(e.target.value)}
                  />
                )}
              </div>
              <div className="Inventory-quantity-field">
                <input type="number" placeholder="Very low threshold (e.g., 0)" value={alertVeryLowThreshold} onChange={(e) => setAlertVeryLowThreshold(e.target.value)} />
                <select className="Inventory-unit" value={alertVeryLowUnit} onChange={(e) => setAlertVeryLowUnit(e.target.value)}>
                  <option value="Kgs">Kgs</option>
                  <option value="lit">lit</option>
                  <option value="gram">gram</option>
                  <option value="items">items</option>
                  <option value="Custom">Custom</option>
                </select>
                {alertVeryLowUnit === "Custom" && (
                  <input
                    type="text"
                    className="Inventory-custom-unit-input"
                    placeholder="Enter custom unit"
                    value={alertVeryLowCustomUnit}
                    onChange={(e) => setAlertVeryLowCustomUnit(e.target.value)}
                  />
                )}
              </div>

              <button className="Inventory-btn Inventory-full Inventory-red" onClick={async () => {
                if (!alertItemName || !alertItemCategory || !alertLowThreshold || !alertVeryLowThreshold) {
                  alert("Please fill all fields.");
                  return;
                }
                const inventoryCollection = collection(db, "Restaurant", "orderin_restaurant_1", "inventory");
                const itemDocRef = doc(inventoryCollection, alertItemName);

                try {
                  const existingSnapshot = await getDocs(inventoryCollection);
                  const existingItem = existingSnapshot.docs.find(doc => doc.id === alertItemName)?.data();
                  if (!existingItem) {
                    alert("Item not found in inventory.");
                    return;
                  }
                  const currentQty = parseFloat(existingItem.quantity.split(' ')[0]);
                  const newStatus = updateStatusBasedOnQuantity(currentQty, parseFloat(alertLowThreshold), parseFloat(alertVeryLowThreshold));
                  await updateDoc(itemDocRef, {
                    thresholdLow: parseFloat(alertLowThreshold),
                    thresholdVeryLow: parseFloat(alertVeryLowThreshold),
                    status: newStatus,
                    updatedAt: Timestamp.now()
                  });
                  // Refetch data
                  const updatedSnapshot = await getDocs(inventoryCollection);
                  const updatedItems = updatedSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                  }));
                  setData(updatedItems);

                  // Update activities after save
                  const allActions = [];
                  updatedItems.forEach(item => {
                    if (item.actions && Array.isArray(item.actions)) {
                      item.actions.forEach(action => {
                        allActions.push({
                          message: `${item.name} of ${item.itemCategory} is ${action.type}d ${action.quantity} ${item.unit} at ${item.locationOfStorage}`,
                          timestamp: action.timestamp.toDate().toLocaleString('en-GB', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })
                        });
                      });
                    }
                  });
                  allActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                  setActivities(allActions.slice(0, 2));
                  alert("Alerts set for the item");
                } catch (error) {
                  console.error("Error setting alerts:", error);
                  alert("Error setting alerts: " + error.message);
                }
                setShowAlertsModal(false);
                setAlertItemName("");
                setAlertItemCategory("");
                setAlertLowThreshold("0");
                setAlertVeryLowThreshold("0");
                setAlertLowUnit("Kgs");
                setAlertVeryLowUnit("Kgs");
                setAlertLowCustomUnit("");
                setAlertVeryLowCustomUnit("");
              }}>Set Alerts</button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="Inventory-modal-overlay" onClick={() => setShowFilterModal(false)}>
          <div className="Inventory-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="Inventory-modal-header">
              <h3>Filter Options</h3>
              <button className="Inventory-modal-close" onClick={() => setShowFilterModal(false)}>
                <X size={22} />
              </button>
            </div>

            <div className="Inventory-modal-body">
              <div className="Inventory-filter-options">
                <label>
                  <input
                    type="checkbox"
                    checked={filters.filterBy.name}
                    onChange={(e) => setFilters({
                      ...filters,
                      filterBy: { ...filters.filterBy, name: e.target.checked }
                    })}
                  />
                  Item Name
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={filters.filterBy.category}
                    onChange={(e) => setFilters({
                      ...filters,
                      filterBy: { ...filters.filterBy, category: e.target.checked }
                    })}
                  />
                  Item Category
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={filters.filterBy.location}
                    onChange={(e) => setFilters({
                      ...filters,
                      filterBy: { ...filters.filterBy, location: e.target.checked }
                    })}
                  />
                  Storage Location
                </label>
              </div>
              <button className="Inventory-btn Inventory-full Inventory-red" onClick={() => setShowFilterModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
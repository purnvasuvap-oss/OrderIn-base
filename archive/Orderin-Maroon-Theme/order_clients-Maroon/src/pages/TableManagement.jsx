import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Plus, Search, Pencil, X, Trash2 } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import routes from "../routes";
import "./TableManagement.css";
import ManualOrderModal from "../components/ManualOrderModal";
import { subscribeRecentOrders, formatTime } from "../services/orderService";
import {
  seedTablesIfEmpty,
  subscribeTables,
  addTable,
  updateTableCapacity,
  reserveTable,
  cancelReservation,
  markTableCleaning,
  markTableReady,
  deleteTable,
  reconcileOccupiedTables,
  reconcileReservations,
  isReservationPending,
  formatReservedAt,
} from "../services/tableService";

const STATUS_META = {
  available: { label: "Available", key: "available" },
  occupied: { label: "Occupied", key: "occupied" },
  reserved: { label: "Reserved", key: "reserved" },
  cleaning: { label: "Cleaning", key: "cleaning" },
};

// Same tableNumber/tableNo/table fallback chain used by utils/tableCount.js,
// so the live-order lookup here never misses a record written under a
// different key by a different code path.
const getOrderTableNumber = (order) => {
  const raw = order.tableNumber || order.tableNo || order.table || null;
  if (raw === null || raw === undefined || raw === "N/A") return null;
  return String(raw);
};

/** Evenly spaced chair dots around an ellipse, count driven by capacity — a
 * lightweight stand-in for the demo's per-seat SVG diagram that scales with
 * whatever capacity a table actually has, instead of a fixed illustration. */
const ChairDiagram = ({ capacity }) => {
  const cap = Math.max(1, Math.min(Number(capacity) || 4, 14));
  const chairs = useMemo(() => {
    return Array.from({ length: cap }).map((_, i) => {
      const angle = (i / cap) * 2 * Math.PI - Math.PI / 2;
      const rx = 50;
      const ry = 34;
      return {
        cx: 60 + rx * Math.cos(angle),
        cy: 40 + ry * Math.sin(angle),
      };
    });
  }, [cap]);

  return (
    <svg className="tile-diagram" viewBox="0 0 120 80" aria-hidden="true">
      <rect x="26" y="18" width="68" height="44" rx="12" className="tile-table-shape" />
      {chairs.map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r="5.5" className="tile-chair" />
      ))}
    </svg>
  );
};

const timeSince = (timestamp) => {
  if (!timestamp) return "";
  let date;
  if (typeof timestamp.toDate === "function") date = timestamp.toDate();
  else if (timestamp instanceof Date) date = timestamp;
  else date = new Date(timestamp);
  if (isNaN(date.getTime())) return "";
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
};

// Prefer the new real `reservedAt` timestamp; fall back to the legacy
// free-text `reservedTime` field for tables reserved before this change.
const reservedTimeLabel = (table) => formatReservedAt(table?.reservedAt) || table?.reservedTime || null;

/* ---------------- Reserve table modal ---------------- */
// Converts a stored reservedAt ISO string into the local value a
// <input type="datetime-local"> needs (YYYY-MM-DDTHH:mm, no timezone/seconds).
const toDatetimeLocalValue = (reservedAt) => {
  if (!reservedAt) return "";
  const d = new Date(reservedAt);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function ReserveTableModal({ table, onClose, onConfirm }) {
  const isUpdate = table?.status === "reserved";
  const [name, setName] = useState(table?.reservedName || "");
  const [time, setTime] = useState(toDatetimeLocalValue(table?.reservedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!table) return null;

  const handleConfirm = async () => {
    if (!name.trim()) {
      setError("Guest / party name is required");
      return;
    }
    if (!time) {
      setError("Arrival date & time is required");
      return;
    }
    const parsed = new Date(time);
    if (Number.isNaN(parsed.getTime())) {
      setError("Enter a valid arrival date & time");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onConfirm(table.num, name.trim(), parsed.toISOString());
    } catch (err) {
      setError("Failed to reserve table: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tm-overlay" onClick={onClose}>
      <div className="tm-modal tm-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-head">
          <h3>{isUpdate ? "Update Reservation — " : "Reserve "}Table {table.num}</h3>
          <button className="tm-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="tm-modal-body">
          {error && <div className="tm-error">{error}</div>}
          <div className="tm-form-group">
            <label>Guest / party name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sharma party of 4"
              autoFocus
            />
          </div>
          <div className="tm-form-group">
            <label>Arrival date &amp; time</label>
            <input
              type="datetime-local"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
        <div className="tm-modal-foot">
          <button className="tm-btn tm-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="tm-btn tm-btn-gold" onClick={handleConfirm} disabled={saving}>
            {saving ? "Saving…" : isUpdate ? "Update" : "Reserve"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Add table modal ---------------- */
function AddTableModal({ suggestedNum, onClose, onConfirm }) {
  const [num, setNum] = useState(String(suggestedNum));
  const [capacity, setCapacity] = useState("4");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!num.trim() || Number(num) <= 0) {
      setError("Enter a valid table number");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onConfirm(Number(num), Number(capacity) || 4);
    } catch (err) {
      setError("Failed to add table: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tm-overlay" onClick={onClose}>
      <div className="tm-modal tm-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-head">
          <h3>Add Table</h3>
          <button className="tm-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="tm-modal-body">
          {error && <div className="tm-error">{error}</div>}
          <div className="tm-form-group">
            <label>Table number</label>
            <input type="number" value={num} onChange={(e) => setNum(e.target.value)} autoFocus />
          </div>
          <div className="tm-form-group">
            <label>Seat capacity</label>
            <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
        </div>
        <div className="tm-modal-foot">
          <button className="tm-btn tm-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="tm-btn tm-btn-gold" onClick={handleConfirm} disabled={saving}>
            {saving ? "Adding…" : "Add Table"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Delete table confirm modal ---------------- */
function DeleteTableConfirmModal({ table, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (!table) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    setError("");
    try {
      await onConfirm(table.num);
    } catch (err) {
      setError("Failed to delete table: " + err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="tm-overlay" onClick={onClose}>
      <div className="tm-modal tm-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-head">
          <h3>Delete Table {table.num}</h3>
          <button className="tm-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="tm-modal-body">
          {error && <div className="tm-error">{error}</div>}
          <p>
            Remove Table {table.num} from the floor plan? This only deletes the table
            entry — it does not affect any existing orders. This cannot be undone.
          </p>
        </div>
        <div className="tm-modal-foot">
          <button className="tm-btn tm-btn-ghost" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button className="tm-btn tm-btn-danger" onClick={handleConfirm} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete Table"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Detail modal (mirrors tile info + actions) ---------------- */
function TableDetailModal({ table, liveOrders, onClose, actions }) {
  const [editingCapacity, setEditingCapacity] = useState(false);
  const [capacityDraft, setCapacityDraft] = useState(String(table?.capacity || 4));

  useEffect(() => {
    setCapacityDraft(String(table?.capacity || 4));
    setEditingCapacity(false);
  }, [table?.num]);

  if (!table) return null;
  const meta = STATUS_META[table.displayStatus] || STATUS_META.available;
  const primaryOrder = liveOrders && liveOrders[0];

  return (
    <div className="tm-overlay" onClick={onClose}>
      <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-head">
          <h3>
            Table {table.num}
            <span className={`tm-pill tm-pill-${meta.key}`}>{meta.label}</span>
          </h3>
          <button className="tm-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="tm-modal-body">
          <div className="tm-modal-diagram">
            <ChairDiagram capacity={table.capacity} />
          </div>

          <div className="tm-mrow">
            <span>Capacity</span>
            {editingCapacity ? (
              <span className="tm-capacity-edit">
                <input
                  type="number"
                  min="1"
                  value={capacityDraft}
                  onChange={(e) => setCapacityDraft(e.target.value)}
                  autoFocus
                />
                <button
                  className="tm-btn tm-btn-gold tm-btn-xs"
                  onClick={async () => {
                    await actions.onEditCapacity(table.num, capacityDraft);
                    setEditingCapacity(false);
                  }}
                >
                  Save
                </button>
              </span>
            ) : (
              <span>
                {table.capacity} seats{" "}
                <button className="tm-icon-btn tm-icon-btn-inline" onClick={() => setEditingCapacity(true)}>
                  <Pencil size={13} />
                </button>
              </span>
            )}
          </div>

          {table.displayStatus === "occupied" && primaryOrder && (
            <>
              <div className="tm-mrow">
                <span>Order</span>
                <span title={primaryOrder.id}>{primaryOrder.id}</span>
              </div>
              <div className="tm-mrow">
                <span>Type</span>
                <span>{primaryOrder.isManualOrder ? "Manual order" : "Customer order"}</span>
              </div>
              <div className="tm-mrow">
                <span>Items</span>
                <span>{Array.isArray(primaryOrder.items) ? primaryOrder.items.length : 0}</span>
              </div>
              <div className="tm-mrow">
                <span>Total</span>
                <span>₹{(Number(primaryOrder.totalCost) || 0).toFixed(2)}</span>
              </div>
              <div className="tm-mrow">
                <span>Placed</span>
                <span>
                  {formatTime(primaryOrder.timestamp)} · {timeSince(primaryOrder.timestamp)}
                </span>
              </div>
              {liveOrders.length > 1 && (
                <div className="tm-mrow">
                  <span>Other live orders</span>
                  <span>{liveOrders.length - 1} more</span>
                </div>
              )}
            </>
          )}

          {table.displayStatus === "reserved" && (
            <>
              <div className="tm-mrow">
                <span>Reserved for</span>
                <span>{table.reservedName || "—"}</span>
              </div>
              <div className="tm-mrow">
                <span>Arrival</span>
                <span>{reservedTimeLabel(table) || "—"}</span>
              </div>
            </>
          )}

          {table.displayStatus === "cleaning" && (
            <div className="tm-mrow">
              <span>Status</span>
              <span>Being cleaned</span>
            </div>
          )}

          {table.displayStatus === "available" && (
            <div className="tm-mrow">
              <span>Status</span>
              <span>Ready to seat</span>
            </div>
          )}

          {table.displayStatus === "available" && table.status === "reserved" && (
            <div className="tm-mrow tm-mrow-upcoming-reservation">
              <span>Upcoming reservation</span>
              <span>
                {table.reservedName || "Reserved"}
                {reservedTimeLabel(table) ? ` · ${reservedTimeLabel(table)}` : ""}
              </span>
            </div>
          )}
        </div>

        <div className="tm-modal-foot">
          {table.displayStatus === "available" && table.status === "reserved" && (
            <button className="tm-btn tm-btn-danger" onClick={() => actions.onCancelReservation(table)}>
              Cancel reservation
            </button>
          )}
          {table.displayStatus === "available" && (
            <>
              <button className="tm-btn tm-btn-ghost" onClick={() => actions.onReserve(table)}>
                {table.status === "reserved" ? "Update reservation" : "Reserve"}
              </button>
              <button className="tm-btn tm-btn-gold" onClick={() => actions.onSeat(table)}>
                Seat guests
              </button>
            </>
          )}
          {table.displayStatus === "occupied" && (
            <>
              <button className="tm-btn tm-btn-ghost" onClick={() => actions.onFree(table)}>
                Free
              </button>
              <button className="tm-btn tm-btn-gold" onClick={() => actions.onViewOrder(table)}>
                View order
              </button>
            </>
          )}
          {table.displayStatus === "reserved" && (
            <>
              <button className="tm-btn tm-btn-danger" onClick={() => actions.onCancelReservation(table)}>
                Cancel
              </button>
              <button className="tm-btn tm-btn-gold" onClick={() => actions.onSeat(table)}>
                Check in
              </button>
            </>
          )}
          {table.displayStatus === "cleaning" && (
            <button className="tm-btn tm-btn-gold" onClick={() => actions.onMarkReady(table)}>
              Mark ready
            </button>
          )}
          {table.displayStatus !== "occupied" && (
            <button
              className="tm-btn tm-btn-danger tm-btn-delete"
              onClick={() => actions.onDelete(table)}
              title="Delete this table"
            >
              Delete Table
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tile ---------------- */
function TableTile({ table, liveOrders, onOpen, actions }) {
  const meta = STATUS_META[table.displayStatus] || STATUS_META.available;
  const primaryOrder = liveOrders && liveOrders[0];

  return (
    <div className={`tm-tile tm-tile-${meta.key}`} onClick={() => onOpen(table)}>
      <div className="tm-tile-top">
        <span className="tm-tile-num">Table {table.num}</span>
        <span className={`tm-pill tm-pill-${meta.key}`}>{meta.label}</span>
        {table.displayStatus !== "occupied" && (
          <button
            className="tm-tile-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              actions.onDelete(table);
            }}
            title="Delete this table"
            aria-label={`Delete Table ${table.num}`}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <ChairDiagram capacity={table.capacity} />

      <div className="tm-tile-capacity">{table.capacity} seats</div>

      <div className="tm-tile-info">
        {table.displayStatus === "available" && table.status === "reserved" && (
          <span className="tm-tile-upcoming-reservation">
            Ready to seat · Reserved {reservedTimeLabel(table) ? `at ${reservedTimeLabel(table)}` : "later"}
            {table.reservedName ? ` (${table.reservedName})` : ""}
          </span>
        )}
        {table.displayStatus === "available" && table.status !== "reserved" && "Ready to seat"}
        {table.displayStatus === "cleaning" && "Being cleaned"}
        {table.displayStatus === "reserved" && (
          <>
            {table.reservedName || "Reserved"}
            {reservedTimeLabel(table) ? ` · ${reservedTimeLabel(table)}` : ""}
          </>
        )}
        {table.displayStatus === "occupied" && primaryOrder && (
          <>
            {Array.isArray(primaryOrder.items) ? primaryOrder.items.length : 0} items ·{" "}
            ₹{(Number(primaryOrder.totalCost) || 0).toFixed(0)} · {timeSince(primaryOrder.timestamp)}
          </>
        )}
      </div>

      <div className="tm-tile-actions" onClick={(e) => e.stopPropagation()}>
        {table.displayStatus === "available" && (
          <>
            <button className="tm-btn tm-btn-gold tm-btn-sm" onClick={() => actions.onSeat(table)}>
              Seat guests
            </button>
            <button className="tm-btn tm-btn-ghost tm-btn-sm" onClick={() => actions.onReserve(table)}>
              {table.status === "reserved" ? "Update" : "Reserve"}
            </button>
            {table.status === "reserved" && (
              <button
                className="tm-btn tm-btn-danger tm-btn-sm"
                onClick={() => actions.onCancelReservation(table)}
              >
                Cancel
              </button>
            )}
          </>
        )}
        {table.displayStatus === "occupied" && (
          <>
            <button className="tm-btn tm-btn-gold tm-btn-sm" onClick={() => actions.onViewOrder(table)}>
              View order
            </button>
            <button className="tm-btn tm-btn-ghost tm-btn-sm" onClick={() => actions.onFree(table)}>
              Free
            </button>
          </>
        )}
        {table.displayStatus === "reserved" && (
          <>
            <button className="tm-btn tm-btn-gold tm-btn-sm" onClick={() => actions.onSeat(table)}>
              Check in
            </button>
            <button className="tm-btn tm-btn-danger tm-btn-sm" onClick={() => actions.onCancelReservation(table)}>
              Cancel
            </button>
          </>
        )}
        {table.displayStatus === "cleaning" && (
          <button className="tm-btn tm-btn-gold tm-btn-sm" onClick={() => actions.onMarkReady(table)}>
            Mark ready
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Main page ---------------- */
function TableManagement() {
  const navigate = useNavigate();
  const [rawTables, setRawTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [detailTable, setDetailTable] = useState(null);
  const [reserveTarget, setReserveTarget] = useState(null);
  const [showAddTable, setShowAddTable] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [seatTarget, setSeatTarget] = useState(""); // table number for ManualOrderModal
  const [menuItems, setMenuItems] = useState([]);
  const [reservationToast, setReservationToast] = useState(null);
  const prevAlertedRef = useRef(new Map());
  const rawTablesRef = useRef(rawTables);

  // Seed the tables collection once (no-op if it already has docs), then
  // subscribe for real-time updates to the stored Available/Reserved/
  // Cleaning state.
  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    (async () => {
      try {
        await seedTablesIfEmpty();
      } catch (err) {
        console.error("Error seeding tables:", err);
      }
      if (cancelled) return;
      unsubscribe = subscribeTables((tables) => {
        setRawTables(tables);
        setLoading(false);
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Live order feed — the SAME rolling-24h feed Orders.jsx itself uses
  // (subscribeRecentOrders), so a table never shows Occupied because of an
  // old/stale order that Orders.jsx has already stopped displaying. Using
  // subscribeAllCustomerOrders here (full, unbounded order history) was the
  // bug: a table could get stuck Occupied indefinitely from an ancient
  // order while the Orders page — correctly — showed nothing for it.
  useEffect(() => {
    const unsubscribe = subscribeRecentOrders((ordersData) => {
      setOrders(ordersData || []);
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Menu items feed the "Seat guests" / "Check in" Manual Order modal, same
  // as Orders.jsx.
  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        const menuRef = collection(db, "Restaurant", "orderin_restaurant_4", "menu");
        const menuSnapshot = await getDocs(menuRef);
        setMenuItems(menuSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching menu items:", err);
      }
    };
    fetchMenuItems();
  }, []);

  // Auto-promote any table with a live order to a STORED "occupied" status
  // (one-way — see reconcileOccupiedTables). This is what keeps a table
  // Occupied even after its order is marked Delivered: guests are still
  // sitting there eating, so only the manual "Free" action clears it.
  useEffect(() => {
    if (rawTables.length === 0 || orders.length === 0) return;
    reconcileOccupiedTables(rawTables, orders);
  }, [rawTables, orders]);

  // Time-aware reservation reconciliation (fires the 15-min cleanup alert,
  // auto-clears 30-min no-shows) — see reconcileReservations. Runs off a
  // ref rather than depending on `rawTables` directly so the 60s interval
  // isn't reset every time the live tables feed ticks.
  useEffect(() => {
    rawTablesRef.current = rawTables;
  }, [rawTables]);

  useEffect(() => {
    reconcileReservations(rawTablesRef.current);
    const interval = setInterval(() => {
      reconcileReservations(rawTablesRef.current);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Local popup when a reservation's cleanup alert newly fires (detected by
  // `reservationAlerted` flipping false -> true on the live `subscribeTables`
  // feed), so staff see it immediately if Table Management is open.
  useEffect(() => {
    const prev = prevAlertedRef.current;
    rawTables.forEach((t) => {
      const wasAlerted = prev.get(t.num) || false;
      if (t.reservationAlerted && !wasAlerted) {
        setReservationToast({
          id: `${t.num}-${Date.now()}`,
          message: `Table ${t.num}${t.reservedName ? ` (${t.reservedName})` : ""} has a reservation soon — clean it up within 15 minutes.`,
        });
      }
      prev.set(t.num, Boolean(t.reservationAlerted));
    });
  }, [rawTables]);

  useEffect(() => {
    if (!reservationToast) return undefined;
    const timer = window.setTimeout(() => setReservationToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [reservationToast]);

  // Group every order (live or already delivered) by table number, newest
  // first, so an Occupied tile can still show its order info even after
  // that order has been served and is waiting on a manual "Free".
  const ordersByTable = useMemo(() => {
    const map = new Map();
    orders.forEach((o) => {
      const tableNum = getOrderTableNumber(o);
      if (!tableNum) return;
      if (!map.has(tableNum)) map.set(tableNum, []);
      map.get(tableNum).push(o);
    });
    map.forEach((list) =>
      list.sort((a, b) => {
        const ta = a.timestamp?.toDate?.().getTime?.() || new Date(a.timestamp).getTime() || 0;
        const tb = b.timestamp?.toDate?.().getTime?.() || new Date(b.timestamp).getTime() || 0;
        return tb - ta;
      }),
    );
    return map;
  }, [orders]);

  // `status` on the stored table doc is authoritative for everything except
  // one display-layer override: a "reserved" table whose reservation is
  // still >15 minutes out (per isReservationPending) shows as "available"
  // so it stays fully bookable for walk-ins — the underlying status/
  // reservedName/reservedAt fields in Firestore are left untouched.
  const tables = useMemo(() => {
    return rawTables.map((t) => {
      const tableOrders = ordersByTable.get(String(t.num)) || [];
      const displayStatus =
        t.status === "reserved" && isReservationPending(t) ? "available" : t.status;
      return { ...t, displayStatus, liveOrders: tableOrders };
    });
  }, [rawTables, ordersByTable]);

  // "Reserved" is counted/filtered off the underlying `status`, not
  // `displayStatus` — a table more than 15 minutes out from its reservation
  // still displays as bookable-for-walk-ins (see the tiles), but it should
  // still show up under the Reserved section/count so staff can see all
  // upcoming reservations at a glance, not just the ones inside the 15-min
  // cleanup window. Available is the complement: displaying as available
  // AND not actually reserved, so the two categories don't double-count.
  const counts = useMemo(() => {
    const c = { all: tables.length, available: 0, occupied: 0, reserved: 0, cleaning: 0 };
    tables.forEach((t) => {
      if (t.status === "reserved") {
        c.reserved += 1;
      } else if (c[t.displayStatus] !== undefined) {
        c[t.displayStatus] += 1;
      }
    });
    return c;
  }, [tables]);

  const filteredTables = useMemo(() => {
    let list = tables;
    if (filter === "reserved") list = list.filter((t) => t.status === "reserved");
    else if (filter === "available") list = list.filter((t) => t.displayStatus === "available" && t.status !== "reserved");
    else if (filter !== "all") list = list.filter((t) => t.displayStatus === filter);
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((t) => String(t.num).includes(q));
    }
    return list;
  }, [tables, filter, searchTerm]);

  const nextTableNum = useMemo(() => {
    const max = rawTables.reduce((m, t) => Math.max(m, t.num), 0);
    return max + 1;
  }, [rawTables]);

  const actions = {
    onSeat: (table) => {
      setSeatTarget(String(table.num));
    },
    onReserve: (table) => setReserveTarget(table),
    onCancelReservation: async (table) => {
      try {
        await cancelReservation(table.num);
      } catch (err) {
        console.error("Error cancelling reservation:", err);
      }
    },
    onFree: async (table) => {
      try {
        await markTableCleaning(table.num);
      } catch (err) {
        console.error("Error marking table cleaning:", err);
      }
    },
    onMarkReady: async (table) => {
      try {
        await markTableReady(table.num);
      } catch (err) {
        console.error("Error marking table ready:", err);
      }
    },
    onViewOrder: (table) => {
      navigate(routes.orders, { state: { tableNumber: table.num } });
    },
    onEditCapacity: async (num, capacity) => {
      try {
        await updateTableCapacity(num, capacity);
      } catch (err) {
        console.error("Error updating capacity:", err);
      }
    },
    onDelete: (table) => setDeleteTarget(table),
  };

  const statCards = [
    { key: "all", label: "Total", count: counts.all },
    { key: "available", label: "Available", count: counts.available },
    { key: "occupied", label: "Occupied", count: counts.occupied },
    { key: "reserved", label: "Reserved", count: counts.reserved },
    { key: "cleaning", label: "Cleaning", count: counts.cleaning },
  ];

  return (
    <div className="table-mgmt-page">
      <div className="tm-pagehead">
        <div>
          <h1 className="tm-page-h1">Table Management</h1>
          <div className="tm-page-sub">Live floor plan, derived from real orders and staff-managed table state</div>
        </div>
        <button className="tm-back-btn" onClick={() => navigate(routes.dashboard)}>
          <ChevronLeft size={16} /> Back to Dashboard
        </button>
      </div>

      <div className="tm-stats">
        {statCards.map((s) => (
          <button
            key={s.key}
            className={`tm-statc tm-statc-${s.key} ${filter === s.key ? "on" : ""}`}
            aria-pressed={filter === s.key}
            onClick={() => setFilter(s.key)}
          >
            <div className="tm-statc-n">{s.count}</div>
            <div className="tm-statc-lbl">{s.label}</div>
          </button>
        ))}
      </div>

      <div className="tm-toolbar">
        <div className="tm-search">
          <Search size={15} className="tm-search-icon" />
          <input
            placeholder="Search table number…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="tm-spacer" />
        <button className="tm-btn tm-btn-gold" onClick={() => setShowAddTable(true)}>
          <Plus size={15} /> Add Table
        </button>
      </div>

      <div className="tm-legend">
        {Object.values(STATUS_META).map((m) => (
          <span key={m.key} className="tm-legend-item">
            <span className={`tm-legend-dot tm-legend-dot-${m.key}`} />
            {m.label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="tm-state-msg">Loading tables…</div>
      ) : filteredTables.length === 0 ? (
        <div className="tm-state-msg">No tables match this view.</div>
      ) : (
        <div className="tm-floor">
          {filteredTables.map((t) => (
            <TableTile
              key={t.num}
              table={t}
              liveOrders={t.liveOrders}
              onOpen={setDetailTable}
              actions={actions}
            />
          ))}
        </div>
      )}

      {detailTable && (
        <TableDetailModal
          table={tables.find((t) => t.num === detailTable.num) || detailTable}
          liveOrders={(tables.find((t) => t.num === detailTable.num) || detailTable).liveOrders}
          onClose={() => setDetailTable(null)}
          actions={{
            ...actions,
            onSeat: (table) => {
              setDetailTable(null);
              actions.onSeat(table);
            },
            onReserve: (table) => {
              setDetailTable(null);
              actions.onReserve(table);
            },
            onViewOrder: (table) => {
              setDetailTable(null);
              actions.onViewOrder(table);
            },
            onDelete: (table) => {
              setDetailTable(null);
              actions.onDelete(table);
            },
          }}
        />
      )}

      {reserveTarget && (
        <ReserveTableModal
          table={reserveTarget}
          onClose={() => setReserveTarget(null)}
          onConfirm={async (num, name, time) => {
            await reserveTable(num, name, time);
            setReserveTarget(null);
          }}
        />
      )}

      {showAddTable && (
        <AddTableModal
          suggestedNum={nextTableNum}
          onClose={() => setShowAddTable(false)}
          onConfirm={async (num, capacity) => {
            await addTable(num, capacity);
            setShowAddTable(false);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteTableConfirmModal
          table={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async (num) => {
            await deleteTable(num);
            setDeleteTarget(null);
            if (detailTable?.num === num) setDetailTable(null);
          }}
        />
      )}

      <ManualOrderModal
        isOpen={Boolean(seatTarget)}
        onClose={() => setSeatTarget("")}
        menuItems={menuItems}
        initialTableNumber={seatTarget}
        onOrderCreated={() => setSeatTarget("")}
      />

      {reservationToast && (
        <div className="tm-reservation-toast" role="status" aria-live="polite">
          <strong>Reservation alert</strong>
          <span>{reservationToast.message}</span>
        </div>
      )}
    </div>
  );
}

export default TableManagement;

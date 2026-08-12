import { STORES, getAll, getOne, putOne, removeOne, genId } from "./db";
import { enqueueSync } from "./sync";
import { emit, EVENTS } from "./bus";

async function persist(store, value, { sync = true } = {}) {
  await putOne(store, value);
  if (sync) enqueueSync(store, "put", value);
  return value;
}

export async function logAudit({ user, action, entity, entityId, before, after }) {
  await putOne(STORES.auditLogs, {
    id: genId("log"),
    user: user?.name || "system",
    userId: user?.id || null,
    action,
    entity,
    entityId,
    before: before ?? null,
    after: after ?? null,
    timestamp: Date.now(),
  });
  emit(EVENTS.AUDIT_CHANGED);
}

// ---------- Settings ----------
export async function getSettings(id) {
  return getOne(STORES.settings, id);
}
export async function saveSettings(id, patch, user) {
  const current = (await getOne(STORES.settings, id)) || { id };
  const next = { ...current, ...patch, id };
  await persist(STORES.settings, next);
  await logAudit({ user, action: "settings.update", entity: "settings", entityId: id, before: current, after: next });
  emit(EVENTS.SETTINGS_CHANGED);
  return next;
}

// ---------- Menu ----------
export async function listCategories() {
  return (await getAll(STORES.categories)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
export async function saveCategory(cat, user) {
  const value = { ...cat, id: cat.id || genId("cat") };
  await persist(STORES.categories, value);
  await logAudit({ user, action: "category.save", entity: "category", entityId: value.id, after: value });
  emit(EVENTS.MENU_CHANGED);
  return value;
}
export async function deleteCategory(id, user) {
  await removeOne(STORES.categories, id);
  enqueueSync(STORES.categories, "delete", { id });
  await logAudit({ user, action: "category.delete", entity: "category", entityId: id });
  emit(EVENTS.MENU_CHANGED);
}

export async function listProducts() {
  return getAll(STORES.products);
}
export async function saveProduct(product, user) {
  const before = product.id ? await getOne(STORES.products, product.id) : null;
  const value = { ...product, id: product.id || genId("prd") };
  await persist(STORES.products, value);
  await logAudit({ user, action: before ? "product.update" : "product.create", entity: "product", entityId: value.id, before, after: value });
  emit(EVENTS.MENU_CHANGED);
  return value;
}
export async function deleteProduct(id, user) {
  await removeOne(STORES.products, id);
  enqueueSync(STORES.products, "delete", { id });
  await logAudit({ user, action: "product.delete", entity: "product", entityId: id });
  emit(EVENTS.MENU_CHANGED);
}

// ---------- Inventory ----------
export async function listInventory() {
  return getAll(STORES.inventory);
}
export function inventoryStatus(item) {
  if (item.stock <= 0) return "out";
  if (item.stock <= item.minStock * 0.5) return "critical";
  if (item.stock <= item.minStock) return "low";
  return "in_stock";
}
export async function saveInventoryItem(item, user) {
  const before = item.id ? await getOne(STORES.inventory, item.id) : null;
  const value = { ...item, id: item.id || genId("inv") };
  await persist(STORES.inventory, value);
  await logAudit({ user, action: before ? "inventory.update" : "inventory.create", entity: "inventory", entityId: value.id, before, after: value });
  emit(EVENTS.INVENTORY_CHANGED);
  return value;
}
export async function deleteInventoryItem(id, user) {
  await removeOne(STORES.inventory, id);
  enqueueSync(STORES.inventory, "delete", { id });
  await logAudit({ user, action: "inventory.delete", entity: "inventory", entityId: id });
  emit(EVENTS.INVENTORY_CHANGED);
}

export async function adjustStock({ itemId, type, qty, reason, refOrderId, user }) {
  const item = await getOne(STORES.inventory, itemId);
  if (!item) return null;
  const before = item.stock;
  const delta = type === "in" ? qty : -Math.abs(qty);
  const next = { ...item, stock: Math.max(0, +(before + delta).toFixed(3)) };
  await persist(STORES.inventory, next);
  const tx = {
    id: genId("itx"), itemId, itemName: item.name, type, qty, unit: item.unit,
    reason: reason || (type === "sale" ? "Order deduction" : type), refOrderId: refOrderId || null,
    employeeId: user?.id || null, employeeName: user?.name || "system", createdAt: Date.now(),
  };
  await persist(STORES.inventoryTx, tx);
  emit(EVENTS.INVENTORY_CHANGED);
  return next;
}

export async function listInventoryTx() {
  return (await getAll(STORES.inventoryTx)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function recordWastage({ itemId, qty, reason, user }) {
  const item = await getOne(STORES.inventory, itemId);
  if (!item) return null;
  await adjustStock({ itemId, type: "out", qty, reason: `Wastage: ${reason}`, user });
  const entry = {
    id: genId("wst"), itemId, itemName: item.name, qty, unit: item.unit, reason,
    employeeId: user?.id || null, employeeName: user?.name || "system", date: Date.now(),
  };
  await persist(STORES.wastage, entry);
  emit(EVENTS.WASTAGE_CHANGED);
  return entry;
}
export async function listWastage() {
  return (await getAll(STORES.wastage)).sort((a, b) => b.date - a.date);
}

// ---------- Orders ----------
export async function nextInvoiceNumber() {
  const billing = (await getOne(STORES.settings, "billing")) || { invoicePrefix: "INV-", nextInvoiceSeq: 1001 };
  const seq = billing.nextInvoiceSeq || 1001;
  await putOne(STORES.settings, { ...billing, id: "billing", nextInvoiceSeq: seq + 1 });
  return `${billing.invoicePrefix || "INV-"}${seq}`;
}

export function computeOrderTotals(items, orderDiscount = 0) {
  const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
  const itemDiscounts = items.reduce((s, it) => s + (it.discount || 0), 0);
  const discount = itemDiscounts + (orderDiscount || 0);
  const taxable = Math.max(0, subtotal - discount);
  const tax = items.reduce((s, it) => {
    const lineSubtotal = it.price * it.qty;
    const share = subtotal > 0 ? lineSubtotal / subtotal : 0;
    const lineTaxable = Math.max(0, lineSubtotal - (it.discount || 0) - orderDiscount * share);
    return s + (lineTaxable * (it.tax || 0)) / 100;
  }, 0);
  const total = +(taxable + tax).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), discount: +discount.toFixed(2), tax: +tax.toFixed(2), total };
}

export async function listOrders() {
  return (await getAll(STORES.orders)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function createOrder({ items, orderType, tableNo, discount = 0, payments, cashier, priority = "normal", notes = "" }) {
  const totals = computeOrderTotals(items, discount);
  const invoiceNo = await nextInvoiceNumber();
  const order = {
    id: genId("ord"),
    orderNo: invoiceNo.replace("INV-", "ORD-"),
    invoiceNo,
    orderType,
    tableNo: tableNo || null,
    status: "new",
    kitchenStatus: "new",
    priority,
    notes,
    items,
    ...totals,
    payments: payments || [],
    paymentStatus: payments?.length ? "paid" : "pending",
    cashierId: cashier?.id || null,
    cashierName: cashier?.name || "Unknown",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    readyAt: null,
    completedAt: null,
  };
  await persist(STORES.orders, order);
  await logAudit({ user: cashier, action: "order.create", entity: "order", entityId: order.id, after: order });
  emit(EVENTS.ORDERS_CHANGED, { id: order.id });

  for (const line of items) {
    const product = await getOne(STORES.products, line.productId);
    if (!product?.recipe?.length) continue;
    for (const ing of product.recipe) {
      await adjustStock({
        itemId: ing.inventoryId, type: "sale",
        qty: ing.qty * line.qty, reason: `Sale: ${product.name} x${line.qty}`,
        refOrderId: order.id, user: cashier,
      });
    }
  }
  await upsertCustomerFromOrder(order);
  return order;
}

export async function updateOrderStatus(orderId, status, user) {
  const order = await getOne(STORES.orders, orderId);
  if (!order) return null;
  const before = { ...order };
  const next = { ...order, status, kitchenStatus: status, updatedAt: Date.now() };
  if (status === "ready") next.readyAt = Date.now();
  if (status === "completed") next.completedAt = Date.now();
  await persist(STORES.orders, next);
  await logAudit({ user, action: "order.status", entity: "order", entityId: orderId, before, after: next });
  emit(EVENTS.ORDERS_CHANGED, { id: orderId });
  return next;
}

export async function cancelOrder(orderId, reason, user) {
  const order = await getOne(STORES.orders, orderId);
  if (!order) return null;
  const before = { ...order };
  const next = { ...order, status: "cancelled", kitchenStatus: "cancelled", cancelReason: reason, updatedAt: Date.now() };
  await persist(STORES.orders, next);
  await logAudit({ user, action: "order.cancel", entity: "order", entityId: orderId, before, after: next });
  emit(EVENTS.ORDERS_CHANGED, { id: orderId });
  return next;
}

export async function refundOrder(orderId, amount, reason, user) {
  const order = await getOne(STORES.orders, orderId);
  if (!order) return null;
  const before = { ...order };
  const next = {
    ...order, status: "refunded", paymentStatus: "refunded",
    refund: { amount, reason, at: Date.now(), by: user?.name }, updatedAt: Date.now(),
  };
  await persist(STORES.orders, next);
  await logAudit({ user, action: "order.refund", entity: "order", entityId: orderId, before, after: next });
  emit(EVENTS.ORDERS_CHANGED, { id: orderId });
  return next;
}

async function upsertCustomerFromOrder(order) {
  if (!order.customerPhone) return;
  const all = await getAll(STORES.customers);
  const existing = all.find((c) => c.phone === order.customerPhone);
  const value = existing
    ? { ...existing, orders: (existing.orders || 0) + 1, totalSpent: +(existing.totalSpent + order.total).toFixed(2), lastOrder: order.createdAt }
    : { id: genId("cus"), name: order.customerName || "Guest", phone: order.customerPhone, orders: 1, totalSpent: order.total, lastOrder: order.createdAt };
  await persist(STORES.customers, value);
  emit(EVENTS.CUSTOMERS_CHANGED);
}

export async function listCustomers() {
  return (await getAll(STORES.customers)).sort((a, b) => b.lastOrder - a.lastOrder);
}

// ---------- Employees / Suppliers / Expenses ----------
export async function listEmployees() { return getAll(STORES.employees); }
export async function saveEmployee(emp, user) {
  const value = { ...emp, id: emp.id || genId("emp") };
  await persist(STORES.employees, value);
  await logAudit({ user, action: "employee.save", entity: "employee", entityId: value.id, after: value });
  emit(EVENTS.EMPLOYEES_CHANGED);
  return value;
}
export async function deleteEmployee(id, user) {
  await removeOne(STORES.employees, id);
  enqueueSync(STORES.employees, "delete", { id });
  await logAudit({ user, action: "employee.delete", entity: "employee", entityId: id });
  emit(EVENTS.EMPLOYEES_CHANGED);
}

export async function listSuppliers() { return getAll(STORES.suppliers); }
export async function saveSupplier(sup, user) {
  const value = { ...sup, id: sup.id || genId("sup") };
  await persist(STORES.suppliers, value);
  await logAudit({ user, action: "supplier.save", entity: "supplier", entityId: value.id, after: value });
  emit(EVENTS.SUPPLIERS_CHANGED);
  return value;
}
export async function deleteSupplier(id, user) {
  await removeOne(STORES.suppliers, id);
  enqueueSync(STORES.suppliers, "delete", { id });
  await logAudit({ user, action: "supplier.delete", entity: "supplier", entityId: id });
  emit(EVENTS.SUPPLIERS_CHANGED);
}

export async function listExpenses() {
  return (await getAll(STORES.expenses)).sort((a, b) => b.date - a.date);
}
export async function saveExpense(exp, user) {
  const value = { ...exp, id: exp.id || genId("exp"), addedBy: user?.name || "system" };
  await persist(STORES.expenses, value);
  await logAudit({ user, action: "expense.save", entity: "expense", entityId: value.id, after: value });
  emit(EVENTS.EXPENSES_CHANGED);
  return value;
}
export async function deleteExpense(id, user) {
  await removeOne(STORES.expenses, id);
  enqueueSync(STORES.expenses, "delete", { id });
  await logAudit({ user, action: "expense.delete", entity: "expense", entityId: id });
  emit(EVENTS.EXPENSES_CHANGED);
}

export async function listAuditLogs() {
  return (await getAll(STORES.auditLogs)).sort((a, b) => b.timestamp - a.timestamp);
}

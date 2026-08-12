import { STORES, getAll, putMany, putOne, countAll, genId } from "./db";
import { hashPassword, ROLES } from "./auth";

// Memoized so concurrent calls (React StrictMode double-invokes effects in
// dev, and multiple tabs could theoretically race on first load) await the
// same in-flight seed instead of each re-checking countAll() before either
// has written anything, which double-seeds every store.
let seedPromise = null;

export function seedIfEmpty() {
  if (!seedPromise) seedPromise = doSeed();
  return seedPromise;
}

async function doSeed() {
  const userCount = await countAll(STORES.users);
  if (userCount > 0) return;

  const users = await Promise.all([
    { username: "admin", name: "Owner Admin", role: ROLES.ADMIN, password: "admin123" },
    { username: "manager", name: "Priya Manager", role: ROLES.MANAGER, password: "manager123" },
    { username: "cashier", name: "Arun Cashier", role: ROLES.CASHIER, password: "cashier123" },
    { username: "kitchen", name: "Kitchen Staff", role: ROLES.KITCHEN, password: "kitchen123" },
  ].map(async (u) => ({ id: genId("usr"), ...u, passwordHash: await hashPassword(u.password), status: "active", createdAt: Date.now() })));
  await putMany(STORES.users, users);

  const categories = [
    { id: "cat_starters", name: "Starters", sortOrder: 1 },
    { id: "cat_main", name: "Main Course", sortOrder: 2 },
    { id: "cat_biryani", name: "Rice / Biryani", sortOrder: 3 },
    { id: "cat_burgers", name: "Burgers", sortOrder: 4 },
    { id: "cat_pizza", name: "Pizza", sortOrder: 5 },
    { id: "cat_desserts", name: "Desserts", sortOrder: 6 },
    { id: "cat_beverages", name: "Beverages", sortOrder: 7 },
  ];
  await putMany(STORES.categories, categories);

  const inventory = [
    { id: "inv_bun", name: "Burger Bun", sku: "ING-BUN", category: "Bakery", unit: "pc", stock: 120, minStock: 40, maxStock: 300, purchasePrice: 8, supplierId: null, expiryDate: null, location: "Dry Store" },
    { id: "inv_chicken", name: "Chicken", sku: "ING-CHK", category: "Meat", unit: "g", stock: 15000, minStock: 5000, maxStock: 30000, purchasePrice: 0.28, supplierId: null, expiryDate: "2026-08-20", location: "Freezer" },
    { id: "inv_cheese", name: "Cheese", sku: "ING-CHS", category: "Dairy", unit: "g", stock: 4000, minStock: 1500, maxStock: 8000, purchasePrice: 0.6, supplierId: null, expiryDate: "2026-09-01", location: "Chiller" },
    { id: "inv_sauce", name: "Burger Sauce", sku: "ING-SCE", category: "Condiments", unit: "g", stock: 3000, minStock: 800, maxStock: 6000, purchasePrice: 0.2, supplierId: null, expiryDate: null, location: "Chiller" },
    { id: "inv_veg", name: "Mixed Vegetables", sku: "ING-VEG", category: "Produce", unit: "g", stock: 8000, minStock: 2000, maxStock: 15000, purchasePrice: 0.12, supplierId: null, expiryDate: "2026-08-16", location: "Chiller" },
    { id: "inv_rice", name: "Basmati Rice", sku: "ING-RIC", category: "Grains", unit: "g", stock: 20000, minStock: 5000, maxStock: 40000, purchasePrice: 0.1, supplierId: null, expiryDate: null, location: "Dry Store" },
    { id: "inv_oil", name: "Cooking Oil", sku: "ING-OIL", category: "Pantry", unit: "ml", stock: 10000, minStock: 3000, maxStock: 20000, purchasePrice: 0.09, supplierId: null, expiryDate: null, location: "Dry Store" },
    { id: "inv_spices", name: "Biryani Spice Mix", sku: "ING-SPC", category: "Pantry", unit: "g", stock: 3000, minStock: 500, maxStock: 6000, purchasePrice: 0.5, supplierId: null, expiryDate: null, location: "Dry Store" },
    { id: "inv_pizzadough", name: "Pizza Dough", sku: "ING-PDG", category: "Bakery", unit: "pc", stock: 60, minStock: 20, maxStock: 150, purchasePrice: 22, supplierId: null, expiryDate: "2026-08-18", location: "Chiller" },
    { id: "inv_cola", name: "Cola Syrup", sku: "ING-COL", category: "Beverage", unit: "ml", stock: 5000, minStock: 1000, maxStock: 10000, purchasePrice: 0.05, supplierId: null, expiryDate: null, location: "Dry Store" },
    { id: "inv_packaging", name: "Takeaway Box", sku: "PKG-BOX", category: "Packaging", unit: "pc", stock: 250, minStock: 100, maxStock: 800, purchasePrice: 4, supplierId: null, expiryDate: null, location: "Store" },
  ];
  await putMany(STORES.inventory, inventory);

  const products = [
    {
      id: "p_chicken_burger", name: "Chicken Burger", description: "Grilled chicken patty with cheese & sauce",
      categoryId: "cat_burgers", price: 180, costPrice: 90, tax: 5, sku: "MENU-001", image: "",
      prepTime: 10, veg: false, available: true,
      recipe: [
        { inventoryId: "inv_bun", qty: 1 }, { inventoryId: "inv_chicken", qty: 100 },
        { inventoryId: "inv_cheese", qty: 20 }, { inventoryId: "inv_sauce", qty: 15 },
        { inventoryId: "inv_veg", qty: 30 },
      ],
    },
    {
      id: "p_veg_burger", name: "Veg Burger", description: "Crispy veg patty with fresh vegetables",
      categoryId: "cat_burgers", price: 140, costPrice: 60, tax: 5, sku: "MENU-002", image: "",
      prepTime: 8, veg: true, available: true,
      recipe: [{ inventoryId: "inv_bun", qty: 1 }, { inventoryId: "inv_veg", qty: 80 }, { inventoryId: "inv_sauce", qty: 15 }],
    },
    {
      id: "p_chicken_biryani", name: "Chicken Biryani", description: "Aromatic basmati rice with spiced chicken",
      categoryId: "cat_biryani", price: 260, costPrice: 120, tax: 5, sku: "MENU-003", image: "",
      prepTime: 20, veg: false, available: true,
      recipe: [
        { inventoryId: "inv_rice", qty: 250 }, { inventoryId: "inv_chicken", qty: 200 },
        { inventoryId: "inv_oil", qty: 30 }, { inventoryId: "inv_spices", qty: 15 }, { inventoryId: "inv_veg", qty: 50 },
      ],
    },
    {
      id: "p_margherita", name: "Margherita Pizza", description: "Classic cheese & tomato pizza",
      categoryId: "cat_pizza", price: 220, costPrice: 95, tax: 5, sku: "MENU-004", image: "",
      prepTime: 15, veg: true, available: true,
      recipe: [{ inventoryId: "inv_pizzadough", qty: 1 }, { inventoryId: "inv_cheese", qty: 120 }, { inventoryId: "inv_sauce", qty: 40 }],
    },
    {
      id: "p_fries", name: "French Fries", description: "Crispy golden fries",
      categoryId: "cat_starters", price: 90, costPrice: 30, tax: 5, sku: "MENU-005", image: "",
      prepTime: 7, veg: true, available: true,
      recipe: [{ inventoryId: "inv_veg", qty: 150 }, { inventoryId: "inv_oil", qty: 50 }],
    },
    {
      id: "p_coke", name: "Coke", description: "Chilled soft drink", categoryId: "cat_beverages",
      price: 40, costPrice: 12, tax: 12, sku: "MENU-006", image: "", prepTime: 1, veg: true, available: true,
      recipe: [{ inventoryId: "inv_cola", qty: 200 }],
    },
    {
      id: "p_brownie", name: "Chocolate Brownie", description: "Warm fudge brownie", categoryId: "cat_desserts",
      price: 110, costPrice: 45, tax: 5, sku: "MENU-007", image: "", prepTime: 5, veg: true, available: true,
      recipe: [],
    },
  ];
  await putMany(STORES.products, products);

  await putOne(STORES.settings, {
    id: "restaurant",
    name: "Orderin Kitchen",
    logo: "",
    address: "12 MG Road, Bengaluru, KA",
    phone: "+91 90000 00000",
    email: "hello@orderin.example",
    gstin: "29ABCDE1234F1Z5",
  });
  await putOne(STORES.settings, {
    id: "billing",
    invoicePrefix: "INV-",
    orderPrefix: "ORD-",
    nextInvoiceSeq: 1001,
    defaultTax: 5,
    currency: "₹",
    footerMessage: "Thank you! Visit again.",
  });
  await putOne(STORES.settings, {
    id: "printer",
    connectionType: "usb",
    paperWidth: "80mm",
    autoPrint: true,
    printCopies: 1,
  });
  await putOne(STORES.settings, {
    id: "order",
    orderTypes: ["dine-in", "takeaway", "delivery", "counter"],
    avgPrepTimeAlertMin: 15,
  });

  await putMany(STORES.suppliers, [
    { id: genId("sup"), name: "FreshFarm Produce", contact: "Ravi Kumar", phone: "9876543210", email: "ravi@freshfarm.example", address: "Market Yard, Bengaluru", gst: "29AAAAA0000A1Z1", products: "Vegetables, Fruits" },
    { id: genId("sup"), name: "MetroMeat Suppliers", contact: "Sana Sheikh", phone: "9876500000", email: "sana@metromeat.example", address: "Industrial Area, Bengaluru", gst: "29BBBBB1111B1Z2", products: "Chicken, Meat" },
  ]);

  await putMany(STORES.employees, users.map((u, i) => ({
    id: genId("emp"), userId: u.id, empId: `EMP-${100 + i}`, name: u.name, role: u.role,
    phone: `98765000${i}0`, email: `${u.username}@orderin.example`, status: "active", joiningDate: "2025-01-15",
  })));
}

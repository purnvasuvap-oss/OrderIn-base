async function sha256(text) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback (non-crypto env) — still avoids storing plaintext.
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  return String(hash);
}

export async function hashPassword(password) {
  return sha256(password);
}

export async function verifyPassword(password, hash) {
  return (await sha256(password)) === hash;
}

export const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  CASHIER: "cashier",
  KITCHEN: "kitchen",
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: "Admin / Owner",
  [ROLES.MANAGER]: "Manager",
  [ROLES.CASHIER]: "Cashier",
  [ROLES.KITCHEN]: "Kitchen Staff",
};

export const ROLE_HOME = {
  [ROLES.ADMIN]: "/dashboard",
  [ROLES.MANAGER]: "/dashboard",
  [ROLES.CASHIER]: "/pos",
  [ROLES.KITCHEN]: "/kitchen",
};

const NAV_KEYS = [
  "dashboard", "pos", "orders", "kitchen", "menu", "inventory",
  "suppliers", "expenses", "employees", "customers", "reports",
  "analytics", "invoices", "settings", "audit",
];

const ROLE_ACCESS = {
  [ROLES.ADMIN]: NAV_KEYS,
  [ROLES.MANAGER]: ["dashboard", "pos", "orders", "kitchen", "menu", "inventory", "employees", "reports", "analytics", "expenses", "suppliers", "customers", "invoices"],
  [ROLES.CASHIER]: ["pos", "orders", "invoices"],
  [ROLES.KITCHEN]: ["kitchen"],
};

export function canAccess(role, key) {
  return ROLE_ACCESS[role]?.includes(key) ?? false;
}

export function allowedKeys(role) {
  return ROLE_ACCESS[role] || [];
}

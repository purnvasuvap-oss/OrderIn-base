export type MenuItem = {
  id: string;
  name: string;
  price: number;
  priceLarge?: number | null;
  description?: string;
  diet?: string;
  spice?: string | null;
  allergens?: string[];
  category?: string;
  station?: string;
};

export type Profile = {
  name: string;
  address?: string;
  phone?: string;
  gstin?: string;
  fssai?: string;
  googleReviewUrl?: string;
  theme?: { preset?: string; primary?: string; font?: string };
  cgstRate?: number;
  sgstRate?: number;
  sac?: string;
  features?: Record<string, boolean>;
};

export type CartLine = {
  menuItemId: string;
  qty: number;
  size?: string;
  notes?: string;
};

export type Gateway = {
  resolve: () => { restaurantId: string; subdomain: string; tableId: string };
  load: (ref: { restaurantId: string; subdomain: string }) => Promise<{ profile: Profile | null; menu: MenuItem[] }>;
  ensureSession: (tableId: string) => Promise<void>;
  place: (input: { lines: CartLine[]; name?: string; phone?: string; loyaltyOptIn?: boolean }) => Promise<any>;
  request: (type: 'call_waiter' | 'water' | 'bill') => Promise<void>;
  payOnline: (amountPaise?: number) => Promise<void>;
  watchOrder?: (orderId: string, onOrder: (order: any) => void) => () => void;
  feedback: (rating: number, comment: string) => Promise<{ show: boolean; url?: string }>;
};

export type StaffUser = {
  uid: string;
  email: string;
  name: string;
  role: string;
  restaurantId: string;
  restaurantIds: string[];
};

export type FloorData = {
  profile: any;
  menu: any[];
  orders: any[];
  tables: any[];
  requests: any[];
  customers: any[];
  reservations: any[];
};

export type StaffGateway = {
  login: (email: string, password: string) => Promise<StaffUser>;
  logout: () => Promise<void>;
  load: (restaurantId: string) => Promise<FloorData>;
  saveProfile: (restaurantId: string, profile: any) => Promise<void>;
  importMenu: (restaurantId: string, csv: string) => Promise<number>;
  saveTables: (restaurantId: string, tables: string[]) => Promise<string[]>;
  createStaff: (input: { restaurantId: string; email: string; password: string; role: string; name: string }) => Promise<void>;
  updateItem: (input: { restaurantId: string; orderId: string; lineKey: string; from: string; status: string }) => Promise<void>;
  ack: (restaurantId: string, requestId: string) => Promise<void>;
  move: (restaurantId: string, orderId: string, toTableId: string) => Promise<void>;
  discount: (restaurantId: string, orderId: string, amount: number, reason: string) => Promise<void>;
  voidOrder: (restaurantId: string, orderId: string, reason: string) => Promise<void>;
  closeDay: (restaurantId: string, businessDate: string, cashCounted: number) => Promise<any>;
  issueCode: (restaurantId: string, orderId: string) => Promise<string>;
  reserve: (input: { restaurantId: string; tableId: string; startAt: string; endAt: string; name: string; phone: string }) => Promise<void>;
  payroll: (restaurantId: string, rows: any[], allowNegative: boolean) => Promise<any>;
  clock: (restaurantId: string, punch: 'in' | 'out') => Promise<void>;
  addOutlet: (input: { restaurantId: string; name: string; preset?: string }) => Promise<string[]>;
  printOrder: (order: any, profile: any) => Promise<string>;
};

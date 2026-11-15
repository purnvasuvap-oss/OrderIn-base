/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_PRINT_BRIDGE_URL?: string;
  readonly VITE_FUNCTIONS_BASE?: string;
  readonly VITE_CUSTOMER_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@orderin/core' {
  export function can(role: string, action: string): boolean;
  export function parseMenuCsv(text: string): any[];
  export function tableQrUrl(input: any): string;
  export function salesSummary(orders: any[], range?: any): any;
  export function itemWise(orders: any[], range?: any): any[];
  export function gstReport(orders: any[], range?: any): any[];
  export function toCsv(rows: any[]): string;
  export function tallyVoucherRows(orders: any[], range?: any): any[];
  export function staffPerformance(orders: any[], range?: any): any[];
  export function dayClose(orders: any[], input: any): any;
  export function netPay(input: any): any;
  export function tableStatusFromOrder(order: any): string;
  export function kotByStation(order: any, restaurant: any): { station: string; bytes: Uint8Array }[];
  export function bytesToBase64(bytes: Uint8Array): string;
  export function loggingEnabled(dsn?: string): boolean;
  export const PRESETS: Record<string, { id: string; label: string }>;
}

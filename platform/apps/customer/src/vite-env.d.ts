/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_FUNCTIONS_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@orderin/core' {
  export function quoteCart(menu: any[], lines: any[], tax?: any): any;
  export function resolveRestaurantRef(input: any): { restaurantId: string; subdomain: string; tableId: string };
  export function themeToCssVars(theme: any): Record<string, string>;
  export function featureOn(profile: any, flag: string): boolean;
  export function reviewPrompt(input: any): { show: boolean; url?: string; reason?: string };
  export function billText(input: any): string;
  export function whatsappLink(phone: string, text: string): string;
  export function smsLink(phone: string, text: string): string;
  export function loggingEnabled(dsn?: string): boolean;
  export function normalizeDiet(item: any): string;
}

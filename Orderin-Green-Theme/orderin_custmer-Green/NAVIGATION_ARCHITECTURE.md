# OrderIn SPA - Navigation & Back-Button Architecture

## Overview

This document explains the strict back-button control system implemented in the OrderIn React SPA.

---

## Back-Button Behavior Rules

### 1. **Login Page (`/`)**
```
Back button → PREVENTED (no navigation)
User cannot go back from login
Forward requires authentication
```

### 2. **Menu Page (`/menu`)**
```
Back button → Go to Login (`/`)
Entry point after authentication
```

### 3. **Non-Payment Pages** (Profile, Help, About, Item Details, etc.)
```
Back button → Go to Menu (`/menu`)
Directly, no step-by-step history navigation
```

### 4. **Payment Flow Pages** (Cart → Bill → Payments → Counter Code → Success)
```
Back button → NORMAL (allows step-by-step)

- Cart → Back → Menu
- Bill → Back → Cart
- Payments → Back → Bill  (or Cart)
- Counter Code → Back → Payments
- Payment Success → Back → Menu
```

---

## Implementation Architecture

### 1. **Global Back-Button Handler** (`useGlobalBackButton.js`)

**Location:** `src/hooks/useGlobalBackButton.js`

**How it works:**
- Intercepts `popstate` event (browser back, device back, swipe-back)
- Checks current route and applies appropriate behavior
- Uses `window.history.pushState()` to control history

**Key Logic:**
```javascript
if (currentPage === '/') {
  // Login: prevent back
  window.history.pushState(...); // Push state to trap navigation
}

if (currentPage === '/menu') {
  // Menu: go to login
  navigate('/', { replace: true });
}

if (currentPage in ['cart', 'payments', 'counter-code', 'payment-success']) {
  // Payment flow: allow normal back (do nothing)
}

else {
  // All other pages: go to menu
  navigate('/menu', { replace: true });
}
```

### 2. **Protected Route Guard** (`ProtectedRoute.jsx`)

**Location:** `src/components/ProtectedRoute.jsx`

**How it works:**
- Checks if user is authenticated (localStorage)
- Redirects to login if not authenticated
- Prevents unauthorized access to protected pages

**Usage:**
```jsx
<Route
  path="/menu"
  element={
    <ProtectedRoute>
      <Menu />
    </ProtectedRoute>
  }
/>
```

### 3. **Routing Structure** (`AppContent.jsx`)

**Location:** `src/AppContent.jsx`

**Organization:**
- **Public Routes:** Login only
- **Protected Routes:** All other pages wrapped with `<ProtectedRoute>`
- **Payment Flow Routes:** Cart, Bill, Payments, Counter Code, Payment Success
- **Info Routes:** Help, About, About OrderIn
- **User Routes:** Profile, Item Details

**Key Pattern:**
- All non-payment routes use `replace: true` when navigating away
- Payment flow routes use normal navigation (no replace)
- This prevents history stacking in non-payment flows

### 4. **Navigation Utilities** (`navigationUtils.js`)

**Location:** `src/utils/navigationUtils.js`

**Purpose:**
- Centralized navigation logic
- Ensures consistent behavior across the app
- Provides helper methods like:
  - `navigateToMenu()` - Go to menu with history replacement
  - `navigatePaymentFlow(path)` - Navigate within payment flow
  - `navigateToLogin()` - Logout and go to login

**Usage in Components:**
```jsx
const navigate = useOrderInNavigate();

// Go to profile (back button goes to menu)
navigate.navigateToProfile();

// Go to cart (enter payment flow)
navigate.navigateToCart();

// Go to menu (exit payment flow)
navigate.navigateToMenu();
```

---

## Navigation Flow Diagram

```
LOGIN PAGE (/)
    ↓ (auth success)
MENU PAGE (/menu)
    ├─→ HELP, ABOUT, PROFILE ⟶ (back) ⟶ MENU
    ├─→ ITEM DETAILS ⟶ (back) ⟶ MENU
    └─→ CART (enter payment flow)
            ↓
        BILL
            ↓
        PAYMENTS
            ↓
        COUNTER CODE
            ↓
        PAYMENT SUCCESS ⟶ (back) ⟶ MENU
```

---

## Why This Architecture?

### 1. **Prevent History Stacking**
- Non-payment pages use `replace: true` so browser history doesn't accumulate
- Clicking back from any info page goes directly to menu, not through step-by-step history

### 2. **Payment Flow Integrity**
- Payment flow pages keep normal back behavior to allow users to review/edit their order
- User can go: Cart → Payments → Cart → Payments (verify quantities, etc.)

### 3. **Authentication Safety**
- ProtectedRoute prevents unauthorized access to restricted pages
- Refresh on any protected page maintains authentication check
- Logout automatically redirects to login

### 4. **User Experience**
- Predictable back-button behavior (non-payments always go to menu)
- No unexpected navigation surprises
- Mobile users can use device back button reliably

### 5. **Production Safety**
- All routes wrapped with guards
- No way to reach restricted pages without auth
- History management prevents back-stepping vulnerabilities

---

## Testing Back-Button Behavior

### Desktop Browser
1. Navigate to any page from menu
2. Click browser back button
3. Should go to menu (not step through history)
4. From menu, click back → Should go to login
5. From login, click back → Should stay on login (no navigation)

### Mobile/Device
1. Navigate to any page from menu
2. Use device back gesture or button
3. Should go to menu (not step through history)
4. From menu, use device back → Should go to login
5. Payment flow: Use back to step through payment pages normally

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/hooks/useGlobalBackButton.js` | Global back-button handler |
| `src/components/ProtectedRoute.jsx` | Auth guard for protected pages |
| `src/AppContent.jsx` | Main routing structure |
| `src/utils/navigationUtils.js` | Navigation utility hooks |

---

## Common Mistakes to Avoid

❌ **DON'T:** Use `navigate(path)` directly - use `navigate(path, { replace: true })` for non-payment pages
❌ **DON'T:** Add custom back buttons that bypass the global handler
❌ **DON'T:** Store sensitive auth info in localStorage (use sessionStorage + secure HttpOnly cookies in production)
❌ **DON'T:** Forget to wrap protected routes with `<ProtectedRoute>`

✅ **DO:** Use `useOrderInNavigate()` hook for consistent navigation
✅ **DO:** Keep payment flow pages using normal navigation (no replace)
✅ **DO:** Always check auth state before accessing user data
✅ **DO:** Use descriptive comments in your route definitions

---

## Production Deployment Checklist

- [ ] Auth tokens securely stored (HttpOnly cookies recommended)
- [ ] All protected routes wrapped with `<ProtectedRoute>`
- [ ] Back-button handler tested on iOS and Android
- [ ] Payment flow tested end-to-end
- [ ] Login prevents unauthorized forward navigation
- [ ] History stack properly managed
- [ ] Refresh on any page maintains proper state
- [ ] Error boundaries in place for failed auth checks

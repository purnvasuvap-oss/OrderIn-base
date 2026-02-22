# OrderIN Admin Dashboard

A production-ready frontend SaaS application built with **Vite**, **React**, **TypeScript**, **TailwindCSS**, **React Router**, **Zustand**, and **Recharts**.

## Features

### 🏪 Restaurant Management
- List all partner restaurants with search and filtering
- View detailed restaurant profiles with metrics
- Track restaurant earnings and order volumes
- Settlement tracking per restaurant

### 💳 Transaction & Ledger System
- Complete transaction history with detailed breakdowns
- Payment method analytics (UPI, Card, Cash, Net Banking, Wallet)
- Gross amount, platform fee, GST, and restaurant share calculations
- Filterable ledger view with grouping by date, restaurant, or payment method
- Transaction details modal with payment split visualization

### 📊 Analytics Dashboard
- Global summary cards: Total restaurants, transactions, volume, platform earnings, GST payable
- Line chart: Earnings over time
- Pie chart: Payment method distribution
- Bar chart: Top 10 restaurants by volume

### 💰 Payment Hub
- Order confirmation UI with restaurant and order details
- Multiple payment method selection
- Payment status page with success/failed/pending states
- Query parameter support for dynamic order details

### ⚙️ Settings & Configuration
- Account settings management
- Security controls
- Notification preferences
- Data privacy options

---

## Project Structure

```
src/
├── pages/              # All page components
├── components/         # Reusable UI components
├── layouts/           # Layout components
├── store/             # Zustand state management
├── types/             # TypeScript interfaces
├── mock/              # Mock data
└── App.tsx            # Routing & main app
```

---

## Routes

| Route | Description |
|-------|------------|
| `/login` | Login screen |
| `/dashboard` | Global analytics |
| `/restaurants` | Restaurant listing |
| `/restaurants/:restaurantId` | Restaurant details with tabs |
| `/ledger` | Finance ledger |
| `/settlements` | Settlement tracking |
| `/settings` | Admin settings |
| `/pay` | Payment hub |
| `/pay/status` | Payment status |

---

## Tech Stack

- React 19.2, TypeScript 5.9, Vite 7.2
- TailwindCSS for styling
- React Router for navigation
- Zustand for state management
- Recharts for data visualization
- lucide-react for icons
- date-fns for date operations

---

## Installation & Usage

### Install Dependencies
```bash
npm install
```

### Start Development Server
```bash
npm run dev
```
Open http://localhost:5173/ in your browser

### Build for Production
```bash
npm run build
```

---

## Mock Data

The application includes:
- **16 Restaurants** with realistic data
- **250 Transactions** with accurate payment splits
- **16 Settlements** with various statuses

All calculations are consistent:
- Gross Amount = Restaurant Receivable + Platform Fee
- Platform Fee = Razorpay Fee + GST + Net Platform Earnings
- GST = 18% of platform fee

---

## Demo Walkthrough

1. **Login**: Use any credentials at `/login`
2. **Dashboard**: View analytics and charts
3. **Restaurants**: Browse and search restaurants
4. **Restaurant Details**: Click restaurant to view metrics and transactions
5. **Transaction Details**: Click "View" to see payment breakdowns
6. **Ledger**: View all transactions with grouping options
7. **Payment Hub**: Test at `/pay?rid=rest_1&oid=ORD123&amount=5000`
8. **Payment Status**: See success page after payment

---

## Key Components

- **StatCard**: Metric display with trend
- **DataTable**: Reusable table with custom rendering
- **Modal**: Detailed view dialogs
- **DateRangePicker**: Date filtering with presets
- **Badge**: Status indicators
- **Sidebar & Topbar**: Navigation layout

---

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

---

## How to Run

```bash
npm install
npm run dev
# Navigate to http://localhost:5173/
# Login with any email/password
```

**Demo is live at http://localhost:5173/**

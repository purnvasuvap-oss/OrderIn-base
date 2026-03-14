# Orders Management Implementation

## Overview
This implementation fetches real-time orders from Firebase and displays them with status management capabilities. Orders are fetched from today's date only and include customer information, phone numbers, table numbers, and dish details.

## Architecture

### Data Structure
Orders are stored in Firebase at: `/Restaurant/orderin_restaurant_1/customers/<phone_number>/pastOrders`

Each order object contains:
```javascript
{
  timestamp: Timestamp,        // Order timestamp
  tableNumber: string,         // Table number where order was placed
  items: Array<{              // Array of ordered items
    name: string,
    quantity: number,
    // ... other item properties
  }>,
  status: string,             // "Pending", "Preparing", "Ready", "Delivered"
  specs: string,              // Special specifications/notes
  // ... other order properties
}
```

Each customer document contains:
```javascript
{
  username: string,
  pastOrders: Array<Order>,   // Array of historical orders
  // ... other customer properties
}
```

### Components

#### 1. **orderService.js** (`src/services/orderService.js`)
Service module for Firebase operations:

- **fetchTodaysOrders()**: Fetches all orders from all customers for today's date
  - Iterates through all customer documents (by phone number)
  - Filters orders by today's date only
  - Returns formatted order objects with all necessary display information

- **updateOrderStatus(phoneNumber, orderIndex, newStatus)**: Updates order status in Firebase
  - Takes phone number, order index, and new status
  - Updates the pastOrders array in the customer document
  - Persists changes to Firebase backend

- **formatOrderItems(items)**: Formats order items for display
  - Handles both string items and object items with quantity
  - Returns formatted display strings (e.g., "2x Pizza")

- **formatTime(timestamp)**: Converts Firebase timestamp to readable time
  - Handles Firestore Timestamp objects
  - Returns formatted time string (e.g., "3:30 PM")

#### 2. **Orders.jsx** (`src/pages/Orders.jsx`)
Main React component for displaying orders:

**Features:**
- Real-time data fetching from Firebase on component mount
- Today's orders only (filtered by date)
- Three filter views: All Orders, Active Orders, Completed Orders
- Search functionality (by dish name, customer name, or phone number)
- Status management with dropdown selector
- Loading states and error handling
- Responsive table layout

**State Management:**
- `orders`: Array of all fetched orders
- `loading`: Boolean for loading state
- `error`: Error message if fetch fails
- `filter`: Current filter view ("all", "active", "completed")
- `searchTerm`: Current search query
- `updatingOrderId`: Currently updating order ID (for UI feedback)

**Table Columns:**
- Customer (username)
- Phone (phone number)
- Table (table number)
- Items (ordered dishes with quantities)
- Specs (special specifications)
- Status (clickable status pill for editing)
- Time (order time)

#### 3. **Orders.css** (`src/pages/Orders.css`)
Styling for the orders table with:
- Grid-based layout (7 columns)
- Status pill colors: Pending (yellow), Preparing (red), Ready (green), Delivered (blue)
- Responsive design
- Hover effects and transitions

## Features

### 1. **Automatic Order Fetching**
Orders are fetched automatically when the Orders page loads using React's useEffect hook.

### 2. **Date Filtering**
Only orders placed today are displayed. This is done by:
- Getting today's date (set to 00:00:00)
- Comparing each order's timestamp with today's date
- Excluding orders from previous dates

### 3. **Status Management**
- Default status for all orders: **"Pending"**
- Available statuses: Pending, Preparing, Ready, Delivered
- Clicking on a status pill opens a dropdown selector
- Status changes are persisted to Firebase immediately

### 4. **Search & Filter**
- Filter by view: All, Active (non-delivered), Completed (delivered)
- Search across: dish names, customer names, phone numbers
- Real-time filtering as you type

### 5. **Multi-Customer Support**
Automatically handles multiple customers:
- Fetches orders from all phone number documents
- Displays customer username and phone number
- Each order is uniquely identified by phone number + order index

### 6. **Error Handling**
- Displays error messages if data fetch fails
- Shows "No orders" message when no orders exist
- Handles missing data gracefully with defaults

## Usage

### Viewing Orders
1. Navigate to the Orders page
2. Orders automatically load for today's date
3. Use filter tabs (Total, Active, Completed) to view different order statuses
4. Use search box to find specific dishes or customers

### Changing Order Status
1. Click on any status pill (Pending, Preparing, Ready, Delivered)
2. Select new status from dropdown
3. Status is automatically saved to Firebase
4. Table updates in real-time

### Searching
- Search by dish name: "Pizza", "French Fries"
- Search by customer username: "John", "Sarah"
- Search by phone number: "9876543210"

## Firebase Integration

### Read Path
- Collection: `Restaurant/orderin_restaurant_1/customers`
- Document: `<phone_number>` (customer phone as document ID)
- Field: `pastOrders` (array of order objects)

### Write Path
- Updates the `pastOrders` array in the customer document
- Uses array update to maintain data integrity

### Required Firestore Rules
Ensure Firestore security rules allow:
- Reading from `/Restaurant/orderin_restaurant_1/customers/{phoneNumber}`
- Writing to `/Restaurant/orderin_restaurant_1/customers/{phoneNumber}/pastOrders`

Example rule:
```javascript
match /Restaurant/orderin_restaurant_1/customers/{phoneNumber} {
  allow read: if request.auth != null;
  allow update: if request.auth != null && request.resource.data.pastOrders != null;
}
```

## Data Flow

```
Orders Page Mounts
        ↓
fetchTodaysOrders() called
        ↓
Iterate through all customers
        ↓
Filter orders by today's date
        ↓
Format order data
        ↓
Display in table
        ↓
User clicks status pill
        ↓
updateOrderStatus() called
        ↓
Firebase document updated
        ↓
Local state updated
        ↓
UI re-renders
```

## Formatting Examples

### Order Items
- Input: `[{name: "Pizza", quantity: 2}, {name: "Salad", quantity: 1}]`
- Output: `["2x Pizza", "1x Salad"]`

### Timestamp
- Input: Firestore Timestamp object
- Output: "3:30 PM" or "15:30"

## Future Enhancements
1. Add real-time updates using Firestore listeners
2. Add order detail view with full specifications
3. Add kitchen display system (KDS) integration
4. Add order timing and preparation estimates
5. Add customer notification system
6. Add order notes/comments functionality
7. Add bulk status updates
8. Add order history and analytics

## Troubleshooting

### No orders displaying
- Check if orders exist in Firebase for today's date
- Verify Firebase rules allow reading customer documents
- Check browser console for error messages
- Ensure customer documents have valid phone numbers as IDs

### Status updates not saving
- Check Firebase write permissions
- Verify phone number format matches database
- Check if pastOrders array exists in customer document
- Look for error messages in console

### Timestamp formatting issues
- Ensure Firebase timestamps are Firestore Timestamp objects
- Check if timestamp field exists in order objects
- Fallback uses current date/time if timestamp missing

## Dependencies
- React 18+
- Firebase SDK 9+
- React Router for navigation

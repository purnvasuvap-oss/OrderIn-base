# Manual Order Entry Feature

## Overview
A comprehensive manual order entry system has been added to the Orders page, allowing restaurant staff to create orders directly by:
1. Entering customer information (name, phone, table number)
2. Searching and selecting menu items
3. Setting quantities and special instructions
4. Placing the order

## Components Added

### 1. **ManualOrderModal Component** (Orders.jsx)
- Modal overlay that appears when "+ Manual Order" button is clicked
- Three main sections:
  - **Customer Information**: Name, phone number, table number input fields
  - **Menu Selection**: Searchable menu items with "+ Add" buttons
  - **Selected Items**: Order summary with quantity and instruction controls

### 2. **Manual Order Button**
- Located in the Orders page heading row
- Red button labeled "+ Manual Order"
- Opens the manual order creation modal

### 3. **Menu Item Fetching**
- Automatically fetches all menu items from Firestore on component load
- Items display with name and price
- Search functionality filters items in real-time

## Features

### Customer Information Section
- **Customer Name** (required): Text input for customer name
- **Phone Number** (required): Phone number field (creates order under this customer's record)
- **Table Number** (required): Numeric input for table assignment

### Menu Selection Section
- **Search Bar**: Real-time search filtering menu items
- **Menu List**: Displays all menu items with:
  - Item name
  - Item price (₹)
  - "+ Add" button to select items
- Scrollable list with 300px max height
- Shows "No items found" when search has no matches

### Selected Items Section
- **Item Quantity**: Numeric input (min: 1) to set quantity
- **Item Name**: Display of selected item with quantity prefix (e.g., "2x Biryani")
- **Special Instructions**: Text field for custom requests, special notes, or modifications
- **Remove Button**: Delete item from order before submission
- Item counter showing total selected items

## Data Structure

### Order Document Created in Firebase
```javascript
{
  username: "Customer Name",              // From input
  phoneNumber: "+91XXXXXXXXXX",          // From input
  tableNumber: 5,                         // From input
  items: [                                // Selected items array
    {
      name: "Biryani",
      quantity: 2,
      instructions: "Less spicy",
      menuId: "menu_item_id"
    },
    {
      name: "Raita",
      quantity: 1,
      instructions: "",
      menuId: "menu_item_id2"
    }
  ],
  status: "Pending",                      // Default status
  timestamp: serverTimestamp(),           // Firebase server time
  isManualOrder: true                     // Flag indicating manual entry
}
```

### Firebase Path
`Restaurant/orderin_restaurant_1/orders/{phoneNumber}/ordersList`

## UI/UX Features

### Styling
- **Color Scheme**: Red accent (#e53935) for buttons matching existing design
- **Modal Design**: 
  - Two-column layout on desktop (Customer Info + Menu on left, Selected Items on right)
  - Single column on mobile
  - 90% viewport width, max 900px
  - 90vh max height with scroll

### Validation
- **Error Messages**: Red alert box at top of modal
- **Required Fields**: All customer info fields required
- **Minimum Items**: At least one item required before submission
- **Disabled Submit**: Submit button disabled until items are added

### Responsive Design
- Desktop: 2-column grid layout
- Tablet/Mobile: Stacked single column
- Fully functional on all screen sizes

### Loading States
- "Creating..." button text during submission
- Submit button disabled during submission
- Cancel button also disabled during submission to prevent duplicate actions

## Integration Points

### Menu Items Source
- Fetched from: `Restaurant/orderin_restaurant_1/menu`
- Includes: id, name, price, and other menu properties
- Updates on component mount

### Order Storage
- Stored under customer's phone number in orders collection
- Automatically appears in:
  - Today's orders dashboard
  - Real-time order list
  - Order search/filter results
- Can be managed like regular customer orders (status updates, etc.)

## Error Handling
- **File Read Errors**: Logged to console, gracefully fail
- **Order Creation Errors**: User-friendly error message in modal
- **Missing Fields**: Specific validation messages
- **Firebase Errors**: Caught and displayed with error code

## User Workflow

1. **Click "+ Manual Order"** button in Orders page header
2. **Enter Customer Information**:
   - Type customer name
   - Enter phone number
   - Enter table number
3. **Add Menu Items**:
   - Type in search box to filter menu
   - Click "+ Add" on desired items
   - Items appear in "Selected Items" section
4. **Customize Order**:
   - Adjust quantity for each item
   - Add special instructions (e.g., "less spicy", "no onions")
   - Remove items if needed
5. **Submit Order**:
   - Click "Create Order" button
   - Modal closes and order appears in orders list
   - Staff can now manage status of manual order like any other order

## Technical Details

### Dependencies
- Firebase Firestore: `addDoc`, `serverTimestamp`, `collection`, `getDocs`
- React Hooks: `useState`, `useEffect`

### Performance Optimizations
- Menu items fetched once on mount
- Modal state is isolated from main orders state
- Search filtering is client-side (fast)

### Error Recovery
- If order creation fails, user stays in modal to retry
- Menu items persist even if order submission fails
- Partial entry is preserved on error

## Future Enhancements
- Order templates for frequently ordered combinations
- Quick-copy previous orders feature
- Discount/coupon code application
- Payment method selection
- Receipt printing directly from manual orders
- Bill generation for manual orders

# Firebase Database Structure - Quick Reference

## Expected Firestore Structure

```
Firestore Database
└── Restaurant (Collection)
    └── orderin_restaurant_1 (Document)
        └── customers (Collection)
            ├── 9876543210 (Document - Phone Number)
            │   ├── username: "John Doe" (String)
            │   ├── pastOrders: [...] (Array)
            │   │   ├── [0] (Object)
            │   │   │   ├── timestamp: Timestamp(1732886400, 0) (Firestore Timestamp)
            │   │   │   ├── tableNumber: "3" (String)
            │   │   │   ├── items: [...] (Array)
            │   │   │   │   ├── [0] (Object)
            │   │   │   │   │   ├── name: "Pizza" (String)
            │   │   │   │   │   ├── quantity: 2 (Number)
            │   │   │   │   │   └── ... (other item fields)
            │   │   │   │   └── [1] {...}
            │   │   │   ├── status: "Pending" (String)
            │   │   │   └── specs: "Extra Straw" (String)
            │   │   └── [1] (Object) - Another past order
            │   └── ... (other customer fields)
            └── 9876543211 (Document - Another Phone Number)
                ├── username: "Jane Smith" (String)
                ├── pastOrders: [...] (Array)
                └── ... (other fields)
```

## Required Fields for Orders to Display

### Customer Document Fields
| Field | Type | Required | Example |
|-------|------|----------|---------|
| `username` | String | Yes | "John Doe" |
| `pastOrders` | Array | Yes | `[{...}, {...}]` |

### Order Object Fields (in pastOrders array)
| Field | Type | Required | Example |
|-------|------|----------|---------|
| `timestamp` | Firestore Timestamp | **YES** | `Timestamp(1732886400, 0)` |
| `tableNumber` | String or Number | Yes | "3" or `3` |
| `items` | Array | Yes | `[{name: "Pizza", quantity: 2}]` |
| `status` | String | Optional | "Pending" (default if missing) |
| `specs` | String | Optional | "Extra Straw" |

### Item Object Fields
| Field | Type | Required | Example |
|-------|------|----------|---------|
| `name` | String | Yes | "Pizza" |
| `quantity` | Number | Yes | 2 |

## Example Complete JSON Structure

```json
{
  "Restaurant": {
    "orderin_restaurant_1": {
      "customers": {
        "9876543210": {
          "username": "John Doe",
          "phone": "9876543210",
          "pastOrders": [
            {
              "timestamp": "Timestamp(seconds=1732886400, nanoseconds=0)",
              "tableNumber": "3",
              "items": [
                {
                  "name": "Pizza",
                  "quantity": 2
                },
                {
                  "name": "Caesar Salad",
                  "quantity": 1
                }
              ],
              "status": "Pending",
              "specs": "Extra Straw"
            },
            {
              "timestamp": "Timestamp(seconds=1732718400, nanoseconds=0)",
              "tableNumber": "1",
              "items": [
                {
                  "name": "Burger",
                  "quantity": 1
                }
              ],
              "status": "Delivered",
              "specs": ""
            }
          ]
        },
        "9876543211": {
          "username": "Jane Smith",
          "phone": "9876543211",
          "pastOrders": [
            {
              "timestamp": "Timestamp(seconds=1732900800, nanoseconds=0)",
              "tableNumber": "5",
              "items": [
                {
                  "name": "French Fries",
                  "quantity": 3
                }
              ],
              "status": "Ready",
              "specs": "Extra Salt"
            }
          ]
        }
      }
    }
  }
}
```

## Firebase Console Path Navigation

To view your data:

1. **Go to Firebase Console**
   - URL: `https://console.firebase.google.com/`
   - Project: `orderin-2927a`

2. **Navigate to Firestore Database**
   - Click "Firestore Database" in left menu

3. **Follow the path:**
   ```
   Restaurant
     └─ Click "orderin_restaurant_1"
        └─ Click "customers"
           └─ Click "9876543210" (or any phone number)
              └─ See "pastOrders" array
                 └─ Click any order to view details
   ```

## Timestamp Creation in Firebase Console

### Using Firebase Console UI:
1. Open customer document
2. Click on `pastOrders` array item
3. Click on `timestamp` field
4. Click the clock icon
5. Select date and time
6. Confirm

### Required: Today's Date
- Must be: **November 30, 2025** (current date)
- Any other date will be filtered out

### Time Format
- Firestore auto-converts to: `Timestamp { seconds: 1732886400, nanoseconds: 0 }`
- This represents the date and time of order creation

## Common Mistakes

❌ **WRONG:**
```json
{
  "timestamp": "2025-11-30 14:30:00",  // String - Won't work
  "tableNumber": 3,                     // Number instead of string
  "items": "Pizza, Salad",              // String instead of array
  "pastOrders": null                    // Null instead of array
}
```

✅ **CORRECT:**
```json
{
  "timestamp": Timestamp(1732886400, 0),  // Firestore Timestamp object
  "tableNumber": "3",                     // String
  "items": [                              // Array of objects
    {
      "name": "Pizza",
      "quantity": 2
    }
  ],
  "pastOrders": [...]                     // Array
}
```

## Verification Checklist

Before running Orders page, verify:

- [ ] Firebase project is active and connected
- [ ] Path exists: `Restaurant` → `orderin_restaurant_1` → `customers`
- [ ] At least 1 customer document exists (ID = phone number)
- [ ] Customer document has `username` field
- [ ] Customer document has `pastOrders` array (not null/empty)
- [ ] At least 1 order exists in `pastOrders` array
- [ ] Order has `timestamp` field (not missing/null)
- [ ] Timestamp is Firestore Timestamp type (not string)
- [ ] Timestamp is set to today's date (November 30, 2025)
- [ ] Order has `tableNumber` field
- [ ] Order has `items` array with at least 1 item
- [ ] Each item has `name` and `quantity` fields

## Fixing Common Issues

### Issue: "Found 0 customer documents"
**Check:**
- Path is correct: `Restaurant/orderin_restaurant_1/customers`
- Collection `customers` exists
- At least 1 document exists in collection
- Document IDs are phone numbers (strings)

**Fix:**
1. In Firebase, create new document in `customers` collection
2. Set Document ID to a phone number (e.g., `9876543210`)
3. Add field `username` with a name
4. Add field `pastOrders` as empty array `[]`

### Issue: "No pastOrders array found"
**Check:**
- Customer document has `pastOrders` field
- `pastOrders` is an Array type (not Object)
- Not null or undefined

**Fix:**
1. Edit customer document
2. Add field: `pastOrders`
3. Set type to: **Array**
4. Leave empty or add orders

### Issue: "Order not from today - skipping"
**Check:**
- Order's `timestamp` is for today (Nov 30, 2025)
- Not for yesterday (Nov 29) or tomorrow (Dec 1)

**Fix:**
1. Edit order's `timestamp` field
2. Change date to today (Nov 30, 2025)
3. Keep time as is

### Issue: "No timestamp found"
**Check:**
- Order has `timestamp` field
- `timestamp` is not null/empty
- `timestamp` is Firestore Timestamp type

**Fix:**
1. Click on order object
2. Add field: `timestamp`
3. Select type: **Timestamp**
4. Set to current date/time

## Field Type Reference

| Type | Firestore Type | Example |
|------|---|---|
| Text | String | "John Doe" |
| Number | Number | 2 |
| True/False | Boolean | true |
| Date/Time | Timestamp | Timestamp(1732886400, 0) |
| List | Array | [{...}, {...}] |
| Map/Object | Map | {name: "Pizza", quantity: 2} |

## Testing with Console

Once data is set up, test in browser:

1. Open Orders page
2. Press F12 (DevTools)
3. Go to Console tab
4. Should see:
   ```
   === STARTING FETCH ORDERS ===
   Today's date range: 11/30/2025, 12:00:00 AM to 12/1/2025, 12:00:00 AM
   Found X customer document(s)
   ✅ ADDING ORDER TO LIST
   Total orders from today: X
   ```

5. If not, check logs for errors
6. Fix issues according to Troubleshooting section

# Orders Display - Visual Reference Guide

## What Users Will See

### Orders Table Display (November 30, 2025)

```
┌────────────────┬──────────────┬────────┬──────────────┬──────────────┬──────────┬─────────┐
│   Customer     │    Phone     │ Table  │    Items     │    Specs     │  Status  │  Time   │
├────────────────┼──────────────┼────────┼──────────────┼──────────────┼──────────┼─────────┤
│ Shaam          │ 9876543210   │ 3      │ 2x Pizza     │ Extra Straw  │ Pending  │ 2:30 PM │
│                │              │        │ 1x Salad     │              │          │         │
├────────────────┼──────────────┼────────┼──────────────┼──────────────┼──────────┼─────────┤
│ Priya          │ 9876543211   │ 3      │ 1x Pasta     │ No Onions    │Preparing │ 1:15 PM │
├────────────────┼──────────────┼────────┼──────────────┼──────────────┼──────────┼─────────┤
│ Sai            │ 9876543212   │ 5      │ 3x Fries     │ Extra Salt   │ Ready    │ 12:45 PM│
├────────────────┼──────────────┼────────┼──────────────┼──────────────┼──────────┼─────────┤
│ Ram            │ 9876543213   │ 1      │ 1x Pizza     │ Extra Straw  │Delivered │ 11:30 AM│
│                │              │        │ 1x Salad     │              │          │         │
└────────────────┴──────────────┴────────┴──────────────┴──────────────┴──────────┴─────────┘
```

## Key Display Features

### 1. Time Format (12-Hour Timeline)
The "Time" column displays order placement time in 12-hour format:

```
Morning Orders:
- 8:15 AM    (8:15 in the morning)
- 9:30 AM    (9:30 in the morning)
- 11:45 AM   (11:45 in the morning)
- 12:00 PM   (Noon)

Afternoon Orders:
- 12:30 PM   (12:30 after noon)
- 2:30 PM    (2:30 in the afternoon)
- 3:45 PM    (3:45 in the afternoon)
- 5:00 PM    (5:00 in the evening)

Evening Orders:
- 6:15 PM    (6:15 in the evening)
- 8:30 PM    (8:30 in the evening)
- 9:45 PM    (9:45 in the evening)
- 11:30 PM   (11:30 at night)

Night Orders:
- 12:15 AM   (12:15 after midnight) - Only if today extends past midnight
```

### 2. Date Filtering - What Gets Displayed

**Today: November 30, 2025**

✅ **DISPLAYED (Included):**
- Nov 30, 2025 12:00 AM → Shows in list
- Nov 30, 2025 8:15 AM  → Shows in list
- Nov 30, 2025 2:30 PM  → Shows in list
- Nov 30, 2025 11:59 PM → Shows in list

❌ **NOT DISPLAYED (Excluded):**
- Nov 29, 2025 11:59 PM → Hidden (yesterday)
- Dec 1, 2025 12:00 AM  → Hidden (tomorrow)
- Orders with no timestamp → Hidden (invalid)
- Nov 30, 2024 2:30 PM  → Hidden (different year)

### 3. Complete Order Information Shown

Each row displays:

| Field | Example | Notes |
|-------|---------|-------|
| Customer | Shaam | Username of person who placed order |
| Phone | 9876543210 | Unique customer phone number |
| Table | Table 3 | Table where customer was seated |
| Items | 2x Pizza | Dish names with quantities ordered |
|        | 1x Salad | Can be multiple items (multiple rows) |
| Specs | Extra Straw | Special instructions/notes |
| Status | Pending | Clickable to change status |
| Time | 2:30 PM | 12-hour format with AM/PM |

### 4. Status Indicators

```
Pending  ← Yellow pill | Default status for new orders
          Orders waiting to be started

Preparing ← Red pill | Order being prepared
            Currently in kitchen

Ready    ← Green pill | Order ready for pickup
          Waiting for customer

Delivered ← Blue pill | Order completed
           Served to customer
```

### 5. Search & Filter Results

**Example Search Results:**

If user searches for "Pizza":
```
Results: 2 orders containing "Pizza"

│ Shaam         │ 9876543210   │ 3 │ 2x Pizza 1x Salad │ Extra Straw │ Pending  │ 2:30 PM │
│ Ram           │ 9876543213   │ 1 │ 1x Pizza 1x Salad │ Extra Straw │Delivered │ 11:30 AM│
```

If user searches for "9876543210":
```
Results: 1 order from this phone number

│ Shaam         │ 9876543210   │ 3 │ 2x Pizza 1x Salad │ Extra Straw │ Pending  │ 2:30 PM │
```

## Real-Time Behavior

### When Page Loads:
1. Shows "Loading today's orders..." message
2. Fetches data from Firebase
3. Filters orders to today's date only
4. Displays in table (newest first)
5. Shows time in 12-hour format

### When Status is Changed:
1. Click on status pill (e.g., "Pending")
2. Dropdown menu appears with options:
   - Pending
   - Preparing
   - Ready
   - Delivered
3. Select new status
4. Updates in Firebase immediately
5. Table updates in real-time
6. Shows "Updating..." while saving

### When Search is Used:
1. Type in search box (e.g., "Pizza")
2. Table filters in real-time
3. Shows only matching orders
4. "No orders match your search" if no results

### When Filter Tabs Are Clicked:
- **Total Orders Tab** → Shows all orders
- **Active Orders Tab** → Shows Pending, Preparing, Ready (excludes Delivered)
- **Completed Tab** → Shows only Delivered orders

## Time Display Examples

### 12-Hour Format Timeline
```
Midnight to Noon:
12:00 AM ─ 1:00 AM ─ 2:00 AM ─ 3:00 AM ─ 4:00 AM ─ 5:00 AM
6:00 AM ─ 7:00 AM ─ 8:00 AM ─ 9:00 AM ─ 10:00 AM ─ 11:00 AM ─ 12:00 PM

Noon to Midnight:
12:00 PM ─ 1:00 PM ─ 2:00 PM ─ 3:00 PM ─ 4:00 PM ─ 5:00 PM
6:00 PM ─ 7:00 PM ─ 8:00 PM ─ 9:00 PM ─ 10:00 PM ─ 11:00 PM
```

### With Minutes:
```
12:30 AM  (30 minutes after midnight)
1:45 AM   (1:45 in the morning)
9:15 AM   (9:15 in the morning)
11:30 AM  (11:30 in the morning)
12:00 PM  (Noon)
12:30 PM  (30 minutes after noon)
2:45 PM   (2:45 in the afternoon)
5:15 PM   (5:15 in the evening)
11:59 PM  (almost midnight)
```

## Example Complete Display

### Scenario: November 30, 2025 at 3:00 PM

**Page Title:** "Total Orders"  
**Stats:**
- Total Orders: 4
- Active Orders: 2
- Completed: 2

**Table:**
```
──────────────────────────────────────────────────────────────────
│ Customer │ Phone      │ Table │ Items              │ Status │ Time    │
──────────────────────────────────────────────────────────────────
│ Priya    │ 9876543211 │ 3     │ 1x Pasta           │ Prep   │ 1:15 PM │
│ Sai      │ 9876543212 │ 5     │ 3x Fries           │ Ready  │ 12:45 PM│
│ Shaam    │ 9876543210 │ 3     │ 2x Pizza, 1x Salad │ Pend   │ 2:30 PM │
│ Ram      │ 9876543213 │ 1     │ 1x Pizza, 1x Salad │ Done   │ 11:30 AM│
──────────────────────────────────────────────────────────────────
```

**Notes:**
- All times shown in 12-hour format with AM/PM
- Only orders from November 30, 2025 shown
- Orders from November 29 or earlier: NOT shown
- Orders from December 1 or later: NOT shown
- Ordered by time (newest first in active view)

---

## Important Notes for Users

✅ **Only Today's Orders Display**
- No matter when you check the system
- You always see orders from today's date only
- Orders from previous days automatically hidden

✅ **Time Shows in 12-Hour Format**
- Example: "2:30 PM" not "14:30"
- Example: "11:15 AM" not "11:15"
- Always includes AM or PM indicator

✅ **All Customer Information Visible**
- Username and phone number for each customer
- Table number where they're sitting
- Complete list of items ordered
- Any special instructions/specifications

✅ **Status Tracking**
- Easily see which orders are pending, being prepared, ready, or delivered
- One click to update status for any order

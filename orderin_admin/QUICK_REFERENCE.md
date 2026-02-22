# Quick Reference Guide

## The 5 Settlement Cases Explained in Simple Terms

### 🎯 Case 1: Exact Payment
```
Due This Month: ₹10,000
You Pay: ₹10,000 exactly
What Happens:
  ✓ Month closes automatically
  ✓ "Period closed — Paid" message appears
  ✓ Cannot add more payments
  ✓ Extra Amount for Next Month: ₹0
```

---

### 💰 Case 2: Pay Too Much (Single Payment)
```
Due This Month: ₹10,000
You Pay: ₹20,000 (too much!)
What Happens:
  ✓ Month closes automatically
  ✓ "Period closed — Overpaid by ₹10,000" message
  ✓ Cannot add more payments
  ✓ Extra Amount for Next Month: ₹10,000 ⭐
```

---

### 📊 Case 3: Multiple Small Payments → Exact
```
Due This Month: ₹10,000
Payment 1: ₹2,000     Status: Still Open
Payment 2: ₹3,000     Status: Still Open
Payment 3: ₹5,000     Status: NOW CLOSED ✓
What Happens:
  ✓ Month stays open until final payment
  ✓ All 3 payments shown in history
  ✓ Closes when total reaches ₹10,000
  ✓ Extra Amount for Next Month: ₹0
```

---

### 🔄 Case 4: Multiple Small Payments → Overpay
```
Due This Month: ₹10,000
Payment 1: ₹2,000     Status: Still Open
Payment 2: ₹3,000     Status: Still Open
Payment 3: ₹6,000     Status: NOW CLOSED ✓ (total = ₹11,000)
What Happens:
  ✓ Month stays open until final payment
  ✓ All 3 payments shown in history
  ✓ Closes with "Period closed — Overpaid by ₹1,000"
  ✓ Extra Amount for Next Month: ₹1,000 ⭐
```

---

### 🔗 Case 5: Auto-Settlement Next Month
```
Month 1 Result:
  ✓ Paid ₹20,000 (Due was ₹10,000)
  ✓ Extra Amount: ₹10,000

Month 2 Starts (automatic):
  ✓ System auto-applies ₹10,000 from extra
  ✓ Month 2 Due: ₹10,000
  ✓ Auto-paid: ₹10,000 (marked as "Auto-paid from Previous Cycle")
  ✓ Status: CLOSED (no payment input needed)
  ✓ Extra Amount: ₹0

Month 3 Starts:
  ✓ No extra amount to use
  ✓ Month 3 Due: ₹10,000
  ✓ Status: OPEN (ready for new payments)
```

---

## Key Rules to Remember

### Rule 1️⃣: Payment Closing
```
When: totalPaid >= totalAmountDue
Result: 
  • Payment input CLOSES
  • No more payments can be added
  • Show "Period closed" message
```

### Rule 2️⃣: Extra Amount Calculation
```
extraAmount = totalPaid - totalAmountDue
Examples:
  • Paid ₹10,000, Due ₹10,000 → Extra = ₹0
  • Paid ₹20,000, Due ₹10,000 → Extra = ₹10,000
  • Paid ₹9,000,  Due ₹10,000 → Extra = ₹0 (can't be negative)
```

### Rule 3️⃣: Auto-Payment Next Month
```
If extraAmount > 0:
  • Create auto-payment for next month
  • Amount = extraAmount
  • Mark as "Auto-paid from Previous Cycle"
  
Then calculate:
  • If auto-payment >= next month's due
    → Next month CLOSES immediately
  • Else
    → Next month stays OPEN
```

---

## What You See on Screen

### When Period is OPEN (Accepting Payments)
```
Total Due:  ₹10,000
Total Paid: ₹5,000
Remaining:  ₹5,000  ← Shown in input placeholder

[Add payment field] [Add Button] ✅
```

### When Period is CLOSED (Fully Paid)
```
Total Due:  ₹10,000
Total Paid: ₹10,000
Remaining:  ₹0

❌ "Period closed — Paid"
   No further payments accepted for this period.
```

### When Period is CLOSED (Overpaid)
```
Total Due:  ₹10,000
Total Paid: ₹20,000
Remaining:  ₹0

❌ "Period closed — Overpaid by ₹10,000"
   No further payments accepted for this period.

Additional Paid Section (VISIBLE):
┌─────────────────────────────┐
│ Additional Paid             │
│ ₹10,000                     │
│ Available for next cycle    │
└─────────────────────────────┘
```

### Payment History Shows
```
Feb 2026 settlement:
✓ 15 Feb, 10:30 AM  →  ₹5,000   (Your payment)
✓ 20 Feb, 02:15 PM  →  ₹15,000  (Your payment)

Settled — 2 installments • ₹20,000
```

### With Auto-Payment Next Month
```
Mar 2026 settlement (automatically):
✓ 01 Mar, 12:00 AM  →  ₹10,000  (Auto-paid from Previous Cycle) [GREEN]

Period closed — Paid
No further payments accepted for this period.
```

---

## Flow Diagram

```
Restaurant Sets Amount
         ↓
    ₹10,000 Due
         ↓
   ┌─────┴─────┐
   │           │
Pay ₹10,000   Pay ₹20,000
   │           │
   ↓           ↓
CLOSED      CLOSED
Extra=0     Extra=10,000
   │           │
   ↓           ↓
Next Month  Next Month
No Extra    Auto-pay ₹10,000
OPEN        CLOSED ✓
```

---

## FAQ

**Q: What if I pay more than due?**
A: The extra amount automatically carries to next month and gets auto-applied.

**Q: Can I remove a payment?**
A: Not yet. Each payment is locked in the history for audit purposes.

**Q: What if extra amount is more than next month's due?**
A: Extra overflows continue to next period. Example:
   - Extra = ₹15,000, Next Due = ₹10,000
   - Auto-pay: ₹10,000 (next month closes)
   - New Extra = ₹5,000 (for month after)

**Q: When does next month start?**
A: After 30 days (or 1 minute in test mode) from the start of current month.

**Q: What if I don't set a default amount?**
A: Settlement still exists but shows ₹0 due until you set it.

**Q: Can I see all past payments?**
A: Yes! Under "Payment History" and "Past Settlement Periods" in settlement tab.

---

## Color Reference

```
🟢 GREEN:
   - Additional Paid section
   - Auto-payments in history
   - Success states

🔵 CYAN:
   - Total Due
   - Period Status
   - Main UI elements

🟡 ORANGE/AMBER:
   - Warning states
   - Pending items

🔴 RED:
   - Errors
   - Negative amounts
```

---

## For Developers

### Key Files Modified
- `src/store/index.ts` → Payment logic & period transitions
- `src/pages/RestaurantDetailsPage.tsx` → UI & user feedback

### Key Functions
- `addPaymentToSettlementById()` → Adds payment, calculates overflow
- `createNextSettlementIfNeeded()` → Transitions to next period, auto-applies extra

### Key Variables
- `additionalPaid` → Overpaid amount carrying to next period
- `totalPaid` → Sum of all payments in current period
- `totalAmountDue` → The target amount for current period

---

## Testing Checklist

- [ ] Pay exactly the due amount → Should close period
- [ ] Pay more than due amount → Should show overpaid message + extra amount
- [ ] Pay in installments → Should show all payments in history
- [ ] Pay across installments exceeding due → Should handle correctly
- [ ] Wait for next period → Should auto-apply extra amount
- [ ] Check auto-closed periods → Should be locked
- [ ] Check payment history → Should show all entries with timestamps
- [ ] Verify no double payments → Should reject if already paid

---

## You're All Set! 🎉

The settlement system now properly handles:
✅ Payment closure when due is reached  
✅ Overpayment tracking  
✅ Automatic carry-forward to next period  
✅ Auto-settlement of pre-paid periods  
✅ Clear user feedback  
✅ Complete audit trail  

Happy settling! 💳

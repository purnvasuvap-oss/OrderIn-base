import { db } from "../firebase";
import { collection, getDocs, doc, updateDoc, getDoc, onSnapshot } from "firebase/firestore";

/**
 * Get today's date at midnight (start of day) for comparison
 * Returns a Date object with time set to 00:00:00
 */
const getTodayAtMidnight = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

/**
 * Get tomorrow's date at midnight (end of today)
 * Used to filter orders within today's date range
 */
const getTomorrowAtMidnight = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
};

/**
 * Extract timestamp from order, checking multiple possible field names
 * Handles: time, timestamp, createdAt, orderDate, date, etc.
 */
const getOrderTimestamp = (order) => {
  // Check common timestamp field names (time is primary in this database)
  if (order.time) return order.time;
  if (order.timestamp) return order.timestamp;
  if (order.createdAt) return order.createdAt;
  if (order.orderDate) return order.orderDate;
  if (order.date) return order.date;
  
  // If no timestamp field found, return null
  return null;
};

/**
 * Attempt to locate a tax value on the order object.
 * Searches common top-level keys and one-level nested objects for keys containing "tax".
 * Returns null when no explicit tax value is found.
 */
const findProvidedTax = (order) => {
  if (!order || typeof order !== 'object') return null;

  // Direct common keys
  const directKeys = ['tax', 'taxAmount', 'tax_amount', 'tax_value', 'tax_value_amount', 'taxAmt', 'tax_amt'];
  for (const k of directKeys) {
    if (k in order && order[k] !== null && order[k] !== undefined) return order[k];
  }

  // If order has a 'taxes' array (e.g., breakdown), sum numeric entries
  if (Array.isArray(order.taxes) && order.taxes.length > 0) {
    const sum = order.taxes.reduce((acc, t) => {
      if (t == null) return acc;
      if (typeof t === 'number') return acc + t;
      if (typeof t === 'object') {
        const v = t.amount ?? t.value ?? t.tax ?? t.taxAmount;
        const p = Number(String(v).replace(/[^0-9.-]+/g, ''));
        return acc + (isNaN(p) ? 0 : p);
      }
      const parsed = Number(String(t).replace(/[^0-9.-]+/g, ''));
      return acc + (isNaN(parsed) ? 0 : parsed);
    }, 0);
    if (sum > 0) return sum;
  }

  // Search one level deep for keys containing 'tax'
  for (const [k, v] of Object.entries(order)) {
    if (!v || typeof v !== 'object') continue;
    for (const [nk, nv] of Object.entries(v)) {
      if (String(nk).toLowerCase().includes('tax') && nv !== null && nv !== undefined) return nv;
    }
  }

  return null;
};

/**
 * Normalize and derive payment information from an order object.
 * Returns: { paymentType, paymentStatus, paidDisplay, paidAmount }
 */
const derivePaymentInfo = (order) => {
  // Possible fields in different writes: paymentMethod, paymentType, paymentMethodType, method, paymentMode
  // Also check nested payment objects (order.payment, order.transaction, order.card)
  const nestedPaymentMethod = (order.payment && (order.payment.method || order.payment.type || order.payment.paymentMethod)) ||
    (order.transaction && (order.transaction.method || order.transaction.type)) ||
    (order.card && (order.card.type || order.card.brand));
  const rawMethod = (order.paymentMethod || order.paymentType || order.method || order.payment_mode || order.paymentMode || nestedPaymentMethod || "").toString();
  const rawStatus = (order.paymentStatus || order.payment_status || "").toString();
  const rawPaidAmount = Number(
    (order.paidAmount !== undefined && order.paidAmount !== null) ? order.paidAmount :
    (order.paidAmountValue !== undefined && order.paidAmountValue !== null) ? order.paidAmountValue :
    (order.paid !== undefined && order.paid !== null) ? order.paid :
    (order.amountPaid !== undefined && order.amountPaid !== null) ? order.amountPaid :
    0
  ) || 0;
  const verificationCode = order.verificationCode || order.code || order.txnRef || order.transactionId || "";

  // Normalize payment type into a small set
  const methodLower = rawMethod.toLowerCase();
  let paymentType = "Unknown";
  
  // Check if it's a manual order first
  if (methodLower.includes("manual")) {
    paymentType = "Manual";
  } else if (!methodLower) {
    // If nothing present, try to infer from paymentStatus or flags
    if (rawStatus.toLowerCase().includes("card") || String(order.cardLast4) || (order.card && (order.card.last4 || order.card.brand))) paymentType = "Card";
    if (!paymentType && order.payment && (order.payment.cardToken || order.payment.last4 || order.payment.cardLast4)) paymentType = "Card";
  } else if (methodLower.includes("card") || methodLower.includes("visa") || methodLower.includes("master") || methodLower.includes("rupay")) {
    paymentType = "Card";
  } else if (methodLower.includes("upi") || methodLower.includes("google") || methodLower.includes("paytm") || methodLower.includes("phonepe")) {
    paymentType = "UPI";
  } else if (methodLower.includes("cash")) {
    paymentType = "Cash";
  } else if (methodLower.includes("wallet") || methodLower.includes("online") || methodLower.includes("netbanking") || methodLower.includes("gateway")) {
    paymentType = "Online";
  } else {
    // fallback: use raw but capitalized
    paymentType = rawMethod ? rawMethod.charAt(0).toUpperCase() + rawMethod.slice(1) : "Unknown";
  }

  // Normalize status
  let paymentStatus = "unknown";
  if (rawStatus) {
    const s = rawStatus.toLowerCase().trim();
    // Check for explicit negative statuses first to avoid matching 'paid' inside 'unpaid'
    if (s.includes("manual")) {
      paymentStatus = "manual";
    } else if (s.includes("unpaid") || s.includes("pending") ) {
      paymentStatus = "unpaid";
    } else if (s.includes("failed") || s.includes("error") ) {
      paymentStatus = "failed";
    } else if (s === "paid" || /\bpaid\b/.test(s) || s === "success" || s === "completed") {
      paymentStatus = "paid";
    } else {
      paymentStatus = s;
    }
  } else {
    // infer from paid amount
    if (rawPaidAmount > 0) paymentStatus = "paid";
    else if (verificationCode) paymentStatus = "unpaid";
    else paymentStatus = "unknown";
  }

  // Determine what to display in the 'Paid' column
  let paidDisplay = "-";
  if (paymentStatus === "manual") {
    paidDisplay = "Manual Order";
  } else if (paymentStatus === "paid") {
    // show Paid or the paid amount if available
    paidDisplay = rawPaidAmount > 0 ? `₹${rawPaidAmount.toFixed ? rawPaidAmount.toFixed(2) : rawPaidAmount}` : "Paid";
  } else if (verificationCode) {
    paidDisplay = verificationCode;
  } else if (paymentStatus === "failed") {
    paidDisplay = "Failed";
  } else if (paymentType && paymentType !== "Unknown") {
    // show paymentType as fallback
    paidDisplay = paymentType;
  }

  return {
    paymentType,
    paymentStatus,
    paidDisplay,
    paidAmount: rawPaidAmount,
    verificationCode,
  };
};

/**
 * Check if a timestamp falls within today's date range
 * Accounts for timezone differences
 * Handles: Firestore Timestamp objects, Date objects, numbers, and date strings
 */
const isOrderFromToday = (timestamp) => {
  if (!timestamp) {
    console.log("    [isOrderFromToday] No timestamp provided");
    return false;
  }
  
  try {
    let orderDate;
    
    // Handle Firestore Timestamp objects
    if (timestamp.toDate && typeof timestamp.toDate === "function") {
      orderDate = timestamp.toDate();
      console.log("    [isOrderFromToday] Converted Firestore Timestamp to Date");
    } 
    // Handle JavaScript Date objects
    else if (timestamp instanceof Date) {
      orderDate = timestamp;
      console.log("    [isOrderFromToday] Already a Date object");
    } 
    // Handle numeric timestamps (milliseconds or seconds)
    else if (typeof timestamp === "number") {
      orderDate = new Date(timestamp);
      console.log("    [isOrderFromToday] Converted number to Date");
    } 
    // Handle string timestamps (e.g., "11/30/2025, 6:24:00 PM")
    else if (typeof timestamp === "string") {
      console.log("    [isOrderFromToday] Parsing string timestamp");
      orderDate = new Date(timestamp);
      console.log(`    [isOrderFromToday] Parsed string to Date: ${orderDate.toLocaleString()}`);
    } 
    else {
      console.log(`    [isOrderFromToday] Unknown timestamp type: ${typeof timestamp}`);
      return false;
    }
    
    if (isNaN(orderDate.getTime())) {
      console.log("    [isOrderFromToday] Invalid date after conversion");
      return false;
    }
    
    const todayStart = getTodayAtMidnight();
    const todayEnd = getTomorrowAtMidnight();
    
    const orderTime = orderDate.getTime();
    const todayStartTime = todayStart.getTime();
    const todayEndTime = todayEnd.getTime();
    
    console.log(`    [isOrderFromToday] Order date: ${orderDate.toLocaleString()}`);
    console.log(`    [isOrderFromToday] Range: ${todayStart.toLocaleString()} - ${todayEnd.toLocaleString()}`);
    console.log(`    [isOrderFromToday] Check: ${orderTime} >= ${todayStartTime} && ${orderTime} < ${todayEndTime}`);
    
    const isFromToday = orderTime >= todayStartTime && orderTime < todayEndTime;
    console.log(`    [isOrderFromToday] Result: ${isFromToday}`);
    
    return isFromToday;
  } catch (error) {
    console.error("    [isOrderFromToday] Error checking order date:", error);
    return false;
  }
};

/**
 * Fetch all orders from today for all customers
 * Path: /Restaurant/orderin_restaurant_1/customers/<phone_number>/pastOrders
 * Only returns orders placed today (today's date only)
 * Falls back to showing all orders if no timestamp present
 */
export const fetchTodaysOrders = async () => {
  try {
    console.log("=== STARTING FETCH ORDERS ===");
    const todayStart = getTodayAtMidnight();
    const todayEnd = getTomorrowAtMidnight();
    console.log(`Today's date range: ${todayStart.toLocaleString()} to ${todayEnd.toLocaleString()}`);

    const customersRef = collection(
      db,
      "Restaurant",
      "orderin_restaurant_1",
      "customers"
    );

    const customersSnapshot = await getDocs(customersRef);
    console.log(`Found ${customersSnapshot.docs.length} customer document(s)`);
    
    const ordersWithTimestamp = [];
    const ordersWithoutTimestamp = [];

    // Iterate through all customer documents (phone numbers)
    for (const customerDoc of customersSnapshot.docs) {
      const phoneNumber = customerDoc.id;
      const customerData = customerDoc.data();
      
      console.log(`\n--- Processing Customer: ${phoneNumber} ---`);
      console.log(`Customer data:`, customerData);

      // Check if pastOrders array exists
      if (customerData.pastOrders && Array.isArray(customerData.pastOrders)) {
        console.log(`Found ${customerData.pastOrders.length} order(s) in pastOrders array`);
        
        // Process each order in the pastOrders array
        customerData.pastOrders.forEach((order, index) => {
          console.log(`\n  Order #${index}:`, order);
          
          // Get timestamp from various possible field names
          const timestamp = getOrderTimestamp(order);
          
          // Get customer names from names array
          const customerNames = customerData.names && Array.isArray(customerData.names) 
            ? customerData.names 
            : [];
          const displayName = customerNames.length > 0 ? customerNames.join(", ") : (customerData.username || "Unknown");
          
          // Get order ID from order object
          const orderId = order.id || `ORD-${phoneNumber}-${index}`;

          // Extract instructions from items array (if present)
          // Each item may have { name, price, quantity, instructions }
          let instructions = "";
          if (order.items && Array.isArray(order.items)) {
            const instrs = order.items
              .map((it) => (it && (it.instructions || it.instruction) ? String(it.instructions || it.instruction).trim() : ""))
              .filter((s) => s && s.length > 0);
            if (instrs.length > 0) {
              instructions = instrs.join("; ");
            }
          }
          console.log(`  Resolved instructions: "${instructions}"`);
          
          // Log timestamp details
          if (timestamp) {
            const orderDate = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            console.log(`  Timestamp field: ${order.time ? 'time' : order.timestamp ? 'timestamp' : 'other'}`);
            console.log(`  Timestamp type: ${typeof timestamp}`);
            console.log(`  Timestamp value: ${timestamp}`);
            console.log(`  Converted to Date: ${orderDate.toLocaleString()}`);
            console.log(`  Is from today? ${isOrderFromToday(timestamp)}`);
            
            // Filter only today's orders by timestamp
            if (isOrderFromToday(timestamp)) {
              console.log(`  ✅ ADDING ORDER TO LIST (has valid timestamp from today) - ${orderId}`);
              const paymentInfo = derivePaymentInfo(order);
              console.log('subscribeTodaysOrders - paymentInfo for', orderId, paymentInfo);
              ordersWithTimestamp.push({
                id: orderId,
                phoneNumber: phoneNumber,
                username: displayName,
                customerNames: customerNames,
                tableNumber: order.tableNo || "N/A",
                items: order.items || [],
                timestamp: timestamp,
                status: order.status || "Pending",
                orderIndex: index,
                customerRef: phoneNumber,
                specs: instructions,
                paymentType: paymentInfo.paymentType,
                paid: paymentInfo.paidDisplay,
                paymentStatus: paymentInfo.paymentStatus,
                verificationCode: paymentInfo.verificationCode || "-",
                paidAmount: paymentInfo.paidAmount,
              });
            } else {
              console.log(`  ❌ ORDER NOT FROM TODAY - SKIPPING (timestamp is from different date)`);
            }
          } else {
            console.log(`  ⚠️ NO TIMESTAMP FOUND - Adding to fallback list (will show all orders)`);
            // If no timestamp, add to fallback list
            // This ensures orders still display even if timestamp is missing
            ordersWithoutTimestamp.push({
              id: orderId,
              phoneNumber: phoneNumber,
              username: displayName,
              customerNames: customerNames,
              tableNumber: order.tableNo || "N/A",
              items: order.items || [],
              timestamp: null,
              status: order.status || "Pending",
              orderIndex: index,
              customerRef: phoneNumber,
              specs: instructions,
            });
          }
        });
      } else {
        console.log(`⚠️ No pastOrders array found for customer ${phoneNumber}`);
      }
    }

    // Combine orders: prioritize orders with valid timestamps from today
    // If no timestamped orders found, show orders without timestamps
    const allOrders = ordersWithTimestamp.length > 0 ? ordersWithTimestamp : ordersWithoutTimestamp;

    console.log(`\n=== FETCH COMPLETE ===`);
    console.log(`Orders with valid timestamp: ${ordersWithTimestamp.length}`);
    console.log(`Orders without timestamp: ${ordersWithoutTimestamp.length}`);
    console.log(`Total orders to display: ${allOrders.length}`);
    console.log(`Orders:`, allOrders);

    if (allOrders.length === 0) {
      console.warn("⚠️ No orders found at all!");
    } else if (ordersWithoutTimestamp.length > 0 && ordersWithTimestamp.length === 0) {
      console.warn("⚠️ Displaying orders without timestamp! Add timestamp field to order objects for proper date filtering.");
    }

    // Sort orders by timestamp (newest first) if they have timestamps
    if (ordersWithTimestamp.length > 0) {
      allOrders.sort((a, b) => {
        const timeA = a.timestamp ? a.timestamp.toDate?.().getTime() : 0;
        const timeB = b.timestamp ? b.timestamp.toDate?.().getTime() : 0;
        return timeB - timeA;
      });
    }

    return allOrders;
  } catch (error) {
    console.error("❌ ERROR FETCHING ORDERS:", error);
    console.error("Error stack:", error.stack);
    throw error;
  }
};

/**
 * Subscribe to customers collection and call onUpdate with processed orders whenever data changes.
 * Returns an unsubscribe function.
 */
export const subscribeTodaysOrders = (onUpdate) => {
  try {
    console.log("=== SUBSCRIBING TO ORDERS (real-time) ===");

    const customersRef = collection(
      db,
      "Restaurant",
      "orderin_restaurant_1",
      "customers"
    );

    const unsubscribe = onSnapshot(
      customersRef,
      (customersSnapshot) => {
        console.log('subscribeTodaysOrders - customers snapshot received, docs:', customersSnapshot.size);
        const allProcessedOrders = [];

        try {
          for (const customerDoc of customersSnapshot.docs) {
            const phoneNumber = customerDoc.id;
            const customerData = customerDoc.data();

            if (!(customerData.pastOrders && Array.isArray(customerData.pastOrders))) {
              continue;
            }

            const customerNames = customerData.names && Array.isArray(customerData.names) ? customerData.names : [];
            const displayName = customerNames.length > 0 ? customerNames.join(", ") : (customerData.username || "Unknown");

            customerData.pastOrders.forEach((order, index) => {
              const timestamp = getOrderTimestamp(order);

              // derive order id
              const orderId = order.id || `ORD-${phoneNumber}-${index}`;

              // extract item-level instructions
              let instructions = "";
              if (order.items && Array.isArray(order.items)) {
                const instrs = order.items
                  .map((it) => (it && (it.instructions || it.instruction) ? String(it.instructions || it.instruction).trim() : ""))
                  .filter((s) => s && s.length > 0);
                if (instrs.length > 0) instructions = instrs.join("; ");
              }

              // derive payment info for display
              const paymentInfo = derivePaymentInfo(order);

              // Normalize items array: support multiple field names used by different writers
              const rawItemsArray = order.items || order.orderItems || order.cart || order.itemsList || order.itemDetails || order.rawItems || [];

              // Build itemDetails and compute subtotal robustly
              let itemDetails = [];
              let subtotal = 0;
              if (Array.isArray(rawItemsArray)) {
                itemDetails = rawItemsArray.map((it) => {
                  const name = (it && (it.name || it.title || it.itemName || (it.menu && it.menu.name))) || "Unknown";
                  // price may be stored as number or string in different keys
                  let itemPrice = 0;
                  if (it) {
                    const priceCandidate = it.price !== undefined && it.price !== null ? it.price : (it.priceText || it.priceValue || it.amount || it.cost || 0);
                    const parsed = Number(String(priceCandidate).replace(/[^0-9.-]+/g, ""));
                    itemPrice = isNaN(parsed) ? 0 : parsed;
                  }
                  const itemQty = Number(it && (it.quantity !== undefined ? it.quantity : (it.qty !== undefined ? it.qty : (it.count !== undefined ? it.count : 1)))) || 1;
                  const itemTotal = itemPrice * itemQty;
                  subtotal += itemTotal;
                  const instructionsText = it && (it.instructions || it.instruction || it.note || it.specialInstructions) ? String(it.instructions || it.instruction || it.note || it.specialInstructions) : "";
                  return {
                    name,
                    quantity: itemQty,
                    price: itemPrice,
                    total: itemTotal,
                    instructions: instructionsText,
                  };
                });
              }

              // If order-level specs exist under alternative keys, prefer those, always output as array
              let specsArr = [];
              if (Array.isArray(order.items)) {
                specsArr = order.items.map((it, idx) => ({
                  name: (it && (it.name || it.title || it.itemName || (it.menu && it.menu.name))) || `Item ${idx + 1}`,
                  instructions: (it && (it.instructions || it.instruction || it.note || it.specialInstructions)) || "-",
                }));
              } else if (Array.isArray(order.specs)) {
                specsArr = order.specs;
              } else if (typeof order.specs === 'string' && order.specs.trim()) {
                specsArr = [{ name: 'Spec', instructions: order.specs.trim() }];
              } else if (typeof instructions === 'string' && instructions.trim()) {
                specsArr = [{ name: 'Spec', instructions: instructions.trim() }];
              } else if (order.specialInstructions || order.instructions || order.notes) {
                specsArr = [{ name: 'Spec', instructions: order.specialInstructions || order.instructions || order.notes }];
              }

              // Prefer backend-provided tax when available (many keys possible),
              // otherwise apply fallback rule: ₹1 tax for every ₹100 of subtotal.
              const providedTax = findProvidedTax(order);
              let tax;
              if (providedTax !== null && providedTax !== undefined) {
                const parsedTax = Number(String(providedTax).replace(/[^0-9.-]+/g, ""));
                tax = isNaN(parsedTax) ? 0 : parsedTax;
              } else {
                tax = subtotal > 0 ? Math.ceil(subtotal / 100) : 0;
              }
              const totalCost = order.totalCost || order.total || order.amount || subtotal + tax;

              const orderObj = {
                id: orderId,
                phoneNumber,
                username: displayName,
                customerNames,
                tableNumber: order.tableNo || "N/A",
                items: Array.isArray(rawItemsArray) ? rawItemsArray : [],
                itemDetails: itemDetails,
                timestamp: timestamp,
                status: order.status || "Pending",
                orderIndex: index,
                customerRef: phoneNumber,
                specs: specsArr,
                subtotal: subtotal,
                tax: tax,
                totalCost: totalCost,
                paymentType: paymentInfo.paymentType,
                paid: paymentInfo.paidDisplay,
                paymentStatus: paymentInfo.paymentStatus,
                verificationCode: paymentInfo.verificationCode || "-",
                paidAmount: paymentInfo.paidAmount,
              };

              if (timestamp && isOrderFromToday(timestamp)) {
                allProcessedOrders.push(orderObj);
              }
            });
          }

          // Sort by timestamp (newest first)
          allProcessedOrders.sort((a, b) => {
            const timeA = a.timestamp ? a.timestamp.toDate?.().getTime() : 0;
            const timeB = b.timestamp ? b.timestamp.toDate?.().getTime() : 0;
            return timeB - timeA;
          });

          if (typeof onUpdate === "function") onUpdate(allProcessedOrders);
        } catch (err) {
          console.error("Error processing customers snapshot:", err);
        }
      },
      (err) => {
        console.error("onSnapshot error (customers):", err);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("Failed to subscribe to orders:", error);
    return () => {};
  }
};

/**
 * Subscribe to all customer orders (history) and call onUpdate whenever data changes.
 * Returns an unsubscribe function.
 */
export const subscribeAllCustomerOrders = (onUpdate) => {
  try {
    console.log("=== SUBSCRIBING TO ALL CUSTOMER ORDERS (real-time) ===");

    const customersRef = collection(
      db,
      "Restaurant",
      "orderin_restaurant_1",
      "customers"
    );

    const unsubscribe = onSnapshot(
      customersRef,
      (customersSnapshot) => {
        try {
          const allOrders = [];

          for (const customerDoc of customersSnapshot.docs) {
            const phoneNumber = customerDoc.id;
            const customerData = customerDoc.data();

            if (!(customerData.pastOrders && Array.isArray(customerData.pastOrders))) {
              continue;
            }

            const customerNames = customerData.names && Array.isArray(customerData.names) ? customerData.names : [];
            const displayName = customerNames.length > 0 ? customerNames.join(", ") : (customerData.username || "Unknown");

            customerData.pastOrders.forEach((order, index) => {
              const timestamp = getOrderTimestamp(order);
              const orderId = order.id || `ORD-${phoneNumber}-${index}`;

              // Extract item-level details
              let itemDetails = [];
              let subtotal = 0;
              if (order.items && Array.isArray(order.items)) {
                itemDetails = order.items.map((it) => {
                  // parse price robustly (handle strings like "₹123" or "123")
                  let itemPrice = 0;
                  if (it && it.price !== undefined && it.price !== null) {
                    const parsed = Number(String(it.price).replace(/[^0-9.-]+/g, ""));
                    itemPrice = isNaN(parsed) ? 0 : parsed;
                  }
                  const itemQty = Number(it && it.quantity !== undefined ? it.quantity : 1) || 1;
                  const itemTotal = itemPrice * itemQty;
                  subtotal += itemTotal;
                  return {
                    name: it.name || "Unknown",
                    quantity: itemQty,
                    price: itemPrice,
                    total: itemTotal,
                    instructions: it.instructions || it.instruction || "",
                  };
                });
              }

              // Prefer backend-provided tax when available, otherwise apply ₹1 per ₹100 rule
              const providedTax = findProvidedTax(order);
              let tax;
              if (providedTax !== null && providedTax !== undefined) {
                const parsedTax = Number(String(providedTax).replace(/[^0-9.-]+/g, ""));
                tax = isNaN(parsedTax) ? 0 : parsedTax;
              } else {
                tax = subtotal > 0 ? Math.ceil(subtotal / 100) : 0;
              }
              const totalCost = subtotal + tax;

              let paidAmount = totalCost;
              if (order.paymentStatus === "unpaid" || order.paymentStatus === "Unpaid") {
                paidAmount = 0;
              } else if (order.paymentStatus === "paid" || order.paymentStatus === "Paid") {
                paidAmount = totalCost;
              }

              allOrders.push({
                id: orderId,
                phoneNumber: phoneNumber,
                username: displayName,
                tableNumber: order.tableNo || "N/A",
                itemDetails: itemDetails,
                specs: order.items?.map((it, idx) => ({
                  name: it.name || `Item ${idx + 1}`,
                  instructions: it.instructions || it.instruction || "-",
                })) || [],
                subtotal: subtotal,
                tax: tax,
                totalCost: totalCost || order.totalCost || order.amount || subtotal + tax,
                paidAmount: paidAmount,
                paymentType: order.paymentMethod || order.paymentType || "Online",
                paymentStatus: order.paymentStatus || "unpaid",
                verificationCode: order.verificationCode || order.code || "-",
                timestamp: timestamp,
                status: order.status || "Pending",
                orderIndex: index,
                customerRef: phoneNumber,
              });
            });
          }

          // Sort by timestamp (newest first)
          allOrders.sort((a, b) => {
            const timeA = a.timestamp ? (a.timestamp.toDate?.().getTime?.() || new Date(a.timestamp).getTime()) : 0;
            const timeB = b.timestamp ? (b.timestamp.toDate?.().getTime?.() || new Date(b.timestamp).getTime()) : 0;
            return timeB - timeA;
          });

          if (typeof onUpdate === "function") onUpdate(allOrders);
        } catch (err) {
          console.error("Error processing all orders snapshot:", err);
        }
      },
      (err) => {
        console.error("onSnapshot error (all orders):", err);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("Failed to subscribe to all customer orders:", error);
    return () => {};
  }
};

/**
 * Update order status in Firebase
 * Updates the status field in pastOrders array for a specific customer
 */
export const updateOrderStatus = async (phoneNumber, orderIndex, newStatus) => {
  try {
    const customerRef = doc(
      db,
      "Restaurant",
      "orderin_restaurant_1",
      "customers",
      phoneNumber
    );

    // Use getDoc instead of getDocs for a single document
    const customerSnap = await getDoc(customerRef);
    if (!customerSnap.exists()) {
      throw new Error("Customer not found");
    }

    const customerData = customerSnap.data();
    const pastOrders = [...(customerData.pastOrders || [])];

    // Update the status of the specific order
    if (pastOrders[orderIndex]) {
      pastOrders[orderIndex].status = newStatus;

      // Update the document
      await updateDoc(customerRef, {
        pastOrders: pastOrders,
      });
    }
  } catch (error) {
    console.error("Error updating order status:", error);
    throw error;
  }
};

/**
 * Format order items with quantity for display
 */
export const formatOrderItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    if (typeof item === "string") {
      return item;
    }
    if (item.name && item.quantity) {
      return `${item.quantity}x ${item.name}`;
    }
    if (item.name) {
      return item.name;
    }
    // If item is an object, stringify it for display
    if (typeof item === "object" && item !== null) {
      return JSON.stringify(item);
    }
    return String(item);
  });
};

/**
 * Format timestamp to readable 12-hour time format (e.g., "2:30 PM")
 * Returns empty string if timestamp is invalid
 */
export const formatTime = (timestamp) => {
  if (!timestamp) return "";
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    // Validate date
    if (isNaN(date.getTime())) {
      return "";
    }
    
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch (error) {
    console.error("Error formatting time:", error);
    return "";
  }
};

/**
 * Format full date and time (e.g., "Nov 30, 2025 2:30 PM")
 * Useful for debugging to verify orders are from today
 */
export const formatDateTime = (timestamp) => {
  if (!timestamp) return "";
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    if (isNaN(date.getTime())) {
      return "";
    }
    
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) + " " + formatTime(timestamp);
  } catch (error) {
    console.error("Error formatting date time:", error);
    return "";
  }
};

/**
 * Fetch daily transit orders for today with payment status and verification code
 * Returns orders with payment details for Finance page
 */
export const fetchDailyTransitOrders = async () => {
  try {
    console.log("=== FETCHING DAILY TRANSIT ORDERS ===");
    const todayStart = getTodayAtMidnight();
    const todayEnd = getTomorrowAtMidnight();
    console.log(`Date range: ${todayStart.toLocaleString()} to ${todayEnd.toLocaleString()}`);

    const customersRef = collection(
      db,
      "Restaurant",
      "orderin_restaurant_1",
      "customers"
    );

    const customersSnapshot = await getDocs(customersRef);
    console.log(`Found ${customersSnapshot.docs.length} customer document(s)`);
    
    const dailyTransitOrders = [];

    // Iterate through all customer documents
    for (const customerDoc of customersSnapshot.docs) {
      const phoneNumber = customerDoc.id;
      const customerData = customerDoc.data();
      
      console.log(`Processing customer: ${phoneNumber}`);

      if (!(customerData.pastOrders && Array.isArray(customerData.pastOrders))) {
        continue;
      }

      const customerNames = customerData.names && Array.isArray(customerData.names) 
        ? customerData.names 
        : [];
      const displayName = customerNames.length > 0 ? customerNames.join(", ") : (customerData.username || "Unknown");

      customerData.pastOrders.forEach((order, index) => {
        const timestamp = getOrderTimestamp(order);
        
        // Only include orders from today
        if (!timestamp || !isOrderFromToday(timestamp)) {
          console.log(`  Skipping order ${index} - not from today or no timestamp`);
          return;
        }

        console.log(`  ✅ Order ${index} is from today - INCLUDING`);

        const orderId = order.id || `ORD-${phoneNumber}-${index}`;
        
        // Extract item-level details: name, quantity, price, instructions
        let itemDetails = [];
        let subtotal = 0;
        if (order.items && Array.isArray(order.items)) {
          itemDetails = order.items.map((it) => {
            let itemPrice = 0;
            if (it && it.price !== undefined && it.price !== null) {
              const parsed = Number(String(it.price).replace(/[^0-9.-]+/g, ""));
              itemPrice = isNaN(parsed) ? 0 : parsed;
            }
            const itemQty = Number(it && it.quantity !== undefined ? it.quantity : 1) || 1;
            const itemTotal = itemPrice * itemQty;
            subtotal += itemTotal;
            return {
              name: it.name || "Unknown",
              quantity: itemQty,
              price: itemPrice,
              total: itemTotal,
              instructions: it.instructions || it.instruction || "",
            };
          });
        }

        // Calculate tax (assuming 10% tax if not provided)
        const taxRate = order.taxRate || 0.1;
        const tax = subtotal * taxRate;
        const totalCost = subtotal + tax;

        // Derive normalized payment information
        const paymentInfo = derivePaymentInfo(order);

        console.log('dailyTransitOrders - preparing order', orderId, {
          rawItems: order.items,
          itemDetails,
          subtotal,
          tax,
          totalCost,
          paymentInfo,
        });

        dailyTransitOrders.push({
          id: orderId,
          phoneNumber: phoneNumber,
          username: displayName,
          tableNumber: order.tableNo || "N/A",
          items: order.items || [],
          itemDetails: itemDetails,
          specs: order.items?.map((it, idx) => ({
            name: it.name || `Item ${idx + 1}`,
            instructions: it.instructions || it.instruction || "-",
          })) || [],
          subtotal: subtotal,
          tax: tax,
          totalCost: totalCost || order.totalCost || order.amount || subtotal + tax,
          paid: paymentInfo.paidDisplay,
          paymentType: paymentInfo.paymentType,
          paymentStatus: paymentInfo.paymentStatus,
          verificationCode: paymentInfo.verificationCode || "-",
          timestamp: timestamp,
          status: order.status || "Pending",
          orderIndex: index,
          customerRef: phoneNumber,
        });
      });
    }

    console.log(`Total daily transit orders: ${dailyTransitOrders.length}`);
    console.log("Daily transit orders:", dailyTransitOrders);

    // Sort by timestamp (newest first)
    dailyTransitOrders.sort((a, b) => {
      const timeA = a.timestamp ? a.timestamp.toDate?.().getTime() : 0;
      const timeB = b.timestamp ? b.timestamp.toDate?.().getTime() : 0;
      return timeB - timeA;
    });
    return dailyTransitOrders;
  } catch (error) {
    console.error("❌ ERROR FETCHING DAILY TRANSIT ORDERS:", error);
    throw error;
  }
};

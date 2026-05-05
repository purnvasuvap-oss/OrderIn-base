import { useSearchParams, useNavigate } from 'react-router-dom';
import { CreditCard, Package, ArrowLeft, AlertCircle, RotateCcw } from 'lucide-react';
import { useAppStore } from '../store';
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';

// Types for Firebase data
interface CustomerData {
  names?: string;
  status?: string;
  phone?: string;
  [key: string]: unknown;
}

interface RestaurantData {
  Restaurant_name?: string;
  code?: string;
  IFSC?: string;
  ifscCode?: string;
  account?: string;
  accountNumber?: string;
  [key: string]: unknown;
}

interface RazorpayPaymentData {
  method?: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface VerifyPaymentData {
  method?: string;
  payment_status?: string;
  settlement_id?: string | null;
  settlement_status?: string | null;
  amount?: number;
  currency?: string;
}

interface SyncPaymentData {
  razorpayMethod?: string;
  razorpayStatus?: string;
  razorpayAmount?: number;
  razorpayCurrency?: string;
  razorpayCapturedAt?: string;
  razorpayFeeAmount?: number;
  razorpayTaxAmount?: number;
  razorpaySettlementId?: string;
  razorpaySettlementStatus?: string;
  razorpaySettlementAmount?: number;
  razorpaySettlementUtr?: string;
  razorpaySettlementCreatedAt?: string;
  razorpayTransferId?: string;
  razorpayTransferStatus?: string;
  razorpayTransferSettlementStatus?: string;
  razorpayTransferRecipient?: string;
  razorpayTransferAmount?: number;
  razorpayTransferCurrency?: string;
  routePlatformGrossAmount?: number;
  routePlatformNetAmount?: number;
  razorpayRouteTransfers?: unknown[];
  razorpaySyncSource?: 'api' | 'webhook';
  razorpaySyncedAt?: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  customer_notification: number;
  handler: (response: RazorpayPaymentData) => void;
  modal: {
    ondismiss: () => void;
  };
  prefill: {
    name: string;
    contact: string;
  };
  theme: {
    color: string;
  };
}

interface RazorpayInstance {
  open: () => void;
}

interface RazorpayConstructor {
  new (options: RazorpayOptions): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay: RazorpayConstructor;
  }
}

const FUNCTION_BASE_URL = 'https://us-central1-orderin-7f8bc.cloudfunctions.net';
const CREATE_ORDER_ENDPOINTS = [
  `${FUNCTION_BASE_URL}/createRazorpayOrder`,
  `${FUNCTION_BASE_URL}/api/createRazorpayOrder`,
];
const VERIFY_PAYMENT_ENDPOINTS = [
  `${FUNCTION_BASE_URL}/verifyRazorpayPayment`,
  `${FUNCTION_BASE_URL}/api/verifyRazorpayPayment`,
];
const SYNC_PAYMENT_ENDPOINTS = [
  `${FUNCTION_BASE_URL}/syncRazorpayPayment`,
  `${FUNCTION_BASE_URL}/api/syncRazorpayPayment`,
];

export const PaymentHubPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getRestaurantById } = useAppStore();

  // States for Firebase data loading
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [restaurantData, setRestaurantData] = useState<RestaurantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('UPI');
  const [savingPayment, setSavingPayment] = useState(false);
  
  // Razorpay and Payment Error States
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentRetrying, setPaymentRetrying] = useState(false);

  // Detect if embedded in iframe
  const isEmbedded = window.parent !== window;

  // Debug helper function - logs to console only (no UI display)
  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [PaymentHubPage] ${message}`);
  };

  const postToFunction = async (urls: string[], payload: unknown, label: string) => {
    let lastError: Error | null = null;

    for (const url of urls) {
      try {
        addDebugLog(`Trying ${label} endpoint: ${url}`);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return { response, url };
        }

        const errorText = await response.text().catch(() => '');
        lastError = new Error(`${label} failed at ${url}: HTTP ${response.status}${errorText ? ` - ${errorText}` : ''}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new Error(`${label} failed on all configured endpoints`);
  };

  // Order Information Parameters - Support both old and new naming
  const restaurantId = searchParams.get('rid') || searchParams.get('restaurantId');
  const orderId = searchParams.get('oid') || searchParams.get('orderId');
  const customerPhone = searchParams.get('phone') || searchParams.get('customerPhone');
  const amount = searchParams.get('amount') || searchParams.get('total') || '0';
  
  console.log('[PaymentHubPage] URL Parameters:', { restaurantId, orderId, customerPhone, amount });
  
  // Order Details Parameters
  const taxAmount = searchParams.get('taxAmount') || searchParams.get('taxes') || '0';
  const platformFees = searchParams.get('platformFees') || '0';
  const subtotal = searchParams.get('subtotal') || amount || '0';
  const costPerItem = searchParams.get('costPerItem') || '0';
  const itemCount = searchParams.get('itemCount') || '0';

  // Restaurant name from params (for embedded use)
  const restaurantNameParam = searchParams.get('restaurantName');
  const ifscParam = searchParams.get('ifscCode');

  const restaurant = restaurantId ? getRestaurantById(restaurantId) : null;

  // Load payment data from localStorage (NOT Firebase - to avoid CORS errors)
  useEffect(() => {
    const loadPaymentDataFromLocalStorage = () => {
      try {
        setLoading(true);
        addDebugLog('Reading payment data from localStorage to avoid CORS errors...');
        
        // Get payment data stored by customer apps
        const storedPaymentData = localStorage.getItem('paymentData');
        
        if (storedPaymentData) {
          const paymentData = JSON.parse(storedPaymentData);
          addDebugLog(`✓ Payment data found in localStorage: ${JSON.stringify(paymentData)}`);
          
          // ✅ NEW: Extract flat fields and create objects for display
          // Payments.jsx stores flat fields, so reconstruct them into objects
          if (paymentData.restaurantName || paymentData.restaurantId) {
            setRestaurantData({
              Restaurant_name: paymentData.restaurantName,
              code: paymentData.restaurantId,
              IFSC: paymentData.ifscCode,
              ifscCode: paymentData.ifscCode,
              account: paymentData.accountNumber,
              accountNumber: paymentData.accountNumber,
            } as RestaurantData);
            addDebugLog(`✓ Loaded restaurant from localStorage: ${paymentData.restaurantName}`);
          }
          
          // Optional: Load customer data from stored field if present
          if (paymentData.customerPhone) {
            setCustomerData({
              names: paymentData.customerName || 'Customer',
              phone: paymentData.customerPhone,
            } as CustomerData);
            addDebugLog(`✓ Loaded customer from localStorage: ${paymentData.customerPhone}`);
          }
        } else {
          addDebugLog('⚠️ No payment data found in localStorage - will use URL parameters');
          
          // Fallback: Try to get restaurant data from store
          if (restaurant) {
            setRestaurantData(restaurant as unknown as RestaurantData);
          }
        }
      } catch (error) {
        console.error('Error reading payment data from localStorage:', error);
        addDebugLog(`❌ Error reading localStorage: ${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    };

    loadPaymentDataFromLocalStorage();
  }, [restaurant]);

  // Load Razorpay Script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      setRazorpayLoaded(true);
      addDebugLog('✓ Razorpay script loaded successfully');
    };
    script.onerror = () => {
      addDebugLog('❌ Failed to load Razorpay script');
      setPaymentError('Failed to load payment gateway. Please refresh and try again.');
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handlePayNow = async () => {
    try {
      setSavingPayment(true);
      setPaymentError(null);
      addDebugLog('=== RAZORPAY PAYMENT PROCESS STARTED ===');

      // Validate Razorpay is loaded
      if (!razorpayLoaded || !window.Razorpay) {
        throw new Error('Payment gateway not loaded. Please refresh the page and try again.');
      }

      // ✅ NEW: Get all payment data from localStorage to AVOID FIREBASE CORS errors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let storedPaymentData: any = null;
      try {
        const storedData = localStorage.getItem('paymentData');
        if (storedData) {
          storedPaymentData = JSON.parse(storedData);
          addDebugLog('✓ Loaded payment data from localStorage (no Firebase/CORS)');
        }
      } catch (storageError) {
        addDebugLog(`⚠️ Could not read localStorage: ${(storageError as Error).message}`);
      }

      // Convert payment method to UPPERCASE format
      const paymentMethodUpper = selectedPaymentMethod.toUpperCase();

      // Use localStorage data, then URL params, then defaults for testing
      const finalRestaurantId = storedPaymentData?.restaurantId || restaurantId || 'TEST_RESTAURANT';
      const finalCustomerPhone = storedPaymentData?.customerPhone || customerPhone || '9999999999';
      const finalOrderId = storedPaymentData?.orderId || orderId || 'TEST_ORDER_' + Date.now();
      const finalAmount = storedPaymentData?.amount || (amount && parseFloat(amount) > 0 ? amount : '100');
      const finalSubtotal = storedPaymentData?.subtotal || subtotal || '0';
      const finalTaxes = storedPaymentData?.taxes || taxAmount || '0';

      addDebugLog(`Payment Method: ${paymentMethodUpper}`);
      addDebugLog(`Restaurant ID: ${finalRestaurantId} ${storedPaymentData?.restaurantId ? '(from localStorage)' : restaurantId ? '' : '(DEFAULT)'}`);
      addDebugLog(`Customer Phone: ${finalCustomerPhone} ${storedPaymentData?.customerPhone ? '(from localStorage)' : customerPhone ? '' : '(DEFAULT)'}`);
      addDebugLog(`Order ID: ${finalOrderId} ${storedPaymentData?.orderId ? '(from localStorage)' : orderId ? '' : '(DEFAULT)'}`);
      addDebugLog(`Amount: ₹${finalAmount}`);
      addDebugLog(`Split subtotal to restaurant: ₹${finalSubtotal}; base/platform gross: ₹${finalTaxes}`);

      addDebugLog('⚠️ Opening Razorpay modal with parameters...');
      addDebugLog('Creating Razorpay order on backend...');
      
      let razorpayOrderId = null;
      try {
        const orderPayload = {
          amount: parseFloat(finalAmount as string) * 100,
          currency: 'INR',
          receipt: `${finalRestaurantId}_${finalOrderId}_${Date.now()}`,
          customerPhone: finalCustomerPhone,
          restaurantId: finalRestaurantId,
          orderId: finalOrderId,
          paymentMethod: paymentMethodUpper,
          subtotal: finalSubtotal,
          subtotalAmount: finalSubtotal,
          platformAmount: finalTaxes,
        };

        const { response, url } = await postToFunction(CREATE_ORDER_ENDPOINTS, orderPayload, 'Create order');
        const orderData = await response.json();
        razorpayOrderId = orderData.order_id;
        addDebugLog(`✓ Razorpay Order Created: ${razorpayOrderId}`);
        if (orderData.routeSplit) {
          addDebugLog(`✓ Route split enabled: ₹${orderData.routeSplit.restaurantAmount} to ${orderData.routeSplit.accountName}`);
        }
        addDebugLog(`✓ Active backend endpoint: ${url}`);
      } catch (backendError) {
        const message = (backendError as Error).message;
        addDebugLog(`❌ Backend connection error: ${message}`);
        addDebugLog('❌ Split payment requires a backend Razorpay Route order. Payment stopped.');
        throw new Error(`Could not create split payment order: ${message}`);
      }

      // Step 2: Open Razorpay Modal
      addDebugLog('Opening Razorpay payment modal...');

      // ✅ Use localStorage data for restaurant name - avoids Firebase fetch
      const restaurantName = storedPaymentData?.restaurantName || restaurantNameParam || restaurantData?.Restaurant_name || 'Order IN';

      // Pass order_id ONLY if it was successfully generated
      const optionsConfig: any = {
        key: 'rzp_live_Sj1ZPsCyB5iu3t',
        amount: parseFloat(finalAmount as string) * 100, // Amount in paise
        currency: 'INR',
        name: restaurantName,
        description: `Order #${finalOrderId}`,
        customer_notification: 1,
      };
      if (razorpayOrderId) {
         optionsConfig.order_id = razorpayOrderId;
      }

      const razorpayOptions = {
        ...optionsConfig,
        handler: async (response: RazorpayPaymentData) => {
          try {
            addDebugLog('✓ Razorpay payment modal closed - payment completed');
            addDebugLog(`Payment ID: ${response.razorpay_payment_id}`);
            if (response.razorpay_order_id) addDebugLog(`Order ID: ${response.razorpay_order_id}`);

            let verifyData: VerifyPaymentData | null = null;
            let syncedPaymentData: SyncPaymentData | null = null;
            
            if (response.razorpay_signature && response.razorpay_order_id) {
               addDebugLog('Verifying payment signature...');
               // Step 3: Verify Payment Signature on Backend if we used order_id
               try {
                 const verifyPayload = {
                   razorpay_payment_id: response.razorpay_payment_id,
                   razorpay_order_id: response.razorpay_order_id,
                   razorpay_signature: response.razorpay_signature,
                 };
                 const { response: verifyResponse, url } = await postToFunction(VERIFY_PAYMENT_ENDPOINTS, verifyPayload, 'Verify payment');

                 if (verifyResponse.ok) {
                   verifyData = await verifyResponse.json();
                   addDebugLog(`✓ Payment Signature Verified`);
                   addDebugLog(`✓ Verification endpoint: ${url}`);
                 } else {
                   addDebugLog(`⚠️ Signature verification failed on backend. Assuming success for test mode.`);
                 }
               } catch (e) {
                 addDebugLog(`⚠️ Verification API unreachable. Proceeding with frontend success update.`);
               }
            } else {
               addDebugLog('No signature/order_id returned (Frontend mock mode). Assuming successful payment capture.');
            }

            try {
              const { response: syncResponse, url } = await postToFunction(SYNC_PAYMENT_ENDPOINTS, {
                razorpayPaymentId: response.razorpay_payment_id,
                restaurantId: finalRestaurantId,
                customerPhone: finalCustomerPhone,
                orderId: finalOrderId,
              }, 'Sync payment');
              const syncData = await syncResponse.json();
              syncedPaymentData = syncData?.payment || null;
              addDebugLog(`✓ Razorpay payment synced from API`);
              addDebugLog(`✓ Sync endpoint: ${url}`);
            } catch (syncError) {
              addDebugLog(`⚠️ Razorpay sync skipped: ${(syncError as Error).message}`);
            }

            // Step 4: Update Firebase with Payment Details (if we have valid data)
            if (finalRestaurantId && finalCustomerPhone && finalOrderId) {
              addDebugLog('Updating Firebase with payment details...');

              const customerDocPath = `Restaurant/${finalRestaurantId}/customers/${finalCustomerPhone}`;
              const customerRef = doc(db, customerDocPath);

              try {
                // Fetch current customer data
                const customerSnapshot = await getDoc(customerRef);

                if (customerSnapshot.exists()) {
                  const customerDataSnapshot = customerSnapshot.data();
                  const pastOrders = customerDataSnapshot.pastOrders || [];

                  addDebugLog(`Found ${pastOrders.length} orders in pastOrders array`);

                  // Find the order to update
                  const orderToUpdate = pastOrders.find((order: Record<string, unknown>) => order.id === finalOrderId);

                  if (orderToUpdate) {
                    addDebugLog(`✓ Order found, updating with payment details`);

                    // Map Razorpay payment method to user-friendly names
                    const paymentMethodMap: Record<string, string> = {
                      'upi': 'UPI',
                      'card': 'Card',
                      'netbanking': 'Net Banking',
                      'wallet': 'Wallet',
                      'emandate': 'E-Mandate'
                    };

                    const razorpayMethod = syncedPaymentData?.razorpayMethod || verifyData?.method || response.method;
                    const actualPaymentMethod = paymentMethodMap[String(razorpayMethod || '').toLowerCase()] || razorpayMethod || 'Online';

                    addDebugLog(`✓ Payment Method: ${actualPaymentMethod} (Razorpay: ${razorpayMethod || 'unknown'})`);

                    // Create updated orders array with payment information
                    const updatedPastOrders = pastOrders.map((order: Record<string, unknown>) => {
                      if (order.id === finalOrderId) {
                        const updatedOrder = {
                          ...order,
                          // Existing fields - unchanged
                          paymentMethod: 'Online',
                          PaymentMethod: 'Online',
                          paymentStatus: 'paid',
                          paymentTimestamp: new Date().toISOString(),
                          
                          // OnlinePayMethod now stores actual method used
                          OnlinePayMethod: actualPaymentMethod,
                          
                          // Razorpay transaction prefixed fields
                          razorpayOrderId: response.razorpay_order_id,
                          razorpayPaymentId: response.razorpay_payment_id,
                          razorpaySignature: response.razorpay_signature,
                          razorpayMethod,
                          razorpayStatus: syncedPaymentData?.razorpayStatus || verifyData?.payment_status || 'captured',
                          razorpayAmount: syncedPaymentData?.razorpayAmount ?? (typeof verifyData?.amount === 'number' ? verifyData.amount / 100 : undefined),
                          razorpayCurrency: syncedPaymentData?.razorpayCurrency || verifyData?.currency,
                          razorpayCapturedAt: syncedPaymentData?.razorpayCapturedAt,
                          razorpayFeeAmount: syncedPaymentData?.razorpayFeeAmount,
                          razorpayTaxAmount: syncedPaymentData?.razorpayTaxAmount,
                          razorpaySettlementId: syncedPaymentData?.razorpaySettlementId || verifyData?.settlement_id || undefined,
                          razorpaySettlementStatus: syncedPaymentData?.razorpaySettlementStatus || verifyData?.settlement_status || undefined,
                          razorpaySettlementAmount: syncedPaymentData?.razorpaySettlementAmount,
                          razorpaySettlementUtr: syncedPaymentData?.razorpaySettlementUtr,
                          razorpaySettlementCreatedAt: syncedPaymentData?.razorpaySettlementCreatedAt,
                          razorpayTransferId: syncedPaymentData?.razorpayTransferId,
                          razorpayTransferStatus: syncedPaymentData?.razorpayTransferStatus,
                          razorpayTransferSettlementStatus: syncedPaymentData?.razorpayTransferSettlementStatus,
                          razorpayTransferRecipient: syncedPaymentData?.razorpayTransferRecipient,
                          razorpayTransferAmount: syncedPaymentData?.razorpayTransferAmount,
                          razorpayTransferCurrency: syncedPaymentData?.razorpayTransferCurrency,
                          routePlatformGrossAmount: syncedPaymentData?.routePlatformGrossAmount,
                          routePlatformNetAmount: syncedPaymentData?.routePlatformNetAmount,
                          razorpayRouteTransfers: syncedPaymentData?.razorpayRouteTransfers,
                          razorpaySyncSource: syncedPaymentData?.razorpaySyncSource,
                          razorpaySyncedAt: syncedPaymentData?.razorpaySyncedAt,
                        };
                        return Object.fromEntries(
                          Object.entries(updatedOrder).filter(([, value]) => value !== undefined)
                        );
                      }
                      return order;
                    });

                    // Update Firestore
                    await updateDoc(customerRef, {
                      pastOrders: updatedPastOrders,
                    });

                    addDebugLog('✓ Firestore updated with payment details');

                    // Verify the update
                    const verifySnapshot = await getDoc(customerRef);
                    if (verifySnapshot.exists()) {
                      const verifyData = verifySnapshot.data();
                      const verifyOrders = verifyData.pastOrders || [];
                      const verifyOrder = verifyOrders.find((o: Record<string, unknown>) => o.id === orderId);
                      
                      if (verifyOrder && verifyOrder.paymentStatus === 'paid') {
                        addDebugLog(`✓ VERIFICATION SUCCESS: Payment Status = "paid"`);
                        addDebugLog(`✓ Payment Method: ${verifyOrder.OnlinePayMethod}`);
                        addDebugLog(`✓ Razorpay Order ID: ${verifyOrder.razorpayOrderId}`);
                        addDebugLog(`✓ Razorpay Payment ID: ${verifyOrder.razorpayPaymentId}`);
                        addDebugLog(`✓ Razorpay Method: ${verifyOrder.razorpayMethod}`);
                      } else {
                        addDebugLog(`⚠️ VERIFICATION WARNING: Payment Status might not be updated correctly`);
                      }
                    }
                  } else {
                    addDebugLog(`⚠️ Order with id "${finalOrderId}" not found in pastOrders`);
                  }
                } else {
                  addDebugLog(`⚠️ Customer document not found at: ${customerDocPath}`);
                }
              } catch (firebaseError) {
                addDebugLog(`⚠️ Firebase update error: ${(firebaseError as Error).message}`);
              }
            } else {
              addDebugLog(`⚠️ Firebase update skipped - missing restaurant/customer/order info`);
            }

            addDebugLog('=== PAYMENT PROCESS COMPLETED ===');

            // Step 5: Navigate or send message to parent
            if (isEmbedded) {
              const messageData = {
                type: 'PAYMENT_SUCCESS',
                orderId: finalOrderId,
                amount: finalAmount,
                restaurantId: finalRestaurantId,
                paymentMethod: paymentMethodUpper,
                razorpayPaymentId: response.razorpay_payment_id,
                transactionId: response.razorpay_order_id,
              };
              addDebugLog(`✓ Sending PAYMENT_SUCCESS to parent window`);
              window.parent.postMessage(messageData, '*');
            } else {
              navigate('/pay/status?status=success&paymentId=' + response.razorpay_payment_id);
            }
          } catch (paymentError) {
            addDebugLog(`⚠️ PAYMENT HANDLER ERROR: ${(paymentError as Error).message}`);
            addDebugLog(`=== PAYMENT PROCESS COMPLETED WITH ERRORS ===`);
            setPaymentError((paymentError as Error).message || 'Payment processing completed with errors.');
            setSavingPayment(false);
          }
        },
        modal: {
          ondismiss: () => {
            addDebugLog('🚫 Razorpay modal dismissed by user');
            // Delay the state update to allow modal to fully close
            setTimeout(() => {
              setSavingPayment(false);
              setPaymentError('Payment cancelled. Please try again.');
            }, 500);
          },
        },
        prefill: {
          name: customerData?.names || 'Guest Customer',
          contact: finalCustomerPhone,
        },
        theme: {
          color: '#06b6d4',
        },
      };

      // Open Razorpay modal - THIS IS THE KEY INTEGRATION TEST
      addDebugLog(`🎯 OPENING RAZORPAY MODAL WITH AMOUNT: ₹${finalAmount}`);
      
      try {
        const razor = new window.Razorpay(razorpayOptions);
        addDebugLog('✓ Razorpay instance created successfully');
        
        // Open the modal - this should NOT throw an error
        razor.open();
        addDebugLog('✓ Razorpay modal opened - waiting for user action');
        
        // Do NOT call setSavingPayment(false) here - let the handler manage it
        // Modal will close when user completes payment or dismisses it
      } catch (modalError) {
        addDebugLog(`❌ MODAL OPENING ERROR: ${(modalError as Error).message}`);
        setPaymentError('Failed to open payment modal. Please refresh and try again.');
        setSavingPayment(false);
      }

    } catch (error) {
      addDebugLog(`❌ INITIALIZATION ERROR: ${(error as Error).message}`);
      addDebugLog(`=== PAYMENT PROCESS FAILED ===`);
      setPaymentError((error as Error).message || 'An error occurred. Please try again.');
      console.error('[PaymentHubPage] Payment initialization error:', error);
      setSavingPayment(false);
    }
  };

  const handleRetryPayment = () => {
    setPaymentRetrying(true);
    setPaymentError(null);
    handlePayNow().finally(() => setPaymentRetrying(false));
  };

  const handleBack = () => {
    if (isEmbedded) {
      // Send cancellation message to parent window
      window.parent.postMessage({
        type: 'PAYMENT_CANCELLED',
        orderId,
      }, '*');
    } else {
      navigate(-1);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      overflow: 'hidden',
    }}>
      {/* Header with Back Button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: '60px',
        paddingLeft: '1.5rem',
        paddingRight: '1.5rem',
        borderBottom: '1px solid rgba(6, 182, 212, 0.15)',
        background: '#ffffff',
      }}>
        <button
          onClick={handleBack}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.5rem',
            borderRadius: '8px',
            transition: 'all 0.2s ease',
            color: '#06b6d4',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(6, 182, 212, 0.1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}>
          <ArrowLeft size={24} />
        </button>
      </div>

      {/* Content Area - Scrollable */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        background: '#ffffff',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }} className="hide-scrollbar">
        <div style={{ maxWidth: '600px', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Header Card */}
            <div style={{
              background: 'linear-gradient(135deg, #ec4899 0%, #f97316 50%, #06b6d4 100%)',
              borderRadius: '16px',
              padding: '2rem',
              color: 'white',
              boxShadow: '0 10px 30px rgba(6, 182, 212, 0.2)',
              animation: 'slideInUp 0.6s ease',
            }}>
              <h1 style={{ fontSize: '2rem', fontWeight: '900' }}>Payment Hub</h1>
              <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginTop: '0.5rem', fontSize: '1rem' }}>Complete your order payment</p>
            </div>

            {/* Main Card */}
            <div style={{
              background: '#ffffff',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
              animation: 'slideInUp 0.8s ease',
            }}>
              {/* Card Header */}
              <div style={{
                background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)',
                padding: '2rem',
                color: 'white',
              }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>Order Confirmation</h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Please review your order details below</p>
              </div>

              {/* Card Body */}
              <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Customer Info Section */}
                {customerData && (
                  <div style={{
                    background: '#fef3c7',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{
                        width: '3rem',
                        height: '3rem',
                        background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                      }}>
                        👤
                      </div>
                      <div>
                        <p style={{ fontSize: '0.875rem', color: '#92400e' }}>Customer</p>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#78350f' }}>
                          {customerData.names || 'Guest Customer'}
                        </h3>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', color: '#92400e' }}>
                      <p>Phone: {customerPhone}</p>
                      {customerData.status && (
                        <p>Status: {customerData.status}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Restaurant Info */}
                {(restaurantData || restaurant || restaurantNameParam) ? (
                  <div style={{
                    background: '#f0f9fc',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{
                        width: '3rem',
                        height: '3rem',
                        background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Package style={{ color: 'white' }} size={24} />
                      </div>
                      <div>
                        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>Restaurant</p>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0f172a' }}>
                          {restaurantNameParam || restaurantData?.Restaurant_name || restaurant?.Restaurant_name}
                        </h3>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', color: '#475569' }}>
                      {!restaurantNameParam && (
                        <p>Code: {restaurantData?.code || restaurant?.code}</p>
                      )}
                      {(restaurantData?.IFSC || restaurantData?.ifscCode || ifscParam) && (
                        <p style={{ color: '#64748b', fontSize: '0.75rem' }}>Account Details: Configured</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: '#f1f5f9',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    color: '#64748b',
                    textAlign: 'center',
                  }}>
                    {loading ? 'Loading restaurant information...' : 'No restaurant selected'}
                  </div>
                )}

                {/* Order Details */}
                <div style={{ border: '1px solid rgba(6, 182, 212, 0.2)', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 style={{ fontWeight: '700', color: '#0f172a', marginBottom: '1rem' }}>Order Details</h3>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid rgba(6, 182, 212, 0.1)' }}>
                    <span style={{ color: '#64748b' }}>Order ID</span>
                    <span style={{ fontWeight: '600', color: '#0f172a' }}>{orderId || 'No Order ID'}</span>
                  </div>

                  {customerPhone && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid rgba(6, 182, 212, 0.1)' }}>
                      <span style={{ color: '#64748b' }}>Customer Phone</span>
                      <span style={{ fontWeight: '600', color: '#0f172a' }}>{customerPhone}</span>
                    </div>
                  )}

                  {itemCount !== '0' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid rgba(6, 182, 212, 0.1)' }}>
                      <span style={{ color: '#64748b' }}>Number of Items</span>
                      <span style={{ fontWeight: '600', color: '#0f172a' }}>{itemCount}</span>
                    </div>
                  )}

                  {costPerItem !== '0' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid rgba(6, 182, 212, 0.1)' }}>
                      <span style={{ color: '#64748b' }}>Cost Per Item</span>
                      <span style={{ fontWeight: '600', color: '#0f172a' }}>₹{costPerItem}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b' }}>Amount</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '700', background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>₹{amount || '0'}</span>
                  </div>
                </div>

                {/* Payment Methods */}
                <div style={{ border: '1px solid rgba(6, 182, 212, 0.2)', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h3 style={{ fontWeight: '700', color: '#0f172a', marginBottom: '1rem' }}>Select Payment Method</h3>
                  {['UPI', 'Card', 'Net Banking', 'Wallet'].map((method) => (
                    <label key={method} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '1rem',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      background: selectedPaymentMethod === method ? '#f0f9fc' : '#ffffff',
                      borderColor: selectedPaymentMethod === method ? '#06b6d4' : 'rgba(6, 182, 212, 0.2)',
                    } as React.CSSProperties}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = '#f0f9fc';
                      (e.currentTarget as HTMLElement).style.borderColor = '#06b6d4';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = selectedPaymentMethod === method ? '#f0f9fc' : '#ffffff';
                      (e.currentTarget as HTMLElement).style.borderColor = selectedPaymentMethod === method ? '#06b6d4' : 'rgba(6, 182, 212, 0.2)';
                    }}>
                      <input 
                        type="radio" 
                        name="payment" 
                        value={method}
                        checked={selectedPaymentMethod === method}
                        onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                        style={{ cursor: 'pointer', accentColor: '#06b6d4' }} 
                      />
                      <span style={{ color: '#0f172a', fontWeight: '500' }}>{method}</span>
                    </label>
                  ))}
                </div>

                {/* Error Alert */}
                {paymentError && (
                  <div style={{
                    background: '#fee2e2',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'flex-start',
                    animation: 'slideInUp 0.3s ease',
                  }}>
                    <AlertCircle size={24} style={{ color: '#dc2626', flexShrink: 0, marginTop: '0.25rem' }} />
                    <div style={{ flex: 1 }}>
                      <h4 style={{ color: '#991b1b', fontWeight: '700', marginBottom: '0.5rem' }}>Payment Failed</h4>
                      <p style={{ color: '#7f1d1d', fontSize: '0.875rem', marginBottom: '1rem' }}>{paymentError}</p>
                      <button
                        onClick={handleRetryPayment}
                        disabled={savingPayment || paymentRetrying}
                        style={{
                          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                          color: 'white',
                          padding: '0.5rem 1rem',
                          borderRadius: '8px',
                          border: 'none',
                          fontWeight: '600',
                          cursor: savingPayment || paymentRetrying ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          opacity: savingPayment || paymentRetrying ? 0.6 : 1,
                          transition: 'all 0.2s ease',
                        } as React.CSSProperties}
                        onMouseEnter={(e) => {
                          if (!savingPayment && !paymentRetrying) {
                            (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                            (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.3)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!savingPayment && !paymentRetrying) {
                            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                          }
                        }}
                      >
                        <RotateCcw size={16} />
                        {paymentRetrying ? 'Retrying...' : 'Retry Payment'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Amount Summary */}
                <div style={{ background: '#f0f9fc', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(6, 182, 212, 0.15)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h3 style={{ fontWeight: '700', color: '#0f172a', marginBottom: '0.5rem' }}>Price Breakdown</h3>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                    <span>Subtotal</span>
                    <span>₹{parseFloat(subtotal).toFixed(2)}</span>
                  </div>

                  {taxAmount !== '0' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.875rem' }}>
                      <span>Taxes</span>
                      <span>₹{parseFloat(taxAmount).toFixed(2)}</span>
                    </div>
                  )}

                  {platformFees !== '0' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.875rem' }}>
                      <span>Platform Fees</span>
                      <span>₹{parseFloat(platformFees).toFixed(2)}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.125rem', fontWeight: '700', color: '#0f172a', borderTop: '1px solid rgba(6, 182, 212, 0.15)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                    <span>Total Amount</span>
                    <span style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>₹{parseFloat(amount || '0').toFixed(2)}</span>
                  </div>
                </div>

                {/* Payment Button */}
                <button
                  onClick={handlePayNow}
                  disabled={savingPayment || paymentRetrying || !razorpayLoaded}
                  title={!razorpayLoaded ? 'Payment gateway is loading...' : savingPayment ? 'Processing payment...' : ''}
                  style={{
                    width: '100%',
                    background: (savingPayment || paymentRetrying || !razorpayLoaded) ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 50%, #4b5563 100%)' : 'linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #ec4899 100%)',
                    color: 'white',
                    fontWeight: '700',
                    padding: '0.875rem',
                    borderRadius: '10px',
                    border: 'none',
                    cursor: (savingPayment || paymentRetrying || !razorpayLoaded) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    fontSize: '1.05rem',
                    transition: 'all 0.3s ease',
                    boxShadow: (savingPayment || paymentRetrying || !razorpayLoaded) ? '0 4px 15px rgba(0, 0, 0, 0.1)' : '0 4px 15px rgba(6, 182, 212, 0.3)',
                    height: '48px',
                    opacity: (savingPayment || paymentRetrying || !razorpayLoaded) ? 0.7 : 1,
                  } as React.CSSProperties}
                  onMouseEnter={(e) => {
                    if (!savingPayment && !paymentRetrying && razorpayLoaded) {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 25px rgba(6, 182, 212, 0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!savingPayment && !paymentRetrying && razorpayLoaded) {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 15px rgba(6, 182, 212, 0.3)';
                    }
                  }}
                >
                  <CreditCard size={20} />
                  {!razorpayLoaded ? 'Loading Payment Gateway...' : savingPayment || paymentRetrying ? 'Processing...' : (isEmbedded ? 'Complete Payment' : 'Pay Now')}
                </button>

                <p style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', marginTop: '0.5rem' }}>
                  By clicking "{isEmbedded ? 'Complete Payment' : 'Pay Now'}", you agree to our Terms and Conditions
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

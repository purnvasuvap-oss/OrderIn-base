import { useSearchParams, useNavigate } from 'react-router-dom';
import { CreditCard, Package, ArrowLeft } from 'lucide-react';
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

  // Detect if embedded in iframe
  const isEmbedded = window.parent !== window;

  // Debug helper function - logs to console only (no UI display)
  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [PaymentHubPage] ${message}`);
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

  // Fetch restaurant and customer data from Firebase
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch restaurant data if not already in store
        if (restaurantId && !restaurant) {
          const restaurantDoc = doc(db, `Restaurant/${restaurantId}`);
          const restaurantSnapshot = await getDoc(restaurantDoc);
          if (restaurantSnapshot.exists()) {
            setRestaurantData(restaurantSnapshot.data() as RestaurantData);
          }
        } else if (restaurant) {
          setRestaurantData(restaurant as unknown as RestaurantData);
        }
        
        // Fetch customer data from nested path
        if (restaurantId && customerPhone) {
          const customerDoc = doc(db, `Restaurant/${restaurantId}/customers/${customerPhone}`);
          const customerSnapshot = await getDoc(customerDoc);
          if (customerSnapshot.exists()) {
            setCustomerData(customerSnapshot.data() as CustomerData);
          }
        }
      } catch (error) {
        console.error('Error fetching data from Firebase:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [restaurantId, customerPhone, restaurant]);

  const handlePayNow = async () => {
    try {
      setSavingPayment(true);
      addDebugLog('=== PAYMENT PROCESS STARTED ===');

      // Convert payment method to UPPERCASE format
      const paymentMethodUpper = selectedPaymentMethod.toUpperCase();

      addDebugLog(`Payment Method: ${paymentMethodUpper}`);
      addDebugLog(`Restaurant ID: ${restaurantId}`);
      addDebugLog(`Customer Phone: ${customerPhone}`);
      addDebugLog(`Order ID: ${orderId}`);
      addDebugLog(`Amount: ₹${amount}`);

      // Validate all required parameters first
      if (!restaurantId) {
        addDebugLog('❌ ERROR: restaurantId is missing');
        throw new Error('VALIDATION ERROR: restaurantId is missing');
      }
      if (!customerPhone) {
        addDebugLog('❌ ERROR: customerPhone is missing');
        throw new Error('VALIDATION ERROR: customerPhone is missing');
      }
      if (!orderId) {
        addDebugLog('❌ ERROR: orderId is missing');
        throw new Error('VALIDATION ERROR: orderId is missing');
      }

      addDebugLog('✓ All parameters validated');

      // Update payment method in existing order in Firebase
      addDebugLog('Connecting to Firestore...');

      try {
        // Reference to the customer document
        const customerDocPath = `Restaurant/${restaurantId}/customers/${customerPhone}`;
        const customerRef = doc(db, customerDocPath);
        
        addDebugLog(`Document path: ${customerDocPath}`);
        addDebugLog('Fetching customer document...');
        
        // Fetch current customer data to get pastOrders array
        const customerSnapshot = await getDoc(customerRef);
        
        addDebugLog(`Document exists: ${customerSnapshot.exists()}`);
        
        if (customerSnapshot.exists()) {
          const customerData = customerSnapshot.data();
          const pastOrders = customerData.pastOrders || [];
          
          addDebugLog(`✓ Customer data fetched`);
          addDebugLog(`Found ${pastOrders.length} orders in pastOrders array`);
          addDebugLog(`Searching for order ID: ${orderId}`);
          addDebugLog(`Order IDs in array: ${pastOrders.map((o: Record<string, unknown>) => o.id).join(', ') || 'NONE'}`);
          
          // Find the order that matches
          const orderToUpdate = pastOrders.find((order: Record<string, unknown>) => order.id === orderId);
          
          if (!orderToUpdate) {
            const availableIds = pastOrders.map((o: Record<string, unknown>) => o.id).join(', ');
            addDebugLog(`❌ Order NOT found with id: ${orderId}`);
            addDebugLog(`Available IDs: ${availableIds || 'NONE'}`);
            throw new Error(`Order with id "${orderId}" not found in pastOrders array`);
          }
          
          addDebugLog(`✓ Order found`);
          addDebugLog(`Current OnlinePayMethod: "${orderToUpdate.OnlinePayMethod || 'empty'}"`);
          addDebugLog(`Updating to: "${paymentMethodUpper}"`);
          
          // Create updated orders array
          const updatedPastOrders = pastOrders.map((order: Record<string, unknown>) => {
            if (order.id === orderId) {
              return {
                ...order,
                OnlinePayMethod: paymentMethodUpper,
                paymentStatus: 'paid',
                timestamp: new Date().toISOString(),
              };
            }
            return order;
          });
          
          addDebugLog('Writing updated order to Firestore...');
          
          // Update the customer document with the modified pastOrders array
          await updateDoc(customerRef, {
            pastOrders: updatedPastOrders,
          });
          
          addDebugLog('✓ Firestore write completed');
          addDebugLog('Verifying update...');
          
          // Verify the update
          const verifySnapshot = await getDoc(customerRef);
          if (verifySnapshot.exists()) {
            const verifyData = verifySnapshot.data();
            const verifyOrders = verifyData.pastOrders || [];
            const verifyOrder = verifyOrders.find((o: Record<string, unknown>) => o.id === orderId);
            if (verifyOrder && verifyOrder.OnlinePayMethod === paymentMethodUpper) {
              addDebugLog(`✓ VERIFICATION SUCCESS: OnlinePayMethod = "${verifyOrder.OnlinePayMethod}"`);
            } else {
              addDebugLog(`⚠️ VERIFICATION FAILED: OnlinePayMethod = "${verifyOrder?.OnlinePayMethod || 'undefined'}"`);
            }
          }
        } else {
          addDebugLog(`❌ Customer document NOT found at: ${customerDocPath}`);
          throw new Error(`Customer document not found at: ${customerDocPath}`);
        }
      } catch (updateError) {
        addDebugLog(`❌ FIRESTORE ERROR: ${(updateError as Error).message}`);
        
        // Show error to user
        const errorMessage = (updateError as Error).message || 'Unknown error occurred';
        alert(`Payment Error: ${errorMessage}\n\nCheck the debug panel below for details.`);
        
        throw updateError;
      }

      if (isEmbedded) {
        // Send success message to parent window with payment method
        const messageData = {
          type: 'PAYMENT_SUCCESS',
          orderId,
          amount,
          restaurantId,
          paymentMethod: paymentMethodUpper,
        };
        addDebugLog(`✓ Sending PAYMENT_SUCCESS to parent window`);
        addDebugLog(`=== PAYMENT PROCESS COMPLETED SUCCESSFULLY ===`);
        window.parent.postMessage(messageData, '*');
      } else {
        addDebugLog(`Navigating to success page...`);
        navigate('/pay/status?status=success');
      }
    } catch (error) {
      addDebugLog(`❌ FINAL ERROR: ${(error as Error).message}`);
      addDebugLog(`=== PAYMENT PROCESS FAILED ===`);
      console.error('[PaymentHubPage] Error processing payment:', error);
      alert('Error processing payment. Please check the debug console below.');
    } finally {
      setSavingPayment(false);
    }
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
                  disabled={savingPayment}
                  style={{
                    width: '100%',
                    background: savingPayment ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 50%, #4b5563 100%)' : 'linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #ec4899 100%)',
                    color: 'white',
                    fontWeight: '700',
                    padding: '0.875rem',
                    borderRadius: '10px',
                    border: 'none',
                    cursor: savingPayment ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    fontSize: '1.05rem',
                    transition: 'all 0.3s ease',
                    boxShadow: savingPayment ? '0 4px 15px rgba(0, 0, 0, 0.1)' : '0 4px 15px rgba(6, 182, 212, 0.3)',
                    height: '48px',
                    opacity: savingPayment ? 0.7 : 1,
                  } as React.CSSProperties}
                  onMouseEnter={(e) => {
                    if (!savingPayment) {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 25px rgba(6, 182, 212, 0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!savingPayment) {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 15px rgba(6, 182, 212, 0.3)';
                    }
                  }}
                >
                  <CreditCard size={20} />
                  {savingPayment ? 'Processing...' : (isEmbedded ? 'Complete Payment' : 'Pay Now')}
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

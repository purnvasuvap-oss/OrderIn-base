import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { safeDeleteUnpaidOrders } from '../utils/orderCleanupUtils';

/**
 * STRICT back-button control for OrderIn SPA with ORDER CLEANUP
 * 
 * RULES:
 * 1. Payment flow (Cart → Payments → Counter Code):
 *    - These pages allow NORMAL back navigation within the flow
 *    - CLEANUP: Delete unpaid orders when navigating back FROM these pages
 * 2. All other pages (Menu, Profile, Orders, Item Details, etc):
 *    - Back button → Menu page (directly, no stepping through)
 * 3. Menu page:
 *    - Back button → Login page
 * 4. Login page:
 *    - Back button → Do nothing (prevent going back)
 * 
 * CLEANUP LOGIC:
 * - When user navigates BACK from payment flow pages (payments, counter-code)
 * - Delete all unpaid orders from Firestore
 * - Then proceed with normal back navigation
 */
export const useGlobalBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const stateIdRef = useRef(0);
  const popstateListenerRef = useRef(null);

  useEffect(() => {
    // Define payment flow pages (these allow normal back behavior)
    const paymentFlowPages = ['/cart', '/bill', '/payments', '/counter-code', '/payment-success'];
    
    // Pages that need cleanup when navigating back FROM them
    const cleanupPages = ['/payments', '/counter-code'];
    
    // Get current page
    const currentPath = location.pathname;
    
    // Determine intended behavior based on current page
    const getBackBehavior = (path) => {
      if (path === '/') {
        // Login page: prevent back
        console.log('[useGlobalBackButton] Login page - prevent back');
        return { action: 'prevent', target: null, requiresCleanup: false };
      } else if (path === '/menu') {
        // Menu page: go to login
        console.log('[useGlobalBackButton] Menu page - go to login');
        return { action: 'redirect', target: '/', requiresCleanup: false };
      } else if (paymentFlowPages.some(page => path.startsWith(page))) {
        // Payment flow: allow normal back (do nothing)
        // But mark if cleanup is needed
        const needsCleanup = cleanupPages.some(page => path.startsWith(page));
        console.log('[useGlobalBackButton] Payment flow page:', path, '- requiresCleanup:', needsCleanup);
        return { action: 'allowNormal', target: null, requiresCleanup: needsCleanup };
      } else {
        // All other pages (profile, help, about, item details, etc): go to menu
        console.log('[useGlobalBackButton] Other page:', path, '- go to menu');
        return { action: 'redirect', target: '/menu', requiresCleanup: false };
      }
    };

    const backBehavior = getBackBehavior(currentPath);

    // Remove old listener
    if (popstateListenerRef.current) {
      window.removeEventListener('popstate', popstateListenerRef.current);
    }

    // Generate unique state ID for this page
    const currentStateId = ++stateIdRef.current;

    // Push state immediately (this prevents going back to previous app state)
    window.history.pushState(
      { 
        orderinState: currentStateId,
        path: currentPath,
        behavior: backBehavior.action,
        target: backBehavior.target,
        requiresCleanup: backBehavior.requiresCleanup
      }, 
      null
    );

    // Define popstate handler
    const handlePopState = (event) => {
      const state = event.state;

      // Check if this is our OrderIn state
      if (state?.orderinState) {
        // Step 1: Cleanup unpaid orders if needed (async but non-blocking)
        if (state.requiresCleanup) {
          console.log('Global back handler: Cleanup required from', state.path);
          
          // Fire cleanup in background, don't wait for it to complete
          // This ensures navigation happens immediately on mobile
          const cleanupAsync = async () => {
            try {
              const user = JSON.parse(localStorage.getItem("user"));
              if (user && user.phone) {
                console.log('Global back handler: Starting cleanup for', user.phone);
                
                // Wait for cleanup to complete
                await safeDeleteUnpaidOrders(user.phone);
                
                console.log('Global back handler: Cleanup completed');
                
                // Clear session storage
                sessionStorage.removeItem('pendingOrderId');
                sessionStorage.removeItem('pendingOrderForFirestore');
                localStorage.removeItem('orderin_countercode_orderId');
                localStorage.removeItem('orderin_countercode_paymentMethod');
              }
            } catch (err) {
              console.error('Global back handler: Cleanup error (non-blocking):', err);
            }
          };
          
          // Start cleanup immediately but don't block navigation
          cleanupAsync();
        }

        // Step 2: Handle navigation based on behavior (happens immediately)
        if (state.behavior === 'prevent') {
          // Login page: prevent going back, push state again
          window.history.pushState(state, null);
        } else if (state.behavior === 'redirect' && state.target) {
          // Navigate to target (Menu or Login) with replace
          navigate(state.target, { replace: true });
        }
        // If action is 'allowNormal', do nothing (let normal back happen)
      } else if (!state) {
        // User went back before our app pushed states (to external page or browser history)
        // Redirect to menu as fallback
        navigate('/menu', { replace: true });
      }
    };

    // Attach listener
    window.addEventListener('popstate', handlePopState);
    popstateListenerRef.current = handlePopState;

    // Cleanup
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [location.pathname, navigate]);
};


/**
 * Navigation Utilities for OrderIn SPA
 * 
 * Centralized navigation logic to ensure consistent back-button behavior
 * and proper history management across the entire application.
 */

import { useNavigate } from 'react-router-dom';

/**
 * useOrderInNavigate Hook
 * 
 * Provides navigation utilities with proper history handling.
 * Use this hook instead of raw useNavigate() for consistent behavior.
 */
export const useOrderInNavigate = () => {
  const navigate = useNavigate();

  return {
    /**
     * Navigate to a page in the payment flow (cart, payments, counter-code)
     * These pages should allow normal back navigation within the flow
     */
    navigatePaymentFlow: (path) => {
      navigate(path);
    },

    /**
     * Navigate to a non-payment page and prevent history stepping
     * Examples: menu, profile, item details, help, etc.
     * Back button will go directly to menu, not step through history
     */
    navigateWithMenuReturn: (path) => {
      navigate(path, { replace: false });
    },

    /**
     * Navigate to menu (exit current flow)
     * Replaces history to prevent back-stepping
     */
    navigateToMenu: () => {
      navigate('/menu', { replace: true });
    },

    /**
     * Navigate to login (user logout or auth failure)
     * Replaces history completely
     */
    navigateToLogin: () => {
      navigate('/', { replace: true });
    },

    /**
     * Navigate to cart from menu (enter payment flow)
     * Does NOT replace to allow normal back navigation within flow
     */
    navigateToCart: () => {
      navigate('/cart');
    },

    /**
     * Navigate to payments from cart (continue payment flow)
     * Does NOT replace to allow normal back navigation within flow
     */
    navigateToPayments: () => {
      navigate('/payments');
    },

    /**
     * Navigate to counter code from payments (continue payment flow)
     * Does NOT replace to allow normal back navigation within flow
     */
    navigateToCounterCode: () => {
      navigate('/counter-code');
    },

    /**
     * Navigate to payment success (end of flow)
     * Does NOT replace to allow user to back into flow if needed
     */
    navigateToPaymentSuccess: (orderId) => {
      navigate('/payment-success', { state: { orderId } });
    },

    /**
     * Navigate to item details (non-payment, goes back to menu)
     */
    navigateToItemDetails: (slug) => {
      navigate(`/item/${slug}`);
    },

    /**
     * Navigate to profile (non-payment, goes back to menu)
     */
    navigateToProfile: () => {
      navigate('/profile');
    },
  };
};

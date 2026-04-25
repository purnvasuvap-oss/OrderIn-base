export const TAX_RATE = 0.05;

const ROUND_COLLECTION_PAYMENT_METHODS = new Set(['Cash', 'Card']);

const roundToPaise = (value) => {
  const number = Number(value) || 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
};

export const usesRoundedCollection = (paymentMethod) => (
  ROUND_COLLECTION_PAYMENT_METHODS.has(paymentMethod)
);

export const roundTaxForCollection = (taxValue) => {
  const tax = roundToPaise(taxValue);
  const whole = Math.floor(tax);
  const fractionalPaise = Math.round((tax - whole) * 100);

  return fractionalPaise >= 50 ? whole + 1 : whole;
};

export const calculateBilling = (subtotalValue, paymentMethod) => {
  const subtotal = roundToPaise(subtotalValue);
  const exactTax = roundToPaise(subtotal * TAX_RATE);
  const exactTotal = roundToPaise(subtotal + exactTax);

  if (usesRoundedCollection(paymentMethod)) {
    const roundedTax = roundTaxForCollection(exactTax);
    return {
      subtotal,
      taxes: roundedTax,
      total: roundToPaise(subtotal + roundedTax),
      exactTax,
      exactTotal,
      roundedCollection: true,
    };
  }

  return {
    subtotal,
    taxes: exactTax,
    total: exactTotal,
    exactTax,
    exactTotal,
    roundedCollection: false,
  };
};

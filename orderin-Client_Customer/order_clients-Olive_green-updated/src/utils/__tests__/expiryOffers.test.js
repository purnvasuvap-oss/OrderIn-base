import { describe, it, expect } from "vitest";
import {
  applyPercent,
  buildOfferPromotionText,
  computeIngredientUsage,
  getDishIngredients,
  toRecipeRows,
  isConsumingStatus,
  isOfferActive,
  isOfferExpired,
  percentFromPrices,
  rankDishesForExpiringStock,
  sanitizeIngredients,
  suggestDiscountPercent,
} from "../expiryOffers";

const now = new Date(2026, 10, 24, 12);
const hours = (h) => new Date(now.getTime() + h * 3600000);
const batch = (itemName, h, qty = 1) => ({
  itemName,
  remainingQty: qty,
  unit: "Kgs",
  expiryState: { useBefore: hours(h), msLeft: h * 3600000 },
});

const menu = [
  { id: "a", name: "Milk Shake", price: "99", ingredients: [{ name: "Milk", qty: 0.3 }] },
  { id: "b", name: "Tomato Soup", price: "120", ingredients: [{ name: "Tomato", qty: 0.2 }] },
  { id: "c", name: "Creamy Tomato Pasta", price: "220", ingredients: [{ name: "milk", qty: 0.1 }, { name: "Tomato ", qty: 0.15 }, { name: "Pasta", qty: 0.1 }] },
  { id: "d", name: "Plain Rice", price: "80", ingredients: [{ name: "Rice", qty: 0.2 }] },
  { id: "e", name: "No Ingredients", price: "50" },
];

describe("expiryOffers", () => {
  it("puts the milk + tomato dish first when both are expiring", () => {
    const ranked = rankDishesForExpiringStock([batch("Milk", 30), batch("Tomato", 10)], menu, now);
    expect(ranked.map((r) => r.dish.id)).toEqual(["c", "b", "a"]);
    expect(ranked[0].isCombo).toBe(true);
    expect(ranked[0].matched).toHaveLength(2);
    expect(ranked[0].suggestedPercent).toBe(45); // <=24h => 40, +5 for the second item
    expect(ranked[0].suggestedPrice).toBe(121);
  });

  it("ignores dishes without expiring ingredients", () => {
    expect(rankDishesForExpiringStock([], menu, now)).toEqual([]);
    expect(rankDishesForExpiringStock([batch("Saffron", 5)], menu, now)).toEqual([]);
  });

  it("uses the original price when a dish is already on offer", () => {
    const onOffer = [{ ...menu[0], price: "59", offer: { originalPrice: 99, offerPrice: 59, endsAt: hours(5) } }];
    const [r] = rankDishesForExpiringStock([batch("Milk", 30)], onOffer, now);
    expect(r.onOffer).toBe(true);
    expect(r.originalPrice).toBe(99);
  });

  it("suggests bigger discounts for more urgent stock", () => {
    expect(suggestDiscountPercent(5)).toBe(40);
    expect(suggestDiscountPercent(48)).toBe(30);
    expect(suggestDiscountPercent(200)).toBe(20);
    expect(suggestDiscountPercent(5, 5)).toBe(50);
  });

  it("converts between percent and price", () => {
    expect(applyPercent("₹99", 40)).toBe(59);
    expect(percentFromPrices(99, 59)).toBe(40);
    expect(percentFromPrices(99, 120)).toBe(0);
  });

  it("knows when an offer is running", () => {
    expect(isOfferActive({ offer: { endsAt: hours(1) } }, now)).toBe(true);
    expect(isOfferActive({ offer: { endsAt: hours(-1) } }, now)).toBe(false);
    expect(isOfferActive({}, now)).toBe(false);
    expect(isOfferExpired({ offer: { endsAt: hours(-1) } }, now)).toBe(true);
    expect(isOfferExpired({ offer: { endsAt: hours(1), active: false } }, now)).toBe(true);
  });

  it("sums ingredient usage across an order", () => {
    const { usage, unmatchedDishes } = computeIngredientUsage(
      [
        { id: "a", name: "Milk Shake", quantity: 2 },
        { name: "creamy tomato pasta", qty: 1 },
        { name: "Mystery Dish", quantity: 1 },
      ],
      menu
    );
    const byName = Object.fromEntries(usage.map((u) => [u.name.toLowerCase(), u.qty]));
    expect(byName.milk).toBeCloseTo(0.7);
    expect(byName.tomato).toBeCloseTo(0.15);
    expect(byName.pasta).toBeCloseTo(0.1);
    expect(unmatchedDishes).toEqual(["Mystery Dish"]);
  });

  it("cleans ingredient rows", () => {
    expect(
      sanitizeIngredients([
        { name: " Milk ", qty: "0.2", unit: "Ltrs" },
        { name: "milk", qty: 0.1 },
        { name: "", qty: 1 },
        { name: "Salt", qty: 0 },
      ])
    ).toEqual([{ name: "Milk", qty: 0.3, unit: "Ltrs" }]);
  });

  it("reads every theme's recipe row shape", () => {
    const dish = {
      recipe: [
        { itemId: "Milk", quantity: 0.2 },
        { inventoryItemName: "Tomato", quantity: 0.1, unit: "Kgs" },
        { itemId: "Paneer", inventoryItemName: "Paneer", quantity: 0.15, unit: "Kgs" },
      ],
    };
    expect(getDishIngredients(dish).map((i) => [i.name, i.qty])).toEqual([
      ["Milk", 0.2],
      ["Tomato", 0.1],
      ["Paneer", 0.15],
    ]);
    expect(toRecipeRows([{ name: "Milk", qty: "0.2", unit: "Ltrs" }])).toEqual([
      { itemId: "Milk", inventoryItemName: "Milk", quantity: 0.2, unit: "Ltrs" },
    ]);
    const ranked = rankDishesForExpiringStock([batch("Tomato", 10)], [{ id: "z", name: "Salad", price: "90", ...dish }], now);
    expect(ranked).toHaveLength(1);
  });

  it("only deducts once the kitchen starts", () => {
    expect(isConsumingStatus("Preparing")).toBe(true);
    expect(isConsumingStatus("served")).toBe(true);
    expect(isConsumingStatus("Pending")).toBe(false);
    expect(isConsumingStatus("Rejected")).toBe(false);
  });

  it("writes the promotion text with old and new price", () => {
    const t = buildOfferPromotionText({ dishName: "Milk Shake", originalPrice: 99, offerPrice: 59 });
    expect(t.caption).toBe("Milk Shake is now on special offer — 40% off");
    expect(t.description).toContain("no longer ₹99");
    expect(t.description).toContain("only ₹59");
  });
});

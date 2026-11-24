import { describe, it, expect } from "vitest";
import { getPriceDisplay, getPromotionPrices, isOfferRunning, settleMenuItems, settleOfferPrice } from "../offerPricing";

const now = new Date(2026, 10, 24, 12).getTime();
const later = { toMillis: () => now + 3600000 };
const earlier = { toMillis: () => now - 3600000 };

const onOffer = { id: "a", name: "Milk Shake", price: "59", offer: { originalPrice: 99, offerPrice: 59, endsAt: later } };

describe("offerPricing", () => {
  it("shows the real price struck through while an offer runs", () => {
    expect(isOfferRunning(onOffer, now)).toBe(true);
    expect(getPriceDisplay(onOffer, now)).toEqual({ value: 59, original: 99, isOffer: true, percent: 40 });
  });

  it("keeps the +25% display for flagged promotions", () => {
    expect(getPriceDisplay({ price: "100", promotions: true }, now)).toMatchObject({ value: 100, original: 125, isOffer: false });
    expect(getPriceDisplay({ price: "100" }, now).original).toBeNull();
  });

  it("puts the normal price back when the offer has ended", () => {
    const ended = { ...onOffer, offer: { ...onOffer.offer, endsAt: earlier } };
    const settled = settleOfferPrice(ended, now);
    expect(settled.price).toBe("99");
    expect(settled.offer).toBeUndefined();
    expect(getPriceDisplay(settled, now).original).toBeNull();
  });

  it("leaves a price staff changed by hand", () => {
    const ended = { ...onOffer, price: "80", offer: { ...onOffer.offer, endsAt: earlier } };
    expect(settleOfferPrice(ended, now).price).toBe("80");
  });

  it("does not touch running offers or normal dishes", () => {
    expect(settleOfferPrice(onOffer, now)).toBe(onOffer);
    const plain = { price: "10" };
    expect(settleMenuItems([plain], now)[0]).toBe(plain);
  });

  it("reads old and new price from auto promotions", () => {
    expect(getPromotionPrices({ originalPrice: 99, discountedPrice: 59, discountPercent: 40 })).toEqual({ original: 99, discounted: 59, percent: 40 });
    expect(getPromotionPrices({ caption: "Diwali" })).toBeNull();
  });
});

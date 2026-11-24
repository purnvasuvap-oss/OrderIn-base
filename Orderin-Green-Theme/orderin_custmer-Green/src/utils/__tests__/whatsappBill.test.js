import { describe, it, expect } from "vitest";
import { buildBillText, buildWhatsAppLink, joinPhone, maskPhone, phoneProblem, splitPhone } from "../whatsappBill";

describe("whatsappBill", () => {
  it("splits and joins stored numbers", () => {
    expect(splitPhone("+919876501234")).toEqual({ countryCode: "+91", local: "9876501234" });
    expect(splitPhone("09876501234")).toEqual({ countryCode: "+91", local: "9876501234" });
    expect(joinPhone("+91", "98765 01234")).toBe("+919876501234");
  });

  it("flags made-up numbers", () => {
    expect(phoneProblem("+91", "123456789")).toMatch(/10 digits/);
    expect(phoneProblem("+91", "1234567890")).toMatch(/start with/);
    expect(phoneProblem("+91", "9999999999")).toMatch(/made up/);
    expect(phoneProblem("+91", "9876543210")).toMatch(/made up/);
    expect(phoneProblem("+91", "")).toMatch(/Enter/);
    expect(phoneProblem("+91", "9876501234")).toBe("");
    expect(phoneProblem("+44", "7700900123")).toBe("");
  });

  it("masks all but the last 4 digits", () => {
    expect(maskPhone("+919876501234")).toBe("+91 ••••••1234");
  });

  it("writes a readable bill", () => {
    const text = buildBillText({
      restaurantName: "OrderIn Cafe",
      orderId: "ORD-241126001",
      tableNo: 4,
      items: [
        { name: "Dosa", qty: 2, unitPrice: 120 },
        { name: "Lassi", qty: 1, unitPrice: 59 },
      ],
      subtotal: 299,
      taxes: 14.95,
      total: 313.95,
      paymentMethod: "UPI",
    });
    expect(text).toContain("*OrderIn Cafe*");
    expect(text).toContain("Order: ORD-241126001");
    expect(text).toContain("2 x Dosa  ₹240.00");
    expect(text).toContain("*Total: ₹313.95*");
    expect(text).toContain("Paid by: UPI");
  });

  it("builds a wa.me link with digits only", () => {
    expect(buildWhatsAppLink("+91 98765-01234", "Hi & bye")).toBe("https://wa.me/919876501234?text=Hi%20%26%20bye");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WhatsAppReceipt from "../WhatsAppReceipt";

const mockUpdatePhone = vi.fn();
vi.mock("../../lib/repo", () => ({
  getSettings: () => Promise.resolve({ name: "OrderIn Cafe" }),
  updateOrderCustomerPhone: (...a) => mockUpdatePhone(...a),
}));

const order = {
  id: "ord_1",
  invoiceNo: "INV-0001",
  orderNo: 1,
  customerPhone: "9876501234",
  createdAt: Date.now(),
  items: [{ name: "Dosa", qty: 2, price: 60 }],
  subtotal: 120,
  tax: 6,
  total: 126,
  payments: [{ method: "UPI", amount: 126 }],
};

describe("WhatsAppReceipt", () => {
  beforeEach(() => {
    window.open = vi.fn(() => ({}));
    mockUpdatePhone.mockImplementation(async (id, phone) => ({ ...order, customerPhone: phone }));
  });

  it("opens WhatsApp to the customer's number with the bill", async () => {
    render(<WhatsAppReceipt order={order} user={{ id: "u1" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Yes, send on WhatsApp" }));
    const url = window.open.mock.calls[0][0];
    expect(url).toMatch(/^https:\/\/wa\.me\/919876501234\?text=/);
    expect(decodeURIComponent(url)).toContain("2 x Dosa  ₹120.00");
    expect(mockUpdatePhone).not.toHaveBeenCalled();
  });

  it("edits the number, saves it on the order, then sends", async () => {
    const onUpdated = vi.fn();
    render(<WhatsAppReceipt order={order} user={{ id: "u1" }} onOrderUpdated={onUpdated} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit number" }));
    const input = screen.getByLabelText("Customer WhatsApp number");
    await userEvent.clear(input);
    await userEvent.type(input, "9123405678");
    await userEvent.click(screen.getByRole("button", { name: "Confirm & send" }));
    expect(mockUpdatePhone).toHaveBeenCalledWith("ord_1", "+919123405678", { id: "u1" });
    expect(onUpdated).toHaveBeenCalled();
    expect(window.open.mock.calls[0][0]).toMatch(/wa\.me\/919123405678/);
  });

  it("refuses a made-up number", async () => {
    render(<WhatsAppReceipt order={{ ...order, customerPhone: "1234567890" }} user={{}} />);
    await userEvent.click(screen.getByRole("button", { name: "Yes, send on WhatsApp" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });
});

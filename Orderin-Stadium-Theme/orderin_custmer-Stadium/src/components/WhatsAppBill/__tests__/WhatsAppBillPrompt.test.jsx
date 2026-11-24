import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WhatsAppBillPrompt from "../WhatsAppBillPrompt";

const mockSend = vi.fn();
const mockChangePhone = vi.fn();
vi.mock("../../../services/whatsappBillService", () => ({
  sendBillOnWhatsApp: (...a) => mockSend(...a),
  changeCustomerPhone: (...a) => mockChangePhone(...a),
}));

const bill = { orderId: "ORD-1", items: [{ name: "Dosa", qty: 1, unitPrice: 100 }], subtotal: 100, taxes: 5, total: 105, paymentMethod: "UPI" };

const login = (phone) => localStorage.setItem("user", JSON.stringify({ username: "Asha", phone }));

describe("WhatsAppBillPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
    mockSend.mockResolvedValue({ via: "api" });
    mockChangePhone.mockResolvedValue({ moved: true });
    window.open = vi.fn(() => ({}));
  });

  it("asks to send to the saved number and sends on Yes", async () => {
    login("+919876501234");
    render(<WhatsAppBillPrompt bill={bill} />);
    expect(screen.getByText("+91 ••••••1234")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Yes, send" }));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ phone: "+919876501234" }));
    expect(mockChangePhone).not.toHaveBeenCalled();
    expect(await screen.findByText(/Bill sent to \+91 ••••••1234/)).toBeInTheDocument();
  });

  it("edits the number, updates the profile, then sends", async () => {
    login("+919876501234");
    render(<WhatsAppBillPrompt bill={bill} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit number" }));
    const input = screen.getByLabelText("WhatsApp number");
    await userEvent.clear(input);
    await userEvent.type(input, "9123405678");
    await userEvent.click(screen.getByRole("button", { name: "Confirm & send" }));
    expect(mockChangePhone).toHaveBeenCalledWith("+919876501234", "+919123405678", expect.any(String));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ phone: "+919123405678" }));
  });

  it("starts in edit mode when the saved number looks fake and blocks bad input", async () => {
    login("+911234567890");
    render(<WhatsAppBillPrompt bill={bill} />);
    expect(screen.getByText(/doesn't look right/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("WhatsApp number"), "9999999999");
    await userEvent.click(screen.getByRole("button", { name: "Confirm & send" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/made up/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("offers an Open WhatsApp link when the phone blocks the pop-up", async () => {
    login("+919876501234");
    mockSend.mockResolvedValue({ via: "link", url: "https://wa.me/919876501234?text=x" });
    window.open = vi.fn(() => null);
    render(<WhatsAppBillPrompt bill={bill} />);
    await userEvent.click(screen.getByRole("button", { name: "Yes, send" }));
    const link = await screen.findByRole("link", { name: "Open WhatsApp" });
    expect(link).toHaveAttribute("href", "https://wa.me/919876501234?text=x");
  });

  it("renders nothing without an order id", () => {
    login("+919876501234");
    const { container } = render(<WhatsAppBillPrompt bill={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

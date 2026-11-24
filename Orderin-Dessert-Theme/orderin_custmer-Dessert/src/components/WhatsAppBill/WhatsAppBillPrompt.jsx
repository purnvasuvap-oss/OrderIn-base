import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import "./WhatsAppBillPrompt.css";
import { db } from "../../firebaseConfig";
import { DEFAULT_RESTAURANT_ID } from "../../config/restaurant";
import { changeCustomerPhone, sendBillOnWhatsApp } from "../../services/whatsappBillService";
import { DEFAULT_COUNTRY_CODE, joinPhone, maskPhone, phoneProblem, splitPhone } from "../../utils/whatsappBill";

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

const sentKey = (orderId) => `orderin_wa_bill_${orderId}`;
const wasSent = (orderId) => {
  try {
    return localStorage.getItem(sentKey(orderId)) || "";
  } catch {
    return "";
  }
};
const markSent = (orderId, phone) => {
  try {
    localStorage.setItem(sentKey(orderId), phone);
  } catch {
    /* ignore */
  }
};

const WaIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"
    />
  </svg>
);

/**
 * Shown on the bill after payment: "Send this bill to your WhatsApp?"
 * Yes sends it to the number on the profile; Edit lets the customer fix
 * the number first (which also updates their customer record).
 *
 * bill = { orderId, restaurantName?, date, tableNo, items, subtotal, taxes, total, paymentMethod }
 */
const WhatsAppBillPrompt = ({ bill, restaurantId = DEFAULT_RESTAURANT_ID }) => {
  const user = readUser();
  const savedPhone = user?.phone || "";
  const saved = splitPhone(savedPhone, DEFAULT_COUNTRY_CODE);
  const savedLooksWrong = !!phoneProblem(saved.countryCode, saved.local);

  const alreadySentTo = bill?.orderId ? wasSent(bill.orderId) : "";
  const [step, setStep] = useState(alreadySentTo ? "done" : savedLooksWrong ? "edit" : "ask");
  const [countryCode, setCountryCode] = useState(saved.countryCode);
  const [local, setLocal] = useState(savedLooksWrong ? "" : saved.local);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(alreadySentTo ? { via: "api", phone: alreadySentTo } : null);
  const [restaurantName, setRestaurantName] = useState(bill?.restaurantName || "");

  useEffect(() => {
    if (restaurantName) return;
    getDoc(doc(db, "Restaurant", restaurantId))
      .then((snap) => {
        const d = snap.exists() ? snap.data() : {};
        setRestaurantName(d.name || d.restaurantName || d.displayName || "");
      })
      .catch(() => {});
  }, [restaurantId, restaurantName]);

  const fullBill = useMemo(() => ({ ...bill, restaurantName: restaurantName || bill?.restaurantName }), [bill, restaurantName]);

  if (!bill?.orderId) return null;

  const send = async (phone) => {
    setBusy(true);
    setError("");
    try {
      const res = await sendBillOnWhatsApp({ phone, bill: fullBill, restaurantId });
      let opened = false;
      if (res.via === "link") {
        // Phones may block this after an await (iOS Safari does); then the
        // "Open WhatsApp" link below is a normal tap and always works.
        const w = window.open(res.url, "_blank");
        if (w) {
          w.opener = null;
          opened = true;
        }
      }
      markSent(bill.orderId, phone);
      setResult({ ...res, phone, opened });
      setStep("done");
    } catch (e) {
      setError("Couldn't send the bill. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const saveAndSend = async () => {
    const problem = phoneProblem(countryCode, local);
    if (problem) {
      setError(problem);
      return;
    }
    const nextPhone = joinPhone(countryCode, local);
    setBusy(true);
    setError("");
    try {
      if (savedPhone && nextPhone !== savedPhone) {
        await changeCustomerPhone(savedPhone, nextPhone, restaurantId);
      }
    } catch (e) {
      console.error("Could not update phone number:", e);
      setBusy(false);
      setError("Couldn't save the new number. Check your connection and try again.");
      return;
    }
    setBusy(false);
    await send(nextPhone);
  };

  return (
    <section className="wa-bill" aria-labelledby="wa-bill-title">
      <div className="wa-bill-head">
        <span className="wa-bill-icon">
          <WaIcon />
        </span>
        <h3 id="wa-bill-title">Get this bill on WhatsApp</h3>
      </div>

      {step === "ask" && (
        <>
          <p className="wa-bill-text">
            Send the bill to <strong>{maskPhone(savedPhone)}</strong>?
          </p>
          <div className="wa-bill-actions">
            <button type="button" className="wa-btn wa-btn-primary" onClick={() => send(savedPhone)} disabled={busy}>
              {busy ? "Sending…" : "Yes, send"}
            </button>
            <button type="button" className="wa-btn" onClick={() => setStep("edit")} disabled={busy}>
              Edit number
            </button>
            <button type="button" className="wa-btn wa-btn-ghost" onClick={() => setStep("closed")} disabled={busy}>
              No thanks
            </button>
          </div>
        </>
      )}

      {step === "edit" && (
        <>
          <p className="wa-bill-text">
            {savedLooksWrong && savedPhone
              ? "The number on your profile doesn't look right. Enter your WhatsApp number to get the bill."
              : "Enter the WhatsApp number to send the bill to."}
          </p>
          <div className="wa-phone">
            <select aria-label="Country code" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
              <option value="+91">+91</option>
              <option value="+1">+1</option>
              <option value="+44">+44</option>
              <option value="+971">+971</option>
              <option value="+65">+65</option>
            </select>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              aria-label="WhatsApp number"
              placeholder="10-digit mobile number"
              maxLength={14}
              value={local}
              onChange={(e) => {
                setLocal(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
            />
          </div>
          <p className="wa-bill-note">This also updates the number on your profile.</p>
          {error && (
            <p className="wa-bill-error" role="alert">
              {error}
            </p>
          )}
          <div className="wa-bill-actions">
            <button type="button" className="wa-btn wa-btn-primary" onClick={saveAndSend} disabled={busy}>
              {busy ? "Saving…" : "Confirm & send"}
            </button>
            <button
              type="button"
              className="wa-btn wa-btn-ghost"
              onClick={() => {
                setError("");
                setStep(savedLooksWrong ? "closed" : "ask");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {step === "done" && result && (
        <>
          <p className="wa-bill-text" role="status">
            {result.via === "api"
              ? `Bill sent to ${maskPhone(result.phone)} on WhatsApp.`
              : result.opened
                ? `WhatsApp opened with your bill for ${maskPhone(result.phone)}. Tap send there to keep a copy.`
                : `Your bill for ${maskPhone(result.phone)} is ready. Tap Open WhatsApp, then send.`}
          </p>
          <div className="wa-bill-actions">
            {result.via === "link" && result.url && (
              <a className={`wa-btn ${result.opened ? "" : "wa-btn-primary"}`} href={result.url} target="_blank" rel="noopener noreferrer">
                {result.opened ? "Open WhatsApp again" : "Open WhatsApp"}
              </a>
            )}
            <button type="button" className="wa-btn wa-btn-ghost" onClick={() => setStep("edit")}>
              Send to another number
            </button>
          </div>
        </>
      )}

      {step === "closed" && (
        <div className="wa-bill-actions">
          <button type="button" className="wa-btn wa-btn-ghost" onClick={() => setStep(savedLooksWrong ? "edit" : "ask")}>
            Send bill on WhatsApp
          </button>
        </div>
      )}

      {error && step !== "edit" && (
        <p className="wa-bill-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
};

export default WhatsAppBillPrompt;

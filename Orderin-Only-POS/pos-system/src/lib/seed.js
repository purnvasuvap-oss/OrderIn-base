import { STORES, putOne, getOne } from "./db";

let seedPromise = null;

export function seedIfEmpty() {
  if (!seedPromise) seedPromise = doSeed();
  return seedPromise;
}

// Local defaults only. This does not create demo logins and it does not
// write a sample restaurant into Firestore. Menu, staff and the restaurant
// name come from the signed-in restaurant.
async function doSeed() {
  const billing = await getOne(STORES.settings, "billing");
  if (billing) return;
  await putOne(STORES.settings, {
    id: "billing",
    invoicePrefix: "INV-",
    orderPrefix: "ORD-",
    nextInvoiceSeq: 1,
    defaultTax: 5,
    cgstRate: 2.5,
    sgstRate: 2.5,
    currency: "₹",
    footerMessage: "Thank you! Visit again.",
  });
  await putOne(STORES.settings, {
    id: "restaurant",
    name: "",
    logo: "",
    address: "",
    phone: "",
    email: "",
    gstin: "",
    fssai: "",
    sac: "996331",
  });
  await putOne(STORES.settings, { id: "printer", connectionType: "bridge", paperWidth: "80mm", autoPrint: false, printCopies: 1 });
  await putOne(STORES.settings, { id: "order", orderTypes: ["dine-in", "takeaway", "counter"], avgPrepTimeAlertMin: 15 });
}

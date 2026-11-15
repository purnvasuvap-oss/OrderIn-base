import { useState } from "react";
import * as XLSX from "xlsx";
import { QRCodeSVG } from "qrcode.react";
import { collection, doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { CUSTOMER_SITE, DEFAULT_RESTAURANT_ID } from "../config/restaurant";

export default function Onboarding() {
  const [tables, setTables] = useState(8);
  const [reviewUrl, setReviewUrl] = useState("");
  const [gstin, setGstin] = useState("");
  const [fssai, setFssai] = useState("");
  const [sac, setSac] = useState("996331");
  const [note, setNote] = useState("");
  const [links, setLinks] = useState([]);

  const saveProfile = async () => {
    await setDoc(doc(db, "Restaurant", DEFAULT_RESTAURANT_ID), {
      googleReviewUrl: reviewUrl,
      gstin,
      fssai,
      sac,
    }, { merge: true });
    setNote("Saved the review link and GST details.");
  };

  const makeTables = async () => {
    const count = Math.max(1, Math.min(80, Number(tables) || 1));
    const batch = writeBatch(db);
    const next = [];
    for (let n = 1; n <= count; n += 1) {
      const url = `${CUSTOMER_SITE}/?table=${n}`;
      batch.set(doc(db, "Restaurant", DEFAULT_RESTAURANT_ID, "tables", String(n)), {
        num: n,
        capacity: 4,
        status: "available",
        qrUrl: url,
      }, { merge: true });
      next.push(url);
    }
    await batch.commit();
    setLinks(next);
    setNote(`Saved ${count} tables.`);
  };

  const importMenu = async (file) => {
    const data = await file.arrayBuffer();
    const book = XLSX.read(data);
    const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: "" });
    let saved = 0;
    for (const row of rows) {
      const name = row.name || row.Name || row.dish;
      if (!name) continue;
      const id = String(row.id || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await setDoc(doc(collection(db, "Restaurant", DEFAULT_RESTAURANT_ID, "menu"), id), {
        name: String(name),
        price: Number(row.price || row.Price || 0),
        category: row.category || row.Category || "",
        diet: row.diet || row.Diet || "",
        station: row.station || row.Station || "",
        allergens: row.allergens || row.Allergens || "",
        spiceLevel: row.spiceLevel || row.Spice || "",
      }, { merge: true });
      saved += 1;
    }
    setNote(`Imported ${saved} dishes. Existing dishes with the same name were updated, not deleted.`);
  };

  const downloadReport = () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(links.map((url, index) => ({ table: index + 1, url })));
    XLSX.utils.book_append_sheet(book, sheet, "Tables");
    XLSX.writeFile(book, "table-qr.xlsx");
  };

  return (
    <div style={{ padding: 16 }}>
      <h1>Set up this restaurant</h1>
      <p>Menu rows need a name and a price. Optional columns: category, diet, station, allergens, spiceLevel.</p>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => event.target.files?.[0] && importMenu(event.target.files[0])} />
      <div>
        <label>Tables <input value={tables} onChange={(event) => setTables(event.target.value)} style={{ width: 64 }} /></label>
        <button type="button" onClick={makeTables}>Create tables and QR links</button>
      </div>
      <div>
        <input placeholder="Google review URL" value={reviewUrl} onChange={(event) => setReviewUrl(event.target.value)} />
        <input placeholder="GSTIN" value={gstin} onChange={(event) => setGstin(event.target.value)} />
        <input placeholder="FSSAI" value={fssai} onChange={(event) => setFssai(event.target.value)} />
        <input placeholder="SAC" value={sac} onChange={(event) => setSac(event.target.value)} />
        <button type="button" onClick={saveProfile}>Save tax and review details</button>
      </div>
      {links.length ? <button type="button" onClick={downloadReport}>Download Excel</button> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        {links.map((url) => (
          <div key={url}>
            <QRCodeSVG value={url} size={96} />
            <div style={{ fontSize: 12 }}>{url}</div>
          </div>
        ))}
      </div>
      {note ? <p>{note}</p> : null}
    </div>
  );
}

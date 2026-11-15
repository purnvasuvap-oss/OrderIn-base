import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { DEFAULT_RESTAURANT_ID } from "../config/restaurant";

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export default function StaffPay() {
  const [staff, setStaff] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    const rid = DEFAULT_RESTAURANT_ID;
    const stops = [
      onSnapshot(collection(db, "Restaurant", rid, "staff"), (snap) => {
        setStaff(snap.docs.map((row) => ({ id: row.id, ...row.data() })));
      }, () => setStaff([])),
      onSnapshot(collection(db, "Restaurant", rid, "attendance"), (snap) => {
        setAttendance(snap.docs.map((row) => row.data()));
      }, () => setAttendance([])),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  const save = async (person, salary, tax) => {
    const additions = round2(salary);
    const deductions = round2(tax);
    const netPay = round2(Math.max(0, additions - deductions));
    const month = new Date().toISOString().slice(0, 7);
    await setDoc(doc(db, "Restaurant", DEFAULT_RESTAURANT_ID, "payrollRuns", month, "rows", person.id), {
      staffId: person.id,
      staffName: person.name || person.staffName || "Staff",
      role: person.role || person.jobRole || "",
      salary: additions,
      tax: deductions,
      netPay,
      at: new Date().toISOString(),
    }, { merge: true });
    setNote(`${person.name || "Staff"} net pay saved as ₹${netPay}. It cannot go below zero.`);
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: 16 }}>
      <h1>Staff pay</h1>
      <p>Pay is stored on the staff role already saved for this restaurant. Today's attendance marks are counted beside each person.</p>
      {staff.map((person) => {
        const marks = attendance.filter((row) => (row.staffId === person.id || row.staffName === person.name) && String(row.date || row.dateKey || "").startsWith(today)).length;
        return (
          <StaffRow key={person.id} person={person} marks={marks} onSave={save} />
        );
      })}
      {!staff.length ? <p>No staff records yet. Add staff on the staff page first.</p> : null}
      {note ? <p>{note}</p> : null}
    </div>
  );
}

function StaffRow({ person, marks, onSave }) {
  const [salary, setSalary] = useState(person.salary || person.payrollProfile?.salary || "");
  const [tax, setTax] = useState(person.tax || "");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
      <strong>{person.name || person.staffName || person.id}</strong>
      <span>{person.role || person.jobRole || "role not set"}</span>
      <span>attendance today {marks}</span>
      <input value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="Salary" style={{ width: 90 }} />
      <input value={tax} onChange={(event) => setTax(event.target.value)} placeholder="Tax" style={{ width: 80 }} />
      <button type="button" onClick={() => onSave(person, salary, tax)}>Save pay</button>
    </div>
  );
}

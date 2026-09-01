import { collection, getDocs, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db, RESTAURANT_ID, firebaseEnabled } from "./firebase";
import { ROLES } from "./auth";

// Restaurant/{RESTAURANT_ID}/accessControl/roles/{roleLogin} — set up directly
// in Firestore by the restaurant owner (mirrors the accessControl pattern the
// other Orderin theme apps use for their staff dashboards). Each collection
// holds one doc per staff member with plain {username, password} fields.
const ROLE_COLLECTIONS = [
  { collectionName: "mainLogin", role: ROLES.ADMIN },
  { collectionName: "managerLogin", role: ROLES.MANAGER },
  { collectionName: "cashierLogin", role: ROLES.CASHIER },
  { collectionName: "kitchenLogin", role: ROLES.KITCHEN },
];
const ROLE_COLLECTION_BY_ROLE = Object.fromEntries(ROLE_COLLECTIONS.map((r) => [r.role, r.collectionName]));

// Prefers the original demo-style doc id per role when a collection holds
// more than one account (e.g. a real employee added alongside it) — keeps
// the Login page's demo buttons pointing at the account meant to be a demo,
// not whichever one Firestore happens to return first.
const PREFERRED_DEMO_DOC_ID = {
  [ROLES.ADMIN]: "admin",
  [ROLES.MANAGER]: "manager",
  [ROLES.CASHIER]: "cashier",
  [ROLES.KITCHEN]: "KitchenStaff",
};

// Checks the cloud-managed staff login list ahead of the device-local demo
// accounts seeded by seed.js. Returns null when no accessControl doc has
// this username in ANY role, so the caller knows to fall back to the local
// check (offline, or an account not yet provisioned in Firestore). Once a
// username match is found, returns a definitive found/valid result instead
// of falling through, so a wrong password never silently succeeds against an
// unrelated local account sharing the same username.
export async function verifyAccessLogin(username, password) {
  if (!firebaseEnabled) return null;
  const needle = username.trim().toLowerCase();
  for (const { collectionName, role } of ROLE_COLLECTIONS) {
    const col = collection(db, "Restaurant", RESTAURANT_ID, "accessControl", "roles", collectionName);
    const snap = await getDocs(col);
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if ((data.username || "").trim().toLowerCase() === needle) {
        return {
          role,
          collectionName,
          docId: docSnap.id,
          username: data.username,
          valid: data.password === password,
        };
      }
    }
  }
  return null;
}

// Writes a changed password back to the same accessControl doc verifyAccessLogin
// read it from — that doc is the actual login source of truth (see
// verifyAccessLogin), so a password change has to land there, not just in the
// local cache, or the old password would keep working via Firestore.
// passwordManuallySet marks that this is no longer just the auto-generated
// starting password from empId — see syncEmployeeAccessLogin, which uses it
// to decide whether correcting an employee's ID should re-sync the password.
export async function updateAccessPassword(collectionName, docId, newPassword) {
  const ref = doc(db, "Restaurant", RESTAURANT_ID, "accessControl", "roles", collectionName, docId);
  await setDoc(ref, { password: newPassword, passwordManuallySet: true }, { merge: true });
}

// Keeps an employee's accessControl login in step with their staff record —
// called from saveEmployee() on every add/edit:
//  - new employee -> creates a login (username = name, password = empId) in
//    the role collection matching their role
//  - role and/or empId changed, password never touched by the employee ->
//    moves the login doc and re-syncs the password to the (possibly
//    corrected) empId, since it was never anything but a placeholder anyway
//  - role and/or empId changed, employee HAS changed their own password
//    (see updateAccessPassword) -> moves the doc but keeps that password —
//    an admin fixing a typo in empId can't accidentally revert it
//  - name changed -> updates the username field in place
// Returns "created" | "moved" | "renamed" | "unchanged" | "skipped" so the
// caller can tell the person who just saved what actually happened.
export async function syncEmployeeAccessLogin(employee, before) {
  if (!firebaseEnabled) return "skipped";
  const newCollection = ROLE_COLLECTION_BY_ROLE[employee.role];
  if (!newCollection) return "skipped";

  const oldCollection = before ? ROLE_COLLECTION_BY_ROLE[before.role] : null;
  const oldDocId = before?.empId;
  const newDocId = employee.empId;

  // No prior login to locate — either a brand-new employee, or an existing
  // one who predates this feature / never had an empId before. Provision
  // fresh credentials if there's an empId to seed the password from, and
  // don't clobber a login that already happens to exist under this id.
  if (!oldCollection || !oldDocId) {
    if (!newDocId) return "skipped";
    const ref = doc(db, "Restaurant", RESTAURANT_ID, "accessControl", "roles", newCollection, newDocId);
    if ((await getDoc(ref)).exists()) return "skipped";
    await setDoc(ref, { username: employee.name, password: newDocId, passwordManuallySet: false });
    return "created";
  }

  const oldRef = doc(db, "Restaurant", RESTAURANT_ID, "accessControl", "roles", oldCollection, oldDocId);
  const oldSnap = await getDoc(oldRef);
  if (!oldSnap.exists()) {
    if (!newDocId) return "skipped";
    const ref = doc(db, "Restaurant", RESTAURANT_ID, "accessControl", "roles", newCollection, newDocId);
    if ((await getDoc(ref)).exists()) return "skipped";
    await setDoc(ref, { username: employee.name, password: newDocId, passwordManuallySet: false });
    return "created";
  }

  if (oldCollection === newCollection && oldDocId === newDocId) {
    if (oldSnap.data().username === employee.name) return "unchanged";
    await setDoc(oldRef, { username: employee.name }, { merge: true });
    return "renamed";
  }

  // Role and/or empId changed enough to need a different doc — move it. Only
  // carry the old password forward if the employee actually set it
  // themselves; otherwise it was never more than a placeholder, so re-sync
  // it to match the (possibly just-corrected) empId like a fresh creation would.
  if (!newDocId) return "skipped";
  const manuallySet = oldSnap.data().passwordManuallySet === true;
  await setDoc(doc(db, "Restaurant", RESTAURANT_ID, "accessControl", "roles", newCollection, newDocId), {
    username: employee.name,
    password: manuallySet ? oldSnap.data().password : newDocId,
    passwordManuallySet: manuallySet,
  });
  await deleteDoc(oldRef);
  return "moved";
}

// The Login page's "demo accounts" quick-fill buttons used to carry
// hardcoded username/password guesses that could silently drift from
// whatever's actually configured in accessControl — worst case, a
// mismatched demo username fell through to an unrelated local fallback
// account entirely instead of being correctly rejected (this is what let
// the old "Kitchen Staff" demo button log in as kitchen without a real
// password). Fetches the real, current credentials for one account per
// role instead, so the buttons can never drift out of sync with whatever
// is actually configured. Intended as a testing-phase convenience — drop
// the whole "demo accounts" section from the Login page once staff are
// using their real logins.
export async function fetchDemoAccounts() {
  if (!firebaseEnabled) return [];
  const results = [];
  for (const { collectionName, role } of ROLE_COLLECTIONS) {
    try {
      const col = collection(db, "Restaurant", RESTAURANT_ID, "accessControl", "roles", collectionName);
      const snap = await getDocs(col);
      if (snap.empty) continue;
      const preferredId = PREFERRED_DEMO_DOC_ID[role];
      const chosen = snap.docs.find((d) => d.id === preferredId) || snap.docs[0];
      const data = chosen.data();
      if (data.username && data.password) results.push({ role, username: data.username, password: data.password });
    } catch (err) {
      console.warn("fetchDemoAccounts failed for role", role, err?.message || err);
    }
  }
  return results;
}

// Removes the login syncEmployeeAccessLogin created for this employee, so
// removing someone from the staff list doesn't leave a working login behind
// with no employee record attached to it.
export async function removeEmployeeAccessLogin(employee) {
  if (!firebaseEnabled || !employee?.empId) return;
  const collectionName = ROLE_COLLECTION_BY_ROLE[employee.role];
  if (!collectionName) return;
  try {
    await deleteDoc(doc(db, "Restaurant", RESTAURANT_ID, "accessControl", "roles", collectionName, employee.empId));
  } catch (err) {
    console.warn("removeEmployeeAccessLogin failed:", err?.message || err);
  }
}

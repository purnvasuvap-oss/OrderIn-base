// Staff passwords live in Firebase Auth. This module used to copy plaintext
// passwords into Firestore and compare them in the browser. It does not do
// that anymore. Create logins from the staff app (Create staff login).

export async function verifyAccessLogin() {
  return null;
}

export async function updateAccessPassword() {
  throw new Error("Change this password in Firebase Auth. Passwords are not stored in Firestore.");
}

export async function syncEmployeeAccessLogin() {
  return "use-firebase-auth";
}

export async function fetchDemoAccounts() {
  return [];
}

export async function removeEmployeeAccessLogin() {
  return;
}

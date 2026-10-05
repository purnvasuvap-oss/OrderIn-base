import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export const signOutPayrollUser = () => signOut(auth);

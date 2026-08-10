// src/utils/phoneValidation.js
//
// Phone numbers in this app were originally restricted to digit-only,
// exactly-10-character input (India-only). That's too strict for
// international guests/staff, so this utility relaxes input handling to
// accept common international formatting while still rejecting garbage.
//
// NOTE: this file is intentionally duplicated (not shared) in the customer
// app at orderin_custmer-Maroon/src/utils/phoneValidation.js — these two
// apps don't share a utils module, matching how other shared-logic files
// (e.g. orderCleanupUtils.js) are already independently duplicated
// per-app in this codebase.

/**
 * Sanitize raw phone input as the user types: allow digits, spaces, `-`,
 * `(`, `)`, `+`, and `#`; strip everything else. Intended for use directly
 * in an <input>'s onChange handler.
 */
export const sanitizePhoneInput = (value) => {
  return (value || "").replace(/[^\d\s\-()+#]/g, "");
};

/**
 * Validate a phone number for submission: strips all non-digit characters
 * and checks the remaining digit count falls within the practical E.164
 * range (7–15 digits), rather than requiring an exact length. This allows
 * genuinely international numbers through while still rejecting empty/
 * too-short/too-long garbage.
 */
export const isValidPhoneNumber = (value) => {
  const digitsOnly = (value || "").replace(/\D/g, "");
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
};

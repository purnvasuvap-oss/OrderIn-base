# GST on the bill

Each bill shows:

- the restaurant GSTIN and FSSAI number, when you have saved them
- a sequential invoice number like `INV/2026-27/000012` (Indian financial year, April–March)
- SAC `996331` (restaurant service) unless you change it
- CGST and SGST as two lines

The starting rates are **2.5% CGST and 2.5% SGST**. Change them per restaurant on the staff Setup screen (`cgstRate` and `sgstRate` on the public profile).

These rates are a placeholder so the bill has the right shape. **A chartered accountant has to confirm the rate, the SAC code, and whether this restaurant should charge GST at all** before you hand a bill to a guest. Packaged drinks and some other items are often a different rate from cooked food. The POS still uses the tax percent stored on each item, then splits that tax into equal CGST and SGST for an intra-state sale. An inter-state IGST bill is not implemented.

// src/lib/db/schema/addresses.ts
import "server-only";

/**
 * DEPRECATED (do not use for new code):
 * This project has standardized on:
 *   - customers
 *   - customer_addresses
 *
 * The old "addresses" table (userId-scoped + single isDefault) is not future-proof and
 * conflicts with the new model (customerId-scoped + default shipping/billing + soft delete).
 *
 * This file remains as a compatibility shim so existing imports don't explode.
 * It re-exports the new customer_addresses table under the legacy name "addresses".
 *
 * IMPORTANT:
 * - Column names differ (customerId vs userId, isDefaultShipping/Billing vs isDefault, phoneEnc vs phone).
 * - TypeScript errors from old call sites are expected and should be fixed by migrating usage
 *   to the new fields.
 */

export {
  customerAddresses as addresses,
  type CustomerAddressRow as AddressRow,
  type CustomerAddressInsert as AddressInsert,
} from "./customerAddresses";

import { describe, expect, it } from "vitest";
import { minimumRegistrationPayload } from "./minimum-registration.js";
const valid = {
  first_name: "Synthetic",
  last_name: "Example",
  phone: "TEST",
  national_id: "SYNTHETIC-ONLY",
  gender: "female",
  date_of_birth: "1990-01-01",
};
describe("explicit required-field correction", () => {
  for (const field of ["first_name", "last_name", "phone", "national_id"])
    it(`rejects trim-empty ${field} without sending or saving`, () => {
      expect(() =>
        minimumRegistrationPayload({ ...valid, [field]: "   " }),
      ).toThrow();
    });
  it("preserves nonempty valid input bytes and omits optional fields", () => {
    const payload = minimumRegistrationPayload({
      ...valid,
      first_name: " Synthetic ",
    });
    expect(payload.first_name).toBe(" Synthetic ");
    for (const field of [
      "address",
      "income_band_code",
      "marriage_status",
      "medical_record",
    ])
      expect(Object.hasOwn(payload, field)).toBe(false);
  });
});

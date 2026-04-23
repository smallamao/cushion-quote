import { describe, expect, it } from "vitest";

import { buildGivemeSign, createGivemeAuthFields } from "@/lib/giveme-signer";

describe("giveme-signer", () => {
  it("buildGivemeSign 依文件規則產生大寫 MD5", () => {
    expect(buildGivemeSign("1668468676789", "admin", "password")).toBe(
      "AA706CA972C31C2ED7CCFC7DCD07CDD7",
    );
  });

  it("createGivemeAuthFields 帶入 timeStamp / uncode / idno / sign", () => {
    const result = createGivemeAuthFields({
      timeStamp: "1668468676789",
      uncode: "85164778",
      idno: "admin",
      password: "password",
    });

    expect(result).toEqual({
      timeStamp: "1668468676789",
      uncode: "85164778",
      idno: "admin",
      sign: "AA706CA972C31C2ED7CCFC7DCD07CDD7",
    });
  });
});

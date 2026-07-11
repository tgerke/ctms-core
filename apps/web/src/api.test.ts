import { describe, expect, it } from "vitest";
import { ApiError, errorMessage } from "./api";

describe("errorMessage", () => {
  it("maps 403 to a permission message", () => {
    expect(errorMessage(new ApiError(403, "forbidden"))).toBe(
      "You don't have permission to do this.",
    );
  });

  it("surfaces the server's message for 4xx validation errors", () => {
    expect(errorMessage(new ApiError(400, "identified_date is required"))).toBe(
      "identified_date is required",
    );
  });

  it("hides 5xx detail behind a plain retry message", () => {
    expect(errorMessage(new ApiError(500, '{"stack":"..."}'))).toBe(
      "Something went wrong on the server — please try again.",
    );
  });

  it("treats fetch TypeErrors as connectivity problems", () => {
    expect(errorMessage(new TypeError("Failed to fetch"))).toMatch(
      /couldn't reach the server/i,
    );
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(errorMessage("boom")).toBe("Something went wrong — please try again.");
  });
});

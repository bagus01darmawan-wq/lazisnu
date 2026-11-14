import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PerolehanHero } from "./PerolehanHero";

describe("PerolehanHero", () => {
  it("shows filled cans separately and uses filled cans for the average", () => {
    render(<PerolehanHero nominal={110_000} filled={10} />);

    expect(
      screen.getByText("Kaleng isi").previousElementSibling?.textContent,
    ).toBe("10");
    expect(
      screen.getByText("Rata-rata per kaleng berisi").previousElementSibling
        ?.textContent,
    ).toContain("11.000");
  });
});

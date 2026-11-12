import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PerolehanHero } from "./PerolehanHero";

describe("PerolehanHero", () => {
  it("shows filled cans separately from total pickups and uses total pickups for the average", () => {
    render(<PerolehanHero nominal={110_000} collected={11} filled={10} />);

    expect(
      screen.getByText("Kaleng isi").previousElementSibling?.textContent,
    ).toBe("10");
    expect(
      screen.getByText("Rata-rata per kaleng").previousElementSibling
        ?.textContent,
    ).toContain("10.000");
  });
});

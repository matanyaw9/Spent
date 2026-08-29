import { describe, expect, it } from "vitest";

import {
  classifyCardLine,
  detectKind,
  type TrackedCards,
} from "./transfers";

const NO_CARDS: TrackedCards = { numbers: [], providers: [] };
const CAL_CARDS: TrackedCards = {
  numbers: ["8033", "9793"],
  providers: ["cal"],
};

describe("detectKind", () => {
  it("marks card charge lines on bank providers as transfers", () => {
    expect(detectKind("חיוב לכרטיס ויזה 8033", "discount", -1400)).toBe(
      "transfer"
    );
    expect(detectKind("ישראכרט", "hapoalim", -4320)).toBe("transfer");
  });

  it("classifies bank rows by sign when no pattern matches", () => {
    expect(detectKind("משכורת", "discount", 15000)).toBe("income");
    expect(detectKind("משיכת שיק:0080000036", "discount", -4800)).toBe(
      "expense"
    );
  });

  it("treats card provider rows as expenses", () => {
    expect(detectKind("גו אאוט כרטיסים", "cal", -105)).toBe("expense");
  });
});

describe("classifyCardLine", () => {
  it("matches a bank charge line to a tracked card by number", () => {
    expect(classifyCardLine("חיוב לכרטיס ויזה 8033", CAL_CARDS)).toBe(
      "tracked-card"
    );
    expect(classifyCardLine("חיוב לכרטיס ויזה 9793", CAL_CARDS)).toBe(
      "tracked-card"
    );
  });

  it("matches by last 4 digits when the tracked number is longer", () => {
    const cards: TrackedCards = {
      numbers: ["458045******8033"],
      providers: ["isracard"],
    };
    expect(classifyCardLine("חיוב לכרטיס ויזה 8033", cards)).toBe(
      "tracked-card"
    );
  });

  it("flags a card charge whose number matches no tracked card", () => {
    expect(classifyCardLine("חיוב לכרטיס ויזה 5555", CAL_CARDS)).toBe(
      "untracked-card"
    );
  });

  it("does not let a company keyword override a non-matching card number", () => {
    const cards: TrackedCards = { numbers: ["8033"], providers: ["isracard"] };
    expect(classifyCardLine("ישראכרט 5555", cards)).toBe("untracked-card");
  });

  it("matches a numberless line by company keyword for tracked providers", () => {
    const cards: TrackedCards = { numbers: ["1234"], providers: ["isracard"] };
    expect(classifyCardLine("ישראכרט", cards)).toBe("tracked-card");
    expect(classifyCardLine("מקס איט פיננסים", cards)).toBe("untracked-card");
  });

  it("treats pending aggregates as transfers only when cards are tracked", () => {
    expect(classifyCardLine("חיוב זמני למפתח מזומן", CAL_CARDS)).toBe(
      "pending-aggregate"
    );
    expect(classifyCardLine("חיוב זמני למפתח מזומן", NO_CARDS)).toBe(
      "untracked-card"
    );
  });

  it("flags card charges when no cards are tracked at all", () => {
    expect(classifyCardLine("חיוב לכרטיס ויזה 8033", NO_CARDS)).toBe(
      "untracked-card"
    );
  });

  it("ignores non-card bank lines", () => {
    expect(classifyCardLine("הע. לInteractive B בסניף 12-600", CAL_CARDS)).toBe(
      "not-card"
    );
    expect(classifyCardLine("משיכת שיק:0080000036", CAL_CARDS)).toBe(
      "not-card"
    );
    expect(classifyCardLine("ניכוי מס מניירות ערך-", CAL_CARDS)).toBe(
      "not-card"
    );
    expect(classifyCardLine("", CAL_CARDS)).toBe("not-card");
  });
});

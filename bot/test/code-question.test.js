const assert = require("node:assert/strict");
const test = require("node:test");
const { isPolishCodeQuestion } = require("../src/code-question");

test("recognizes Polish questions asking for the code", () => {
  assert.equal(isPolishCodeQuestion("Jaki jest kod?"), true);
  assert.equal(isPolishCodeQuestion("Gdzie znajdę kod?"), true);
  assert.equal(isPolishCodeQuestion("Jak zdobyć kod do gry?"), true);
  assert.equal(isPolishCodeQuestion("Kod?"), true);
});

test("does not reply to unrelated mentions of a code", () => {
  assert.equal(isPolishCodeQuestion("Zmieniłem kod w ustawieniach."), false);
  assert.equal(isPolishCodeQuestion("Kod został podany wczoraj."), false);
  assert.equal(isPolishCodeQuestion("Gdzie znajdę regulamin?"), false);
});

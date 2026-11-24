import { test } from "node:test"; import assert from "node:assert/strict";
import { toLittleText } from "./little-text";
test("escape", () => {
  assert.equal(toLittleText("Hi (test) #editing @me 50% *wow* # alone"), "Hi \\(test\\) #editing \\@me 50% \\*wow\\* \\# alone");
});

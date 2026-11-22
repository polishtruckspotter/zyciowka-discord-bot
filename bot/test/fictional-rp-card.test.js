const assert = require("node:assert/strict");
const test = require("node:test");
const { createCanvas } = require("@napi-rs/canvas");
const { createFictionalRpCardImage } = require("../src/fictional-rp-card");

test("creates a PNG RP profile card with the expected dimensions", async () => {
  const avatarCanvas = createCanvas(64, 64);
  const avatarContext = avatarCanvas.getContext("2d");
  avatarContext.fillStyle = "#4f46e5";
  avatarContext.fillRect(0, 0, 64, 64);
  const avatarDataUrl = `data:image/png;base64,${avatarCanvas.toBuffer("image/png").toString("base64")}`;

  const card = await createFictionalRpCardImage({
    profile: { id: "123456789", username: "ExamplePlayer", imageUrl: avatarDataUrl },
    surname: "Example",
    givenNames: "Alex",
    dateOfBirth: "01.01.2000",
    gender: "N",
    citizenship: "Poznań RP",
    issueDate: "20.11.2026",
  });

  assert.equal(card.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(card.readUInt32BE(16), 1200);
  assert.equal(card.readUInt32BE(20), 700);
});

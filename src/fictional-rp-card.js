const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const templatePath = path.join(__dirname, "..", "poznan rp dowody.webp");

async function createFictionalRpCardImage({
  profile,
  surname,
  givenNames,
  dateOfBirth,
  gender,
  citizenship,
  issueDate,
}) {
  const template = await loadImage(templatePath);
  const avatarResponse = await fetch(profile.imageUrl, {
    signal: AbortSignal.timeout(10000),
  });
  if (!avatarResponse.ok) {
    throw new Error(`Nie udało się pobrać awatara Roblox (HTTP ${avatarResponse.status}).`);
  }
  const avatarBuffer = Buffer.from(await avatarResponse.arrayBuffer());
  if (avatarBuffer.length > 5 * 1024 * 1024) {
    throw new Error("Pobrany awatar Roblox przekracza dozwolony rozmiar.");
  }
  const avatar = await loadImage(avatarBuffer);
  const canvas = createCanvas(template.width, template.height);
  const context = canvas.getContext("2d");
  context.drawImage(template, 0, 0);

  // Keep the portrait in the open lower-left area, clear of the printed labels.
  context.save();
  context.beginPath();
  context.arc(105, 315, 55, 0, Math.PI * 2);
  context.clip();
  context.drawImage(avatar, 50, 260, 110, 110);
  context.restore();

  const drawValue = (value, x, y, maxWidth, fontSize = 15) => {
    context.fillStyle = "#151515";
    context.font = `600 ${fontSize}px Arial`;
    let text = String(value);
    while (text.length > 1 && context.measureText(text).width > maxWidth) {
      text = `${text.slice(0, -2)}…`;
    }
    context.fillText(text, x, y, maxWidth);
  };

  // Values are placed below their matching printed labels.
  drawValue(surname, 198, 222, 275);
  drawValue(givenNames, 198, 267, 275);
  drawValue(surname, 198, 312, 200);
  drawValue(dateOfBirth, 190, 400, 155);
  drawValue(gender, 360, 400, 105);

  // These identifiers are deliberately marked as roleplay-only, never real identity data.
  drawValue("TYLKO RP", 627, 142, 175, 13);
  drawValue(citizenship, 615, 179, 175, 13);
  drawValue(`RP-${String(profile.id).slice(-8)}`, 858, 142, 145, 12);
  drawValue(issueDate, 858, 179, 145, 13);

  return canvas.toBuffer("image/png");
}

module.exports = { createFictionalRpCardImage };

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

  // Fit the Roblox avatar into the open portrait area beside the name fields.
  context.save();
  context.beginPath();
  context.arc(127, 198, 64, 0, Math.PI * 2);
  context.clip();
  context.drawImage(avatar, 63, 134, 128, 128);
  context.restore();
  context.beginPath();
  context.arc(127, 198, 64, 0, Math.PI * 2);
  context.strokeStyle = "rgba(255,255,255,0.9)";
  context.lineWidth = 3;
  context.stroke();

  const drawValue = (value, x, y, maxWidth, fontSize = 15) => {
    context.fillStyle = "#151515";
    context.font = `600 ${fontSize}px Arial`;
    let text = String(value);
    while (text.length > 1 && context.measureText(text).width > maxWidth) {
      text = `${text.slice(0, -2)}…`;
    }
    context.fillText(text, x, y, maxWidth);
  };

  // The template labels these spaces already; values sit directly below each label.
  drawValue(surname, 195, 136, 290);
  drawValue(givenNames, 195, 185, 290);
  drawValue(surname, 195, 232, 290);
  drawValue(dateOfBirth, 195, 322, 150);
  drawValue(gender, 355, 322, 120);

  // These identifiers are deliberately marked as roleplay-only, never real identity data.
  drawValue("TYLKO RP", 625, 61, 180, 13);
  drawValue(citizenship, 625, 99, 190, 13);
  drawValue("Poznań RP", 541, 154, 270, 14);
  drawValue(`RP-${String(profile.id).slice(-8)}`, 857, 61, 145, 12);
  drawValue(issueDate, 857, 100, 145, 13);

  return canvas.toBuffer("image/png");
}

module.exports = { createFictionalRpCardImage };

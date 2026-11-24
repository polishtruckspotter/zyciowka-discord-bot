const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const templatePath = path.join(__dirname, "..", "better dowody .webp");

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

  // Remove the printed expiry-date field by continuing the clean texture below it.
  context.drawImage(template, 850, 171, 160, 22, 850, 145, 160, 22);

  // Place the Roblox profile in the open left column beside the name fields.
  context.save();
  context.beginPath();
  context.arc(125, 200, 58, 0, Math.PI * 2);
  context.clip();
  context.drawImage(avatar, 67, 142, 116, 116);
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

  // Values sit directly below the corresponding labels on the two-sided template.
  drawValue(surname, 195, 142, 285, 13);
  drawValue(givenNames, 195, 186, 285, 13);
  drawValue(surname, 195, 229, 285, 13);
  drawValue(dateOfBirth, 194, 319, 150, 13);
  drawValue(gender, 361, 319, 95, 13);
  drawValue(citizenship, 617, 97, 170, 12);
  drawValue("Poznań RP", 542, 180, 280, 12);
  drawValue(issueDate, 855, 143, 145, 12);

  return canvas.toBuffer("image/png");
}

module.exports = { createFictionalRpCardImage };

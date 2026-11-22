const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const templatePath = path.join(__dirname, "..", "legitymacje.webp");

async function createWeaponPermitCardImage({ profile, fullName, birthDetails, address, weaponType, issuerName, issuedAt }) {
  const template = await loadImage(templatePath);
  const response = await fetch(profile.imageUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Nie udało się pobrać awatara Roblox (HTTP ${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 5 * 1024 * 1024) throw new Error("Pobrany awatar Roblox przekracza dozwolony rozmiar.");
  const avatar = await loadImage(buffer);
  const canvas = createCanvas(template.width, template.height);
  const context = canvas.getContext("2d");
  context.drawImage(template, 0, 0);

  const drawValue = (value, x, y, maxWidth, fontSize = 25, align = "left") => {
    context.save();
    context.fillStyle = "#17202a";
    context.font = `600 ${fontSize}px Arial`;
    context.textAlign = align;
    let text = String(value || "-");
    while (text.length > 1 && context.measureText(text).width > maxWidth) text = `${text.slice(0, -2)}…`;
    context.fillText(text, x, y, maxWidth);
    context.restore();
  };

  // Write the supplied RP application details into the template's labeled fields.
  drawValue(fullName, 320, 185, 375, 18);
  drawValue(birthDetails, 320, 267, 375, 18);
  drawValue(address, 320, 349, 375, 18);
  drawValue(weaponType, 320, 424, 375, 18);
  drawValue("Poznań RP", 320, 480, 375, 18);
  drawValue(issuedAt, 320, 541, 375, 18);
  // Keep the account ID below the template's printed label and above the seal.
  drawValue(profile.id, 845, 271, 180, 16, "center");

  // Put the Roblox portrait in the blank left column, separate from the printed seal and fields.
  context.save();
  context.beginPath();
  context.arc(175, 300, 78, 0, Math.PI * 2);
  context.clip();
  context.drawImage(avatar, 97, 222, 156, 156);
  context.restore();
  context.beginPath();
  context.arc(175, 300, 78, 0, Math.PI * 2);
  context.strokeStyle = "rgba(255,255,255,0.95)";
  context.lineWidth = 4;
  context.stroke();

  drawValue(profile.displayName || profile.username, 82, 514, 220, 15);
  drawValue(issuerName, 830, 603, 175, 15, "center");

  // Cover the preprinted placeholder and draw one readable RP card number.
  context.save();
  context.fillStyle = "#f5e8c9";
  context.beginPath();
  context.roundRect(378, 622, 268, 55, 8);
  context.fill();
  context.strokeStyle = "rgba(80,60,20,0.28)";
  context.lineWidth = 1.5;
  context.stroke();
  context.restore();
  drawValue(`LB ${String(profile.id).slice(-8).padStart(8, "0")}`, 512, 660, 250, 23, "center");

  // Make the roleplay-only status visible on the card itself.
  context.save();
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.fillRect(690, 130, 300, 36);
  context.fillStyle = "#9b1c1c";
  context.font = "700 16px Arial";
  context.textAlign = "center";
  context.fillText("DOKUMENT WYŁĄCZNIE DO ROLEPLAY", 840, 154, 290);
  context.restore();

  return canvas.toBuffer("image/png");
}

module.exports = { createWeaponPermitCardImage };

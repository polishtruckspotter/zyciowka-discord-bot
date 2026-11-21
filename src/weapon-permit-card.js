const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const templatePath = path.join(__dirname, "..", "Legitymacja broni Polonia RP.png");

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
  drawValue(fullName, 460, 258, 540);
  drawValue(birthDetails, 460, 376, 540);
  drawValue(address, 460, 486, 540);
  drawValue(weaponType, 460, 594, 540);
  drawValue("Polonia RP", 460, 678, 540);
  drawValue(issuedAt, 460, 754, 540);
  drawValue(profile.id, 1245, 356, 210, 23, "center");

  // The template's seal area becomes the permit holder's Roblox portrait.
  context.save();
  context.beginPath();
  context.arc(1208, 564, 106, 0, Math.PI * 2);
  context.clip();
  context.drawImage(avatar, 1102, 458, 212, 212);
  context.restore();
  context.beginPath();
  context.arc(1208, 564, 106, 0, Math.PI * 2);
  context.strokeStyle = "rgba(255,255,255,0.9)";
  context.lineWidth = 4;
  context.stroke();

  drawValue(profile.displayName || profile.username, 125, 701, 320, 21);
  drawValue(issuerName, 1195, 801, 250, 21, "center");
  drawValue(`RP-${profile.id}`, 735, 929, 400, 30, "center");

  // Make the roleplay-only status visible on the card itself.
  context.save();
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.fillRect(1035, 193, 390, 44);
  context.fillStyle = "#9b1c1c";
  context.font = "700 22px Arial";
  context.textAlign = "center";
  context.fillText("DOKUMENT WYŁĄCZNIE DO ROLEPLAY", 1230, 222, 380);
  context.restore();

  return canvas.toBuffer("image/png");
}

module.exports = { createWeaponPermitCardImage };

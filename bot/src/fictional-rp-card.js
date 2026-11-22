const { createCanvas, loadImage } = require("@napi-rs/canvas");

async function createFictionalRpCardImage({
  profile,
  surname,
  givenNames,
  dateOfBirth,
  gender,
  citizenship,
  issueDate,
}) {
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
  const canvas = createCanvas(1200, 700);
  const context = canvas.getContext("2d");
  const background = context.createLinearGradient(0, 0, 1200, 700);
  background.addColorStop(0, "#111827");
  background.addColorStop(1, "#312e81");
  context.fillStyle = background;
  context.fillRect(0, 0, 1200, 700);

  context.fillStyle = "rgba(255,255,255,0.06)";
  context.beginPath();
  context.arc(1120, 80, 190, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(250, 660, 240, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#a5b4fc";
  context.font = "700 30px Arial";
  context.fillText("POZNAŃ RP  /  KARTA POSTACI", 64, 72);
  context.fillStyle = "#fca5a5";
  context.font = "700 20px Arial";
  context.textAlign = "right";
  context.fillText("TYLKO ROLEPLAY", 1136, 72);
  context.textAlign = "left";

  context.fillStyle = "rgba(15, 23, 42, 0.78)";
  context.beginPath();
  context.roundRect(44, 104, 1112, 462, 28);
  context.fill();

  context.save();
  context.beginPath();
  context.arc(190, 288, 112, 0, Math.PI * 2);
  context.clip();
  context.drawImage(avatar, 78, 176, 224, 224);
  context.restore();

  context.fillStyle = "#ffffff";
  context.font = "700 24px Arial";
  context.textAlign = "center";
  context.fillText(`@${profile.username}`, 190, 442, 280);
  context.fillStyle = "#c7d2fe";
  context.font = "18px Arial";
  context.fillText(`Roblox ID: ${profile.id}`, 190, 474, 290);
  context.textAlign = "left";

  const drawField = (label, value, x, y, width) => {
    context.fillStyle = "#a5b4fc";
    context.font = "700 16px Arial";
    context.fillText(label.toLocaleUpperCase("pl-PL"), x, y);
    context.fillStyle = "#ffffff";
    context.font = "600 24px Arial";
    const words = String(value).split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > width) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    if (lines.length > 2) {
      lines.length = 2;
      let shortened = lines[1];
      while (shortened && context.measureText(`${shortened}…`).width > width) {
        shortened = shortened.slice(0, -1);
      }
      lines[1] = `${shortened}…`;
    }
    lines.forEach((text, index) => context.fillText(text, x, y + 34 + index * 28, width));
  };

  const fieldRows = [166, 266, 366, 466];
  [
    ["Imiona", givenNames],
    ["Nazwisko", surname],
    ["Data urodzenia", dateOfBirth],
    ["Płeć", gender],
  ].forEach(([label, value], index) => drawField(label, value, 360, fieldRows[index], 340));
  [
    ["Obywatelstwo / kraj", citizenship],
    ["Organ wydający", "Poznań RP"],
    ["Data wydania", issueDate],
    ["Konto Roblox", `@${profile.username}`],
  ].forEach(([label, value], index) => drawField(label, value, 760, fieldRows[index], 340));

  context.fillStyle = "#b91c1c";
  context.beginPath();
  context.roundRect(44, 584, 1112, 88, 20);
  context.fill();
  context.textAlign = "center";
  context.fillStyle = "#ffffff";
  context.font = "900 26px Arial";
  context.fillText("FIKCYJNA KARTA ROLEPLAY", 600, 620);
  context.font = "700 20px Arial";
  context.fillText("NIE JEST DOKUMENTEM TOŻSAMOŚCI", 600, 650);
  context.textAlign = "left";

  return canvas.toBuffer("image/png");
}

module.exports = { createFictionalRpCardImage };

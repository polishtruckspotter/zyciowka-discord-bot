require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ChannelType,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  MessageFlags,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { commands } = require("./commands");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});
const verificationChallenges = new Map();
const challengeLifetimeMs = 5 * 60 * 1000;
const waitingRoomPingCooldownMs = 30 * 1000;
const waitingRoomPingCooldowns = new Map();
const weaponPermitApplications = new Map();
const weaponPermitDecisionLocks = new Set();
const weaponPermitIdentityRequestLocks = new Set();
const botKickChannelQueues = new Map();
const weaponPermitApplicationTimeoutMs = 15 * 60 * 1000;
const roleChangeLogChannelId = "1555191573736591421";
const plusRequestChannelId = "1555191866151145635";
const weaponPermitPublicationChannelId = "1560304974716604537";
const vehicleRegistrationChannelId = "1560308533852115056";
const vehicleRegistrationInstructionsChannelId = "1560308627162800139";
const idCardSearchChannelId = "1560330309382316144";
const praiseLogChannelIds = {
  skarga: "1556261784304746556",
  pochwala: "1556261886037860403",
};
const weaponPermitQuestions = [
  { key: "Nick Roblox", prompt: "🎮 Nick Roblox:" },
  { key: "Nick Discord", prompt: "💬 Nick Discord:" },
  {
    key: "Rodzaj broni",
    prompt: "🔫 Jaki rodzaj broni wybierasz? Odpowiedz: Krótka, Długa albo 2 (2 oznacza oba rodzaje).",
  },
  {
    key: "Sytuacje użycia broni",
    prompt: "⚖️ W jakich sytuacjach możesz zgodnie z regulaminem serwera użyć broni?",
  },
  {
    key: "Reakcja na prowokację",
    prompt: "🚨 Co zrobisz, jeśli ktoś zacznie ci grozić lub prowokować cię do użycia broni?",
  },
  {
    key: "Przestrzeganie zasad",
    prompt: "📜 Czy zobowiązujesz się przestrzegać zasad dotyczących używania broni?",
  },
  {
    key: "Broń bez pozwolenia",
    prompt: "🛑 Co zrobisz, jeśli zauważysz osobę używającą broni bez pozwolenia?",
  },
  {
    key: "Ocena sytuacji",
    prompt: "🧠 Jak zachowasz się, gdy wyciągnięcie broni mogłoby pogorszyć twoją sytuację?",
  },
  {
    key: "Powód wniosku",
    prompt: "🔫 Dlaczego chcesz otrzymać pozwolenie na broń?",
  },
  {
    key: "Pojęcia RP",
    prompt: "📚 Co oznaczają pojęcia: FRP, RDM, GZ, EZ i NZ?",
  },
];
const webhookConfigPath = path.join(__dirname, "..", "data", "eh-webhook-config.json");
const announcementGifPath = path.join(__dirname, "..", "zyciowka-rp.gif");
const weaponPermitIdentityRequestsPath = path.join(
  __dirname,
  "..",
  "data",
  "weapon-permit-identity-requests.json",
);
const activityCheckParticipantsPath = path.join(
  __dirname,
  "..",
  "data",
  "activity-check-participants.json",
);
let activityCheckUpdateQueue = Promise.resolve();
let weaponPermitIdentityRequests = {};
let webhookConfigs = {};

function getMissingConfiguration(keys) {
  return keys.filter((key) => !process .env[key]);
}

async function handleWeaponPermitIdentityAnswer(message) {
  if (message.guild || message.author.bot) return false;
  const request = weaponPermitIdentityRequests[message.author.id];
  if (!request) return false;

  if (weaponPermitIdentityRequestLocks.has(message.author.id)) {
    await message.reply("Twoja odpowiedź jest już przetwarzana. Poczekaj chwilę.");
    return true;
  }
  weaponPermitIdentityRequestLocks.add(message.author.id);
  try {
    const profile = await getRobloxProfileFromIdentity(message.content);

    const guild = await client.guilds.fetch(request.guildId);
    const permitChannel = await guild.channels.fetch(weaponPermitPublicationChannelId);
    if (!permitChannel || permitChannel.type !== ChannelType.GuildText) {
      throw new Error(`Kanał publikacji pozwoleń ${weaponPermitPublicationChannelId} nie istnieje albo nie jest tekstowy.`);
    }

    const permitEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("Pozwolenie na broń")
      .setURL(`https://www.roblox.com/users/${profile.id}/profile`)
      .addFields(
        { name: "Członek Discord", value: `<@${message.author.id}>`, inline: true },
        {
          name: "Konto Roblox",
          value: `[@${profile.username}](https://www.roblox.com/users/${profile.id}/profile)`,
          inline: true,
        },
        {
          name: "ID Roblox",
          value: `[${profile.id}](https://www.roblox.com/users/${profile.id}/profile)`,
          inline: true,
        },
        { name: "Rodzaj broni", value: request.weaponType },
      )
      .setThumbnail(profile.imageUrl)
      .setTimestamp();
    await permitChannel.send({
      content: `<@${message.author.id}> Twoje pozwolenie na broń jest gotowe.`,
      embeds: [permitEmbed],
      allowedMentions: { parse: [], users: [message.author.id] },
    });
    await updateWeaponPermitIdentityRequests(async (requests) => {
      delete requests[message.author.id];
    });
    await message.reply("Dziękuję! Twoje pozwolenie na broń zostało opublikowane.");
    return true;
  } finally {
    weaponPermitIdentityRequestLocks.delete(message.author.id);
  }
}

async function getRobloxProfile(userId) {
  const userResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (userResponse.status === 404) {
    throw new Error("Nie znaleziono konta Roblox o podanym ID. Sprawdź, czy ID jest poprawne.");
  }
  if (!userResponse.ok) {
    throw new Error(`Roblox API zwróciło błąd podczas wyszukiwania konta (HTTP ${userResponse.status}).`);
  }

  const profile = await userResponse.json();
  if (
    !Number.isSafeInteger(profile.id) ||
    profile.id <= 0 ||
    typeof profile.name !== "string" ||
    !profile.name
  ) {
    throw new Error("Roblox API nie zwróciło prawidłowych danych konta dla podanego ID.");
  }

  const thumbnailResponse = await fetch(
    `https://thumbnails.roblox.com/v1/users/avatar?userIds=${encodeURIComponent(userId)}&size=420x420&format=Png&isCircular=false`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!thumbnailResponse.ok) {
    throw new Error(`Roblox API zwróciło błąd podczas pobierania awatara (HTTP ${thumbnailResponse.status}).`);
  }

  const thumbnail = await thumbnailResponse.json();
  const imageUrl = thumbnail.data?.[0]?.imageUrl;
  if (typeof imageUrl !== "string" || !imageUrl) {
    throw new Error("Roblox API nie zwróciło awatara dla tego konta.");
  }

  return { id: String(profile.id), username: profile.name, imageUrl };
}

async function getRobloxProfileByUsername(username) {
  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`Roblox API zwróciło błąd podczas wyszukiwania nazwy konta (HTTP ${response.status}).`);
  }

  const result = await response.json();
  const user = Array.isArray(result?.data) ? result.data[0] : null;
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new Error(`Nie znaleziono konta Roblox o nazwie „${username}”. Sprawdź nazwę i spróbuj ponownie.`);
  }

  return getRobloxProfile(String(user.id));
}

async function getRobloxProfileFromIdentity(identity) {
  const submittedIdentity = identity.trim();
  const username = submittedIdentity.startsWith("@")
    ? submittedIdentity.slice(1)
    : submittedIdentity;
  const isUsername = /^[A-Za-z0-9_]{3,20}$/.test(username);
  const isUserId = /^[1-9]\d{0,19}$/.test(submittedIdentity);
  if (
    (submittedIdentity.startsWith("@") && !isUsername) ||
    (!isUserId && !isUsername) ||
    (/^\d+$/.test(submittedIdentity) && !isUserId)
  ) {
    throw new Error("Podaj nazwę Roblox (np. @NazwaGracza) albo prawidłowe numeryczne ID Roblox.");
  }

  return isUserId
    ? getRobloxProfile(submittedIdentity)
    : getRobloxProfileByUsername(username);
}

function makeChallenge() {
  const operators = ["+", "-", "×"];
  const operator = operators[Math.floor(Math.random() * operators.length)];
  const left = Math.floor(Math.random() * 9) + 2;
  const right = Math.floor(Math.random() * 9) + 2;

  if (operator === "+") return { question: `${left} + ${right}`, answer: left + right };
  if (operator === "-") {
    const larger = Math.max(left, right);
    const smaller = Math.min(left, right);
    return { question: `${larger} - ${smaller}`, answer: larger - smaller };
  }
  return { question: `${left} × ${right}`, answer: left * right };
}

function challengeKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

async function loadWebhookConfigs() {
  try {
    const contents = await fs.readFile(webhookConfigPath, "utf8");
    const parsed = JSON.parse(contents);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Plik konfiguracji webhooków musi zawierać obiekt JSON.");
    }
    webhookConfigs = parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
      webhookConfigs = {};
      return;
    }
    throw error;
  }
}

async function updateWebhookConfig(guildId, updates) {
  const next = {
    ...webhookConfigs,
    [guildId]: {
      ...webhookConfigs[guildId],
      ...updates,
    },
  };
  await fs.mkdir(path.dirname(webhookConfigPath), { recursive: true });
  const temporaryPath = `${webhookConfigPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, webhookConfigPath);
  webhookConfigs = next;
}

async function loadWeaponPermitIdentityRequests() {
  try {
    const contents = await fs.readFile(weaponPermitIdentityRequestsPath, "utf8");
    const parsed = JSON.parse(contents);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !Object.values(parsed).every(
        (request) =>
          request &&
          typeof request.guildId === "string" &&
          typeof request.weaponType === "string",
      )
    ) {
      throw new Error("Plik oczekujących danych Roblox do pozwolenia musi zawierać obiekt JSON.");
    }
    weaponPermitIdentityRequests = parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
      weaponPermitIdentityRequests = {};
      return;
    }
    throw error;
  }
}

async function updateWeaponPermitIdentityRequests(update) {
  const next = { ...weaponPermitIdentityRequests };
  await update(next);
  await fs.mkdir(path.dirname(weaponPermitIdentityRequestsPath), { recursive: true });
  const temporaryPath = `${weaponPermitIdentityRequestsPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, weaponPermitIdentityRequestsPath);
  weaponPermitIdentityRequests = next;
}

async function updateActivityCheckParticipants(update) {
  const pendingUpdate = activityCheckUpdateQueue.catch(() => {}).then(update);
  activityCheckUpdateQueue = pendingUpdate;
  return pendingUpdate;
}

async function loadActivityCheckParticipants() {
  try {
    const contents = await fs.readFile(activityCheckParticipantsPath, "utf8");
    const parsed = JSON.parse(contents);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Plik uczestników checków aktywności musi zawierać obiekt JSON.");
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function saveActivityCheckParticipants(participantsByMessage) {
  await fs.mkdir(path.dirname(activityCheckParticipantsPath), { recursive: true });
  const temporaryPath = `${activityCheckParticipantsPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(participantsByMessage, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, activityCheckParticipantsPath);
}

function formatActivityCheckParticipants(participants) {
  if (participants.length === 0) {
    return "Nikt jeszcze nie potwierdził udziału.";
  }

  const names = participants.map(({ displayName }) => `• ${displayName.replace(/[\r\n]/g, " ")}`);
  let list = "";
  for (let index = 0; index < names.length; index += 1) {
    const remaining = names.length - index - 1;
    const suffix = remaining > 0 ? `\n… i jeszcze ${remaining}` : "";
    if (`${list}${list ? "\n" : ""}${names[index]}${suffix}`.length > 1024) {
      return `${list}\n… i jeszcze ${participants.length - index}`;
    }
    list += `${list ? "\n" : ""}${names[index]}`;
  }
  return list;
}

function canSubmitModerationLog(interaction) {
  const permissions = interaction.memberPermissions;
  return [
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
  ].some((permission) => permissions?.has(permission));
}

function canPublishAnnouncement(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function clearWeaponPermitApplication(userId) {
  const application = weaponPermitApplications.get(userId);
  if (application) clearTimeout(application.timeout);
  weaponPermitApplications.delete(userId);
}

function makeWeaponPermitReviewRow(userId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`weapon-permit:approve:${userId}`)
      .setLabel("Zaakceptuj")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`weapon-permit:reject:${userId}`)
      .setLabel("Odrzuć")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

function makeLeaveReviewRow(userId, status) {
  const pending = status === "Oczekuje na akceptację";
  const active = status === "Urlop zaakceptowany";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`leave:accept:${userId}`)
      .setLabel("Zaakceptuj urlop")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!pending),
    new ButtonBuilder()
      .setCustomId(`leave:end:${userId}`)
      .setLabel("Zakończ urlop")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!active),
    new ButtonBuilder()
      .setCustomId(`leave:end-reason:${userId}`)
      .setLabel("Zakończ z powodem")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!active),
  );
}

function isLeaveReviewMessage(interaction, userId, message = interaction.message) {
  const embed = message.embeds[0];
  return Boolean(
    userId &&
    message.author.id === client.user.id &&
    embed?.footer?.text === `urlop:${interaction.guildId}:${userId}`,
  );
}

async function sendWeaponPermitQuestion(application) {
  const question = weaponPermitQuestions[application.answers.length];
  await application.user.send({
    content: `${question.prompt}\n\nOdpowiedz na tę wiadomość. Wpisz „anuluj”, aby przerwać wniosek. Pozostały czas: 15 minut.`,
    allowedMentions: { parse: [] },
  });
}

async function submitWeaponPermitApplication(application) {
  const guild = await client.guilds.fetch(application.guildId);
  const reviewChannel = await guild.channels.fetch(application.reviewChannelId);
  if (!reviewChannel?.isTextBased() || reviewChannel.type !== ChannelType.GuildText) {
    throw new Error(`Kanał wniosków ${application.reviewChannelId} nie istnieje albo nie jest tekstowy.`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Wniosek o pozwolenie na broń")
    .setDescription(`Wnioskodawca: <@${application.user.id}>`)
    .addFields(
      ...weaponPermitQuestions.map((question, index) => ({
        name: question.key,
        value: application.answers[index],
        inline: false,
      })),
      { name: "Status wniosku", value: "Oczekuje na decyzję personelu", inline: false },
    )
    .setFooter({ text: `weapon-permit:${application.guildId}:${application.user.id}` })
    .setTimestamp();

  await reviewChannel.send({
    embeds: [embed],
    components: [makeWeaponPermitReviewRow(application.user.id)],
    allowedMentions: { parse: [] },
  });
}

async function handleWeaponPermitAnswer(message) {
  if (message.guild || message.author.bot) return;
  const application = weaponPermitApplications.get(message.author.id);
  if (!application || application.processing) return;
  application.processing = true;

  const answer = message.content.trim();
  if (!answer) {
    await message.reply("Odpowiedź nie może być pusta. Odpowiedz na bieżące pytanie.");
    application.processing = false;
    return;
  }
  if (answer.length > 400) {
    await message.reply("Odpowiedź jest za długa. Skróć ją do maksymalnie 400 znaków i spróbuj ponownie.");
    application.processing = false;
    return;
  }
  if (answer.toLocaleLowerCase("pl") === "anuluj") {
    clearWeaponPermitApplication(message.author.id);
    await message.reply("Wniosek o pozwolenie na broń został anulowany.");
    return;
  }

  const currentQuestion = weaponPermitQuestions[application.answers.length];
  const normalizedAnswer = answer.toLocaleLowerCase("pl");
  application.answers.push(
    currentQuestion.key === "Rodzaj broni"
      ? normalizedAnswer === "2"
        ? "Oba rodzaje (krótka i długa)"
        : ["krótka", "krotka"].includes(normalizedAnswer)
          ? "Krótka"
          : ["długa", "dluga"].includes(normalizedAnswer)
            ? "Długa"
            : answer
      : answer,
  );
  if (
    currentQuestion.key === "Rodzaj broni" &&
    !["krótka", "krotka", "długa", "dluga", "2"].includes(normalizedAnswer)
  ) {
    application.answers.pop();
    await message.reply("Wpisz „Krótka”, „Długa” albo „2” (2 oznacza oba rodzaje).");
    application.processing = false;
    return;
  }

  if (application.answers.length < weaponPermitQuestions.length) {
    try {
      await sendWeaponPermitQuestion(application);
      application.processing = false;
    } catch (error) {
      clearWeaponPermitApplication(message.author.id);
      throw error;
    }
    return;
  }

  try {
    await submitWeaponPermitApplication(application);
    clearWeaponPermitApplication(message.author.id);
    await message.reply("Dziękujemy! Twój wniosek został przekazany personelowi do rozpatrzenia.");
  } catch (error) {
    clearWeaponPermitApplication(message.author.id);
    throw error;
  }
}

function getEmbedField(embed, name) {
  return embed?.fields?.find((field) => field.name === name)?.value ?? "";
}

function limitField(value, maxLength = 1024) {
  return String(value || "Nie podano").slice(0, maxLength);
}

function normalizeLogText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl");
}

function getWebhookLogText(message) {
  const parts = [];
  if (message.content) parts.push(message.content);

  for (const embed of message.embeds) {
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);
    for (const field of embed.fields) {
      parts.push(`${field.name}: ${field.value}`);
    }
  }

  return parts.join("\n").trim();
}

function getWebhookValue(message, labels) {
  const normalizedLabels = labels.map(normalizeLogText);
  for (const embed of message.embeds) {
    for (const field of embed.fields) {
      const name = normalizeLogText(field.name);
      if (normalizedLabels.some((label) => name.includes(label))) {
        return field.value.trim();
      }
    }
  }

  const text = [
    message.content ?? "",
    ...message.embeds.map((embed) => embed.description ?? ""),
  ].join("\n");
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const label = normalizeLogText(line.slice(0, separator).trim());
    if (normalizedLabels.some((candidate) => label.includes(candidate))) {
      return line.slice(separator + 1).trim();
    }
  }

  return "";
}

function classifyWebhookLog(text) {
  const normalized = normalizeLogText(text);
  if (/\b(ban|banned|baned|perma ?ban|temp ?ban|temporary ban|zbanowan\w*|ban czasow\w*)\b/.test(normalized)) {
    return "ban";
  }
  if (/\b(kick|kicked|wyrzuc\w*)\b/.test(normalized)) {
    return "kick";
  }
  return "other";
}

function makeBanEditRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("eh-ban-edit")
      .setLabel("Edytuj bana")
      .setStyle(ButtonStyle.Secondary),
  );
}

function makeKickEditRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("eh-kick-edit")
      .setLabel("Edytuj kicka")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildRobloxBanEmbed({ playerName, duration, reason, appealable, staff, editedBy, originalLog }) {
  const embed = new EmbedBuilder()
    .setColor(0xe00020)
    .setTitle("Nowy ban Roblox:")
    .addFields(
      { name: "Kto wystawił", value: limitField(staff) },
      { name: "Nick zbanowanego", value: limitField(playerName, 80) },
      { name: "Czas bana", value: limitField(duration, 80) },
      { name: "Powód", value: limitField(reason, 500) },
      { name: "Odwołanie", value: limitField(appealable, 80) },
    )
    .setFooter({ text: "Polonia RP × Bany Emergency Hamburg" })
    .setTimestamp();

  if (originalLog) {
    embed.setDescription(originalLog.slice(0, 4000));
  }
  if (editedBy) {
    embed.addFields({ name: "Ostatnia edycja", value: limitField(editedBy) });
  }

  return embed;
}

async function deleteRecentBotKickChannelMessages(channel) {
  const cutoff = Date.now() - 5 * 60 * 1000;
  let before;

  while (true) {
    const messages = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });
    if (messages.size === 0) return;

    const recentMessages = messages.filter(
      (candidate) =>
        candidate.createdTimestamp >= cutoff &&
        !(
          candidate.author.id === client.user?.id &&
          candidate.embeds.some((embed) => embed.title === "Kanał do zgłaszania zhakowanych kont")
        ),
    );
    if (recentMessages.size > 0) {
      if (recentMessages.size === 1) {
        await recentMessages.first().delete();
      } else {
        await channel.bulkDelete(recentMessages, true);
      }
    }

    const oldestMessage = messages.last();
    if (!oldestMessage || oldestMessage.createdTimestamp < cutoff || messages.size < 100) return;
    before = oldestMessage.id;
  }
}

async function handleBotKickChannelMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId) return;
  if (message.channel.type !== ChannelType.GuildText) return;

  const config = webhookConfigs[message.guild.id];
  if (message.channelId !== config?.botKickChannelId) return;

  const previous = botKickChannelQueues.get(message.channelId) ?? Promise.resolve();
  const current = previous.then(
    () => processBotKickChannelMessage(message),
    () => processBotKickChannelMessage(message),
  );
  botKickChannelQueues.set(message.channelId, current);
  try {
    await current;
  } finally {
    if (botKickChannelQueues.get(message.channelId) === current) {
      botKickChannelQueues.delete(message.channelId);
    }
  }
}

async function processBotKickChannelMessage(message) {
  const errors = [];
  try {
    await deleteRecentBotKickChannelMessages(message.channel);
  } catch (error) {
    errors.push(error);
  }

  try {
    const member = await message.guild.members.fetch(message.author.id);
    await member.kick("Automatyczne wyrzucenie za wysłanie wiadomości na kanale do zgłaszania zhakowanych kont.");
    console.info(
      `[bot kick] Wyrzucono ${message.author.tag} (${message.author.id}) z serwera ${message.guild.name} (${message.guild.id}) po wiadomości na ${message.channel}.`,
    );
  } catch (error) {
    errors.push(error);
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `Nie udało się w pełni obsłużyć automatycznego wyrzucenia użytkownika ${message.author.id} na serwerze ${message.guild.id}.`,
    );
  }
}

async function sendModerationLog(interaction, title, target, reason, extra = {}) {
  const entry = {
    guild: interaction.guild.name,
    action: title,
    target: target?.tag ?? target?.toString() ?? "brak",
    moderator: interaction.user.tag,
    reason: reason || "Nie podano",
  };
  console.info("[moderacja]", JSON.stringify({ ...entry, ...extra }));

  const channelId = process.env.MOD_LOG_CHANNEL_ID;
  if (!channelId) return;

  const channel = await interaction.guild.channels.fetch(channelId);
  if (!channel?.isTextBased() || !channel.send) {
    throw new Error("MOD_LOG_CHANNEL_ID nie wskazuje kanału tekstowego.");
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .addFields(
      { name: "Użytkownik", value: target ? `${target} (${target.tag ?? target.id})` : "—" },
      { name: "Moderator", value: `${interaction.user} (${interaction.user.tag})` },
      { name: "Powód", value: reason || "Nie podano" },
    )
    .setTimestamp();

  if (extra.description) {
    embed.addFields({ name: "Szczegóły", value: extra.description });
  }

  await channel.send({ embeds: [embed] });
}

async function handleGameWebhookMessage(message) {
  if (!message.guildId || !message.webhookId) return;
  const config = webhookConfigs[message.guildId];
  if (!config || message.channelId !== config.sourceChannelId) return;

  const logText = getWebhookLogText(message);
  if (!logText) {
    console.warn(`[game webhook] Pusty log webhooka ${message.webhookId} w kanale ${message.channelId}.`);
    return;
  }

  const action = classifyWebhookLog(logText);
  const destinationId = action === "ban" || action === "kick"
    ? config.banKickChannelId
    : config.otherChannelId;
  if (!destinationId) {
    console.warn(`[game webhook] Brak skonfigurowanego kanału docelowego dla zdarzenia „${action}” w serwerze ${message.guildId}.`);
    return;
  }

  const destination = await message.guild.channels.fetch(destinationId);
  if (!destination?.isTextBased() || destination.type !== ChannelType.GuildText) {
    throw new Error(`Skonfigurowany kanał docelowy ${destinationId} nie istnieje albo nie jest tekstowy.`);
  }

  if (action === "ban") {
    const playerName =
      getWebhookValue(message, ["nick zbanowanego", "zbanowany gracz", "gracz", "player", "username"]) ||
      "Sprawdź oryginalny log";
    const duration =
      getWebhookValue(message, ["czas bana", "czas trwania", "duration", "ban length"]) ||
      "Nie podano";
    const reason = getWebhookValue(message, ["powod", "reason"]) || "Nie podano";
    const appealInput = normalizeLogText(getWebhookValue(message, ["odwolanie", "appeal", "appealable"]));
    const appealable = ["tak", "yes", "true"].includes(appealInput)
      ? "tak"
      : ["nie", "no", "false"].includes(appealInput)
        ? "nie"
        : "Nie podano";
    const staff =
      getWebhookValue(message, ["kto wystawil", "staff", "moderator", "admin"]) ||
      message.author.username;
    const embed = buildRobloxBanEmbed({
      playerName,
      duration,
      reason,
      appealable,
      staff,
      originalLog: logText,
    });
    await destination.send({
      embeds: [embed],
      components: [makeBanEditRow()],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const title = action === "kick"
    ? "Wyrzucenie gracza — Emergency Hamburg"
    : "Log Emergency Hamburg";
  const embed = new EmbedBuilder()
    .setColor(action === "kick" ? 0xf1c40f : 0x5865f2)
    .setTitle(title)
    .setDescription(logText.slice(0, 4000))
    .addFields(
      ...(action === "kick"
        ? [
            {
              name: "Powód wyrzucenia",
              value: getWebhookValue(message, ["powod", "reason"]) || "Nie podano",
            },
          ]
        : []),
      { name: "Webhook źródłowy", value: message.author.username.slice(0, 256) },
    )
    .setFooter({ text: "Polonia RP × Emergency Hamburg" })
    .setTimestamp(message.createdAt);
  await destination.send({
    embeds: [embed],
    ...(action === "kick" ? { components: [makeKickEditRow()] } : {}),
    allowedMentions: { parse: [] },
  });
}

async function getModerationTarget(interaction, user) {
  const guild = interaction.guild;
  const moderator = await guild.members.fetch(interaction.user.id);
  const target = await guild.members.fetch(user.id);
  const botMember = await guild.members.fetchMe();

  if (target.id === guild.ownerId) {
    throw new Error("Nie można moderować właściciela serwera.");
  }
  if (
    moderator.id !== guild.ownerId &&
    moderator.roles.highest.comparePositionTo(target.roles.highest) <= 0
  ) {
    throw new Error("Możesz moderować tylko osoby z niższą rolą niż Twoja.");
  }
  if (botMember.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    throw new Error("Przenieś najwyższą rolę bota wyżej niż rolę tej osoby.");
  }

  return target;
}

async function findUserRecordMessages(channel, userId, recordType) {
  const maxScannedMessages = 5000;
  const maxResults = 10;
  const matches = [];
  let scanned = 0;
  let before;

  while (scanned < maxScannedMessages && matches.length < maxResults) {
    const messages = await channel.messages.fetch({
      limit: Math.min(100, maxScannedMessages - scanned),
      ...(before ? { before } : {}),
    });
    if (messages.size === 0) {
      return { matches, scanned, reachedScanLimit: false };
    }

    for (const message of messages.values()) {
      if (message.author.id !== client.user.id) continue;
      const embeds = message.embeds;
      const fields = embeds.flatMap((embed) => embed.fields);
      const hasUserField = (name) =>
        fields.some(
          (field) =>
            field.name === name &&
            (field.value === `<@${userId}>` || field.value === `<@!${userId}>`),
        );
      const mentionsUser =
        message.content.includes(`<@${userId}>`) ||
        message.content.includes(`<@!${userId}>`);
      const isMatch =
        recordType === "vehicle"
          ? embeds.some((embed) => embed.title === "Rejestracja pojazdu") &&
            (hasUserField("Właściciel") || mentionsUser)
          : recordType === "weapon-permit"
            ? embeds.some((embed) => embed.title === "Pozwolenie na broń") &&
              (hasUserField("Członek Discord") || mentionsUser)
            : embeds.some(
                (embed) =>
                  embed.title?.startsWith("Dowód osobisty -") &&
                  (hasUserField("Użytkownik Discord") || mentionsUser),
              );

      if (isMatch) matches.push(message);
      if (matches.length >= maxResults) break;
    }

    scanned += messages.size;
    before = messages.last()?.id;
    if (!before || messages.size < 100) {
      return { matches, scanned, reachedScanLimit: false };
    }
  }

  return {
    matches,
    scanned,
    reachedScanLimit: scanned >= maxScannedMessages,
  };
}

async function handleCommand(interaction) {
  if (interaction.commandName === "znajdz") {
    const recordType = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user", true);
    const channelId = recordType === "dowod"
      ? webhookConfigs[interaction.guildId]?.idCardChannelId ?? idCardSearchChannelId
      : {
          pojazd: vehicleRegistrationChannelId,
          "pozwolenie-na-bron": weaponPermitPublicationChannelId,
        }[recordType];
    if (!channelId) {
      throw new Error("Nieznany rodzaj rekordu do wyszukania.");
    }

    await interaction.deferReply({ ephemeral: true });
    const channel = await interaction.guild.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(`Kanał do wyszukiwania rekordu (${channelId}) nie istnieje albo nie jest tekstowy.`);
    }

    const { matches, scanned, reachedScanLimit } = await findUserRecordMessages(
      channel,
      user.id,
      recordType === "pojazd"
        ? "vehicle"
        : recordType === "dowod"
          ? "id-card"
          : "weapon-permit",
    );
    if (matches.length === 0) {
      await interaction.editReply(
        {
          content: reachedScanLimit
            ? `Nie znaleziono rekordu dla ${user} w ostatnich ${scanned} wiadomościach na ${channel}. Starsze wpisy nie zostały przeszukane.`
            : `Nie znaleziono rekordu dla ${user} na ${channel}.`,
          allowedMentions: { parse: [] },
        },
      );
      return;
    }

    await interaction.editReply({
      content: [
        `Znaleziono ${matches.length} rekordów dla ${user} na ${channel}:`,
        ...matches.map((message) => `• [${message.createdAt.toLocaleString("pl-PL")}](${message.url})`),
        "Pokazano maksymalnie 10 najnowszych wyników.",
        ...(reachedScanLimit ? [`Przeszukano ostatnie ${scanned} wiadomości; starsze wpisy nie zostały sprawdzone.`] : []),
      ].join("\n"),
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (interaction.commandName === "zarejestruj") {
    const subcommand = interaction.options.getSubcommand();
    const botMember = await interaction.guild.members.fetchMe();

    if (subcommand === "instrukcja") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: "Tylko administrator serwera może opublikować instrukcję rejestracji pojazdu.",
          ephemeral: true,
        });
        return;
      }

      const instructionsChannel = await interaction.guild.channels.fetch(
        vehicleRegistrationInstructionsChannelId,
      );
      if (!instructionsChannel || instructionsChannel.type !== ChannelType.GuildText) {
        throw new Error(
          `Kanał instrukcji ${vehicleRegistrationInstructionsChannelId} nie istnieje albo nie jest tekstowy.`,
        );
      }
      const requiredPermissions =
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.EmbedLinks;
      if (!botMember.permissionsIn(instructionsChannel).has(requiredPermissions)) {
        throw new Error(
          `Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków na ${instructionsChannel}.`,
        );
      }

      const instructionsEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("Jak zarejestrować pojazd?")
        .setDescription(
          [
            "Użyj komendy `/zarejestruj pojazd` i uzupełnij wszystkie wymagane pola:",
            "• **Marka** — marka pojazdu",
            "• **Model** — model pojazdu",
            "• **Kolor** — kolor pojazdu",
            "• **Tablice** — numer rejestracyjny",
            "• **Właściciel** — wybierz użytkownika Discord",
            "• **Zdjęcie** — załącz zdjęcie pojazdu",
            "",
            "Bot opublikuje kartę pojazdu na kanale rejestracji i oznaczy wybranego właściciela.",
          ].join("\n"),
        )
        .setFooter({ text: "Rejestracja pojazdów — Polonia RP" });
      await instructionsChannel.send({
        embeds: [instructionsEmbed],
        allowedMentions: { parse: [] },
      });
      await interaction.reply({
        content: `Instrukcję rejestracji pojazdu opublikowano na ${instructionsChannel}.`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === "pojazd") {
      const brand = interaction.options.getString("marka", true).trim();
      const model = interaction.options.getString("model", true).trim();
      const color = interaction.options.getString("kolor", true).trim();
      const plates = interaction.options.getString("tablice", true).trim();
      const owner = interaction.options.getUser("wlasciciel", true);
      const image = interaction.options.getAttachment("zdjecie", true);

      if (![brand, model, color, plates].every(Boolean)) {
        await interaction.reply({
          content: "Marka, model, kolor i tablice nie mogą być puste.",
          ephemeral: true,
        });
        return;
      }
      if (!image.contentType?.startsWith("image/")) {
        await interaction.reply({
          content: "Załącznik musi być plikiem graficznym.",
          ephemeral: true,
        });
        return;
      }

      const registrationChannel = await interaction.guild.channels.fetch(
        vehicleRegistrationChannelId,
      );
      if (!registrationChannel || registrationChannel.type !== ChannelType.GuildText) {
        throw new Error(
          `Kanał rejestracji pojazdów ${vehicleRegistrationChannelId} nie istnieje albo nie jest tekstowy.`,
        );
      }
      const requiredPermissions =
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.EmbedLinks;
      if (!botMember.permissionsIn(registrationChannel).has(requiredPermissions)) {
        throw new Error(
          `Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków na ${registrationChannel}.`,
        );
      }

      const vehicleEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Rejestracja pojazdu")
        .addFields(
          { name: "Marka", value: brand, inline: true },
          { name: "Model", value: model, inline: true },
          { name: "Kolor", value: color, inline: true },
          { name: "Tablice", value: plates, inline: true },
          { name: "Właściciel", value: `<@${owner.id}>`, inline: true },
          { name: "Zarejestrował(a)", value: `<@${interaction.user.id}>`, inline: true },
        )
        .setImage(image.url)
        .setTimestamp();
      await registrationChannel.send({
        content: `<@${owner.id}> zarejestrowano Twój pojazd.`,
        embeds: [vehicleEmbed],
        allowedMentions: { parse: [], users: [owner.id] },
      });
      await interaction.reply({
        content: `Pojazd został zarejestrowany i opublikowany na ${registrationChannel}.`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }
  }

  if (
    interaction.commandName === "bot" &&
    interaction.options.getSubcommand() === "kick"
  ) {
    const channel = interaction.options.getChannel("kanal", true);
    const botMember = await interaction.guild.members.fetchMe();
    const requiredChannelPermissions =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks |
      PermissionFlagsBits.ManageMessages;

    if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
      await interaction.reply({
        content: "Bot potrzebuje uprawnienia Wyrzucanie członków, aby aktywować tę funkcję.",
        ephemeral: true,
      });
      return;
    }
    if (!botMember.permissionsIn(channel).has(requiredChannelPermissions)) {
      await interaction.reply({
        content: `Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości, Osadzanie linków i Zarządzanie wiadomościami na ${channel}.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("Kanał do zgłaszania zhakowanych kont")
      .setDescription(
        "Ten kanał służy do zgłaszania zhakowanych kont. Każda wysłana tu wiadomość spowoduje automatyczne wyrzucenie jej autora z serwera oraz usunięcie wszystkich wiadomości z tego kanału z ostatnich 5 minut.",
      );
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await updateWebhookConfig(interaction.guildId, {
      botKickChannelId: channel.id,
    });
    await interaction.reply({
      content: `Automatyczne wyrzucanie skonfigurowano na ${channel}. Każda wiadomość spowoduje wyrzucenie jej autora i usunięcie wiadomości z kanału z ostatnich 5 minut.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (
    interaction.commandName === "aktywnosc" &&
    interaction.options.getSubcommandGroup() === "check" &&
    interaction.options.getSubcommand() === "setup"
  ) {
    const panelChannel = interaction.options.getChannel("kanal-panelu", true);
    const checkChannel = interaction.options.getChannel("kanal-checku", true);
    const roleToPing = interaction.options.getRole("rola-do-pingowania", true);
    const allowedRoleIds = Array.from({ length: 22 }, (_, index) =>
      interaction.options.getRole(index === 0 ? "rola-uprawniona" : `rola-uprawniona-${index + 1}`),
    )
      .filter(Boolean)
      .map((role) => role.id);
    const botMember = await interaction.guild.members.fetchMe();
    const panelPermissions = botMember.permissionsIn(panelChannel);
    const checkPermissions = botMember.permissionsIn(checkChannel);
    const panelRequiredPermissions =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks;
    const checkRequiredPermissions =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks;

    if (roleToPing.id === interaction.guildId) {
      await interaction.reply({
        content: "Nie można użyć roli @everyone do pingowania checku aktywności. Wybierz konkretną rolę.",
        ephemeral: true,
      });
      return;
    }
    if (!panelPermissions.has(panelRequiredPermissions)) {
      await interaction.reply({
        content: `Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków na ${panelChannel}.`,
        ephemeral: true,
      });
      return;
    }
    if (!checkPermissions.has(checkRequiredPermissions)) {
      await interaction.reply({
        content: `Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków na ${checkChannel}.`,
        ephemeral: true,
      });
      return;
    }
    if (!roleToPing.mentionable && !checkPermissions.has(PermissionFlagsBits.MentionEveryone)) {
      await interaction.reply({
        content: `Nie można pingować roli ${roleToPing}. Włącz opcję „Może być wspomniana” dla tej roli albo nadaj botowi uprawnienie wspominania ról na ${checkChannel}.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Check aktywności")
      .setDescription("Kliknij przycisk poniżej, aby rozpocząć check aktywności.")
      .setFooter({ text: `activity-check:${interaction.guildId}` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("activity-check:publish")
        .setLabel("Rozpocznij check aktywności")
        .setStyle(ButtonStyle.Primary),
    );

    await panelChannel.send({ embeds: [embed], components: [row] });
    await updateWebhookConfig(interaction.guildId, {
      activityCheckPanelChannelId: panelChannel.id,
      activityCheckChannelId: checkChannel.id,
      activityCheckRoleId: roleToPing.id,
      activityCheckAllowedRoleIds: allowedRoleIds,
    });
    await interaction.reply({
      content: `Panel checku aktywności opublikowano na ${panelChannel}. Checki będą wysyłane na ${checkChannel}, pingując ${roleToPing}.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (interaction.commandName === "urlop") {
    const reviewChannel = interaction.options.getChannel("kanal-wnioskow", true);
    const modal = new ModalBuilder()
      .setCustomId(`leave:submit:${reviewChannel.id}`)
      .setTitle("Wniosek o urlop");
    const duration = new TextInputBuilder()
      .setCustomId("duration")
      .setLabel("Na jak długo chcesz wziąć urlop?")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);
    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Z jakiego powodu potrzebujesz urlopu?")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setRequired(true);
    const details = new TextInputBuilder()
      .setCustomId("details")
      .setLabel("Dodatkowe informacje (opcjonalnie)")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(500)
      .setRequired(false);
    modal.addComponents(
      new ActionRowBuilder().addComponents(duration),
      new ActionRowBuilder().addComponents(reason),
      new ActionRowBuilder().addComponents(details),
    );
    await interaction.showModal(modal);
    return;
  }

  if (interaction.commandName === "setup-ping-poczekalnia") {
    const voiceChannel = interaction.options.getChannel("kanal-glosowy", true);
    const role = interaction.options.getRole("rola-do-pingowania", true);
    const destination = interaction.options.getChannel("kanal-pingow", true);
    const botMember = await interaction.guild.members.fetchMe();

    if (role.id === interaction.guild.id || role.managed || botMember.roles.highest.comparePositionTo(role) <= 0) {
      await interaction.reply({
        content: "Bot nie może pingować tej roli. Wybierz zwykłą rolę i ustaw najwyższą rolę bota wyżej.",
        ephemeral: true,
      });
      return;
    }

    const permissions = botMember.permissionsIn(destination);
    const requiredPermissions =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages;
    if (!permissions.has(requiredPermissions)) {
      await interaction.reply({
        content: `Bot potrzebuje uprawnień Wyświetlanie kanału i Wysyłanie wiadomości na ${destination}.`,
        ephemeral: true,
      });
      return;
    }
    if (!role.mentionable && !permissions.has(PermissionFlagsBits.MentionEveryone)) {
      await interaction.reply({
        content: `Nie można pingować roli ${role}: włącz opcję „Może być wspomniana” dla tej roli albo nadaj botowi uprawnienie Wspominanie @everyone, @here i wszystkich ról na ${destination}.`,
        ephemeral: true,
      });
      return;
    }

    await updateWebhookConfig(interaction.guildId, {
      waitingRoomVoiceChannelId: voiceChannel.id,
      waitingRoomRoleId: role.id,
      waitingRoomTextChannelId: destination.id,
    });
    await interaction.reply({
      content: `Poczekalnia skonfigurowana: po wejściu do ${voiceChannel} bot pingnie ${role} na ${destination}.`,
      ephemeral: true,
      allowedMentions: { parse: [], roles: [role.id] },
    });
    return;
  }

  if (interaction.commandName === "setup-weryfikacja") {
    const channel = interaction.options.getChannel("kanal", true);
    const rolesToGive = [
      interaction.options.getRole("rola-do-nadania", true),
      interaction.options.getRole("rola-do-nadania-2", true),
    ];
    const roleToRemove = interaction.options.getRole("rola-do-zabrania", true);
    if (channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "Wybierz zwykły kanał tekstowy na panel weryfikacji.",
        ephemeral: true,
      });
      return;
    }
    if (new Set([...rolesToGive, roleToRemove].map((role) => role.id)).size !== 3) {
      await interaction.reply({
        content: "Wybierz trzy różne role: dwie do nadania i jedną do zabrania.",
        ephemeral: true,
      });
      return;
    }

    const botMember = await interaction.guild.members.fetchMe();
    const unmanageableRole = [...rolesToGive, roleToRemove].find(
      (role) =>
        role.id === interaction.guild.id ||
        role.managed ||
        botMember.roles.highest.comparePositionTo(role) <= 0,
    );
    if (unmanageableRole) {
      await interaction.reply({
        content: `Bot nie może zarządzać rolą ${unmanageableRole}. Ustaw jego najwyższą rolę wyżej niż obie role i sprawdź, czy nie są zarządzane przez integrację.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("Weryfikacja — Polonia RP")
      .setDescription(
        `Kliknij przycisk poniżej i rozwiąż krótkie działanie matematyczne.\nPo poprawnej odpowiedzi otrzymasz role ${rolesToGive.join(" i ")}, a rola ${roleToRemove} zostanie zabrana.`,
      )
      .setFooter({ text: "Weryfikacja dotyczy dostępu do Discorda, nie potwierdza konta w grze Emergency Hamburg." });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`verify-player:${rolesToGive.map((role) => role.id).join(":")}:${roleToRemove.id}`)
        .setLabel("Zweryfikuj się")
        .setStyle(ButtonStyle.Success),
    );

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({
      content: `Panel weryfikacji opublikowano na kanale ${channel}. Po weryfikacji bot nada role ${rolesToGive.join(" i ")} i zabierze ${roleToRemove}.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "setup-ogloszenia") {
    const destination = interaction.options.getChannel("kanal-ogloszen", true);
    const roleToPing = interaction.options.getRole("rola-do-pingowania");
    if (destination.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "Wybierz zwykły kanał tekstowy na ogłoszenia.",
        ephemeral: true,
      });
      return;
    }

    const botMember = await interaction.guild.members.fetchMe();
    const destinationPermissions = botMember.permissionsIn(destination);
    const requiredPermissions =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks |
      PermissionFlagsBits.AttachFiles;
    if (!destinationPermissions.has(requiredPermissions)) {
      await interaction.reply({
        content: `Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości, Osadzanie linków i Załączanie plików na ${destination}.`,
        ephemeral: true,
      });
      return;
    }
    if (
      roleToPing &&
      (!roleToPing.mentionable &&
        !destinationPermissions.has(PermissionFlagsBits.MentionEveryone))
    ) {
      await interaction.reply({
        content: `Nie można pingować roli ${roleToPing}: włącz opcję „Może być wspomniana” albo nadaj botowi uprawnienie Wspominanie @everyone, @here i wszystkich ról na ${destination}.`,
        ephemeral: true,
      });
      return;
    }
    if (
      roleToPing &&
      !destinationPermissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      await interaction.reply({
        content: `Bot potrzebuje uprawnienia Zarządzanie wiadomościami na ${destination}, aby usunąć ghost ping.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Ogłoszenia — Polonia RP")
      .setDescription("Kliknij przycisk, aby napisać i opublikować ogłoszenie.")
      .setFooter({ text: "Ogłoszenia × Polonia RP" });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`create-announcement:${destination.id}:${roleToPing?.id ?? "none"}`)
        .setLabel("Utwórz ogłoszenie")
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({
      content: `Panel ogłoszeń opublikowano. Ogłoszenia będą wysyłane na kanał ${destination}${roleToPing ? ` z ghost pingiem roli ${roleToPing}` : ""}.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "setup-pozwolenie-na-bron") {
    const panelChannel = interaction.options.getChannel("kanal-panelu", true);
    const reviewChannel = interaction.options.getChannel("kanal-wnioskow", true);
    const permitRole = interaction.options.getRole("rola-po-akceptacji", true);
    const botMember = await interaction.guild.members.fetchMe();
    const unmanageableRole =
      permitRole.id === interaction.guild.id ||
      permitRole.managed ||
      botMember.roles.highest.comparePositionTo(permitRole) <= 0;
    if (unmanageableRole || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        content: "Bot potrzebuje uprawnienia Zarządzanie rolami, a jego najwyższa rola musi być wyżej niż wybrana rola.",
        ephemeral: true,
      });
      return;
    }

    for (const channel of [panelChannel, reviewChannel]) {
      const permissions = botMember.permissionsIn(channel);
      const requiredPermissions =
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.EmbedLinks;
      if (!permissions.has(requiredPermissions)) {
        await interaction.reply({
          content: `Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków na ${channel}.`,
          ephemeral: true,
        });
        return;
      }
    }

    await updateWebhookConfig(interaction.guildId, {
      weaponPermitPanelChannelId: panelChannel.id,
      weaponPermitReviewChannelId: reviewChannel.id,
      weaponPermitRoleId: permitRole.id,
    });
    const panelEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Pozwolenie na broń — Polonia RP")
      .setDescription(
        "Kliknij przycisk poniżej, aby wypełnić wniosek w wiadomości prywatnej. Personel rozpatrzy go na osobnym kanale.",
      )
      .setFooter({ text: "Odpowiadaj na pytania po kolei. Wpisz „anuluj”, aby przerwać." });
    const panelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("weapon-permit:apply")
        .setLabel("Pozwolenie na broń")
        .setStyle(ButtonStyle.Primary),
    );
    await panelChannel.send({ embeds: [panelEmbed], components: [panelRow] });
    await interaction.reply({
      content: `Panel wniosków opublikowano na ${panelChannel}. Wnioski trafią na ${reviewChannel}; zaakceptowanym osobom zostanie nadana rola ${permitRole}.`,
      ephemeral: true,
    });
    return;
  }

  if (
    interaction.commandName === "setup-logi-bany-kicki" ||
    interaction.commandName === "setup-logi-inne"
  ) {
    const isBanKickPanel = interaction.commandName === "setup-logi-bany-kicki";
    const source = isBanKickPanel
      ? interaction.options.getChannel("kanal-zrodlowy", true)
      : null;
    const destination = interaction.options.getChannel(isBanKickPanel ? "kanal-ban-kick" : "kanal-inne", true);
    if (destination.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "Wybierz zwykły kanał tekstowy na logi Emergency Hamburg.",
        ephemeral: true,
      });
      return;
    }

    const botMember = await interaction.guild.members.fetchMe();
    const destinationPermissions = botMember.permissionsIn(destination);
    const requiredDestinationPermissions =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks;
    if (!destinationPermissions.has(requiredDestinationPermissions)) {
      await interaction.reply({
        content: `Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków na kanale ${destination}.`,
        ephemeral: true,
      });
      return;
    }
    if (source) {
      const sourcePermissions = botMember.permissionsIn(source);
      const requiredSourcePermissions = PermissionFlagsBits.ViewChannel;
      if (!sourcePermissions.has(requiredSourcePermissions)) {
        await interaction.reply({
          content: `Bot potrzebuje uprawnienia Wyświetlanie kanału na kanale źródłowym ${source}.`,
          ephemeral: true,
        });
        return;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(isBanKickPanel ? "Logi banów i wyrzuceń — Emergency Hamburg" : "Logi pozostałych akcji — Emergency Hamburg")
      .setDescription(
        isBanKickPanel
          ? "Wybierz rodzaj akcji do zapisania. Raport zostanie wysłany na kanał przeznaczony na bany i wyrzucenia."
          : "Zapisz użycie admin car lub fly. Raport zostanie wysłany na osobny kanał pozostałych akcji.",
      )
      .setFooter({ text: "Logi moderacji × Polonia RP" });
    const actions = isBanKickPanel
      ? [
          ["kick", "Wyrzucenie", ButtonStyle.Secondary],
          ["ban", "Ban", ButtonStyle.Danger],
        ]
      : [
          ["admin-car", "Admin car", ButtonStyle.Primary],
          ["fly", "Fly", ButtonStyle.Secondary],
        ];
    const row = new ActionRowBuilder().addComponents(
      ...actions.map(([action, label, style]) =>
        new ButtonBuilder()
          .setCustomId(`eh-log:${action}:${destination.id}`)
          .setLabel(label)
          .setStyle(style),
      ),
    );

    if (isBanKickPanel) {
      await updateWebhookConfig(interaction.guildId, {
        sourceChannelId: source.id,
        banKickChannelId: destination.id,
      });
    } else {
      await updateWebhookConfig(interaction.guildId, {
        otherChannelId: destination.id,
      });
    }
    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({
      content: isBanKickPanel
        ? `Panel opublikowano. Bot będzie czytał webhooki na ${source}, przekazywał bany i kicki na ${destination}, a pozostałe zdarzenia na skonfigurowany kanał „inne”.`
        : `Panel opublikowano. Zgłoszenia i wykryte zdarzenia inne niż ban/kick będą trafiać na ${destination}.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "setup-dowody") {
    const destination = interaction.options.getChannel("kanal-dowodow", true);
    if (destination.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "Wybierz zwykły kanał tekstowy na gotowe dowody.",
        ephemeral: true,
      });
      return;
    }

    await updateWebhookConfig(interaction.guildId, { idCardChannelId: destination.id });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Dowody osobiste")
      .setDescription("Kliknij przycisk poniżej, aby wyrobić dowód osobisty.")
      .setFooter({ text: "Dowody osobiste × Polonia RP" });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`create-id-card:${destination.id}`)
        .setLabel("Wyrób dowód osobisty")
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({
      content: `Panel dowodów został opublikowany. Gotowe dowody będą wysyłane na kanał ${destination}.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "wyczysc") {
    const count = interaction.options.getInteger("liczba", true);
    const deleted = await interaction.channel.bulkDelete(count, true);
    await interaction.reply({
      content: `Usunięto ${deleted.size} wiadomości. Wiadomości starsze niż 14 dni nie mogą być usunięte tą komendą.`,
      ephemeral: true,
    });
    await sendModerationLog(interaction, "Wyczyszczenie wiadomości", null, null, {
      description: `Usunięto ${deleted.size} z ${count} wskazanych wiadomości w ${interaction.channel}.`,
    });
    return;
  }

  if (interaction.commandName === "pochwala-skarga") {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        content: "Do użycia tej komendy potrzebujesz uprawnienia Zarządzanie wiadomościami na serwerze.",
        ephemeral: true,
      });
      return;
    }

    const user = interaction.options.getUser("uzytkownik", true);
    const type = interaction.options.getString("typ", true);
    const reason = interaction.options.getString("powod", true).trim();
    if (!["pochwala", "skarga"].includes(type)) {
      throw new Error("Nieprawidłowy typ wpisu.");
    }
    if (!reason) {
      await interaction.reply({ content: "Powód nie może być pusty.", ephemeral: true });
      return;
    }
    const destinationId = praiseLogChannelIds[type];
    const destination = await interaction.guild.channels.fetch(destinationId);
    if (!destination || destination.type !== ChannelType.GuildText) {
      throw new Error(`Skonfigurowany kanał ${type === "skarga" ? "skarg" : "pochwał"} (${destinationId}) nie istnieje albo nie jest tekstowy.`);
    }
    const botMember = await interaction.guild.members.fetchMe();
    const requiredPermissions =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks;
    if (!botMember.permissionsIn(destination).has(requiredPermissions)) {
      await interaction.reply({
        content: `Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków na ${destination}.`,
        ephemeral: true,
      });
      return;
    }

    const isPraise = type === "pochwala";
    const embed = new EmbedBuilder()
      .setColor(isPraise ? 0x2ecc71 : 0xe74c3c)
      .setTitle(isPraise ? "Pochwała" : "Skarga")
      .addFields(
        { name: "Użytkownik", value: `${user} (${user.tag})` },
        { name: "Powód", value: limitField(reason, 1000) },
        { name: "Zgłaszający", value: `${interaction.user} (${interaction.user.tag})` },
      )
      .setTimestamp();
    await destination.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await interaction.reply({
      content: `${isPraise ? "Pochwała" : "Skarga"} została wysłana na ${destination}.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "plusa") {
    if (interaction.options.getSubcommand(true) !== "wniosek") {
      throw new Error("Nieznany typ wniosku o plusa.");
    }

    const amount = interaction.options.getInteger("ile", true);
    const reason = interaction.options.getString("dlaczego", true).trim();
    const confirmers = interaction.options.getString("osoby-potwierdzajace", true).trim();
    const proof = interaction.options.getString("dowod")?.trim() || "Nie załączono";
    if (!reason || !confirmers) {
      await interaction.reply({
        content: "Uzasadnienie i osoby potwierdzające nie mogą być puste.",
        ephemeral: true,
      });
      return;
    }

    const destination = await interaction.guild.channels.fetch(plusRequestChannelId);
    if (!destination || destination.type !== ChannelType.GuildText) {
      throw new Error(`Kanał wniosków o plusa (${plusRequestChannelId}) nie istnieje albo nie jest kanałem tekstowym.`);
    }

    const botMember = await interaction.guild.members.fetchMe();
    const requiredPermissions =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks;
    if (!botMember.permissionsIn(destination).has(requiredPermissions)) {
      await interaction.reply({
        content: `Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków na ${destination}.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("━━━━━━━ Wniosek o plusa ━━━━━━━")
      .addFields(
        { name: "🛡️ Kto daje", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
        { name: "🔢 Ile", value: String(amount), inline: true },
        { name: "📌 Dlaczego", value: limitField(reason, 1000), inline: false },
        { name: "👤 Osoby potwierdzające", value: limitField(confirmers, 500), inline: false },
        { name: "📎 Dowód", value: limitField(proof, 1000), inline: false },
      )
      .setTimestamp();

    await destination.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await interaction.reply({
      content: `Wniosek o plusa został wysłany na ${destination}.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "plusminus" || interaction.commandName === "awansdegrad") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        content: "Do użycia tej komendy potrzebujesz uprawnienia Zarządzanie rolami.",
        ephemeral: true,
      });
      return;
    }

    const user = interaction.options.getUser("uzytkownik", true);
    const action = interaction.options.getString("akcja", true);
    const isPromotionCommand = interaction.commandName === "awansdegrad";
    if (
      (isPromotionCommand && !["awans", "degrad"].includes(action)) ||
      (!isPromotionCommand && !["plus", "minus"].includes(action))
    ) {
      throw new Error("Nieprawidłowa akcja zmiany roli.");
    }
    const shouldAddRole = isPromotionCommand ? action === "awans" : action === "plus";
    const role = interaction.options.getRole("rola", true);
    const reason = interaction.options.getString("powod", true).trim();
    const destinationId = isPromotionCommand
      ? interaction.options.getChannel("kanal", true).id
      : roleChangeLogChannelId;
    if (!reason) {
      await interaction.reply({ content: "Powód zmiany roli nie może być pusty.", ephemeral: true });
      return;
    }
    const destination = await interaction.guild.channels.fetch(destinationId);
    if (!destination || destination.type !== ChannelType.GuildText) {
      throw new Error(`Kanał logów ${destinationId} nie istnieje albo nie jest kanałem tekstowym.`);
    }
    if (user.id === interaction.user.id) {
      await interaction.reply({ content: "Nie możesz użyć tej komendy na sobie.", ephemeral: true });
      return;
    }

    const target = await getModerationTarget(interaction, user);
    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const botMember = await interaction.guild.members.fetchMe();
    const requiredChannelPermissions =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks;
    if (!botMember.permissionsIn(destination).has(requiredChannelPermissions)) {
      await interaction.reply({
        content: `Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków na ${destination}.`,
        ephemeral: true,
      });
      return;
    }
    if (
      role.id === interaction.guild.id ||
      role.managed ||
      (moderator.id !== interaction.guild.ownerId &&
        moderator.roles.highest.comparePositionTo(role) <= 0)
    ) {
      await interaction.reply({
        content: "Nie możesz zarządzać tą rolą. Wybierz zwykłą rolę niższą od swojej najwyższej roli.",
        ephemeral: true,
      });
      return;
    }
    if (
      !botMember.permissions.has(PermissionFlagsBits.ManageRoles) ||
      botMember.roles.highest.comparePositionTo(role) <= 0
    ) {
      await interaction.reply({
        content: "Bot nie może zarządzać tą rolą. Nadaj mu uprawnienie Zarządzanie rolami i ustaw jego najwyższą rolę wyżej.",
        ephemeral: true,
      });
      return;
    }

    if (shouldAddRole) {
      await target.roles.add(role, reason);
    } else {
      await target.roles.remove(role, reason);
    }
    const actionText = shouldAddRole ? "nadano" : "zabrano";
    const actionLabel = isPromotionCommand
      ? (shouldAddRole ? "Awans" : "Degradacja")
      : (shouldAddRole ? "Nadanie roli" : "Zabranie roli");
    const actionDescription = isPromotionCommand
      ? `${shouldAddRole ? "Awans" : "Degradacja"}: ${actionText} rolę ${role.name}.`
      : `Akcja: ${actionText} rolę ${role.name}.`;
    const embed = new EmbedBuilder()
      .setColor(shouldAddRole ? 0x2ecc71 : 0xe74c3c)
      .setTitle(actionLabel)
      .addFields(
        { name: "Użytkownik", value: `${user} (${user.tag})` },
        { name: "Rola", value: `${actionText} ${role}` },
        { name: "Powód", value: limitField(reason, 500) },
        { name: "Wykonał", value: `${interaction.user} (${interaction.user.tag})` },
      )
      .setTimestamp();
    await destination.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await sendModerationLog(interaction, "Zmiana roli", user, reason, {
      description: actionDescription,
    });
    await interaction.reply({
      content: isPromotionCommand
        ? `${shouldAddRole ? "Awansowano" : "Zdegradowano"} użytkownika ${user}; ${actionText} rolę ${role}. Embed wysłano na ${destination}.`
        : `Użytkownikowi ${user} ${actionText} rolę ${role}. Embed wysłano na ${destination}.`,
      ephemeral: true,
    });
    return;
  }

  const user = interaction.options.getUser("uzytkownik", true);
  const reason = interaction.options.getString("powod")?.trim() || "Nie podano";
  if (user.id === interaction.user.id) {
    await interaction.reply({ content: "Nie możesz użyć tej komendy na sobie.", ephemeral: true });
    return;
  }

  const target = await getModerationTarget(interaction, user);

  if (interaction.commandName === "ostrzez") {
    let dmDelivered = true;
    try {
      await user.send(`Otrzymujesz ostrzeżenie na serwerze **${interaction.guild.name}**.\nPowód: ${reason}`);
    } catch (error) {
      dmDelivered = false;
      console.warn(`[ostrzeżenie] Nie udało się wysłać DM do ${user.tag}:`, error.message);
    }
    await sendModerationLog(interaction, "Ostrzeżenie", user, reason);
    await interaction.reply({
      content: `Wysłano ostrzeżenie dla ${user}.${dmDelivered ? "" : " Nie udało się dostarczyć wiadomości prywatnej."}`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "timeout" || interaction.commandName === "mute") {
    const minutes = interaction.options.getInteger("minuty", true);
    await target.timeout(minutes * 60 * 1000, reason);
    await sendModerationLog(interaction, "Timeout", user, reason, {
      description: `Czas trwania: ${minutes} min.`,
    });
    await interaction.reply({
      content: `Użytkownik ${user} został wyciszony na ${minutes} min. Powód: ${reason}`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "kick") {
    await target.kick(reason);
    await sendModerationLog(interaction, "Wyrzucenie z serwera", user, reason);
    await interaction.reply({ content: `Użytkownik ${user} został wyrzucony z serwera.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === "ban") {
    const hours = interaction.options.getInteger("usun_wiadomosci_godziny") ?? 0;
    await target.ban({ deleteMessageSeconds: hours * 60 * 60, reason });
    await sendModerationLog(interaction, "Ban", user, reason, {
      description: `Usunięcie wiadomości z ostatnich ${hours} godz.`,
    });
    await interaction.reply({ content: `Użytkownik ${user} został zbanowany.`, ephemeral: true });
  }
}

async function handleButton(interaction) {
  if (interaction.customId === "activity-check:participate") {
    const config = webhookConfigs[interaction.guildId];
    const checkEmbed = interaction.message.embeds[0];
    if (
      interaction.channelId !== config?.activityCheckChannelId ||
      interaction.message.author.id !== client.user.id ||
      checkEmbed?.title !== "Check aktywności" ||
      !checkEmbed.fields.some((field) => field.name === "Cel") ||
      !checkEmbed.fields.some((field) => field.name === "Opublikował(a)")
    ) {
      await interaction.reply({
        content: "Ten przycisk nie należy do opublikowanego checku aktywności.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const messageId = interaction.message.id;
    const participation = await updateActivityCheckParticipants(async () => {
      const participantsByMessage = await loadActivityCheckParticipants();
      const participants = participantsByMessage[messageId] ?? [];
      if (
        !Array.isArray(participants) ||
        !participants.every(
          (participant) =>
            participant &&
            typeof participant.userId === "string" &&
            typeof participant.displayName === "string",
        )
      ) {
        throw new Error("Dane uczestników tego checku aktywności są nieprawidłowe.");
      }

      const participantIndex = participants.findIndex(
        (participant) => participant.userId === interaction.user.id,
      );
      const joined = participantIndex === -1;
      if (joined) {
        participants.push({
          userId: interaction.user.id,
          displayName: member.displayName,
        });
      } else {
        participants.splice(participantIndex, 1);
      }

      participantsByMessage[messageId] = participants;
      await saveActivityCheckParticipants(participantsByMessage);

      const updatedEmbed = EmbedBuilder.from(checkEmbed).setFields(
        ...checkEmbed.fields.filter(
          (field) => field.name !== "Uczestnicy" && !field.name.startsWith("Uczestnicy ("),
        ),
        {
          name: `Uczestnicy (${participants.length})`,
          value: formatActivityCheckParticipants(participants),
        },
      );
      await interaction.message.edit({ embeds: [updatedEmbed] });
      return { joined };
    });
    await interaction.editReply(
      participation.joined
        ? "Potwierdzono Twój udział w checku."
        : "Wycofano Twoje potwierdzenie udziału.",
    );
    return;
  }

  if (interaction.customId === "activity-check:publish") {
    const config = webhookConfigs[interaction.guildId];
    if (
      !config?.activityCheckPanelChannelId ||
      !config.activityCheckChannelId ||
      !config.activityCheckRoleId ||
      !Array.isArray(config.activityCheckAllowedRoleIds)
    ) {
      await interaction.reply({
        content: "Panel checku aktywności nie jest skonfigurowany. Poproś administratora o ponowne uruchomienie konfiguracji.",
        ephemeral: true,
      });
      return;
    }

    const panelFooter = interaction.message.embeds[0]?.footer?.text;
    if (
      interaction.channelId !== config.activityCheckPanelChannelId ||
      interaction.message.author.id !== client.user.id ||
      panelFooter !== `activity-check:${interaction.guildId}`
    ) {
      await interaction.reply({
        content: "Ten przycisk nie należy do skonfigurowanego panelu checku aktywności.",
        ephemeral: true,
      });
      return;
    }
    if (config.activityCheckRoleId === interaction.guildId) {
      throw new Error("Skonfigurowano rolę @everyone dla checku aktywności. Uruchom ponownie konfigurację i wybierz konkretną rolę.");
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!config.activityCheckAllowedRoleIds.some((roleId) => member.roles.cache.has(roleId))) {
      await interaction.reply({
        content: "Nie masz roli uprawnionej do użycia tego przycisku.",
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("activity-check:submit")
      .setTitle("Check aktywności");
    const goalInput = new TextInputBuilder()
      .setCustomId("goal")
      .setLabel("Cel (liczba od 0 do 100000)")
      .setPlaceholder("Np. 5000")
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(6)
      .setRequired(true);
    const descriptionInput = new TextInputBuilder()
      .setCustomId("description")
      .setLabel("Opis checku aktywności")
      .setPlaceholder("Opisz, co trzeba zrobić i do kiedy.")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setRequired(true);
    modal.addComponents(
      new ActionRowBuilder().addComponents(goalInput),
      new ActionRowBuilder().addComponents(descriptionInput),
    );
    await interaction.showModal(modal);
    return;
  }

  if (
    interaction.customId.startsWith("leave:accept:") ||
    interaction.customId.startsWith("leave:end:") ||
    interaction.customId.startsWith("leave:end-reason:")
  ) {
    if (!canSubmitModerationLog(interaction)) {
      await interaction.reply({
        content: "Tylko upoważniony personel może rozpatrywać i kończyć urlopy.",
        ephemeral: true,
      });
      return;
    }

    const [, action, userId] = interaction.customId.split(":");
    if (!isLeaveReviewMessage(interaction, userId)) {
      await interaction.reply({ content: "Ten wpis nie jest prawidłowym wnioskiem o urlop.", ephemeral: true });
      return;
    }
    const embed = interaction.message.embeds[0];
    const currentStatus = getEmbedField(embed, "Status");
    if (action === "end-reason") {
      if (currentStatus !== "Urlop zaakceptowany") {
        await interaction.reply({ content: "Można zakończyć tylko zaakceptowany urlop.", ephemeral: true });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(`leave:end-reason-submit:${interaction.message.id}`)
        .setTitle("Zakończenie urlopu");
      const reason = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Powód zakończenia urlopu")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(reason));
      await interaction.showModal(modal);
      return;
    }

    const nextStatus = action === "accept"
      ? "Urlop zaakceptowany"
      : action === "end"
        ? "Urlop zakończony"
        : null;
    const expectedStatus = action === "accept" ? "Oczekuje na akceptację" : "Urlop zaakceptowany";
    if (!nextStatus || currentStatus !== expectedStatus) {
      await interaction.reply({
        content: action === "accept"
          ? "Ten wniosek został już rozpatrzony."
          : "Można zakończyć tylko zaakceptowany urlop.",
        ephemeral: true,
      });
      return;
    }

    const lockKey = interaction.message.id;
    if (weaponPermitDecisionLocks.has(lockKey)) {
      await interaction.reply({
        content: "Ten urlop jest już przetwarzany przez innego członka personelu.",
        ephemeral: true,
      });
      return;
    }
    weaponPermitDecisionLocks.add(lockKey);
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const currentMessage = await interaction.channel.messages.fetch(interaction.message.id);
      const currentEmbed = currentMessage.embeds[0];
      if (
        !isLeaveReviewMessage(interaction, userId, currentMessage) ||
        getEmbedField(currentEmbed, "Status") !== expectedStatus
      ) {
        await interaction.editReply("Ten wniosek został już rozpatrzony.");
        return;
      }
      const updatedEmbed = EmbedBuilder.from(currentEmbed)
        .setColor(action === "accept" ? 0x2ecc71 : 0x95a5a6)
        .setFields(
          ...currentEmbed.fields.map((field) =>
            field.name === "Status"
              ? { name: field.name, value: nextStatus, inline: false }
              : field,
          ),
          { name: "Rozpatrzył(a)", value: `<@${interaction.user.id}>`, inline: false },
        );
      await currentMessage.edit({
        embeds: [updatedEmbed],
        components: [makeLeaveReviewRow(userId, nextStatus)],
        allowedMentions: { parse: [] },
      });
      await interaction.editReply(action === "accept" ? "Wniosek o urlop został zaakceptowany." : "Urlop został zakończony.");
      const applicant = await client.users.fetch(userId).catch((error) => {
        console.error(`Nie udało się pobrać użytkownika ${userId} do powiadomienia o urlopie:`, error);
        return null;
      });
      if (applicant) {
        await applicant.send(
          action === "accept"
            ? `Twój wniosek o urlop na serwerze ${interaction.guild.name} został zaakceptowany.`
            : `Twój urlop na serwerze ${interaction.guild.name} został zakończony.`,
        ).catch((error) => console.error(`Nie udało się powiadomić użytkownika ${userId} o zmianie statusu urlopu:`, error));
      }
      return;
    } finally {
      weaponPermitDecisionLocks.delete(lockKey);
    }
  }

  if (interaction.customId === "weapon-permit:apply") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const config = webhookConfigs[interaction.guildId];
    if (
      !config?.weaponPermitReviewChannelId ||
      !config.weaponPermitRoleId
    ) {
      await interaction.editReply("Panel wniosków nie jest już skonfigurowany. Poproś administratora o ponowne uruchomienie konfiguracji.");
      return;
    }
    if (weaponPermitApplications.has(interaction.user.id)) {
      await interaction.editReply("Masz już rozpoczęty wniosek. Dokończ go w wiadomości prywatnej albo wpisz „anuluj”.");
      return;
    }
    const permitRole = await interaction.guild.roles.fetch(config.weaponPermitRoleId);
    if (!permitRole) {
      throw new Error("Skonfigurowana rola pozwolenia na broń już nie istnieje.");
    }

    const application = {
      user: interaction.user,
      guildId: interaction.guildId,
      reviewChannelId: config.weaponPermitReviewChannelId,
      answers: [],
      processing: false,
      timeout: null,
    };
    application.timeout = setTimeout(() => {
      clearWeaponPermitApplication(interaction.user.id);
      interaction.user.send("Twój wniosek o pozwolenie na broń wygasł, ponieważ nie otrzymaliśmy odpowiedzi w ciągu 15 minut.")
        .catch((error) => console.error("Nie udało się powiadomić o wygaśnięciu wniosku:", error));
    }, weaponPermitApplicationTimeoutMs);
    weaponPermitApplications.set(interaction.user.id, application);
    try {
      await sendWeaponPermitQuestion(application);
    } catch (error) {
      clearWeaponPermitApplication(interaction.user.id);
      await interaction.editReply("Nie udało mi się wysłać Ci wiadomości prywatnej. Włącz możliwość otrzymywania DM-ów od członków serwera i spróbuj ponownie.");
      console.error("Nie udało się rozpocząć wniosku o pozwolenie na broń w DM:", error);
      return;
    }
    await interaction.editReply("Wysłałem pierwsze pytanie w wiadomości prywatnej. Odpowiedz tam, aby kontynuować.");
    return;
  }

  if (
    interaction.customId.startsWith("weapon-permit:approve:") ||
    interaction.customId.startsWith("weapon-permit:reject:")
  ) {
    const lockKey = interaction.message.id;
    if (weaponPermitDecisionLocks.has(lockKey)) {
      await interaction.reply({
        content: "Ten wniosek jest już rozpatrywany przez innego członka personelu.",
        ephemeral: true,
      });
      return;
    }
    weaponPermitDecisionLocks.add(lockKey);
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (!canSubmitModerationLog(interaction)) {
        await interaction.editReply("Tylko upoważniony personel może rozpatrywać wnioski.");
        return;
      }

      const [, decision, applicantId] = interaction.customId.split(":");
      const config = webhookConfigs[interaction.guildId];
      const embed = interaction.message.embeds[0];
      const expectedFooter = `weapon-permit:${interaction.guildId}:${applicantId}`;
      if (
        !applicantId ||
        interaction.channelId !== config?.weaponPermitReviewChannelId ||
        interaction.message.author.id !== client.user.id ||
        embed?.footer?.text !== expectedFooter ||
        getEmbedField(embed, "Status wniosku") !== "Oczekuje na decyzję personelu"
      ) {
        await interaction.editReply("Ten wniosek nie jest prawidłowy, oczekuje już na decyzję albo nie należy do tego kanału.");
        return;
      }

      const permitRole = await interaction.guild.roles.fetch(config.weaponPermitRoleId);
      if (!permitRole) {
        throw new Error("Skonfigurowana rola pozwolenia na broń już nie istnieje.");
      }
      let decisionLabel;
      let approvedApplicant;
      if (decision === "approve") {
        const botMember = await interaction.guild.members.fetchMe();
        if (
          permitRole.id === interaction.guild.id ||
          permitRole.managed ||
          botMember.roles.highest.comparePositionTo(permitRole) <= 0
        ) {
          throw new Error("Rola pozwolenia musi być zwykłą rolą niżej niż najwyższa rola bota.");
        }
        approvedApplicant = await interaction.guild.members.fetch(applicantId);
        if (!approvedApplicant.roles.cache.has(permitRole.id)) {
          await approvedApplicant.roles.add(permitRole, `Wniosek zaakceptowany przez ${interaction.user.tag}`);
        }
        const weaponType = getEmbedField(embed, "Rodzaj broni");
        if (!weaponType) {
          throw new Error("We wniosku nie ma podanego rodzaju broni.");
        }
        await updateWeaponPermitIdentityRequests(async (requests) => {
          requests[applicantId] = {
            guildId: interaction.guildId,
            weaponType,
          };
        });
        decisionLabel = "Zaakceptowano";
      } else if (decision === "reject") {
        decisionLabel = "Odrzucono";
      } else {
        throw new Error("Nieprawidłowa decyzja dla wniosku o pozwolenie na broń.");
      }

      const updatedEmbed = EmbedBuilder.from(embed)
        .setColor(decision === "approve" ? 0x2ecc71 : 0xe74c3c)
        .setFields(
          ...embed.fields.map((field) =>
            field.name === "Status wniosku"
              ? { name: field.name, value: decisionLabel, inline: false }
              : field,
          ),
          { name: "Rozpatrzył(a)", value: `<@${interaction.user.id}>`, inline: false },
        );
      await interaction.message.edit({
        embeds: [updatedEmbed],
        components: [makeWeaponPermitReviewRow(applicantId, true)],
        allowedMentions: { parse: [] },
      });
      const applicantUser = await client.users.fetch(applicantId).catch((error) => {
        console.error(`Nie udało się pobrać użytkownika ${applicantId} do powiadomienia o decyzji:`, error);
        return null;
      });
      if (applicantUser) {
        await applicantUser.send(
          decision === "approve"
            ? `Twój wniosek o pozwolenie na broń na serwerze ${interaction.guild.name} został zaakceptowany. Nadano Ci rolę ${permitRole.name}.\n\nWyślij tutaj swoją nazwę Roblox (np. @NazwaGracza) albo numeryczne ID Roblox, a opublikuję Twoje pozwolenie na broń.`
            : `Twój wniosek o pozwolenie na broń na serwerze ${interaction.guild.name} został odrzucony.`,
        ).catch((error) => {
          console.error(`Nie udało się powiadomić użytkownika ${applicantId} o decyzji w sprawie wniosku:`, error);
        });
      }
      await interaction.editReply(
        decision === "approve"
          ? `Wniosek zaakceptowano i nadano rolę ${permitRole}.`
          : "Wniosek odrzucono.",
      );
      return;
    } finally {
      weaponPermitDecisionLocks.delete(lockKey);
    }
  }

  if (interaction.customId === "eh-ban-edit") {
    if (!canSubmitModerationLog(interaction)) {
      await interaction.reply({
        content: "Tylko moderatorzy mogą edytować wpisy o banach.",
        ephemeral: true,
      });
      return;
    }

    const messageId = interaction.message.id;
    const embed = interaction.message.embeds[0];
    if (
      interaction.message.author.id !== client.user.id ||
      embed?.footer?.text !== "Polonia RP × Bany Emergency Hamburg"
    ) {
      throw new Error("Można edytować wyłącznie wpisy o banach utworzone przez tego bota.");
    }

    const modal = new ModalBuilder()
      .setCustomId(`eh-ban-edit-submit:${messageId}`)
      .setTitle("Edytuj dane bana Roblox");
    const fields = [
      ["player-name", "Nick zbanowanego", getEmbedField(embed, "Nick zbanowanego").slice(0, 80), 2, 80],
      ["duration", "Czas bana (np. 20 dni lub bezterminowy)", getEmbedField(embed, "Czas bana").slice(0, 80), 1, 80],
      ["reason", "Powód bana", getEmbedField(embed, "Powód").slice(0, 500), 2, 500, TextInputStyle.Paragraph],
      ["appealable", "Odwołanie? Wpisz tak lub nie", getEmbedField(embed, "Odwołanie").slice(0, 80), 2, 80],
    ];
    modal.addComponents(
      ...fields.map(([id, label, value, minLength, maxLength, style = TextInputStyle.Short]) =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setStyle(style)
            .setMinLength(minLength)
            .setMaxLength(maxLength)
            .setValue(value)
            .setRequired(true),
        ),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId === "eh-kick-edit") {
    if (!canSubmitModerationLog(interaction)) {
      await interaction.reply({
        content: "Tylko moderatorzy mogą edytować wpisy o wyrzuceniach.",
        ephemeral: true,
      });
      return;
    }

    const embed = interaction.message.embeds[0];
    if (
      interaction.message.author.id !== client.user.id ||
      embed?.footer?.text !== "Polonia RP × Emergency Hamburg"
    ) {
      throw new Error("Można edytować wyłącznie wpisy o wyrzuceniach utworzone przez tego bota.");
    }

    const modal = new ModalBuilder()
      .setCustomId(`eh-kick-edit-submit:${interaction.message.id}`)
      .setTitle("Edytuj powód wyrzucenia");
    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Powód wyrzucenia")
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(1)
      .setMaxLength(500)
      .setValue(getEmbedField(embed, "Powód wyrzucenia").slice(0, 500))
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(reason));
    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId.startsWith("create-announcement:")) {
    if (!canPublishAnnouncement(interaction)) {
      await interaction.reply({
        content: "Tylko moderatorzy z uprawnieniem Zarządzanie serwerem mogą tworzyć ogłoszenia.",
        ephemeral: true,
      });
      return;
    }

    const [, destinationId, roleId = "none"] = interaction.customId.split(":");
    if (!destinationId) {
      throw new Error("Przycisk ogłoszeń nie ma skonfigurowanego kanału.");
    }
    const modal = new ModalBuilder()
      .setCustomId(`submit-announcement:${destinationId}:${roleId}`)
      .setTitle("Nowe ogłoszenie");
    const title = new TextInputBuilder()
      .setCustomId("title")
      .setLabel("Tytuł ogłoszenia")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);
    const content = new TextInputBuilder()
      .setCustomId("content")
      .setLabel("Treść ogłoszenia")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(4000)
      .setRequired(true);
    modal.addComponents(
      new ActionRowBuilder().addComponents(title),
      new ActionRowBuilder().addComponents(content),
    );
    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId.startsWith("eh-log:")) {
    const [, action, destinationId] = interaction.customId.split(":");
    const actionLabels = {
      kick: "Zgłoś wyrzucenie",
      ban: "Zgłoś ban",
      tempban: "Zgłoś ban czasowy",
      "admin-car": "Zgłoś użycie admin car",
      fly: "Zgłoś użycie fly",
    };
    if (!actionLabels[action] || !destinationId) {
      throw new Error("Nieprawidłowy przycisk logów Emergency Hamburg.");
    }
    if (!canSubmitModerationLog(interaction)) {
      await interaction.reply({
        content: "Tylko moderatorzy mogą wysyłać zgłoszenia do logów.",
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`eh-log-submit:${action}:${destinationId}`)
      .setTitle(actionLabels[action]);
    const fields = action === "ban"
      ? [
          ["player-name", "Nick zbanowanego na Roblox", 2, 80],
          ["duration", "Czas bana (np. 20 dni lub bezterminowy)", 1, 80],
          ["reason", "Powód bana", 2, 500, TextInputStyle.Paragraph],
          ["appealable", "Odwołanie? Wpisz tak lub nie", 2, 3],
        ]
      : [
          ["player-name", "Nazwa gracza w Emergency Hamburg", 2, 80],
          ["roblox-id", "Roblox ID gracza", 1, 20],
          ["reason", "Powód akcji", 2, 500],
        ];
    if (action === "admin-car" || action === "fly") {
      fields.push(["details", "Dodatkowe informacje (opcjonalnie)", 1, 100]);
    }
    if (action === "tempban") {
      fields.push(["duration", "Czas trwania, np. 7 dni lub 2 godziny", 1, 80]);
    }
    modal.addComponents(
      ...fields.map(([id, label, minLength, maxLength, style = TextInputStyle.Short]) =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setStyle(style)
            .setMinLength(minLength)
            .setMaxLength(maxLength)
            .setRequired(id !== "details"),
        ),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId.startsWith("create-id-card:")) {
    const destinationId = interaction.customId.slice("create-id-card:".length);
    const modal = new ModalBuilder()
      .setCustomId(`submit-id-card:${destinationId}`)
      .setTitle("Dowód osobisty");
    const fields = [
      ["full-name", "Imię i nazwisko", TextInputStyle.Short, 2, 100],
      ["age", "Wiek", TextInputStyle.Short, 1, 3],
      ["gender", "Płeć", TextInputStyle.Short, 1, 40],
      ["citizenship", "Obywatelstwo", TextInputStyle.Short, 2, 60],
      ["roblox-id", "Roblox ID lub @nazwa", TextInputStyle.Short, 1, 21],
    ].map(([id, label, style, minLength, maxLength]) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(id)
          .setLabel(label)
          .setStyle(style)
          .setMinLength(minLength)
          .setMaxLength(maxLength)
          .setRequired(true),
      ),
    );
    modal.addComponents(...fields);
    await interaction.showModal(modal);
    return;
  }

  if (!interaction.customId.startsWith("verify-player:")) return;

  const roleIds = interaction.customId.split(":").slice(1);
  const removeRoleId = roleIds.pop();
  const giveRoleIds = roleIds;
  if (
    (giveRoleIds.length !== 1 && giveRoleIds.length !== 2) ||
    giveRoleIds.some((id) => !id) ||
    !removeRoleId ||
    new Set([...giveRoleIds, removeRoleId]).size !== giveRoleIds.length + 1
  ) {
    throw new Error("Panel weryfikacji ma nieprawidłowo skonfigurowane role.");
  }
  const [rolesToGive, roleToRemove] = await Promise.all([
    Promise.all(giveRoleIds.map((id) => interaction.guild.roles.fetch(id))),
    interaction.guild.roles.fetch(removeRoleId),
  ]);
  if (rolesToGive.some((role) => !role) || !roleToRemove) {
    throw new Error("Jedna z ról panelu weryfikacji już nie istnieje.");
  }
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (rolesToGive.every((role) => member.roles.cache.has(role.id))) {
    await interaction.reply({ content: "Masz już przyznaną rolę zweryfikowanego gracza.", ephemeral: true });
    return;
  }

  const { question, answer } = makeChallenge();
  verificationChallenges.set(challengeKey(interaction.guildId, interaction.user.id), {
    answer,
    giveRoleIds,
    removeRoleId,
    expiresAt: Date.now() + challengeLifetimeMs,
  });

  const modal = new ModalBuilder()
    .setCustomId(`verify-math-answer:${giveRoleIds.join(":")}:${removeRoleId}`)
    .setTitle("Weryfikacja Polonia RP");
  const answerInput = new TextInputBuilder()
    .setCustomId("answer")
    .setLabel(`Ile wynosi ${question}?`)
    .setPlaceholder("Wpisz wynik")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(3)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(answerInput));

  await interaction.showModal(modal);
}

async function handleModal(interaction) {
  if (interaction.customId === "activity-check:submit") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const config = webhookConfigs[interaction.guildId];
    if (
      !config?.activityCheckPanelChannelId ||
      !config.activityCheckChannelId ||
      !config.activityCheckRoleId ||
      !Array.isArray(config.activityCheckAllowedRoleIds)
    ) {
      await interaction.editReply("Panel checku aktywności nie jest już skonfigurowany. Poproś administratora o ponowne uruchomienie konfiguracji.");
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!config.activityCheckAllowedRoleIds.some((roleId) => member.roles.cache.has(roleId))) {
      await interaction.editReply("Nie masz roli uprawnionej do opublikowania checku aktywności.");
      return;
    }

    const rawGoal = interaction.fields.getTextInputValue("goal").trim();
    if (!/^\d{1,6}$/.test(rawGoal) || Number(rawGoal) > 100000) {
      await interaction.editReply("Cel musi być liczbą całkowitą od 0 do 100000.");
      return;
    }
    const description = interaction.fields.getTextInputValue("description").trim();
    if (!description) {
      await interaction.editReply("Opis checku aktywności nie może być pusty.");
      return;
    }

    const [checkChannel, roleToPing] = await Promise.all([
      interaction.guild.channels.fetch(config.activityCheckChannelId),
      interaction.guild.roles.fetch(config.activityCheckRoleId),
    ]);
    if (!checkChannel || checkChannel.type !== ChannelType.GuildText) {
      throw new Error("Skonfigurowany kanał checku aktywności już nie istnieje albo nie jest tekstowy.");
    }
    if (!roleToPing) {
      throw new Error("Skonfigurowana rola do pingowania już nie istnieje.");
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Check aktywności")
      .setDescription(`${description}\n\nKliknij przycisk, aby potwierdzić udział. Kliknij ponownie, aby go wycofać.`)
      .addFields(
        { name: "Cel", value: Number(rawGoal).toLocaleString("pl-PL"), inline: true },
        { name: "Opublikował(a)", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Uczestnicy (0)", value: "Nikt jeszcze nie potwierdził udziału." },
      )
      .setTimestamp();
    const participationRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("activity-check:participate")
        .setLabel("Zapisz mnie")
        .setStyle(ButtonStyle.Success),
    );
    await checkChannel.send({
      content: `<@&${roleToPing.id}> Rozpoczęto check aktywności!`,
      embeds: [embed],
      components: [participationRow],
      allowedMentions: { parse: [], roles: [roleToPing.id] },
    });
    await interaction.editReply(`Check aktywności z celem ${rawGoal} opublikowano na ${checkChannel}.`);
    return;
  }

  if (interaction.customId.startsWith("leave:submit:")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [, , reviewChannelId] = interaction.customId.split(":");
    if (!reviewChannelId) {
      throw new Error("Nie wybrano kanału do rozpatrywania wniosków o urlop.");
    }
    const reviewChannel = await interaction.guild.channels.fetch(reviewChannelId);
    if (!reviewChannel || reviewChannel.type !== ChannelType.GuildText) {
      throw new Error("Wybrany kanał wniosków o urlop nie istnieje albo nie jest kanałem tekstowym.");
    }
    const botMember = await interaction.guild.members.fetchMe();
    const requiredPermissions =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks;
    if (!botMember.permissionsIn(reviewChannel).has(requiredPermissions)) {
      throw new Error(`Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków na ${reviewChannel}.`);
    }

    const duration = interaction.fields.getTextInputValue("duration").trim();
    const reason = interaction.fields.getTextInputValue("reason").trim();
    const details = interaction.fields.getTextInputValue("details").trim();
    if (!duration || !reason) {
      await interaction.editReply("Czas trwania i powód urlopu są wymagane.");
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("Wniosek o urlop")
      .setDescription(`Wnioskodawca: <@${interaction.user.id}>`)
      .addFields(
        { name: "Proponowany czas trwania", value: duration },
        { name: "Powód", value: reason },
        ...(details ? [{ name: "Dodatkowe informacje", value: details }] : []),
        { name: "Status", value: "Oczekuje na akceptację" },
      )
      .setFooter({ text: `urlop:${interaction.guildId}:${interaction.user.id}` })
      .setTimestamp();
    await reviewChannel.send({
      embeds: [embed],
      components: [makeLeaveReviewRow(interaction.user.id, "Oczekuje na akceptację")],
      allowedMentions: { parse: [] },
    });
    await interaction.editReply(`Twój wniosek o urlop został wysłany do rozpatrzenia na ${reviewChannel}.`);
    return;
  }

  if (interaction.customId.startsWith("leave:end-reason-submit:")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!canSubmitModerationLog(interaction)) {
      await interaction.editReply("Tylko upoważniony personel może kończyć urlopy.");
      return;
    }
    const messageId = interaction.customId.slice("leave:end-reason-submit:".length);
    if (weaponPermitDecisionLocks.has(messageId)) {
      await interaction.editReply("Ten urlop jest już przetwarzany przez innego członka personelu.");
      return;
    }
    weaponPermitDecisionLocks.add(messageId);
    try {
      const message = await interaction.channel.messages.fetch(messageId);
      const embed = message.embeds[0];
      const applicantId = embed?.footer?.text?.split(":")[2];
      if (
        !applicantId ||
        !isLeaveReviewMessage(interaction, applicantId, message) ||
        getEmbedField(embed, "Status") !== "Urlop zaakceptowany"
      ) {
        await interaction.editReply("Nie znaleziono zaakceptowanego wniosku o urlop do zakończenia.");
        return;
      }
      const reason = interaction.fields.getTextInputValue("reason").trim();
      if (!reason) {
        await interaction.editReply("Podaj powód zakończenia urlopu.");
        return;
      }
      const updatedEmbed = EmbedBuilder.from(embed)
        .setColor(0x95a5a6)
        .setFields(
          ...embed.fields.map((field) =>
            field.name === "Status"
              ? { name: field.name, value: "Urlop zakończony", inline: false }
              : field,
          ),
          { name: "Powód zakończenia", value: reason, inline: false },
          { name: "Zakończył(a)", value: `<@${interaction.user.id}>`, inline: false },
        );
      await message.edit({
        embeds: [updatedEmbed],
        components: [makeLeaveReviewRow(applicantId, "Urlop zakończony")],
        allowedMentions: { parse: [] },
      });
      await interaction.editReply("Urlop został zakończony z podanym powodem.");
      const applicant = await client.users.fetch(applicantId).catch((error) => {
        console.error(`Nie udało się pobrać użytkownika ${applicantId} do powiadomienia o urlopie:`, error);
        return null;
      });
      if (applicant) {
        await applicant.send(`Twój urlop na serwerze ${interaction.guild.name} został zakończony. Powód: ${reason}`)
          .catch((error) => console.error(`Nie udało się powiadomić użytkownika ${applicantId} o zakończeniu urlopu:`, error));
      }
      return;
    } finally {
      weaponPermitDecisionLocks.delete(messageId);
    }
  }

  if (interaction.customId.startsWith("eh-kick-edit-submit:")) {
    if (!canSubmitModerationLog(interaction)) {
      await interaction.reply({
        content: "Tylko moderatorzy mogą edytować wpisy o wyrzuceniach.",
        ephemeral: true,
      });
      return;
    }

    const messageId = interaction.customId.slice("eh-kick-edit-submit:".length);
    const channel = await interaction.guild.channels.fetch(interaction.channelId);
    if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
      throw new Error("Nie znaleziono kanału zawierającego wpis o wyrzuceniu.");
    }
    const message = await channel.messages.fetch(messageId);
    const existingEmbed = message.embeds[0];
    if (
      message.author.id !== client.user.id ||
      existingEmbed?.footer?.text !== "Polonia RP × Emergency Hamburg"
    ) {
      throw new Error("Można edytować wyłącznie wpisy o wyrzuceniach utworzone przez tego bota.");
    }

    const reason = interaction.fields.getTextInputValue("reason").trim();
    if (!reason) {
      await interaction.reply({
        content: "Powód wyrzucenia nie może być pusty.",
        ephemeral: true,
      });
      return;
    }

    const fields = existingEmbed.fields.map((field) =>
      field.name === "Powód wyrzucenia"
        ? { ...field, value: limitField(reason, 500) }
        : field,
    );
    await message.edit({
      embeds: [EmbedBuilder.from(existingEmbed).setFields(fields)],
      components: [makeKickEditRow()],
      allowedMentions: { parse: [] },
    });
    await interaction.reply({ content: "Powód wyrzucenia został zaktualizowany.", ephemeral: true });
    return;
  }

  if (interaction.customId.startsWith("eh-ban-edit-submit:")) {
    if (!canSubmitModerationLog(interaction)) {
      await interaction.reply({
        content: "Tylko moderatorzy mogą edytować wpisy o banach.",
        ephemeral: true,
      });
      return;
    }

    const messageId = interaction.customId.slice("eh-ban-edit-submit:".length);
    const channel = await interaction.guild.channels.fetch(interaction.channelId);
    if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
      throw new Error("Nie znaleziono kanału zawierającego wpis o banie.");
    }
    const message = await channel.messages.fetch(messageId);
    const existingEmbed = message.embeds[0];
    if (
      message.author.id !== client.user.id ||
      existingEmbed?.footer?.text !== "Polonia RP × Bany Emergency Hamburg"
    ) {
      throw new Error("Można edytować wyłącznie wpisy o banach utworzone przez tego bota.");
    }

    const playerName = interaction.fields.getTextInputValue("player-name").trim();
    const duration = interaction.fields.getTextInputValue("duration").trim();
    const reason = interaction.fields.getTextInputValue("reason").trim();
    const appealable = interaction.fields.getTextInputValue("appealable").trim().toLocaleLowerCase("pl");
    if (!["tak", "nie"].includes(appealable)) {
      await interaction.reply({
        content: "Pole „Odwołanie” musi mieć wartość „tak” albo „nie”.",
        ephemeral: true,
      });
      return;
    }

    const embed = buildRobloxBanEmbed({
      playerName,
      duration,
      reason,
      appealable,
      staff: getEmbedField(existingEmbed, "Kto wystawił"),
      editedBy: `<@${interaction.user.id}>`,
      originalLog: existingEmbed.description,
    });
    await message.edit({
      embeds: [embed],
      components: [makeBanEditRow()],
      allowedMentions: { parse: [] },
    });
    await interaction.reply({ content: "Wpis o banie został zaktualizowany.", ephemeral: true });
    return;
  }

  if (interaction.customId.startsWith("submit-announcement:")) {
    if (!canPublishAnnouncement(interaction)) {
      await interaction.reply({
        content: "Tylko moderatorzy z uprawnieniem Zarządzanie serwerem mogą publikować ogłoszenia.",
        ephemeral: true,
      });
      return;
    }

    const [, destinationId, roleId = "none"] = interaction.customId.split(":");
    if (!destinationId) {
      throw new Error("Formularz ogłoszenia nie ma skonfigurowanego kanału.");
    }
    const destination = await interaction.guild.channels.fetch(destinationId);
    if (!destination?.isTextBased() || destination.type !== ChannelType.GuildText) {
      throw new Error("Kanał ogłoszeń nie istnieje albo nie jest kanałem tekstowym.");
    }
    const roleToPing = roleId === "none"
      ? null
      : await interaction.guild.roles.fetch(roleId);
    if (roleId !== "none" && !roleToPing) {
      throw new Error("Skonfigurowana rola do ghost pinga już nie istnieje.");
    }
    if (roleToPing) {
      const botMember = await interaction.guild.members.fetchMe();
      const destinationPermissions = botMember.permissionsIn(destination);
      if (
        !roleToPing.mentionable &&
        !destinationPermissions.has(PermissionFlagsBits.MentionEveryone)
      ) {
        throw new Error(
          `Bot nie może pingować roli ${roleToPing}. Włącz opcję „Może być wspomniana” albo nadaj botowi uprawnienie Wspominanie @everyone, @here i wszystkich ról na ${destination}.`,
        );
      }
      if (!destinationPermissions.has(PermissionFlagsBits.ManageMessages)) {
        throw new Error(
          `Bot potrzebuje uprawnienia Zarządzanie wiadomościami na ${destination}, aby usunąć ghost ping.`,
        );
      }
    }

    const title = interaction.fields.getTextInputValue("title").trim();
    const content = interaction.fields.getTextInputValue("content").trim();
    if (!title || !content) {
      await interaction.reply({
        content: "Tytuł i treść ogłoszenia nie mogą być puste.",
        ephemeral: true,
      });
      return;
    }

    const announcement = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(title)
      .setDescription(content)
      .setImage("attachment://zyciowka-rp.gif")
      .setFooter({ text: `Ogłoszenie od ${interaction.user.tag} • Animowany GIF` })
      .setTimestamp();
    await fs.access(announcementGifPath).catch((error) => {
      if (error.code === "ENOENT") {
        throw new Error(`Nie znaleziono animacji ogłoszenia: ${announcementGifPath}`);
      }
      throw error;
    });
    const botMember = await interaction.guild.members.fetchMe();
    if (!botMember.permissionsIn(destination).has(PermissionFlagsBits.AttachFiles)) {
      throw new Error(`Bot potrzebuje uprawnienia Załączanie plików na ${destination}.`);
    }
    await interaction.deferReply({ ephemeral: true });
    await destination.send({
      embeds: [announcement],
      files: [
        new AttachmentBuilder(announcementGifPath, {
          name: "zyciowka-rp.gif",
        }),
      ],
      allowedMentions: { parse: [] },
    });
    if (roleToPing) {
      try {
        const pingMessage = await destination.send({
          content: `<@&${roleToPing.id}>`,
          allowedMentions: { parse: [], roles: [roleToPing.id] },
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await pingMessage.delete();
      } catch (error) {
        console.error("Ogłoszenie opublikowano, ale ghost ping nie powiódł się:", error);
        await interaction.editReply({
          content: `Ogłoszenie zostało opublikowane na kanale ${destination}, ale ghost ping roli ${roleToPing} nie powiódł się. Sprawdź uprawnienia bota.`,
        });
        return;
      }
    }
    await interaction.editReply({
      content: `Ogłoszenie zostało opublikowane na kanale ${destination}${roleToPing ? `, a rola ${roleToPing} otrzymała ghost ping` : ""}.`,
    });
    return;
  }

  if (interaction.customId.startsWith("eh-log-submit:")) {
    const [, action, destinationId] = interaction.customId.split(":");
    const actionDetails = {
      kick: { title: "Wyrzucenie gracza", color: 0xf1c40f },
      ban: { title: "Ban gracza", color: 0xe74c3c },
      tempban: { title: "Ban czasowy gracza", color: 0xe67e22 },
      "admin-car": { title: "Użycie admin car", color: 0x3498db },
      fly: { title: "Użycie fly", color: 0x9b59b6 },
    };
    const details = actionDetails[action];
    if (!details || !destinationId) {
      throw new Error("Nieprawidłowe dane formularza logów Emergency Hamburg.");
    }
    if (!canSubmitModerationLog(interaction)) {
      await interaction.reply({
        content: "Tylko moderatorzy mogą wysyłać zgłoszenia do logów.",
        ephemeral: true,
      });
      return;
    }

    const destination = await interaction.guild.channels.fetch(destinationId);
    if (!destination?.isTextBased() || destination.type !== ChannelType.GuildText) {
      throw new Error("Kanał logów nie istnieje albo nie jest kanałem tekstowym.");
    }

    const playerName = interaction.fields.getTextInputValue("player-name").trim();
    if (action === "ban") {
      const duration = interaction.fields.getTextInputValue("duration").trim();
      const reason = interaction.fields.getTextInputValue("reason").trim();
      const appealable = interaction.fields.getTextInputValue("appealable").trim().toLocaleLowerCase("pl");
      if (!["tak", "nie"].includes(appealable)) {
        await interaction.reply({
          content: "Pole „Odwołanie” musi mieć wartość „tak” albo „nie”.",
          ephemeral: true,
        });
        return;
      }

      const banEmbed = buildRobloxBanEmbed({
        playerName,
        duration,
        reason,
        appealable,
        staff: `<@${interaction.user.id}>`,
      });
      await destination.send({
        embeds: [banEmbed],
        components: [makeBanEditRow()],
        allowedMentions: { parse: [] },
      });
      await interaction.reply({
        content: `Wpis o banie gracza ${playerName} został wysłany na kanał ${destination}.`,
        ephemeral: true,
      });
      return;
    }

    const robloxIdentity = interaction.fields.getTextInputValue("roblox-id").trim();
    const reason = interaction.fields.getTextInputValue("reason").trim();
    if (!/^\d{1,20}$/.test(robloxId) || /^0+$/.test(robloxId)) {
      await interaction.reply({
        content: "Roblox ID musi składać się z cyfr i być prawidłowym ID konta.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(details.color)
      .setTitle(details.title)
      .addFields(
        { name: "Gracz", value: playerName },
        { name: "Roblox ID", value: robloxId },
        { name: "Powód", value: reason },
        { name: "Osoba zgłaszająca", value: interaction.user.tag },
      )
      .setFooter({ text: "Emergency Hamburg × Polonia RP" })
      .setTimestamp();

    if (action === "admin-car" || action === "fly") {
      const extraDetails = interaction.fields.getTextInputValue("details").trim();
      if (extraDetails) {
        embed.addFields({ name: "Dodatkowe informacje", value: extraDetails });
      }
    }
    if (action === "tempban") {
      const duration = interaction.fields.getTextInputValue("duration").trim();
      embed.addFields({ name: "Czas trwania", value: duration });
    }

    await destination.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await interaction.reply({
      content: `Zgłoszenie „${details.title}” zostało wysłane na kanał ${destination}.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId.startsWith("submit-id-card:")) {
    const destinationId = interaction.customId.slice("submit-id-card:".length);
    const destination = await interaction.guild.channels.fetch(destinationId);
    if (!destination?.isTextBased() || destination.type !== ChannelType.GuildText) {
      throw new Error("Kanał docelowy nie istnieje albo nie jest kanałem tekstowym.");
    }

    const fullName = interaction.fields.getTextInputValue("full-name").trim();
    const ageText = interaction.fields.getTextInputValue("age").trim();
    const gender = interaction.fields.getTextInputValue("gender").trim();
    const citizenship = interaction.fields.getTextInputValue("citizenship").trim();
    const robloxIdentity = interaction.fields.getTextInputValue("roblox-id").trim();
    const age = Number(ageText);
    if (!/^\d+$/.test(ageText) || !Number.isInteger(age) || age < 1 || age > 120) {
      await interaction.reply({
        content: "Wiek musi być liczbą od 1 do 120. Kliknij przycisk, aby wypełnić formularz ponownie.",
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const profile = await getRobloxProfileFromIdentity(robloxIdentity);
    const profileUrl = `https://www.roblox.com/users/${profile.id}/profile`;
    const card = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Dowód osobisty - ${profile.username}`)
      .setURL(profileUrl)
      .addFields(
        { name: "Imię i nazwisko", value: fullName },
        { name: "Wiek", value: ageText },
        { name: "Płeć", value: gender },
        { name: "Obywatelstwo", value: citizenship },
        { name: "Użytkownik Discord", value: `<@${interaction.user.id}>` },
        { name: "Konto Roblox", value: `[@${profile.username}](${profileUrl})` },
        { name: "ID Roblox", value: `[${profile.id}](${profileUrl})` },
      )
      .setThumbnail(profile.imageUrl)
      .setFooter({ text: "Dowody osobiste × Polonia RP" });

    await destination.send({
      content: `<@${interaction.user.id}> Twój dowód osobisty został opublikowany.`,
      embeds: [card],
      allowedMentions: { parse: [], users: [interaction.user.id] },
    });
    await updateWebhookConfig(interaction.guildId, { idCardChannelId: destination.id });
    await interaction.editReply({ content: `Dowód osobisty został wysłany na kanał ${destination}.` });
    return;
  }

  if (interaction.customId === "verify-math-answer") {
    await interaction.reply({
      content: "To zadanie należy do starego panelu. Poproś administrację o opublikowanie nowego panelu weryfikacji.",
      ephemeral: true,
    });
    return;
  }
  if (!interaction.customId.startsWith("verify-math-answer:")) return;

  const roleIds = interaction.customId.split(":").slice(1);
  const removeRoleId = roleIds.pop();
  const giveRoleIds = roleIds;
  if (
    (giveRoleIds.length !== 1 && giveRoleIds.length !== 2) ||
    giveRoleIds.some((id) => !id) ||
    !removeRoleId ||
    new Set([...giveRoleIds, removeRoleId]).size !== giveRoleIds.length + 1
  ) {
    throw new Error("Formularz weryfikacji ma nieprawidłowo skonfigurowane role.");
  }

  const key = challengeKey(interaction.guildId, interaction.user.id);
  const challenge = verificationChallenges.get(key);
  verificationChallenges.delete(key);
  if (
    !challenge ||
    challenge.expiresAt < Date.now() ||
    challenge.giveRoleIds.join(":") !== giveRoleIds.join(":") ||
    challenge.removeRoleId !== removeRoleId
  ) {
    await interaction.reply({
      content: "To zadanie wygasło. Kliknij przycisk w panelu i spróbuj ponownie.",
      ephemeral: true,
    });
    return;
  }

  const answer = Number(interaction.fields.getTextInputValue("answer").trim());
  if (!Number.isInteger(answer) || answer !== challenge.answer) {
    await interaction.reply({
      content: "Niepoprawny wynik. Kliknij przycisk w panelu, aby otrzymać nowe zadanie.",
      ephemeral: true,
    });
    return;
  }

  const [rolesToGive, roleToRemove] = await Promise.all([
    Promise.all(giveRoleIds.map((id) => interaction.guild.roles.fetch(id))),
    interaction.guild.roles.fetch(removeRoleId),
  ]);
  if (rolesToGive.some((role) => !role) || !roleToRemove) {
    throw new Error("Jedna z ról panelu weryfikacji już nie istnieje.");
  }
  const allRoles = [...rolesToGive, roleToRemove];
  if (
    new Set(allRoles.map((role) => role.id)).size !== allRoles.length ||
    allRoles.some((role) => role.id === interaction.guild.id || role.managed)
  ) {
    throw new Error("Role panelu weryfikacji są nieprawidłowe albo zarządzane przez integrację.");
  }

  const botMember = await interaction.guild.members.fetchMe();
  if (allRoles.some((role) => botMember.roles.highest.comparePositionTo(role) <= 0)) {
    throw new Error("Rola bota musi być wyżej niż role nadawane i zabierana.");
  }
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (rolesToGive.every((role) => member.roles.cache.has(role.id))) {
    await interaction.reply({ content: "Jesteś już zweryfikowany.", ephemeral: true });
    return;
  }

  await member.roles.add(rolesToGive, "Poprawna odpowiedź w weryfikacji matematycznej");
  if (member.roles.cache.has(roleToRemove.id)) {
    try {
      await member.roles.remove(roleToRemove, "Poprawna odpowiedź w weryfikacji matematycznej");
    } catch (error) {
      throw new Error(
        `Nadano role ${rolesToGive.map((role) => role.name).join(" i ")}, ale nie udało się zabrać roli ${roleToRemove.name}: ${error.message}`,
      );
    }
  }
  await interaction.reply({
    content: `Weryfikacja zakończona pomyślnie. Otrzymujesz role ${rolesToGive.join(" i ")} i tracisz rolę ${roleToRemove}.`,
    ephemeral: true,
  });
}

client.once("ready", async () => {
  console.info(`Zalogowano jako ${client.user.tag}.`);
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);

  try {
    await rest.put(route, { body: commands });
    console.info(
      `Zarejestrowano ${commands.length} komend slash${process.env.GUILD_ID ? " na serwerze" : " globalnie"}.`,
    );
  } catch (error) {
    console.error("Nie udało się automatycznie zarejestrować komend Discord:", error);
    process.exitCode = 1;
    await client.destroy();
  }
});

client.on("messageCreate", (message) => {
  if (!message.guild) {
    if (weaponPermitIdentityRequests[message.author.id]) {
      handleWeaponPermitIdentityAnswer(message).catch((error) => {
        console.error("Nie udało się opublikować pozwolenia na broń:", error);
        message.reply(`Nie udało się opublikować pozwolenia: ${error.message} Twoja odpowiedź została zachowana; sprawdź dane i spróbuj ponownie.`)
          .catch((replyError) => console.error("Nie udało się poinformować o błędzie pozwolenia:", replyError));
      });
    } else {
      handleWeaponPermitAnswer(message).catch((error) => {
        clearWeaponPermitApplication(message.author.id);
        console.error("Nie udało się obsłużyć odpowiedzi na wniosek o pozwolenie na broń:", error);
        message.author.send("Nie udało się przetworzyć odpowiedzi. Rozpocznij wniosek ponownie z panelu na serwerze.")
          .catch((replyError) => console.error("Nie udało się powiadomić o błędzie wniosku:", replyError));
      });
    }
    return;
  }
  handleBotKickChannelMessage(message).catch((error) => {
    console.error("Nie udało się obsłużyć wiadomości na kanale automatycznego wyrzucania:", error);
  });
  handleGameWebhookMessage(message).catch((error) => {
    console.error("Nie udało się przetworzyć logu webhooka Emergency Hamburg:", error);
  });
});

client.on("guildMemberAdd", (member) => {
  if (!member.user.bot || member.id === client.user?.id) return;

  member.kick("Automatyczne usuwanie botów z serwera.").catch((error) => {
    console.error(
      `Nie udało się wyrzucić bota ${member.user.tag} (${member.id}) z serwera ${member.guild.name} (${member.guild.id}):`,
      error,
    );
  });
});

client.on("voiceStateUpdate", (oldState, newState) => {
  if (!newState.guild || !newState.channelId || oldState.channelId === newState.channelId) return;
  if (newState.member?.user.bot) return;

  const config = webhookConfigs[newState.guild.id];
  if (newState.channelId !== config?.waitingRoomVoiceChannelId) return;
  if (!config.waitingRoomRoleId || !config.waitingRoomTextChannelId) {
    console.error(`Niepełna konfiguracja pingów poczekalni dla serwera ${newState.guild.id}.`);
    return;
  }
  const cooldownKey = `${newState.guild.id}:${newState.id}`;
  const lastPingAt = waitingRoomPingCooldowns.get(cooldownKey) ?? 0;
  if (Date.now() - lastPingAt < waitingRoomPingCooldownMs) return;
  waitingRoomPingCooldowns.set(cooldownKey, Date.now());

  newState.guild.channels.fetch(config.waitingRoomTextChannelId)
    .then((channel) => {
      if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
        throw new Error(`Kanał pingów ${config.waitingRoomTextChannelId} nie istnieje albo nie jest tekstowy.`);
      }

      return channel.send({
        content: `<@&${config.waitingRoomRoleId}> <@${newState.id}> czeka na obsługę w poczekalni głosowej <#${newState.channelId}>.`,
        allowedMentions: {
          parse: [],
          roles: [config.waitingRoomRoleId],
          users: [newState.id],
        },
      });
    })
    .catch((error) => {
      waitingRoomPingCooldowns.delete(cooldownKey);
      console.error("Nie udało się wysłać pingów z poczekalni:", error);
    });
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (error) {
    console.error("Błąd obsługi interakcji Discord:", error);
    const content = `Nie udało się wykonać tej czynności: ${error.message}`;
    if (interaction.deferred) {
      await interaction.editReply({ content }).catch((replyError) => {
        console.error("Nie udało się poinformować użytkownika o błędzie:", replyError);
      });
    } else if (interaction.replied) {
      await interaction.followUp({ content, ephemeral: true }).catch((replyError) => {
        console.error("Nie udało się poinformować użytkownika o błędzie:", replyError);
      });
    } else {
      await interaction.reply({ content, ephemeral: true }).catch((replyError) => {
        console.error("Nie udało się poinformować użytkownika o błędzie:", replyError);
      });
    }
  }
});

const missing = getMissingConfiguration(["DISCORD_TOKEN", "CLIENT_ID"]);
if (missing.length) {
  console.error(`Brak wymaganych zmiennych środowiskowych: ${missing.join(", ")}. Skopiuj .env.example do .env i uzupełnij wartości.`);
  process.exitCode = 1;
} else {
  Promise.all([loadWebhookConfigs(), loadWeaponPermitIdentityRequests()])
    .then(() => client.login(process.env.DISCORD_TOKEN))
    .catch((error) => {
      console.error("Nie udało się uruchomić bota lub wczytać konfiguracji:", error);
      process.exitCode = 1;
    });
}

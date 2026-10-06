require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ChannelType,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
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
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});
const verificationChallenges = new Map();
const challengeLifetimeMs = 5 * 60 * 1000;
const waitingRoomPingCooldownMs = 30 * 1000;
const waitingRoomPingCooldowns = new Map();
const webhookConfigPath = path.join(__dirname, "..", "data", "eh-webhook-config.json");
let webhookConfigs = {};

function getMissingConfiguration(keys) {
  return keys.filter((key) => !process .env[key]);
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
  if (typeof profile.name !== "string" || !profile.name) {
    throw new Error("Roblox API nie zwróciło nazwy konta dla podanego ID.");
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

  return { username: profile.name, imageUrl };
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
    .setFooter({ text: "Zyciówka RP × Bany Emergency Hamburg" })
    .setTimestamp();

  if (originalLog) {
    embed.setDescription(originalLog.slice(0, 4000));
  }
  if (editedBy) {
    embed.addFields({ name: "Ostatnia edycja", value: limitField(editedBy) });
  }

  return embed;
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
    .setFooter({ text: "Zyciówka RP × Emergency Hamburg" })
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

async function handleCommand(interaction) {
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
    const roleToGive = interaction.options.getRole("rola-do-nadania", true);
    const roleToRemove = interaction.options.getRole("rola-do-zabrania", true);
    if (channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "Wybierz zwykły kanał tekstowy na panel weryfikacji.",
        ephemeral: true,
      });
      return;
    }
    if (roleToGive.id === roleToRemove.id) {
      await interaction.reply({
        content: "Wybierz dwie różne role: jedną do nadania i jedną do zabrania.",
        ephemeral: true,
      });
      return;
    }

    const botMember = await interaction.guild.members.fetchMe();
    const unmanageableRole = [roleToGive, roleToRemove].find(
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
      .setTitle("Weryfikacja — Zyciówka RP")
      .setDescription(
        `Kliknij przycisk poniżej i rozwiąż krótkie działanie matematyczne.\nPo poprawnej odpowiedzi otrzymasz rolę ${roleToGive}, a rola ${roleToRemove} zostanie zabrana.`,
      )
      .setFooter({ text: "Weryfikacja dotyczy dostępu do Discorda, nie potwierdza konta w grze Emergency Hamburg." });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`verify-player:${roleToGive.id}:${roleToRemove.id}`)
        .setLabel("Zweryfikuj się")
        .setStyle(ButtonStyle.Success),
    );

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({
      content: `Panel weryfikacji opublikowano na kanale ${channel}. Po weryfikacji bot nada ${roleToGive} i zabierze ${roleToRemove}.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "setup-ogloszenia") {
    const destination = interaction.options.getChannel("kanal-ogloszen", true);
    if (destination.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "Wybierz zwykły kanał tekstowy na ogłoszenia.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Ogłoszenia — Zyciówka RP")
      .setDescription("Kliknij przycisk, aby napisać i opublikować ogłoszenie.")
      .setFooter({ text: "Ogłoszenia × Zyciówka RP" });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`create-announcement:${destination.id}`)
        .setLabel("Utwórz ogłoszenie")
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({
      content: `Panel ogłoszeń opublikowano. Ogłoszenia będą wysyłane na kanał ${destination}.`,
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
      .setFooter({ text: "Logi moderacji × Zyciówka RP" });
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

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Dowody osobiste")
      .setDescription("Kliknij przycisk poniżej, aby wyrobić dowód osobisty.")
      .setFooter({ text: "Dowody osobiste × Zyciówka RP" });
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
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        content: "Do użycia tej komendy potrzebujesz uprawnienia Zarządzanie wiadomościami.",
        ephemeral: true,
      });
      return;
    }

    const user = interaction.options.getUser("uzytkownik", true);
    const type = interaction.options.getString("typ", true);
    const reason = interaction.options.getString("powod", true).trim();
    const destination = interaction.options.getChannel("kanal", true);
    if (!["pochwala", "skarga"].includes(type)) {
      throw new Error("Nieprawidłowy typ wpisu.");
    }
    if (!reason) {
      await interaction.reply({ content: "Powód nie może być pusty.", ephemeral: true });
      return;
    }
    if (destination.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "Wybierz zwykły kanał tekstowy.", ephemeral: true });
      return;
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
      content: `${isPraise ? "Pochwała" : "Skarga"} została wysłana na kanał ${destination}.`,
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
    const destination = interaction.options.getChannel("kanal", true);
    if (!reason) {
      await interaction.reply({ content: "Powód zmiany roli nie może być pusty.", ephemeral: true });
      return;
    }
    if (destination.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "Wybierz zwykły kanał tekstowy.", ephemeral: true });
      return;
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
      embed?.footer?.text !== "Zyciówka RP × Bany Emergency Hamburg"
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
      embed?.footer?.text !== "Zyciówka RP × Emergency Hamburg"
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

    const destinationId = interaction.customId.slice("create-announcement:".length);
    const modal = new ModalBuilder()
      .setCustomId(`submit-announcement:${destinationId}`)
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
      ["roblox-id", "Roblox ID", TextInputStyle.Short, 1, 20],
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

  const [, giveRoleId, removeRoleId] = interaction.customId.split(":");
  if (!giveRoleId || !removeRoleId || giveRoleId === removeRoleId) {
    throw new Error("Panel weryfikacji ma nieprawidłowo skonfigurowane role.");
  }
  const [roleToGive, roleToRemove] = await Promise.all([
    interaction.guild.roles.fetch(giveRoleId),
    interaction.guild.roles.fetch(removeRoleId),
  ]);
  if (!roleToGive || !roleToRemove) {
    throw new Error("Jedna z ról panelu weryfikacji już nie istnieje.");
  }
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (member.roles.cache.has(roleToGive.id)) {
    await interaction.reply({ content: "Masz już przyznaną rolę zweryfikowanego gracza.", ephemeral: true });
    return;
  }

  const { question, answer } = makeChallenge();
  verificationChallenges.set(challengeKey(interaction.guildId, interaction.user.id), {
    answer,
    giveRoleId,
    removeRoleId,
    expiresAt: Date.now() + challengeLifetimeMs,
  });

  const modal = new ModalBuilder()
    .setCustomId(`verify-math-answer:${giveRoleId}:${removeRoleId}`)
    .setTitle("Weryfikacja Zyciówka RP");
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
      existingEmbed?.footer?.text !== "Zyciówka RP × Emergency Hamburg"
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
      existingEmbed?.footer?.text !== "Zyciówka RP × Bany Emergency Hamburg"
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

    const destinationId = interaction.customId.slice("submit-announcement:".length);
    const destination = await interaction.guild.channels.fetch(destinationId);
    if (!destination?.isTextBased() || destination.type !== ChannelType.GuildText) {
      throw new Error("Kanał ogłoszeń nie istnieje albo nie jest kanałem tekstowym.");
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
      .setFooter({ text: `Ogłoszenie od ${interaction.user.tag}` })
      .setTimestamp();
    await destination.send({ embeds: [announcement], allowedMentions: { parse: [] } });
    await interaction.reply({
      content: `Ogłoszenie zostało opublikowane na kanale ${destination}.`,
      ephemeral: true,
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

    const robloxId = interaction.fields.getTextInputValue("roblox-id").trim();
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
      .setFooter({ text: "Emergency Hamburg × Zyciówka RP" })
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
    const robloxId = interaction.fields.getTextInputValue("roblox-id").trim();
    const age = Number(ageText);
    if (!/^\d+$/.test(ageText) || !Number.isInteger(age) || age < 1 || age > 120) {
      await interaction.reply({
        content: "Wiek musi być liczbą od 1 do 120. Kliknij przycisk, aby wypełnić formularz ponownie.",
        ephemeral: true,
      });
      return;
    }
    if (!/^\d{1,20}$/.test(robloxId) || /^0+$/.test(robloxId)) {
      await interaction.reply({
        content: "Roblox ID musi być prawidłowym numerycznym ID konta. Kliknij przycisk, aby spróbować ponownie.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const profile = await getRobloxProfile(robloxId);
    const card = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Dowód osobisty - ${profile.username}`)
      .addFields(
        { name: "Imię i nazwisko", value: fullName },
        { name: "Wiek", value: ageText },
        { name: "Płeć", value: gender },
        { name: "Obywatelstwo", value: citizenship },
        { name: "Konto Roblox", value: `@${profile.username}` },
        { name: "ID Roblox", value: robloxId },
      )
      .setThumbnail(profile.imageUrl)
      .setFooter({ text: "Dowody osobiste × Zyciówka RP" });

    await destination.send({ embeds: [card] });
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

  const [, giveRoleId, removeRoleId] = interaction.customId.split(":");
  if (!giveRoleId || !removeRoleId || giveRoleId === removeRoleId) {
    throw new Error("Formularz weryfikacji ma nieprawidłowo skonfigurowane role.");
  }

  const key = challengeKey(interaction.guildId, interaction.user.id);
  const challenge = verificationChallenges.get(key);
  verificationChallenges.delete(key);
  if (
    !challenge ||
    challenge.expiresAt < Date.now() ||
    challenge.giveRoleId !== giveRoleId ||
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

  const [roleToGive, roleToRemove] = await Promise.all([
    interaction.guild.roles.fetch(giveRoleId),
    interaction.guild.roles.fetch(removeRoleId),
  ]);
  if (!roleToGive || !roleToRemove) {
    throw new Error("Jedna z ról panelu weryfikacji już nie istnieje.");
  }
  if (
    roleToGive.id === roleToRemove.id ||
    roleToGive.id === interaction.guild.id ||
    roleToRemove.id === interaction.guild.id ||
    roleToGive.managed ||
    roleToRemove.managed
  ) {
    throw new Error("Role panelu weryfikacji są nieprawidłowe albo zarządzane przez integrację.");
  }

  const botMember = await interaction.guild.members.fetchMe();
  if (
    botMember.roles.highest.comparePositionTo(roleToGive) <= 0 ||
    botMember.roles.highest.comparePositionTo(roleToRemove) <= 0
  ) {
    throw new Error("Rola bota musi być wyżej niż role nadawana i zabierana.");
  }
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (member.roles.cache.has(roleToGive.id)) {
    await interaction.reply({ content: "Jesteś już zweryfikowany.", ephemeral: true });
    return;
  }

  await member.roles.add(roleToGive, "Poprawna odpowiedź w weryfikacji matematycznej");
  if (member.roles.cache.has(roleToRemove.id)) {
    try {
      await member.roles.remove(roleToRemove, "Poprawna odpowiedź w weryfikacji matematycznej");
    } catch (error) {
      throw new Error(
        `Nadano rolę ${roleToGive.name}, ale nie udało się zabrać roli ${roleToRemove.name}: ${error.message}`,
      );
    }
  }
  await interaction.reply({
    content: `Weryfikacja zakończona pomyślnie. Otrzymujesz rolę ${roleToGive} i tracisz rolę ${roleToRemove}.`,
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
  handleGameWebhookMessage(message).catch((error) => {
    console.error("Nie udało się przetworzyć logu webhooka Emergency Hamburg:", error);
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
    if (interaction.deferred || interaction.replied) {
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
  loadWebhookConfigs()
    .then(() => client.login(process.env.DISCORD_TOKEN))
    .catch((error) => {
      console.error("Nie udało się uruchomić bota lub wczytać konfiguracji webhooków:", error);
      process.exitCode = 1;
    });
}

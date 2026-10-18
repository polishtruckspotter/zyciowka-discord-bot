const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");

const activityCheckCommand = new SlashCommandBuilder()
  .setName("aktywnosc")
  .setDescription("Konfiguruje panel checku aktywności.")
  .addSubcommandGroup((group) =>
    group
      .setName("check")
      .setDescription("Zarządzanie checkiem aktywności.")
      .addSubcommand((subcommand) => {
        let setup = subcommand
          .setName("setup")
          .setDescription("Publikuje panel do rozpoczynania checku aktywności.")
          .addChannelOption((option) =>
            option
              .setName("kanal-panelu")
              .setDescription("Kanał, na którym bot opublikuje panel.")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true),
          )
          .addChannelOption((option) =>
            option
              .setName("kanal-checku")
              .setDescription("Kanał, na który trafi check po kliknięciu przycisku.")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true),
          )
          .addRoleOption((option) =>
            option
              .setName("rola-do-pingowania")
              .setDescription("Rola pingowana przy rozpoczęciu checku.")
              .setRequired(true),
          );

        for (let roleIndex = 1; roleIndex <= 22; roleIndex += 1) {
          setup = setup.addRoleOption((option) =>
            option
              .setName(roleIndex === 1 ? "rola-uprawniona" : `rola-uprawniona-${roleIndex}`)
              .setDescription("Rola, której członkowie mogą użyć przycisku.")
              .setRequired(roleIndex === 1),
          );
        }

        return setup;
      }),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const botKickCommand = new SlashCommandBuilder()
  .setName("bot")
  .setDescription("Konfiguruje automatyczne wyrzucanie w wybranym kanale.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("kick")
      .setDescription("Ustawia kanał do automatycznego wyrzucania.")
      .addChannelOption((option) =>
        option
          .setName("kanal")
          .setDescription("Wiadomości na tym kanale uruchomią automatyczne wyrzucanie.")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const vehicleRegistrationCommand = new SlashCommandBuilder()
  .setName("zarejestruj")
  .setDescription("Rejestruje pojazd na serwerze.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("pojazd")
      .setDescription("Zarejestruj pojazd i opublikuj jego kartę.")
      .addStringOption((option) =>
        option
          .setName("marka")
          .setDescription("Marka pojazdu.")
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("model")
          .setDescription("Model pojazdu.")
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("kolor")
          .setDescription("Kolor pojazdu.")
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("tablice")
          .setDescription("Numer tablic rejestracyjnych.")
          .setMinLength(1)
          .setMaxLength(30)
          .setRequired(true),
      )
      .addUserOption((option) =>
        option
          .setName("wlasciciel")
          .setDescription("Właściciel pojazdu na Discordzie.")
          .setRequired(true),
      )
      .addAttachmentOption((option) =>
        option
          .setName("zdjecie")
          .setDescription("Zdjęcie rejestrowanego pojazdu.")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("instrukcja")
      .setDescription("Publikuje instrukcję rejestracji pojazdu."),
  );

const setupCommand = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Konfiguruje panele zgłoszeń i rekrutacji.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("tickets")
      .setDescription("Publikuje panel pięciu kategorii ticketów.")
      .addChannelOption((option) =>
        option.setName("kanal-panelu").setDescription("Kanał, na którym opublikować panel.").addChannelTypes(ChannelType.GuildText).setRequired(true),
      )
      .addChannelOption((option) =>
        option.setName("kategoria-ticketow").setDescription("Jedna kategoria Discord, w której będą tworzone wszystkie tickety.").addChannelTypes(ChannelType.GuildCategory).setRequired(true),
      )
      .addRoleOption((option) =>
        option.setName("rola-personelu").setDescription("Rola, która może widzieć i obsługiwać tickety.").setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("rekru")
      .setDescription("Publikuje panel podań rekrutacyjnych wysyłanych przez DM.")
      .addChannelOption((option) =>
        option.setName("kanal-panelu").setDescription("Kanał, na którym opublikować panel rekrutacji.").addChannelTypes(ChannelType.GuildText).setRequired(true),
      )
      .addChannelOption((option) =>
        option.setName("kanal-podan").setDescription("Prywatny kanał, na który bot wyśle gotowe podania.").addChannelTypes(ChannelType.GuildText).setRequired(true),
      )
      .addRoleOption((option) =>
        option.setName("rola-rekrutacji").setDescription("Rola pingowana przy nowym podaniu; musi widzieć kanał podań.").setRequired(true),
      )
      .addRoleOption((option) =>
        option.setName("rola-po-akceptacji").setDescription("Rola nadawana kandydatowi po zaakceptowaniu podania.").setRequired(true),
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const findRecordCommand = new SlashCommandBuilder()
  .setName("znajdz")
  .setDescription("Wyszukuje rekord użytkownika.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("pojazd")
      .setDescription("Znajdź zarejestrowane pojazdy użytkownika.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Użytkownik Discord.")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("pozwolenie-na-bron")
      .setDescription("Znajdź pozwolenie na broń użytkownika.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Użytkownik Discord.")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("dowod")
      .setDescription("Znajdź dowód osobisty użytkownika.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Użytkownik Discord.")
          .setRequired(true),
      ),
  );

const commands = [
  setupCommand,
  activityCheckCommand,
  botKickCommand,
  vehicleRegistrationCommand,
  findRecordCommand,
  new SlashCommandBuilder()
    .setName("informacja")
    .setDescription("Wyświetla informacje o dostępnych funkcjach bota.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ekonomia")
        .setDescription("Pokazuje komendy i zasady ekonomii serwerowej."),
    ),
  new SlashCommandBuilder()
    .setName("setup-weryfikacja")
    .setDescription("Konfiguruje panel weryfikacji, role oraz kanał.")
    .addChannelOption((option) =>
      option
        .setName("kanal")
        .setDescription("Kanał, na którym bot opublikuje panel.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("rola-do-nadania")
        .setDescription("Pierwsza rola przyznawana po poprawnej weryfikacji.")
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("rola-do-nadania-2")
        .setDescription("Druga rola przyznawana po poprawnej weryfikacji.")
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("rola-do-zabrania")
        .setDescription("Rola zabierana po poprawnej weryfikacji.")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("setup-dowody")
    .setDescription("Publikuje panel wyrabiania dowodu osobistego.")
    .addChannelOption((option) =>
      option
        .setName("kanal-dowodow")
        .setDescription("Kanał, na którym bot będzie publikować gotowe dowody.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("setup-logi-bany-kicki")
    .setDescription("Konfiguruje kanał webhooka gry i panel logów banów oraz wyrzuceń.")
    .addChannelOption((option) =>
      option
        .setName("kanal-zrodlowy")
        .setDescription("Kanał, na którym webhook gry publikuje swoje logi.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("kanal-ban-kick")
        .setDescription("Kanał, na który bot ma przekazywać wykryte bany i wyrzucenia.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("setup-logi-inne")
    .setDescription("Publikuje panel do zapisywania użycia admin car i fly.")
    .addChannelOption((option) =>
      option
        .setName("kanal-inne")
        .setDescription("Kanał, na którym bot będzie publikować pozostałe logi.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("setup-ogloszenia")
    .setDescription("Publikuje panel do tworzenia ogłoszeń na wybranym kanale.")
    .addChannelOption((option) =>
      option
        .setName("kanal-ogloszen")
        .setDescription("Kanał, na którym bot będzie publikować ogłoszenia.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("rola-do-pingowania")
        .setDescription("Opcjonalna rola do ghost pinga przy publikacji ogłoszeń.")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("setup-pozwolenie-na-bron")
    .setDescription("Publikuje panel wniosków o pozwolenie na broń.")
    .addChannelOption((option) =>
      option
        .setName("kanal-panelu")
        .setDescription("Kanał, na którym użytkownicy rozpoczną składanie wniosku.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("kanal-wnioskow")
        .setDescription("Prywatny kanał dla wniosków oczekujących na decyzję personelu.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("rola-po-akceptacji")
        .setDescription("Rola nadawana po zaakceptowaniu wniosku.")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("setup-ping-poczekalnia")
    .setDescription("Ustawia automatyczne pingowanie roli po wejściu do poczekalni głosowej.")
    .addChannelOption((option) =>
      option
        .setName("kanal-glosowy")
        .setDescription("Kanał głosowy pełniący funkcję poczekalni.")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("rola-do-pingowania")
        .setDescription("Rola pingowana, gdy ktoś dołączy do poczekalni.")
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("kanal-pingow")
        .setDescription("Kanał tekstowy, na którym bot opublikuje ping.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("pochwala-skarga")
    .setDescription("Wysyła pochwałę albo skargę o użytkowniku na przypisany kanał.")
    .addUserOption((option) =>
      option.setName("uzytkownik").setDescription("Osoba, której dotyczy wpis.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("typ")
        .setDescription("Wybierz pochwałę albo skargę.")
        .addChoices(
          { name: "Pochwała", value: "pochwala" },
          { name: "Skarga", value: "skarga" },
        )
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("powod").setDescription("Powód pochwały albo skargi.").setMaxLength(1000).setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("awansdegrad")
    .setDescription("Awansuje albo degraduje użytkownika przez zmianę jego roli.")
    .addUserOption((option) =>
      option.setName("uzytkownik").setDescription("Osoba do awansowania albo degradacji.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("akcja")
        .setDescription("Wybierz awans albo degradację.")
        .addChoices(
          { name: "Awans", value: "awans" },
          { name: "Degradacja", value: "degrad" },
        )
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName("rola").setDescription("Rola do nadania przy awansie lub zabrania przy degradacji.").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("powod").setDescription("Powód awansu albo degradacji.").setMaxLength(500).setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("kanal")
        .setDescription("Kanał, na który wysłać embed z informacją o zmianie.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder()
    .setName("plusa")
    .setDescription("Składa wniosek o przyznanie plusa.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("wniosek")
        .setDescription("Wyślij wniosek o przyznanie plusa.")
        .addIntegerOption((option) =>
          option
            .setName("ile")
            .setDescription("Liczba plusów, o które składasz wniosek.")
            .setMinValue(1)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("dlaczego")
            .setDescription("Uzasadnienie wniosku.")
            .setMaxLength(1000)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("osoby-potwierdzajace")
            .setDescription("Osoby, które mogą potwierdzić wniosek.")
            .setMaxLength(500)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("dowod")
            .setDescription("Opcjonalny link lub opis dowodu.")
            .setMaxLength(1000),
        ),
    ),
  new SlashCommandBuilder()
    .setName("plusminus")
    .setDescription("Nadaje albo zabiera rolę użytkownikowi i zapisuje zmianę na kanale logów.")
    .addUserOption((option) =>
      option.setName("uzytkownik").setDescription("Osoba, której zmienić rolę.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("akcja")
        .setDescription("Wybierz, czy nadać rolę, czy ją zabrać.")
        .addChoices(
          { name: "Plus — nadaj rolę", value: "plus" },
          { name: "Minus — zabierz rolę", value: "minus" },
        )
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName("rola").setDescription("Rola do nadania albo zabrania.").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("powod").setDescription("Powód zmiany roli.").setMaxLength(500).setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder()
    .setName("urlop")
    .setDescription("Składa wniosek o urlop do rozpatrzenia przez personel.")
    .addChannelOption((option) =>
      option
        .setName("kanal-wnioskow")
        .setDescription("Prywatny kanał, na którym personel rozpatruje wnioski o urlop.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("ostrzez")
    .setDescription("Wysyła ostrzeżenie użytkownikowi.")
    .addUserOption((option) =>
      option.setName("uzytkownik").setDescription("Osoba do ostrzeżenia.").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("powod").setDescription("Powód ostrzeżenia.").setMaxLength(500),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Nadaje użytkownikowi timeout.")
    .addUserOption((option) =>
      option.setName("uzytkownik").setDescription("Osoba do wyciszenia.").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("minuty")
        .setDescription("Czas timeoutu w minutach (1–40320).")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("powod").setDescription("Powód timeoutu.").setMaxLength(500),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Wycisza użytkownika na określoną liczbę minut.")
    .addStringOption((option) =>
      option.setName("powod").setDescription("Powód wyciszenia.").setMaxLength(500).setRequired(true),
    )
    .addUserOption((option) =>
      option.setName("uzytkownik").setDescription("Osoba do wyciszenia.").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("minuty")
        .setDescription("Czas wyciszenia w minutach (1–40320).")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Wyrzuca użytkownika z serwera.")
    .addStringOption((option) =>
      option.setName("powod").setDescription("Powód wyrzucenia.").setMaxLength(500).setRequired(true),
    )
    .addUserOption((option) =>
      option.setName("uzytkownik").setDescription("Osoba do wyrzucenia.").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banuje użytkownika na serwerze.")
    .addStringOption((option) =>
      option.setName("powod").setDescription("Powód bana.").setMaxLength(500).setRequired(true),
    )
    .addUserOption((option) =>
      option.setName("uzytkownik").setDescription("Osoba do zbanowania.").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("usun_wiadomosci_godziny")
        .setDescription("Usuń wiadomości użytkownika z ostatnich 0–168 godzin.")
        .setMinValue(0)
        .setMaxValue(168),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder()
    .setName("wyczysc")
    .setDescription("Usuwa od 1 do 100 ostatnich wiadomości z kanału.")
    .addIntegerOption((option) =>
      option
        .setName("liczba")
        .setDescription("Liczba wiadomości do usunięcia (1–100).")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map((command) => command.toJSON());

module.exports = { commands };

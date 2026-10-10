# Zyciówka RP — bot Discord

Polskojęzyczny bot do weryfikacji członków i podstawowej moderacji serwera Discord. Weryfikacja polega na rozwiązaniu prostego działania matematycznego i nadaniu skonfigurowanej roli Discord. Nie sprawdza obecności gracza ani jego konta w Roblox/Emergency Hamburg.

## Wymagania

- Node.js 20 lub nowszy
- Aplikacja bota utworzona w [Discord Developer Portal](https://discord.com/developers/applications)
- Bot zaproszony na serwer z uprawnieniami do używanych komend i nadawania roli

## Konfiguracja

1. Zainstaluj zależności:

   ```sh
   npm install
   ```

2. Skopiuj `.env.example` jako `.env` i uzupełnij:
   - `DISCORD_TOKEN` — token bota; nie udostępniaj go nikomu.
   - `CLIENT_ID` — Application ID aplikacji Discord.
   - `GUILD_ID` — ID serwera. Jeśli jest ustawione, komendy zarejestrują się tylko na tym serwerze (zalecane podczas konfiguracji).
   - `MOD_LOG_CHANNEL_ID` — opcjonalne ID kanału logów moderacji.

3. W Discord Developer Portal → Bot → Privileged Gateway Intents włącz **Message Content Intent**. Bot potrzebuje go, aby odczytywać treść logów wysyłanych przez webhook gry. Włącz również **Server Members Intent** (`Guild Members`), aby wykrywać dołączających członków i wyrzucać boty. Bot korzysta też z intents `Guilds` i `Guild Messages`.

4. Zaproś bota na serwer ze scope'ami `bot` i `applications.commands`. Przyznaj mu co najmniej:
   - View Channels, Send Messages i Embed Links,
   - Manage Roles (oraz ustaw najwyższą rolę bota wyżej niż obie role wybrane w `/setup-weryfikacja`),
   - Moderate Members, Kick Members, Ban Members i Manage Messages dla funkcji moderacji. Uprawnienie Kick Members jest wymagane także do automatycznego wyrzucania botów.

5. Uruchom bota:

   ```sh
   npm start
   ```

   Bot automatycznie rejestruje komendy po zalogowaniu. Jeśli ustawiono `GUILD_ID`, komendy są rejestrowane na tym serwerze; bez niego są rejestrowane globalnie.

## Wdrożenie na Wispbyte

Bot jest procesem Discord Gateway, więc nie potrzebuje strony WWW ani otwartego portu.

1. Utwórz serwer Node.js na Wispbyte i wybierz wersję Node.js 20 lub nowszą.
2. Prześlij cały folder `bot` do `/home/container/bot`. Powinny się w nim znajdować `package.json`, `package-lock.json`, `.env.example` i `src/`. Nie przesyłaj `node_modules` ani lokalnego pliku `.env`.
3. W ustawieniach zmiennych środowiskowych serwera dodaj:
   - `DISCORD_TOKEN` — token bota.
   - `CLIENT_ID` — Application ID bota.
   - `GUILD_ID` — opcjonalny ID serwera Discord; zalecany, żeby komendy pojawiły się szybciej podczas konfiguracji.
   - `MOD_LOG_CHANNEL_ID` — opcjonalny ID kanału logów moderacji.
4. Zainstaluj zależności jednorazowo z konsoli Wispbyte (nie ustawiaj tego jako Startup Command):

   ```sh
   cd bot && npm install
   ```

   Wispbyte uruchamia polecenia z `/home/container`, więc `bot/` wskazuje na `/home/container/bot`. Nie uruchamiaj `npm install` przy każdym restarcie, bo to wydłuża start.
5. W polu **Startup Command** Wispbyte ustaw komendę, która uruchamia bota:

   ```sh
   cd /home/container/bot && npm start
   ```

   Nie używaj tu samego `npm install`: po zainstalowaniu pakietów proces kończy się, a bot pozostaje offline. Skrypt `npm start` uruchamia `node src/index.js` i pozostawia proces bota działający.
6. Komendy slash są rejestrowane automatycznie przy starcie bota. Ustaw `GUILD_ID`, aby rejestrować je na jednym serwerze i szybciej zobaczyć zmiany.

Dodaj `DISCORD_TOKEN` i `CLIENT_ID` w ustawieniach zmiennych środowiskowych Wispbyte. Jeśli bot nie może się zalogować, sprawdź logi konsoli oraz czy te zmienne są ustawione bez dodatkowych cudzysłowów lub spacji. Nie publikuj tokena ani nie umieszczaj go w plikach przesyłanych publicznie.

## Komendy

- `data/` zawiera puste pliki JSON na przyszłą konfigurację, modmail, logi, ostrzeżenia, tickety i tymczasowe bany.
- `api/` zawiera placeholdery o nazwach z przykładowej struktury. To nie są jeszcze działające endpointy i nie są używane przez bota.
- `/setup-weryfikacja kanal rola-do-nadania rola-do-nadania-2 rola-do-zabrania` — publikuje panel w wybranym kanale. Po poprawnej odpowiedzi matematycznej bot nada dwie wybrane role i zabierze wskazaną rolę. Wymaga uprawnienia Zarządzanie serwerem.
- `/setup-dowody kanal-dowodow` — publikuje w bieżącym kanale panel do wyrobienia dowodu. Po kliknięciu użytkownik wypełnia formularz z imieniem i nazwiskiem, wiekiem, płcią, obywatelstwem i Roblox ID. Bot pobiera nazwę konta oraz awatar z publicznego Roblox API, a gotowy dowód wysyła na wybrany kanał. Wymaga uprawnienia Zarządzanie serwerem.
- `/setup-logi-bany-kicki kanal-zrodlowy kanal-ban-kick` — wybiera kanał, na którym webhook gry publikuje logi, oraz kanał docelowy dla banów i wyrzuceń. Bot przekazuje wykryte bany jako edytowalne karty, a wyrzucenia jako logi.
- `/setup-logi-inne kanal-inne` — wybiera kanał docelowy dla pozostałych webhooków i publikuje panel ręcznego zgłaszania użycia admin car lub fly.
- `/setup-ogloszenia kanal-ogloszen [rola-do-pingowania]` — publikuje panel tworzenia ogłoszeń. Moderator z uprawnieniem Zarządzanie serwerem może wpisać tytuł i treść, a bot opublikuje ogłoszenie z GIF-em `zyciówka rp.gif` na wybranym kanale. Opcjonalna rola otrzyma ghost ping; bot musi mieć uprawnienia Załączanie plików i (jeśli rola jest wybrana) Zarządzanie wiadomościami oraz możliwość wspominania tej roli.
- `/setup-pozwolenie-na-bron kanal-panelu kanal-wnioskow rola-po-akceptacji` — publikuje panel wniosków. Bot wysyła pytania po kolei w DM, a komplet odpowiedzi zapisuje w embedzie na kanale wniosków. Personel z uprawnieniem Zarządzanie serwerem, Moderowanie członków, Wyrzucanie członków lub Banowanie członków może zaakceptować albo odrzucić wniosek; akceptacja nadaje skonfigurowaną rolę. Wnioski wygasają po 15 minutach, jeśli nie zostaną ukończone; użytkownik może anulować je, wpisując `anuluj`.
- `/setup-ping-poczekalnia kanal-glosowy rola-do-pingowania kanal-pingow` — po wejściu członka do wskazanego kanału głosowego bot pingnie wybraną rolę i członka na wybranym kanale tekstowym. Wymaga uprawnienia Zarządzanie serwerem.
- `/plusminus` — nadaje albo zabiera rolę i wysyła embed na stały kanał logów `1555191573736591421`.
- `/pochwala-skarga` — osoby z uprawnieniem Zarządzanie wiadomościami na serwerze mogą użyć komendy na dowolnym kanale; skargi trafiają na `1556261784304746556`, a pochwały na `1556261886037860403`, zależnie od wybranego typu wpisu.
- `/urlop kanal-wnioskow` — otwiera polski formularz z wymaganym czasem trwania i powodem oraz opcjonalnymi informacjami. Wniosek trafia na wybrany kanał z przyciskami zaakceptowania urlopu, zakończenia zaakceptowanego urlopu albo zakończenia go z podanym powodem. Przyciski obsługuje personel z uprawnieniem Zarządzanie serwerem, Moderowanie członków, Wyrzucanie członków lub Banowanie członków.
- `/ostrzez` — ostrzega użytkownika; bot próbuje wysłać mu wiadomość prywatną. Wymaga uprawnienia Moderowanie członków.
- `/timeout` — nakłada timeout od 1 minuty do 28 dni. Wymaga uprawnienia Moderowanie członków.
- `/mute` — wycisza użytkownika przez Discord timeout na 1 minutę do 28 dni; wymaga powodu i czasu trwania. Wymaga uprawnienia Moderowanie członków.
- Automatyczne wyrzucanie botów — bot wyrzuca każde nowe konto bota zaraz po dołączeniu. Obejmuje to także legalne integracje; boty obecne na serwerze przed uruchomieniem tej funkcji nie są wyrzucane.
- `/kick` — wyrzuca użytkownika; wymaga podania powodu. Wymaga uprawnienia Wyrzucanie członków.
- `/ban` — banuje użytkownika; wymaga podania powodu i opcjonalnie usuwa jego wiadomości z ostatnich 0–168 godzin. Wymaga uprawnienia Banowanie członków.
- `/wyczysc` — usuwa od 1 do 100 wiadomości młodszych niż 14 dni w bieżącym kanale. Wymaga uprawnienia Zarządzanie wiadomościami.

Komendy moderacyjne odrzucają działania na właścicielu serwera oraz osobach o równych lub wyższych rolach. Bot musi też mieć odpowiednio wysoką rolę. Logi trafiają do `MOD_LOG_CHANNEL_ID`, jeśli zmienna została ustawiona; bez niej akcje są zapisywane w konsoli.

Formularz dowodu publikuje podane dane osobowe i Roblox ID jako wiadomość na wybranym kanale. Ustaw kanał z ograniczonym dostępem, jeśli dowody mają być widoczne tylko dla administracji.

Aby uruchomić automatyczne logi, skonfiguruj gamepass tak, aby jego Discord webhook wysyłał wiadomości na wybrany kanał źródłowy, a następnie uruchom `/setup-logi-bany-kicki` i `/setup-logi-inne`. Bot obserwuje tylko wiadomości webhooków w wybranym kanale źródłowym; bany i wyrzucenia trafiają na kanał ban/kick, pozostałe webhooki — na kanał inne. Ustaw dedykowany kanał źródłowy, aby obce webhooki nie były kopiowane. Bot nie może wykryć informacji, których gamepass nie umieszcza w wiadomości. Wpis bana można poprawić przyciskiem przez moderatorów z uprawnieniem Zarządzanie serwerem, Moderowanie członków, Wyrzucanie członków lub Banowanie członków. Konfiguracja kanałów jest zapisywana w `data/eh-webhook-config.json`; zachowaj katalog `data` na Wispbyte podczas aktualizacji/restartów. Nigdy nie wklejaj webhook URL ani tokena do publicznego kanału lub kodu.

## Sprawdzenie składni

```sh
npm run check
```

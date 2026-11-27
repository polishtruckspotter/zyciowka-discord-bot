# Poznań RP | Bot

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
   - `GUILD_ID` — ID serwera, domyślnie `1561435544930623619`; komendy slash są rejestrowane na tym serwerze. Bot musi już należeć do niego; samo ID nie dodaje bota do serwera.
   - `MOD_LOG_CHANNEL_ID` — ID kanału logów moderacji; ustaw prywatny kanał, aby personel otrzymywał alerty antyraid.
   - `AI_PROVIDER` — `auto` (domyślnie) próbuje po kolei skonfigurowanych dostawców: Gemini, Together AI, OpenAI. Możesz wpisać `gemini`, `together` albo `openai`, aby wybrać dostawcę jako pierwszego.
   - `GEMINI_API_KEY` — klucz z Google AI Studio; domyślny model to `gemini-3.5-flash-lite` (`GEMINI_MODEL`). Przy błędzie 404 bot próbuje też `gemini-3.1-flash-lite`. Gemini API ma ograniczony bezpłatny limit; jego dostępność i warunki zależą od konta.
   - `TOGETHER_API_KEY` — klucz Together AI; domyślny model to `Qwen/Qwen3.5-9B` (`TOGETHER_MODEL`). Ceny i limity zależą od modelu i konta.
   - `OPENAI_API_KEY` — opcjonalny klucz OpenAI; domyślny model to `gpt-4o-mini` (`OPENAI_MODEL`).
   - `ANNOUNCEMENT_CHANNEL_ID` — opcjonalny kanał tekstowy powitań i trzech dziennych pingów `@everyone`: po jednym losowo zaplanowanym rano (07:00–12:00), po południu (12:00–18:00) i wieczorem (18:00–22:00), według czasu Europe/Warsaw. Bot musi mieć możliwość wspominania `@everyone`; plan dnia jest zapisywany w konfiguracji.

   Bot używa pierwszego skonfigurowanego dostawcy, a po błędzie przechodzi do kolejnego. Jeśli nie ustawisz żadnego klucza, korzysta z prostych odpowiedzi lokalnych. Treść wiadomości i do 10 ostatnich tur rozmowy z botem są przekazywane wybranemu dostawcy AI. Free tier Gemini może wykorzystywać dane do ulepszania usług Google. Nie publikuj kluczy API.

3. W Discord Developer Portal → Bot → Privileged Gateway Intents włącz **Message Content Intent**. Bot potrzebuje go, aby odczytywać treść logów wysyłanych przez webhook gry i obsługiwać komendy ekonomii z prefiksem `!`. Włącz również **Server Members Intent** (`Guild Members`), aby wykrywać dołączających członków i alertować personel o podejrzanych dołączeniach. Bot korzysta też z intents `Guilds` i `Guild Messages`.

4. Zaproś bota na serwer ze scope'ami `bot` i `applications.commands`. Przyznaj mu co najmniej:
   - View Channels, Send Messages i Embed Links,
   - Manage Roles (oraz ustaw najwyższą rolę bota wyżej niż obie role wybrane w `/setup-weryfikacja`),
   - Moderate Members, Kick Members, Ban Members i Manage Messages dla funkcji moderacji. Kick Members jest potrzebne do komendy `/bot kick kanal`.

5. Uruchom bota:

   ```sh
   npm start
   ```

   Bot automatycznie rejestruje komendy po zalogowaniu na serwerze z `GUILD_ID` (domyślnie `1561435544930623619`). Bot musi już być zaproszony na ten serwer.

### Automatyczny restart przez PM2

PM2 może ponownie uruchomić bota po nieoczekiwanym zakończeniu procesu. Po `npm install` uruchom:

```sh
npm run pm2:start
```

Przydatne polecenia:

```sh
npm run pm2:logs
npm run pm2:restart
npm run pm2:stop
```

PM2 uruchamia bezpośrednio `src/index.js`. Używaj PM2 albo `npm start` jako nadzorcy procesu, nie obu naraz. `npm start` nadal działa samodzielnie. Na Wispbyte pozostaw `npm start` jako Startup Command, ponieważ hosting sam zarządza procesem.

## Wdrożenie na Wispbyte

Bot jest procesem Discord Gateway, więc nie potrzebuje strony WWW ani otwartego portu.

1. Utwórz serwer Node.js na Wispbyte i wybierz wersję Node.js 20 lub nowszą.
2. Prześlij pliki projektu bezpośrednio do `/home/container`. Powinny się tam znajdować `package.json`, `package-lock.json`, `.env.example`, `src/` i `data/`. Nie przesyłaj `node_modules` ani lokalnego pliku `.env`.
3. W ustawieniach zmiennych środowiskowych serwera dodaj:
   - `DISCORD_TOKEN` — token bota.
   - `CLIENT_ID` — Application ID bota.
   - `GUILD_ID` — opcjonalny ID serwera Discord; zalecany, żeby komendy pojawiły się szybciej podczas konfiguracji.
   - `MOD_LOG_CHANNEL_ID` — ID prywatnego kanału moderacji, wymagane do dostarczania alertów antyraid personelowi.
   - `AI_PROVIDER` — `auto` próbuje dostawców w kolejności Gemini, Together AI, OpenAI; można ustawić `gemini`, `together` albo `openai`.
   - `GEMINI_API_KEY` — klucz z Google AI Studio; domyślny model `gemini-3.5-flash-lite` (`GEMINI_MODEL`). Przy błędzie 404 bot próbuje `gemini-3.1-flash-lite`.
   - `TOGETHER_API_KEY` — klucz Together AI; domyślny model `Qwen/Qwen3.5-9B` (`TOGETHER_MODEL`).
   - `OPENAI_API_KEY` — opcjonalny klucz OpenAI; domyślny model `gpt-4o-mini` (`OPENAI_MODEL`).

   Bot używa dostawców z ustawionymi kluczami, przechodząc do następnego po błędzie. Wiadomość i do 10 ostatnich tur rozmowy są przekazywane do aktywnego dostawcy. Google może wykorzystywać dane z bezpłatnego poziomu Gemini do ulepszania usług.
4. Zainstaluj zależności jednorazowo z konsoli Wispbyte (nie ustawiaj tego jako Startup Command):

   ```sh
   cd /home/container && npm ci
   ```

   Nie uruchamiaj `npm ci` przy każdym restarcie, bo to wydłuża start.
5. W polu **Startup Command** Wispbyte ustaw komendę, która uruchamia bota:

   ```sh
   cd /home/container && npm start
   ```

   Nie używaj tu samego `npm install`: po zainstalowaniu pakietów proces kończy się, a bot pozostaje offline. `npm start` uruchamia nadzorcę, który ponawia start bota po nieoczekiwanym zamknięciu i przekazuje sygnały zatrzymania hostingu do procesu bota.
6. Komendy slash są rejestrowane automatycznie przy starcie bota. Ustaw `GUILD_ID`, aby rejestrować je na jednym serwerze i szybciej zobaczyć zmiany.

Dodaj `DISCORD_TOKEN` i `CLIENT_ID` w ustawieniach zmiennych środowiskowych Wispbyte. Jeśli bot nie może się zalogować, sprawdź logi konsoli oraz czy te zmienne są ustawione bez dodatkowych cudzysłowów lub spacji. Nie publikuj tokena ani nie umieszczaj go w plikach przesyłanych publicznie.

## Komendy

- `data/` zawiera pliki konfiguracji bota, w tym zapisywane przez bota salda ekonomii w `data/economy.json`.
- `api/` zawiera placeholdery o nazwach z przykładowej struktury. To nie są jeszcze działające endpointy i nie są używane przez bota.
- Komendy ekonomii używają prefiksu `!`, ich odpowiedzi są wysyłane jako embedy, a salda działają osobno na każdym serwerze i są zapisywane w `data/economy.json`. `!bal` lub `!balance` [@osoba] pokazuje saldo portfela i banku; `!work` daje losowo 100–1 000 zł raz na godzinę; `!daily` daje 1 000–2 500 zł raz na 24 godziny; `!fish` co 20 minut może dać 150–700 zł albo odebrać do 200 zł; `!shop` pokazuje sklep, `!buy <przedmiot>` kupuje przedmiot, a `!sell <przedmiot> [ilość|all]` sprzedaje go za połowę ceny. `!rob @osoba` próbuje ukraść losową kwotę (przy 35% szansy złapania tracisz losową kwotę, a próby są ograniczone do jednej na 5 minut); `!50/50 <kwota>` przyjmuje stawkę do 3 000 zł i daje 50% szansy na taki sam zysk; `!slots <kwota>` przyjmuje stawkę do 3 000 zł, para wypłaca 2× stawki, a trzy jednakowe symbole 5×. `!dep <kwota|all>` (alias `!deposit`) wpłaca kwotę lub cały portfel do banku; `!withdraw <kwota|all>` wypłaca z banku. `!pay @osoba <kwota>` zarządza przelewami; `!leaderboard` pokazuje 20 najbogatszych, licząc portfel i bank. Osoby z uprawnieniem Zarządzanie serwerem mogą użyć `!economy add @osoba <kwota>` i `!economy remove @osoba <kwota>` do dodania lub odjęcia pieniędzy. `!help` i `!economy` wyświetlają listę komend.
- `/informacja ekonomia` wyświetla w formie embedu pełną listę komend ekonomii, cooldowny, zasady banku, przelewów i ryzyka.
- `/aktywnosc check setup kanal-panelu kanal-checku rola-do-pingowania rola-uprawniona [rola-uprawniona-2 ... rola-uprawniona-22]` — publikuje panel w formie embedu. Osoba z jedną z wybranych ról może kliknąć przycisk, wypełnić formularz z celem (liczba 0–100000) i opisem, a bot opublikuje check jako embed na wskazanym kanale i pingnie wybraną konkretną rolę (rola `@everyone` nie jest dozwolona). Pod checkiem członkowie mogą zapisać się przyciskiem „Zapisz mnie”; lista uczestników i jej licznik aktualizują się na embedzie, a ponowne kliknięcie wycofuje zapis. Uczestnicy są zapisywani w `data/activity-check-participants.json`. Wymaga uprawnienia Zarządzanie serwerem; konfiguracja jest zapisywana w `data/eh-webhook-config.json`.
- `/czy osoba ponizej kanal` — publikuje panel gry „Czy osoba poniżej?” na wskazanym kanale; komendy może użyć wyłącznie użytkownik Discord o ID `1288154813011591270`. Gracze klikają „Zadaj pytanie”, a formularz jest wstępnie uzupełniony tekstem „Czy osoba poniżej”. Przy pytaniu są przyciski „Tak” i „Nie”; po wybraniu odpowiedzi formularz pozwala wpisać następne pytanie. Bot publikuje odpowiedź z nazwą i awatarem głosującego, a następnie kolejne pytanie.
- Osoby z rolą `1561435544993665153` nie mogą oznaczać tej roli ani używać `@everyone`/`@here`. Bot usuwa naruszającą wiadomość i nakłada timeout na 1 minutę. Bot potrzebuje uprawnień Zarządzanie wiadomościami i Moderowanie członków; pozycja jego roli musi pozwalać na timeout użytkownika.
- `/bot kick kanal` — konfiguruje kanał do zgłaszania zhakowanych kont i publikuje na nim polski embed. Każda wiadomość od użytkownika na skonfigurowanym kanale powoduje automatyczne wyrzucenie autora oraz usunięcie wszystkich wiadomości z tego kanału z ostatnich 5 minut. Wymaga uprawnienia Zarządzanie serwerem; bot musi mieć uprawnienia Wyrzucanie członków, Zarządzanie wiadomościami, Wysyłanie wiadomości i Osadzanie linków.
- `/setup tickets kanal-panelu kategoria-ticketow rola-personelu` — publikuje panel z sześcioma rodzajami zgłoszeń, w tym „Współpraca”. Wszystkie tickety trafiają do jednej wybranej kategorii Discord, a każdy kanał widzi jego autor i wskazana rola personelu. Wymaga Zarządzania serwerem i uprawnienia bota Zarządzanie kanałami.
- `/setup rekru kanal-panelu kanal-podan rola-rekrutacji rola-po-akceptacji` — publikuje panel podań. Kandydat odpowiada po kolei na 17 pytań w DM; gotowe podanie bot wysyła jako jeden embed na wskazany kanał podań, który musi być ukryty przed `@everyone` i dostępny dla roli rekrutacji. Embed zawiera pełne odpowiedzi, czas wypełnienia oraz heurystyczny wskaźnik sygnałów stylu AI (0–100). Wskaźnik nie określa autorstwa ani prawdopodobieństwa użycia AI i nie może być podstawą decyzji; personel powinien samodzielnie ocenić podanie. Odpowiedź może mieć maksymalnie 1 000 znaków, a całe podanie 3 500 znaków. Personel może zaakceptować podanie przyciskiem, aby nadać kandydatowi skonfigurowaną rolę, albo je odrzucić. Kandydat może wpisać `anuluj`, aby przerwać.
- `/stworz nasza administracja kanal` (alias: `/stworz nasza adm kanal`) — otwiera administratorowi panel do przypisywania ról do pięciu stałych kategorii: **Główny zarząd → Opiekunowie → Administracja → Moderacja → Supporterzy**. Wybierz kategorię raz, a potem zaznacz maksymalnie 25 ról naraz; można dodać kolejne partie do tej samej kategorii. Każda kategoria musi mieć co najmniej jedną rolę, a role w kategorii wyświetlają się w kolejności dodawania. Opublikuj zestawienie na wskazanym kanale. Bot edytuje to samo zestawienie automatycznie po zmianach ról, nazw i członkostwa, a co godzinę wykonuje odświeżenie kontrolne. Gdy ktoś straci wszystkie skonfigurowane role, jego wzmianka znika z zestawienia. Automatyczne aktualizacje działają, gdy bot jest online.
- `/zarejestruj pojazd marka model kolor tablice wlasciciel zdjecie` — publikuje kartę pojazdu ze zdjęciem na kanale `1561435546876907693` i pingnie wskazanego właściciela Discord. Administrator może użyć `/zarejestruj instrukcja`, aby opublikować polską instrukcję na kanale `1561440076213387354`.
- `/znajdz pojazd user`, `/znajdz pozwolenie-na-bron user` i `/znajdz dowod user` — wyszukują i prywatnie zwracają odnośniki do maksymalnie 10 najnowszych rekordów wybranego użytkownika. Dowody są wyszukiwane na kanale ustawionym w `/setup-dowody` (lub na kanale `1561435546876907694`, jeśli konfiguracja nie została jeszcze zapisana). Ponownie uruchom `/setup-dowody` po wdrożeniu aktualizacji, aby bot zapamiętał wybrany kanał. Dowody utworzone wcześniej można znaleźć, jeśli ich embed zawiera właściciela Discord albo wiadomość bota go pingowała.
- `/setup-weryfikacja kanal rola-do-nadania rola-do-nadania-2 rola-do-zabrania` — publikuje panel w wybranym kanale. Po poprawnej odpowiedzi matematycznej bot nada dwie wybrane role i zabierze wskazaną rolę. Wymaga uprawnienia Zarządzanie serwerem.
- `/setup-dowody kanal-dowodow` — publikuje w bieżącym kanale panel **fikcyjnej karty postaci RP**. Po kliknięciu użytkownik wypełnia formularz z nazwiskiem, imionami, datą urodzenia, płcią, obywatelstwem oraz Roblox ID lub nazwą Roblox (`@nazwa`). Bot korzysta z publicznego profilu Roblox, a wpisane dane wypełniają dołączony szablon `poznan rp dowody.webp`; wartości identyfikatora osobistego są jawnie oznaczone jako RP. Ping użytkownika jest wysyłany poza embedem. Karta zachowuje widoczne oznaczenia „FIKCYJNA KARTA ROLEPLAY — NIE JEST DOKUMENTEM TOŻSAMOŚCI”. `/znajdz dowod user` nadal wyszukuje nowe karty oraz starsze wpisy. Wymaga uprawnienia Zarządzanie serwerem.
- W kanale `1561435546365067373` bot odpowiada na typowe pytania po polsku o kod (np. „jaki jest kod?” lub „gdzie znajdę kod?”), podając `1fid26k3` i życząc miłej gry.
- `/setup-logi-bany-kicki kanal-zrodlowy kanal-ban-kick` — wybiera kanał, na którym webhook gry publikuje logi, oraz kanał docelowy dla banów i wyrzuceń. Bot przekazuje wykryte bany jako edytowalne karty, a wyrzucenia jako logi.
- `/setup-logi-inne kanal-inne` — wybiera kanał docelowy dla pozostałych webhooków i publikuje panel ręcznego zgłaszania użycia admin car lub fly.
- `/setup-ogloszenia kanal-ogloszen [rola-do-pingowania]` — publikuje panel tworzenia ogłoszeń. Moderator z uprawnieniem Zarządzanie serwerem może wpisać tytuł i treść, a bot umieści animowany GIF `zyciowka-rp.gif` jako obraz wewnątrz embedu ogłoszenia. GIF ma 480×270, 12 kl./s i limit 8 MB, więc bot nie musi go przetwarzać podczas pracy. Opcjonalna rola otrzyma ghost ping; bot musi mieć uprawnienia Załączanie plików, Zarządzanie wiadomościami oraz możliwość wspominania tej roli.
- `/setup-pozwolenie-na-bron kanal-panelu kanal-wnioskow rola-po-akceptacji` — publikuje panel wniosków albo aktualizuje istniejący panel bota w wybranym kanale. Z tego panelu można składać kolejne wnioski nawet po otrzymaniu roli pozwolenia; jednocześnie można mieć tylko jeden niedokończony wniosek. Bot wysyła pytania po kolei w DM, a komplet odpowiedzi zapisuje w embedzie na kanale wniosków. W pytaniu o rodzaj broni odpowiedź `2` oznacza oba rodzaje: krótką i długą. Personel z uprawnieniem Zarządzanie serwerem, Moderowanie członków, Wyrzucanie członków lub Banowanie członków może zaakceptować albo odrzucić wniosek; akceptacja nadaje skonfigurowaną rolę i prosi zaakceptowaną osobę w DM o nazwę Roblox (`@nazwa`) lub numeryczne ID. Bot wyszukuje konto przez Roblox API, a na pozwoleniu publikuje odnośnik do `https://www.roblox.com/users/<ID>/profile` wraz z nazwą i awatarem. Po otrzymaniu odpowiedzi bot pingnie zaakceptowaną osobę i publikuje pozwolenie na broń na kanale `1561435546876907696`. Oczekujące prośby są zapisywane w `data/weapon-permit-identity-requests.json`. Wnioski wygasają po 15 minutach, jeśli nie zostaną ukończone; użytkownik może anulować je, wpisując `anuluj`.
- `/setup-ping-poczekalnia kanal-glosowy rola-do-pingowania kanal-pingow` — po wejściu członka do wskazanego kanału głosowego bot pingnie wybraną rolę i członka na wybranym kanale tekstowym. Wymaga uprawnienia Zarządzanie serwerem.
- `/plusminus` — nadaje albo zabiera rolę i wysyła embed na stały kanał logów `1561435547946197108`.
- `/plusa wniosek ile dlaczego osoby-potwierdzajace [dowod]` — składa wniosek o plusa; osoba składająca jest uzupełniana automatycznie, dowód jest opcjonalny, a embed trafia na kanał `1561440698589511760`.
- `/pochwala-skarga` — każdy członek serwera może użyć komendy na dowolnym kanale bez dodatkowych uprawnień; skargi trafiają na `1561435546624991333`, a pochwały na `1561435546365067374`, zależnie od wybranego typu wpisu.
- `/urlop kanal-wnioskow` — otwiera polski formularz z wymaganym czasem trwania i powodem oraz opcjonalnymi informacjami. Wniosek trafia na wybrany kanał, gdzie upoważniony personel może go zaakceptować albo odrzucić; zaakceptowany urlop można później zakończyć z przyciskiem, opcjonalnie podając powód. Wnioskodawca otrzymuje DM z decyzją. Przyciski obsługuje personel z uprawnieniem Zarządzanie serwerem, Moderowanie członków, Wyrzucanie członków lub Banowanie członków.
- `/ostrzez` — ostrzega użytkownika; bot próbuje wysłać mu wiadomość prywatną. Wymaga uprawnienia Moderowanie członków.
- `/timeout` — nakłada timeout od 1 minuty do 28 dni. Wymaga uprawnienia Moderowanie członków.
- `/mute` — wycisza użytkownika przez Discord timeout na 1 minutę do 28 dni; wymaga powodu i czasu trwania. Wymaga uprawnienia Moderowanie członków.
- Detektor antyraid — bot wysyła alert na kanał `MOD_LOG_CHANNEL_ID`, gdy dołączy bot, konto młodsze niż 7 dni albo co najmniej 5 kont w ciągu 10 sekund. Alerty nie powodują automatycznego wyrzucenia ani bana. Ustaw `MOD_LOG_CHANNEL_ID` na prywatny kanał moderacji, aby personel otrzymywał alerty; jeśli zmienna nie jest ustawiona, wykrycia trafiają tylko do konsoli.
- `/kick` — wyrzuca użytkownika; wymaga podania powodu. Wymaga uprawnienia Wyrzucanie członków.
- `/ban` — banuje użytkownika; wymaga podania powodu i opcjonalnie usuwa jego wiadomości z ostatnich 0–168 godzin. Wymaga uprawnienia Banowanie członków.
- `/wyczysc` — usuwa od 1 do 100 wiadomości młodszych niż 14 dni w bieżącym kanale. Wymaga uprawnienia Zarządzanie wiadomościami.

Komendy moderacyjne odrzucają działania na właścicielu serwera oraz osobach o równych lub wyższych rolach. Bot musi też mieć odpowiednio wysoką rolę. Logi trafiają do `MOD_LOG_CHANNEL_ID`, jeśli zmienna została ustawiona; bez niej akcje są zapisywane w konsoli.

Formularz karty RP publikuje podane dane, Roblox ID/nazwę i awatar na wybranym kanale. Ustaw kanał z ograniczonym dostępem, jeśli karty mają być widoczne tylko dla administracji.

Aby uruchomić automatyczne logi, skonfiguruj gamepass tak, aby jego Discord webhook wysyłał wiadomości na wybrany kanał źródłowy, a następnie uruchom `/setup-logi-bany-kicki` i `/setup-logi-inne`. Bot obserwuje tylko wiadomości webhooków w wybranym kanale źródłowym; bany i wyrzucenia trafiają na kanał ban/kick, pozostałe webhooki — na kanał inne. Ustaw dedykowany kanał źródłowy, aby obce webhooki nie były kopiowane. Bot nie może wykryć informacji, których gamepass nie umieszcza w wiadomości. Wpis bana można poprawić przyciskiem przez moderatorów z uprawnieniem Zarządzanie serwerem, Moderowanie członków, Wyrzucanie członków lub Banowanie członków. Konfiguracja kanałów jest zapisywana w `data/eh-webhook-config.json`; zachowaj katalog `data` na Wispbyte podczas aktualizacji/restartów. Nigdy nie wklejaj webhook URL ani tokena do publicznego kanału lub kodu.

## Sprawdzenie składni

```sh
npm run check
```

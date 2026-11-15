# ✳ Pod choinką

Polska aplikacja do świątecznego losowania prezentów. Administrator dodaje osoby, ustala kierunkowe wykluczenia, tworzy losowanie i kopiuje indywidualne linki. Po otwarciu linku uczestnik od razu widzi, komu kupuje prezent.

## Aplikacja online

**[Otwórz Pod choinką](https://pod-choinka-komik0.plaidcrown4.chatgpt.site)**

1. Kliknij **Utwórz mój panel administratora**.
2. Zapisz swój prywatny link administratora — pozwala wrócić także na innym urządzeniu.
3. Dodaj osoby, ustaw wykluczenia i utwórz losowanie.
4. Wyślij każdemu uczestnikowi wyłącznie jego link z wynikiem.
5. Znajomemu przekaż link utworzony przyciskiem **Utwórz link administratora dla znajomego** albo adres strony głównej — utworzy własny, niezależny panel.

Wersja online działa w Sites na Cloudflare Workers z trwałą bazą D1. Uczestnicy i organizatorzy nie muszą zakładać kont. Szczegóły i źródła znajdują się w [hosting/](hosting/README.md). GitHub Pages nie obsługuje serwera ani wspólnej bazy tej aplikacji. GitHub przechowuje kod; sam push nie uruchamia publikacji w Sites.

Dalsza część opisuje alternatywną wersję Python do samodzielnego uruchomienia, z osobną bazą danych i głównym hasłem administratora.

## Osobne panele dla znajomych

Po zalogowaniu kliknij **Utwórz link administratora dla znajomego**. Przekaż wygenerowany adres jednej osobie. Link otwiera jej osobny panel bez hasła; może tworzyć własne losowania, zapisać link i wracać do niego także po restarcie serwera. Każdy nowy link oznacza niezależny panel. Organizator może tworzyć kolejne panele dla swoich znajomych.

Panele mają osobne listy losowań i uczestników. Nie przekazuj znajomemu głównego hasła. Link administratora jest sekretnym kluczem do całego jego panelu; link uczestnika pokazuje wyłącznie jego wynik. Zapisz link administratora — nie ma odzyskiwania ani unieważniania linków w interfejsie. Właściciel serwera nadal ma dostęp do całej bazy.

## Zasady

- Każdy kupuje dokładnie jeden prezent i otrzymuje dokładnie jeden.
- Nikt nie losuje siebie; wykluczenia są respektowane.
- Jeśli nie istnieje poprawny przydział, aplikacja wyświetla błąd i niczego nie zapisuje.
- Wynik jest ustalany przy tworzeniu losowania. Ponowne otwarcie linku pokazuje ten sam wynik.
- Kolejne losowanie jest niezależne i nie unieważnia poprzednich linków.
- Algorytm wykorzystuje losową kolejność w dopasowaniu dwudzielnym. Gwarantuje znalezienie rozwiązania, jeśli istnieje; nie gwarantuje jednakowego prawdopodobieństwa wszystkich możliwych przydziałów.

## Uruchomienie

Wymagany Python 3.11 lub nowszy, bez dodatkowych bibliotek.

```bash
export ADMIN_PASSWORD='ustaw-wlasne-dlugie-haslo'
python3 app.py
```

Otwórz http://localhost:8000. Zaloguj się ustawionym hasłem, wpisz osoby (jedna w wierszu), ustaw wykluczenia i utwórz losowanie. Wyślij każdej osobie tylko jej link.

### Konfiguracja

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `ADMIN_PASSWORD` | brak | Wymagane hasło, minimum 12 znaków |
| `HOST` | `127.0.0.1` | Adres nasłuchiwania |
| `PORT` | `8000` | Port HTTP |
| `DATABASE_PATH` | `data/draws.sqlite3` | Trwały plik SQLite |
| `COOKIE_SECURE` | `0` | Ustaw `1` przy HTTPS |

## Udostępnienie uczestnikom

Repozytorium zawiera kod, nie uruchamia serwera automatycznie. Wdróż aplikację na serwerze z Pythonem lub Dockerem, z trwałym dyskiem, i udostępnij przez HTTPS (np. przez Caddy). Otwórz panel pod docelową domeną przed skopiowaniem linków — zawierają adres aktualnej strony. Linki z localhost nie działają na urządzeniach innych osób.

```bash
docker build -t pod-choinka .
docker run --rm -p 8000:8000 --env ADMIN_PASSWORD --env COOKIE_SECURE=1 -v prezenty-data:/app/data pod-choinka
```

Powyższe ustawienie `COOKIE_SECURE=1` wymaga HTTPS na reverse proxy. Do lokalnego testu HTTP pomiń tę opcję. Używaj jednej instancji aplikacji; sesje są w pamięci i wygasają po 8 godzinach lub restarcie.

## Prywatność

Tokeny linków mają 256 bitów losowości. Token znajduje się we fragmencie URL i jest przesyłany w treści żądania, a serwer nie zapisuje logów żądań. Publiczne API zwraca tylko wynik posiadacza danego linku; lista linków wymaga sesji głównego administratora albo tokenu odpowiedniego panelu. Tokeny paneli przechowywane są w bazie jako skróty SHA-256. Brak skryptów analitycznych i zewnętrznych zasobów.

Link daje dostęp do wyniku każdemu, kto go posiada. Administrator ma wszystkie linki i dostęp do bazy, więc może poznać wyniki. Baza przechowuje dane uczestników i linki — zabezpiecz dysk oraz kopie zapasowe. Nie dodawaj bazy ani haseł do Gita. Przy publicznym wdrożeniu ustaw limit prób logowania na reverse proxy. Zmiana hasła nie unieważnia sesji do czasu restartu.

## Testy

```bash
python3 -m unittest discover -s tests -v
```

Testy obejmują poprawne dopasowania, wykluczenia, niemożliwe losowanie, walidację i cały przepływ API, w tym dostęp administratora i prywatne wyniki.

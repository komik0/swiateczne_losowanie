# Wersja hostingowa (Sites / Cloudflare Workers + D1)

Działająca aplikacja: https://pod-choinka-komik0.plaidcrown4.chatgpt.site

Ta wersja korzysta z Worker ESM i trwałej bazy D1. Użytkownik tworzy osobny panel bez hasła, a dostęp jest chroniony prywatnym losowym tokenem w linku. Każdy organizator widzi wyłącznie swoje losowania. Publiczne API wyników zwraca tylko pojedynczy wynik dla podanego tokenu. Tokeny mają 256 bitów losowości; skróty SHA-256 tokenów autoryzują dostęp po stronie serwera. Linki uczestników są dostępne organizatorowi i dlatego zapisywane w jego rekordzie losowania.

## Struktura

- `worker/api.js`: API, walidacja i losowanie przez dopasowanie dwudzielne.
- `public/`: interfejs aplikacji.
- `scripts/build.mjs`: osadza lokalne zasoby w jednym Workerze ESM.
- `.openai/hosting.json`: tożsamość Sites i binding `DB`.
- `drizzle/`: migracja schematu bazy stosowana podczas publikacji.
- `tests/worker.test.mjs`: dopasowania, wykluczenia i izolacja paneli z prawdziwym silnikiem SQLite.

## Sprawdzenie i budowanie

Node.js 24 lub nowszy, bez dodatkowych zależności:

```sh
cd hosting
npm test
npm run build
```

Wynik budowania: `dist/server/index.js` oraz manifest w `dist/.openai/hosting.json`. Ten plik nie jest obsługiwany przez GitHub Pages — wymaga środowiska Workers z D1. Publikacja odbywa się w Sites z repozytorium źródłowego Sites; sam push do GitHuba nie publikuje zmian automatycznie.

Wersja Python w katalogu głównym jest alternatywą do samodzielnego hostowania. Ma osobną bazę SQLite i logowanie hasłem do głównego panelu; nie współdzieli danych z wdrożeniem Sites.

## Zasady dostępu

Strona główna jest publiczna. Każdy może utworzyć niezależny panel i zapisać jego link. Brak odzyskiwania, usuwania i unieważniania paneli w interfejsie. Zachowuj linki administratorów w bezpiecznym miejscu. Właściciel hostingu ma dostęp do całej bazy. Baza jest wspólna dla aplikacji, a izolację paneli wymusza API. Algorytm znajduje poprawny przydział, jeśli istnieje, lecz nie zapewnia jednakowego prawdopodobieństwa wszystkich możliwych dopasowań.

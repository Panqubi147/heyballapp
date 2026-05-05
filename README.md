# Heyball Training Starter

Starter aplikacji webowej do:
- tworzenia ćwiczeń heyballowych na stole,
- zapisywania ćwiczeń w Firebase,
- przeglądania bazy ćwiczeń,
- tworzenia treningów,
- wpisywania wyników,
- przeglądania statystyk.

## Uruchomienie w 5 minut

### 1. Zainstaluj Node.js
Pobierz Node.js LTS:
https://nodejs.org

Sprawdź w terminalu:

```bash
node -v
npm -v
```

### 2. Zainstaluj paczki

```bash
npm install
```

### 3. Utwórz projekt Firebase

Wejdź na:
https://console.firebase.google.com

Kliknij:
`Add project`

Potem w projekcie:
- Build → Authentication → Get started → Email/Password → Enable
- Build → Firestore Database → Create database → Start in test mode

### 4. Dodaj aplikację Web w Firebase

W Firebase kliknij ikonę `</>` i skopiuj config.

Utwórz plik `.env.local` na podstawie `.env.example`.

### 5. Uruchom aplikację

```bash
npm run dev
```

Otwórz:

```text
http://localhost:3000
```

## Ważne

Na start aplikacja używa tymczasowego `demo-user`, żeby można było szybko testować bez logowania.
Później można łatwo podłączyć Firebase Auth.

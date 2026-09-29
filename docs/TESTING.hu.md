# Ellenőrzési jegyzőkönyv – 0.2.0 preview

Windows x64 fejlesztői környezet, 2026. szeptember 28–29. A tesztkép szintetikus; nem csatlakoztatott telefonból származik.

## Sikeres ellenőrzések

- Android `assembleDebug` és `lintDebug`: sikeres, nincs lint-hiba. Nem blokkoló figyelmeztetések maradtak például a fekvő tájolásról, backup-beállításról, wakelock időkorlátról, lokalizált szövegösszeállításról és újabb buildeszközökről. A végleges APK versionCode 2 / versionName 0.2.0.
- Node: 11 teszt sikeres. Darabolt/összevont csomagok, sérült fejlécek, USB-szűrés, MPEG-TS CRC/PTS, hitelesített vezérlés, cross-origin elutasítás, WebSocket és OBS named-pipe kimenet, kapcsolatlezárás, Wi-Fi párosítás/certifikátum-pin, ajánlási algoritmus és natív képkockahatárok.
- FFmpeg/ffprobe: 1080p60 esetén 60, 4K30 esetén 30 képkocka és mindkét mintában 47 AAC-csomag sikeresen átjutott a saját MPEG-TS muxeren. 48 kHz sztereó hang, videó- és hangidőbélyegek ellenőrizve, hibamentes dekódolás.
- Natív x64 fordítás: OBS-bővítmény, DirectShow kamera és képkockaíró sikeres.
- A DirectShow DLL regisztráció nélkül létrehozható a COM class factoryn keresztül; 1080p60 és 4K30 képességek lekérdezve.
- I420 → NV12 konverzió, 0/90/180/270 fokos forgatás, megosztottmemória-átadás: konkrét pixelekkel ellenőrizve.
- A bővítmény sikeresen betöltődött a telepített OBS 32.2.2 `libobs` környezetébe, regisztrálta a `DroidVideo Camera + Audio` forrást és a hangbeállításokat. Ez nem indított OBS-felületet és nem módosított felhasználói OBS-beállítást.
- Böngészős ellenőrzés: magyar/angol felület, csatlakozás, 1080p60 → 4K30 módváltás és tényleges dekódolt tesztkép. A teljes WebSocket → WebCodecs → natív képkockaíró → megosztottmemória útvonalon 3840×2160 / 333333 darab 100 ns-os képkockaköz visszaolvasva. A szintetikus küldő és a PC valós idejű teljesítményét ez nem garantálja; a teszt közben a küldő átlagos fps-e a 30-as cél alatt is volt.
- `npm audit`: 0 ismert sérülékenység a lezárt függőségkészletben az ellenőrzés idején.
- A csomagolt alkalmazás 15 fájlja bájtra egyezik a végleges forrással; a verzió/futási metaadatok, a beágyazott APK és natív képkockaíró szintén egyezik. A régi OBS Médiaforrás-felület már nincs a csomagban. A SHA256SUMS-0.2.0.txt az átadott fájlok ellenőrzőösszegeit tartalmazza.
- A saját kameraikon mindkét Windows EXE-ben hét méretben (16–256 px) szerepel, közvetlen erőforrás-ellenőrzéssel igazolva. Az Android APK adaptív ikonra hivatkozik; témázott és egyszínű értesítési változat is készült. Az APK aláírás-ellenőrzése sikeres.

## Nem igazolt hardveres működés

Nincs csatlakoztatott fizikai Android telefon. Ezeket a saját készüléken kell ellenőrizni:

1. APK-telepítés, kamera/mikrofonengedély, USB-hibakeresés és hideg indulás.
2. Minden objektív, min/max zoom, autofókusz és érintéses fókusz; PC/telefon vezérlőszinkron.
3. 1080p60 és 4K30 legalább tízperces használata; valódi fps, késleltetés, melegedés és telefonos előnézet.
4. Sötétítés, bekapcsológombbal lezárás, alkalmazásváltás, visszatérés, gyártói akkukímélés.
5. Valódi Wi-Fi-párosítás, mért sebesség és ajánlott mód, gyenge jel, megszakadás és újrapárosítás.
6. Beépített, USB-s/vezetékes mikrofon; monó/sztereó; csatlakoztatás/eltávolítás és valós A/V szinkron.
7. Telepített OBS-bővítménnyel élő jelenet, telefonhang és PC-mikrofon, forrás inaktiválása, felbontásváltás és újracsatlakozás.
8. Regisztrált Windows kamera használata a felhasználó célalkalmazásában. Telepítőket/regisztrációt nem futtattunk; a registry nélküli komponens- és adatátadási teszt sikeres.

A virtuális kamera csak képet ad. Telefonhanghoz az OBS-bővítmény szükséges; virtuális mikrofon nincs. A kamera x64 DirectShow-kompatibilitású, nem minden Windows kamera API támogatott.

## Az ellenőrzés korlátai

A hordozható alkalmazás tényleges elindulása még nincs ellenőrizve. A Node-szerver, böngészős UI, natív képkockaíró és libobs modul külön sikeresen futott.

A szintetikus tesztek a formátumot, időzítést és komponensek közti adatátadást igazolják; nem helyettesítik a valódi Android/USB/Wi-Fi/OBS élőtesztet.

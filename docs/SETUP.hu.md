# DroidVideo – egyszerű használati útmutató

A telefonod kamerája a számítógépeden. Ingyenes, nyílt forráskódú, vízjel nélkül. Készítő: **devkos1**.

## Csak két fájl kell

A [letöltési oldalon](https://github.com/devkos1/droidvideo/releases/tag/v0.3.1) töltsd le az **APK-t a telefonodra**, az **EXE-t a számítógépedre**. Az EXE-ben benne van az ADB, az OBS-bővítmény és a virtuális kamera. Külön ZIP-re vagy parancssorra nincs szükség.

Android 9 vagy újabb, illetve 64 bites Windows 10/11 szükséges. OBS-adáshoz OBS Studio 32.x 64 bit kell. Az alapnyelv angol; az EN/HU gombbal válthatsz magyarra.

## Indítsd el a képet

1. Telepítsd az APK-t. Nyisd meg a telefonos DroidVideo appot, és engedélyezd a kamerát és mikrofont. Androidon szükség lehet a böngészőből vagy fájlkezelőből történő telepítés engedélyezésére.
2. Nyisd meg az EXE-t a gépen.
3. Csatlakoztasd a telefont USB-adatkábellel. Kapcsold be az **USB-hibakeresést**, és fogadd el a telefonon megjelenő engedélykérést.
4. A Windows appban válaszd a telefont, majd **Csatlakozás → Élőkép indítása**.

**Hol van az USB-hibakeresés?** A telefon Beállítások → A telefonról menüjében koppints hétszer a **Buildszámra**. Lépj vissza, keresd meg a **Fejlesztői beállítások** menüt, és kapcsold be az **USB-hibakeresést**. A nevek telefononként eltérhetnek. Egyes telefonokhoz gyártói USB-illesztőprogram kell; ha a gép nem látja a telefont, próbáld Wi-Fi-n.

**Kábel nélkül:** mindkét eszköz legyen ugyanazon a Wi-Fi-n. A telefon DroidVideo appjában kapcsold be a Wi-Fi-megosztást, másold ki a párosítási linket, és illeszd a Windows app Wi-Fi mezőjébe. Kattints a Csatlakozás gombra. Az app megméri a kapcsolatot, és minőséget ajánl.

## OBS-adás

1. Zárd be az OBS-t. A DroidVideo OBS-részénél kattints a **Telepítés**, majd az **OBS-bővítmény telepítése** gombra. Fogadd el a Windows engedélykérését.
2. Nyisd meg újra az OBS-t. **Források → + → DroidVideo Camera + Audio**.
3. Indítsd az élőképet a DroidVideo appban. A kép automatikusan megjelenik.

Hanghoz válassz mikrofont a DroidVideo appban. Az OBS-forrás tulajdonságainál telefonos vagy PC-s mikrofont választhatsz. A DroidVideo előnézete néma.

**4K-ban ezt az OBS-forrást használd, és hagyd kikapcsolva a Windows virtuális kamerát.** Ez kevesebb képmásolással jár. A képet az OBS-ben a jobb kattintás → Átalakítás menüben forgathatod.

## Más videóhívó vagy kameraapp

Indítsd a videót, majd kattints a **Windows virtuális kamera → Bekapcsolás** gombra. Első alkalommal a kamera települ is; fogadd el a Windows engedélykérését. Nyisd meg vagy indítsd újra a másik alkalmazást, és válaszd a **DroidVideo Camera** eszközt.

Ez csak képet ad; hanghoz más appban a PC mikrofonját használd. A kamera 64 bites DirectShow-alkalmazásokat támogat, nem minden Windows-programmal működik. A DroidVideo maradjon futva.

## Tippek

- Sima mozgáshoz próbáld az 1080p60-at, több részlethez a 4K30-at, ha a telefon támogatja. Akadásnál válts 1080p-re, USB-re vagy a közvetlen OBS-forrásra.
- Válthatsz kamerát, zoomolhatsz, mikrofont választhatsz, a képre koppintva fókuszálhatsz.
- A telefon **Sötétítés** gombja elsötétíti a képernyőt. Hosszan nyomva visszatérnek a kezelőszervek. A bekapcsológombbal le is zárhatod; ezt hosszabb adás előtt próbáld ki a saját telefonodon.
- A párosítási linket ne oszd meg másokkal. A kép és hang a saját eszközeiden és helyi hálózatodon marad.

Ez előzetes kiadás. A Windows EXE még nincs hiteles tanúsítvánnyal aláírva, ezért megjelenhet ismeretlen kiadóra vagy SmartScreenre vonatkozó figyelmeztetés. A szerzőnév nem helyettesíti a digitális aláírást. Ne kapcsold ki a rendszer biztonsági védelmét. [Ellenőrzési állapot](TESTING.hu.md).

## Frissítés 0.3.1-re

Zárd be teljesen az OBS-t. Nyisd meg az új EXE-t, majd a Setup résznél telepítsd újra az OBS-bővítményt. Ezután indítsd újra az OBS-t. A már telepített kompatibilis virtuális kamerát a program újratelepítés nélkül használja.

# DroidVideo 0.2.0 – telepítés és használat

Ingyenes, nyílt forráskódú, vízjel nélküli fejlesztői előzetes Androidhoz és Windows x64-hez. A 4K30/1080p60 akkor választható, ha a telefon kamerája és hardveres H.264-kódolója támogatja. A gyártói kameraapp összes objektívje és módja nem feltétlenül érhető el külső alkalmazásból.

## Alkalmazások

1. Telepítsd a `DroidVideo-0.2.0-Android.apk` fájlt Android 9 vagy újabb telefonra. Nyisd meg, és engedélyezd a kamerát/mikrofont. Ez az APK fejlesztői aláírású.
2. Indítsd a `DroidVideo-0.2.0-Windows.exe` programot Windows 10/11 x64 alatt.
3. Csomagold ki a `DroidVideo-0.2.0-Windows-Components.zip` fájlt. Ebből telepíthető az OBS-bővítmény és a virtuális kamera.
4. Az alapnyelv angol, a rendszer nyelvétől függetlenül. Az EN/HU gombbal külön-külön válthatsz magyarra; a korábban kézzel kiválasztott nyelv megmarad.

## USB

Telepítsd a Google [Android Platform-Tools](https://developer.android.com/tools/releases/platform-tools) csomagját. A telefonon engedélyezd a **Fejlesztői beállítások → USB-hibakeresés** opciót. Csatlakoztasd adatkábellel, és fogadd el a telefonon a számítógép engedélykérését.

A Windows appban válaszd az USB módot, a telefont, majd a **Csatlakozás** gombot. Ha nem találja az ADB-t, az első telepítés panelen add meg az `adb.exe` teljes útvonalát. Az APK innen USB-n is telepíthető.

Válassz objektívet és minőséget, majd indítsd az élőképet. A zoom, expozíció, fény és autofókusz állapota adás közben mindkét felületen frissül. A képre koppintással/kattintással fókuszpontot adhatsz meg; az Auto gomb visszaállítja a folyamatos fókuszt.

## Wi-Fi és minőségajánlás

A telefon és a PC ugyanazon a helyi hálózaton legyen. A telefon **Wi-Fi** menüjében kapcsold be a megosztást, másold ki a párosítási linket, és illeszd a Windows app Wi-Fi mezőjébe. A link titkos párosítási adatokat tartalmaz; ne tedd képernyőképre vagy GitHubra.

Kényelmesebb átállás: USB-n csatlakozva kapcsold be a Wi-Fi-megosztást a telefonon, majd válaszd a **Wi-Fi-link átvétele USB-n** gombot a PC-n. Bontsd a kapcsolatot, válts Wi-Fi módra, és csatlakozz. A link nem kerül tartós mentésre.

Álló videónál csatlakozás után automatikusan lefut a mérés. Három adatátviteli mintából, a leglassabb minta és a válaszidő-ingadozás alapján, tartalék sávszélességgel ajánl minőséget. A **Mérés** gombbal újraellenőrizheted, amikor az adás áll. Ez becslés: nem garantál folyamatos fps-t, és nem vált automatikusan minőséget adás közben.

Vendéghálózati eszközelkülönítés, tűzfal vagy változó Wi-Fi-cím akadályozhatja a kapcsolatot. A Wi-Fi mód privát IPv4-címet és tanúsítványhoz kötött TLS-t használ. Az OBS felé nincs megadandó TCP-cím.

## Hang

A **Telefon mikrofonja** listában válassz alapértelmezett, beépített, vezetékes vagy USB-s bemenetet az Android által elérhetővé tett eszközök közül. A **Bemenetek frissítése** újraolvassa a listát. Monó vagy sztereó, 48 kHz-es AAC állítható be; az adott hardvernek támogatnia kell a módot. Bluetooth-bemenet működése Android-függő. A program a mikrofont továbbítja, nem a telefon más alkalmazásainak belső hangját.

A hang alapból kikapcsolt. A PC-s előnézet néma. A telefonhang az OBS-bővítményen keresztül hallható; ott PC-s mikrofon is választható.

## OBS-bővítmény

1. Zárd be az OBS-t.
2. A kicsomagolt összetevők között jobb kattintás az `Install-OBS.cmd` fájlra → **Futtatás rendszergazdaként**.
3. Indítsd újra az OBS 32.x x64-et. Indítsd az élőképet a DroidVideo appban.
4. OBS → **Források → + → DroidVideo Camera + Audio**.
5. A forrás tulajdonságainál válassz **Telefon hangja**, **PC-mikrofon** vagy **Hang nélkül** lehetőséget.

Alapértelmezett OBS-mappa: `C:\Program Files\obs-studio`. Más telepítési helyhez emelt jogosultságú 64 bites PowerShellben:

```powershell
.\Install-Components.ps1 -Component OBS -ObsRoot 'D:\OBS Studio'
```

A forrás helyi Windows-csatornán kapja a videót és hangot. Nincs TCP-s Médiaforrás-beállítás. Ha a kamerakép elfordulva látszik, az OBS **Átalakítás** menüjében fordítsd el. Hangcsúszás az OBS **Speciális hangtulajdonságok → Szinkroneltolás** beállításával korrigálható. A bővítmény az OBS beépített FFmpeg/WASAPI moduljait használja. Ugyanazt a mikrofont ne add hozzá még egyszer, ha nem akarsz dupla hangot.

Eltávolítás: zárt OBS mellett `Uninstall-OBS.cmd`, rendszergazdaként.

## Virtuális kamera

1. Jobb kattintás az `Install-Camera.cmd` fájlra → **Futtatás rendszergazdaként**. A fájlok a `C:\Program Files\DroidVideo\Camera` mappába kerülnek.
2. Indítsd újra a kamerát használó programokat.
3. A DroidVideo Windows appban indítsd az élőképet, majd kapcsold be a **Windows virtuális kamera** kimenetet.
4. A másik programban válaszd a **DroidVideo Camera** eszközt.

Külön x64 DirectShow-kamera, saját azonosítóval; nem írja felül az OBS Virtual Camerát. A fogadó programban is válaszd ki a kívánt felbontást/fps-t. A 32 bites, illetve kizárólag Media Foundation kamerákat használó programok támogatása nincs ebben a változatban.

**A virtuális kamera csak képet ad.** Virtuális mikrofon nincs telepítve. Telefonhanghoz használd az OBS-bővítményt; más alkalmazásban helyi PC-mikrofont választhatsz. A Windows app maradjon futva: minimalizálható, de bezáráskor leáll az adás. A dekódolás és képkockamásolás miatt a tényleges fps a PC teljesítményétől is függ.

Eltávolítás: `Uninstall-Camera.cmd`, rendszergazdaként.

## Kijelző sötétítése és kikapcsolása

Indítsd a videót, majd a telefonon nyomd meg a **Sötétítés** gombot. A fekete felület hosszú nyomásra visszaáll. Ez minimális fényerőt állít be; a kijelző tényleges kikapcsolásához nyomd meg a telefon bekapcsológombját. Androidon külön rendszerszintű jogosultság nélkül nem lehet programból valódi képernyő-kikapcsolást kikényszeríteni.

Az adást kamera/mikrofon előtérszolgáltatás tartja életben. Gyártói akkukímélés ezt befolyásolhatja, ezért a saját telefonodon próbáld ki lezárt kijelzővel is egy hosszabb adás előtt. A telefon vagy a Windows app Stop gombja leállítja a felvételt.

## Ellenőrzési állapot

A fordítások, protokolltesztek, szintetikus 4K30/1080p60 kép+hang, virtuális kamera képkockaátadása és bővítmény libobs-betöltése ellenőrizve. Fizikai telefon, valódi Wi-Fi/mikrofon, OBS-adás és tartós lezárt kijelzős használat még tesztelendő. Ezért a csomag **0.2.0 preview**.

[Tesztjegyzőkönyv](TESTING.hu.md)

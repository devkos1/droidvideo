# Ellenőrzési állapot – 0.3.0 előzetes

Windows x64, 2026. szeptember 29. A videótesztek szintetikus mintákat használtak. [Részletes angol jegyzőkönyv](TESTING.md).

- Az Android fordítása és lint-ellenőrzése sikeres; versionCode 3, versionName 0.3.0.
- Mind a 16 Node-teszt sikeres, köztük a protokoll, Wi-Fi, telepítőhívások, ADB-kiválasztás és a natív dekóder túlterheléskezelése.
- A natív összetevők lefordultak. A DirectShow formátumellenőrzés és 16 képpontpontos forgatási/színkonverziós teszt sikeres.
- A natív H.264-dekóder mind a 60 darab 1080p60-as, illetve 30 darab 4K30-as tesztképkockát feldolgozta.
- A virtuális kamera már közvetlenül a tömörített videót dekódolja, nem az előnézetből másolja vissza a teljes képet. A böngészőlap bezárása után is működött a 4K-s megosztottmemória-kimenet.
- A nyers 4K-kép forgatását és átadását mérő tesztben 90°-nál 26,1-ről 95,4 fps-re, 180°-nál 29,4-ről 139,0 fps-re nőtt a feldolgozási sebesség. Ez nem a teljes telefon–OBS útvonal képfrissítése.
- Az angol és magyar felületet, a 4K-előnézetet és az egyszerűsített OBS-útmutatót böngészőben ellenőriztük. Az OBS-modul betöltése és hangbeállításai a libobs segítségével ellenőrizve.

Az EXE-csomag ellenőrzése kiterjed az app forrására, a devkos1 szerzőadatra, az APK-ra, ADB-re, OBS-bővítményre, virtuális kamerára, telepítőre, ikonokra, licencekre és a mellékelt forráskódra. A kiadáshoz egy APK és egy EXE szükséges.

Még ellenőrizendő a csomagolt EXE tényleges indulása, a rendszergazdai telepítés, a regisztrált kamera, a valódi telefonos USB/Wi-Fi, mikrofonok, hangszinkron és hosszabb OBS-adás. A szintetikus küldő körülbelül 22 fps-sel futott, ezért ez a teszt nem bizonyít folyamatos 4K30-at.

A virtuális kamera csak képet ad; telefonhang az OBS-bővítményen keresztül használható. Windows N rendszeren a natív dekódoláshoz szükség lehet a Media Feature Packre. A lassabb PC továbbra is korlátozhatja a sebességet. OBS-hez a közvetlen DroidVideo-forrást ajánljuk.

A Windows-fájlok még nincsenek hitelesen aláírva. A devkos1 szerzőnév önmagában nem helyettesíti a digitális aláírást.

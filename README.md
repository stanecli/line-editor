# Line Editor

## Feladat

Csinálj legalább 3 textboxot egy formon, legyen valami nevük (pl.: név, email stb.). Az ide beírt adatokat egy Mentés gombbal mentsük el úgy, hogy egy másik formon ugyanezeket az adatokat beolvassuk. Innen egy gomb megnyomásával mentsük az egészet fájlba.

## Megoldás

**AI: A megoldást szinte teljes egészében promptoltam, itt-ott kézzel beleírtam. A transzparencia jegyében csatoltam a teljes conversation-t a codex-el.**

- Mivel nem volt specifikálva, hogy milyen eszközökkel oldjam meg, ezért native HMTL + JS-t választottam, az egyszerűség kedvéért.
- Extraként tettem bele layereket és pár beállítást

## Fájlok

A megoldás külön CSS-fájlt és natív JavaScript ES-modulokat használ, build nélkül.

```text
index.html               – a felület HTML-szerkezete
style.css                – megjelenés
js/models.js             – adatmodellek, alapértékek és validáció
js/services.js           – állapotkezelés és események
js/components/layers.js   – réteglista és átrendezés
js/components/add-line.js – új vonal hozzáadása
js/components/settings.js – beállítások
js/components/stage.js    – vonalak megjelenítése és végpontok mozgatása
js/main.js               – inicializálás
```

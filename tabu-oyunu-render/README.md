# Türkçe Tabu Oyunu (Render + GitHub)

Gerçek zamanlı, iki takımlı Tabu oyunu. Oda ID ve isim ile katılın, takım adlarını değiştirin, kaptanlar 🎮 kontrolcü atayabilsin, anlatıcılar 🗣️ pas / tabu / doğru tuşlarını kullansın. Oyun kurucu 👑 süre ve hedef puanı belirleyip durdurup başlatabilir, devredebilir.

## Özellikler
- İki takım (Mavi/Kırmızı), arkaplan açık bej; takım panelleri mavi ve kırmızı.
- Takım isimleri düzenlenebilir; üstlerinde toplam takım puanı görünür.
- Ortada tabu kartı: **yalnızca anlatıcı** ve **karşı takım** kartı görebilir; anlatıcının takımındaki tahminciler göremez.
- Her tur 3 pas hakkı. Pas bitince **Pas** butonu devre dışı.
- Roller ve emojiler: 👑 Oyun Kurucu, 🧭 Kaptan, 🎮 Kontrolcü, 🗣️ Anlatıcı.
- Kaptanlar takım kontrolcüsü (🎮) atar, mevcut tur anlatıcısını belirler.
- Karşı takımın kontrolcüsü, anlatıcının *Pas/Tabu/Doğru* tuşlarına basabilir.
- Oyun kurucu hedef puan ve süre ayarlar, durdurur/sürdürür/yeniden başlatır, sahipliği devreder.
- Oda sistemi: İsim + Oda ID ile kur/katıl.

> Not: `data/words.json` dosyasında örnek veri bulunur. 1000 kelimelik set için aynı formatta genişletebilirsiniz.

## Kurulum (Yerel)
```bash
npm install
npm start
# http://localhost:$PORT (varsayılan 3000)
```

## Render Deploy
1. Bu projeyi GitHub'a yükleyin (repo adı serbest).
2. Render.com > New > Web Service.
3. Repo'yu seçin. **Build Command**: `npm install`, **Start Command**: `node server.js`.
4. Health Check Path: `/health`.
5. Ortam değişkeni `PORT` Render tarafından atanır (render.yaml örnek içerir).

## Oyun Akışı
- Odayı kuran 👑 otomatik oyunu başlatır (Mavi başlar).
- Her turun süresi bitince sıra diğer takıma geçer.
- `Doğru` +1, `Tabu` -1, `Pas` kart atlar (max 3 pas).
- Hedef puana ulaşan takım kazanır; oyun biter ve sonuç banner'ı çıkar.

## 1000 Kelimelik Veri Seti
`data/words.json` tek tek şu formatta satırlar içerir:
```json
{ "word": "masa", "taboo": ["sandalye", "yemek", "ahşap", "oda", "mobilya"] }
```
Bu dosyayı 1000+ karta genişletebilirsiniz.

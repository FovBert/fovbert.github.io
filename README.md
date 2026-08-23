# fovbert.github.io

Личный сайт-визитка. **[fovbert.github.io](https://fovbert.github.io/)**

Минималистичная одностраничка без фреймворков: чистые HTML, CSS и ~200 строк JavaScript.
Тёмная и светлая темы, календарь активности GitHub и список репозиториев подтягиваются на лету.

```
index.html            разметка страницы
assets/style.css      токены тем и вся вёрстка
assets/app.js         темы, скролл-спай, календарь, репозитории
assets/contributions.json  данные календаря (обновляются GitHub Actions)
scripts/contrib.mjs   сборщик данных календаря
```

Данные календаря пересобираются ежедневно через
[`.github/workflows/refresh.yml`](.github/workflows/refresh.yml) — без сторонних сервисов.

Локальный запуск:

```bash
python -m http.server 8000
```

Telegram — [@fovbert1](https://t.me/fovbert1)

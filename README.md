# PromoStack

Сервіс розрахунку промоакцій для роздрібної торгівлі: за кошиком і набором акцій знаходить допустиму комбінацію знижок з найбільшою вигодою для покупця та пояснює кожне рішення.

*A promotion calculation service for retail: finds the best-for-customer combination of discounts that respects combination rules, and explains why each promotion was or was not applied.*

Магістерський інженерний проєкт, Neoversity, MSc Computer Science (Software Engineering).

## Можливості

- **Механіки акцій:** знижка у % і в грошах на товар або категорію, «купи X, отримай Y», комплект за фіксованою ціною, знижка від суми чека.
- **Правила поєднання:** несумісні акції (`combinable: false`), групи взаємовиключення (`group`), ліміт застосувань, пріоритет, умови (рівень клієнта, канал, термін дії, мінімальна сума).
- **Три алгоритми:** `optimal` (метод гілок і меж з допустимою оцінкою та бюджетом вузлів), `greedy` (жадібний за вигодою), `priority` (послідовне застосування за пріоритетом, як у поширених e-commerce платформах).
- **Пояснення:** для кожного рядка чека видно, яка акція скільки дала; для кожної незастосованої акції є код причини й опис.
- **Журнал розрахунків** для аудиту, REST API з OpenAPI-документацією (`/docs`), адмін-панель акцій і симулятор каси.

## Структура

```
packages/engine   рушій розрахунку (TypeScript, без залежностей), тести, бенчмарк
apps/api          REST API: Fastify + SQLite (node:sqlite)
apps/web          адмін-панель, симулятор каси, журнал (React + Vite)
```

## Запуск

Потрібні Node.js 24+ і pnpm.

```bash
pnpm install
pnpm build        # збирає вебчастину в apps/web/dist
pnpm start        # http://127.0.0.1:3000, документація API: /docs
```

Розробка: `pnpm dev:api` і `pnpm dev:web` (Vite на :5173 проксіює `/api` на :3000).

Docker:

```bash
docker build -t promostack .
docker run -p 3000:3000 -e ADMIN_KEY=change-me -v promostack-data:/data promostack
```

Змінні середовища: `PORT` (3000), `HOST` (127.0.0.1), `DB_FILE` (promostack.db), `ADMIN_KEY` (якщо задано, зміна акцій вимагає заголовка `x-api-key`).

## Тести й бенчмарк

```bash
pnpm test        # модульні, властивісні та інтеграційні тести (node:test)
pnpm typecheck
pnpm bench       # порівняння алгоритмів, результати в packages/engine/bench/results.json
```

## Приклад запиту

```bash
curl -s localhost:3000/api/calculate -H 'content-type: application/json' -d '{
  "basket": {
    "channel": "pos",
    "lines": [
      { "id": "1", "sku": "cola", "category": "drinks", "unitPrice": 4990, "quantity": 3 },
      { "id": "2", "sku": "chips", "category": "snacks", "unitPrice": 5490, "quantity": 1 }
    ]
  }
}'
```

Суми передаються цілими числами в копійках.

## Модель і обмеження

Застосування акції завжди бере найцінніші вільні одиниці товару, що підходять. Метод гілок і меж перебирає кількість застосувань кожної багатоодиничної акції (комплекти, потім «X+Y»), а на листках оптимально розподіляє поштучні знижки й знижки від суми чека. Оптимум гарантовано в межах цієї моделі, якщо пошук вклався в бюджет вузлів (`stats.optimal: true`); інакше повертається найкращий знайдений варіант, не гірший за жадібні. Детально в пояснювальній записці.

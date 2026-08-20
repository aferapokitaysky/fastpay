# Rimvo — полный план продукта, дизайна и запуска

> Рабочий документ. Он описывает целевую систему, а не обещает, что все функции уже реализованы. Источник истины по текущей готовности и release-gates — `docs/PRODUCTION_EXECUTION_PLAN.md`.

## 1. Цель и позиционирование

**Rimvo** — QR-оплата счёта за столом для ресторанов: гость платит сам за несколько секунд, официант не ждёт терминал, а владелец получает прозрачные данные о QR-выручке и сервисе.

Основная формула: **«Сканируй QR → посмотри счёт → оплати целиком или свою часть → официант увидит подтверждение»**.

Rimvo не является банком, кошельком или посредником денег. Деньги идут напрямую на эквайринг ресторана; Rimvo продаётся по подписке за операционный продукт и CRM.

## 2. Пользователи и права

| Роль | Главная задача | Доступ |
| --- | --- | --- |
| Гость | Проверить и оплатить счёт без регистрации | Только активный публичный QR конкретного стола |
| Официант | Открыть заказ, добавить позиции, принять оплату | Свой зал/столы, вход по персональному PIN |
| Менеджер | Настроить смену и команду, контролировать зал | Кабинет и команда своего заведения |
| Владелец | QR, меню, сотрудники, платежи, аналитика | Все заведения организации |
| Поддержка Rimvo | Помочь с интеграцией | Только согласованный support-доступ с аудитом |

Принцип: UI никогда не решает права. Каждое действие повторно авторизуется на API, tenant-scoped по organization/venue.

## 3. Дизайн-направление полного UI-rebuild

### 3.1 Визуальный язык

- Основа: чистый белый фон, глубокий `Rimvo green`, акцентный тёплый оранжевый только для действий/внимания.
- Не «банковский кабинет» и не перегруженная POS-касса: крупные суммы, короткие подписи, чёткие статусы.
- Бренд: логотип Rimvo всегда используется как изображение/вектор, не заменяется текстовым словом в шапке.
- Карточки — только для смысловых групп. Не оборачивать в карточку каждый текст.
- Один главный CTA на экран. Вторичные действия — нейтральные и не спорят с оплатой.
- Анимации 160–220ms, только для подтверждения состояния; `prefers-reduced-motion` обязателен.

### 3.2 Токены

| Слой | Решение |
| --- | --- |
| Цвет фона | `#F6F8F7`, на телефоне рабочая поверхность белая |
| Тёмный текст | почти-чёрный зелёный, не чистый #000 |
| Primary | насыщенный зелёный; disabled — контрастный серо-зелёный |
| Accent | Rimvo orange для уведомления, timer, внимания; не для error |
| Error | отдельный красно-терракотовый, с текстом причины |
| Radius | 12 / 16 / 24, не больше трёх размеров |
| Touch | минимум 44×44px, CTA от 50px высотой |
| Typography | системный sans, tabular-nums для денег и таймеров |

### 3.3 Адаптивная модель

- 320–430px: mobile-first, один поток, sticky CTA в safe area.
- 431–759px: tablet; больше воздуха, 2–3 карточки зала в ряд.
- 760–1119px: рабочий desktop с sidebar и широким контентом.
- 1120px+: сетка зала авто-fill; уведомления — выезжающая панель, не пустая третья колонка.
- Никаких фиксированных ширин, которые ломают iPhone SE, Safari zoom или планшет.

## 4. Информационная архитектура

### Публичная часть

1. `/` — очень короткий продуктовый вход/демо.
2. `/t/:token` — активный счёт гостя.
3. `/t/:token/split` — выбор позиций своей части.
4. `/t/:token/checkout` — проверка суммы перед редиректом к банку.
5. `/t/:token/processing` — ожидание подтверждения только по серверному intent.
6. `/t/:token/success` — чек, сумма, благодарность, добровольная лояльность.
7. Public states: пустой стол, QR отозван, сеть недоступна, счёт закрыт.

### Staff PWA

1. `/staff` PIN-вход / восстановление сессии.
2. Зал: фильтр зала, поиск стола, статусы, краткие показатели смены.
3. Стол: заказ, гость/время, позиции, остаток, действие «Позвать счёт».
4. Добавление позиций: быстрый поиск/категории, quantity controls, conflict state.
5. Inbox: запрос счёта, начало оплаты, успех/ошибка, вызов официанта; seen/resolved.
6. Смена: имя, текущая сумма, чаевые, завершение сессии.

### Owner / manager

1. Overview: реальные показатели, выбранный период и понятный empty state.
2. Столы и QR: залы, столы, печать/PNG, копирование URL, reissue/revoke.
3. Меню: список, поиск, создание, редактирование, архивирование.
4. Команда: создание официанта/PIN и менеджера/email, смена доступа, аудит.
5. Оплата: provider status, подключение, webhook health, инструкции до production.
6. Позже: CRM гостей, лояльность, отзывы, интеграции, export.

## 5. Детальный UX гостя

### Экран счёта

- Верх: логотип, название ресторана, table chip и live-indicator «Рахунок оновлено».
- Главная информация — сумма и статус счёта, затем состав заказа. Не наоборот.
- Позиция: название, quantity × цена, сумма; оплаченная позиция видна, но отделена и недоступна для выбора.
- Чаевые: `Без чайових`, разрешённые пресеты и `Своя сума`. Своя сумма в гривнах, с мгновенной валидацией.
- Sticky bottom CTA: «Оплатити 1 364 ₴», меняется при split/чаевых.
- Split доступен только если есть минимум две неоплаченные позиции. Показывает выбранную сумму и число выбранных позиций.

### Правила платежа

- Сумма всегда считается API из server-side outstanding amount, не из цены на клиенте.
- В split выбираются только `payable` позиции; reserved/paid отключены с понятной причиной.
- Нажатие CTA создаёт idempotent PaymentIntent. Повторный tap/refresh не создаёт второй платёж.
- До webhook нельзя показывать «успех». Processing восстанавливается после refresh из session snapshot + intent polling.
- Ошибка провайдера возвращает на checkout и объясняет, что позиции снова доступны либо зарезервированы.
- Успех показывает оплаченную часть, время, ресторан и стол. Лояльность — только добровольный opt-in после оплаты.

## 6. Детальный UX официанта

### Зал

- Верхняя строка: зал, online-state, поиск, inbox count, refresh.
- Карточка стола содержит ровно: номер, статус, сумму/причину, гостей и elapsed time.
- Статусы: свободен, в зале, счёт запрошен, оплата начата, оплачено, ошибка оплаты. Цвет — дополнение к тексту, не единственный сигнал.
- На mobile bottom navigation всегда доступна; на desktop превращается в левую навигацию.
- Уведомления не висят вечно: fresh/unread → seen → resolved/archived; deep-link открывает стол.

### Заказ

- Изменения заказа отправляются с version; при `409` показывается новая версия и безопасное повторное действие.
- Кнопки удаления/закрытия требуют подтверждения только для необратимых действий.
- «Позвать счёт» переводит заказ в состояние, видимое гостю; после начала оплаты позиции нельзя незаметно менять.
- Закрыть стол можно только после server-confirmed полного платежа.

## 7. Детальный UX владельца

- Overview не показывает фейковые цифры live-ресторану. Пока аналитика не готова — честный loading/empty state.
- Столы сгруппированы по залам; создание стола требует явного выбранного зала, а не скрытого «основного».
- QR-sheet: полноразмерный код, URL, PNG, print layout, дата reissue; destructive reissue подтверждается.
- Меню: цена в гривнах, нормализация копеек, старые чеки неизменяемы.
- Команда: секреты никогда не читаются назад. Новый PIN/пароль — отдельное намеренное действие.
- Эквайринг: в production только название provider, статус и время проверки; ключи не возвращаются API.

## 8. Данные и бизнес-правила

1. Organization → venue → floor → table. QR привязан к table через opaque rotating token.
2. Order принадлежит столу и имеет версию. В один момент у стола один активный счёт.
3. Order item хранит snapshot name/unitPrice/quantity; изменение меню не меняет исторический заказ.
4. PaymentIntent хранит snapshot оплаты, food/tip отдельно, provider reference, status и idempotency key.
5. Split reservation атомарна, имеет TTL, снимается на failure/expiry, не может пересечься с другим intent.
6. Webhook — единственный источник подтверждения; проверка подписи, дедупликация provider event ID, audit.
7. Все money values — integer kopecks; UI форматирует, но не хранит float.
8. Timezone аналитики — timezone venue. Не учитывать cancelled/failed/voided платежи.
9. Любое изменение QR, ролей, меню, order и payment status пишется в audit log.

## 9. План работ и порядок релизов

### Wave A — продуктовая база и полный UI rebuild

- [ ] Согласовать final visual direction на одном guest screen.
- [ ] Переписать tokens и foundation CSS без legacy-overrides.
- [ ] Перестроить guest bill, split, checkout, processing, success, empty/error states.
- [ ] Перестроить staff PIN, floor, order и inbox с real responsive QA.
- [ ] Перестроить owner overview, tables, menu, team, payment setup.
- [ ] Сделать design QA на 320/375/390/430/768/1024/1280/1440.

### Wave B — операционная полнота

- [ ] Залы/террасы CRUD и явный выбор зала для нового стола.
- [ ] Menu categories, archive/unarchive, availability.
- [ ] Employee lifecycle: edit, PIN/password reset, deactivate (без удаления audit history).
- [ ] WebSocket/SSE backend, durable outbox и inbox commands.
- [ ] Realtime delivery metrics and polling fallback.

### Wave C — деньги и доверие

- [ ] Выбрать первого украинского acquirer и получить sandbox credentials.
- [ ] Provider adapter, invoice creation, signed webhook, reconciliation job.
- [ ] Refund/cancel/refusal policy и support runbook.
- [ ] ПРРО/фискализация, privacy/terms, обработка персональных данных.
- [ ] Staging smoke: PIN → order → QR → sandbox pay → webhook → staff alert.

### Wave D — CRM и аналитика

- [ ] Daily aggregates: QR revenue/share, average check, tips, times, closed tables.
- [ ] Date filtering, venue timezone, loading/error/export states.
- [ ] Consent-based guest profile: phone, visits, spend, favourite items; delete/export controls.
- [ ] Loyalty, feedback after payment, waiter call, Poster integration — только после MVP pilot.

### Wave E — release engineering

- [ ] Contract/API, unit, integration, E2E and visual regression tests.
- [ ] iOS Safari/Android Chrome device matrix.
- [ ] Sentry, structured logs, tracing, alert policy, dashboards.
- [ ] Preview/staging/prod separation, secrets, backups, migrations, rollback drill.
- [ ] Pilot with 1 venue / 10 tables / 2 waiters / 7-day reconciliation.

## 10. Definition of Done для production pilot

- Реальный ресторан сам создаёт зал, стол, QR, меню и сотрудника.
- Официант надёжно ведёт заказ на телефоне при плохой сети и не теряет изменения.
- Гость на iOS/Android оплачивает весь/частичный счёт; повторные платежи и webhook не дублируют деньги.
- Официант видит один realtime-alert о подтверждённой оплате не позже 5 секунд.
- Владелец видит только фактические метрики, которые сходятся с provider reconciliation.
- Пройдены security, accessibility, mobile browser и failure-mode checks.
- Есть поддержка, мониторинг, rollback и ответственный за ежедневную сверку.

## 11. Рабочий процесс

- Codex: frontend, responsive UI, guest/staff/owner flows, API adapters, visual QA.
- Claude: contracts, API, DB/migrations, auth, provider adapter, webhooks, realtime, integration tests.
- Каждая кросс-командная задача сначала фиксируется в `collaboration/INBOX.md` с контрактом и acceptance criteria.
- Один scoped feature → отдельная ветка/PR → маленькие атомарные коммиты → CI evidence.
- Никаких реальных provider keys, PIN, password, card/PAN или raw webhook secrets в git, browser storage или комментариях.

import { FOOD_DB } from "./food-db.js";

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const CONFIG = {
  aiEndpoint: localStorage.getItem("elite_ai_endpoint") || "https://elitecalorie-ai.nikitosv2401.workers.dev/",
  foodEndpoint: localStorage.getItem("elite_food_endpoint") || "https://elitecalorie-ai.nikitosv2401.workers.dev/food",
  subscriptionEndpoint: localStorage.getItem("elite_subscription_endpoint") || "https://elitecalorie-telegramf.nikitosv2401.workers.dev/subscription"
};

const LEGACY_MEAL_TIMES = {
  breakfast: "08:00",
  lunch: "13:00",
  dinner: "19:00",
  other: "21:00"
};

const ACTIVITY_FACTORS = {
  low: 1.2,
  light: 1.35,
  steps: 1.45,
  strength2: 1.5,
  strength4: 1.6,
  cardio: 1.55,
  crossfit: 1.72,
  mixed: 1.68,
  athlete: 1.85
};

const TEXT = {
  ru: {
    subtitle: "персональный КБЖУ-трекер",
    today: "Сегодня",
    plan: "плана",
    overPlan: "сверх плана",
    diary: "Дневник",
    clear: "Очистить",
    timeFormat: "По времени приема",
    dayToTomorrow: "День на завтра",
    emptyDiary: "Сегодня пока пусто. Добавь продукт, фото или свое блюдо.",
    food: "Еда",
    foodCaption: "общая база, штрихкод и личная библиотека",
    generalLibrary: "Общая библиотека",
    personalLibrary: "Моя библиотека",
    searchPlaceholder: "Например: творог савушкин или штрихкод",
    photo: "Фото",
    photoCaption: "тарелка, этикетка или таблица КБЖУ",
    account: "Аккаунт",
    saveProfile: "Сохранить и рассчитать",
    added: "Добавлено в дневник"
  },
  en: {
    subtitle: "personal calorie and macro tracker",
    today: "Today",
    plan: "of plan",
    overPlan: "over plan",
    diary: "Diary",
    clear: "Clear",
    timeFormat: "By meal time",
    dayToTomorrow: "Copy day",
    emptyDiary: "Nothing here yet. Add a food, photo, or custom dish.",
    food: "Food",
    foodCaption: "shared library, barcode, and personal foods",
    generalLibrary: "Shared library",
    personalLibrary: "My library",
    searchPlaceholder: "Example: yogurt, chicken, or barcode",
    photo: "Photo",
    photoCaption: "plate, label, or nutrition table",
    account: "Account",
    saveProfile: "Save and calculate",
    added: "Added to diary"
  }
};

const $app = document.querySelector("#app");
const dateToKey = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const todayKey = () => dateToKey(new Date());
const currentTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const sortByTimeDesc = (a, b) => String(b.time || "").localeCompare(String(a.time || ""));
const state = loadState();
let selectedDateKey = state.selectedDateKey || todayKey();
if (!state.account) {
  state.account = telegramAccount();
  saveState();
}
let activeTab = state.profile ? "home" : "profile";
let remoteCache = [];
let searchMode = state.searchMode || "all";
let searchCategory = state.searchCategory || "all";
let profilePane = state.profilePane || "account";

function loadState() {
  const fallback = {
    profile: null,
    account: telegramAccount(),
    diary: {},
    water: {},
    customFoods: [],
    favoriteFoods: [],
    measurements: [],
    subscription: { trialStartedAt: new Date().toISOString(), premiumUntil: "", plan: "trial" },
    language: "ru",
    settings: { aiEndpoint: CONFIG.aiEndpoint, foodEndpoint: CONFIG.foodEndpoint, subscriptionEndpoint: CONFIG.subscriptionEndpoint }
  };
  try {
    const loaded = { ...fallback, ...JSON.parse(localStorage.getItem("elite_calorie_state") || "{}") };
    loaded.settings ||= {};
    loaded.settings.aiEndpoint ||= CONFIG.aiEndpoint;
    loaded.settings.foodEndpoint ||= CONFIG.foodEndpoint;
    loaded.settings.subscriptionEndpoint ||= CONFIG.subscriptionEndpoint;
    loaded.water ||= {};
    loaded.customFoods ||= [];
    loaded.favoriteFoods ||= [];
    loaded.measurements ||= [];
    loaded.subscription ||= { trialStartedAt: new Date().toISOString(), premiumUntil: "", plan: "trial" };
    loaded.subscription.trialStartedAt ||= new Date().toISOString();
    loaded.language ||= loaded.profile?.language || "ru";
    migrateDiary(loaded);
    return loaded;
  } catch {
    return fallback;
  }
}

function saveState() {
  state.selectedDateKey = selectedDateKey;
  localStorage.setItem("elite_calorie_state", JSON.stringify(state));
}

function migrateDiary(store) {
  Object.keys(store.diary || {}).forEach((key) => {
    if (!Array.isArray(store.diary[key])) {
      const day = store.diary[key] || {};
      store.diary[key] = Object.keys(LEGACY_MEAL_TIMES).flatMap((meal) =>
        (day[meal] || []).map((entry) => ({
          ...entry,
          time: entry.time || LEGACY_MEAL_TIMES[meal],
          legacyMeal: meal
        }))
      );
    }
    store.diary[key].forEach((entry) => {
      entry.time ||= currentTime();
    });
    store.diary[key].sort(sortByTimeDesc);
  });
}

function telegramAccount() {
  const user = tg?.initDataUnsafe?.user;
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
  return {
    id: user?.id || "local",
    name: fullName || user?.username || "Аккаунт EliteCalorie",
    username: user?.username || "",
    savedAt: new Date().toISOString()
  };
}

function icon(id) {
  return `<svg aria-hidden="true"><use href="#${id}"></use></svg>`;
}

function fmt(value) {
  return Math.round(Number(value || 0));
}

function progressInfo(current, target) {
  const safeTarget = Math.max(Number(target || 0), 1);
  const percent = Math.round((Number(current || 0) / safeTarget) * 100);
  const over = Math.max(0, Number(current || 0) - safeTarget);
  return {
    percent,
    visual: Math.min(100, Math.max(0, percent)),
    over,
    overPercent: Math.max(0, percent - 100)
  };
}

function lang() {
  return state.language || state.profile?.language || "ru";
}

function t(key) {
  return TEXT[lang()]?.[key] || TEXT.ru[key] || key;
}

function ui(ru, en) {
  return lang() === "en" ? en : ru;
}

function byDate() {
  const key = selectedDateKey;
  state.diary[key] ||= [];
  return state.diary[key];
}

function allDayEntries(key = selectedDateKey) {
  return state.diary[key] || [];
}

function selectedDate() {
  const [year, month, day] = selectedDateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function weekDays() {
  const current = selectedDate();
  const monday = new Date(current);
  const day = (current.getDay() + 6) % 7;
  monday.setDate(current.getDate() - day);
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    return d;
  });
}

function totals() {
  return allDayEntries().reduce((acc, item) => {
    acc.kcal += Number(item.kcal || 0);
    acc.protein += Number(item.protein || 0);
    acc.fat += Number(item.fat || 0);
    acc.carbs += Number(item.carbs || 0);
    return acc;
  }, { kcal: 0, protein: 0, fat: 0, carbs: 0 });
}

function targets() {
  if (state.profile?.manualTargets?.enabled) return state.profile.manualTargets;
  return state.profile?.targets || { kcal: 2200, protein: 130, fat: 70, carbs: 250 };
}

function waterByDate(key = selectedDateKey) {
  state.water ||= {};
  state.water[key] ||= { ml: 0 };
  return state.water[key];
}

function waterTarget() {
  return Number(state.profile?.waterTarget || Math.round((state.profile?.weight || 75) * 35 / 50) * 50 || 2500);
}

function subscriptionStatus() {
  const now = Date.now();
  const trialStarted = new Date(state.subscription?.trialStartedAt || new Date().toISOString()).getTime();
  const trialUntil = trialStarted + 3 * 24 * 60 * 60 * 1000;
  const premiumUntil = state.subscription?.premiumUntil ? new Date(state.subscription.premiumUntil).getTime() : 0;
  if (premiumUntil > now) {
    return { active: true, kind: "premium", until: new Date(premiumUntil), daysLeft: Math.ceil((premiumUntil - now) / 86400000) };
  }
  if (trialUntil > now) {
    return { active: true, kind: "trial", until: new Date(trialUntil), daysLeft: Math.ceil((trialUntil - now) / 86400000) };
  }
  return { active: false, kind: "expired", until: new Date(trialUntil), daysLeft: 0 };
}

function calcTargets(profile) {
  const sexOffset = profile.sex === "male" ? 5 : -161;
  const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + sexOffset;
  const activity = ACTIVITY_FACTORS[profile.activity] || ACTIVITY_FACTORS.low;
  const tdee = bmr * activity;
  const plan = buildWeightPlan(profile, tdee);
  const kcalFloor = profile.sex === "female" ? 1200 : 1500;
  let kcal = Math.round(tdee + plan.dailyKcalDelta);
  if (kcal < kcalFloor) {
    kcal = kcalFloor;
    plan.note = `${plan.note ? `${plan.note} ` : ""}${forProfile(profile, `Калории не опускаю ниже безопасного минимума ${kcalFloor} ккал.`, `Calories are not lowered below the safe minimum of ${kcalFloor} kcal.`)}`;
  }
  const protein = Math.round(profile.weight * (plan.goal === "lose" ? 1.8 : 1.6));
  const fat = Math.round(profile.weight * (plan.goal === "gain" ? 0.9 : 0.8));
  const carbs = Math.max(60, Math.round((kcal - protein * 4 - fat * 9) / 4));
  profile.plan = plan;
  return { kcal, protein, fat, carbs };
}

function buildWeightPlan(profile, tdee) {
  const current = Number(profile.weight || 0);
  const target = Number(profile.targetWeight || current);
  const requestedDays = Math.max(1, Math.round(Number(profile.planDays || 90)));
  const diff = target - current;
  let goal = profile.goal;
  if (Math.abs(diff) >= 0.2) goal = diff < 0 ? "lose" : "gain";

  if (Math.abs(diff) < 0.2 || goal === "keep") {
    return {
      goal: "keep",
      targetWeight: target,
      requestedDays,
      planDays: requestedDays,
      dailyKcalDelta: 0,
      finishDate: futureDateKey(requestedDays),
      note: forProfile(profile, "Цель похожа на поддержание, поэтому держим стабильную норму.", "This looks like maintenance, so the target stays stable.")
    };
  }

  const absKg = Math.abs(diff);
  const safeKgPerWeek = goal === "lose" ? Math.max(0.35, current * 0.01) : Math.max(0.2, current * 0.005);
  const minDays = Math.ceil(absKg / (safeKgPerWeek / 7));
  const maxDays = Math.max(minDays, 540);
  let planDays = requestedDays;
  let note = "";

  if (requestedDays < minDays) {
    planDays = minDays;
    note = forProfile(profile, `Срок был слишком жестким, поставил безопасный минимум: ${minDays} дн.`, `The timeline was too aggressive, so I set the safe minimum: ${minDays} days.`);
  } else if (requestedDays > maxDays) {
    planDays = maxDays;
    note = forProfile(profile, `Срок был слишком растянутым, поставил рабочий максимум: ${maxDays} дн.`, `The timeline was too long, so I set a practical maximum: ${maxDays} days.`);
  }

  const dailyKcalDelta = Math.round((diff * 7700) / planDays);
  return {
    goal,
    targetWeight: target,
    requestedDays,
    planDays,
    minDays,
    maxDays,
    dailyKcalDelta,
    finishDate: futureDateKey(planDays),
    note
  };
}

function forProfile(profile, ru, en) {
  return profile?.language === "en" ? en : ru;
}

function futureDateKey(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return dateToKey(d);
}

function render() {
  document.documentElement.lang = lang();
  const total = totals();
  const target = targets();
  const progress = progressInfo(total.kcal, target.kcal);
  $app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">E</div>
        <div>
          <h1>EliteCalorie</h1>
          <p>${state.profile ? goalLabel(state.profile.goal) : t("subtitle")}</p>
        </div>
      </div>
      <span class="pill account-pill">${escapeHtml(state.account?.name || t("account"))}</span>
    </header>
    ${activeTab === "home" ? homeView(total, target, progress) : ""}
    ${activeTab === "search" ? searchView() : ""}
    ${activeTab === "photo" ? photoView() : ""}
    ${activeTab === "profile" ? profileView() : ""}
    ${tabs()}
  `;
  bind();
}

function homeView(total, target, progress) {
  const entries = byDate().slice().sort(sortByTimeDesc);
  const totalEntries = allDayEntries().length;
  const current = selectedDate();
  const water = waterByDate();
  const subscription = subscriptionStatus();
  return `
    ${subscription.active ? "" : subscriptionGate()}
    <section class="hero">
      <div class="hero-head">
        <div>
          <p class="eyebrow">${selectedDateKey === todayKey() ? t("today") : dayTitle(current)}</p>
          <h2>${fmt(total.kcal)} ${ui("из", "of")} ${fmt(target.kcal)} ${ui("ккал", "kcal")}</h2>
          <p class="hero-copy">${progress.over > 0 ? `${ui("Переел дневную норму на", "Over daily target by")} ${fmt(progress.over)} ${ui("ккал", "kcal")}.` : (state.profile ? ui("Дневная цель обновляется после изменения анкеты.", "Daily target updates after profile changes.") : ui("Заполни профиль, чтобы EliteCalorie рассчитал твою норму.", "Fill in your profile so EliteCalorie can calculate your target."))}</p>
        </div>
        <div class="ring ${progress.over > 0 ? "over" : ""}" style="--value:${progress.visual}">
          <div class="ring-inner"><strong>${progress.percent}%</strong><span>${progress.over > 0 ? t("overPlan") : t("plan")}</span>${progress.over > 0 ? `<em>+${fmt(progress.over)} ${ui("ккал", "kcal")}</em>` : ""}</div>
        </div>
      </div>
      <div class="macro-grid">
        ${macro(ui("Белки", "Protein"), total.protein, target.protein, ui("г", "g"))}
        ${macro(ui("Жиры", "Fat"), total.fat, target.fat, ui("г", "g"))}
        ${macro(ui("Углеводы", "Carbs"), total.carbs, target.carbs, ui("г", "g"))}
      </div>
      <div class="hero-subline">
        <span>${subscription.kind === "trial" ? `${ui("Пробный период", "Trial")} · ${subscription.daysLeft} ${ui("дн.", "d")}` : subscription.kind === "premium" ? `${ui("Premium до", "Premium until")} ${subscription.until.toLocaleDateString(lang() === "en" ? "en-US" : "ru-RU")}` : ui("Нужна подписка", "Subscription needed")}</span>
        <button data-tab-jump="profile">${ui("Управлять", "Manage")}</button>
      </div>
    </section>
    ${waterView(water)}
    ${snackView(total, target)}
    <section class="section">
      <div class="section-title">
        <div><h2>${t("diary")}</h2><p>${dayTitle(current)} · ${totalEntries ? `${totalEntries} ${ui("записей", "entries")}` : ui("пока пусто", "empty")}</p></div>
        <div class="title-actions">
          <button class="pill" data-action="open-calendar">${ui("Календарь", "Calendar")}</button>
          <button class="pill" data-action="clear-day">${t("clear")}</button>
        </div>
      </div>
      <div class="calendar-nav">
        <button data-action="shift-week" data-days="-7">←</button>
        <strong>${ui("Неделя", "Week")}</strong>
        <button data-action="shift-week" data-days="7">→</button>
      </div>
      <div class="day-strip">
        ${weekDays().map(dayButton).join("")}
      </div>
      <div class="meal-head">
        <div>
          <span>${ui("Формат дневника", "Diary format")}</span>
          <strong>${t("timeFormat")}</strong>
        </div>
        <button class="pill" data-action="copy-day-tomorrow">${t("dayToTomorrow")}</button>
      </div>
      <div class="stack">
        ${entries.length ? entries.map(entryRow).join("") : `<div class="card empty">${t("emptyDiary")}</div>`}
      </div>
    </section>
  `;
}

function waterView(water) {
  const target = waterTarget();
  const percent = Math.min(100, Math.round((Number(water.ml || 0) / target) * 100));
  return `
    <section class="compact-panel water-panel">
      <div>
        <span>${ui("Вода", "Water")}</span>
        <strong>${fmt(water.ml)} / ${fmt(target)} мл</strong>
      </div>
      <div class="water-bar"><i style="width:${percent}%"></i></div>
      <div class="water-actions">
        <button data-water="250">+250</button>
        <button data-water="500">+500</button>
        <button data-water="-250">-250</button>
      </div>
    </section>
  `;
}

function snackView(total, target) {
  const remaining = Math.round(Number(target.kcal || 0) - Number(total.kcal || 0));
  const suggestions = snackSuggestions(remaining);
  return `
    <section class="compact-panel snack-panel">
      <div class="snack-head">
        <div><span>${ui("Перекус", "Snack")}</span><strong>${remaining > 0 ? `${remaining} ${ui("ккал осталось", "kcal left")}` : ui("лимит уже закрыт", "target reached")}</strong></div>
      </div>
      <div class="snack-list">
        ${suggestions.length ? suggestions.map(item => `<button data-food='${escapeAttr(JSON.stringify({ ...item.food, defaultGrams: item.grams }))}'><span>${escapeHtml(item.food.name)}</span><em>${item.grams} ${ui("г", "g")} · ${fmt(item.kcal)} ${ui("ккал", "kcal")}</em></button>`).join("") : `<p>${ui("Сегодня лучше вода, чай без сахара или легкая прогулка.", "Today choose water, unsweetened tea, or a light walk.")}</p>`}
      </div>
    </section>
  `;
}

function subscriptionGate() {
  return `
    <section class="subscription-gate">
      <strong>${ui("Пробный период закончился", "Trial ended")}</strong>
      <span>${ui("Оформи Premium через Telegram Stars: 50 звезд в месяц или 100 звезд за 3 месяца.", "Activate Premium with Telegram Stars: 50 Stars monthly or 100 Stars for 3 months.")}</span>
      <button data-tab-jump="profile">${ui("Перейти к оплате", "Go to payment")}</button>
    </section>
  `;
}

function dayButton(date) {
  const key = dateToKey(date);
  const labels = lang() === "en" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const label = labels[(date.getDay() + 6) % 7];
  const count = allDayEntries(key).length;
  return `
    <button class="day-chip ${key === selectedDateKey ? "active" : ""}" data-day="${key}">
      <span>${label}</span>
      <strong>${date.getDate()}</strong>
      ${count ? `<em>${count}</em>` : ""}
    </button>
  `;
}

function dayTitle(date) {
  const labels = lang() === "en"
    ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    : ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  return lang() === "en"
    ? `${labels[date.getDay()]}, ${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`
    : `${labels[date.getDay()]}, ${date.getDate()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function macro(label, current, target, unit) {
  const info = progressInfo(current, target);
  const hint = info.over > 0 ? `${ui("переел на", "over by")} ${fmt(info.over)} ${unit}` : `${info.percent}% ${ui("нормы", "of target")}`;
  return `<div class="macro ${info.over > 0 ? "over" : ""}"><span>${label}</span><strong>${fmt(current)} / ${fmt(target)} ${unit}</strong><em>${hint}</em></div>`;
}

function entryRow(item) {
  return `
    <article class="entry-row">
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <p class="entry-meta"><span class="entry-time">${escapeHtml(item.time || "--:--")}</span><span>${fmt(item.grams)} ${ui("г", "g")}</span><span>${ui("Б", "P")} ${fmt(item.protein)}</span><span>${ui("Ж", "F")} ${fmt(item.fat)}</span><span>${ui("У", "C")} ${fmt(item.carbs)}</span></p>
      </div>
      <div class="entry-actions">
        <span class="kcal-chip">${fmt(item.kcal)} ${ui("ккал", "kcal")}</span>
        <button class="mini-action" data-action="edit-entry" data-id="${item.id}" title="${ui("Исправить граммы", "Edit grams")}">${ui("г", "g")}</button>
        <button class="mini-action" data-action="copy-entry-tomorrow" data-id="${item.id}" title="${ui("Скопировать на завтра", "Copy to tomorrow")}">↗</button>
        <button class="mini-action danger" data-action="delete-entry" data-id="${item.id}" title="${ui("Удалить", "Delete")}">×</button>
      </div>
    </article>
  `;
}

function searchView() {
  const library = state.customFoods || [];
  const quick = favoriteQuickFoods();
  return `
    <section class="section">
      <div class="section-title">
        <div><h2>${t("food")}</h2><p>${t("foodCaption")}</p></div>
      </div>
      <div class="library-console">
        <div class="library-metrics">
          <div><span>${t("generalLibrary")}</span><strong>${FOOD_DB.length}+</strong></div>
          <div><span>${t("personalLibrary")}</span><strong>${library.length}</strong></div>
        </div>
        <div class="segmented" role="group" aria-label="Режим библиотеки">
          ${libraryModeButton("all", ui("Все", "All"))}
          ${libraryModeButton("general", ui("Общая", "Shared"))}
          ${libraryModeButton("personal", ui("Моя", "Mine"))}
        </div>
        <div class="category-strip">
          ${libraryCategories().map(category => `<button class="category-chip ${searchCategory === category.id ? "active" : ""}" data-category="${category.id}">${category.label}</button>`).join("")}
        </div>
        ${library.length ? `
          <div class="personal-shelf">
            <div><span>${ui("Быстро из моей базы", "Quick from my library")}</span><button data-library-mode="personal">${ui("Открыть", "Open")}</button></div>
            <div class="library-list">
              ${library.slice(0, 10).map(food => `<button class="library-chip" data-food='${escapeAttr(JSON.stringify(food))}'>${escapeHtml(food.name)}</button>`).join("")}
            </div>
          </div>
        ` : ""}
      </div>
      <div class="searchbar">
        <div class="field"><input id="search" placeholder="${t("searchPlaceholder")}" autocomplete="off" /></div>
        <button class="icon-button" data-action="scan-barcode" title="Сканировать штрихкод">${icon("i-barcode")}</button>
        <button class="icon-button" data-action="custom-food" title="Добавить продукт">${icon("i-plus")}</button>
      </div>
      ${quick.length ? `<div class="quick-picks">${quick.map(food => `<button data-food='${escapeAttr(JSON.stringify(food))}'><span>${escapeHtml(food.name)}</span><em>${fmt(food.kcal)} ${ui("ккал", "kcal")}</em></button>`).join("")}</div>` : ""}
      <div id="results" class="stack food-results"></div>
    </section>
  `;
}

function libraryModeButton(id, label) {
  return `<button class="${searchMode === id ? "active" : ""}" data-library-mode="${id}">${label}</button>`;
}

function libraryCategories() {
  return [
    { id: "all", label: ui("Все", "All") },
    { id: "protein", label: ui("Белок", "Protein") },
    { id: "dairy", label: ui("Молочка", "Dairy") },
    { id: "ready", label: ui("Готовое", "Meals") },
    { id: "fastfood", label: ui("Фастфуд", "Fast food") },
    { id: "snacks", label: ui("Снеки", "Snacks") },
    { id: "drinks", label: ui("Напитки", "Drinks") }
  ];
}

function favoriteQuickFoods() {
  const names = ["Куриная грудка", "Творог 5%", "Банан", "Гречка вареная", "Яйцо куриное", "Йогурт греческий"];
  return names.map(name => FOOD_DB.find(food => normalizeText(food.name) === normalizeText(name))).filter(Boolean);
}

function snackSuggestions(remaining) {
  if (remaining < 80) return [];
  const desired = Math.min(Math.max(remaining, 120), 420);
  const snackNames = [
    "Йогурт греческий",
    "Творог 5%",
    "Банан",
    "Яблоко",
    "Протеиновый батончик",
    "Сырок глазированный",
    "Хлебцы гречневые",
    "Кефир 1%",
    "Омлет",
    "Сэндвич с курицей"
  ];
  return snackNames
    .map(name => FOOD_DB.find(food => normalizeText(food.name).includes(normalizeText(name))))
    .filter(Boolean)
    .map(food => {
      const defaultGrams = defaultGramsFor(food);
      const defaultKcal = food.kcal * defaultGrams / 100;
      const grams = defaultKcal <= desired ? defaultGrams : Math.max(30, Math.floor((desired / food.kcal) * 100 / 5) * 5);
      return { food, grams, kcal: food.kcal * grams / 100 };
    })
    .filter(item => item.kcal <= remaining + 30)
    .sort((a, b) => Math.abs(a.kcal - desired) - Math.abs(b.kcal - desired))
    .slice(0, 4);
}

function photoView() {
  return `
    <section class="section">
      <div class="section-title">
        <div><h2>${t("photo")}</h2><p>${t("photoCaption")}</p></div>
      </div>
      <div class="card photo-box">
        <div class="field">
          <label>${ui("Фото блюда или этикетки", "Dish or label photo")}</label>
          <input id="photo-input" type="file" accept="image/*" capture="environment" />
        </div>
        <button class="button secondary" data-action="take-photo" type="button">${ui("Сфоткать сейчас", "Take photo now")}</button>
        <div class="field">
          <label>${ui("Уточнение", "Note")}</label>
          <textarea id="photo-note" placeholder="${ui("Например: съел 180 г; или курица 150 г, гречка половина тарелки", "Example: ate 180 g, chicken 150 g, half a plate of buckwheat")}"></textarea>
        </div>
        <p class="mini-note">${ui("Можно отправить тарелку, упаковку или этикетку. Если вес не очевиден, напиши граммовку в уточнении.", "Upload a plate, package, or nutrition label. If the weight is unclear, add grams in the note.")}</p>
        <button class="button" data-action="analyze-photo">${ui("Анализировать", "Analyze")}</button>
      </div>
      <div id="photo-result" class="stack section"></div>
    </section>
  `;
}

function profileView() {
  const p = state.profile || {
    accountName: state.account?.name || "Аккаунт EliteCalorie",
    language: state.language || "ru",
    sex: "male",
    age: 28,
    height: 178,
    weight: 72,
    targetWeight: 68,
    planDays: 90,
    activity: "low",
    goal: "lose"
  };
  return `
    <section class="section">
      <div class="section-title">
        <div><h2>${ui("Аккаунт", "Account")}</h2><p>${ui("персональный план, цель и норма КБЖУ", "personal plan, goal, calories and macros")}</p></div>
      </div>
      <div class="profile-tabs">
        ${profilePaneButton("account", ui("Профиль", "Profile"))}
        ${profilePaneButton("measurements", ui("Замеры", "Measurements"))}
      </div>
      ${profilePane === "measurements" ? measurementsPane(p) : accountPane(p)}
    </section>
  `;
}

function profilePaneButton(id, label) {
  return `<button class="${profilePane === id ? "active" : ""}" data-profile-pane="${id}">${label}</button>`;
}

function accountPane(p) {
  const plan = state.profile?.plan;
  return `
    ${subscriptionPanel()}
    <form id="profile-form" class="profile-panel stack">
      <div class="profile-hero">
        <div class="profile-avatar">${escapeHtml((state.account?.name || "E").trim().slice(0, 1).toUpperCase())}</div>
        <div>
          <span>${ui("Личный кабинет", "Personal cabinet")}</span>
          <strong>${escapeHtml(state.account?.name || "Аккаунт EliteCalorie")}</strong>
          <p>${state.account?.username ? `@${escapeHtml(state.account.username)}` : ui("Дневник, продукты и замеры сохраняются на этом устройстве.", "Diary, foods, and measurements are saved on this device.")}</p>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head">
          <div><strong>${ui("Основное", "Basics")}</strong><span>${ui("данные для расчета обмена", "used for metabolism calculation")}</span></div>
        </div>
        <div class="field"><label>${ui("Имя аккаунта", "Account name")}</label><input name="accountName" value="${escapeAttr(p.accountName || state.account?.name || "")}" placeholder="${ui("Ваше имя", "Your name")}" required /></div>
        <div class="form-grid">
          ${selectField("language", "Язык / Language", [["ru", "Русский"], ["en", "English"]], p.language || state.language || "ru")}
          ${selectField("sex", ui("Пол", "Sex"), [["male", ui("Мужской", "Male")], ["female", ui("Женский", "Female")]], p.sex)}
          ${numberField("age", ui("Возраст", "Age"), p.age, "28")}
          ${numberField("height", ui("Рост, см", "Height, cm"), p.height, "178")}
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head">
          <div><strong>${ui("Цель и активность", "Goal and activity")}</strong><span>${ui("на этом строится безопасный темп", "sets a safe pace")}</span></div>
        </div>
        <div class="form-grid">
          ${numberField("weight", ui("Текущий вес, кг", "Current weight, kg"), p.weight, "72")}
          ${numberField("targetWeight", ui("Целевой вес, кг", "Target weight, kg"), p.targetWeight, "68")}
          ${numberField("planDays", ui("Срок, дней", "Plan days"), p.planDays, "90")}
          ${numberField("waterTarget", ui("Вода в день, мл", "Daily water, ml"), p.waterTarget || waterTarget(), "2500")}
          ${selectField("activity", ui("Активность", "Activity"), activityOptions(), p.activity)}
          ${selectField("goal", ui("Цель", "Goal"), goalOptions(), p.goal)}
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-head">
          <div><strong>${ui("Своя норма КБЖУ", "Custom macro target")}</strong><span>${ui("если хочешь выставить значения вручную", "set your own numbers manually")}</span></div>
        </div>
        <label class="toggle-row">
          <input name="manualEnabled" type="checkbox" ${p.manualTargets?.enabled ? "checked" : ""} />
          <span>${ui("Использовать мои значения вместо расчета", "Use my values instead of calculated target")}</span>
        </label>
        <div class="form-grid">
          ${numberField("manualKcal", ui("Ккал", "Kcal"), p.manualTargets?.kcal || targets().kcal, "2200")}
          ${numberField("manualProtein", ui("Белки, г", "Protein, g"), p.manualTargets?.protein || targets().protein, "150")}
          ${numberField("manualFat", ui("Жиры, г", "Fat, g"), p.manualTargets?.fat || targets().fat, "70")}
          ${numberField("manualCarbs", ui("Углеводы, г", "Carbs, g"), p.manualTargets?.carbs || targets().carbs, "230")}
        </div>
      </div>
      <button class="button">${t("saveProfile")}</button>
    </form>
    ${state.profile ? `
      <div class="card section plan-card">
        <span>${ui("Персональный план", "Personal plan")}</span>
        <h3>${targets().kcal} ${ui("ккал", "kcal")} · ${ui("Б", "P")} ${targets().protein} · ${ui("Ж", "F")} ${targets().fat} · ${ui("У", "C")} ${targets().carbs}</h3>
        <p>${planSummary(plan)}</p>
        ${plan?.note ? `<em>${escapeHtml(plan.note)}</em>` : ""}
      </div>
    ` : ""}
  `;
}

function subscriptionPanel() {
  const status = subscriptionStatus();
  return `
    <section class="subscription-panel">
      <div>
        <span>${status.kind === "trial" ? ui("Пробный период", "Trial") : status.kind === "premium" ? "Premium" : ui("Подписка", "Subscription")}</span>
        <strong>${status.active ? `${status.daysLeft} ${ui("дн. осталось", "days left")}` : ui("Нужна оплата", "Payment required")}</strong>
        <p>${ui("Первые 3 дня бесплатно. Дальше Premium через Telegram Stars.", "First 3 days are free. Then Premium via Telegram Stars.")}</p>
      </div>
      <div class="subscription-actions">
        <button data-subscribe-plan="month">50 ⭐ / ${ui("месяц", "month")}</button>
        <button data-subscribe-plan="quarter">100 ⭐ / 3 ${ui("мес.", "mo")}</button>
      </div>
    </section>
  `;
}

function measurementsPane(p) {
  return `
    <form id="measurements-form" class="profile-panel stack">
      <div class="form-section">
        <div class="form-section-head">
          <div><strong>${ui("Новый замер", "New measurement")}</strong><span>${ui("лучше делать утром и в одинаковых условиях", "best done in the morning under the same conditions")}</span></div>
        </div>
        ${measurementGroup(ui("Корпус", "Torso"), [
          measurementField("weight", ui("Вес", "Weight"), p.weight, ui("кг", "kg")),
          measurementField("neck", ui("Шея", "Neck"), p.neck),
          measurementField("shoulders", ui("Плечи", "Shoulders"), p.shoulders),
          measurementField("chest", ui("Грудь", "Chest"), p.chest),
          measurementField("waist", ui("Талия", "Waist"), p.waist),
          measurementField("hips", ui("Бедра/таз", "Hips"), p.hips)
        ])}
        ${measurementGroup(ui("Руки", "Arms"), [
          measurementField("leftBiceps", ui("Бицепс левый", "Left biceps"), p.leftBiceps ?? p.biceps),
          measurementField("rightBiceps", ui("Бицепс правый", "Right biceps"), p.rightBiceps ?? p.biceps),
          measurementField("leftForearm", ui("Предплечье левое", "Left forearm"), p.leftForearm),
          measurementField("rightForearm", ui("Предплечье правое", "Right forearm"), p.rightForearm)
        ])}
        ${measurementGroup(ui("Ноги", "Legs"), [
          measurementField("leftThigh", ui("Бедро левое", "Left thigh"), p.leftThigh ?? p.thigh),
          measurementField("rightThigh", ui("Бедро правое", "Right thigh"), p.rightThigh ?? p.thigh),
          measurementField("leftCalf", ui("Икра левая", "Left calf"), p.leftCalf),
          measurementField("rightCalf", ui("Икра правая", "Right calf"), p.rightCalf)
        ])}
      </div>
      <button class="button">${ui("Сохранить замеры", "Save measurements")}</button>
    </form>
    <button class="measure-help-button" data-action="measurement-guide">
      <span>${ui("Не уверен, где мерить?", "Not sure where to measure?")}</span>
      <strong>${ui("Показать понятную схему", "Show clear guide")}</strong>
    </button>
    ${measurementProgressView()}
  `;
}

function activityOptions() {
  if (lang() === "en") {
    return [
      ["low", "Sedentary"],
      ["light", "Light activity"],
      ["steps", "High daily steps"],
      ["strength2", "Strength 1-2x/week"],
      ["strength4", "Strength 3-5x/week"],
      ["cardio", "Cardio 3-5x/week"],
      ["crossfit", "Crossfit / HIIT"],
      ["mixed", "Strength + cardio"],
      ["athlete", "Sport almost daily"]
    ];
  }
  return [
    ["low", "Сидячий режим"],
    ["light", "Легкая активность"],
    ["steps", "Много шагов"],
    ["strength2", "Силовые 1-2 раза/нед."],
    ["strength4", "Силовые 3-5 раз/нед."],
    ["cardio", "Кардио 3-5 раз/нед."],
    ["crossfit", "Кроссфит / HIIT"],
    ["mixed", "Силовые + кардио"],
    ["athlete", "Спорт почти каждый день"]
  ];
}

function goalOptions() {
  return lang() === "en"
    ? [["lose", "Lose weight"], ["keep", "Maintain"], ["gain", "Gain weight"]]
    : [["lose", "Снизить вес"], ["keep", "Поддерживать"], ["gain", "Набрать"]];
}

function measurementField(name, label, value, unit = ui("см", "cm")) {
  return `
    <label class="measure-field">
      <span>${label}</span>
      <input name="${name}" type="number" min="0" step="0.1" value="${value ?? ""}" placeholder="${unit}" />
    </label>
  `;
}

function measurementGroup(title, fields) {
  return `
    <div class="measure-group">
      <div class="measure-group-title">${title}</div>
      <div class="measure-grid accurate">${fields.join("")}</div>
    </div>
  `;
}

function openMeasurementGuide() {
  openModal(`
    <div class="section-title"><div><h2>${ui("Как измерить тело", "How to measure")}</h2><p>${ui("точки замеров для прогресса", "measurement points for progress")}</p></div></div>
    ${measurementGuideContent()}
    <button class="button" data-close>${ui("Понятно", "Got it")}</button>
  `);
}

function measurementGuideContent() {
  return `
    <div class="measurement-guide">
      <div>
        <span class="eyebrow">${ui("Правило", "Rule")}</span>
        <p>${ui("Измеряй утром или в одно и то же время. Лента параллельно полу, прилегает к коже, но не перетягивает.", "Measure in the morning or at the same time. Keep the tape level, touching the skin without squeezing.")}</p>
        <ul class="guide-list">
          <li><strong>${ui("Плечи", "Shoulders")}</strong><span>${ui("по самым широким точкам плеч.", "around the widest shoulder line.")}</span></li>
          <li><strong>${ui("Грудь", "Chest")}</strong><span>${ui("по линии сосков, спокойно выдохнуть.", "across nipple line after a relaxed exhale.")}</span></li>
          <li><strong>${ui("Талия", "Waist")}</strong><span>${ui("самая узкая точка корпуса.", "the narrowest point of the torso.")}</span></li>
          <li><strong>${ui("Лево/право", "Left/right")}</strong><span>${ui("руки и ноги записывай отдельно.", "track arms and legs separately.")}</span></li>
        </ul>
      </div>
      <svg class="measurement-map" viewBox="0 0 230 260" role="img" aria-label="${ui("Схема измерений тела", "Body measurement guide")}">
        <defs>
          <linearGradient id="bodyGrad" x1="0" x2="1">
            <stop offset="0" stop-color="#26323f"/>
            <stop offset="1" stop-color="#1a2430"/>
          </linearGradient>
        </defs>
        <circle class="body-fill" cx="115" cy="35" r="22"/>
        <path class="body-fill" d="M82 66c15-10 51-10 66 0 13 20 16 56 10 94l-13 78h-21l-9-63-9 63H85l-13-78c-6-38-3-74 10-94Z"/>
        <path class="limb-fill" d="M78 77 53 142M152 77l25 65M92 236l-10 15M138 236l10 15"/>
        <path class="guide-line neck" d="M91 58h48"/>
        <path class="guide-line shoulders" d="M66 75h98"/>
        <path class="guide-line chest" d="M72 100h86"/>
        <path class="guide-line waist" d="M80 130h70"/>
        <path class="guide-line hips" d="M72 160h86"/>
        <path class="guide-line arm" d="M55 122h35M140 122h35"/>
        <path class="guide-line leg" d="M78 205h30M122 205h30"/>
        <text x="151" y="60">${ui("шея", "neck")}</text>
        <text x="169" y="78">${ui("плечи", "shoulders")}</text>
        <text x="163" y="104">${ui("грудь", "chest")}</text>
        <text x="155" y="133">${ui("талия", "waist")}</text>
        <text x="162" y="164">${ui("бедра", "hips")}</text>
        <text x="16" y="126">${ui("руки", "arms")}</text>
        <text x="154" y="209">${ui("ноги", "legs")}</text>
      </svg>
    </div>
  `;
}

function measurementProgressView() {
  const records = (state.measurements || [])
    .slice()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (!records.length) {
    return `<div class="card progress-card"><strong>${ui("Прогресс", "Progress")}</strong><p>${ui("После сохранения замеров здесь появятся вес, объемы и динамика по дням.", "After saving measurements, weight, body sizes, and trends will appear here.")}</p></div>`;
  }
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const week = records.filter(record => new Date(record.timestamp) >= weekStart);
  const range = week.length >= 2 ? week : records.slice(-7);
  const first = range[0];
  const last = range[range.length - 1];
  const weightDelta = Number(last.weight || 0) - Number(first.weight || 0);
  const waistDelta = optionalDelta(first.waist, last.waist);
  const values = range.map(record => Number(record.weight || 0)).filter(Boolean);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  return `
    <div class="card progress-card">
      <div class="progress-head">
        <div><span>${ui("Прогресс недели", "Weekly progress")}</span><strong>${weightDelta >= 0 ? "+" : ""}${weightDelta.toFixed(1)} ${ui("кг", "kg")}</strong></div>
        <em>${autoCorrectionText(weightDelta, range.length)}</em>
      </div>
      <div class="weight-bars">
        ${range.map(record => weightBar(record, min, max)).join("")}
      </div>
      ${measurementMiniStats(last)}
      <p>${waistDelta ? `${ui("Талия", "Waist")}: ${waistDelta}. ` : ""}${ui("Последний вес", "Latest weight")}: ${Number(last.weight || 0).toFixed(1)} ${ui("кг", "kg")} · ${ui("записей", "records")}: ${records.length}</p>
    </div>
  `;
}

function measurementMiniStats(record) {
  const items = [
    [ui("Грудь", "Chest"), record.chest],
    [ui("Талия", "Waist"), record.waist],
    [ui("Бедра", "Hips"), record.hips],
    [ui("Бицепс Л", "L biceps"), record.leftBiceps],
    [ui("Бицепс П", "R biceps"), record.rightBiceps],
    [ui("Бедро Л", "L thigh"), record.leftThigh],
    [ui("Бедро П", "R thigh"), record.rightThigh]
  ].filter(([, value]) => Number(value) > 0);
  if (!items.length) return "";
  return `<div class="measure-stat-grid">${items.map(([label, value]) => `<div><span>${label}</span><strong>${Number(value).toFixed(1)}</strong></div>`).join("")}</div>`;
}

function weightBar(record, min, max) {
  const weight = Number(record.weight || 0);
  const height = max === min ? 52 : 26 + ((weight - min) / Math.max(max - min, 0.1)) * 48;
  const day = new Date(record.timestamp).getDate();
  return `<div class="weight-bar"><i style="height:${height}px"></i><span>${day}</span><b>${weight.toFixed(1)}</b></div>`;
}

function optionalDelta(from, to) {
  if (!from || !to) return "";
  const delta = Number(to) - Number(from);
  if (Math.abs(delta) < 0.05) return ui("без изменений", "no change");
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${ui("см", "cm")}`;
}

function autoCorrectionText(weightDelta, count) {
  const profile = state.profile;
  if (!profile || count < 2) return ui("нужно больше замеров", "need more measurements");
  if (profile.goal === "lose") {
    if (weightDelta > 0.3) return ui("вес растет, проверь среднюю калорийность", "weight is rising, check average calories");
    if (weightDelta < -1.2) return ui("темп высокий, не режь калории сильнее", "pace is fast, do not cut calories harder");
    return ui("темп выглядит рабочим", "pace looks good");
  }
  if (profile.goal === "gain") {
    if (weightDelta < -0.2) return ui("масса не растет, добавь калории", "weight is not rising, add calories");
    if (weightDelta > 1.0) return ui("темп быстрый, следи за талией", "pace is fast, watch waist size");
    return ui("набор идет ровно", "gain pace looks steady");
  }
  return Math.abs(weightDelta) > 0.7 ? ui("вес гуляет, проверь среднюю неделю", "weight fluctuates, check weekly average") : ui("поддержание стабильное", "maintenance is stable");
}

function planSummary(plan) {
  if (!plan) return ui("План появится после регистрации.", "Plan appears after registration.");
  const goal = goalLabel(plan.goal);
  return lang() === "en"
    ? `${goal}: target ${fmt(plan.targetWeight)} kg in ${plan.planDays} days, finish ${plan.finishDate}.`
    : `${goal}: цель ${fmt(plan.targetWeight)} кг за ${plan.planDays} дн., финиш ${plan.finishDate}.`;
}

function tabs() {
  const items = [["home", "i-home"], ["search", "i-search"], ["photo", "i-camera"], ["profile", "i-user"]];
  return `<nav class="tabs">${items.map(([id, ico]) => `<button class="tab ${activeTab === id ? "active" : ""}" data-tab="${id}">${icon(ico)}</button>`).join("")}</nav>`;
}

function bind() {
  document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => {
    activeTab = btn.dataset.tab;
    render();
  }));
  document.querySelectorAll("[data-tab-jump]").forEach(btn => btn.addEventListener("click", () => {
    activeTab = btn.dataset.tabJump;
    if (activeTab === "profile") profilePane = "account";
    render();
  }));

  document.querySelector("[data-action='clear-day']")?.addEventListener("click", () => {
    state.diary[selectedDateKey] = [];
    saveState();
    render();
    toast("Дневник очищен");
  });
  document.querySelector("[data-action='open-calendar']")?.addEventListener("click", openCalendar);
  document.querySelectorAll("[data-action='shift-week']").forEach(btn => btn.addEventListener("click", () => {
    shiftSelectedDate(Number(btn.dataset.days || 0));
  }));
  document.querySelectorAll("[data-water]").forEach(btn => btn.addEventListener("click", () => {
    addWater(Number(btn.dataset.water || 0));
  }));
  document.querySelectorAll("[data-day]").forEach(btn => btn.addEventListener("click", () => {
    selectedDateKey = btn.dataset.day;
    saveState();
    render();
  }));
  document.querySelectorAll("[data-action='delete-entry']").forEach(btn => btn.addEventListener("click", () => {
    deleteEntry(btn.dataset.id);
    saveState();
    render();
  }));
  document.querySelectorAll("[data-action='copy-entry-tomorrow']").forEach(btn => btn.addEventListener("click", () => {
    const item = findEntry(btn.dataset.id);
    if (item) {
      addEntryToDate(nextDateKey(selectedDateKey), { ...item, id: crypto.randomUUID(), copiedFrom: selectedDateKey });
      toast("Скопировано на завтра");
    }
  }));
  document.querySelectorAll("[data-action='edit-entry']").forEach(btn => btn.addEventListener("click", () => {
    openEditEntry(btn.dataset.id);
  }));
  document.querySelector("[data-action='copy-day-tomorrow']")?.addEventListener("click", () => {
    const entries = byDate();
    if (!entries.length) {
      toast("Нечего копировать");
      return;
    }
    const tomorrow = nextDateKey(selectedDateKey);
    entries.forEach((item) => addEntryToDate(tomorrow, { ...item, id: crypto.randomUUID(), copiedFrom: selectedDateKey }));
    toast("День скопирован на завтра");
  });

  document.querySelector("#profile-form")?.addEventListener("submit", saveProfile);
  document.querySelector("#search")?.addEventListener("input", debounce(runSearch, 220));
  document.querySelector("[data-action='custom-food']")?.addEventListener("click", openCustomFood);
  document.querySelector("[data-action='scan-barcode']")?.addEventListener("click", openBarcodeScanner);
  document.querySelector("[data-action='measurement-guide']")?.addEventListener("click", openMeasurementGuide);
  document.querySelector("[data-action='take-photo']")?.addEventListener("click", () => document.querySelector("#photo-input")?.click());
  document.querySelectorAll("[data-library-mode]").forEach(btn => btn.addEventListener("click", () => {
    searchMode = btn.dataset.libraryMode;
    state.searchMode = searchMode;
    saveState();
    render();
  }));
  document.querySelectorAll("[data-category]").forEach(btn => btn.addEventListener("click", () => {
    searchCategory = btn.dataset.category;
    state.searchCategory = searchCategory;
    saveState();
    render();
  }));
  document.querySelectorAll("[data-profile-pane]").forEach(btn => btn.addEventListener("click", () => {
    profilePane = btn.dataset.profilePane;
    state.profilePane = profilePane;
    saveState();
    render();
  }));
  document.querySelectorAll("[data-subscribe-plan]").forEach(btn => btn.addEventListener("click", () => requestSubscriptionInvoice(btn.dataset.subscribePlan)));
  document.querySelector("[data-action='analyze-photo']")?.addEventListener("click", analyzePhoto);
  document.querySelectorAll(".library-chip[data-food]").forEach(btn => btn.addEventListener("click", () => openAddFood(JSON.parse(btn.dataset.food))));
  document.querySelectorAll(".quick-picks [data-food]").forEach(btn => btn.addEventListener("click", () => openAddFood(JSON.parse(btn.dataset.food))));
  document.querySelectorAll(".snack-list [data-food]").forEach(btn => btn.addEventListener("click", () => {
    const food = JSON.parse(btn.dataset.food);
    openAddFood(food);
  }));
  if (activeTab === "search") runSearch();
  document.querySelector("#measurements-form")?.addEventListener("submit", saveMeasurementsOnly);
}

async function requestSubscriptionInvoice(plan) {
  const userId = tg?.initDataUnsafe?.user?.id || state.account?.id;
  if (!userId || userId === "local") {
    toast(ui("Оплата доступна внутри Telegram.", "Payment is available inside Telegram."));
    return;
  }
  try {
    const response = await fetch(state.settings.subscriptionEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invoice", plan, user_id: userId })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "invoice failed");
    toast(ui("Счет отправлен в чат с ботом.", "Invoice sent to the bot chat."));
  } catch {
    toast(ui("Не удалось отправить счет. Напиши боту /subscribe.", "Could not send invoice. Message /subscribe to the bot."));
  }
}

async function syncSubscription() {
  const userId = tg?.initDataUnsafe?.user?.id || state.account?.id;
  if (!userId || userId === "local" || !state.settings.subscriptionEndpoint) return;
  try {
    const params = new URLSearchParams({ user_id: userId });
    const response = await fetch(`${state.settings.subscriptionEndpoint}?${params}`);
    const data = await response.json();
    if (data.subscription) {
      if (data.subscription.trialStartedAt) state.subscription.trialStartedAt = data.subscription.trialStartedAt;
      if (data.subscription.until) state.subscription.premiumUntil = data.subscription.until;
      state.subscription.plan = data.subscription.plan || state.subscription.plan || "trial";
      saveState();
      render();
    }
  } catch {
    // Subscription sync is best-effort; the local trial still works offline.
  }
}

function shiftSelectedDate(days) {
  const d = selectedDate();
  d.setDate(d.getDate() + days);
  selectedDateKey = dateToKey(d);
  saveState();
  render();
}

function addWater(delta) {
  const water = waterByDate();
  water.ml = Math.max(0, Number(water.ml || 0) + delta);
  saveState();
  render();
}

function openCalendar() {
  openModal(`
    <div class="section-title"><div><h2>${ui("Календарь", "Calendar")}</h2><p>${ui("выбери любой день дневника", "choose any diary date")}</p></div></div>
    <form id="calendar-form" class="stack">
      <div class="field"><label>${ui("Дата", "Date")}</label><input name="date" type="date" value="${selectedDateKey}" required /></div>
      <div class="calendar-shortcuts">
        <button type="button" data-date-shortcut="-1">${ui("Вчера", "Yesterday")}</button>
        <button type="button" data-date-shortcut="0">${ui("Сегодня", "Today")}</button>
        <button type="button" data-date-shortcut="1">${ui("Завтра", "Tomorrow")}</button>
      </div>
      <button class="button">${ui("Открыть дату", "Open date")}</button>
    </form>
  `);
  document.querySelectorAll("[data-date-shortcut]").forEach(btn => btn.addEventListener("click", () => {
    const d = new Date();
    d.setDate(d.getDate() + Number(btn.dataset.dateShortcut || 0));
    document.querySelector("#calendar-form [name='date']").value = dateToKey(d);
  }));
  document.querySelector("#calendar-form").addEventListener("submit", event => {
    event.preventDefault();
    selectedDateKey = new FormData(event.target).get("date");
    saveState();
    closeModal();
    render();
  });
}

function nextDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + 1);
  return dateToKey(d);
}

function addEntryToDate(dateKey, entry) {
  state.diary[dateKey] ||= [];
  state.diary[dateKey].unshift({ ...entry, time: entry.time || currentTime() });
  state.diary[dateKey].sort(sortByTimeDesc);
  saveState();
}

function findEntry(id) {
  return byDate().find((item) => item.id === id);
}

function deleteEntry(id) {
  const index = byDate().findIndex((item) => item.id === id);
  if (index >= 0) byDate().splice(index, 1);
}

function openEditEntry(id) {
  const entry = findEntry(id);
  if (!entry) {
    toast(ui("Запись не найдена", "Entry not found"));
    return;
  }
  openModal(`
    <div class="section-title"><div><h2>${ui("Исправить запись", "Edit entry")}</h2><p>${escapeHtml(entry.name)}</p></div></div>
    <form id="edit-entry-form" class="stack">
      ${numberField("grams", ui("Граммы", "Grams"), entry.grams || 100, "100")}
      ${timeField("time", ui("Время приема", "Meal time"), entry.time || currentTime())}
      <button class="button">${ui("Сохранить", "Save")}</button>
      <button type="button" class="button secondary" data-close>${ui("Отмена", "Cancel")}</button>
    </form>
  `);
  document.querySelector("#edit-entry-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = new FormData(event.target);
    recalcEntry(entry, Number(form.get("grams") || entry.grams || 100));
    entry.time = form.get("time") || currentTime();
    byDate().sort(sortByTimeDesc);
    saveState();
    closeModal();
    render();
    toast(ui("Запись обновлена", "Entry updated"));
  });
}

function recalcEntry(entry, grams) {
  const per100 = entry.per100 || per100FromEntry(entry);
  const factor = Number(grams || 0) / 100;
  entry.grams = Number(grams || 0);
  entry.kcal = per100.kcal * factor;
  entry.protein = per100.protein * factor;
  entry.fat = per100.fat * factor;
  entry.carbs = per100.carbs * factor;
  entry.per100 = per100;
}

function per100FromEntry(entry) {
  if (entry.per100) {
    return {
      kcal: Number(entry.per100.kcal || 0),
      protein: Number(entry.per100.protein || 0),
      fat: Number(entry.per100.fat || 0),
      carbs: Number(entry.per100.carbs || 0)
    };
  }
  const grams = Math.max(Number(entry.grams || 0), 1);
  const factor = 100 / grams;
  return {
    kcal: Number(entry.kcal || 0) * factor,
    protein: Number(entry.protein || 0) * factor,
    fat: Number(entry.fat || 0) * factor,
    carbs: Number(entry.carbs || 0) * factor
  };
}

async function runSearch() {
  const q = document.querySelector("#search")?.value.trim().toLowerCase() || "";
  const results = document.querySelector("#results");
  if (!results) return;
  const local = localFoodPool()
    .filter(food => filterFood(food, q))
    .slice(0, 35);

  results.innerHTML = local.map(foodRow).join("") || `<div class="card empty">${ui("Начни вводить название продукта.", "Start typing a food name.")}</div>`;
  results.querySelectorAll("[data-food]").forEach(btn => btn.addEventListener("click", () => openAddFood(JSON.parse(btn.dataset.food))));

  if (q.length >= 3 && searchMode !== "personal") {
    remoteCache = await searchExternalFood(q);
    const merged = [...local, ...remoteCache.filter(food => filterFood(food, q))].slice(0, 45);
    results.innerHTML = merged.map(foodRow).join("") || `<div class="card empty">${ui("Не нашел. Добавь продукт вручную.", "No match. Add it manually.")}</div>`;
    results.querySelectorAll("[data-food]").forEach(btn => btn.addEventListener("click", () => openAddFood(JSON.parse(btn.dataset.food))));
  }
}

function localFoodPool() {
  if (searchMode === "personal") return [...state.customFoods];
  if (searchMode === "general") return [...FOOD_DB];
  return [...state.customFoods, ...FOOD_DB];
}

function filterFood(food, query) {
  const text = normalizeText(`${food.name} ${food.brand} ${food.country} ${food.source}`);
  const matchesQuery = !query || text.includes(normalizeText(query));
  const matchesCategory = searchCategory === "all" || categorizeFood(food) === searchCategory;
  return matchesQuery && matchesCategory;
}

function categorizeFood(food) {
  const text = normalizeText(`${food.name} ${food.brand}`);
  if (/кола|сок|квас|компот|морс|чай|какао|смузи|латте|капучино|коктейль|напиток/.test(text)) return "drinks";
  if (/йогурт|творог|молоко|кефир|сыр|сметан|творожок|пудинг|сырок/.test(text)) return "dairy";
  if (/бургер|чизбургер|гамбургер|картофель фри|наггетс|воппер|стрипс|пицц|шаурм|донер|хот-дог|kfc|rostic|burger king|додо|вкусно/.test(text)) return "fastfood";
  if (/батончик|чипс|сухар|шоколад|печенье|сникерс|твикс|марс|баунти|kitkat|круассан|пончик|торт|морожен/.test(text)) return "snacks";
  if (/куриц|индей|говяд|рыб|тунец|яйц|протеин|фарш|стейк|печень|сердечк/.test(text)) return "protein";
  if (/суп|борщ|плов|оливье|цезарь|пюре|пельмени|вареники|сырники|блины|паста|лазанья|омлет|салат|гречка|рис|макароны|ролл|поке|рамен|том ям/.test(text)) return "ready";
  return "all";
}

function foodRow(food) {
  const brand = food.brand ? ` · ${escapeHtml(food.brand)}` : "";
  return `
    <button class="food-row" data-food='${escapeAttr(JSON.stringify(food))}'>
      <div>
        <h3>${escapeHtml(food.name)}</h3>
        <p>${fmt(food.kcal)} ${ui("ккал", "kcal")} / 100 ${ui("г", "g")}${brand} · ${escapeHtml(food.source || ui("база", "library"))}</p>
      </div>
      <span class="kcal-chip">+</span>
    </button>
  `;
}

async function searchExternalFood(q) {
  if (!state.settings.foodEndpoint) return [];
  const params = new URLSearchParams({ q });
  try {
    const response = await fetch(`${state.settings.foodEndpoint}?${params}`);
    const data = await response.json();
    return data.products || [];
  } catch {
    return [];
  }
}

async function openBarcodeScanner() {
  let stream = null;
  let active = true;
  openModal(`
    <div class="section-title"><div><h2>${ui("Сканер штрихкода", "Barcode scanner")}</h2><p>${ui("наведи камеру на упаковку продукта", "point the camera at the package")}</p></div></div>
    <div class="barcode-box stack">
      <video id="barcode-video" autoplay muted playsinline></video>
      <p id="barcode-status" class="mini-note">${ui("Запрашиваю доступ к камере...", "Requesting camera access...")}</p>
      <form id="barcode-manual" class="stack">
        <div class="field"><label>${ui("Или введи штрихкод вручную", "Or enter barcode manually")}</label><input name="barcode" inputmode="numeric" autocomplete="off" placeholder="460..." /></div>
        <button class="button secondary">${ui("Найти по коду", "Find by code")}</button>
      </form>
      <button type="button" class="button secondary" data-close>${ui("Закрыть", "Close")}</button>
    </div>
  `, () => {
    active = false;
    stream?.getTracks().forEach(track => track.stop());
  });

  document.querySelector("#barcode-manual").addEventListener("submit", event => {
    event.preventDefault();
    const code = new FormData(event.target).get("barcode");
    if (code) {
      closeModal();
      handleBarcode(String(code).trim());
    }
  });

  const status = document.querySelector("#barcode-status");
  const video = document.querySelector("#barcode-video");
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
    status.textContent = ui("Камера для штрихкодов недоступна в этом браузере. Введи код вручную.", "Barcode camera is unavailable in this browser. Enter the code manually.");
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
    video.srcObject = stream;
    await video.play();
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    status.textContent = ui("Сканирую... держи код в рамке.", "Scanning... keep the code in frame.");
    const scan = async () => {
      if (!active || !document.body.contains(video)) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          const code = codes[0].rawValue;
          closeModal();
          await handleBarcode(code);
          return;
        }
      } catch {
        status.textContent = ui("Не могу распознать кадр. Попробуй ярче осветить упаковку.", "Cannot read this frame. Try better lighting.");
      }
      requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  } catch {
    status.textContent = ui("Не получил доступ к камере. Можно ввести код вручную.", "Camera access failed. You can enter the code manually.");
  }
}

async function handleBarcode(code) {
  activeTab = "search";
  render();
  const input = document.querySelector("#search");
  const results = document.querySelector("#results");
  if (input) input.value = code;
  if (results) results.innerHTML = `<div class="card">${ui("Ищу товар по штрихкоду", "Searching barcode")} ${escapeHtml(code)}...</div>`;
  const products = await searchExternalFood(code);
  if (products.length) {
    if (results) results.innerHTML = products.map(foodRow).join("");
    document.querySelectorAll("#results [data-food]").forEach(btn => btn.addEventListener("click", () => openAddFood(JSON.parse(btn.dataset.food))));
    openAddFood(products[0]);
    return;
  }
  if (results) results.innerHTML = `<div class="card empty">${ui("Штрихкод не найден. Добавь продукт вручную, он сохранится в личной библиотеке.", "Barcode not found. Add the product manually and it will be saved to your library.")}</div>`;
  toast(ui("Товар не найден в общей базе", "Product not found in shared library"));
}

function openAddFood(food) {
  const defaultGrams = defaultGramsFor(food);
  openModal(`
    <div class="section-title"><div><h2>${escapeHtml(food.name)}</h2><p>${escapeHtml(food.brand || food.source || "")}</p></div></div>
    <form id="add-food-form" class="stack">
      ${numberField("grams", ui("Сколько граммов", "How many grams"), defaultGrams, String(defaultGrams))}
      ${timeField("time", ui("Время приема", "Meal time"), currentTime())}
      <button class="button">${ui("Добавить в дневник", "Add to diary")}</button>
      <button type="button" class="button secondary" data-close>${ui("Отмена", "Cancel")}</button>
    </form>
  `);
  document.querySelector("#add-food-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const grams = Number(form.get("grams"));
    addFood(food, grams, form.get("time"));
    closeModal();
  });
}

function addFood(food, grams, time = currentTime()) {
  const normalized = normalizeFood(food);
  const factor = grams / 100;
  addEntryToDate(selectedDateKey, {
    id: crypto.randomUUID(),
    name: normalized.name,
    grams,
    kcal: normalized.kcal * factor,
    protein: normalized.protein * factor,
    fat: normalized.fat * factor,
    carbs: normalized.carbs * factor,
    per100: macrosFromFood(normalized),
    time: time || currentTime(),
    source: normalized.source
  });
  activeTab = "home";
  render();
  toast(t("added"));
}

function openCustomFood() {
  openModal(`
    <div class="section-title"><div><h2>${ui("Свой продукт", "Custom food")}</h2><p>${ui("данные на 100 г", "values per 100 g")}</p></div></div>
    <form id="custom-food-form" class="stack">
      <div class="field"><label>${ui("Название", "Name")}</label><input name="name" required placeholder="${ui("Например: домашний сырник", "Example: homemade pancakes")}" /></div>
      <div class="field"><label>${ui("Бренд", "Brand")}</label><input name="brand" placeholder="${ui("необязательно", "optional")}" /></div>
      <div class="form-grid">
        ${numberField("kcal", ui("Ккал", "Kcal"), "", "230")}
        ${numberField("protein", ui("Белки", "Protein"), "", "14")}
        ${numberField("fat", ui("Жиры", "Fat"), "", "10")}
        ${numberField("carbs", ui("Углеводы", "Carbs"), "", "21")}
        ${numberField("grams", ui("Съедено, г", "Eaten, g"), 100, "100")}
        ${timeField("time", ui("Время приема", "Meal time"), currentTime())}
      </div>
      <button class="button">${ui("Сохранить и добавить", "Save and add")}</button>
    </form>
  `);
  document.querySelector("#custom-food-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const food = {
      id: crypto.randomUUID(),
      name: form.get("name"),
      brand: form.get("brand"),
      country: "custom",
      kcal: Number(form.get("kcal")),
      protein: Number(form.get("protein")),
      fat: Number(form.get("fat")),
      carbs: Number(form.get("carbs")),
      source: "Моя база"
    };
    const grams = Number(form.get("grams") || 100);
    saveFoodToLibrary(food);
    addFood(food, grams, form.get("time"));
    saveState();
    closeModal();
    toast(ui("Блюдо сохранено в библиотеку", "Food saved to library"));
  });
}

function saveFoodToLibrary(food) {
  state.customFoods ||= [];
  const normalized = normalizeFood(food);
  const key = foodKey(normalized);
  const index = state.customFoods.findIndex((item) => foodKey(item) === key);
  if (index >= 0) {
    state.customFoods[index] = { ...state.customFoods[index], ...normalized, updatedAt: new Date().toISOString() };
  } else {
    state.customFoods.unshift({ ...normalized, id: normalized.id || crypto.randomUUID(), source: normalized.source || "Моя база", createdAt: new Date().toISOString() });
  }
}

function normalizeFood(food) {
  return {
    id: food.id || crypto.randomUUID(),
    name: String(food.name || "Мое блюдо").trim(),
    brand: food.brand || "",
    country: food.country || "custom",
    kcal: Number(food.kcal || 0),
    protein: Number(food.protein ?? food.protein_g ?? 0),
    fat: Number(food.fat ?? food.fat_g ?? 0),
    carbs: Number(food.carbs ?? food.carbs_g ?? 0),
    defaultGrams: Number(food.defaultGrams || 0),
    source: food.source || "Моя база"
  };
}

function macrosFromFood(food) {
  return {
    kcal: Number(food.kcal || 0),
    protein: Number(food.protein || 0),
    fat: Number(food.fat || 0),
    carbs: Number(food.carbs || 0)
  };
}

function defaultGramsFor(food) {
  if (Number(food.defaultGrams) > 0) return Number(food.defaultGrams);
  const name = normalizeText(`${food.name} ${food.brand}`);
  const rules = [
    [/йогурт|творожок|пудинг|десерт творожный/, 125],
    [/бургер|биг мак|чизбургер|гамбургер/, 220],
    [/шаурм|донер|ролл цезарь/, 280],
    [/пицц/, 120],
    [/батончик|сникерс|твикс|mars|bounty/, 50],
    [/яйц/, 55],
    [/банан/, 120],
    [/яблок/, 180],
    [/круассан|пончик/, 75],
    [/хот-дог/, 170],
    [/суп|борщ|рамен|том ям/, 300],
    [/салат|оливье|винегрет|цезарь/, 200],
    [/напиток|кола|квас|компот|морс|сок/, 250]
  ];
  const match = rules.find(([pattern]) => pattern.test(name));
  return match ? match[1] : 100;
}

function foodKey(food) {
  return `${food.name}|${food.brand}`.trim().toLowerCase().replace(/ё/g, "е");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/ё/g, "е");
}

async function analyzePhoto() {
  const input = document.querySelector("#photo-input");
  const note = document.querySelector("#photo-note").value.trim();
  const out = document.querySelector("#photo-result");
  if (!input.files?.[0]) {
    toast("Выбери фото блюда");
    return;
  }
  const file = input.files[0];
  const preview = URL.createObjectURL(file);
  out.innerHTML = `<img class="photo-preview" src="${preview}" alt="Фото блюда" /><div class="card">Анализирую...</div>`;

  if (!state.settings.aiEndpoint) {
    out.innerHTML = `
      <img class="photo-preview" src="${preview}" alt="Фото блюда" />
      <div class="card stack">
        <p class="mini-note">AI endpoint не задан. Добавь блюдо вручную по оценке порции.</p>
        <button class="button" data-action="custom-food">Добавить блюдо</button>
      </div>
    `;
    out.querySelector("[data-action='custom-food']").addEventListener("click", openCustomFood);
    return;
  }

  try {
    const form = new FormData();
    form.append("image", file);
    form.append("note", note);
    const response = await fetch(state.settings.aiEndpoint, { method: "POST", body: form });
    const estimate = await response.json();
    out.innerHTML = aiEstimateView(preview, estimate);
    out.querySelector("[data-action='add-ai-estimate']")?.addEventListener("click", () => {
      (estimate.items || []).forEach(item => {
        const entry = {
          id: crypto.randomUUID(),
          name: item.name,
          grams: Number(item.grams || 0),
          kcal: Number(item.kcal || 0),
          protein: Number(item.protein_g || 0),
          fat: Number(item.fat_g || 0),
          carbs: Number(item.carbs_g || 0),
          time: currentTime(),
          source: "AI photo"
        };
        entry.per100 = per100FromEntry(entry);
        addEntryToDate(selectedDateKey, entry);
        saveEntryAsFood(entry, "AI-блюдо");
      });
      saveState();
      activeTab = "home";
      render();
    });
  } catch {
    out.innerHTML = `<img class="photo-preview" src="${preview}" alt="Фото блюда" /><div class="card">Не удалось получить AI-анализ. Проверь endpoint.</div>`;
  }
}

function saveEntryAsFood(entry, source = "Моя база") {
  const grams = Number(entry.grams || 0);
  if (!entry.name || grams <= 0) return;
  const per100 = entry.per100 || per100FromEntry(entry);
  saveFoodToLibrary({
    id: crypto.randomUUID(),
    name: entry.name,
    brand: "",
    country: "custom",
    kcal: per100.kcal,
    protein: per100.protein,
    fat: per100.fat,
    carbs: per100.carbs,
    source
  });
}

function aiEstimateView(preview, estimate) {
  if (estimate.error) {
    const details = estimate.details?.error?.message || estimate.message || estimate.error;
    return `
      <img class="photo-preview" src="${preview}" alt="Фото блюда" />
      <div class="card">
        <h3>AI-анализ не сработал</h3>
        <p class="mini-note">${escapeHtml(details)}</p>
      </div>
    `;
  }
  if (estimate.question) {
    return `<img class="photo-preview" src="${preview}" alt="Фото блюда" /><div class="card">${escapeHtml(estimate.question)}</div>`;
  }
  const items = estimate.items || [];
  return `
    <img class="photo-preview" src="${preview}" alt="Фото блюда" />
    <div class="stack">
      ${items.map(item => `<div class="entry-row"><div><h3>${escapeHtml(item.name)}</h3><p>${fmt(item.grams)} г · Б ${fmt(item.protein_g)} · Ж ${fmt(item.fat_g)} · У ${fmt(item.carbs_g)}</p></div><span class="kcal-chip">${fmt(item.kcal)} ккал</span></div>`).join("")}
      <button class="button" data-action="add-ai-estimate">Добавить оценку</button>
    </div>
  `;
}

function saveProfile(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const previous = state.profile || {};
  const profile = {
    ...previous,
    accountName: String(form.get("accountName") || "").trim(),
    language: form.get("language") || "ru",
    sex: form.get("sex"),
    age: Number(form.get("age")),
    height: Number(form.get("height")),
    weight: Number(form.get("weight")),
    targetWeight: Number(form.get("targetWeight")),
    planDays: Number(form.get("planDays")),
    waterTarget: Number(form.get("waterTarget") || 2500),
    activity: form.get("activity"),
    goal: form.get("goal"),
    manualTargets: {
      enabled: form.get("manualEnabled") === "on",
      kcal: Number(form.get("manualKcal") || 0),
      protein: Number(form.get("manualProtein") || 0),
      fat: Number(form.get("manualFat") || 0),
      carbs: Number(form.get("manualCarbs") || 0)
    }
  };
  profile.targets = calcTargets(profile);
  if (profile.manualTargets.enabled) {
    profile.targets = {
      kcal: profile.manualTargets.kcal,
      protein: profile.manualTargets.protein,
      fat: profile.manualTargets.fat,
      carbs: profile.manualTargets.carbs
    };
  }
  state.profile = profile;
  state.language = profile.language;
  state.account.name = profile.accountName || state.account.name;
  saveMeasurement(profile);
  saveState();
  showRegistrationLoading(profile.plan?.note);
}

function saveMeasurementsOnly(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const profile = {
    ...(state.profile || {
      accountName: state.account?.name || "Аккаунт EliteCalorie",
      language: state.language || "ru",
      sex: "male",
      age: 28,
      height: 178,
      targetWeight: Number(form.get("weight") || 72),
      planDays: 90,
      activity: "low",
      goal: "keep"
    })
  };

  measurementKeys().forEach((key) => {
    profile[key] = optionalNumber(form.get(key));
  });
  if (Number(form.get("weight")) > 0) profile.weight = Number(form.get("weight"));
  profile.targets = calcTargets(profile);
  state.profile = profile;
  saveMeasurement(profile);
  saveState();
  render();
  toast(ui("Замеры сохранены", "Measurements saved"));
}

function saveMeasurement(profile) {
  state.measurements ||= [];
  const record = {
    id: crypto.randomUUID(),
    date: todayKey(),
    timestamp: new Date().toISOString(),
    weight: Number(profile.weight || 0)
  };
  measurementKeys().forEach((key) => {
    record[key] = profile[key];
  });
  const existing = state.measurements.findIndex(item => item.date === record.date);
  if (existing >= 0) {
    state.measurements[existing] = { ...state.measurements[existing], ...record, id: state.measurements[existing].id };
  } else {
    state.measurements.push(record);
  }
  state.measurements = state.measurements.slice(-180);
}

function measurementKeys() {
  return [
    "neck",
    "shoulders",
    "chest",
    "waist",
    "hips",
    "leftBiceps",
    "rightBiceps",
    "leftForearm",
    "rightForearm",
    "leftThigh",
    "rightThigh",
    "leftCalf",
    "rightCalf"
  ];
}

function optionalNumber(value) {
  const text = String(value ?? "").trim();
  return text === "" ? "" : Number(text);
}

function showRegistrationLoading(note) {
  $app.innerHTML = `
    <section class="calculation-screen">
      <div class="elite-loader">
        <div class="calc-stage">
          <div class="calc-orbit"></div>
          <div class="calc-orbit second"></div>
          <div class="calc-scan"></div>
          <div class="brand-mark">E</div>
        </div>
        <div class="calc-pulse-lines"><i></i><i></i><i></i></div>
      </div>
      <p class="eyebrow">EliteCalorie Intelligence</p>
      <h2>${ui("Собираю персональный план", "Building your personal plan")}</h2>
      <div class="calc-steps">
        <span>${ui("Метаболизм", "Metabolism")}</span>
        <span>${ui("Цель", "Goal")}</span>
        <span>${ui("Активность", "Activity")}</span>
        <span>${ui("КБЖУ", "Macros")}</span>
      </div>
      <div class="calc-progress"><i></i></div>
      ${note ? `<p class="calc-note">${escapeHtml(note)}</p>` : `<p class="calc-note">${ui("План готовится под ваш темп, вес и активность.", "The plan is tuned to your pace, weight, and activity.")}</p>`}
    </section>
  `;
  setTimeout(() => {
    activeTab = "home";
    render();
    if (note) {
      openPlanNotice(note);
    } else {
      toast("Норма КБЖУ рассчитана");
    }
  }, 4300);
}

function openPlanNotice(note) {
  openModal(`
    <div class="section-title"><div><h2>${ui("Срок плана изменен", "Plan duration adjusted")}</h2><p>${ui("EliteCalorie поставил безопасный темп", "EliteCalorie selected a safer pace")}</p></div></div>
    <div class="stack">
      <div class="card notice-card">${escapeHtml(note)}</div>
      <button class="button" data-close>OK</button>
    </div>
  `);
}

function openSettings() {
  openModal(`
    <div class="section-title"><div><h2>Настройки AI</h2><p>безопасная интеграция с OpenAI</p></div></div>
    <form id="settings-form" class="stack">
      <div class="field">
        <label>AI endpoint</label>
        <input name="endpoint" value="${escapeAttr(state.settings.aiEndpoint || "")}" placeholder="https://your-backend.example.com/analyze" />
      </div>
      <div class="field">
        <label>Food API endpoint</label>
        <input name="foodEndpoint" value="${escapeAttr(state.settings.foodEndpoint || "")}" placeholder="https://your-worker.example.workers.dev/food" />
      </div>
      <div class="field">
        <label>Subscription endpoint</label>
        <input name="subscriptionEndpoint" value="${escapeAttr(state.settings.subscriptionEndpoint || "")}" placeholder="https://your-telegram-worker.workers.dev/subscription" />
      </div>
      <p class="mini-note">OpenAI API key нельзя хранить в GitHub Pages. Endpoint должен быть backend/worker. Food endpoint подключает товарную базу, Subscription endpoint отправляет счета Telegram Stars.</p>
      <button class="button">Сохранить</button>
    </form>
  `);
  document.querySelector("#settings-form").addEventListener("submit", event => {
    event.preventDefault();
    const endpoint = new FormData(event.target).get("endpoint").trim();
    const foodEndpoint = new FormData(event.target).get("foodEndpoint").trim();
    const subscriptionEndpoint = new FormData(event.target).get("subscriptionEndpoint").trim();
    state.settings.aiEndpoint = endpoint;
    state.settings.foodEndpoint = foodEndpoint;
    state.settings.subscriptionEndpoint = subscriptionEndpoint;
    localStorage.setItem("elite_ai_endpoint", endpoint);
    localStorage.setItem("elite_food_endpoint", foodEndpoint);
    localStorage.setItem("elite_subscription_endpoint", subscriptionEndpoint);
    saveState();
    closeModal();
    toast("Настройки сохранены");
  });
}

function openModal(html, onClose) {
  const div = document.createElement("div");
  div.className = "modal-backdrop";
  div.innerHTML = `<div class="modal">${html}</div>`;
  div.__onClose = onClose;
  document.body.appendChild(div);
  div.addEventListener("click", event => {
    if (event.target === div || event.target.matches("[data-close]")) closeModal();
  });
}

function closeModal() {
  const modal = document.querySelector(".modal-backdrop");
  modal?.__onClose?.();
  modal?.remove();
}

function toast(message) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function numberField(name, label, value = "", placeholder = "") {
  return `<div class="field"><label>${label}</label><input name="${name}" type="number" min="0" step="0.1" value="${value ?? ""}" placeholder="${placeholder}" required /></div>`;
}

function optionalNumberField(name, label, value = "", placeholder = "") {
  return `<div class="field"><label>${label}</label><input name="${name}" type="number" min="0" step="0.1" value="${value ?? ""}" placeholder="${placeholder}" /></div>`;
}

function timeField(name, label, value = currentTime()) {
  return `<div class="field"><label>${label}</label><input name="${name}" type="time" value="${escapeAttr(value || currentTime())}" required /></div>`;
}

function selectField(name, label, options, value) {
  return `<div class="field"><label>${label}</label><select name="${name}" required>${options.map(([id, text]) => `<option value="${id}" ${value === id ? "selected" : ""}>${text}</option>`).join("")}</select></div>`;
}

function goalLabel(goal) {
  const labels = lang() === "en"
    ? { lose: "weight loss", keep: "maintenance", gain: "muscle gain" }
    : { lose: "снижение веса", keep: "поддержание", gain: "набор массы" };
  return labels[goal] || (lang() === "en" ? "personal goal" : "персональная цель");
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

document.body.insertAdjacentHTML("afterbegin", document.querySelector("#icon-sprite").innerHTML);
setTimeout(render, 260);
setTimeout(syncSubscription, 1200);

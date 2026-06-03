import { FOOD_DB } from "./food-db.js";

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const CONFIG = {
  aiEndpoint: localStorage.getItem("elite_ai_endpoint") || "https://elitecalorie-ai.nikitosv2401.workers.dev/",
  foodEndpoint: localStorage.getItem("elite_food_endpoint") || "https://elitecalorie-ai.nikitosv2401.workers.dev/food"
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

function loadState() {
  const fallback = {
    profile: null,
    account: telegramAccount(),
    diary: {},
    customFoods: [],
    favoriteFoods: [],
    measurements: [],
    language: "ru",
    settings: { aiEndpoint: CONFIG.aiEndpoint, foodEndpoint: CONFIG.foodEndpoint }
  };
  try {
    const loaded = { ...fallback, ...JSON.parse(localStorage.getItem("elite_calorie_state") || "{}") };
    loaded.settings ||= {};
    loaded.settings.aiEndpoint ||= CONFIG.aiEndpoint;
    loaded.settings.foodEndpoint ||= CONFIG.foodEndpoint;
    loaded.customFoods ||= [];
    loaded.favoriteFoods ||= [];
    loaded.measurements ||= [];
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
  return state.profile?.targets || { kcal: 2200, protein: 130, fat: 70, carbs: 250 };
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
    plan.note = `${plan.note ? `${plan.note} ` : ""}Калории не опускаю ниже безопасного минимума ${kcalFloor} ккал.`;
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
      note: "Цель похожа на поддержание, поэтому держим стабильную норму."
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
    note = `Срок был слишком жестким, поставил безопасный минимум: ${minDays} дн.`;
  } else if (requestedDays > maxDays) {
    planDays = maxDays;
    note = `Срок был слишком растянутым, поставил рабочий максимум: ${maxDays} дн.`;
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
  return `
    <section class="hero">
      <div class="hero-head">
        <div>
          <p class="eyebrow">${selectedDateKey === todayKey() ? t("today") : dayTitle(current)}</p>
          <h2>${fmt(total.kcal)} из ${fmt(target.kcal)} ккал</h2>
          <p class="hero-copy">${progress.over > 0 ? `Переел дневную норму на ${fmt(progress.over)} ккал.` : (state.profile ? "Дневная цель обновляется после изменения анкеты." : "Заполни профиль, чтобы EliteCalorie рассчитал твою норму.")}</p>
        </div>
        <div class="ring ${progress.over > 0 ? "over" : ""}" style="--value:${progress.visual}">
          <div class="ring-inner"><strong>${progress.percent}%</strong><span>${progress.over > 0 ? t("overPlan") : t("plan")}</span>${progress.over > 0 ? `<em>+${fmt(progress.over)} ккал</em>` : ""}</div>
        </div>
      </div>
      <div class="macro-grid">
        ${macro("Белки", total.protein, target.protein, "г")}
        ${macro("Жиры", total.fat, target.fat, "г")}
        ${macro("Углеводы", total.carbs, target.carbs, "г")}
      </div>
    </section>
    <section class="section">
      <div class="section-title">
        <div><h2>${t("diary")}</h2><p>${dayTitle(current)} · ${totalEntries ? `${totalEntries} записей` : "пока пусто"}</p></div>
        <button class="pill" data-action="clear-day">${t("clear")}</button>
      </div>
      <div class="day-strip">
        ${weekDays().map(dayButton).join("")}
      </div>
      <div class="meal-head">
        <div>
          <span>Формат дневника</span>
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

function dayButton(date) {
  const key = dateToKey(date);
  const labels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
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
  const labels = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  return `${labels[date.getDay()]}, ${date.getDate()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function macro(label, current, target, unit) {
  const info = progressInfo(current, target);
  const hint = info.over > 0 ? `переел на ${fmt(info.over)} ${unit}` : `${info.percent}% нормы`;
  return `<div class="macro ${info.over > 0 ? "over" : ""}"><span>${label}</span><strong>${fmt(current)} / ${fmt(target)} ${unit}</strong><em>${hint}</em></div>`;
}

function entryRow(item) {
  return `
    <article class="entry-row">
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.time || "--:--")} · ${fmt(item.grams)} г · Б ${fmt(item.protein)} · Ж ${fmt(item.fat)} · У ${fmt(item.carbs)}</p>
      </div>
      <div class="entry-actions">
        <span class="kcal-chip">${fmt(item.kcal)} ккал</span>
        <button class="mini-action" data-action="edit-entry" data-id="${item.id}" title="Исправить граммы">г</button>
        <button class="mini-action" data-action="copy-entry-tomorrow" data-id="${item.id}" title="Скопировать на завтра">↗</button>
        <button class="mini-action danger" data-action="delete-entry" data-id="${item.id}" title="Удалить">×</button>
      </div>
    </article>
  `;
}

function searchView() {
  const library = state.customFoods || [];
  return `
    <section class="section">
      <div class="section-title">
        <div><h2>${t("food")}</h2><p>${t("foodCaption")}</p></div>
      </div>
      <div class="library-grid">
        <div class="library-rail">
          <div><span>${t("generalLibrary")}</span><strong>${FOOD_DB.length}+</strong></div>
          <p class="mini-note">Россия, Беларусь, базовые блюда, фастфуд и товары через Open Food Facts.</p>
        </div>
        <div class="library-rail">
          <div><span>${t("personalLibrary")}</span><strong>${library.length}</strong></div>
          <div class="library-list">
            ${library.length ? library.slice(0, 8).map(food => `<button class="library-chip" data-food='${escapeAttr(JSON.stringify(food))}'>${escapeHtml(food.name)}</button>`).join("") : `<span class="library-empty">Свои блюда появятся здесь</span>`}
          </div>
        </div>
      </div>
      <div class="searchbar">
        <div class="field"><input id="search" placeholder="${t("searchPlaceholder")}" autocomplete="off" /></div>
        <button class="icon-button" data-action="scan-barcode" title="Сканировать штрихкод">${icon("i-barcode")}</button>
        <button class="icon-button" data-action="custom-food" title="Добавить продукт">${icon("i-plus")}</button>
      </div>
      <div id="results" class="stack"></div>
    </section>
  `;
}

function photoView() {
  return `
    <section class="section">
      <div class="section-title">
        <div><h2>Фото</h2><p>тарелка, этикетка или таблица КБЖУ</p></div>
      </div>
      <div class="card photo-box">
        <div class="field">
          <label>Фото блюда или этикетки</label>
          <input id="photo-input" type="file" accept="image/*" />
        </div>
        <div class="field">
          <label>Уточнение</label>
          <textarea id="photo-note" placeholder="Например: съел 180 г; или курица 150 г, гречка половина тарелки"></textarea>
        </div>
        <p class="mini-note">Можно отправить тарелку, упаковку или этикетку. Если вес не очевиден, напиши граммовку в уточнении.</p>
        <button class="button" data-action="analyze-photo">Анализировать</button>
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
  const plan = state.profile?.plan;
  return `
    <section class="section">
      <div class="section-title">
        <div><h2>${ui("Аккаунт", "Account")}</h2><p>${ui("персональный план, цель и норма КБЖУ", "personal plan, goal, calories and macros")}</p></div>
      </div>
      <form id="profile-form" class="profile-panel stack">
        <div class="account-card">
          <span>${ui("Аккаунт", "Account")}</span>
          <strong>${escapeHtml(state.account?.name || "Аккаунт EliteCalorie")}</strong>
          <p>${state.account?.username ? `@${escapeHtml(state.account.username)}` : ui("Данные и дневник сохраняются на этом устройстве.", "Diary data is saved on this device.")}</p>
        </div>
        <div class="field"><label>${ui("Имя аккаунта", "Account name")}</label><input name="accountName" value="${escapeAttr(p.accountName || state.account?.name || "")}" placeholder="${ui("Ваше имя", "Your name")}" required /></div>
        <div class="form-grid">
          ${selectField("language", "Язык / Language", [["ru", "Русский"], ["en", "English"]], p.language || state.language || "ru")}
          ${selectField("sex", ui("Пол", "Sex"), [["male", ui("Мужской", "Male")], ["female", ui("Женский", "Female")]], p.sex)}
          ${numberField("age", ui("Возраст", "Age"), p.age, "28")}
          ${numberField("height", ui("Рост, см", "Height, cm"), p.height, "178")}
          ${numberField("weight", ui("Текущий вес, кг", "Current weight, kg"), p.weight, "72")}
          ${numberField("targetWeight", ui("Целевой вес, кг", "Target weight, kg"), p.targetWeight, "68")}
          ${numberField("planDays", ui("Срок, дней", "Plan days"), p.planDays, "90")}
          ${selectField("activity", ui("Активность", "Activity"), activityOptions(), p.activity)}
          ${selectField("goal", ui("Цель", "Goal"), goalOptions(), p.goal)}
        </div>
        <div class="profile-block-title">
          <strong>${ui("Антропометрия", "Body measurements")}</strong>
          <span>${ui("сохраняется по датам для прогресса", "saved by date for progress tracking")}</span>
        </div>
        <div class="form-grid">
          ${optionalNumberField("chest", ui("Грудь, см", "Chest, cm"), p.chest, "98")}
          ${optionalNumberField("waist", ui("Талия, см", "Waist, cm"), p.waist, "78")}
          ${optionalNumberField("hips", ui("Бедра, см", "Hips, cm"), p.hips, "96")}
          ${optionalNumberField("neck", ui("Шея, см", "Neck, cm"), p.neck, "39")}
          ${optionalNumberField("biceps", ui("Бицепс, см", "Biceps, cm"), p.biceps, "34")}
          ${optionalNumberField("thigh", ui("Бедро, см", "Thigh, cm"), p.thigh, "56")}
        </div>
        <button class="button">${t("saveProfile")}</button>
      </form>
      ${measurementGuide()}
      ${measurementProgressView()}
      ${state.profile ? `
        <div class="card section plan-card">
          <span>${ui("Персональный план", "Personal plan")}</span>
          <h3>${targets().kcal} ккал · Б ${targets().protein} · Ж ${targets().fat} · У ${targets().carbs}</h3>
          <p>${planSummary(plan)}</p>
          ${plan?.note ? `<em>${escapeHtml(plan.note)}</em>` : ""}
        </div>
      ` : ""}
    </section>
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

function measurementGuide() {
  return `
    <div class="card measurement-guide">
      <div>
        <span class="eyebrow">Как измерять</span>
        <p>Лента параллельно полу, без натяжения. Талия по самой узкой точке, бедра по самой широкой, грудь по линии сосков.</p>
      </div>
      <svg viewBox="0 0 180 160" role="img" aria-label="Схема измерений тела">
        <path class="body-line" d="M90 23c13 0 22 9 22 22s-9 22-22 22-22-9-22-22 9-22 22-22Z"/>
        <path class="body-line" d="M61 73c12-8 46-8 58 0 8 15 9 39 5 64H56c-4-25-3-49 5-64Z"/>
        <path class="measure-line" d="M51 83h78"/>
        <path class="measure-line" d="M57 108h66"/>
        <path class="measure-line" d="M52 132h76"/>
        <text x="134" y="87">грудь</text>
        <text x="127" y="112">талия</text>
        <text x="132" y="136">бедра</text>
      </svg>
    </div>
  `;
}

function measurementProgressView() {
  const records = (state.measurements || [])
    .slice()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (!records.length) {
    return `<div class="card progress-card"><strong>Прогресс</strong><p>После сохранения аккаунта здесь появятся вес и замеры по дням.</p></div>`;
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
        <div><span>Прогресс недели</span><strong>${weightDelta >= 0 ? "+" : ""}${weightDelta.toFixed(1)} кг</strong></div>
        <em>${autoCorrectionText(weightDelta, range.length)}</em>
      </div>
      <div class="weight-bars">
        ${range.map(record => weightBar(record, min, max)).join("")}
      </div>
      <p>${waistDelta ? `Талия: ${waistDelta}. ` : ""}Последний вес: ${Number(last.weight || 0).toFixed(1)} кг · записей: ${records.length}</p>
    </div>
  `;
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
  if (Math.abs(delta) < 0.05) return "без изменений";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} см`;
}

function autoCorrectionText(weightDelta, count) {
  const profile = state.profile;
  if (!profile || count < 2) return "нужно больше замеров";
  if (profile.goal === "lose") {
    if (weightDelta > 0.3) return "вес растет, проверь среднюю калорийность";
    if (weightDelta < -1.2) return "темп высокий, не режь калории сильнее";
    return "темп выглядит рабочим";
  }
  if (profile.goal === "gain") {
    if (weightDelta < -0.2) return "масса не растет, добавь калории";
    if (weightDelta > 1.0) return "темп быстрый, следи за талией";
    return "набор идет ровно";
  }
  return Math.abs(weightDelta) > 0.7 ? "вес гуляет, проверь среднюю неделю" : "поддержание стабильное";
}

function planSummary(plan) {
  if (!plan) return "План появится после регистрации.";
  const goal = goalLabel(plan.goal);
  return `${goal}: цель ${fmt(plan.targetWeight)} кг за ${plan.planDays} дн., финиш ${plan.finishDate}.`;
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

  document.querySelector("[data-action='clear-day']")?.addEventListener("click", () => {
    state.diary[selectedDateKey] = [];
    saveState();
    render();
    toast("Дневник очищен");
  });
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
  document.querySelector("[data-action='analyze-photo']")?.addEventListener("click", analyzePhoto);
  document.querySelectorAll(".library-chip[data-food]").forEach(btn => btn.addEventListener("click", () => openAddFood(JSON.parse(btn.dataset.food))));
  if (activeTab === "search") runSearch();
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
    toast("Запись не найдена");
    return;
  }
  openModal(`
    <div class="section-title"><div><h2>Исправить запись</h2><p>${escapeHtml(entry.name)}</p></div></div>
    <form id="edit-entry-form" class="stack">
      ${numberField("grams", "Граммы", entry.grams || 100, "100")}
      ${timeField("time", "Время приема", entry.time || currentTime())}
      <button class="button">Сохранить</button>
      <button type="button" class="button secondary" data-close>Отмена</button>
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
    toast("Запись обновлена");
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
  const local = [...state.customFoods, ...FOOD_DB]
    .filter(food => !q || `${food.name} ${food.brand} ${food.country}`.toLowerCase().includes(q))
    .slice(0, 35);

  results.innerHTML = local.map(foodRow).join("") || `<div class="card empty">Начни вводить название продукта.</div>`;
  results.querySelectorAll("[data-food]").forEach(btn => btn.addEventListener("click", () => openAddFood(JSON.parse(btn.dataset.food))));

  if (q.length >= 3) {
    remoteCache = await searchExternalFood(q);
    const merged = [...local, ...remoteCache].slice(0, 45);
    results.innerHTML = merged.map(foodRow).join("") || `<div class="card empty">Не нашел. Добавь продукт вручную.</div>`;
    results.querySelectorAll("[data-food]").forEach(btn => btn.addEventListener("click", () => openAddFood(JSON.parse(btn.dataset.food))));
  }
}

function foodRow(food) {
  const brand = food.brand ? ` · ${escapeHtml(food.brand)}` : "";
  return `
    <button class="food-row" data-food='${escapeAttr(JSON.stringify(food))}'>
      <div>
        <h3>${escapeHtml(food.name)}</h3>
        <p>${fmt(food.kcal)} ккал / 100 г${brand} · ${escapeHtml(food.source || "база")}</p>
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
    <div class="section-title"><div><h2>Сканер штрихкода</h2><p>наведи камеру на упаковку продукта</p></div></div>
    <div class="barcode-box stack">
      <video id="barcode-video" autoplay muted playsinline></video>
      <p id="barcode-status" class="mini-note">Запрашиваю доступ к камере...</p>
      <form id="barcode-manual" class="stack">
        <div class="field"><label>Или введи штрихкод вручную</label><input name="barcode" inputmode="numeric" autocomplete="off" placeholder="460..." /></div>
        <button class="button secondary">Найти по коду</button>
      </form>
      <button type="button" class="button secondary" data-close>Закрыть</button>
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
    status.textContent = "Камера для штрихкодов недоступна в этом браузере. Введи код вручную.";
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
    video.srcObject = stream;
    await video.play();
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    status.textContent = "Сканирую... держи код в рамке.";
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
        status.textContent = "Не могу распознать кадр. Попробуй ярче осветить упаковку.";
      }
      requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  } catch {
    status.textContent = "Не получил доступ к камере. Можно ввести код вручную.";
  }
}

async function handleBarcode(code) {
  activeTab = "search";
  render();
  const input = document.querySelector("#search");
  const results = document.querySelector("#results");
  if (input) input.value = code;
  if (results) results.innerHTML = `<div class="card">Ищу товар по штрихкоду ${escapeHtml(code)}...</div>`;
  const products = await searchExternalFood(code);
  if (products.length) {
    if (results) results.innerHTML = products.map(foodRow).join("");
    document.querySelectorAll("#results [data-food]").forEach(btn => btn.addEventListener("click", () => openAddFood(JSON.parse(btn.dataset.food))));
    openAddFood(products[0]);
    return;
  }
  if (results) results.innerHTML = `<div class="card empty">Штрихкод не найден. Добавь продукт вручную, он сохранится в личной библиотеке.</div>`;
  toast("Товар не найден в общей базе");
}

function openAddFood(food) {
  const defaultGrams = defaultGramsFor(food);
  openModal(`
    <div class="section-title"><div><h2>${escapeHtml(food.name)}</h2><p>${escapeHtml(food.brand || food.source || "")}</p></div></div>
    <form id="add-food-form" class="stack">
      ${numberField("grams", "Сколько граммов", defaultGrams, String(defaultGrams))}
      ${timeField("time", "Время приема", currentTime())}
      <button class="button">Добавить в дневник</button>
      <button type="button" class="button secondary" data-close>Отмена</button>
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
    <div class="section-title"><div><h2>Свой продукт</h2><p>данные на 100 г</p></div></div>
    <form id="custom-food-form" class="stack">
      <div class="field"><label>Название</label><input name="name" required placeholder="Например: домашний сырник" /></div>
      <div class="field"><label>Бренд</label><input name="brand" placeholder="необязательно" /></div>
      <div class="form-grid">
        ${numberField("kcal", "Ккал", "", "230")}
        ${numberField("protein", "Белки", "", "14")}
        ${numberField("fat", "Жиры", "", "10")}
        ${numberField("carbs", "Углеводы", "", "21")}
        ${numberField("grams", "Съедено, г", 100, "100")}
        ${timeField("time", "Время приема", currentTime())}
      </div>
      <button class="button">Сохранить и добавить</button>
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
    toast("Блюдо сохранено в библиотеку");
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
  const profile = {
    accountName: String(form.get("accountName") || "").trim(),
    language: form.get("language") || "ru",
    sex: form.get("sex"),
    age: Number(form.get("age")),
    height: Number(form.get("height")),
    weight: Number(form.get("weight")),
    targetWeight: Number(form.get("targetWeight")),
    planDays: Number(form.get("planDays")),
    activity: form.get("activity"),
    goal: form.get("goal"),
    chest: optionalNumber(form.get("chest")),
    waist: optionalNumber(form.get("waist")),
    hips: optionalNumber(form.get("hips")),
    neck: optionalNumber(form.get("neck")),
    biceps: optionalNumber(form.get("biceps")),
    thigh: optionalNumber(form.get("thigh"))
  };
  profile.targets = calcTargets(profile);
  state.profile = profile;
  state.language = profile.language;
  state.account.name = profile.accountName || state.account.name;
  saveMeasurement(profile);
  saveState();
  showRegistrationLoading(profile.plan?.note);
}

function saveMeasurement(profile) {
  state.measurements ||= [];
  const record = {
    id: crypto.randomUUID(),
    date: todayKey(),
    timestamp: new Date().toISOString(),
    weight: Number(profile.weight || 0),
    chest: profile.chest,
    waist: profile.waist,
    hips: profile.hips,
    neck: profile.neck,
    biceps: profile.biceps,
    thigh: profile.thigh
  };
  const existing = state.measurements.findIndex(item => item.date === record.date);
  if (existing >= 0) {
    state.measurements[existing] = { ...state.measurements[existing], ...record, id: state.measurements[existing].id };
  } else {
    state.measurements.push(record);
  }
  state.measurements = state.measurements.slice(-180);
}

function optionalNumber(value) {
  const text = String(value ?? "").trim();
  return text === "" ? "" : Number(text);
}

function showRegistrationLoading(note) {
  $app.innerHTML = `
    <section class="calculation-screen">
      <div class="calc-stage">
        <div class="calc-orbit"></div>
        <div class="calc-scan"></div>
        <div class="brand-mark">E</div>
      </div>
      <p class="eyebrow">EliteCalorie Intelligence</p>
      <h2>Собираю персональный план</h2>
      <div class="calc-steps">
        <span>Метаболизм</span>
        <span>Цель</span>
        <span>КБЖУ</span>
      </div>
      ${note ? `<p class="calc-note">${escapeHtml(note)}</p>` : `<p class="calc-note">План готовится под ваш темп, вес и активность.</p>`}
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
  }, 3600);
}

function openPlanNotice(note) {
  openModal(`
    <div class="section-title"><div><h2>Срок плана изменен</h2><p>EliteCalorie поставил безопасный темп</p></div></div>
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
      <p class="mini-note">OpenAI API key нельзя хранить в GitHub Pages. Endpoint должен быть маленьким backend/worker, который держит ключ на сервере. Food endpoint подключает внешнюю товарную базу без CORS.</p>
      <button class="button">Сохранить</button>
    </form>
  `);
  document.querySelector("#settings-form").addEventListener("submit", event => {
    event.preventDefault();
    const endpoint = new FormData(event.target).get("endpoint").trim();
    const foodEndpoint = new FormData(event.target).get("foodEndpoint").trim();
    state.settings.aiEndpoint = endpoint;
    state.settings.foodEndpoint = foodEndpoint;
    localStorage.setItem("elite_ai_endpoint", endpoint);
    localStorage.setItem("elite_food_endpoint", foodEndpoint);
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

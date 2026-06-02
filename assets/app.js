import { FOOD_DB } from "./food-db.js";

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const CONFIG = {
  aiEndpoint: localStorage.getItem("elite_ai_endpoint") || "https://elitecalorie-ai.nikitosv2401.workers.dev/",
  foodEndpoint: localStorage.getItem("elite_food_endpoint") || "https://elitecalorie-ai.nikitosv2401.workers.dev/food"
};

const MEALS = [
  ["breakfast", "Завтрак"],
  ["lunch", "Обед"],
  ["dinner", "Ужин"],
  ["other", "Другое"]
];

const $app = document.querySelector("#app");
const dateToKey = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const todayKey = () => dateToKey(new Date());
const state = loadState();
let selectedDateKey = state.selectedDateKey || todayKey();
let selectedMeal = state.selectedMeal || "breakfast";
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
    settings: { aiEndpoint: CONFIG.aiEndpoint, foodEndpoint: CONFIG.foodEndpoint }
  };
  try {
    const loaded = { ...fallback, ...JSON.parse(localStorage.getItem("elite_calorie_state") || "{}") };
    loaded.settings ||= {};
    loaded.settings.aiEndpoint ||= CONFIG.aiEndpoint;
    loaded.settings.foodEndpoint ||= CONFIG.foodEndpoint;
    loaded.customFoods ||= [];
    loaded.favoriteFoods ||= [];
    migrateDiary(loaded);
    return loaded;
  } catch {
    return fallback;
  }
}

function saveState() {
  state.selectedDateKey = selectedDateKey;
  state.selectedMeal = selectedMeal;
  localStorage.setItem("elite_calorie_state", JSON.stringify(state));
}

function migrateDiary(store) {
  Object.keys(store.diary || {}).forEach((key) => {
    if (Array.isArray(store.diary[key])) {
      store.diary[key] = {
        breakfast: [],
        lunch: [],
        dinner: [],
        other: store.diary[key]
      };
    }
    MEALS.forEach(([meal]) => {
      store.diary[key][meal] ||= [];
    });
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

function byDate() {
  const key = selectedDateKey;
  state.diary[key] ||= emptyDay();
  return state.diary[key];
}

function emptyDay() {
  return { breakfast: [], lunch: [], dinner: [], other: [] };
}

function mealEntries(meal = selectedMeal) {
  const day = byDate();
  day[meal] ||= [];
  return day[meal];
}

function allDayEntries(key = selectedDateKey) {
  const day = state.diary[key] || emptyDay();
  return MEALS.flatMap(([meal]) => day[meal] || []);
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
  const activity = { low: 1.2, light: 1.375, moderate: 1.55, high: 1.725 }[profile.activity] || 1.2;
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
  const total = totals();
  const target = targets();
  const progress = Math.min(100, Math.round((total.kcal / target.kcal) * 100));
  $app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">E</div>
        <div>
          <h1>EliteCalorie</h1>
          <p>${state.profile ? goalLabel(state.profile.goal) : "персональный КБЖУ-трекер"}</p>
        </div>
      </div>
      <span class="pill account-pill">${escapeHtml(state.account?.name || "Аккаунт")}</span>
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
  const entries = mealEntries();
  const totalEntries = allDayEntries().length;
  const current = selectedDate();
  const mealLabel = MEALS.find(([meal]) => meal === selectedMeal)?.[1] || "Другое";
  return `
    <section class="hero">
      <div class="hero-head">
        <div>
          <p class="eyebrow">${selectedDateKey === todayKey() ? "Сегодня" : dayTitle(current)}</p>
          <h2>${fmt(total.kcal)} из ${fmt(target.kcal)} ккал</h2>
          <p class="hero-copy">${state.profile ? "Дневная цель обновляется после изменения анкеты." : "Заполни профиль, чтобы EliteCalorie рассчитал твою норму."}</p>
        </div>
        <div class="ring" style="--value:${progress}">
          <div class="ring-inner"><strong>${progress}%</strong><span>плана</span></div>
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
        <div><h2>Дневник</h2><p>${dayTitle(current)} · ${totalEntries ? `${totalEntries} записей` : "пока пусто"}</p></div>
        <button class="pill" data-action="clear-day">Очистить</button>
      </div>
      <div class="day-strip">
        ${weekDays().map(dayButton).join("")}
      </div>
      <div class="meal-strip">
        ${MEALS.map(mealButton).join("")}
      </div>
      <div class="meal-head">
        <div>
          <span>Сейчас открыт</span>
          <strong>${mealLabel}</strong>
        </div>
        <button class="pill" data-action="copy-meal-tomorrow">На завтра</button>
      </div>
      <div class="stack">
        ${entries.length ? entries.map((entry, index) => entryRow(entry, index, selectedMeal)).join("") : `<div class="card empty">В этом приеме пищи пока пусто.</div>`}
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

function mealButton([meal, label]) {
  const count = (byDate()[meal] || []).length;
  return `
    <button class="meal-chip ${meal === selectedMeal ? "active" : ""}" data-meal-tab="${meal}">
      <span>${label}</span>
      ${count ? `<em>${count}</em>` : ""}
    </button>
  `;
}

function dayTitle(date) {
  const labels = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  return `${labels[date.getDay()]}, ${date.getDate()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function macro(label, current, target, unit) {
  return `<div class="macro"><span>${label}</span><strong>${fmt(current)} / ${fmt(target)} ${unit}</strong></div>`;
}

function entryRow(item, index, meal) {
  return `
    <article class="entry-row">
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${fmt(item.grams)} г · Б ${fmt(item.protein)} · Ж ${fmt(item.fat)} · У ${fmt(item.carbs)}</p>
      </div>
      <div class="entry-actions">
        <span class="kcal-chip">${fmt(item.kcal)} ккал</span>
        <button class="mini-action" data-action="copy-entry-tomorrow" data-meal="${meal}" data-index="${index}" title="Скопировать на завтра">↗</button>
        <button class="mini-action danger" data-action="delete-entry" data-meal="${meal}" data-index="${index}" title="Удалить">×</button>
      </div>
    </article>
  `;
}

function searchView() {
  const library = state.customFoods || [];
  return `
    <section class="section">
      <div class="section-title">
        <div><h2>Еда</h2><p>база продуктов и личная библиотека</p></div>
      </div>
      ${library.length ? `
        <div class="library-rail">
          <div><span>Моя библиотека</span><strong>${library.length}</strong></div>
          <div class="library-list">
            ${library.slice(0, 8).map(food => `<button class="library-chip" data-food='${escapeAttr(JSON.stringify(food))}'>${escapeHtml(food.name)}</button>`).join("")}
          </div>
        </div>
      ` : ""}
      <div class="searchbar">
        <div class="field"><input id="search" placeholder="Например: творог савушкин" autocomplete="off" /></div>
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
        <div><h2>Аккаунт</h2><p>персональный план, цель и норма КБЖУ</p></div>
      </div>
      <form id="profile-form" class="profile-panel stack">
        <div class="account-card">
          <span>Аккаунт</span>
          <strong>${escapeHtml(state.account?.name || "Аккаунт EliteCalorie")}</strong>
          <p>${state.account?.username ? `@${escapeHtml(state.account.username)}` : "Данные и дневник сохраняются на этом устройстве."}</p>
        </div>
        <div class="field"><label>Имя аккаунта</label><input name="accountName" value="${escapeAttr(p.accountName || state.account?.name || "")}" placeholder="Ваше имя" required /></div>
        <div class="form-grid">
          ${selectField("sex", "Пол", [["male", "Мужской"], ["female", "Женский"]], p.sex)}
          ${numberField("age", "Возраст", p.age, "28")}
          ${numberField("height", "Рост, см", p.height, "178")}
          ${numberField("weight", "Текущий вес, кг", p.weight, "72")}
          ${numberField("targetWeight", "Целевой вес, кг", p.targetWeight, "68")}
          ${numberField("planDays", "Срок, дней", p.planDays, "90")}
          ${selectField("activity", "Активность", [["low", "Мало движения"], ["light", "1-3 тренировки"], ["moderate", "3-5 тренировок"], ["high", "Высокая"]], p.activity)}
          ${selectField("goal", "Цель", [["lose", "Снизить вес"], ["keep", "Поддерживать"], ["gain", "Набрать"]], p.goal)}
        </div>
        <button class="button">Сохранить и рассчитать</button>
      </form>
      ${state.profile ? `
        <div class="card section plan-card">
          <span>Персональный план</span>
          <h3>${targets().kcal} ккал · Б ${targets().protein} · Ж ${targets().fat} · У ${targets().carbs}</h3>
          <p>${planSummary(plan)}</p>
          ${plan?.note ? `<em>${escapeHtml(plan.note)}</em>` : ""}
        </div>
      ` : ""}
    </section>
  `;
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
    state.diary[selectedDateKey] = emptyDay();
    saveState();
    render();
    toast("Дневник очищен");
  });
  document.querySelectorAll("[data-day]").forEach(btn => btn.addEventListener("click", () => {
    selectedDateKey = btn.dataset.day;
    saveState();
    render();
  }));
  document.querySelectorAll("[data-meal-tab]").forEach(btn => btn.addEventListener("click", () => {
    selectedMeal = btn.dataset.mealTab;
    saveState();
    render();
  }));

  document.querySelectorAll("[data-action='delete-entry']").forEach(btn => btn.addEventListener("click", () => {
    const meal = btn.dataset.meal || selectedMeal;
    byDate()[meal].splice(Number(btn.dataset.index), 1);
    saveState();
    render();
  }));
  document.querySelectorAll("[data-action='copy-entry-tomorrow']").forEach(btn => btn.addEventListener("click", () => {
    const meal = btn.dataset.meal || selectedMeal;
    const item = byDate()[meal][Number(btn.dataset.index)];
    if (item) {
      addEntryToDate(nextDateKey(selectedDateKey), meal, { ...item, id: crypto.randomUUID(), copiedFrom: selectedDateKey });
      toast("Скопировано на завтра");
    }
  }));
  document.querySelector("[data-action='copy-meal-tomorrow']")?.addEventListener("click", () => {
    const entries = mealEntries();
    if (!entries.length) {
      toast("Нечего копировать");
      return;
    }
    const tomorrow = nextDateKey(selectedDateKey);
    entries.forEach((item) => addEntryToDate(tomorrow, selectedMeal, { ...item, id: crypto.randomUUID(), copiedFrom: selectedDateKey }));
    toast("Прием пищи скопирован на завтра");
  });

  document.querySelector("#profile-form")?.addEventListener("submit", saveProfile);
  document.querySelector("#search")?.addEventListener("input", debounce(runSearch, 220));
  document.querySelector("[data-action='custom-food']")?.addEventListener("click", openCustomFood);
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

function addEntryToDate(dateKey, meal, entry) {
  state.diary[dateKey] ||= emptyDay();
  state.diary[dateKey][meal] ||= [];
  state.diary[dateKey][meal].unshift(entry);
  saveState();
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

function openAddFood(food) {
  openModal(`
    <div class="section-title"><div><h2>${escapeHtml(food.name)}</h2><p>${escapeHtml(food.brand || food.source || "")}</p></div></div>
    <form id="add-food-form" class="stack">
      ${numberField("grams", "Сколько граммов", 100, "100")}
      ${selectField("meal", "Прием пищи", MEALS, selectedMeal)}
      <button class="button">Добавить в дневник</button>
      <button type="button" class="button secondary" data-close>Отмена</button>
    </form>
  `);
  document.querySelector("#add-food-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const grams = Number(form.get("grams"));
    selectedMeal = form.get("meal");
    addFood(food, grams);
    closeModal();
  });
}

function addFood(food, grams) {
  const factor = grams / 100;
  addEntryToDate(selectedDateKey, selectedMeal, {
    id: crypto.randomUUID(),
    name: food.name,
    grams,
    kcal: food.kcal * factor,
    protein: food.protein * factor,
    fat: food.fat * factor,
    carbs: food.carbs * factor,
    source: food.source
  });
  activeTab = "home";
  render();
  toast("Добавлено в дневник");
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
        ${selectField("meal", "Прием пищи", MEALS, selectedMeal)}
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
    selectedMeal = form.get("meal");
    const grams = Number(form.get("grams") || 100);
    saveFoodToLibrary(food);
    addFood(food, grams);
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
    source: food.source || "Моя база"
  };
}

function foodKey(food) {
  return `${food.name}|${food.brand}`.trim().toLowerCase().replace(/ё/g, "е");
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
          source: "AI photo"
        };
        addEntryToDate(selectedDateKey, selectedMeal, entry);
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
  const factor = 100 / grams;
  saveFoodToLibrary({
    id: crypto.randomUUID(),
    name: entry.name,
    brand: "",
    country: "custom",
    kcal: Number(entry.kcal || 0) * factor,
    protein: Number(entry.protein || 0) * factor,
    fat: Number(entry.fat || 0) * factor,
    carbs: Number(entry.carbs || 0) * factor,
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
    sex: form.get("sex"),
    age: Number(form.get("age")),
    height: Number(form.get("height")),
    weight: Number(form.get("weight")),
    targetWeight: Number(form.get("targetWeight")),
    planDays: Number(form.get("planDays")),
    activity: form.get("activity"),
    goal: form.get("goal")
  };
  profile.targets = calcTargets(profile);
  state.profile = profile;
  state.account.name = profile.accountName || state.account.name;
  saveState();
  showRegistrationLoading(profile.plan?.note);
}

function showRegistrationLoading(note) {
  $app.innerHTML = `
    <section class="calculation-screen">
      <div class="calc-orbit">
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
    toast(note || "Норма КБЖУ рассчитана");
  }, 1700);
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

function openModal(html) {
  const div = document.createElement("div");
  div.className = "modal-backdrop";
  div.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(div);
  div.addEventListener("click", event => {
    if (event.target === div || event.target.matches("[data-close]")) closeModal();
  });
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
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

function selectField(name, label, options, value) {
  return `<div class="field"><label>${label}</label><select name="${name}" required>${options.map(([id, text]) => `<option value="${id}" ${value === id ? "selected" : ""}>${text}</option>`).join("")}</select></div>`;
}

function goalLabel(goal) {
  return { lose: "снижение веса", keep: "поддержание", gain: "набор массы" }[goal] || "персональная цель";
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

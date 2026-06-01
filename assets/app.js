import { FOOD_DB } from "./food-db.js";

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const CONFIG = {
  aiEndpoint: localStorage.getItem("elite_ai_endpoint") || "",
  foodEndpoint: localStorage.getItem("elite_food_endpoint") || ""
};

const $app = document.querySelector("#app");
const todayKey = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const state = loadState();
let activeTab = state.profile ? "home" : "profile";
let remoteCache = [];

function loadState() {
  const fallback = {
    profile: null,
    diary: {},
    customFoods: [],
    settings: { aiEndpoint: CONFIG.aiEndpoint, foodEndpoint: CONFIG.foodEndpoint }
  };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem("elite_calorie_state") || "{}") };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem("elite_calorie_state", JSON.stringify(state));
}

function icon(id) {
  return `<svg aria-hidden="true"><use href="#${id}"></use></svg>`;
}

function fmt(value) {
  return Math.round(Number(value || 0));
}

function byDate() {
  const key = todayKey();
  state.diary[key] ||= [];
  return state.diary[key];
}

function totals() {
  return byDate().reduce((acc, item) => {
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
  const goal = { lose: 0.85, keep: 1, gain: 1.12 }[profile.goal] || 1;
  const kcal = Math.round(bmr * activity * goal);
  const protein = Math.round(profile.weight * (profile.goal === "lose" ? 1.8 : 1.6));
  const fat = Math.round(profile.weight * (profile.goal === "gain" ? 0.9 : 0.8));
  const carbs = Math.max(60, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs };
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
      <button class="pill" data-action="settings">AI</button>
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
  const entries = byDate();
  return `
    <section class="hero">
      <div class="hero-head">
        <div>
          <p class="eyebrow">Сегодня</p>
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
        <div><h2>Дневник</h2><p>${entries.length ? `${entries.length} записей` : "пока пусто"}</p></div>
        <button class="pill" data-action="clear-day">Очистить</button>
      </div>
      <div class="stack">
        ${entries.length ? entries.map(entryRow).join("") : `<div class="card empty">Добавь продукт, фото или свое блюдо.</div>`}
      </div>
    </section>
  `;
}

function macro(label, current, target, unit) {
  return `<div class="macro"><span>${label}</span><strong>${fmt(current)} / ${fmt(target)} ${unit}</strong></div>`;
}

function entryRow(item, index) {
  return `
    <article class="entry-row">
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${fmt(item.grams)} г · Б ${fmt(item.protein)} · Ж ${fmt(item.fat)} · У ${fmt(item.carbs)}</p>
      </div>
      <button class="kcal-chip" data-action="delete-entry" data-index="${index}">${fmt(item.kcal)} ккал</button>
    </article>
  `;
}

function searchView() {
  return `
    <section class="section">
      <div class="section-title">
        <div><h2>Еда</h2><p>локальная база, свои продукты и внешний Food API</p></div>
      </div>
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
        <div><h2>Фото тарелки</h2><p>оценка еды, порции и КБЖУ</p></div>
      </div>
      <div class="card photo-box">
        <div class="field">
          <label>Фото блюда</label>
          <input id="photo-input" type="file" accept="image/*" />
        </div>
        <div class="field">
          <label>Уточнение</label>
          <textarea id="photo-note" placeholder="Например: курица 150 г, гречка примерно половина тарелки"></textarea>
        </div>
        <p class="mini-note">Для настоящего AI-анализа укажи защищенный AI endpoint в настройках. На GitHub Pages нельзя хранить OpenAI API key прямо в браузере.</p>
        <button class="button" data-action="analyze-photo">Анализировать</button>
      </div>
      <div id="photo-result" class="stack section"></div>
    </section>
  `;
}

function profileView() {
  const p = state.profile || {
    sex: "male",
    age: 28,
    height: 178,
    weight: 72,
    activity: "low",
    goal: "lose"
  };
  return `
    <section class="section">
      <div class="section-title">
        <div><h2>Профиль</h2><p>EliteCalorie рассчитает норму КБЖУ</p></div>
      </div>
      <form id="profile-form" class="profile-panel stack">
        <div class="form-grid">
          ${selectField("sex", "Пол", [["male", "Мужской"], ["female", "Женский"]], p.sex)}
          ${numberField("age", "Возраст", p.age, "28")}
          ${numberField("height", "Рост, см", p.height, "178")}
          ${numberField("weight", "Вес, кг", p.weight, "72")}
          ${selectField("activity", "Активность", [["low", "Мало движения"], ["light", "1-3 тренировки"], ["moderate", "3-5 тренировок"], ["high", "Высокая"]], p.activity)}
          ${selectField("goal", "Цель", [["lose", "Снизить вес"], ["keep", "Поддерживать"], ["gain", "Набрать"]], p.goal)}
        </div>
        <button class="button">Сохранить и рассчитать</button>
      </form>
      ${state.profile ? `<div class="card section"><h3>Твоя норма</h3><p class="mini-note">${targets().kcal} ккал · Б ${targets().protein} · Ж ${targets().fat} · У ${targets().carbs}</p></div>` : ""}
    </section>
  `;
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

  document.querySelector("[data-action='settings']")?.addEventListener("click", openSettings);
  document.querySelector("[data-action='clear-day']")?.addEventListener("click", () => {
    state.diary[todayKey()] = [];
    saveState();
    render();
    toast("Дневник очищен");
  });

  document.querySelectorAll("[data-action='delete-entry']").forEach(btn => btn.addEventListener("click", () => {
    byDate().splice(Number(btn.dataset.index), 1);
    saveState();
    render();
  }));

  document.querySelector("#profile-form")?.addEventListener("submit", saveProfile);
  document.querySelector("#search")?.addEventListener("input", debounce(runSearch, 220));
  document.querySelector("[data-action='custom-food']")?.addEventListener("click", openCustomFood);
  document.querySelector("[data-action='analyze-photo']")?.addEventListener("click", analyzePhoto);
  if (activeTab === "search") runSearch();
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
      <button class="button">Добавить в дневник</button>
      <button type="button" class="button secondary" data-close>Отмена</button>
    </form>
  `);
  document.querySelector("#add-food-form").addEventListener("submit", event => {
    event.preventDefault();
    const grams = Number(new FormData(event.target).get("grams"));
    addFood(food, grams);
    closeModal();
  });
}

function addFood(food, grams) {
  const factor = grams / 100;
  byDate().unshift({
    id: crypto.randomUUID(),
    name: food.name,
    grams,
    kcal: food.kcal * factor,
    protein: food.protein * factor,
    fat: food.fat * factor,
    carbs: food.carbs * factor,
    source: food.source
  });
  saveState();
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
      </div>
      <button class="button">Сохранить</button>
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
    state.customFoods.unshift(food);
    saveState();
    closeModal();
    render();
    toast("Продукт сохранен");
  });
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
      (estimate.items || []).forEach(item => byDate().unshift({
        id: crypto.randomUUID(),
        name: item.name,
        grams: Number(item.grams || 0),
        kcal: Number(item.kcal || 0),
        protein: Number(item.protein_g || 0),
        fat: Number(item.fat_g || 0),
        carbs: Number(item.carbs_g || 0),
        source: "AI photo"
      }));
      saveState();
      activeTab = "home";
      render();
    });
  } catch {
    out.innerHTML = `<img class="photo-preview" src="${preview}" alt="Фото блюда" /><div class="card">Не удалось получить AI-анализ. Проверь endpoint.</div>`;
  }
}

function aiEstimateView(preview, estimate) {
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
    sex: form.get("sex"),
    age: Number(form.get("age")),
    height: Number(form.get("height")),
    weight: Number(form.get("weight")),
    activity: form.get("activity"),
    goal: form.get("goal")
  };
  profile.targets = calcTargets(profile);
  state.profile = profile;
  saveState();
  activeTab = "home";
  render();
  toast("Норма КБЖУ рассчитана");
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

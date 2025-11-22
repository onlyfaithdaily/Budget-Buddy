/* app.js — Fixed stable version for your index.html (old look & feel)
   - Restores month navigation
   - Removes budget field (uses Actual only)
   - Optional date (uses today if left blank)
   - Multiple savings accounts with 12m/60m projections
   - Savings goals
   - Carry-over reserved (min 2%), auto-applied debit option
   - PDF export (loads jsPDF if needed)
   - All add/remove actions should work with the HTML you provided
*/

const STORAGE_KEY = "budgetbuddy_fixed_v1";

/* -------------------------
   Utility helpers
------------------------- */
function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random()*1e6).toString(36)}`;
}
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function clampCarryPct(v) {
  const n = Number(v) || 2;
  return Math.max(2, n);
}
function currencySymbol() {
  const cur = (document.getElementById("currencySelect")?.value || "ZAR");
  if (cur === "USD") return "$";
  if (cur === "EUR") return "€";
  return "R";
}
function fmt(n) {
  if (n === undefined || n === null) n = 0;
  return currencySymbol() + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* -------------------------
   State load/save
------------------------- */
function defaultState() {
  const now = new Date();
  return {
    currentMonthIndex: 0,
    months: [{
      id: uid("m"),
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      startingBalance: 0,
      reservedCarry: 0,
      incomes: [],
      expenses: [],
      monthlyDebits: [] // { id, title, amount, optionalDayStr }
    }],
    savingsAccounts: [], // {id,name,balance,monthlySetAside,annualInterestPercent}
    savingsGoals: [],    // {id,title,target,savedSoFar}
    carryPercent: 2,
    autoApplyDebits: true,
    monthlySetAsideGlobal: 0, // fallback / global
    monthlyInterestRateGlobal: 0 // if not using per-account
  };
}
let state = (function load(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const obj = JSON.parse(raw);
    // basic migrations if keys missing
    if (typeof obj.carryPercent === "undefined") obj.carryPercent = 2;
    if (typeof obj.autoApplyDebits === "undefined") obj.autoApplyDebits = true;
    if (!Array.isArray(obj.savingsAccounts)) obj.savingsAccounts = [];
    if (!Array.isArray(obj.savingsGoals)) obj.savingsGoals = [];
    if (!Array.isArray(obj.months) || obj.months.length === 0) obj.months = defaultState().months;
    if (typeof obj.currentMonthIndex === "undefined") obj.currentMonthIndex = 0;
    return obj;
  } catch (e) {
    console.error("Failed to load state, resetting:", e);
    localStorage.removeItem(STORAGE_KEY);
    return defaultState();
  }
})();
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* -------------------------
   Month helpers
------------------------- */
function getCurrentMonth() {
  return state.months[state.currentMonthIndex];
}
function monthLabel(mObj) {
  return new Date(mObj.year, mObj.month-1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}
function ensureMonthExists(index) {
  if (index < 0) index = 0;
  if (index >= state.months.length) index = state.months.length - 1;
  state.currentMonthIndex = index;
  saveState();
}

/* Create next month: carry logic + optional auto-debits */
function createNextMonth() {
  const cur = getCurrentMonth();
  // compute totals of current month
  const totalIncome = cur.incomes.reduce((s,i) => s + Number(i.amount || 0), 0);
  const totalExpenses = cur.expenses.reduce((s,e) => s + Number(e.amount || 0), 0) + cur.monthlyDebits.reduce((s,d) => s + Number(d.amount || 0), 0);
  const totalSetAsides = state.savingsAccounts.reduce((s,a) => s + Number(a.monthlySetAside || 0), 0);
  const prevLeftover = (Number(cur.startingBalance || 0) + totalIncome) - totalExpenses - totalSetAsides;

  const carryPct = clampCarryPct(state.carryPercent);
  const reserved = prevLeftover > 0 ? +((prevLeftover * carryPct/100).toFixed(2)) : 0;

  // compute next month date
  let ny = cur.year, nm = cur.month + 1;
  if (nm > 12) { nm = 1; ny += 1; }

  const next = {
    id: uid("m"),
    year: ny,
    month: nm,
    startingBalance: Number(prevLeftover || 0), // carry full leftover into starting balance
    reservedCarry: reserved,
    incomes: [],
    expenses: [],
    monthlyDebits: JSON.parse(JSON.stringify(cur.monthlyDebits || []))
  };

  // auto-apply debits as expenses if option enabled
  if (state.autoApplyDebits) {
    next.monthlyDebits.forEach(d => {
      // create an expense entry so it appears in actual spend
      next.expenses.push({
        id: uid("e"),
        category: d.title + (d.optionalDayStr ? ` (${d.optionalDayStr})` : " (Debit)"),
        amount: Number(d.amount || 0),
        date: todayISO()
      });
    });
  }

  state.months.push(next);
  state.currentMonthIndex = state.months.length - 1;
  saveState();
}

/* Move prev/next */
function movePrevMonth() {
  if (state.currentMonthIndex > 0) {
    state.currentMonthIndex -= 1;
    saveState();
  } else {
    alert("No previous month.");
  }
}
function moveNextMonth() {
  if (state.currentMonthIndex < state.months.length - 1) {
    state.currentMonthIndex += 1;
    saveState();
  } else {
    // create new month automatically (keeps behavior simple)
    createNextMonth();
  }
}

/* -------------------------
   CRUD: incomes, expenses, debits, savings, goals
------------------------- */
function addIncome({ source, amount, date }) {
  const m = getCurrentMonth();
  m.incomes.push({ id: uid("inc"), source: source || "Income", amount: Number(amount || 0), date: date || todayISO() });
  saveState();
}
function removeIncome(id) {
  const m = getCurrentMonth();
  m.incomes = m.incomes.filter(x => x.id !== id);
  saveState();
}

function addExpense({ category, amount, date }) {
  const m = getCurrentMonth();
  m.expenses.push({ id: uid("exp"), category: category || "Expense", amount: Number(amount || 0), date: date || todayISO() });
  saveState();
}
function removeExpense(id) {
  const m = getCurrentMonth();
  m.expenses = m.expenses.filter(x => x.id !== id);
  saveState();
}

function addMonthlyDebit(title, amount, dayStr) {
  const m = getCurrentMonth();
  m.monthlyDebits.push({ id: uid("deb"), title, amount: Number(amount || 0), optionalDayStr: dayStr || "" });
  saveState();
}
function removeMonthlyDebit(id) {
  const m = getCurrentMonth();
  m.monthlyDebits = m.monthlyDebits.filter(x => x.id !== id);
  saveState();
}

/* Savings accounts */
function addSavingsAccount({ name, balance, monthlySetAside, annualInterest }) {
  state.savingsAccounts.push({
    id: uid("sav"),
    name: name || "Account",
    balance: Number(balance || 0),
    monthlySetAside: Number(monthlySetAside || 0),
    annualInterestPercent: Number(annualInterest || 0)
  });
  saveState();
}
function removeSavingsAccount(id) {
  state.savingsAccounts = state.savingsAccounts.filter(x => x.id !== id);
  saveState();
}
function updateSavingsAccount(id, patch) {
  const acc = state.savingsAccounts.find(x => x.id === id);
  if (!acc) return;
  Object.assign(acc, patch);
  saveState();
}

/* Goals */
function addGoal({ title, target, savedSoFar }) {
  state.savingsGoals.push({ id: uid("g"), title: title || "Goal", target: Number(target || 0), savedSoFar: Number(savedSoFar || 0) });
  saveState();
}
function removeGoal(id) {
  state.savingsGoals = state.savingsGoals.filter(x => x.id !== id);
  saveState();
}
function updateGoalSaved(id, amount) {
  const g = state.savingsGoals.find(x => x.id === id);
  if (!g) return;
  g.savedSoFar = Number(amount || 0);
  saveState();
}

/* -------------------------
   Calculations & Projections
------------------------- */
function computeMonthTotals(monthObj) {
  const starting = Number(monthObj.startingBalance || 0);
  const income = monthObj.incomes.reduce((s,i) => s + Number(i.amount || 0), 0);
  const expenses = monthObj.expenses.reduce((s,e) => s + Number(e.amount || 0), 0);
  const debits = monthObj.monthlyDebits.reduce((s,d) => s + Number(d.amount || 0), 0);
  const totalActual = expenses + debits;
  const setAsides = state.savingsAccounts.reduce((s,a) => s + Number(a.monthlySetAside || 0), 0);
  const goalsPlanned = state.savingsGoals.reduce((s,g) => s + 0, 0); // no automatic goal contributions unless user implements
  const leftover = (starting + income) - totalActual - setAsides - goalsPlanned;
  return { starting, income, expenses, debits, totalActual, setAsides, goalsPlanned, leftover };
}

// monthly interest decimal
function monthlyRateFromAnnual(apr) {
  return (Number(apr || 0) / 100) / 12;
}
function futureValueMonthly(initial, monthly, months, apr) {
  const r = monthlyRateFromAnnual(apr);
  if (months <= 0) return Number(initial || 0);
  if (r === 0) return Number(initial || 0) + Number(monthly || 0) * months;
  const fvInitial = Number(initial || 0) * Math.pow(1 + r, months);
  const fvContrib = Number(monthly || 0) * ((Math.pow(1 + r, months) - 1) / r);
  return fvInitial + fvContrib;
}
function projectAllSavings(months) {
  return state.savingsAccounts.reduce((s,a) => s + futureValueMonthly(a.balance, a.monthlySetAside, months, a.annualInterestPercent), 0);
}

/* -------------------------
   PDF Export (simple)
------------------------- */
function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf) return resolve(window.jspdf);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => resolve(window.jspdf || window.jspdf);
    s.onerror = () => reject(new Error("Failed to load jsPDF"));
    document.head.appendChild(s);
  });
}

async function exportMonthPDF() {
  const m = getCurrentMonth();
  const totals = computeMonthTotals(m);
  try {
    await loadJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 40;
    doc.setFontSize(16);
    doc.text(`BudgetBuddy — ${monthLabel(m)}`, 40, y); y += 26;
    doc.setFontSize(12);
    doc.text(`Starting balance: ${fmt(totals.starting)}`, 40, y); y += 14;
    doc.text(`Total income: ${fmt(totals.income)}`, 40, y); y += 14;
    doc.text(`Total actual spend (incl. debits): ${fmt(totals.totalActual)}`, 40, y); y += 14;
    doc.text(`Total set-asides (monthly across accounts): ${fmt(totals.setAsides)}`, 40, y); y += 14;
    doc.text(`Carry reserved: ${fmt(m.reservedCarry)}`, 40, y); y += 14;
    doc.text(`Money left: ${fmt(totals.leftover)}`, 40, y); y += 20;

    doc.setFontSize(13); doc.text("Incomes", 40, y); y += 14; doc.setFontSize(11);
    m.incomes.forEach(i => {
      doc.text(`${i.date || ""}  •  ${i.source}  •  ${fmt(i.amount)}`, 44, y); y += 12;
      if (y > 740) { doc.addPage(); y = 40; }
    });

    y += 6; doc.setFontSize(13); doc.text("Expenses", 40, y); y += 14; doc.setFontSize(11);
    m.expenses.forEach(e => {
      doc.text(`${e.date || ""}  •  ${e.category}  •  ${fmt(e.amount)}`, 44, y); y += 12;
      if (y > 740) { doc.addPage(); y = 40; }
    });

    y += 6; doc.setFontSize(13); doc.text("Savings Accounts (summary)", 40, y); y += 14; doc.setFontSize(11);
    state.savingsAccounts.forEach(a => {
      const p12 = futureValueMonthly(a.balance, a.monthlySetAside, 12, a.annualInterestPercent);
      const p60 = futureValueMonthly(a.balance, a.monthlySetAside, 60, a.annualInterestPercent);
      doc.text(`${a.name} • Bal ${fmt(a.balance)} • Monthly ${fmt(a.monthlySetAside)} • 12m ${fmt(p12)} • 60m ${fmt(p60)}`, 44, y); y += 12;
      if (y > 740) { doc.addPage(); y = 40; }
    });

    doc.save(`BudgetBuddy_${m.year}-${String(m.month).padStart(2,"0")}.pdf`);
  } catch (err) {
    console.error(err);
    alert("PDF export failed (try again online or host jsPDF locally).");
  }
}

/* -------------------------
   UI rendering
------------------------- */
function renderMonthSelectorLabel() {
  const el = document.getElementById("monthLabel");
  if (!el) return;
  el.innerText = monthLabel(getCurrentMonth());
}

function renderIncomesTable() {
  const m = getCurrentMonth();
  const table = document.getElementById("incomeTable");
  if (!table) return;
  const s = currencySymbol();
  let html = `<tr><th>Date</th><th>Source</th><th>Amount</th><th>Action</th></tr>`;
  m.incomes.forEach(i => {
    html += `<tr>
      <td>${i.date || ""}</td>
      <td>${escapeHtml(i.source)}</td>
      <td>${s}${Number(i.amount).toFixed(2)}</td>
      <td><button onclick="onRemoveIncome('${i.id}')">Remove</button></td>
    </tr>`;
  });
  table.innerHTML = html;
}

function renderExpensesTable() {
  const m = getCurrentMonth();
  const table = document.getElementById("expenseTable");
  if (!table) return;
  const s = currencySymbol();
  let html = `<tr><th>Date</th><th>Category</th><th>Actual</th><th>Action</th></tr>`;
  m.expenses.forEach(e => {
    html += `<tr>
      <td>${e.date || ""}</td>
      <td>${escapeHtml(e.category)}</td>
      <td>${s}${Number(e.amount).toFixed(2)}</td>
      <td><button onclick="onRemoveExpense('${e.id}')">Remove</button></td>
    </tr>`;
  });
  table.innerHTML = html;
}

function renderDebitsTable() {
  const m = getCurrentMonth();
  const table = document.getElementById("debitsTable");
  if (!table) return;
  const s = currencySymbol();
  let html = `<tr><th>Day</th><th>Debit Title</th><th>Amount</th><th>Action</th></tr>`;
  m.monthlyDebits.forEach(d => {
    html += `<tr>
      <td>${escapeHtml(d.optionalDayStr || "")}</td>
      <td>${escapeHtml(d.title)}</td>
      <td>${s}${Number(d.amount).toFixed(2)}</td>
      <td><button onclick="onRemoveDebit('${d.id}')">Remove</button></td>
    </tr>`;
  });
  table.innerHTML = html;
}

function renderSavingsTable() {
  const table = document.getElementById("savingsTable");
  if (!table) return;
  const s = currencySymbol();
  let html = `<tr><th>Account</th><th>Balance</th><th>Monthly</th><th>Interest %</th><th>Action</th></tr>`;
  state.savingsAccounts.forEach(a => {
    html += `<tr>
      <td>${escapeHtml(a.name)}</td>
      <td>${s}${Number(a.balance).toFixed(2)}</td>
      <td>${s}${Number(a.monthlySetAside).toFixed(2)}</td>
      <td>${Number(a.annualInterestPercent).toFixed(2)}</td>
      <td>
        <button onclick="onEditSavingsAccount('${a.id}')">Edit</button>
        <button onclick="onRemoveSavingsAccount('${a.id}')">Remove</button>
      </td>
    </tr>`;
  });
  table.innerHTML = html;
}

function renderGoalsList() {
  const wrap = document.getElementById("goalsList");
  if (!wrap) return;
  const s = currencySymbol();
  let html = "";
  state.savingsGoals.forEach(g => {
    const remaining = Number(g.target) - Number(g.savedSoFar);
    html += `<div class="goal-item">
      <strong>${escapeHtml(g.title)}</strong><br>
      Target: ${s}${Number(g.target).toFixed(2)}<br>
      Saved: ${s}${Number(g.savedSoFar).toFixed(2)}<br>
      Remaining: ${s}${Number(remaining).toFixed(2)}<br>
      <button onclick="onRemoveGoal('${g.id}')">Remove</button>
      <button onclick="onEditGoalSaved('${g.id}')">Edit Saved</button>
    </div>`;
  });
  wrap.innerHTML = html || "<p>No goals yet.</p>";
}

function renderSummaryBlock() {
  const m = getCurrentMonth();
  const s = currencySymbol();
  const totals = computeMonthTotals(m);
  // totals: starting, income, expenses, debits, totalActual, setAsides, leftover
  document.getElementById("totalIncome").innerText = fmt(totals.income);
  document.getElementById("totalExpenses").innerText = fmt(totals.totalActual);
  document.getElementById("totalSetAsides").innerText = fmt(totals.setAsides);
  document.getElementById("reservedCarry").innerText = fmt(m.reservedCarry || 0);
  const moneyLeft = (Number(m.startingBalance || 0) + totals.income) - totals.totalActual - totals.setAsides - (m.reservedCarry || 0);
  document.getElementById("moneyLeft").innerText = fmt(moneyLeft);
  // update projection values in each savings account row? We show in PDF; also show summary projections for all accounts
  const p12 = projectAllSavings(12);
  const p60 = projectAllSavings(60);
  // show projections under insights for quick glance
  const insights = document.getElementById("insights");
  if (insights) {
    let html = `<p>Projected total across accounts: 12m ${fmt(p12)}, 60m ${fmt(p60)}</p>`;
    // simple advice rules
    if (moneyLeft < 0) html += `<p style="color:red">You're overspending by ${fmt(Math.abs(moneyLeft))}</p>`;
    else html += `<p style="color:green">Money left this month: ${fmt(moneyLeft)}</p>`;
    insights.innerHTML = html;
  }
}

/* RENDER ALL */
function renderAll() {
  renderMonthSelectorLabel();
  renderIncomesTable();
  renderExpensesTable();
  renderDebitsTable();
  renderSavingsTable();
  renderGoalsList();
  renderSummaryBlock();
}

/* -------------------------
   DOM helpers & handlers
------------------------- */
function $id(id) { return document.getElementById(id); }
function escapeHtml(unsafe) {
  if (unsafe === undefined || unsafe === null) return "";
  return String(unsafe).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* UI actions called from buttons in the markup */
window.onRemoveIncome = function(id) { if (!confirm("Remove income?")) return; removeIncome(id); renderAll(); };
window.onRemoveExpense = function(id) { if (!confirm("Remove expense?")) return; removeExpense(id); renderAll(); };
window.onRemoveDebit = function(id) { if (!confirm("Remove debit?")) return; removeMonthlyDebit(id); renderAll(); };
window.onEditSavingsAccount = function(id) {
  const acc = state.savingsAccounts.find(a=>a.id===id); if(!acc) return;
  const nb = prompt("Balance", acc.balance); if (nb === null) return;
  const nm = prompt("Monthly set-aside", acc.monthlySetAside); if (nm === null) return;
  const ni = prompt("Annual interest %", acc.annualInterestPercent); if (ni === null) return;
  updateSavingsAccount(id, { balance: Number(nb), monthlySetAside: Number(nm), annualInterestPercent: Number(ni) });
  renderAll();
};
window.onRemoveSavingsAccount = function(id) { if(!confirm("Remove account?")) return; removeSavingsAccount(id); renderAll(); };
window.onRemoveGoal = function(id) { if(!confirm("Remove goal?")) return; removeGoal(id); renderAll(); };
window.onEditGoalSaved = function(id) {
  const g = state.savingsGoals.find(x=>x.id===id); if(!g) return;
  const val = prompt("Enter new saved amount:", g.savedSoFar||0); if(val === null) return;
  updateGoalSaved(id, Number(val)); renderAll();
};

/* Button bindings (safe init) */
function initBindings() {
  // Month nav
  const prev = $id("prevMonthBtn"), next = $id("nextMonthBtn"), createNext = $id("createNextMonthBtn");
  prev?.addEventListener("click", ()=>{ movePrevMonth(); renderAll(); });
  next?.addEventListener("click", ()=>{ moveNextMonth(); renderAll(); });
  createNext?.addEventListener("click", ()=>{ createNextMonth(); renderAll(); });

  // Starting balance & carry %
  $id("currentBalance")?.addEventListener("change", (e) => {
    const m = getCurrentMonth();
    m.startingBalance = Number(e.target.value || 0);
    saveState(); renderAll();
  });
  $id("carryPercent")?.addEventListener("change", (e) => {
    state.carryPercent = clampCarryPct(e.target.value);
    saveState(); renderAll();
  });
  $id("autoApplyDebits")?.addEventListener("change", (e) => {
    state.autoApplyDebits = !!e.target.checked;
    saveState();
  });

  // Add income
  $id("addIncomeBtn")?.addEventListener("click", ()=> {
    const source = ($id("incomeSource")?.value || "").trim();
    const amount = Number($id("incomeAmount")?.value || 0);
    const date = ($id("incomeDate")?.value || "").trim() || todayISO();
    if (!source || !amount) return alert("Fill both income fields");
    addIncome({ source, amount, date });
    $id("incomeSource").value = ""; $id("incomeAmount").value = ""; $id("incomeDate").value = "";
    renderAll();
  });

  // Add expense (actual only)
  $id("addExpenseBtn")?.addEventListener("click", ()=> {
    const category = ($id("expenseCategory")?.value || "").trim();
    const amount = Number($id("expenseActual")?.value || 0);
    const date = ($id("expenseDate")?.value || "").trim() || todayISO();
    if (!category || !amount) return alert("Fill category and actual amount");
    addExpense({ category, amount, date });
    $id("expenseCategory").value = ""; $id("expenseActual").value = ""; $id("expenseDate").value = "";
    renderAll();
  });

  // Add monthly debit
  $id("addDebitBtn")?.addEventListener("click", ()=> {
    const title = ($id("debitTitle")?.value || "").trim();
    const amount = Number($id("debitAmount")?.value || 0);
    const dayStr = ($id("debitDate")?.value || "").trim();
    if (!title || !amount) return alert("Fill debit title and amount");
    addMonthlyDebit(title, amount, dayStr);
    $id("debitTitle").value=""; $id("debitAmount").value=""; $id("debitDate").value="";
    renderAll();
  });

  // Savings account add
  $id("addSavingsAccountBtn")?.addEventListener("click", ()=> {
    const name = ($id("saveAccountName")?.value || "").trim();
    const balance = Number($id("saveAccountBalance")?.value || 0);
    const monthly = Number($id("saveAccountMonthly")?.value || 0);
    const interest = Number($id("saveAccountInterest")?.value || 0);
    if (!name) return alert("Enter account name");
    addSavingsAccount({ name, balance, monthlySetAside: monthly, annualInterest: interest });
    $id("saveAccountName").value=""; $id("saveAccountBalance").value=""; $id("saveAccountMonthly").value=""; $id("saveAccountInterest").value="";
    renderAll();
  });

  // Goal add
  $id("addGoalBtn")?.addEventListener("click", ()=> {
    const title = ($id("goalTitle")?.value || "").trim();
    const target = Number($id("goalTarget")?.value || 0);
    const saved = Number($id("goalSaved")?.value || 0);
    if (!title || !target) return alert("Fill goal title and target");
    addGoal({ title, target, savedSoFar: saved });
    $id("goalTitle").value=""; $id("goalTarget").value=""; $id("goalSaved").value=""; $id("goalDeadline").value="";
    renderAll();
  });

  // set-aside global (for backward comp)
  $id("saveSetAsideBtn")?.addEventListener("click", ()=> {
    const v = Number($id("monthlySetAsideInput")?.value || 0);
    state.monthlySetAsideGlobal = v;
    const r = Number($id("monthlyInterestInput")?.value || 0);
    state.monthlyInterestRateGlobal = r;
    saveState(); renderAll();
  });

  // export pdf & csv
  $id("exportPdfBtn")?.addEventListener("click", ()=> {
    exportMonthPDF();
  });
  $id("exportCsvBtn")?.addEventListener("click", ()=> {
    exportMonthCSV();
  });

  // currency selector triggers rerender
  $id("currencySelect")?.addEventListener("change", ()=> renderAll());
}

/* Export CSV */
function exportMonthCSV() {
  const m = getCurrentMonth();
  let csv = "type,date,category_or_source,amount\n";
  m.incomes.forEach(i => csv += `income,${i.date || ""},"${i.source.replace(/"/g,'""')}",${i.amount}\n`);
  m.expenses.forEach(e => csv += `expense,${e.date || ""},"${e.category.replace(/"/g,'""')}",${e.amount}\n`);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `BudgetBuddy_${m.year}-${String(m.month).padStart(2,"0")}.csv`; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------
   Small helpers & init
------------------------- */
function computeMonthTotalsForCurrent() {
  return computeMonthTotals(getCurrentMonth());
}
function computeMonthTotals(m) {
  const starting = Number(m.startingBalance || 0);
  const income = m.incomes.reduce((s,i)=> s + Number(i.amount||0), 0);
  const expenses = m.expenses.reduce((s,e)=> s + Number(e.amount||0), 0);
  const debits = m.monthlyDebits.reduce((s,d)=> s + Number(d.amount||0), 0);
  const totalActual = expenses + debits;
  const setAsides = state.savingsAccounts.reduce((s,a)=> s + Number(a.monthlySetAside||0), 0);
  const leftover = (starting + income) - totalActual - setAsides;
  return { starting, income, expenses, debits, totalActual, setAsides, leftover };
}

function projectAllSavings(months) {
  return state.savingsAccounts.reduce((s,a) => s + futureValueMonthly(a.balance, a.monthlySetAside, months, a.annualInterestPercent), 0);
}

/* Boot */
window.addEventListener("load", () => {
  // init UI values from state
  if ($id("carryPercent")) $id("carryPercent").value = state.carryPercent;
  if ($id("autoApplyDebits")) $id("autoApplyDebits").checked = !!state.autoApplyDebits;
  if ($id("currentBalance")) $id("currentBalance").value = getCurrentMonth().startingBalance || 0;
  // init bindings and render current state
  initBindings();
  renderAll();
});


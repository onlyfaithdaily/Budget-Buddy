/* ========================================================
   Budget Buddy (Stable Version)
   - Based on original working app.js
   - No password, no charts
   - Adds:
     1. Auto-apply fixed debits as real expenses each month
     2. Reserve previous month savings at month start (not spendable)
   ======================================================== */

const STORAGE_KEY = "budgetbuddy_stable_v1";

/* ---------------------------
      LOAD + SAVE STATE
--------------------------- */
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const now = new Date();
    return {
      currentMonthIndex: 0,
      months: [
        {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          incomes: [],
          expenses: [],
          monthlyDebits: [],
          reservedCarry: 0 // new
        }
      ],
      monthlySetAside: 0,
      monthlyInterestRate: 0,
      savingsGoals: []
    };
  }
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return loadState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ---------------------------
      MONTH HELPERS
--------------------------- */
function getCurrentMonth() {
  return state.months[state.currentMonthIndex];
}

/* Generate new empty month */
function createNewMonth(prev) {
  return {
    year: prev.year + (prev.month === 12 ? 1 : 0),
    month: prev.month === 12 ? 1 : prev.month + 1,
    incomes: [],
    expenses: [],
    monthlyDebits: JSON.parse(JSON.stringify(prev.monthlyDebits)),
    reservedCarry: 0
  };
}

/* When moving forward: handle carry + auto-debits */
function moveToNextMonth() {
  const current = getCurrentMonth();
  const totalIncome = current.incomes.reduce((s, x) => s + x.amount, 0);
  const totalExpenses = current.expenses.reduce((s, x) => s + x.amount, 0) +
                        current.monthlyDebits.reduce((s, x) => s + x.amount, 0);

  const carry = Math.max(0, totalIncome - totalExpenses);

  // Create new month if needed
  if (state.currentMonthIndex === state.months.length - 1) {
    const nextMonth = createNewMonth(current);

    // Reserve carry (cannot be spent)
    nextMonth.reservedCarry = carry;

    // Auto-apply monthly debits as editable expenses
    nextMonth.monthlyDebits.forEach(d => {
      nextMonth.expenses.push({
        id: Date.now() + Math.random(),
        category: d.title + " (Auto)",
        amount: d.amount
      });
    });

    state.months.push(nextMonth);
  }

  state.currentMonthIndex++;
  saveState();
}

function moveToPreviousMonth() {
  if (state.currentMonthIndex > 0) {
    state.currentMonthIndex--;
    saveState();
  }
}

/* ---------------------------
      INCOME / EXPENSES
--------------------------- */
function addIncome(source, amount) {
  if (!source || !amount) return;
  const m = getCurrentMonth();
  m.incomes.push({ id: Date.now() + Math.random(), source, amount: Number(amount) });
  saveState();
}

function removeIncome(id) {
  const m = getCurrentMonth();
  m.incomes = m.incomes.filter(i => i.id !== id);
  saveState();
}

function addExpense(category, amount) {
  if (!category || !amount) return;
  const m = getCurrentMonth();
  m.expenses.push({ id: Date.now() + Math.random(), category, amount: Number(amount) });
  saveState();
}

function removeExpense(id) {
  const m = getCurrentMonth();
  m.expenses = m.expenses.filter(e => e.id !== id);
  saveState();
}

/* ---------------------------
      FIXED MONTHLY DEBITS
--------------------------- */
function addMonthlyDebit(title, amount) {
  if (!title || !amount) return;
  const m = getCurrentMonth();
  m.monthlyDebits.push({ id: Date.now() + Math.random(), title, amount: Number(amount) });
  saveState();
}

function removeMonthlyDebit(id) {
  const m = getCurrentMonth();
  m.monthlyDebits = m.monthlyDebits.filter(d => d.id !== id);
  saveState();
}

/* ---------------------------
     SAVINGS + PROJECTION
--------------------------- */
function setMonthlySetAside(amount) {
  state.monthlySetAside = Number(amount) || 0;
  saveState();
}

function setMonthlyInterestRate(rate) {
  state.monthlyInterestRate = Number(rate) || 0;
  saveState();
}

/* Future value calculator */
function futureValue(months, monthlyRate, initial, monthly) {
  const r = monthlyRate;
  if (months <= 0) return initial;
  if (r === 0) return initial + monthly * months;

  const fvInitial = initial * Math.pow(1 + r, months);
  const fvContrib = monthly * ((Math.pow(1 + r, months) - 1) / r);
  return fvInitial + fvContrib;
}

/* ---------------------------
      SAVINGS GOALS
--------------------------- */
function addSavingsGoal(title, targetAmount) {
  if (!title || !targetAmount) return;
  state.savingsGoals.push({
    id: Date.now() + Math.random(),
    title,
    targetAmount: Number(targetAmount),
    savedSoFar: 0
  });
  saveState();
}

function removeSavingsGoal(id) {
  state.savingsGoals = state.savingsGoals.filter(g => g.id !== id);
  saveState();
}

function updateSavingsGoalSaved(id, amt) {
  const g = state.savingsGoals.find(x => x.id === id);
  if (!g) return;
  g.savedSoFar = Number(amt);
  saveState();
}

/* ---------------------------
       CURRENCY HELPER
--------------------------- */
function getCurrencySymbol() {
  const cur = document.getElementById("currencySelect")?.value || "ZAR";
  return cur === "USD"
    ? "$"
    : cur === "EUR"
    ? "€"
    : "R";
}

/* ---------------------------
       RENDER FUNCTIONS
--------------------------- */
function renderAll() {
  renderMonth();
  renderIncome();
  renderExpenses();
  renderMonthlyDebits();
  renderSummary();
  renderGoals();
}

/* Month label */
function renderMonth() {
  const m = getCurrentMonth();
  const label = new Date(m.year, m.month - 1, 1).toLocaleString("en", {
    month: "long",
    year: "numeric"
  });
  document.getElementById("monthLabel").innerText = label;
}

/* Income table */
function renderIncome() {
  const m = getCurrentMonth();
  const s = getCurrencySymbol();
  const table = document.getElementById("incomeTable");

  let html = `<tr><th>Source</th><th>Amount</th><th>Action</th></tr>`;
  m.incomes.forEach(i => {
    html += `<tr>
      <td>${i.source}</td>
      <td>${s}${i.amount.toFixed(2)}</td>
      <td><button onclick="removeIncome(${i.id})">Remove</button></td>
    </tr>`;
  });

  table.innerHTML = html;
}

/* Expense table */
function renderExpenses() {
  const m = getCurrentMonth();
  const s = getCurrencySymbol();
  const table = document.getElementById("expenseTable");

  let html = `<tr><th>Category</th><th>Amount</th><th>Action</th></tr>`;
  m.expenses.forEach(e => {
    html += `<tr>
      <td>${e.category}</td>
      <td>${s}${e.amount.toFixed(2)}</td>
      <td><button onclick="removeExpense(${e.id})">Remove</button></td>
    </tr>`;
  });

  table.innerHTML = html;
}

/* Monthly debits table */
function renderMonthlyDebits() {
  const m = getCurrentMonth();
  const s = getCurrencySymbol();
  const table = document.getElementById("debitsTable");

  let html = `<tr><th>Debit Title</th><th>Amount</th><th>Action</th></tr>`;
  m.monthlyDebits.forEach(d => {
    html += `<tr>
      <td>${d.title}</td>
      <td>${s}${d.amount.toFixed(2)}</td>
      <td><button onclick="removeMonthlyDebit(${d.id})">Remove</button></td>
    </tr>`;
  });

  table.innerHTML = html;
}

/* Summary */
function renderSummary() {
  const m = getCurrentMonth();
  const s = getCurrencySymbol();

  const income = m.incomes.reduce((t, x) => t + x.amount, 0);
  const debitSum = m.monthlyDebits.reduce((t, x) => t + x.amount, 0);
  const expenseSum = m.expenses.reduce((t, x) => t + x.amount, 0);

  const totalExpenses = debitSum + expenseSum;
  const savings = income - totalExpenses;

  document.getElementById("totalIncome").innerText = s + income.toFixed(2);
  document.getElementById("totalExpenses").innerText = s + totalExpenses.toFixed(2);
  document.getElementById("totalSavings").innerText = s + savings.toFixed(2);

  // Set-aside & interest
  document.getElementById("monthlySetAsideInput").value = state.monthlySetAside;
  document.getElementById("monthlyInterestInput").value = state.monthlyInterestRate;

  // Projection
  const monthlyRate = state.monthlyInterestRate / 100;
  const initial = Math.max(0, savings);
  const m12 = futureValue(12, monthlyRate, initial, state.monthlySetAside);
  const m60 = futureValue(60, monthlyRate, initial, state.monthlySetAside);

  document.getElementById("projection12").innerText = s + m12.toFixed(2);
  document.getElementById("projection60").innerText = s + m60.toFixed(2);
}

/* Goals */
function renderGoals() {
  const wrap = document.getElementById("goalsList");
  const s = getCurrencySymbol();

  let html = "";
  state.savingsGoals.forEach(g => {
    const remaining = g.targetAmount - g.savedSoFar;

    html += `<div class="goal-item">
      <strong>${g.title}</strong><br>
      Target: ${s}${g.targetAmount.toFixed(2)}<br>
      Saved: ${s}${g.savedSoFar.toFixed(2)}<br>
      Remaining: ${s}${remaining.toFixed(2)}<br>
      <button onclick="removeSavingsGoal(${g.id})">Remove</button>
      <button onclick="editGoalSaved(${g.id})">Edit Saved</button>
    </div>`;
  });

  wrap.innerHTML = html || "<p>No goals yet.</p>";
}

/* ---------------------------
       UI HANDLERS
--------------------------- */
function editGoalSaved(id) {
  const g = state.savingsGoals.find(x => x.id === id);
  if (!g) return;
  const val = prompt("Enter new saved amount:", g.savedSoFar);
  if (val === null) return;
  if (isNaN(val)) return alert("Invalid number");
  updateSavingsGoalSaved(id, Number(val));
  renderAll();
}

document.getElementById("addIncomeBtn").onclick = () => {
  const s = incomeSource.value.trim();
  const a = Number(incomeAmount.value);
  if (!s || !a) return alert("Enter both fields");
  addIncome(s, a);
  incomeSource.value = "";
  incomeAmount.value = "";
  renderAll();
};

document.getElementById("addExpenseBtn").onclick = () => {
  const c = expenseCategory.value.trim();
  const a = Number(expenseAmount.value);
  if (!c || !a) return alert("Enter both fields");
  addExpense(c, a);
  expenseCategory.value = "";
  expenseAmount.value = "";
  renderAll();
};

document.getElementById("addDebitBtn").onclick = () => {
  const t = debitTitle.value.trim();
  const a = Number(debitAmount.value);
  if (!t || !a) return alert("Enter both fields");
  addMonthlyDebit(t, a);
  debitTitle.value = "";
  debitAmount.value = "";
  renderAll();
};

document.getElementById("saveSetAsideBtn").onclick = () => {
  setMonthlySetAside(Number(monthlySetAsideInput.value));
  setMonthlyInterestRate(Number(monthlyInterestInput.value));
  renderAll();
};

document.getElementById("addGoalBtn").onclick = () => {
  const t = goalTitle.value.trim();
  const a = Number(goalAmount.value);
  if (!t || !a) return alert("Enter both fields");
  addSavingsGoal(t, a);
  goalTitle.value = "";
  goalAmount.value = "";
  renderAll();
};

document.getElementById("prevMonthBtn").onclick = () => {
  moveToPreviousMonth();
  renderAll();
};

document.getElementById("nextMonthBtn").onclick = () => {
  moveToNextMonth();
  renderAll();
};

document.getElementById("currencySelect").onchange = renderAll;

/* ---------------------------
        INIT
--------------------------- */
window.onload = () => {
  renderAll();
};

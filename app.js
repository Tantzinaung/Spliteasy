/* SplitEasy v1.1 (Fixed)
   - Date & Time per expense (history)
   - Search + Sort
   - Multi-currency incl. MMK
   - Receipt photo (camera/file) stored as DataURL (localStorage)
   - Modal close bug FIXED (Close button / ESC / background click)
*/

const STORAGE_KEY = "spliteasy_v11";

const el = (id) => document.getElementById(id);

const state = {
  currency: "USD",
  members: [],
  expenses: []
  // expense: {id, title, amount, paidBy, splitType, participants[], shares{}, dateTimeISO, receiptDataUrl?}
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function fmtMoney(amount) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: state.currency }).format(amount);
  } catch {
    const sym = state.currency === "MMK" ? "Ks " : state.currency + " ";
    return `${sym}${Number(amount).toFixed(2)}`;
  }
}

function fmtDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function setMsg(text, kind = "ok") {
  const m = el("msg");
  if (!m) return;
  m.textContent = text || "";
  m.className = "msg " + (kind === "err" ? "err" : "ok");
  if (!text) m.className = "msg";
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const s = el("autosaveStatus");
  if (s) s.textContent = "Auto-saved";
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.members) && Array.isArray(data.expenses)) {
      state.currency = data.currency || "USD";
      state.members = data.members;
      state.expenses = data.expenses;
    }
  } catch {}
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

function toLocalDateTimeValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/* ----------------- Receipt / Modal ----------------- */

let receiptDataUrl = null;

function setReceiptPreview(dataUrl) {
  receiptDataUrl = dataUrl;
  const box = el("receiptPreview");
  const img = el("receiptImg");
  if (!box || !img) return;

  if (!dataUrl) {
    box.classList.add("hidden");
    img.src = "";
    return;
  }
  img.src = dataUrl;
  box.classList.remove("hidden");
}

function openModal(dataUrl) {
  const modal = el("modal");
  const img = el("modalImg");
  if (!modal || !img) return;

  img.src = dataUrl;
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  const modal = el("modal");
  const img = el("modalImg");
  if (!modal || !img) return;

  modal.classList.add("hidden");
  img.src = "";
  document.body.style.overflow = "";
}

/* ----------------- UI Render ----------------- */

function renderMembers() {
  const wrap = el("membersWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  state.members.forEach((name) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<span>${escapeHtml(name)}</span>`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "×";
    btn.title = "Remove";
    btn.onclick = () => removeMember(name);

    chip.appendChild(btn);
    wrap.appendChild(chip);
  });

  const payer = el("expPaidBy");
  if (payer) {
    payer.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Select";
    payer.appendChild(opt0);

    state.members.forEach((m) => {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      payer.appendChild(o);
    });
  }

  renderParticipants();
  renderCustomShares();
}

function renderParticipants() {
  const wrap = el("participantsWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  state.members.forEach((m) => {
    const pill = document.createElement("label");
    pill.className = "pill active";
    pill.innerHTML = `<input type="checkbox" checked data-name="${escapeAttr(m)}" /> <span>${escapeHtml(m)}</span>`;

    const checkbox = pill.querySelector("input");
    checkbox.addEventListener("change", () => {
      pill.classList.toggle("active", checkbox.checked);
      if (el("splitType")?.value === "custom") renderCustomShares();
    });

    wrap.appendChild(pill);
  });
}

function getSelectedParticipants() {
  const wrap = el("participantsWrap");
  if (!wrap) return [];
  const checks = Array.from(wrap.querySelectorAll("input[type=checkbox]"));
  return checks.filter((c) => c.checked).map((c) => c.getAttribute("data-name"));
}

function renderCustomShares() {
  const wrap = el("customShares");
  if (!wrap) return;
  wrap.innerHTML = "";

  const people = getSelectedParticipants();
  people.forEach((p) => {
    const box = document.createElement("div");
    box.innerHTML = `
      <label class="label">${escapeHtml(p)} pays</label>
      <input class="input" type="number" step="0.01" min="0" data-share="${escapeAttr(p)}" placeholder="0.00" />
    `;
    wrap.appendChild(box);
  });
}

/* ----------------- Actions ----------------- */

function addMember() {
  const input = el("memberName");
  const name = (input?.value || "").trim();
  if (!name) return setMsg("Please enter a name.", "err");
  if (state.members.includes(name)) return setMsg("Member already exists.", "err");
  if (state.members.length >= 30) return setMsg("Max 30 members for v1.", "err");

  state.members.push(name);
  if (input) input.value = "";
  setMsg("Member added ✅");
  renderAll();
  save();
}

function removeMember(name) {
  const used = state.expenses.some((e) => e.paidBy === name || e.participants.includes(name));
  if (used) return setMsg("Cannot remove: member is used in expenses. Delete those expenses first.", "err");

  state.members = state.members.filter((m) => m !== name);
  setMsg("Member removed.");
  renderAll();
  save();
}

function clearExpenseForm() {
  if (el("expTitle")) el("expTitle").value = "";
  if (el("expAmount")) el("expAmount").value = "";
  if (el("expPaidBy")) el("expPaidBy").value = "";
  if (el("splitType")) el("splitType").value = "equal";

  // default datetime = now
  if (el("expDateTime")) el("expDateTime").value = toLocalDateTimeValue(new Date());

  // participants select all
  const pWrap = el("participantsWrap");
  if (pWrap) {
    Array.from(pWrap.querySelectorAll("input[type=checkbox]")).forEach((c) => (c.checked = true));
    Array.from(pWrap.querySelectorAll(".pill")).forEach((p) => p.classList.add("active"));
  }

  // custom wrap hide
  el("customSharesWrap")?.classList.add("hidden");
  renderCustomShares();

  // receipt clear
  const file = el("expReceipt");
  if (file) file.value = "";
  setReceiptPreview(null);

  setMsg("");
}

function addExpense() {
  if (state.members.length < 2) return setMsg("Add at least 2 members first.", "err");

  const title = (el("expTitle")?.value || "").trim() || "Expense";
  const amount = Number(el("expAmount")?.value);
  const paidBy = el("expPaidBy")?.value || "";
  const splitType = el("splitType")?.value || "equal";
  const participants = getSelectedParticipants();

  const dtLocal = el("expDateTime")?.value || "";
  const dateTimeISO = dtLocal ? new Date(dtLocal).toISOString() : new Date().toISOString();

  if (!amount || amount <= 0) return setMsg("Enter a valid amount.", "err");
  if (!paidBy) return setMsg("Select who paid.", "err");
  if (participants.length < 1) return setMsg("Select at least 1 participant.", "err");

  let shares = {};

  if (splitType === "equal") {
    const each = amount / participants.length;
    participants.forEach((p) => (shares[p] = round2(each)));
  } else {
    const inputs = Array.from(el("customShares")?.querySelectorAll("input[data-share]") || []);
    let sum = 0;

    for (const inp of inputs) {
      const who = inp.getAttribute("data-share");
      const val = Number(inp.value);
      if (!isFinite(val) || val < 0) return setMsg("Custom shares must be valid numbers.", "err");
      shares[who] = round2(val);
      sum += val;
    }

    sum = round2(sum);
    const target = round2(amount);
    if (sum !== target) {
      return setMsg(`Custom shares must sum to total. Now: ${fmtMoney(sum)} / Total: ${fmtMoney(target)}`, "err");
    }
  }

  state.expenses.unshift({
    id: uid(),
    title,
    amount: round2(amount),
    paidBy,
    splitType,
    participants,
    shares,
    dateTimeISO,
    receiptDataUrl: receiptDataUrl || null
  });

  setMsg("Expense added ✅");
  clearExpenseForm();
  renderAll();
  save();
}

function deleteExpense(id) {
  state.expenses = state.expenses.filter((e) => e.id !== id);
  setMsg("Expense deleted.");
  renderAll();
  save();
}

function editExpense(id) {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return;

  if (el("expTitle")) el("expTitle").value = e.title;
  if (el("expAmount")) el("expAmount").value = e.amount;
  if (el("expPaidBy")) el("expPaidBy").value = e.paidBy;
  if (el("splitType")) el("splitType").value = e.splitType;

  const d = new Date(e.dateTimeISO || Date.now());
  if (el("expDateTime")) el("expDateTime").value = toLocalDateTimeValue(d);

  // participants
  const pWrap = el("participantsWrap");
  if (pWrap) {
    Array.from(pWrap.querySelectorAll("input[type=checkbox]")).forEach((c) => {
      const n = c.getAttribute("data-name");
      c.checked = e.participants.includes(n);
      c.closest(".pill")?.classList.toggle("active", c.checked);
    });
  }

  if (e.splitType === "custom") {
    el("customSharesWrap")?.classList.remove("hidden");
    renderCustomShares();
    Array.from(el("customShares")?.querySelectorAll("input[data-share]") || []).forEach((inp) => {
      const who = inp.getAttribute("data-share");
      inp.value = e.shares[who] ?? 0;
    });
  } else {
    el("customSharesWrap")?.classList.add("hidden");
  }

  // receipt
  setReceiptPreview(e.receiptDataUrl || null);

  // remove old expense, then user will re-add
  deleteExpense(id);
  setMsg('Editing loaded. Update fields then click "Add expense".', "ok");
}

/* ----------------- Calculations ----------------- */

function computeBalances() {
  const balances = {};
  state.members.forEach((m) => (balances[m] = 0));

  for (const e of state.expenses) {
    balances[e.paidBy] = (balances[e.paidBy] || 0) + e.amount;
    for (const p of Object.keys(e.shares)) {
      balances[p] = (balances[p] || 0) - e.shares[p];
    }
  }

  for (const k of Object.keys(balances)) balances[k] = round2(balances[k]);
  return balances;
}

function computeSettlements(balances) {
  const creditors = [];
  const debtors = [];

  for (const [name, bal] of Object.entries(balances)) {
    if (bal > 0) creditors.push({ name, bal });
    else if (bal < 0) debtors.push({ name, bal: -bal });
  }

  creditors.sort((a, b) => b.bal - a.bal);
  debtors.sort((a, b) => b.bal - a.bal);

  const transfers = [];
  let i = 0,
    j = 0;

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const pay = Math.min(d.bal, c.bal);

    if (pay > 0.009) {
      transfers.push({ from: d.name, to: c.name, amount: round2(pay) });
      d.bal = round2(d.bal - pay);
      c.bal = round2(c.bal - pay);
    }
    if (d.bal <= 0.009) i++;
    if (c.bal <= 0.009) j++;
  }

  return transfers;
}

function getFilteredSortedExpenses() {
  const q = (el("search")?.value || "").trim().toLowerCase();
  let items = state.expenses.slice();

  if (q) items = items.filter((e) => (e.title || "").toLowerCase().includes(q));

  const sortBy = el("sortBy")?.value || "newest";
  if (sortBy === "newest") items.sort((a, b) => (b.dateTimeISO || "").localeCompare(a.dateTimeISO || ""));
  if (sortBy === "oldest") items.sort((a, b) => (a.dateTimeISO || "").localeCompare(b.dateTimeISO || ""));
  if (sortBy === "amountDesc") items.sort((a, b) => (b.amount || 0) - (a.amount || 0));
  if (sortBy === "amountAsc") items.sort((a, b) => (a.amount || 0) - (b.amount || 0));

  return items;
}

/* ----------------- Render right side ----------------- */

function renderExpenses() {
  const list = el("expensesList");
  if (!list) return;
  list.innerHTML = "";

  const items = getFilteredSortedExpenses();
  if (items.length === 0) {
    list.innerHTML = `<div class="item"><div class="meta">No expenses yet.</div></div>`;
    return;
  }

  items.forEach((e) => {
    const item = document.createElement("div");
    item.className = "item";

    const participantsText = e.participants.join(", ");
    const badge = e.splitType === "custom" ? "Custom" : "Equal";
    const dt = fmtDateTime(e.dateTimeISO);
    const hasReceipt = !!e.receiptDataUrl;

    item.innerHTML = `
      <div class="title">${escapeHtml(e.title)} <span class="badge">${badge}</span></div>
      <div class="meta">
        Date: <b>${escapeHtml(dt)}</b><br/>
        Amount: <b>${fmtMoney(e.amount)}</b> • Paid by: <b>${escapeHtml(e.paidBy)}</b><br/>
        Participants: ${escapeHtml(participantsText)}
      </div>
      <div class="actions">
        <button class="btn btn-ghost" type="button" data-edit="${e.id}">Edit</button>
        <button class="btn btn-danger" type="button" data-del="${e.id}">Delete</button>
        ${hasReceipt ? `<button class="btn btn-ghost" type="button" data-view="${e.id}">View photo</button>` : ``}
      </div>
    `;

    item.querySelector("[data-edit]")?.addEventListener("click", () => editExpense(e.id));
    item.querySelector("[data-del]")?.addEventListener("click", () => deleteExpense(e.id));
    item.querySelector("[data-view]")?.addEventListener("click", () => openModal(e.receiptDataUrl));

    list.appendChild(item);
  });
}

function renderBalancesAndSettlements() {
  const balances = computeBalances();

  const balList = el("balances");
  if (balList) {
    balList.innerHTML = "";
    state.members.forEach((m) => {
      const b = balances[m] ?? 0;
      const sign = b > 0 ? "+" : "";
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="title">${escapeHtml(m)}</div>
        <div class="meta">Balance: <b>${sign}${fmtMoney(b)}</b></div>
      `;
      balList.appendChild(item);
    });
  }

  const transfers = computeSettlements(balances);
  const setList = el("settlements");
  if (setList) {
    setList.innerHTML = "";
    if (transfers.length === 0) {
      setList.innerHTML = `<div class="item"><div class="meta">All settled ✅</div></div>`;
      return;
    }

    transfers.forEach((t) => {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="title">${escapeHtml(t.from)} → ${escapeHtml(t.to)}</div>
        <div class="meta">Pay <b>${fmtMoney(t.amount)}</b></div>
      `;
      setList.appendChild(item);
    });
  }
}

/* ----------------- Share / Export / Import / Reset ----------------- */

function shareSummary() {
  const balances = computeBalances();
  const transfers = computeSettlements(balances);

  let text = `SplitEasy Summary (${state.currency})\n\nMembers:\n- ${state.members.join("\n- ") || "(none)"}\n\nExpenses:\n`;
  state.expenses
    .slice()
    .reverse()
    .forEach((e) => {
      text += `- ${e.title} | ${fmtDateTime(e.dateTimeISO)} | ${e.amount} paid by ${e.paidBy}\n`;
    });

  text += `\nBalances:\n`;
  state.members.forEach((m) => {
    const b = balances[m] ?? 0;
    text += `- ${m}: ${b}\n`;
  });

  text += `\nSettle up:\n`;
  if (transfers.length === 0) text += `- All settled\n`;
  else transfers.forEach((t) => (text += `- ${t.from} pays ${t.to}: ${t.amount}\n`));

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => setMsg("Summary copied to clipboard ✅"))
      .catch(() => alert(text));
  } else alert(text);
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "spliteasy-export.json";
  a.click();
  URL.revokeObjectURL(a.href);
  setMsg("Export downloaded ✅");
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.members) || !Array.isArray(data.expenses)) return setMsg("Invalid file.", "err");
      state.currency = data.currency || "USD";
      state.members = data.members;
      state.expenses = data.expenses;
      setMsg("Imported ✅");
      renderAll();
      save();
    } catch {
      setMsg("Invalid JSON.", "err");
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  if (!confirm("Reset all data? This cannot be undone.")) return;
  state.currency = "USD";
  state.members = [];
  state.expenses = [];
  save();
  renderAll();
  clearExpenseForm();
  setMsg("Reset done.");
}

/* ----------------- Wiring ----------------- */

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function renderAll() {
  if (el("currency")) el("currency").value = state.currency;

  renderMembers();
  renderExpenses();
  renderBalancesAndSettlements();

  const isCustom = el("splitType")?.value === "custom";
  el("customSharesWrap")?.classList.toggle("hidden", !isCustom);
}

function wire() {
  // members
  el("btnAddMember")?.addEventListener("click", addMember);
  el("memberName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addMember();
  });

  // expense
  el("btnAddExpense")?.addEventListener("click", addExpense);
  el("btnClearExpense")?.addEventListener("click", clearExpenseForm);

  el("splitType")?.addEventListener("change", () => {
    const isCustom = el("splitType")?.value === "custom";
    el("customSharesWrap")?.classList.toggle("hidden", !isCustom);
    if (isCustom) renderCustomShares();
  });

  el("btnSelectAll")?.addEventListener("click", () => {
    const pWrap = el("participantsWrap");
    if (!pWrap) return;
    Array.from(pWrap.querySelectorAll("input[type=checkbox]")).forEach((c) => (c.checked = true));
    Array.from(pWrap.querySelectorAll(".pill")).forEach((p) => p.classList.add("active"));
    if (el("splitType")?.value === "custom") renderCustomShares();
  });

  // currency
  el("currency")?.addEventListener("change", () => {
    state.currency = el("currency").value;
    renderAll();
    save();
    setMsg("Currency updated ✅");
  });

  // share / export / import / reset
  el("btnShare")?.addEventListener("click", shareSummary);
  el("btnExport")?.addEventListener("click", exportJSON);

  el("fileImport")?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importJSON(f);
    e.target.value = "";
  });

  el("btnResetAll")?.addEventListener("click", resetAll);

  // search/sort
  el("sortBy")?.addEventListener("change", renderExpenses);
  el("search")?.addEventListener("input", renderExpenses);

  // receipt
  el("expReceipt")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return setReceiptPreview(null);
    const dataUrl = await fileToDataUrl(file);
    setReceiptPreview(dataUrl);
    setMsg("Photo attached ✅");
  });

  el("btnClearReceipt")?.addEventListener("click", () => {
    if (el("expReceipt")) el("expReceipt").value = "";
    setReceiptPreview(null);
    setMsg("Photo removed.");
  });

  // -------- MODAL CLOSE (FIXED) --------
  // Close button
  el("btnCloseModal")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeModal();
  });

  // Click outside image (background) closes
  el("modal")?.addEventListener("click", (e) => {
    if (e.target && e.target.id === "modal") closeModal();
  });

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

/* ----------------- Init ----------------- */
(function init() {
  load();
  wire();
  renderAll();
  clearExpenseForm();
})();

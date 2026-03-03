/* SplitEasy v1.1
   Added:
   - Date & Time per expense (history)
   - Search + Sort
   - MMK currency
   - Receipt photo (camera/file) stored as DataURL (localStorage)
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

function fmtMoney(amount){
  try{
    return new Intl.NumberFormat(undefined, { style:"currency", currency: state.currency }).format(amount);
  }catch{
    // fallback for some browsers/currencies
    const sym = state.currency === "MMK" ? "Ks " : state.currency + " ";
    return `${sym}${Number(amount).toFixed(2)}`;
  }
}

function fmtDateTime(iso){
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function setMsg(text, kind="ok"){
  const m = el("msg");
  m.textContent = text || "";
  m.className = "msg " + (kind === "err" ? "err" : "ok");
  if (!text) m.className = "msg";
}

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  el("autosaveStatus").textContent = "Auto-saved";
}

function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try{
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.members) && Array.isArray(data.expenses)) {
      state.currency = data.currency || "USD";
      state.members = data.members;
      state.expenses = data.expenses;
    }
  }catch{}
}

function round2(n){
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[s]));
}
function escapeAttr(str){ return escapeHtml(str).replace(/"/g, "&quot;"); }

function renderMembers(){
  const wrap = el("membersWrap");
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

  renderParticipants();
  renderCustomShares();
}

function renderParticipants(){
  const wrap = el("participantsWrap");
  wrap.innerHTML = "";
  state.members.forEach((m) => {
    const pill = document.createElement("label");
    pill.className = "pill active";
    pill.innerHTML = `<input type="checkbox" checked data-name="${escapeAttr(m)}" /> <span>${escapeHtml(m)}</span>`;
    const checkbox = pill.querySelector("input");
    checkbox.addEventListener("change", () => {
      pill.classList.toggle("active", checkbox.checked);
      if (el("splitType").value === "custom") renderCustomShares();
    });
    wrap.appendChild(pill);
  });
}

function getSelectedParticipants(){
  const checks = Array.from(el("participantsWrap").querySelectorAll("input[type=checkbox]"));
  return checks.filter(c => c.checked).map(c => c.getAttribute("data-name"));
}

function renderCustomShares(){
  const wrap = el("customShares");
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

function addMember(){
  const input = el("memberName");
  const name = (input.value || "").trim();
  if (!name) return setMsg("Please enter a name.", "err");
  if (state.members.includes(name)) return setMsg("Member already exists.", "err");
  if (state.members.length >= 30) return setMsg("Max 30 members for v1.", "err");

  state.members.push(name);
  input.value = "";
  setMsg("Member added ✅");
  renderAll();
  save();
}

function removeMember(name){
  const used = state.expenses.some(e => e.paidBy === name || e.participants.includes(name));
  if (used) return setMsg("Cannot remove: member is used in expenses. Delete those expenses first.", "err");

  state.members = state.members.filter(m => m !== name);
  setMsg("Member removed.");
  renderAll();
  save();
}

let receiptDataUrl = null;

function setReceiptPreview(dataUrl){
  receiptDataUrl = dataUrl;
  const box = el("receiptPreview");
  const img = el("receiptImg");
  if (!dataUrl){
    box.classList.add("hidden");
    img.src = "";
    return;
  }
  img.src = dataUrl;
  box.classList.remove("hidden");
}

function clearExpenseForm(){
  el("expTitle").value = "";
  el("expAmount").value = "";
  el("expPaidBy").value = "";
  el("splitType").value = "equal";
  el("customSharesWrap").classList.add("hidden");

  // default datetime = now (local)
  el("expDateTime").value = toLocalDateTimeValue(new Date());

  // select all participants
  Array.from(el("participantsWrap").querySelectorAll("input[type=checkbox]")).forEach(c => c.checked = true);
  Array.from(el("participantsWrap").querySelectorAll(".pill")).forEach(p => p.classList.add("active"));
  renderCustomShares();

  // receipt
  el("expReceipt").value = "";
  setReceiptPreview(null);

  setMsg("");
}

function toLocalDateTimeValue(date){
  // yyyy-MM-ddTHH:mm for datetime-local
  const pad = (n) => String(n).padStart(2,"0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth()+1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function addExpense(){
  if (state.members.length < 2) return setMsg("Add at least 2 members first.", "err");

  const title = (el("expTitle").value || "").trim() || "Expense";
  const amount = Number(el("expAmount").value);
  const paidBy = el("expPaidBy").value;
  const splitType = el("splitType").value;
  const participants = getSelectedParticipants();

  const dtLocal = el("expDateTime").value; // local datetime string
  const dateTimeISO = dtLocal ? new Date(dtLocal).toISOString() : new Date().toISOString();

  if (!amount || amount <= 0) return setMsg("Enter a valid amount.", "err");
  if (!paidBy) return setMsg("Select who paid.", "err");
  if (participants.length < 1) return setMsg("Select at least 1 participant.", "err");

  let shares = {};
  if (splitType === "equal"){
    const each = amount / participants.length;
    participants.forEach(p => shares[p] = round2(each));
  } else {
    const inputs = Array.from(el("customShares").querySelectorAll("input[data-share]"));
    let sum = 0;
    for (const inp of inputs){
      const who = inp.getAttribute("data-share");
      const val = Number(inp.value);
      if (!isFinite(val) || val < 0) return setMsg("Custom shares must be valid numbers.", "err");
      shares[who] = round2(val);
      sum += val;
    }
    sum = round2(sum);
    const target = round2(amount);
    if (sum !== target){
      return setMsg(`Custom shares must sum to total. Now: ${fmtMoney(sum)} / Total: ${fmtMoney(target)}`, "err");
    }
  }

  // NOTE: storing images in localStorage has size limits; we keep it optional
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

function deleteExpense(id){
  state.expenses = state.expenses.filter(e => e.id !== id);
  setMsg("Expense deleted.");
  renderAll();
  save();
}

function editExpense(id){
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;

  el("expTitle").value = e.title;
  el("expAmount").value = e.amount;
  el("expPaidBy").value = e.paidBy;
  el("splitType").value = e.splitType;

  // datetime-local expects local value
  const d = new Date(e.dateTimeISO || Date.now());
  el("expDateTime").value = toLocalDateTimeValue(d);

  // participants
  Array.from(el("participantsWrap").querySelectorAll("input[type=checkbox]")).forEach(c => {
    const n = c.getAttribute("data-name");
    c.checked = e.participants.includes(n);
    c.closest(".pill").classList.toggle("active", c.checked);
  });

  if (e.splitType === "custom"){
    el("customSharesWrap").classList.remove("hidden");
    renderCustomShares();
    Array.from(el("customShares").querySelectorAll("input[data-share]")).forEach(inp => {
      const who = inp.getAttribute("data-share");
      inp.value = e.shares[who] ?? 0;
    });
  } else {
    el("customSharesWrap").classList.add("hidden");
  }

  // receipt
  setReceiptPreview(e.receiptDataUrl || null);

  // remove old expense
  deleteExpense(id);
  setMsg("Editing loaded. Update fields then click “Add expense”.", "ok");
}

function computeBalances(){
  const balances = {};
  state.members.forEach(m => balances[m] = 0);

  for (const e of state.expenses){
    balances[e.paidBy] = (balances[e.paidBy] || 0) + e.amount;
    for (const p of Object.keys(e.shares)){
      balances[p] = (balances[p] || 0) - e.shares[p];
    }
  }

  for (const k of Object.keys(balances)){
    balances[k] = round2(balances[k]);
  }
  return balances;
}

function computeSettlements(balances){
  const creditors = [];
  const debtors = [];

  for (const [name, bal] of Object.entries(balances)){
    if (bal > 0) creditors.push({name, bal});
    else if (bal < 0) debtors.push({name, bal: -bal});
  }

  creditors.sort((a,b)=>b.bal-a.bal);
  debtors.sort((a,b)=>b.bal-a.bal);

  const transfers = [];
  let i=0, j=0;

  while (i < debtors.length && j < creditors.length){
    const d = debtors[i];
    const c = creditors[j];
    const pay = Math.min(d.bal, c.bal);
    if (pay > 0.009){
      transfers.push({from: d.name, to: c.name, amount: round2(pay)});
      d.bal = round2(d.bal - pay);
      c.bal = round2(c.bal - pay);
    }
    if (d.bal <= 0.009) i++;
    if (c.bal <= 0.009) j++;
  }
  return transfers;
}

function getFilteredSortedExpenses(){
  const q = (el("search").value || "").trim().toLowerCase();
  let items = state.expenses.slice();

  if (q){
    items = items.filter(e => (e.title || "").toLowerCase().includes(q));
  }

  const sortBy = el("sortBy").value;
  if (sortBy === "newest") items.sort((a,b)=> (b.dateTimeISO||"").localeCompare(a.dateTimeISO||""));
  if (sortBy === "oldest") items.sort((a,b)=> (a.dateTimeISO||"").localeCompare(b.dateTimeISO||""));
  if (sortBy === "amountDesc") items.sort((a,b)=> (b.amount||0) - (a.amount||0));
  if (sortBy === "amountAsc") items.sort((a,b)=> (a.amount||0) - (b.amount||0));

  return items;
}

function openModal(dataUrl){
  el("modalImg").src = dataUrl;
  el("modal").classList.remove("hidden");
}
function closeModal(){
  el("modal").classList.add("hidden");
  el("modalImg").src = "";
}

function renderExpenses(){
  const list = el("expensesList");
  list.innerHTML = "";

  const items = getFilteredSortedExpenses();

  if (items.length === 0){
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
      <div class="title">${escapeHtml(e.title)}
        <span class="badge">${badge}</span>
      </div>
      <div class="meta">
        Date: <b>${escapeHtml(dt)}</b><br/>
        Amount: <b>${fmtMoney(e.amount)}</b> • Paid by: <b>${escapeHtml(e.paidBy)}</b><br/>
        Participants: ${escapeHtml(participantsText)}
      </div>
      ${hasReceipt ? `<div class="meta"><b>Receipt:</b> <span class="badge">Tap to view</span></div>` : ``}
      <div class="actions">
        <button class="btn btn-ghost" type="button" data-edit="${e.id}">Edit</button>
        <button class="btn btn-danger" type="button" data-del="${e.id}">Delete</button>
        ${hasReceipt ? `<button class="btn btn-ghost" type="button" data-view="${e.id}">View photo</button>` : ``}
      </div>
    `;

    item.querySelector("[data-edit]").onclick = () => editExpense(e.id);
    item.querySelector("[data-del]").onclick = () => deleteExpense(e.id);
    const viewBtn = item.querySelector("[data-view]");
    if (viewBtn){
      viewBtn.onclick = () => openModal(e.receiptDataUrl);
    }

    list.appendChild(item);
  });
}

function renderBalancesAndSettlements(){
  const balances = computeBalances();

  const balList = el("balances");
  balList.innerHTML = "";
  state.members.forEach((m) => {
    const b = balances[m] ?? 0;
    const item = document.createElement("div");
    item.className = "item";
    const sign = b > 0 ? "+" : "";
    item.innerHTML = `
      <div class="title">${escapeHtml(m)}</div>
      <div class="meta">Balance: <b>${sign}${fmtMoney(b)}</b></div>
    `;
    balList.appendChild(item);
  });

  const transfers = computeSettlements(balances);
  const setList = el("settlements");
  setList.innerHTML = "";

  if (transfers.length === 0){
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

function shareSummary(){
  const balances = computeBalances();
  const transfers = computeSettlements(balances);

  let text = `SplitEasy Summary (${state.currency})\n\nMembers:\n- ${state.members.join("\n- ") || "(none)"}\n\nExpenses:\n`;
  state.expenses.slice().reverse().forEach(e => {
    text += `- ${e.title} | ${fmtDateTime(e.dateTimeISO)} | ${e.amount} paid by ${e.paidBy}\n`;
  });

  text += `\nBalances:\n`;
  state.members.forEach(m => {
    const b = balances[m] ?? 0;
    text += `- ${m}: ${b}\n`;
  });

  text += `\nSettle up:\n`;
  if (transfers.length === 0) text += `- All settled\n`;
  else transfers.forEach(t => text += `- ${t.from} pays ${t.to}: ${t.amount}\n`);

  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text)
      .then(()=> setMsg("Summary copied to clipboard ✅"))
      .catch(()=> alert(text));
  } else alert(text);
}

function exportJSON(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "spliteasy-export.json";
  a.click();
  URL.revokeObjectURL(a.href);
  setMsg("Export downloaded ✅");
}

function importJSON(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.members) || !Array.isArray(data.expenses)){
        return setMsg("Invalid file.", "err");
      }
      state.currency = data.currency || "USD";
      state.members = data.members;
      state.expenses = data.expenses;
      setMsg("Imported ✅");
      renderAll();
      save();
    }catch{
      setMsg("Invalid JSON.", "err");
    }
  };
  reader.readAsText(file);
}

function resetAll(){
  if (!confirm("Reset all data? This cannot be undone.")) return;
  state.currency = "USD";
  state.members = [];
  state.expenses = [];
  save();
  renderAll();
  clearExpenseForm();
  setMsg("Reset done.");
}

function renderAll(){
  el("currency").value = state.currency;
  renderMembers();
  renderExpenses();
  renderBalancesAndSettlements();

  const isCustom = el("splitType").value === "custom";
  el("customSharesWrap").classList.toggle("hidden", !isCustom);
}

function wire(){
  el("btnAddMember").onclick = addMember;
  el("memberName").addEventListener("keydown", (e)=>{ if (e.key==="Enter") addMember(); });

  el("btnAddExpense").onclick = addExpense;
  el("btnClearExpense").onclick = clearExpenseForm;

  el("splitType").addEventListener("change", ()=>{
    const isCustom = el("splitType").value === "custom";
    el("customSharesWrap").classList.toggle("hidden", !isCustom);
    if (isCustom) renderCustomShares();
  });

  el("btnSelectAll").onclick = ()=>{
    Array.from(el("participantsWrap").querySelectorAll("input[type=checkbox]")).forEach(c => c.checked = true);
    Array.from(el("participantsWrap").querySelectorAll(".pill")).forEach(p => p.classList.add("active"));
    if (el("splitType").value === "custom") renderCustomShares();
  };

  el("currency").addEventListener("change", ()=>{
    state.currency = el("currency").value;
    renderAll();
    save();
    setMsg("Currency updated ✅");
  });

  el("btnShare").onclick = shareSummary;
  el("btnExport").onclick = exportJSON;
  el("fileImport").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if (f) importJSON(f);
    e.target.value = "";
  });

  el("btnResetAll").onclick = resetAll;

  // search/sort
  el("sortBy").addEventListener("change", renderExpenses);
  el("search").addEventListener("input", renderExpenses);

  // receipt capture
  el("expReceipt").addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if (!file){ setReceiptPreview(null); return; }
    // reduce huge images a bit (basic)
    const dataUrl = await fileToDataUrl(file);
    setReceiptPreview(dataUrl);
    setMsg("Photo attached ✅");
  });

  el("btnClearReceipt").onclick = ()=>{
    el("expReceipt").value = "";
    setReceiptPreview(null);
    setMsg("Photo removed.");
  };

  // preview click -> modal
  el("receiptImg").addEventListener("click", ()=>{
    if (receiptDataUrl) openModal(receiptDataUrl);
  });

  el("btnCloseModal").onclick = closeModal;
  el("modal").addEventListener("click", (e)=>{
    if (e.target.id === "modal") closeModal();
  });
}

async function fileToDataUrl(file){
  // NOTE: localStorage limit exists. Keep images small.
  // We'll just convert to data URL; if user uploads huge image it may fail to save.
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

(function init(){
  load();
  wire();
  renderAll();
  clearExpenseForm();
})();

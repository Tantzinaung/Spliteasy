/* SplitEasy v1
   Features:
   - Members
   - Multi-expenses
   - Multi-currency display (Intl.NumberFormat)
   - Split types: equal / custom shares
   - Participants selection
   - Balances + simplified settlements
   - Auto-save to localStorage
   - Export/Import JSON
   - Share summary
*/

const STORAGE_KEY = "spliteasy_v1";

const el = (id) => document.getElementById(id);

const state = {
  currency: "USD",
  members: [],
  expenses: [] // {id, title, amount, paidBy, splitType, participants[], shares: {name: amount}}
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function currencySymbol(code){
  const map = { USD:"$", SGD:"S$", THB:"฿", EUR:"€", GBP:"£", JPY:"¥" };
  return map[code] || code;
}

function fmtMoney(amount){
  try{
    return new Intl.NumberFormat(undefined, { style:"currency", currency: state.currency }).format(amount);
  }catch{
    // fallback
    return `${currencySymbol(state.currency)}${Number(amount).toFixed(2)}`;
  }
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

  // update payer dropdown
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
  // block remove if member used in expenses
  const used = state.expenses.some(e => e.paidBy === name || e.participants.includes(name));
  if (used) return setMsg("Cannot remove: member is used in expenses. Delete those expenses first.", "err");

  state.members = state.members.filter(m => m !== name);
  setMsg("Member removed.");
  renderAll();
  save();
}

function clearExpenseForm(){
  el("expTitle").value = "";
  el("expAmount").value = "";
  el("expPaidBy").value = "";
  el("splitType").value = "equal";
  el("customSharesWrap").classList.add("hidden");
  // select all participants
  Array.from(el("participantsWrap").querySelectorAll("input[type=checkbox]")).forEach(c => c.checked = true);
  Array.from(el("participantsWrap").querySelectorAll(".pill")).forEach(p => p.classList.add("active"));
  renderCustomShares();
  setMsg("");
}

function addExpense(){
  if (state.members.length < 2) return setMsg("Add at least 2 members first.", "err");

  const title = (el("expTitle").value || "").trim() || "Expense";
  const amount = Number(el("expAmount").value);
  const paidBy = el("expPaidBy").value;
  const splitType = el("splitType").value;
  const participants = getSelectedParticipants();

  if (!amount || amount <= 0) return setMsg("Enter a valid amount.", "err");
  if (!paidBy) return setMsg("Select who paid.", "err");
  if (participants.length < 1) return setMsg("Select at least 1 participant.", "err");
  if (!participants.includes(paidBy)) {
    // payer can be participant or not; but for simplicity we allow and still calculate
    // (in real apps you can pay for others)
  }

  let shares = {};
  if (splitType === "equal"){
    const each = amount / participants.length;
    participants.forEach(p => shares[p] = round2(each));
  } else {
    // custom
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

  state.expenses.unshift({
    id: uid(),
    title,
    amount: round2(amount),
    paidBy,
    splitType,
    participants,
    shares
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

  // Load into form for quick edit (delete + re-add)
  el("expTitle").value = e.title;
  el("expAmount").value = e.amount;
  el("expPaidBy").value = e.paidBy;
  el("splitType").value = e.splitType;

  // participants
  Array.from(el("participantsWrap").querySelectorAll("input[type=checkbox]")).forEach(c => {
    const n = c.getAttribute("data-name");
    c.checked = e.participants.includes(n);
    c.closest(".pill").classList.toggle("active", c.checked);
  });

  if (e.splitType === "custom"){
    el("customSharesWrap").classList.remove("hidden");
    renderCustomShares();
    // fill shares
    Array.from(el("customShares").querySelectorAll("input[data-share]")).forEach(inp => {
      const who = inp.getAttribute("data-share");
      inp.value = e.shares[who] ?? 0;
    });
  } else {
    el("customSharesWrap").classList.add("hidden");
  }

  // remove old expense, user will click Add expense to save edited version
  deleteExpense(id);
  setMsg("Editing loaded. Update fields then click “Add expense”.", "ok");
}

function computeBalances(){
  // balance = paid - owed
  const balances = {};
  state.members.forEach(m => balances[m] = 0);

  for (const e of state.expenses){
    // payer paid full amount
    if (!balances[e.paidBy]) balances[e.paidBy] = 0;
    balances[e.paidBy] += e.amount;

    // each participant owes their share
    for (const p of Object.keys(e.shares)){
      if (!balances[p]) balances[p] = 0;
      balances[p] -= e.shares[p];
    }
  }

  // round small errors
  for (const k of Object.keys(balances)){
    balances[k] = round2(balances[k]);
  }
  return balances;
}

function computeSettlements(balances){
  // Greedy settlement:
  // creditors: balance > 0, debtors: balance < 0
  const creditors = [];
  const debtors = [];

  for (const [name, bal] of Object.entries(balances)){
    if (bal > 0) creditors.push({name, bal});
    else if (bal < 0) debtors.push({name, bal: -bal}); // store positive debt
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

function renderExpenses(){
  const list = el("expensesList");
  list.innerHTML = "";
  if (state.expenses.length === 0){
    list.innerHTML = `<div class="item"><div class="meta">No expenses yet.</div></div>`;
    return;
  }

  state.expenses.forEach((e) => {
    const item = document.createElement("div");
    item.className = "item";

    const participantsText = e.participants.join(", ");
    const badge = e.splitType === "custom" ? "Custom" : "Equal";

    item.innerHTML = `
      <div class="title">${escapeHtml(e.title)}
        <span class="badge">${badge}</span>
      </div>
      <div class="meta">
        Amount: <b>${fmtMoney(e.amount)}</b> • Paid by: <b>${escapeHtml(e.paidBy)}</b><br/>
        Participants: ${escapeHtml(participantsText)}
      </div>
      <div class="actions">
        <button class="btn btn-ghost" type="button" data-edit="${e.id}">Edit</button>
        <button class="btn btn-danger" type="button" data-del="${e.id}">Delete</button>
      </div>
    `;

    item.querySelector("[data-edit]").onclick = () => editExpense(e.id);
    item.querySelector("[data-del]").onclick = () => deleteExpense(e.id);

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

  let text = `SplitEasy Summary (${state.currency})\n\nMembers:\n- ${state.members.join("\n- ")}\n\nExpenses:\n`;
  state.expenses.slice().reverse().forEach(e => {
    text += `- ${e.title}: ${e.amount} paid by ${e.paidBy}\n`;
  });

  text += `\nBalances:\n`;
  state.members.forEach(m => {
    const b = balances[m] ?? 0;
    text += `- ${m}: ${b}\n`;
  });

  text += `\nSettle up:\n`;
  if (transfers.length === 0) text += `- All settled\n`;
  else transfers.forEach(t => text += `- ${t.from} pays ${t.to}: ${t.amount}\n`);

  // Try clipboard
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text)
      .then(()=> setMsg("Summary copied to clipboard ✅"))
      .catch(()=> alert(text));
  } else {
    alert(text);
  }
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

function round2(n){
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[s]));
}
function escapeAttr(str){ return escapeHtml(str).replace(/"/g, "&quot;"); }

function renderAll(){
  // currency UI
  el("currency").value = state.currency;

  renderMembers();
  renderExpenses();
  renderBalancesAndSettlements();

  // show custom share UI
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
}

(function init(){
  load();
  wire();
  renderAll();
  clearExpenseForm();
})();

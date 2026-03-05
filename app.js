/* SplitEasy v2 — Multi Trip + Export/Import + Dark + Share/QR + Edit/Delete + Receipt Gallery + Currency Convert
   Works on GitHub Pages (localStorage based)
*/

const STORAGE_KEY = "spliteasy_v2_db";
const FX_CACHE_KEY = "spliteasy_v2_fx_cache";
const FX_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

// Common currencies (includes MMK)
const CURRENCIES = [
  "USD","SGD","MMK","THB","EUR","GBP","JPY","AUD","CAD","CNY","HKD","INR","IDR","MYR","PHP","KRW","VND","LAK","KHR"
];

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function nowLocalInputValue(){
  const d = new Date();
  const pad = (n) => String(n).padStart(2,"0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth()+1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function uid(prefix="id"){
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function money(n){
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function safeText(s){
  return (s ?? "").toString().trim();
}

function downloadText(filename, text, mime="application/json"){
  const blob = new Blob([text], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readFileAsDataURL(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsText(file);
  });
}

// ---------- DB ----------
let DB = loadDB();
let editExpenseId = null;

function defaultDB(){
  const first = {
    id: uid("trip"),
    name: "Trip 1",
    baseCurrency: "USD",
    members: [],
    expenses: []
  };
  return {
    version: 2,
    groups: [first],
    currentGroupId: first.id
  };
}

function loadDB(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDB();
    const db = JSON.parse(raw);

    // minimal migration safety
    if (!db.groups || !Array.isArray(db.groups) || db.groups.length === 0){
      return defaultDB();
    }
    if (!db.currentGroupId) db.currentGroupId = db.groups[0].id;
    db.version = 2;
    // ensure fields
    db.groups.forEach(g=>{
      g.baseCurrency ||= "USD";
      g.members ||= [];
      g.expenses ||= [];
    });
    return db;
  }catch{
    return defaultDB();
  }
}

function saveDB(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
}

function getGroup(){
  return DB.groups.find(g => g.id === DB.currentGroupId) || DB.groups[0];
}

function setCurrentGroup(id){
  DB.currentGroupId = id;
  saveDB();
  editExpenseId = null;
  clearExpenseForm(true);
  renderAll();
}

// ---------- FX (Currency Convert) ----------
function loadFxCache(){
  try{
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts || !obj.rates || !obj.base) return null;
    if (Date.now() - obj.ts > FX_CACHE_TTL_MS) return null;
    return obj;
  }catch{
    return null;
  }
}
function saveFxCache(base, rates){
  localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ts:Date.now(), base, rates}));
}

/* Uses exchangerate.host (no key normally). If it fails, fallback to 1:1 (still works offline) */
async function getRates(base){
  base = (base || "USD").toUpperCase();
  const cache = loadFxCache();
  if (cache && cache.base === base) return cache.rates;

  try{
    const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}`;
    const res = await fetch(url, {cache:"no-store"});
    if (!res.ok) throw new Error("FX fetch failed");
    const data = await res.json();
    if (!data || !data.rates) throw new Error("FX data invalid");
    saveFxCache(base, data.rates);
    return data.rates;
  }catch{
    // fallback
    const rates = {};
    CURRENCIES.forEach(c => rates[c] = 1);
    saveFxCache(base, rates);
    return rates;
  }
}

async function convert(amount, from, to){
  amount = Number(amount);
  if (!Number.isFinite(amount)) return 0;
  from = (from||"USD").toUpperCase();
  to = (to||"USD").toUpperCase();
  if (from === to) return amount;

  // Convert using base=from rates(to)
  const rates = await getRates(from);
  const rate = rates[to];
  if (!rate || !Number.isFinite(rate)) return amount; // fallback
  return amount * rate;
}

// ---------- Rendering ----------
function renderGroups(){
  const sel = $("groupSelector");
  sel.innerHTML = "";

  DB.groups.forEach(g=>{
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.name;
    sel.appendChild(opt);
  });

  sel.value = getGroup().id;
}

function renderCurrencies(){
  const base = $("baseCurrency");
  const exp = $("expCurrency");

  // fill base currency
  base.innerHTML = "";
  CURRENCIES.forEach(c=>{
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    base.appendChild(o);
  });

  // expense currency
  exp.innerHTML = "";
  CURRENCIES.forEach(c=>{
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    exp.appendChild(o);
  });

  // set selected
  const g = getGroup();
  base.value = g.baseCurrency || "USD";
  exp.value = g.baseCurrency || "USD";
}

function renderMembers(){
  const g = getGroup();
  const wrap = $("membersWrap");
  wrap.innerHTML = "";

  g.members.forEach(name=>{
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.innerHTML = `<span>${name}</span>`;
    const x = document.createElement("button");
    x.className = "x";
    x.type = "button";
    x.textContent = "×";
    x.onclick = () => removeMember(name);
    pill.appendChild(x);
    wrap.appendChild(pill);
  });

  // paidBy select
  const paidBy = $("paidBy");
  paidBy.innerHTML = `<option value="">Select</option>`;
  g.members.forEach(m=>{
    const o = document.createElement("option");
    o.value = m; o.textContent = m;
    paidBy.appendChild(o);
  });

  // participants checkboxes
  const pWrap = $("participantsWrap");
  pWrap.innerHTML = "";
  g.members.forEach(m=>{
    const label = document.createElement("label");
    label.className = "check";
    label.innerHTML = `<input type="checkbox" value="${m}" checked/> <span>${m}</span>`;
    pWrap.appendChild(label);
  });
}

function getSelectedParticipants(){
  const boxes = Array.from($("participantsWrap").querySelectorAll('input[type="checkbox"]'));
  return boxes.filter(b=>b.checked).map(b=>b.value);
}

function renderExpenses(){
  const g = getGroup();
  const list = $("expensesList");

  const q = safeText($("searchExpenses").value).toLowerCase();
  const sort = $("sortExpenses").value;

  let exps = [...g.expenses];

  // search
  if (q){
    exps = exps.filter(e=>{
      const hay = `${e.title} ${e.paidBy} ${e.currency} ${e.baseCurrency}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // sort
  exps.sort((a,b)=>{
    if (sort === "newest") return (b.dateTs||0) - (a.dateTs||0);
    if (sort === "oldest") return (a.dateTs||0) - (b.dateTs||0);
    if (sort === "amountDesc") return (b.baseAmount||0) - (a.baseAmount||0);
    if (sort === "amountAsc") return (a.baseAmount||0) - (b.baseAmount||0);
    if (sort === "titleAsc") return (a.title||"").localeCompare(b.title||"");
    return 0;
  });

  if (exps.length === 0){
    list.innerHTML = `<div class="item muted">No expenses yet.</div>`;
    return;
  }

  list.innerHTML = "";
  exps.forEach(e=>{
    const item = document.createElement("div");
    item.className = "item";

    const dt = e.dateISO ? new Date(e.dateISO) : null;
    const dateText = dt ? dt.toLocaleString() : "";

    const receiptTag = e.receipt ? `<span class="tag">Receipt</span>` : "";
    const fxTag = (e.currency !== e.baseCurrency) ? `<span class="tag">${e.currency}→${e.baseCurrency}</span>` : "";

    item.innerHTML = `
      <div class="itemTop">
        <div>
          <div class="itemTitle">${e.title || "(Untitled)"}</div>
          <div class="itemMeta">
            Paid by <b>${e.paidBy || "-"}</b> • ${dateText || "-"}
            <br/>
            Original: <b>${money(e.amount)} ${e.currency}</b>
            ${e.currency !== e.baseCurrency ? ` • Converted: <b>${money(e.baseAmount)} ${e.baseCurrency}</b>` : ` • <b>${e.baseCurrency}</b>`}
          </div>
          <div class="row tight" style="margin-top:8px; flex-wrap:wrap;">
            ${receiptTag} ${fxTag}
          </div>
        </div>
        <div class="itemActions">
          ${e.receipt ? `<button class="btn small" data-act="view" data-id="${e.id}">View receipt</button>` : ""}
          <button class="btn small" data-act="edit" data-id="${e.id}">Edit</button>
          <button class="btn small danger" data-act="del" data-id="${e.id}">Delete</button>
        </div>
      </div>
    `;

    item.onclick = (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      if (act === "del") deleteExpense(id);
      if (act === "edit") startEditExpense(id);
      if (act === "view") openReceiptModal(id);
    };

    list.appendChild(item);
  });
}

function computeBalances(){
  const g = getGroup();
  const balances = {};
  g.members.forEach(m=>balances[m]=0);

  g.expenses.forEach(e=>{
    const payer = e.paidBy;
    const participants = Array.isArray(e.participants) ? e.participants : [];
    if (!payer || participants.length === 0) return;

    const total = Number(e.baseAmount);
    if (!Number.isFinite(total) || total <= 0) return;

    const share = total / participants.length;

    // payer paid total, should receive from others (including themselves net later)
    balances[payer] += total;

    // each participant owes share
    participants.forEach(p=>{
      balances[p] -= share;
    });
  });

  return balances;
}

function renderBalancesAndSettle(){
  const g = getGroup();
  const balances = computeBalances();

  const bList = $("balancesList");
  bList.innerHTML = "";
  if (g.members.length === 0){
    bList.innerHTML = `<div class="item muted">Add members to see balances.</div>`;
  }else{
    g.members.forEach(m=>{
      const val = balances[m] || 0;
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="itemTop">
          <div>
            <div class="itemTitle">${m}</div>
            <div class="itemMeta">${val >= 0 ? "Should receive" : "Owes"}</div>
          </div>
          <div class="itemTitle">${money(Math.abs(val))} ${g.baseCurrency}</div>
        </div>
      `;
      bList.appendChild(item);
    });
  }

  // Settle algorithm (greedy)
  const settles = [];
  const debtors = [];
  const creditors = [];

  Object.entries(balances).forEach(([name,val])=>{
    const v = Number(val);
    if (!Number.isFinite(v)) return;
    if (v < -0.01) debtors.push({name, amt:-v});
    if (v > 0.01) creditors.push({name, amt:v});
  });

  debtors.sort((a,b)=>b.amt-a.amt);
  creditors.sort((a,b)=>b.amt-a.amt);

  let i=0, j=0;
  while(i<debtors.length && j<creditors.length){
    const d = debtors[i], c = creditors[j];
    const pay = Math.min(d.amt, c.amt);
    settles.push({from:d.name, to:c.name, amt:pay});
    d.amt -= pay;
    c.amt -= pay;
    if (d.amt <= 0.01) i++;
    if (c.amt <= 0.01) j++;
  }

  const sList = $("settleList");
  sList.innerHTML = "";
  if (settles.length === 0){
    sList.innerHTML = `<div class="item muted">All settled ✅</div>`;
  }else{
    settles.forEach(t=>{
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="itemTop">
          <div>
            <div class="itemTitle">${t.from} → ${t.to}</div>
            <div class="itemMeta">Pay to settle</div>
          </div>
          <div class="itemTitle">${money(t.amt)} ${g.baseCurrency}</div>
        </div>
      `;
      sList.appendChild(item);
    });
  }
}

function renderAll(){
  renderGroups();
  renderCurrencies();
  renderMembers();
  renderExpenses();
  renderBalancesAndSettle();

  // trip name input
  $("tripNameInput").value = getGroup().name || "";

  // form mode hint
  $("formMode").textContent = editExpenseId ? "Editing mode: Click 'Add expense' to save changes." : "";
}

// ---------- Trips ----------
function createTrip(){
  const name = safeText(prompt("Trip name? (e.g., Trip 2, Bangkok Trip)"));
  if (!name) return;

  const g = {
    id: uid("trip"),
    name,
    baseCurrency: "USD",
    members: [],
    expenses: []
  };
  DB.groups.push(g);
  DB.currentGroupId = g.id;
  saveDB();
  editExpenseId = null;
  clearExpenseForm(true);
  renderAll();
}

function renameTrip(){
  const name = safeText($("tripNameInput").value);
  if (!name) return alert("Please type a trip name.");
  const g = getGroup();
  g.name = name;
  saveDB();
  renderGroups();
}

// ---------- Members ----------
function addMember(){
  const name = safeText($("memberName").value);
  if (!name) return;

  const g = getGroup();
  if (g.members.includes(name)){
    $("memberName").value = "";
    return alert("Member already exists.");
  }
  g.members.push(name);
  saveDB();
  $("memberName").value = "";
  renderMembers();
  renderBalancesAndSettle();
}

function removeMember(name){
  const g = getGroup();
  // Remove member from list
  g.members = g.members.filter(m=>m!==name);

  // Remove from expenses payer/participants
  g.expenses.forEach(e=>{
    if (e.paidBy === name) e.paidBy = "";
    if (Array.isArray(e.participants)){
      e.participants = e.participants.filter(p=>p!==name);
    }
  });

  saveDB();
  renderAll();
}

// ---------- Expenses ----------
function clearExpenseForm(keepCurrency=false){
  $("expTitle").value = "";
  $("expAmount").value = "";
  $("paidBy").value = "";
  $("receiptFile").value = "";
  $("expDate").value = nowLocalInputValue();

  // participants default all checked
  Array.from($("participantsWrap").querySelectorAll('input[type="checkbox"]')).forEach(b=>b.checked=true);

  if (!keepCurrency){
    const g = getGroup();
    $("expCurrency").value = g.baseCurrency || "USD";
  }

  editExpenseId = null;
  $("btnAddExpense").textContent = "Add expense";
  $("formMode").textContent = "";
}

async function addOrSaveExpense(){
  const g = getGroup();
  if (g.members.length === 0) return alert("Add members first.");

  const title = safeText($("expTitle").value) || "Expense";
  const amount = Number($("expAmount").value);
  const currency = $("expCurrency").value;
  const baseCurrency = g.baseCurrency || "USD";
  const paidBy = $("paidBy").value;
  const participants = getSelectedParticipants();
  const dateISO = $("expDate").value ? new Date($("expDate").value).toISOString() : new Date().toISOString();
  const dateTs = Date.parse(dateISO);

  if (!paidBy) return alert("Select who paid.");
  if (!Number.isFinite(amount) || amount <= 0) return alert("Enter a valid amount.");
  if (!participants || participants.length === 0) return alert("Select participants.");

  // receipt
  let receipt = null;
  const file = $("receiptFile").files && $("receiptFile").files[0];
  if (file){
    receipt = await readFileAsDataURL(file);
  }

  // convert to base
  const baseAmount = await convert(amount, currency, baseCurrency);

  const payload = {
    id: editExpenseId || uid("exp"),
    title,
    amount,
    currency,
    baseCurrency,
    baseAmount,
    paidBy,
    participants,
    dateISO,
    dateTs,
    receipt: receipt
  };

  if (editExpenseId){
    const idx = g.expenses.findIndex(e=>e.id===editExpenseId);
    if (idx >= 0){
      // keep old receipt if not replaced
      if (!receipt && g.expenses[idx].receipt) payload.receipt = g.expenses[idx].receipt;
      g.expenses[idx] = payload;
    }
    editExpenseId = null;
  }else{
    g.expenses.push(payload);
  }

  saveDB();
  clearExpenseForm(true);
  renderExpenses();
  renderBalancesAndSettle();
}

function startEditExpense(id){
  const g = getGroup();
  const e = g.expenses.find(x=>x.id===id);
  if (!e) return;

  editExpenseId = id;
  $("btnAddExpense").textContent = "Save changes";
  $("formMode").textContent = "Editing mode: Update fields then click 'Save changes'.";

  $("expTitle").value = e.title || "";
  $("expAmount").value = e.amount || "";
  $("expCurrency").value = e.currency || (g.baseCurrency||"USD");
  $("paidBy").value = e.paidBy || "";
  $("expDate").value = e.dateISO ? nowFromISOToLocalInput(e.dateISO) : nowLocalInputValue();

  // participants
  const set = new Set(e.participants || []);
  Array.from($("participantsWrap").querySelectorAll('input[type="checkbox"]')).forEach(b=>{
    b.checked = set.has(b.value);
  });

  // receipt input cannot be pre-filled (browser security)
  $("receiptFile").value = "";
}

function nowFromISOToLocalInput(iso){
  try{
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2,"0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth()+1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }catch{
    return nowLocalInputValue();
  }
}

function deleteExpense(id){
  if (!confirm("Delete this expense?")) return;
  const g = getGroup();
  g.expenses = g.expenses.filter(e=>e.id!==id);
  saveDB();
  if (editExpenseId === id) clearExpenseForm(true);
  renderExpenses();
  renderBalancesAndSettle();
}

// ---------- Receipt view / gallery ----------
function openReceiptModal(expId){
  const g = getGroup();
  const e = g.expenses.find(x=>x.id===expId);
  if (!e || !e.receipt) return;

  // open in new tab
  const w = window.open();
  if (w){
    w.document.write(`<title>Receipt</title><img src="${e.receipt}" style="max-width:100%;height:auto;"/>`);
  }else{
    alert("Popup blocked. Please allow popups to view receipt.");
  }
}

function openGallery(){
  const g = getGroup();
  const grid = $("galleryGrid");
  grid.innerHTML = "";

  const receipts = g.expenses
    .filter(e=>e.receipt)
    .sort((a,b)=>(b.dateTs||0)-(a.dateTs||0));

  if (receipts.length === 0){
    grid.innerHTML = `<div class="item muted">No receipts yet.</div>`;
  }else{
    receipts.forEach(e=>{
      const img = document.createElement("img");
      img.src = e.receipt;
      img.alt = e.title || "receipt";
      img.title = `${e.title || "Receipt"} — ${money(e.baseAmount)} ${e.baseCurrency}`;
      img.onclick = () => openReceiptModal(e.id);
      grid.appendChild(img);
    });
  }

  $("galleryModal").classList.remove("hidden");
}

function closeGallery(){
  $("galleryModal").classList.add("hidden");
}

// ---------- Share / QR ----------
function openShare(){
  const url = location.href;
  $("shareLink").value = url;

  // reset QR box
  $("qrShareBox").innerHTML = "";
  $("shareModal").classList.remove("hidden");
}

function closeShare(){
  $("shareModal").classList.add("hidden");
}

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    alert("Copied!");
  }catch{
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    alert("Copied!");
  }
}

async function nativeShare(){
  const url = location.href;
  if (!navigator.share){
    alert("Native share is not supported on this device/browser.");
    return;
  }
  try{
    await navigator.share({
      title:"SplitEasy",
      text:"SplitEasy — Expense Splitter",
      url
    });
  }catch{
    // user canceled
  }
}

function showQR(targetElId, text){
  const box = $(targetElId);
  box.innerHTML = "";
  new QRCode(box, { text, width:220, height:220 });
}

// ---------- Export / Import ----------
function exportJSON(){
  const data = JSON.stringify(DB, null, 2);
  downloadText("spliteasy_backup.json", data, "application/json");
}

async function importJSON(file){
  try{
    const txt = await readFileAsText(file);
    const obj = JSON.parse(txt);

    // basic validate
    if (!obj || !Array.isArray(obj.groups)) throw new Error("Invalid backup file");
    if (!obj.currentGroupId) obj.currentGroupId = obj.groups[0]?.id;

    // ensure fields
    obj.groups.forEach(g=>{
      g.baseCurrency ||= "USD";
      g.members ||= [];
      g.expenses ||= [];
    });
    obj.version = 2;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    location.reload();
  }catch(err){
    alert("Import failed: " + err.message);
  }
}

// ---------- Dark Mode ----------
function loadDark(){
  const v = localStorage.getItem("spliteasy_dark");
  if (v === "true") document.body.classList.add("dark");
}
function toggleDark(){
  document.body.classList.toggle("dark");
  localStorage.setItem("spliteasy_dark", document.body.classList.contains("dark"));
}

// ---------- Reset ----------
function resetAll(){
  if (!confirm("Reset ALL data? (Trips, members, expenses)")) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(FX_CACHE_KEY);
  DB = defaultDB();
  saveDB();
  editExpenseId = null;
  location.reload();
}

// ---------- Wire ----------
function wire(){
  // init defaults
  $("expDate").value = nowLocalInputValue();
  loadDark();

  // group selector
  $("groupSelector").addEventListener("change", (e)=> setCurrentGroup(e.target.value));

  // new trip
  $("btnNewTrip").onclick = createTrip;

  // rename trip
  $("btnRenameTrip").onclick = renameTrip;

  // base currency
  $("baseCurrency").addEventListener("change", async (e)=>{
    const g = getGroup();
    g.baseCurrency = e.target.value;

    // update expense currency default to base
    $("expCurrency").value = g.baseCurrency;

    // Recalculate all baseAmount for existing expenses
    // (Convert from original currency to new base)
    for (const exp of g.expenses){
      exp.baseCurrency = g.baseCurrency;
      exp.baseAmount = await convert(exp.amount, exp.currency, g.baseCurrency);
    }

    saveDB();
    renderExpenses();
    renderBalancesAndSettle();
  });

  // dark
  $("btnDark").onclick = toggleDark;

  // share
  $("btnShare").onclick = openShare;
  $("btnCloseShare").onclick = closeShare;
  $("btnCopyShare").onclick = ()=> copyText($("shareLink").value);
  $("btnNativeShare").onclick = nativeShare;
  $("btnQRShare").onclick = ()=> showQR("qrShareBox", location.href);

  // quick tools
  $("btnCopyLink").onclick = ()=> copyText(location.href);
  $("btnShowQR").onclick = ()=>{
    $("qrWrap").classList.remove("hidden");
    $("qrBox").innerHTML = "";
    showQR("qrBox", location.href);
  };
  $("btnCloseQR").onclick = ()=> $("qrWrap").classList.add("hidden");

  // export/import
  $("btnExport").onclick = exportJSON;
  $("importFile").addEventListener("change", (e)=>{
    const f = e.target.files && e.target.files[0];
    if (f) importJSON(f);
    e.target.value = "";
  });

  // reset
  $("btnReset").onclick = resetAll;

  // members
  $("btnAddMember").onclick = addMember;
  $("memberName").addEventListener("keydown", (e)=>{ if(e.key==="Enter") addMember(); });

  // participants quick
  $("btnSelectAll").onclick = ()=>{
    Array.from($("participantsWrap").querySelectorAll('input[type="checkbox"]')).forEach(b=>b.checked=true);
  };
  $("btnSelectNone").onclick = ()=>{
    Array.from($("participantsWrap").querySelectorAll('input[type="checkbox"]')).forEach(b=>b.checked=false);
  };

  // expense
  $("btnAddExpense").onclick = addOrSaveExpense;
  $("btnClearExpense").onclick = ()=> clearExpenseForm(true);

  // history sort/search
  $("sortExpenses").addEventListener("change", renderExpenses);
  $("searchExpenses").addEventListener("input", renderExpenses);

  // gallery
  $("btnOpenGallery").onclick = openGallery;
  $("btnCloseGallery").onclick = closeGallery;

  // close modals by clicking outside
  $("shareModal").addEventListener("click", (e)=>{ if(e.target.id==="shareModal") closeShare(); });
  $("galleryModal").addEventListener("click", (e)=>{ if(e.target.id==="galleryModal") closeGallery(); });
}

// ---------- Boot ----------
function boot(){
  // Ensure current group exists
  if (!DB.groups.find(g=>g.id===DB.currentGroupId)){
    DB.currentGroupId = DB.groups[0].id;
    saveDB();
  }

  renderAll();
  wire();
}

boot();

// -------------------------------------------------------------
// PASTE YOUR LATEST GOOGLE APPS SCRIPT URL HERE
// -------------------------------------------------------------
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQWVUSQ5eFXNEHzdwwBur1QCNetWKPXFHnU4eY4VUXpwNhf8SiWRD_9SA2NDzoE_s6Pw/exec";

let appState = { 
  currentUser: "", employeeId: "", email: "", password: "", userRole: "Employee", currentRole: "employee",
  currentTripId: null, activeCategory: "Travel", editingExpenseId: null,
  trips: [], expenses: [], personalTrips: [], personalExpenses: [],
  billPreviewData: null, payPreviewData: null 
};
let sessionTimeoutTracker; let authMode = "login"; 
let categoryChartInstance = null; let tripChartInstance = null;
let pendingRegistrationData = null; let fpTargetEmail = ""; 

document.addEventListener("DOMContentLoaded", () => { 
  document.getElementById("fieldDate").value = new Date().toISOString().split("T")[0]; 
  updateThemeIcon(); 
  checkSession(); 
});

// --- DARK MODE TOGGLE LOGIC ---
function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcon();
  if(!document.getElementById('viewDash').classList.contains('hidden')) renderDashboard(); // re-render charts for color update
}

function updateThemeIcon() {
  const isDark = document.documentElement.classList.contains('dark');
  document.getElementById('themeToggleIcon').className = isDark ? 'fa-solid fa-sun text-amber-400' : 'fa-solid fa-moon text-slate-300';
}

function switchMainTab(tabName) {
  if(tabName === 'log') {
    document.getElementById('viewLog').classList.remove('hidden'); document.getElementById('viewDash').classList.add('hidden');
    document.getElementById('tabLogBtn').className = "py-2.5 text-sm font-medium border-b-2 border-red-500 text-white flex items-center transition";
    document.getElementById('tabDashBtn').className = "py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-white flex items-center transition";
  } else {
    document.getElementById('viewLog').classList.add('hidden'); document.getElementById('viewDash').classList.remove('hidden');
    document.getElementById('tabDashBtn').className = "py-2.5 text-sm font-medium border-b-2 border-red-500 text-white flex items-center transition";
    document.getElementById('tabLogBtn').className = "py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-white flex items-center transition";
    renderDashboard();
  }
}

let confirmActionCallback = null;
function showConfirmModal(title, message, callback) { document.getElementById("confirmTitle").innerText = title; document.getElementById("confirmMessage").innerText = message; confirmActionCallback = callback; document.getElementById("confirmModal").classList.remove("hidden"); }
function closeConfirmModal() { document.getElementById("confirmModal").classList.add("hidden"); confirmActionCallback = null; }
function executeConfirm() { if(confirmActionCallback) confirmActionCallback(); closeConfirmModal(); }
function showSuccessModal(msg) { const m = document.getElementById("successModal"); document.getElementById("successMessage").innerText = msg; m.classList.remove("hidden"); setTimeout(() => m.classList.add("hidden"), 3500); }

function toggleAuthMode() {
  authMode = authMode === "login" ? "register" : "login";
  document.getElementById("nameFieldGroup").classList.toggle("hidden", authMode === "login"); 
  document.getElementById("emailFieldGroup").classList.toggle("hidden", authMode === "login");
  document.getElementById("authName").required = authMode === "register"; 
  document.getElementById("authEmail").required = authMode === "register";
  document.getElementById("authIdLabel").innerHTML = authMode === "login" ? 'Employee ID or Email <span class="text-red-500">*</span>' : 'Employee ID <span class="text-red-500">*</span>';
  document.getElementById("authTitle").innerText = authMode === "login" ? "Company Portal" : "Create Account"; 
  document.getElementById("authSubtitle").innerText = authMode === "login" ? "Sign in to manage your expenses" : "Register as a new employee";
  document.getElementById("authSubmitBtn").innerHTML = authMode === "login" ? 'Secure Login <i class="fa-solid fa-arrow-right-to-bracket ml-2"></i>' : 'Verify & Register <i class="fa-solid fa-user-plus ml-2"></i>';
  document.getElementById("authToggleBtn").innerText = authMode === "login" ? "New employee? Create an account" : "Already have an account? Sign In";
  document.getElementById("forgotPasswordBtn").classList.toggle("hidden", authMode === "register");
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById("authSubmitBtn"); const originalHtml = btn.innerHTML; 
  
  if (authMode === "register") {
    const checkEmail = document.getElementById("authEmail").value.trim().toLowerCase();
    if (!checkEmail.endsWith("@tynatech.in") && !checkEmail.endsWith("@iotyn.in") && !checkEmail.endsWith("@tynaraace.in")) { alert("Registration restricted: You must use an official @tynatech.in, @iotyn.in, or @tynaraace.in email address."); return; }
  }

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...'; btn.disabled = true;
  const payload = { action: authMode, name: document.getElementById("authName").value.trim(), empId: document.getElementById("authId").value.trim(), email: document.getElementById("authEmail").value.trim(), password: document.getElementById("authPassword").value.trim() };
  if (authMode === "login") { payload.loginId = document.getElementById("authId").value.trim(); } else { payload.action = "sendOTP"; }

  try {
    const response = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    const result = await response.json();
    
    if (result.status === "success") {
      if (authMode === "register") { 
        pendingRegistrationData = payload; document.getElementById("otpDisplayEmail").innerText = payload.email;
        document.getElementById("otpInput").value = ""; document.getElementById("otpModal").classList.remove("hidden");
      } else {
        appState.currentUser = result.user.name; appState.employeeId = result.user.empId; appState.email = result.user.email; appState.password = result.user.password; appState.userRole = result.user.role ? String(result.user.role).trim() : "Employee";
        if(appState.userRole === "Admin") { document.getElementById("adminControlsContainer").style.display = "flex"; appState.currentRole = "admin"; } else { document.getElementById("adminControlsContainer").style.display = "none"; appState.currentRole = "employee"; }
        appState.personalTrips = result.trips && result.trips.length > 0 ? result.trips : []; appState.personalExpenses = result.expenses && result.expenses.length > 0 ? result.expenses : []; appState.trips = [...appState.personalTrips]; appState.expenses = [...appState.personalExpenses]; appState.currentTripId = appState.trips.length > 0 ? appState.trips[0].id : null;
        localStorage.setItem("expense_session_expiry", Date.now() + (60 * 60 * 1000)); saveStorageData(); 
        if(appState.userRole === "Admin") { showMainApp(); await fetchAllCompanyData(); } else { showMainApp(); }
        document.getElementById("authForm").reset(); resetAttachmentUI();
      }
    } else alert(result.message);
  } catch (err) { alert("Network Error: Ensure your Google Script URL is pasted correctly in script.js."); } finally { btn.innerHTML = originalHtml; btn.disabled = false; }
}

async function handleOtpSubmit(e) {
  e.preventDefault(); const btn = document.getElementById("btnVerifyOtp"); const originalHtml = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...'; btn.disabled = true;
  const finalPayload = { ...pendingRegistrationData, action: "register", otp: document.getElementById("otpInput").value.trim() };
  try {
    const response = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(finalPayload) });
    const result = await response.json();
    if (result.status === "success") { closeOtpModal(); showSuccessModal("Account created successfully!"); toggleAuthMode(); document.getElementById("authId").value = finalPayload.empId; document.getElementById("authPassword").value = ""; } else { alert(result.message); }
  } catch (err) { alert("Network Error"); } finally { btn.innerHTML = originalHtml; btn.disabled = false; }
}

function closeOtpModal() { document.getElementById("otpModal").classList.add("hidden"); }

function openForgotPasswordModal() { document.getElementById("fpRequestForm").classList.remove("hidden"); document.getElementById("fpResetForm").classList.add("hidden"); document.getElementById("fpLoginId").value = ""; document.getElementById("forgotPasswordModal").classList.remove("hidden"); }
function closeForgotPasswordModal() { document.getElementById("forgotPasswordModal").classList.add("hidden"); }

async function handleFpRequest(e) {
  e.preventDefault(); const btn = document.getElementById("btnFpRequest"); const originalText = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...'; btn.disabled = true;
  const payload = { action: "sendForgotPasswordOTP", loginId: document.getElementById("fpLoginId").value.trim() };
  try {
    const response = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (result.status === "success") { fpTargetEmail = result.email; document.getElementById("fpDisplayEmail").innerText = fpTargetEmail; document.getElementById("fpRequestForm").classList.add("hidden"); document.getElementById("fpResetForm").classList.remove("hidden"); document.getElementById("fpOtpInput").value = ""; document.getElementById("fpNewPassword").value = ""; document.getElementById("fpConfirmPassword").value = ""; } else { alert(result.message); }
  } catch(err) { alert("Network Error"); } finally { btn.innerHTML = originalText; btn.disabled = false; }
}

async function handleFpReset(e) {
  e.preventDefault(); const p1 = document.getElementById("fpNewPassword").value; const p2 = document.getElementById("fpConfirmPassword").value; if (p1 !== p2) { alert("Passwords do not match!"); return; }
  const btn = document.getElementById("btnFpReset"); const originalText = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...'; btn.disabled = true;
  const payload = { action: "resetPassword", email: fpTargetEmail, otp: document.getElementById("fpOtpInput").value.trim(), newPassword: p1 };
  try {
    const response = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (result.status === "success") { closeForgotPasswordModal(); showSuccessModal("Password reset successfully! You can now login."); document.getElementById("authPassword").value = ""; } else { alert(result.message); }
  } catch(err) { alert("Network Error"); } finally { btn.innerHTML = originalText; btn.disabled = false; }
}

async function switchRole(role) {
  appState.currentRole = role; const empBtn = document.getElementById("roleEmployeeBtn"); const admBtn = document.getElementById("roleAdminBtn");
  if (role === "admin") { admBtn.className = "px-3 py-1 rounded bg-amber-600 text-white font-medium transition"; empBtn.className = "px-3 py-1 rounded text-slate-300 hover:text-white font-medium transition"; await fetchAllCompanyData(); } 
  else { empBtn.className = "px-3 py-1 rounded bg-red-600 text-white font-medium transition"; admBtn.className = "px-3 py-1 rounded text-slate-300 hover:text-white font-medium transition"; appState.trips = [...appState.personalTrips]; appState.expenses = [...appState.personalExpenses]; appState.currentTripId = appState.trips.length > 0 ? appState.trips[0].id : null; renderTripDropdown(); recalcStatsAndRender(); if(!document.getElementById('viewDash').classList.contains('hidden')) renderDashboard(); }
}

async function fetchAllCompanyData() {
  document.getElementById("tripSelect").innerHTML = '<option>Loading company data...</option>';
  try { const payload = { action: "fetchAdminData" }; const r = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }); const res = await r.json(); if(res.status === "success") { appState.trips = res.trips || []; appState.expenses = res.expenses || []; appState.currentTripId = appState.trips.length > 0 ? appState.trips[0].id : null; renderTripDropdown(); recalcStatsAndRender(); if(!document.getElementById('viewDash').classList.contains('hidden')) renderDashboard(); } } catch (e) { alert("Failed to fetch admin data"); renderTripDropdown(); }
}

async function refreshCloudData() {
  const btn = document.getElementById("btnRefreshSync"); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  try { if (appState.currentRole === "admin") { await fetchAllCompanyData(); } else { const res = await (await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "login", loginId: appState.employeeId, password: appState.password }) })).json(); if(res.status === "success") { appState.personalTrips = res.trips || []; appState.personalExpenses = res.expenses || []; appState.trips = [...appState.personalTrips]; appState.expenses = [...appState.personalExpenses]; } renderTripDropdown(); recalcStatsAndRender(); saveStorageData(); if(!document.getElementById('viewDash').classList.contains('hidden')) renderDashboard(); } showSuccessModal("Cloud data synced successfully!"); } catch(e) { alert("Sync failed."); } finally { btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>'; }
}

function checkSession() { const exp = localStorage.getItem("expense_session_expiry"); if (exp && Date.now() < parseInt(exp)) { loadStorageData(); showMainApp(); resetSessionTimer(); } else logout(false); }
function resetSessionTimer() { clearTimeout(sessionTimeoutTracker); localStorage.setItem("expense_session_expiry", Date.now() + (60 * 60 * 1000)); sessionTimeoutTracker = setTimeout(() => logout(false), 60 * 60 * 1000); }
document.addEventListener("mousemove", () => { if(!document.getElementById("mainApp").classList.contains("hidden")) resetSessionTimer(); });
function logout(manual = true) { localStorage.removeItem("expense_session_expiry"); document.getElementById("mainApp").classList.add("hidden"); document.getElementById("mainApp").classList.remove("flex"); document.getElementById("authScreen").classList.remove("hidden"); switchMainTab('log'); }

function showMainApp() {
  document.getElementById("authScreen").classList.add("hidden"); document.getElementById("mainApp").classList.remove("hidden"); document.getElementById("mainApp").classList.add("flex");
  document.getElementById("navEmployeeName").innerText = appState.currentUser;
  if(appState.trips.length === 0 && appState.currentRole !== 'admin') { appState.trips.push({ id: "trip_1", employeeName: appState.currentUser, projectName: "Default Trip", startDate: "2026-01-01", endDate: "2026-01-01", advance: 0 }); appState.currentTripId = "trip_1"; saveStorageData(); }
  if(appState.userRole === "Admin") { document.getElementById("adminControlsContainer").style.display = "flex"; } else { document.getElementById("adminControlsContainer").style.display = "none"; }
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) { document.getElementById('tabDashBtn').classList.add('hidden'); document.getElementById('topNavBar').className = "bg-slate-900 border-t border-slate-800 px-4 sm:px-6 flex space-x-6 pb-2"; switchMainTab('log'); }
  renderTripDropdown(); recalcStatsAndRender();
}

function openProfileModal() { document.getElementById("modalProfileName").value = appState.currentUser; document.getElementById("modalProfileId").value = appState.employeeId; document.getElementById("modalProfileEmail").value = appState.email; document.getElementById("modalProfilePassword").value = appState.password; document.getElementById("profileModal").classList.remove("hidden"); }
function closeProfileModal() { document.getElementById("profileModal").classList.add("hidden"); }
async function handleProfileSubmit(e) { e.preventDefault(); const btn = document.getElementById("btnUpdateProfile"); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; btn.disabled = true; const payload = { action: "updateProfile", oldEmpId: appState.employeeId, name: document.getElementById("modalProfileName").value.trim(), empId: document.getElementById("modalProfileId").value.trim(), email: document.getElementById("modalProfileEmail").value.trim(), password: document.getElementById("modalProfilePassword").value.trim() }; try { const r = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }); const res = await r.json(); if (res.status === "success") { appState.currentUser = payload.name; appState.employeeId = payload.empId; appState.email = payload.email; appState.password = payload.password; document.getElementById("navEmployeeName").innerText = payload.name; saveStorageData(); closeProfileModal(); showSuccessModal("Profile updated!"); } } catch (err) { alert("Network Error"); } finally { btn.innerHTML = "Save"; btn.disabled = false; } }

function loadStorageData() { appState.currentUser = localStorage.getItem("expense_current_user"); appState.employeeId = localStorage.getItem("expense_employee_id"); appState.email = localStorage.getItem("expense_email"); appState.password = localStorage.getItem("expense_password"); appState.userRole = localStorage.getItem("expense_user_role") || "Employee"; try { appState.personalTrips = JSON.parse(localStorage.getItem("expense_trips")) || []; } catch(e){} try { appState.personalExpenses = JSON.parse(localStorage.getItem("expense_records")) || []; } catch(e){} appState.trips = [...appState.personalTrips]; appState.expenses = [...appState.personalExpenses]; appState.currentTripId = localStorage.getItem("expense_active_trip_id") || (appState.trips.length > 0 ? appState.trips[0].id : null); }
function saveStorageData() { if(appState.currentRole === "employee") { appState.personalTrips = [...appState.trips]; appState.personalExpenses = [...appState.expenses]; } localStorage.setItem("expense_current_user", appState.currentUser); localStorage.setItem("expense_employee_id", appState.employeeId); localStorage.setItem("expense_email", appState.email); localStorage.setItem("expense_password", appState.password); localStorage.setItem("expense_user_role", appState.userRole); localStorage.setItem("expense_trips", JSON.stringify(appState.personalTrips)); localStorage.setItem("expense_records", JSON.stringify(appState.personalExpenses)); if (appState.currentTripId) localStorage.setItem("expense_active_trip_id", appState.currentTripId); }
function getTripExpenses() { const trip = appState.trips.find(t => t.id === appState.currentTripId); if (!trip) return []; const tripEmp = (trip.employeeName || "").trim().toLowerCase(); const tripProj = (trip.projectName || "").trim().toLowerCase(); return appState.expenses.filter(e => { const expEmp = (e.employeeName || "").trim().toLowerCase(); const expProj = (e.project || "").trim().toLowerCase(); if (expProj !== tripProj) return false; if (expEmp === tripEmp || expEmp.includes(tripEmp)) return true; return false; }); }

function renderDashboard() {
  document.getElementById('dashUserName').innerText = appState.currentRole === 'admin' ? "Company Overview Dashboard" : `Employee Dashboard — ${appState.currentUser} (ID: ${appState.employeeId})`;
  let totalClaimed = 0; let totalAdvance = 0; let catTotals = { "Travel": 0, "Food": 0, "Rent": 0, "Others": 0 };
  appState.expenses.forEach(e => { let amt = parseFloat(e.amount) || 0; totalClaimed += amt; if (catTotals[e.category] !== undefined) { catTotals[e.category] += amt; } else { catTotals["Others"] += amt; } });
  let tripsData = appState.trips.map(t => { let adv = parseFloat(t.advance) || 0; totalAdvance += adv; let spent = appState.expenses.filter(e => e.project === t.projectName && (e.employeeName === t.employeeName || appState.currentRole !== 'admin')).reduce((sum, e) => sum + (parseFloat(e.amount)||0), 0); return { name: t.projectName, emp: t.employeeName, start: t.startDate, end: t.endDate, adv: adv, spent: spent, net: adv - spent, isActive: t.id === appState.currentTripId }; });
  document.getElementById('dashTotalClaimed').innerText = `₹${totalClaimed.toLocaleString('en-IN', {minimumFractionDigits: 2})}`; document.getElementById('dashTotalAdvance').innerText = `₹${totalAdvance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
  const catLabels = ['Travel', 'Food', 'Rent', 'Others']; const catData = [catTotals['Travel'], catTotals['Food'], catTotals['Rent'], catTotals['Others']];
  
  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#cbd5e1' : '#475569';
  const gridColor = isDark ? '#334155' : '#e2e8f0';

  const ctxCat = document.getElementById('categoryChart').getContext('2d'); if (categoryChartInstance) categoryChartInstance.destroy();
  categoryChartInstance = new Chart(ctxCat, { type: 'doughnut', data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#a855f7'], borderWidth: 0, hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColor, usePointStyle: true, padding: 20 } }, tooltip: { callbacks: { label: function(context) { return ' ₹' + context.parsed.toLocaleString('en-IN'); } } } }, cutout: '65%' } });
  
  const tripLabels = tripsData.map(t => t.name.length > 15 ? t.name.substring(0, 15) + '...' : t.name); const tripData = tripsData.map(t => t.spent);
  const ctxTrip = document.getElementById('tripChart').getContext('2d'); if (tripChartInstance) tripChartInstance.destroy();
  tripChartInstance = new Chart(ctxTrip, { type: 'bar', data: { labels: tripLabels, datasets: [{ label: 'Total Spent (₹)', data: tripData, backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.6 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: textColor }, beginAtZero: true, grid: { borderDash: [2, 4], color: gridColor } }, x: { ticks: { color: textColor }, grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return ' ₹' + context.parsed.y.toLocaleString('en-IN'); } } } } } });
  const formatReadable = (ds) => { try { const d = new Date(ds); if (isNaN(d)) return String(ds).split('T')[0]; return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch(e) { return String(ds).split('T')[0]; } };
  let tbody = document.getElementById('dashTripsTbody'); tbody.innerHTML = "";
  tripsData.sort((a,b) => new Date(b.start) - new Date(a.start)).forEach(tr => { let netText = tr.net > 0 ? `<span class="text-emerald-600 dark:text-emerald-400">+₹${tr.net.toLocaleString('en-IN', {minimumFractionDigits: 2})}<br><span class="text-[10px]">(Return Advance)</span></span>` : tr.net < 0 ? `<span class="text-red-600 dark:text-red-400">-₹${Math.abs(tr.net).toLocaleString('en-IN', {minimumFractionDigits: 2})}<br><span class="text-[10px]">(Company Owes)</span></span>` : `<span class="text-slate-600 dark:text-slate-400">₹0.00</span>`; let statusBadge = tr.isActive ? `<span class="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-bold border border-blue-200 dark:border-blue-800">Active</span>` : `<span class="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">Settled</span>`; let row = `<tr class="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition"><td class="p-3 py-4 text-sm font-bold text-slate-800 dark:text-slate-200">${tr.name}${appState.currentRole==='admin' ? `<br><span class="text-[10px] font-medium text-slate-500 dark:text-slate-400">${tr.emp}</span>` : ''}</td><td class="p-3 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">${formatReadable(tr.start)}<br>to ${formatReadable(tr.end)}</td><td class="p-3 text-sm text-slate-800 dark:text-slate-200 text-right">₹${tr.adv.toLocaleString('en-IN')}</td><td class="p-3 text-sm text-slate-800 dark:text-slate-200 text-right">₹${tr.spent.toLocaleString('en-IN')}</td><td class="p-3 text-sm font-medium text-right">${netText}</td><td class="p-3 text-center align-middle">${statusBadge}</td></tr>`; tbody.innerHTML += row; }); if(tripsData.length === 0) tbody.innerHTML = `<tr><td colspan="6" class="text-center p-6 text-slate-500 dark:text-slate-400 text-sm">No trips recorded yet.</td></tr>`;
}

function renderTripDropdown() {
  const sel = document.getElementById("tripSelect"); sel.innerHTML = "";
  if(appState.trips.length === 0) { sel.innerHTML = `<option value="">-- No Trips --</option>`; document.getElementById("tripDurationDisplay").innerText = "--"; document.getElementById("statAdvanceInput").value = 0; return; }
  appState.trips.forEach(t => { const opt = document.createElement("option"); opt.value = t.id; opt.textContent = appState.currentRole === "admin" ? `${t.employeeName} - ${t.projectName}` : t.projectName; if(t.id === appState.currentTripId) opt.selected=true; sel.appendChild(opt); });
  const trip = appState.trips.find(t=>t.id===appState.currentTripId);
  if(trip) { const formatReadable = (ds) => { try { const d = new Date(ds); if (isNaN(d)) return String(ds).split('T')[0]; return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch(e) { return String(ds).split('T')[0]; } }; document.getElementById("tripDurationDisplay").innerText = `${formatReadable(trip.startDate)} to ${formatReadable(trip.endDate)}`; document.getElementById("statAdvanceInput").value = trip.advance || 0; }
}

function updateTripAdvance(val) { const trip = appState.trips.find(t => t.id === appState.currentTripId); if (trip) { trip.advance = parseFloat(val) || 0; saveStorageData(); recalcStatsAndRender(); fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "saveTrip", trip: trip, oldProjectName: null }) }); showSuccessModal("Advance updated globally!"); } }
function onTripChange() { appState.currentTripId = document.getElementById("tripSelect").value; saveStorageData(); renderTripDropdown(); recalcStatsAndRender(); }

function openTripModal(edit) {
  if(edit && appState.currentTripId) { 
    const t = appState.trips.find(x=>x.id===appState.currentTripId); document.getElementById("modalProjectName").value = t.projectName; 
    const formatInput = (ds) => { try { const d = new Date(ds); if (isNaN(d)) return String(ds).split('T')[0]; return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0') + "-" + String(d.getDate()).padStart(2,'0'); } catch(e) { return String(ds).split('T')[0]; } };
    document.getElementById("modalStartDate").value = formatInput(t.startDate); document.getElementById("modalEndDate").value = formatInput(t.endDate); document.getElementById("modalAdvance").value = t.advance || 0; document.getElementById("modalTripTitle").innerText = "Edit Trip Details"; 
  } else { document.getElementById("modalProjectName").value = ""; document.getElementById("modalAdvance").value = ""; document.getElementById("modalStartDate").value = new Date().toISOString().split("T")[0]; document.getElementById("modalEndDate").value = new Date().toISOString().split("T")[0]; document.getElementById("modalTripTitle").innerText = "Create New Trip"; }
  document.getElementById("tripModal").classList.remove("hidden"); 
}
function closeTripModal() { document.getElementById("tripModal").classList.add("hidden"); }

function handleTripModalSubmit(e) {
  e.preventDefault(); const proj = document.getElementById("modalProjectName").value.trim(), sd = document.getElementById("modalStartDate").value, ed = document.getElementById("modalEndDate").value, adv = parseFloat(document.getElementById("modalAdvance").value) || 0;
  let tripObj = null, oldName = null; const existing = appState.trips.find(t => t.id === appState.currentTripId);
  let targetEmployee = appState.currentUser; if (appState.currentRole === "admin" && existing) { targetEmployee = existing.employeeName; }
  if (existing && document.getElementById("modalTripTitle").innerText.includes("Edit")) { oldName = existing.projectName; existing.projectName = proj; existing.startDate = sd; existing.endDate = ed; existing.advance = adv; tripObj = existing; if(oldName !== proj) appState.expenses.forEach(exp => { if(exp.project === oldName) exp.project = proj; }); } 
  else { tripObj = { id: "trip_"+Date.now(), employeeName: targetEmployee, projectName: proj, startDate: sd, endDate: ed, advance: adv }; appState.trips.push(tripObj); appState.currentTripId = tripObj.id; }
  saveStorageData(); closeTripModal(); renderTripDropdown(); recalcStatsAndRender(); fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "saveTrip", trip: tripObj, oldProjectName: oldName }) });
}

function deleteCurrentTrip() {
  if (!appState.currentTripId) return; const trip = appState.trips.find(t => t.id === appState.currentTripId);
  showConfirmModal("Delete Entire Trip?", `Permanently delete "${trip.projectName}" and ALL its expenses?`, () => {
    const payload = { action: "deleteTrip", employeeName: trip.employeeName, project: trip.projectName };
    appState.trips = appState.trips.filter(t => t.id !== appState.currentTripId); appState.expenses = appState.expenses.filter(e => e.project !== trip.projectName); appState.currentTripId = appState.trips.length > 0 ? appState.trips[0].id : null;
    saveStorageData(); renderTripDropdown(); recalcStatsAndRender(); fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }); showSuccessModal("Trip deleted successfully!");
  });
}

function deleteExpense(expId) {
  const exp = appState.expenses.find(e => e.id === expId); if (!exp) return;
  showConfirmModal("Delete Expense?", "Permanently delete this logged item? This cannot be undone.", () => {
    const payload = { action: "deleteExpense", employeeName: exp.employeeName, project: exp.project, date: exp.date, amount: exp.amount };
    appState.expenses = appState.expenses.filter(e => e.id !== expId); saveStorageData(); recalcStatsAndRender(); fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }); showSuccessModal("Expense removed successfully!");
  });
}

function editExpense(expId) {
  const exp = appState.expenses.find(e => e.id === expId); if (!exp) return;
  appState.editingExpenseId = exp.id;
  document.getElementById('formTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-amber-500 mr-2"></i> Edit Expense';
  const saveBtn = document.getElementById('btnSaveExpense'); saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Update Expense'; saveBtn.className = "w-full bg-amber-500 text-white font-bold py-3 rounded-lg mt-4 shadow hover:bg-amber-600 transition";
  document.getElementById('btnCancelEdit').classList.remove('hidden');
  document.getElementById('fieldDate').value = exp.date; document.getElementById('fieldAmount').value = exp.amountExpr || exp.amount; document.getElementById('fieldPaymentType').value = exp.paymentType; document.getElementById('fieldRemarkNotes').value = exp.remarks === "N/A" ? "" : exp.remarks;
  setExpenseType(exp.category);
  if (exp.category === 'Travel') { document.getElementById('travelOrigin').value = exp.origin !== "N/A" ? exp.origin : ""; document.getElementById('travelDestination').value = exp.destination !== "N/A" ? exp.destination : ""; document.getElementById('travelPurpose').value = exp.purpose || exp.reason || ""; document.getElementById('travelTransportMode').value = exp.transportMode !== "N/A" ? exp.transportMode : "Cab"; } 
  else if (exp.category === 'Food') { const standardReasons = ["Breakfast", "Lunch", "Dinner", "Snacks"]; if (standardReasons.includes(exp.reason)) { document.getElementById('foodReasonSelect').value = exp.reason; handleFoodReasonChange(exp.reason); } else { document.getElementById('foodReasonSelect').value = "Custom"; handleFoodReasonChange("Custom"); document.getElementById('foodCustomReason').value = exp.reason; } } 
  else if (exp.category === 'Rent') { 
    let loc = exp.reason.split(" (")[0] || ""; document.getElementById('rentLocation').value = loc; 
    let bracketContent = exp.reason.match(/\(([^)]+)\)/);
    if(bracketContent && bracketContent[1]) {
      let parts = bracketContent[1].split(" - ");
      if(parts.length > 0) document.getElementById('rentRoomType').value = parts[0];
      if(parts.length > 1) {
         let durationStr = parts[1];
         if (durationStr.includes("Per Day")) { document.getElementById('rentDurationCount').value = "1"; document.getElementById('rentDurationType').value = "Days"; } 
         else if (durationStr.includes("Per Month")) { document.getElementById('rentDurationCount').value = "1"; document.getElementById('rentDurationType').value = "Months"; } 
         else { let valParts = durationStr.split(" "); document.getElementById('rentDurationCount').value = valParts[0] || "1"; document.getElementById('rentDurationType').value = valParts[1] || "Days"; }
      }
    }
  } 
  else { document.getElementById('othersReason').value = exp.reason; }
  
  resetAttachmentUI(); 
  
  if ((exp.billUrl && exp.billUrl !== "No Bill") || exp.billImage) { setExistingAttachmentUI('fileBill', exp.billUrl, exp.billImage); }
  if ((exp.payUrl && exp.payUrl !== "No Payment") || exp.payImage) { setExistingAttachmentUI('filePayment', exp.payUrl, exp.payImage); }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setExistingAttachmentUI(type, url, b64) {
  const activeBtn = document.getElementById(`btn-${type}-img`);
  activeBtn.className = "flex-1 cursor-pointer bg-emerald-500 border border-emerald-600 text-white rounded py-2 text-center shadow-sm transition";
  activeBtn.innerHTML = `<i class="fa-solid fa-circle-check mb-1 block text-sm"></i><span class="text-[9px] font-bold uppercase tracking-wider">Saved</span><input type="file" accept="image/*" onchange="previewImageFile(this, '${type}', 'img')" class="hidden" />`;
  
  document.getElementById(`preview-${type}`).classList.remove("hidden");
  document.getElementById(`preview-name-${type}`).innerText = "View Saved File";
  document.getElementById(`preview-icon-${type}`).className = "fa-solid fa-arrow-up-right-from-square text-emerald-500 dark:text-emerald-400 text-xs";
  
  if (type === 'fileBill') { appState.billPreviewData = { b64: b64, url: url, isPdf: false, name: "View Saved File" }; } 
  else { appState.payPreviewData = { b64: b64, url: url, isPdf: false, name: "View Saved File" }; }
}

function cancelEdit() {
  appState.editingExpenseId = null; document.getElementById('expenseForm').reset(); resetAttachmentUI(); currentCompressedBill = null; currentCompressedPay = null;
  document.getElementById('formTitle').innerHTML = '<i class="fa-solid fa-circle-plus text-red-600 mr-2"></i> Log New Expense';
  const saveBtn = document.getElementById('btnSaveExpense'); saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Save to Database'; saveBtn.className = "w-full bg-red-600 text-white font-bold py-3 rounded-lg mt-4 shadow hover:bg-red-700 transition";
  document.getElementById('btnCancelEdit').classList.add('hidden');
}

async function updateExpenseStatus(expId, newStatus) {
  const exp = appState.expenses.find(e => e.id === expId); if (!exp) return;
  const payload = { action: "updateStatus", employeeName: exp.employeeName, project: exp.project, date: exp.date, amount: exp.amount, status: newStatus };
  exp.status = newStatus; saveStorageData(); recalcStatsAndRender(); fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }).catch(e => console.error("Failed to update status"));
}

function setExpenseType(t) { appState.activeCategory = t; ["Travel","Food","Rent","Others"].forEach(x => { document.getElementById(`fields${x}`).classList.toggle("hidden", x!==t); document.getElementById(`tab-${x}`).className = x===t ? "py-2 rounded-md transition shadow-sm bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 font-bold" : "py-2 rounded-md transition text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"; }); }
function handleFoodReasonChange(val) { const d = document.getElementById("foodCustomReasonDiv"); if (val === "Custom") { d.classList.remove("hidden"); document.getElementById("foodCustomReason").required = true; } else { d.classList.add("hidden"); document.getElementById("foodCustomReason").required = false; } }

let currentCompressedBill = null, currentCompressedPay = null;
function compressImageToJpeg(file) { return new Promise(resolve => { const r = new FileReader(); r.readAsDataURL(file); r.onload = e => { const i = new Image(); i.src = e.target.result; i.onload = () => { const c = document.createElement("canvas"); let w=i.width, h=i.height; if(w>1280||h>1280){if(w>h){h=Math.round((h*1280)/w);w=1280;}else{w=Math.round((w*1280)/h);h=1280;}} c.width=w; c.height=h; c.getContext("2d").drawImage(i,0,0,w,h); resolve(c.toDataURL("image/jpeg",0.72)); }; }; }); }

async function previewImageFile(input, type, subType) { 
  if(input.files && input.files[0]) { 
    const file = input.files[0]; let b64 = null; 
    const isPdf = file.type.includes('pdf') || subType === 'pdf';
    
    if(!isPdf && file.type.startsWith('image/')) { b64 = await compressImageToJpeg(file); } 
    else { b64 = await new Promise(resolve => { const reader = new FileReader(); reader.onload = e => resolve(e.target.result); reader.readAsDataURL(file); }); } 
    
    if(type==='fileBill') { currentCompressedBill = b64; appState.billPreviewData = { b64: b64, url: null, isPdf: isPdf, name: file.name || "Paper_Bill" }; } 
    else { currentCompressedPay = b64; appState.payPreviewData = { b64: b64, url: null, isPdf: isPdf, name: file.name || "Payment_Proof" }; }
    
    const groupColor = type === 'fileBill' ? 'red' : 'blue';
    document.getElementById(`btn-${type}-img`).className = `flex-1 cursor-pointer bg-white dark:bg-slate-700 border border-${groupColor}-200 dark:border-${groupColor}-800 text-${groupColor}-600 dark:text-${groupColor}-400 rounded py-2 text-center shadow-sm hover:bg-${groupColor}-50 dark:hover:bg-slate-600 transition`;
    document.getElementById(`btn-${type}-pdf`).className = `flex-1 cursor-pointer bg-white dark:bg-slate-700 border border-${groupColor}-200 dark:border-${groupColor}-800 text-${groupColor}-600 dark:text-${groupColor}-400 rounded py-2 text-center shadow-sm hover:bg-${groupColor}-50 dark:hover:bg-slate-600 transition`;
    document.getElementById(`btn-${type}-img`).innerHTML = `<i class="fa-solid ${type==='fileBill'?'fa-camera':'fa-image'} mb-1 block text-sm"></i><span class="text-[9px] font-bold uppercase tracking-wider">${type==='fileBill'?'Photo':'Gallery'}</span><input type="file" accept="image/*" onchange="previewImageFile(this, '${type}', 'img')" class="hidden" />`;
    document.getElementById(`btn-${type}-pdf`).innerHTML = `<i class="fa-solid fa-file-pdf mb-1 block text-sm"></i><span class="text-[9px] font-bold uppercase tracking-wider">PDF</span><input type="file" accept="application/pdf" onchange="previewImageFile(this, '${type}', 'pdf')" class="hidden" />`;
    
    const activeBtn = document.getElementById(`btn-${type}-${subType}`);
    activeBtn.className = "flex-1 cursor-pointer bg-emerald-500 border border-emerald-600 text-white rounded py-2 text-center shadow-sm transition";
    activeBtn.innerHTML = `<i class="fa-solid fa-circle-check mb-1 block text-sm"></i><span class="text-[9px] font-bold uppercase tracking-wider">Attached</span><input type="file" accept="${subType==='img'?'image/*':'application/pdf'}" onchange="previewImageFile(this, '${type}', '${subType}')" class="hidden" />`;
    
    document.getElementById(`preview-${type}`).classList.remove("hidden");
    document.getElementById(`preview-name-${type}`).innerText = file.name || "Attachment";
    document.getElementById(`preview-icon-${type}`).className = isPdf ? "fa-solid fa-file-pdf text-red-400 text-xs" : "fa-solid fa-image text-blue-400 text-xs";
  } 
}

function openFullPreview(type) {
  let data = type === 'fileBill' ? appState.billPreviewData : appState.payPreviewData;
  if (!data) return;
  if (data.url && !data.b64 && data.url.includes('http')) { window.open(data.url, '_blank'); return; }
  if (!data.b64) return;
  
  document.getElementById("filePreviewModal").classList.remove("hidden");
  if (data.isPdf) {
    document.getElementById("fullPreviewImg").classList.add("hidden"); document.getElementById("fullPreviewPdf").classList.remove("hidden");
    let src = data.b64.startsWith("data:") ? data.b64 : "data:application/pdf;base64," + data.b64; document.getElementById("fullPreviewPdf").src = src;
  } else {
    document.getElementById("fullPreviewPdf").classList.add("hidden"); document.getElementById("fullPreviewImg").classList.remove("hidden");
    let src = data.b64.startsWith("data:") ? data.b64 : "data:image/jpeg;base64," + data.b64; document.getElementById("fullPreviewImg").src = src;
  }
}

function closeFullPreview() { document.getElementById("filePreviewModal").classList.add("hidden"); document.getElementById("fullPreviewPdf").src = ""; }

function resetAttachmentUI() {
  appState.billPreviewData = null; appState.payPreviewData = null;
  if(document.getElementById('preview-fileBill')) document.getElementById('preview-fileBill').classList.add('hidden');
  if(document.getElementById('preview-filePayment')) document.getElementById('preview-filePayment').classList.add('hidden');
  
  if(!document.getElementById('btn-fileBill-img')) return;
  document.getElementById('btn-fileBill-img').className = "flex-1 cursor-pointer bg-white dark:bg-slate-700 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded py-2 text-center shadow-sm hover:bg-red-50 dark:hover:bg-slate-600 transition";
  document.getElementById('btn-fileBill-pdf').className = "flex-1 cursor-pointer bg-white dark:bg-slate-700 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded py-2 text-center shadow-sm hover:bg-red-50 dark:hover:bg-slate-600 transition";
  document.getElementById('btn-fileBill-img').innerHTML = `<i class="fa-solid fa-camera mb-1 block text-sm"></i><span class="text-[9px] font-bold uppercase tracking-wider">Photo</span><input type="file" accept="image/*" onchange="previewImageFile(this, 'fileBill', 'img')" class="hidden" />`;
  document.getElementById('btn-fileBill-pdf').innerHTML = `<i class="fa-solid fa-file-pdf mb-1 block text-sm"></i><span class="text-[9px] font-bold uppercase tracking-wider">PDF</span><input type="file" accept="application/pdf" onchange="previewImageFile(this, 'fileBill', 'pdf')" class="hidden" />`;
  
  document.getElementById('btn-filePayment-img').className = "flex-1 cursor-pointer bg-white dark:bg-slate-700 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded py-2 text-center shadow-sm hover:bg-blue-50 dark:hover:bg-slate-600 transition";
  document.getElementById('btn-filePayment-pdf').className = "flex-1 cursor-pointer bg-white dark:bg-slate-700 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded py-2 text-center shadow-sm hover:bg-blue-50 dark:hover:bg-slate-600 transition";
  document.getElementById('btn-filePayment-img').innerHTML = `<i class="fa-solid fa-image mb-1 block text-sm"></i><span class="text-[9px] font-bold uppercase tracking-wider">Gallery</span><input type="file" accept="image/*" onchange="previewImageFile(this, 'filePayment', 'img')" class="hidden" />`;
  document.getElementById('btn-filePayment-pdf').innerHTML = `<i class="fa-solid fa-file-pdf mb-1 block text-sm"></i><span class="text-[9px] font-bold uppercase tracking-wider">PDF</span><input type="file" accept="application/pdf" onchange="previewImageFile(this, 'filePayment', 'pdf')" class="hidden" />`;
}

function evaluateMathAmount(expr) { if (!expr) return 0; const clean = expr.toString().replace(/[^0-9+\-*/.]/g, ""); try { const result = Function('"use strict";return (' + clean + ")")(); return isNaN(result) ? 0 : parseFloat(result); } catch (e) { return parseFloat(clean) || 0; } }

async function handleFormSubmit(e) {
  e.preventDefault(); if(appState.trips.length === 0) { showSuccessModal("Please create a Trip first!"); return; }
  const t = appState.trips.find(x=>x.id===appState.currentTripId); const amtExpr = document.getElementById("fieldAmount").value.trim(), evaluatedAmt = evaluateMathAmount(amtExpr);
  let targetEmployeeName = t.employeeName; if (appState.currentRole !== "admin" && !targetEmployeeName.includes("(")) { targetEmployeeName = appState.currentUser + " (" + appState.employeeId + ")"; }
  const isEditing = !!appState.editingExpenseId; const oldExp = isEditing ? appState.expenses.find(x => x.id === appState.editingExpenseId) : null;
  let payload = { id: isEditing ? oldExp.id : "exp_" + Date.now(), tripId: appState.currentTripId, action: isEditing ? "editExpense" : "addExpense", employeeName: targetEmployeeName, project: t.projectName, category: appState.activeCategory, date: document.getElementById("fieldDate").value, amount: evaluatedAmt, amountExpr: amtExpr, paymentType: document.getElementById("fieldPaymentType").value, remarks: document.getElementById("fieldRemarkNotes").value.trim(), billImage: currentCompressedBill, payImage: currentCompressedPay, status: "Pending" };
  if (appState.activeCategory === "Travel") { payload.origin = document.getElementById("travelOrigin").value.trim(); payload.destination = document.getElementById("travelDestination").value.trim(); payload.transportMode = document.getElementById("travelTransportMode").value; payload.purpose = document.getElementById("travelPurpose").value.trim(); payload.reason = payload.purpose || "Travel"; } else if (appState.activeCategory === "Food") { const f = document.getElementById("foodReasonSelect").value; payload.reason = f === "Custom" ? document.getElementById("foodCustomReason").value.trim() : f; } 
  else if (appState.activeCategory === "Rent") { 
    payload.roomLocation = document.getElementById("rentLocation").value.trim(); 
    payload.rentDurationCount = document.getElementById("rentDurationCount").value || "1"; 
    payload.rentType = document.getElementById("rentDurationType").value; 
    payload.roomType = document.getElementById("rentRoomType").value; 
    payload.reason = payload.roomLocation + " (" + payload.roomType + " - " + payload.rentDurationCount + " " + payload.rentType + ")"; 
  } 
  else { payload.reason = document.getElementById("othersReason").value.trim() || "Expense"; }
  if (isEditing) { payload.oldDate = oldExp.date; payload.oldAmount = oldExp.amount; payload.oldProject = oldExp.project; payload.billUrl = oldExp.billUrl; payload.payUrl = oldExp.payUrl; appState.expenses = appState.expenses.map(exp => exp.id === oldExp.id ? payload : exp); cancelEdit(); showSuccessModal("Expense updated locally! Syncing..."); } 
  else { appState.expenses.push(payload); document.getElementById("expenseForm").reset(); resetAttachmentUI(); showSuccessModal("Saved locally! Uploading to cloud..."); }
  saveStorageData(); recalcStatsAndRender(); currentCompressedBill = null; currentCompressedPay = null;
  fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }).then(r => r.json()).then(res => { if(res.status !== "success") console.error("Cloud Error: ", res.message); }).catch(err => console.error("Background sync failed", err));
}

function recalcStatsAndRender() {
  const trip = appState.trips.find(t => t.id === appState.currentTripId); const tripExpenses = getTripExpenses();
  const grandTotal = tripExpenses.reduce((sum, item) => sum + (item.amount || 0), 0); const advance = trip ? (trip.advance || 0) : 0; const net = advance - grandTotal;
  document.getElementById("statTotalItems").innerText = tripExpenses.length; document.getElementById("statTotalExpenses").innerText = `₹${grandTotal.toFixed(2)}`;
  const netEl = document.getElementById("statNetBalance"); const netBadge = document.getElementById("netBalanceBadge"); const netIconBg = document.getElementById("netBalanceIconBg");
  if (net > 0) { netEl.className = "text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1"; netEl.innerText = `₹${net.toFixed(2)}`; netBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"; netBadge.innerText = "Return to Company"; netIconBg.className = "w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center text-xl"; } 
  else if (net < 0) { netEl.className = "text-2xl font-bold text-red-600 dark:text-red-400 mt-1"; netEl.innerText = `₹${Math.abs(net).toFixed(2)}`; netBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"; netBadge.innerText = "Company Owes You"; netIconBg.className = "w-12 h-12 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl flex items-center justify-center text-xl"; } 
  else { netEl.className = "text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1"; netEl.innerText = `₹0.00`; netBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"; netBadge.innerText = "Settled"; netIconBg.className = "w-12 h-12 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-xl flex items-center justify-center text-xl"; }
  renderExpenseTable(tripExpenses);
}

function renderExpenseTable(tripExpenses) {
  const c = document.getElementById("expenseListContainer"); c.innerHTML = ""; const filter = document.getElementById("categoryFilter").value;
  let items = tripExpenses; if(filter !== "All") items = items.filter(e=>e.category === filter);
  items.sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(item => {
    const d = document.createElement("div"); d.className = "p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 rounded-lg flex justify-between items-center transition-colors";
    let attIcon = ""; 
    if (item.billUrl && item.billUrl !== "No Bill") { attIcon += `<a href="${item.billUrl}" target="_blank" class="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 ml-2" title="View Bill"><i class="fa-solid fa-file-invoice"></i></a>`; } else if (item.billImage) { attIcon += `<i class="fa-solid fa-paperclip text-slate-400 ml-2" title="Has Bill"></i>`; }
    if (item.payUrl && item.payUrl !== "No Payment") { attIcon += `<a href="${item.payUrl}" target="_blank" class="text-emerald-500 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 ml-2" title="View Payment"><i class="fa-solid fa-money-bill-wave"></i></a>`; } else if (item.payImage) { attIcon += `<i class="fa-solid fa-paperclip text-slate-400 ml-2" title="Has Payment"></i>`; }
    let statusColor = "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"; let statusText = item.status || "Pending";
    if (statusText === "Approved") statusColor = "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400";
    if (statusText === "Rejected") statusColor = "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
    const statusBadge = `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${statusColor} ml-2">${statusText}</span>`;
    let editBtn = ""; if (statusText === "Pending" || statusText === "Rejected") { editBtn = `<button type="button" onclick="editExpense('${item.id}')" class="text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 text-xs mt-1 transition mr-3" title="Edit Expense"><i class="fa-solid fa-pen"></i></button>`; }
    let adminActions = ""; if (appState.currentRole === "admin" && statusText === "Pending") { adminActions = `<div class="mt-2 flex space-x-2"><button onclick="updateExpenseStatus('${item.id}', 'Approved')" class="text-[10px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition"><i class="fa-solid fa-check mr-1"></i>Approve</button><button onclick="updateExpenseStatus('${item.id}', 'Rejected')" class="text-[10px] bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-900/50 transition"><i class="fa-solid fa-xmark mr-1"></i>Reject</button></div>`; }
    d.innerHTML = `<div><div class="font-bold text-sm flex items-center dark:text-white">${item.category} - ${item.reason} ${attIcon} ${statusBadge}</div><div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">${item.date} | ${appState.currentRole === "admin" ? item.employeeName + " | " : ""}${item.paymentType} ${item.remarks ? `(${item.remarks})` : ""}</div>${adminActions}</div><div class="text-right flex flex-col items-end"><div class="font-bold text-slate-900 dark:text-white">₹${item.amount}</div><div class="flex">${editBtn}<button onclick="deleteExpense('${item.id}')" class="text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-xs mt-1 transition" title="Delete Expense"><i class="fa-solid fa-trash-can"></i></button></div></div>`; c.appendChild(d);
  });
}

async function downloadOrganizedReceiptsZip() {
  const trip = appState.trips.find(t => t.id === appState.currentTripId); const tripExpenses = getTripExpenses();
  const itemsWithImages = tripExpenses.filter(e => e.billImage || e.payImage || (e.billUrl && e.billUrl !== "No Bill") || (e.payUrl && e.payUrl !== "No Payment"));
  if (itemsWithImages.length === 0) { alert("No receipts or payment links have been logged for this trip yet!"); return; }
  const btn = document.getElementById("btnZipExport"); const originalText = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Fetching Files...'; btn.disabled = true;
  const driveUrlsToFetch = [];
  itemsWithImages.forEach(item => {
    if (item.billUrl && item.billUrl.includes("drive.google.com")) driveUrlsToFetch.push(item.billUrl); if (item.payUrl && item.payUrl.includes("drive.google.com")) driveUrlsToFetch.push(item.payUrl);
  });
  let cloudImages = {};
  if (driveUrlsToFetch.length > 0) {
    try { const r = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "fetchImagesForZip", urls: driveUrlsToFetch }) }); const res = await r.json(); if (res.status === "success" && res.images) cloudImages = res.images; } catch(e) { console.error("Cloud fetch failed", e); }
  }
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Zipping...';
  const zip = new JSZip(); const projClean = (trip ? trip.projectName : "Trip").replace(/[^a-zA-Z0-9_-]/g, "_"); const rootFolder = zip.folder(`${projClean}_Receipts`);
  const folderMap = {}; ["Travel", "Food", "Rent", "Others"].forEach(cat => { folderMap[cat] = { bills: rootFolder.folder(cat).folder("Bills"), payments: rootFolder.folder(cat).folder("Payments") }; });
  const nameCounters = {};
  itemsWithImages.forEach(item => {
    const cat = item.category || "Others"; const rawReason = item.reason || "Expense"; const cleanReason = rawReason.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 20);
    const baseKey = `${item.date}_${cleanReason}`; if (!nameCounters[baseKey]) nameCounters[baseKey] = 0; nameCounters[baseKey]++;
    const suffix = nameCounters[baseKey] > 1 ? `_${nameCounters[baseKey]}` : ""; const finalFileBaseName = `${baseKey}${suffix}`;
    const resolveB64AndExt = (localB64, driveUrl) => { 
      let b64Data = null; if (localB64 && localB64.startsWith("data:")) b64Data = localB64.split(",")[1]; else if (driveUrl && cloudImages[driveUrl]) b64Data = cloudImages[driveUrl]; 
      if(!b64Data) return null; let ext = ".jpg"; if(b64Data.startsWith("JVBER")) ext = ".pdf"; else if (b64Data.startsWith("iVBORw")) ext = ".png"; return { b64: b64Data, ext: ext }; 
    };
    const billObj = resolveB64AndExt(item.billImage, item.billUrl); if (billObj) folderMap[cat].bills.file(finalFileBaseName + billObj.ext, billObj.b64, { base64: true });
    const payObj = resolveB64AndExt(item.payImage, item.payUrl); if (payObj) folderMap[cat].payments.file(finalFileBaseName + payObj.ext, payObj.b64, { base64: true });
  });
  const blob = await zip.generateAsync({ type: "blob" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${projClean}_Receipts.zip`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  btn.innerHTML = originalText; btn.disabled = false;
}

function exportToStyledExcel() {
  const trip = appState.trips.find(t => t.id === appState.currentTripId); const tripExpenses = getTripExpenses(); const projName = trip ? trip.projectName : "Trip Expenses";
  const travelItems = tripExpenses.filter(e => e.category === "Travel"); const foodItems = tripExpenses.filter(e => e.category === "Food"); const miscItems = tripExpenses.filter(e => e.category === "Others" || e.category === "Rent");
  const travelSum = travelItems.reduce((acc, i) => acc + i.amount, 0); const foodSum = foodItems.reduce((acc, i) => acc + i.amount, 0); const miscSum = miscItems.reduce((acc, i) => acc + i.amount, 0); const grandTotal = travelSum + foodSum + miscSum; const advance = trip ? (trip.advance || 0) : 0;
  const fontCalibri = { name: "Calibri", sz: 11 }; const borderThin = { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } };
  const styleTitle = { font: { name: "Calibri", sz: 14, bold: true }, alignment: { horizontal: "center", vertical: "center" } }; const styleBannerOrange = { fill: { fgColor: { rgb: "F79646" } }, font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "000000" } }, alignment: { horizontal: "center", vertical: "center" }, border: borderThin }; const styleHeaderBlue = { fill: { fgColor: { rgb: "BDD7EE" } }, font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "000000" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: borderThin }; const styleDataCell = { font: fontCalibri, alignment: { horizontal: "center", vertical: "center" }, border: borderThin }; const styleAmountGreen = { fill: { fgColor: { rgb: "C6EFCE" } }, font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "006100" } }, alignment: { horizontal: "center", vertical: "center" }, border: borderThin }; const styleTotalRed = { fill: { fgColor: { rgb: "FF0000" } }, font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" }, border: borderThin }; const styleSummaryGold = { fill: { fgColor: { rgb: "FFC000" } }, font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "000000" } }, alignment: { horizontal: "center", vertical: "center" }, border: borderThin };
  const wb = XLSX.utils.book_new(); const ws = {}; const merges = []; function setCell(r, c, val, style) { ws[XLSX.utils.encode_cell({ r, c })] = { v: val, t: typeof val === "number" ? "n" : "s", s: style }; }
  setCell(1, 0, `${projName} Expenses Report`, styleTitle); merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 26 } });
  let maxRow = 3;
  let rT = 3; setCell(rT, 0, "Travel Expenses", styleBannerOrange); merges.push({ s: { r: rT, c: 0 }, e: { r: rT, c: 8 } }); rT++; const travelHeaders = ["Date of Travel", "Purpose of Trip", "Origin", "Destination", "Mode of Transport", "Amount", "Total Amount", "Remarks", "Status"]; travelHeaders.forEach((h, idx) => setCell(rT, idx, h, styleHeaderBlue)); rT++;
  if (travelItems.length === 0) { [0,1,2,3,4,5,7,8].forEach(c => setCell(rT, c, "-", styleDataCell)); setCell(rT, 6, 0, styleAmountGreen); rT++; } else { travelItems.forEach(item => { setCell(rT, 0, item.date, styleDataCell); setCell(rT, 1, item.purpose||"-", styleDataCell); setCell(rT, 2, item.origin||"-", styleDataCell); setCell(rT, 3, item.destination||"-", styleDataCell); setCell(rT, 4, item.transportMode||"-", styleDataCell); setCell(rT, 5, item.amountExpr||item.amount, styleDataCell); setCell(rT, 6, item.amount, styleAmountGreen); setCell(rT, 7, item.remarks||item.paymentType||"-", styleDataCell); setCell(rT, 8, item.status||"Pending", styleDataCell); rT++; }); }
  setCell(rT, 5, "Total", styleTotalRed); setCell(rT, 6, travelSum, styleTotalRed); rT++; if(rT > maxRow) maxRow = rT;
  let rF = 3; setCell(rF, 10, "Food Expenses", styleBannerOrange); merges.push({ s: { r: rF, c: 10 }, e: { r: rF, c: 15 } }); rF++; const foodHeaders = ["DATE", "Reason", "Amount", "Remark", "Total", "Status"]; foodHeaders.forEach((h, idx) => setCell(rF, 10 + idx, h, styleHeaderBlue)); rF++;
  if (foodItems.length === 0) { [0,1,2,3,5].forEach(c => setCell(rF, 10 + c, "-", styleDataCell)); setCell(rF, 14, 0, styleAmountGreen); rF++; } else { foodItems.forEach(item => { setCell(rF, 10, item.date, styleDataCell); setCell(rF, 11, item.reason||"-", styleDataCell); setCell(rF, 12, item.amountExpr||item.amount, styleDataCell); setCell(rF, 13, item.remarks||item.paymentType||"-", styleDataCell); setCell(rF, 14, item.amount, styleAmountGreen); setCell(rF, 15, item.status||"Pending", styleDataCell); rF++; }); }
  setCell(rF, 13, "Total", styleTotalRed); setCell(rF, 14, foodSum, styleTotalRed); rF++; if(rF > maxRow) maxRow = rF;
  let rM = 3; setCell(rM, 17, "Miscellaneous & Rent Expenses", styleBannerOrange); merges.push({ s: { r: rM, c: 17 }, e: { r: rM, c: 22 } }); rM++; foodHeaders.forEach((h, idx) => setCell(rM, 17 + idx, h, styleHeaderBlue)); rM++;
  if (miscItems.length === 0) { [0,1,2,3,5].forEach(c => setCell(rM, 17 + c, "-", styleDataCell)); setCell(rM, 21, 0, styleAmountGreen); rM++; } else { miscItems.forEach(item => { setCell(rM, 17, item.date, styleDataCell); setCell(rM, 18, item.reason||"-", styleDataCell); setCell(rM, 19, item.amountExpr||item.amount, styleDataCell); setCell(rM, 20, item.remarks||item.paymentType||"-", styleDataCell); setCell(rM, 21, item.amount, styleAmountGreen); setCell(rM, 22, item.status||"Pending", styleDataCell); rM++; }); }
  setCell(rM, 20, "Total", styleTotalRed); setCell(rM, 21, miscSum, styleTotalRed); rM++; if(rM > maxRow) maxRow = rM;
  let rS = 3; setCell(rS, 24, "S.No", styleHeaderBlue); setCell(rS, 25, "Advance", styleHeaderBlue); setCell(rS, 26, "Amounts", styleHeaderBlue); rS++;
  setCell(rS, 24, 1, styleSummaryGold); setCell(rS, 25, trip ? trip.employeeName : appState.currentUser, styleSummaryGold); setCell(rS, 26, advance, styleAmountGreen); rS += 2;
  setCell(rS, 24, "S.No", styleHeaderBlue); setCell(rS, 25, "Remark", styleHeaderBlue); setCell(rS, 26, "Amounts", styleHeaderBlue); rS++;
  setCell(rS, 24, 1, styleSummaryGold); setCell(rS, 25, "Travel Expenses", styleSummaryGold); setCell(rS, 26, travelSum, styleAmountGreen); rS++;
  setCell(rS, 24, 2, styleSummaryGold); setCell(rS, 25, "Food Expenses", styleSummaryGold); setCell(rS, 26, foodSum, styleAmountGreen); rS++;
  setCell(rS, 24, 3, styleSummaryGold); setCell(rS, 25, "Miscellaneous Expenses", styleSummaryGold); setCell(rS, 26, miscSum, styleAmountGreen); rS++;
  setCell(rS, 24, "", styleTotalRed); setCell(rS, 25, "Total", styleTotalRed); setCell(rS, 26, grandTotal, styleTotalRed); rS++; if(rS > maxRow) maxRow = rS;
  ws["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 4 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 4 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 4 }, { wch: 8 }, { wch: 22 }, { wch: 14 } ];
  ws["!merges"] = merges; ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow + 2, c: 26 } });
  XLSX.utils.book_append_sheet(wb, ws, "Expenses Report"); XLSX.writeFile(wb, `${(projName || "Expense_Report").replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`);
}

if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').then(reg => console.log('App ready for mobile install.')).catch(err => console.error('Service worker failed.', err)); }); }
const DB_URL = "https://racal-fleet-default-rtdb.firebaseio.com";

let selectedVehicleType = "Racal";
let appData = { vehicles: {}, drivers: {}, rentals: {}, expenses: {} };

function showTab(tabId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
  if (tabId === 'profit') renderProfit('today');
}

async function loadAllData() {
  try {
    const res = await fetch(`${DB_URL}/.json`);
    const data = await res.json();
    if (data) {
      appData.vehicles = data.vehicles || {};
      appData.drivers = data.drivers || {};
      appData.rentals = data.rentals || {};
      appData.expenses = data.expenses || {};
    }
    renderUI();
  } catch (err) {
    console.error("Database connection error:", err);
  }
}

async function scanPlatePhoto() {
  const file = document.getElementById('plateCamera').files[0];
  if (!file) return;
  document.getElementById('scanStatus').innerText = "Enhancing & scanning plate...";

  try {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise(resolve => (img.onload = resolve));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const cropX = img.width * 0.14;
    const cropY = img.height * 0.12;
    const cropW = img.width * 0.80;
    const cropH = img.height * 0.76;

    canvas.width = cropW * 3;
    canvas.height = cropH * 3;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const bw = gray < 135 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = bw;
    }
    ctx.putImageData(imgData, 0, 0);

    const worker = await Tesseract.createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
      tessedit_pageseg_mode: '7'
    });

    const result = await worker.recognize(canvas);
    await worker.terminate();

    const cleanText = result.data.text.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
    document.getElementById('plateInput').value = cleanText;
    document.getElementById('scanStatus').innerText = cleanText
      ? "Scan complete! Verify plate & pick Racal or E-Bike:"
      : "Could not read clearly — please type plate below:";
  } catch (err) {
    console.error("Scan error:", err);
    document.getElementById('scanStatus').innerText = "Scanner error — please type plate manually below:";
  }
}

function setType(type) {
  selectedVehicleType = type;
  document.getElementById('btnRacal').classList.toggle('selected', type === 'Racal');
  document.getElementById('btnEbike').classList.toggle('selected', type === 'E-Bike');
}

async function addVehicle() {
  const plate = document.getElementById('plateInput').value.trim().toUpperCase();
  if (!plate) return alert("Please enter or scan a license plate.");
  const newVeh = { plate, type: selectedVehicleType, status: "Available" };
  await fetch(`${DB_URL}/vehicles.json`, { method: 'POST', body: JSON.stringify(newVeh) });
  document.getElementById('plateInput').value = "";
  document.getElementById('scanStatus').innerText = "Saved! Snap another plate or type below:";
  loadAllData();
}

async function addDriver() {
  const name = document.getElementById('driverNameInput').value.trim();
  if (!name) return alert("Please enter a driver name.");
  await fetch(`${DB_URL}/drivers.json`, { method: 'POST', body: JSON.stringify({ name }) });
  document.getElementById('driverNameInput').value = "";
  loadAllData();
}

async function startRental() {
  const driver = document.getElementById('driverSelect').value;
  const vehKey = document.getElementById('vehicleSelect').value;
  if (!driver || !vehKey) return alert("Select both a driver and an available unit.");

  const veh = appData.vehicles[vehKey];
  const rental = {
    driver,
    plate: veh.plate,
    type: veh.type,
    vehKey,
    pickupTime: new Date().toISOString(),
    returnTime: null,
    swaps: 0
  };

  await fetch(`${DB_URL}/rentals.json`, { method: 'POST', body: JSON.stringify(rental) });
  await fetch(`${DB_URL}/vehicles/${vehKey}/status.json`, { method: 'PUT', body: JSON.stringify("Rented") });
  loadAllData();
}

async function addSwap(rentalKey) {
  const newSwaps = (appData.rentals[rentalKey].swaps || 0) + 1;
  await fetch(`${DB_URL}/rentals/${rentalKey}/swaps.json`, { method: 'PUT', body: JSON.stringify(newSwaps) });
  loadAllData();
}

async function returnUnit(rentalKey, vehKey) {
  await fetch(`${DB_URL}/rentals/${rentalKey}/returnTime.json`, { method: 'PUT', body: JSON.stringify(new Date().toISOString()) });
  await fetch(`${DB_URL}/vehicles/${vehKey}/status.json`, { method: 'PUT', body: JSON.stringify("Available") });
  loadAllData();
}

async function addExpense() {
  const desc = document.getElementById('expenseDesc').value.trim();
  const amount = parseFloat(document.getElementById('expenseAmount').value);
  if (!desc || isNaN(amount) || amount <= 0) return alert("Enter valid repair details and cost.");
  await fetch(`${DB_URL}/expenses.json`, {
    method: 'POST',
    body: JSON.stringify({ desc, amount, date: new Date().toISOString() })
  });
  document.getElementById('expenseDesc').value = "";
  document.getElementById('expenseAmount').value = "";
  loadAllData();
}

function renderUI() {
  const dSel = document.getElementById('driverSelect');
  dSel.innerHTML = '<option value="">-- Choose Driver --</option>';
  Object.values(appData.drivers).forEach(d => {
    dSel.innerHTML += `<option value="${d.name}">${d.name}</option>`;
  });

  const vSel = document.getElementById('vehicleSelect');
  vSel.innerHTML = '<option value="">-- Choose Available Unit --</option>';
  Object.entries(appData.vehicles).forEach(([key, v]) => {
    if (v.status === "Available") {
      vSel.innerHTML += `<option value="${key}">${v.plate} (${v.type})</option>`;
    }
  });

  const activeDiv = document.getElementById('activeRentalsList');
  const compDiv = document.getElementById('completedRentalsList');
  activeDiv.innerHTML = "";
  compDiv.innerHTML = "";

  Object.entries(appData.rentals).reverse().forEach(([key, r]) => {
    const pTime = new Date(r.pickupTime).toLocaleString();
    if (!r.returnTime) {
      activeDiv.innerHTML += `
        <div class="card">
          <strong>${r.plate} (${r.type})</strong> — ${r.driver}<br>
          <small>Picked up: ${pTime}</small><br>
          <p>Battery Swaps: <strong>${r.swaps}</strong> (₱${r.swaps * 150})</p>
          <button class="btn-amber" onclick="addSwap('${key}')">+1 Battery Swap (₱150)</button>
          <button class="btn-green" onclick="returnUnit('${key}', '${r.vehKey}')">Return Unit</button>
        </div>`;
    } else {
      const rTime = new Date(r.returnTime).toLocaleString();
      compDiv.innerHTML += `
        <div class="card">
          <strong>${r.plate}</strong> — ${r.driver} | Swaps: ${r.swaps} (₱${r.swaps * 150})<br>
          <small>Out: ${pTime} | In: ${rTime}</small>
        </div>`;
    }
  });

  document.getElementById('fleetList').innerHTML = Object.values(appData.vehicles)
    .map(v => `<div>• <strong>${v.plate}</strong> (${v.type}) — ${v.status}</div>`).join('');
  document.getElementById('driversList').innerHTML = Object.values(appData.drivers)
    .map(d => `<div>• ${d.name}</div>`).join('');
  document.getElementById('expensesList').innerHTML = Object.values(appData.expenses).reverse()
    .map(e => `<div class="card"><strong>₱${e.amount}</strong> — ${e.desc} <small>(${new Date(e.date).toLocaleDateString()})</small></div>`).join('');
}

function renderProfit(period, btn) {
  if (btn) {
    document.querySelectorAll('#profit .btn-toggle').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }
  const now = new Date();
  const isInRange = (isoDate) => {
    const d = new Date(isoDate);
    if (period === 'today') return d.toDateString() === now.toDateString();
    if (period === 'week') return (now - d) / (1000 * 60 * 60 * 24) <= 7;
    if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return true;
  };

  let totalSwaps = 0;
  Object.values(appData.rentals).forEach(r => {
    if (isInRange(r.pickupTime)) totalSwaps += (r.swaps || 0);
  });

  let totalExpenses = 0;
  Object.values(appData.expenses).forEach(e => {
    if (isInRange(e.date)) totalExpenses += (e.amount || 0);
  });

  const gross = totalSwaps * 150;
  const net = gross - totalExpenses;

  document.getElementById('statSwaps').innerText = totalSwaps;
  document.getElementById('statGross').innerText = `₱${gross.toLocaleString()}`;
  document.getElementById('statExpenses').innerText = `- ₱${totalExpenses.toLocaleString()}`;

  const netEl = document.getElementById('statNet');
  netEl.innerText = net < 0 ? `-₱${Math.abs(net).toLocaleString()}` : `₱${net.toLocaleString()}`;
  netEl.style.color = net < 0 ? '#dc2626' : '#16a34a';
}

function exportCSV() {
  let csv = "Plate,Type,Driver,Pickup Time,Return Time,Swaps,Revenue (PHP)\n";
  Object.values(appData.rentals).forEach(r => {
    csv += `"${r.plate}","${r.type}","${r.driver}","${r.pickupTime}","${r.returnTime || 'Active'}",${r.swaps},${r.swaps * 150}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "racal_ebike_report.csv";
  a.click();
}

loadAllData();
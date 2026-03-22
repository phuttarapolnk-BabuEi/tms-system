// 📌 นำ URL จาก Google Apps Script มาวางในเครื่องหมายคำพูดด้านล่างนี้
const API_URL = "https://script.google.com/macros/s/AKfycbxwCOOKsedfJw80Xjknrl9EYYnU6uWH6YHlPgtwlSSvDGTW_dWvRgybcJko-wN5TTfm/exec";

let currentUser = null;
let globalProgressData = [];
let pieChartInstance = null;
let chartUpdateInterval = null;

async function callAPI(action, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload })
    });
    return await response.json();
  } catch (error) {
    console.error("Fetch Error:", error);
    return { status: 'error', message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้" };
  }
}

async function handleLogin() {
  const personalId = document.getElementById('input-personal-id').value.trim();
  if (!personalId) return Swal.fire('แจ้งเตือน', 'กรุณากรอกรหัสประจำตัว', 'warning');

  Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('loginUser', { personalId: personalId });

  if (res.status === 'success') {
    currentUser = res.user;
    Swal.close();
    setupDashboard();
  } else {
    Swal.fire('ข้อผิดพลาด', res.message, 'error');
  }
}

// [แก้ไขบั๊กช่องว่างในสิทธิ์ผู้ใช้]
function setupDashboard() {
  document.getElementById('login-view').classList.remove('d-block');
  document.getElementById('main-nav').style.display = 'block';

  // แปลงให้เป็นตัวพิมพ์ใหญ่และตัดช่องว่างแอบแฝงทิ้ง
  const safeRole = currentUser.role ? currentUser.role.toString().trim().toUpperCase() : 'TRAINEE';

  document.getElementById('display-user-name').innerText = currentUser.name;
  document.getElementById('display-user-role').innerText = safeRole;

  document.querySelectorAll('.app-view').forEach(el => el.classList.remove('d-block'));

  if (safeRole === 'ADMIN' || safeRole === 'STAFF') {
    document.getElementById('admin-view').classList.add('d-block');
    startRealtimeDashboard();
    fetchProgressData();
  } else {
    document.getElementById('trainee-view').classList.add('d-block');
  }
}

function logout() {
  currentUser = null;
  if (chartUpdateInterval) clearInterval(chartUpdateInterval);
  document.getElementById('main-nav').style.display = 'none';
  document.querySelectorAll('.app-view').forEach(el => el.classList.remove('d-block'));
  document.getElementById('login-view').classList.add('d-block');
  document.getElementById('input-personal-id').value = '';
}

async function checkInModal(dayNo, timeSlot) {
  const { value: note } = await Swal.fire({
    title: `ลงเวลา (${timeSlot})`,
    input: 'textarea',
    inputPlaceholder: 'พิมพ์เป้าหมาย/สะท้อนผล...',
    showCancelButton: true,
    confirmButtonText: 'บันทึกเวลา'
  });

  if (note !== undefined) {
    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const res = await callAPI('recordAttendance', { personalId: currentUser.personal_id, dayNo: dayNo, timeSlot: timeSlot, note: note });
    if (res.status === 'success') Swal.fire('สำเร็จ', res.message, 'success');
    else Swal.fire('แจ้งเตือน', res.message, 'warning');
  }
}

async function openSurveyModal() {
  Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('getQuestions', { qType: 'SURVEY' });
  if (res.status === 'success') {
    Swal.close();
    renderSurveyUI(res.data);
  } else {
    Swal.fire('ข้อผิดพลาด', res.message, 'error');
  }
}

function renderSurveyUI(surveyData) {
  const groupedData = surveyData.reduce((acc, curr) => {
    if (!acc[curr.q_category]) acc[curr.q_category] = [];
    acc[curr.q_category].push(curr);
    return acc;
  }, {});

  let html = '<form id="satisfactionForm" class="text-start" style="font-size: 0.95rem;">';
  let sectionNumber = 1;

  for (const [category, questions] of Object.entries(groupedData)) {
    html += `<div class="mt-4 mb-3 border-bottom border-2 border-primary pb-2"><h6 class="fw-bold text-primary mb-0">หมวดที่ ${sectionNumber}: ${category}</h6></div>`;
    questions.forEach((q, index) => {
      html += `<div class="mb-3 p-3 bg-white rounded border shadow-sm"><label class="d-block fw-bold text-dark mb-3">${index + 1}. ${q.question}</label><div class="d-flex justify-content-between px-1 px-md-4">`;
      [5, 4, 3, 2, 1].forEach(score => {
        html += `<div class="form-check text-center m-0 p-0"><input class="form-check-input float-none m-0" type="radio" name="${q.q_id}" value="${score}" required><label class="d-block small mt-1 text-muted">${score}</label></div>`;
      });
      html += `</div></div>`;
    });
    sectionNumber++;
  }
  html += '</form>';

  Swal.fire({
    title: 'แบบประเมินความพึงพอใจ',
    html: html,
    width: '800px',
    showCancelButton: true,
    confirmButtonText: 'ส่งแบบประเมิน',
    customClass: { popup: 'rounded-4 bg-light' },
    preConfirm: () => {
      const form = document.getElementById('satisfactionForm');
      if (!form.checkValidity()) {
        Swal.showValidationMessage('กรุณาตอบแบบประเมินให้ครบ');
        return false;
      }
      return Object.fromEntries(new FormData(form).entries());
    }
  }).then((result) => {
    if (result.isConfirmed) Swal.fire('ขอบคุณครับ!', 'บันทึกเรียบร้อย', 'success');
  });
}

async function fetchPieChartData() {
  const res = await callAPI('getAttendanceSummary');
  if (res.status === 'success') {
    const ctx = document.getElementById('attendancePieChart');
    if (pieChartInstance) pieChartInstance.destroy();
    pieChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: res.labels, datasets: [{ data: res.values, backgroundColor: ['#0d6efd', '#ffc107', '#fd7e14', '#198754'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
    });
    fetchMissingData();
  }
}

function startRealtimeDashboard() {
  fetchPieChartData();
  if (chartUpdateInterval) clearInterval(chartUpdateInterval);
  chartUpdateInterval = setInterval(fetchPieChartData, 30000);
}

async function fetchMissingData() {
  const tbody = document.getElementById('missing-table-body');
  tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4"><div class="spinner-border spinner-border-sm text-danger"></div> โหลด...</td></tr>';
  const res = await callAPI('getMissingPersons', { dayNo: document.getElementById('missing-day').value, timeSlot: document.getElementById('missing-time').value });
  if (res.status === 'success') {
    tbody.innerHTML = res.data.length === 0 ? '<tr><td colspan="3" class="text-center text-success py-3">มาครบทุกคน!</td></tr>' : '';
    res.data.forEach(p => tbody.innerHTML += `<tr><td class="ps-3"><span class="badge bg-light text-dark border">${p.personal_id}</span></td><td>${p.name}</td><td>${p.group}</td></tr>`);
  }
}

async function fetchProgressData() {
  const res = await callAPI('getTraineeProgress');
  if (res.status === 'success') {
    globalProgressData = res.data;
    filterProgressTable();
  }
}

function filterProgressTable() {
  const keyword = document.getElementById('search-progress').value.toLowerCase();
  const filtered = globalProgressData.filter(p => p.name.toLowerCase().includes(keyword) || p.id.toString().includes(keyword));
  const tbody = document.getElementById('progress-table-body');
  tbody.innerHTML = filtered.length === 0 ? '<tr><td colspan="3" class="text-center py-4 text-muted">ไม่พบข้อมูลที่ค้นหา</td></tr>' : '';
  filtered.forEach(p => tbody.innerHTML += `<tr><td class="ps-3"><code>${p.id}</code></td><td>${p.name}</td><td><span class="badge bg-info text-dark">${p.group}</span></td></tr>`);
}

function handleImportCSV() {
  const file = document.getElementById('csvFileInput').files[0];
  if (!file) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์', 'warning');
  const reader = new FileReader();
  Swal.fire({ title: 'กำลังประมวลผล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  reader.onload = async e => {
    const res = await callAPI('importCSV', { csvText: e.target.result });
    if (res.status === 'success') {
      Swal.fire('สำเร็จ', res.message, 'success');
      document.getElementById('csvFileInput').value = '';
    } else {
      Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

async function handleExportCSV() {
  Swal.fire({ title: 'กำลังดึงข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('exportCSV');
  if (res.status === 'success') {
    Swal.close();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF" + res.csvData], { type: 'text/csv;charset=utf-8;' }));
    link.download = res.filename;
    link.click();
  } else {
    Swal.fire('ข้อผิดพลาด', res.message, 'error');
  }
}
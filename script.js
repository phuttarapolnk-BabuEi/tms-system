// ==========================================
// 📌 นำ URL จาก Google Apps Script (Web App URL) มาวางในเครื่องหมายคำพูดด้านล่างนี้
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbxwCOOKsedfJw80Xjknrl9EYYnU6uWH6YHlPgtwlSSvDGTW_dWvRgybcJko-wN5TTfm/exec";

// ==========================================
// 📌 2. ตัวแปรส่วนกลาง (Global State)
// ==========================================
let currentUser = null;

// ตัวแปรสำหรับ Admin/Staff Dashboard
let globalProgressData = [];
let filteredProgressData = [];
let pieChartInstance = null;
let chartUpdateInterval = null;
let currentPage = 1;
const rowsPerPage = 10;

// ตัวแปรสำหรับ Mentor Dashboard
let globalMentorData = [];
let filteredMentorData = [];
let mentorChartInstance = null;
let mentorCurrentPage = 1;

// ==========================================
// 📌 3. ฟังก์ชันสื่อสารกับ Backend (API Client)
// ==========================================
async function callAPI(action, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload })
    });
    return await response.json();
  } catch (error) {
    return { status: 'error', message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต" };
  }
}

// ==========================================
// 📌 4. ระบบยืนยันตัวตนและการเข้าถึง (Auth & Routing)
// ==========================================
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

function setupDashboard() {
  document.getElementById('login-view').classList.remove('d-block');
  document.getElementById('main-nav').style.display = 'block';

  // ล้างช่องว่างและปรับเป็นตัวพิมพ์ใหญ่ป้องกันบั๊กจากไฟล์ CSV
  const safeRole = currentUser.role ? currentUser.role.toString().trim().toUpperCase() : 'TRAINEE';

  document.getElementById('display-user-name').innerText = currentUser.name;
  document.getElementById('display-user-role').innerText = safeRole;

  // ปิดทุกหน้าจอไปก่อน
  document.querySelectorAll('.app-view').forEach(el => el.classList.remove('d-block'));

  // 🔀 ตรรกะการแยกหน้าจอ (Routing Logic)
  if (safeRole === 'ADMIN' || safeRole === 'STAFF') {
    document.getElementById('admin-view').classList.add('d-block');
    startRealtimeDashboard();
    fetchProgressData();

    // STAFF จะมองไม่เห็นแท็บจัดการข้อมูล (CRUD)
    const crudMenu = document.getElementById('nav-crud-menu');
    const statsTabBtn = document.querySelector('a[href="#stats"]');
    if (safeRole === 'STAFF') {
      crudMenu.classList.add('d-none');
      if (statsTabBtn) statsTabBtn.click(); // บังคับให้สลับมาแท็บสถิติเสมอ
    } else {
      crudMenu.classList.remove('d-none');
    }

  } else if (safeRole === 'MENTOR') {
    document.getElementById('mentor-view').classList.add('d-block');
    fetchMentorData();

  } else {
    // สำหรับ TRAINEE (ผู้เข้าอบรม)
    document.getElementById('trainee-view').classList.add('d-block');
    loadAttendanceUI(); // โหลดปุ่มลงเวลาตามช่วงเวลาจริงของเซิร์ฟเวอร์
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

// ==========================================
// 📌 5. ระบบของผู้เข้าอบรม (Trainee Features)
// ==========================================

// [ระบบสร้างปุ่มลงเวลาอัตโนมัติตาม Server Time]
async function loadAttendanceUI() {
  const container = document.getElementById('attendance-buttons-container');
  if (!container) return; // ดักจับเผื่อหา div ไม่เจอ

  container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-success"></div> <span class="small text-muted">กำลังซิงค์เวลาเซิร์ฟเวอร์...</span></div>';

  const res = await callAPI('getAttendanceConfig');

  if (res.status === 'success') {
    container.innerHTML = '';
    const { schedule, serverDate, serverTime } = res;

    schedule.forEach(day => {
      let html = `<div class="mb-3 border-bottom pb-2">
                    <h6 class="fw-bold text-secondary mb-2">วันที่ ${day.dayNo} <span class="small fw-normal text-muted">(${day.date})</span></h6>
                    <div class="d-flex flex-wrap gap-2">`;

      day.slots.forEach(slot => {
        // เงื่อนไข: วันที่ต้องตรงกัน และเวลาต้องอยู่ระหว่าง start ถึง end
        const isToday = (day.date === serverDate);
        const isTimeValid = (serverTime >= slot.start && serverTime <= slot.end);
        const isActive = isToday && isTimeValid;

        if (isActive) {
          // ปุ่มสีเขียว (กดได้)
          html += `<button class="btn btn-success shadow-sm rounded-pill px-3" onclick="checkInModal('${day.dayNo}', '${slot.id}')">
                     <i class="bi bi-check-circle-fill"></i> ${slot.label} <br><small class="fw-normal">${slot.start} - ${slot.end}</small>
                   </button>`;
        } else {
          // ปุ่มสีเทา (กดไม่ได้)
          html += `<button class="btn btn-outline-secondary rounded-pill px-3 opacity-50" disabled>
                     <i class="bi bi-lock-fill"></i> ${slot.label} <br><small class="fw-normal">${slot.start} - ${slot.end}</small>
                   </button>`;
        }
      });
      html += `</div></div>`;
      container.innerHTML += html;
    });
  } else {
    container.innerHTML = `<div class="text-danger small"><i class="bi bi-exclamation-triangle"></i> โหลดตารางเวลาไม่สำเร็จ: ${res.message}</div>`;
  }
}

// [ฟังก์ชันส่งบันทึกเวลา]
async function checkInModal(dayNo, timeSlot) {
  const { value: note } = await Swal.fire({
    title: `ลงเวลา (${timeSlot})`,
    input: 'textarea',
    inputPlaceholder: 'พิมพ์เป้าหมาย / การสะท้อนผล...',
    showCancelButton: true,
    confirmButtonText: '<i class="bi bi-save"></i> บันทึกข้อมูล'
  });

  if (note !== undefined) {
    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const res = await callAPI('recordAttendance', { personalId: currentUser.personal_id, dayNo: dayNo, timeSlot: timeSlot, note: note });
    if (res.status === 'success') {
      Swal.fire('สำเร็จ', res.message, 'success');
      loadAttendanceUI(); // โหลด UI ใหม่เผื่อเวลาหมดพอดี
    } else {
      Swal.fire('แจ้งเตือน', res.message, 'warning');
    }
  }
}

// [ระบบสร้างแบบประเมินอัตโนมัติ (Dynamic Survey)]
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
    title: 'แบบประเมินความพึงพอใจโครงการ',
    html: html,
    width: '800px',
    showCancelButton: true,
    confirmButtonText: 'ส่งแบบประเมิน',
    customClass: { popup: 'rounded-4 bg-light' },
    preConfirm: () => {
      const form = document.getElementById('satisfactionForm');
      if (!form.checkValidity()) {
        Swal.showValidationMessage('กรุณาตอบแบบประเมินให้ครบทุกข้อ');
        return false;
      }
      return Object.fromEntries(new FormData(form).entries());
    }
  }).then((result) => {
    if (result.isConfirmed) Swal.fire('ขอบคุณครับ!', 'ระบบบันทึกผลการประเมินของคุณเรียบร้อยแล้ว', 'success');
  });
}

// ==========================================
// 📌 6. ระบบของวิทยากรพี่เลี้ยง (Mentor Features)
// ==========================================
async function fetchMentorData() {
  const tbody = document.getElementById('mentor-table-body');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div> กำลังดึงข้อมูลกลุ่มของท่าน...</td></tr>';

  const res = await callAPI('getMentorData', { mentorId: currentUser.personal_id });
  if (res.status === 'success') {
    globalMentorData = res.data;
    renderMentorChart();
    filterMentorTable();
  } else {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">เกิดข้อผิดพลาด: ${res.message}</td></tr>`;
  }
}

function renderMentorChart() {
  const counts = { 'Morning': 0, 'Afternoon': 0, 'Evening': 0, 'Checkout': 0 };
  globalMentorData.forEach(log => { if (counts[log.time_slot] !== undefined) counts[log.time_slot]++; });

  const ctx = document.getElementById('mentorBarChart');
  if (mentorChartInstance) mentorChartInstance.destroy();

  mentorChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['รอบเช้า', 'รอบบ่าย', 'รอบเย็น', 'สะท้อนผล'],
      datasets: [{
        label: 'ยอดการลงเวลาของกลุ่ม (ครั้ง)',
        data: [counts.Morning, counts.Afternoon, counts.Evening, counts.Checkout],
        backgroundColor: ['#0d6efd', '#ffc107', '#fd7e14', '#198754'],
        borderRadius: 5
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}

function filterMentorTable() {
  const keyword = document.getElementById('mentor-search').value.toLowerCase();
  const filterDay = document.getElementById('mentor-filter-day').value;
  const filterTime = document.getElementById('mentor-filter-time').value;

  filteredMentorData = globalMentorData.filter(log => {
    const matchKey = log.name.toLowerCase().includes(keyword) || log.personal_id.toString().includes(keyword);
    const matchDay = filterDay === 'ALL' || log.day_no.toString() === filterDay;
    const matchTime = filterTime === 'ALL' || log.time_slot === filterTime;
    return matchKey && matchDay && matchTime;
  });

  mentorCurrentPage = 1;
  renderMentorPaginatedTable();
}

function renderMentorPaginatedTable() {
  const tbody = document.getElementById('mentor-table-body');
  tbody.innerHTML = '';

  if (filteredMentorData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">ไม่พบประวัติการลงเวลาในเงื่อนไขที่ค้นหา</td></tr>';
    document.getElementById('mentor-pagination-info').innerText = 'ไม่พบข้อมูล';
    document.getElementById('mentor-pagination-controls').innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filteredMentorData.length / rowsPerPage);
  const startIdx = (mentorCurrentPage - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const paginatedItems = filteredMentorData.slice(startIdx, endIdx);
  const timeTranslates = { 'Morning': 'เช้า', 'Afternoon': 'บ่าย', 'Evening': 'เย็น', 'Checkout': 'สะท้อนผล' };

  paginatedItems.forEach(log => {
    tbody.innerHTML += `<tr><td class="ps-3"><code>${log.personal_id}</code></td><td>${log.name}</td><td>วันที่ ${log.day_no}</td><td><span class="badge bg-secondary">${timeTranslates[log.time_slot] || log.time_slot}</span></td><td class="small text-muted">${log.timestamp}</td></tr>`;
  });

  document.getElementById('mentor-pagination-info').innerText = `แสดง ${startIdx + 1} ถึง ${Math.min(endIdx, filteredMentorData.length)} จาก ${filteredMentorData.length} รายการ`;

  const ul = document.getElementById('mentor-pagination-controls');
  ul.innerHTML = '';
  ul.innerHTML += `<li class="page-item ${mentorCurrentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changeMentorPage(${mentorCurrentPage - 1}); return false;">ก่อนหน้า</a></li>`;
  for (let i = 1; i <= totalPages; i++) {
    ul.innerHTML += `<li class="page-item ${i === mentorCurrentPage ? 'active' : ''}"><a class="page-link" href="#" onclick="changeMentorPage(${i}); return false;">${i}</a></li>`;
  }
  ul.innerHTML += `<li class="page-item ${mentorCurrentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changeMentorPage(${mentorCurrentPage + 1}); return false;">ถัดไป</a></li>`;
}

function changeMentorPage(page) {
  const totalPages = Math.ceil(filteredMentorData.length / rowsPerPage);
  if (page < 1 || page > totalPages) return;
  mentorCurrentPage = page;
  renderMentorPaginatedTable();
}

// ==========================================
// 📌 7. ระบบของ Admin / Staff (Dashboard สถิติ)
// ==========================================
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
  tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4"><div class="spinner-border spinner-border-sm text-danger"></div> โหลดข้อมูลคนขาด...</td></tr>';
  const res = await callAPI('getMissingPersons', { dayNo: document.getElementById('missing-day').value, timeSlot: document.getElementById('missing-time').value });
  if (res.status === 'success') {
    tbody.innerHTML = res.data.length === 0 ? '<tr><td colspan="3" class="text-center text-success py-3"><i class="bi bi-check-circle-fill"></i> มาครบทุกคน!</td></tr>' : '';
    res.data.forEach(p => tbody.innerHTML += `<tr><td class="ps-3"><span class="badge bg-light text-dark border">${p.personal_id}</span></td><td>${p.name}</td><td>${p.group}</td></tr>`);
  }
}

// [ตารางความก้าวหน้า Pagination & Filter]
async function fetchProgressData() {
  const res = await callAPI('getTraineeProgress');
  if (res.status === 'success') { globalProgressData = res.data; filterProgressTable(); }
}

function filterProgressTable() {
  const keyword = document.getElementById('search-progress').value.toLowerCase();
  const selectedGroup = document.getElementById('filter-group-target').value;
  filteredProgressData = globalProgressData.filter(p => {
    const matchKeyword = p.name.toLowerCase().includes(keyword) || p.id.toString().includes(keyword);
    const matchGroup = selectedGroup === 'ALL' || p.group.toString() === selectedGroup;
    return matchKeyword && matchGroup;
  });
  currentPage = 1;
  renderPaginatedTable();
}

function renderPaginatedTable() {
  const tbody = document.getElementById('progress-table-body');
  tbody.innerHTML = '';
  if (filteredProgressData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">ไม่พบข้อมูลผู้เข้าอบรม</td></tr>';
    document.getElementById('pagination-info').innerText = 'ไม่พบข้อมูล';
    document.getElementById('pagination-controls').innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filteredProgressData.length / rowsPerPage);
  const startIdx = (currentPage - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const paginatedItems = filteredProgressData.slice(startIdx, endIdx);

  paginatedItems.forEach(p => { tbody.innerHTML += `<tr><td class="ps-3"><code>${p.id}</code></td><td>${p.name}</td><td><span class="badge bg-info text-dark">กลุ่ม ${p.group}</span></td></tr>`; });
  document.getElementById('pagination-info').innerText = `แสดง ${startIdx + 1} ถึง ${Math.min(endIdx, filteredProgressData.length)} จากทั้งหมด ${filteredProgressData.length} รายการ`;
  renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
  const ul = document.getElementById('pagination-controls');
  ul.innerHTML = '';
  ul.innerHTML += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changePage(${currentPage - 1}); return false;">ก่อนหน้า</a></li>`;
  for (let i = 1; i <= totalPages; i++) { ul.innerHTML += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a></li>`; }
  ul.innerHTML += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changePage(${currentPage + 1}); return false;">ถัดไป</a></li>`;
}

function changePage(page) {
  const totalPages = Math.ceil(filteredProgressData.length / rowsPerPage);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderPaginatedTable();
}

// ==========================================
// 📌 8. ระบบจัดการข้อมูล นำเข้า/ส่งออก (CRUD สำหรับ Admin)
// ==========================================
function handleImportCSV() {
  const file = document.getElementById('csvFileInput').files[0];
  if (!file) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์ .csv', 'warning');
  const reader = new FileReader();
  Swal.fire({ title: 'กำลังนำเข้าข้อมูลลงฐานข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  reader.onload = async e => {
    const res = await callAPI('importCSV', { csvText: e.target.result });
    if (res.status === 'success') { Swal.fire('สำเร็จ', res.message, 'success'); document.getElementById('csvFileInput').value = ''; }
    else { Swal.fire('เกิดข้อผิดพลาด', res.message, 'error'); }
  };
  reader.readAsText(file, 'UTF-8');
}

async function handleExportCSV() {
  Swal.fire({ title: 'กำลังรวบรวมข้อมูลเพื่อสร้างไฟล์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('exportCSV');
  if (res.status === 'success') {
    Swal.close();
    // เพิ่ม \uFEFF บังคับให้ Excel เปิดไฟล์เป็น UTF-8 เพื่อป้องกันภาษาไทยเพี้ยน
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF" + res.csvData], { type: 'text/csv;charset=utf-8;' }));
    link.download = res.filename;
    link.click();
  } else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
}
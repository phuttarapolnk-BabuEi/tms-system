// ==========================================
// 📌 นำ URL จาก Google Apps Script (Web App URL) มาวางในเครื่องหมายคำพูดด้านล่างนี้
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbxwCOOKsedfJw80Xjknrl9EYYnU6uWH6YHlPgtwlSSvDGTW_dWvRgybcJko-wN5TTfm/exec"; 

// ==========================================
// Global State (ตัวแปรส่วนกลางที่จำค่าไว้ใช้ข้ามฟังก์ชัน)
// ==========================================
let currentUser = null;          // เก็บข้อมูลคนที่ล็อกอินอยู่ {id, name, role}
let globalProgressData = [];     // เก็บข้อมูลดิบของตาราง Progress ทั้งหมด
let filteredProgressData = [];   // เก็บข้อมูลหลังจากการถูกกรอง (Search/Filter)
let pieChartInstance = null;     // เก็บ Instance กราฟเพื่อเอาไว้ Destroy ก่อนวาดใหม่ ป้องกันกราฟซ้อนทับ
let chartUpdateInterval = null;  // ตัวแปรตั้งเวลา Auto Refresh

// ตัวแปรสำหรับตั้งค่าระบบแบ่งหน้าตาราง (Pagination)
let currentPage = 1;             // หน้าปัจจุบัน
const rowsPerPage = 10;          // จำนวนแถวที่จะแสดงต่อ 1 หน้า

// ==========================================
// 1. API Client (ตัวกลางสื่อสารกับ Backend)
// ==========================================
// ใช้ async/await ทำให้สามารถรอข้อมูลจากเซิร์ฟเวอร์ก่อนทำงานบรรทัดถัดไปได้
async function callAPI(action, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      // ใช้ text/plain เพื่อป้องกันเบราว์เซอร์ส่ง OPTIONS (CORS Preflight) ไปบล็อกการเชื่อมต่อของ Google
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload })
    });
    return await response.json(); // แปลงผลลัพธ์จาก Text เป็น JSON Object
  } catch (error) {
    return { status: 'error', message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้" };
  }
}

// ==========================================
// 2. Authentication & Authorization (ระบบล็อกอินและสิทธิ์)
// ==========================================
async function handleLogin() {
  const personalId = document.getElementById('input-personal-id').value.trim();
  if (!personalId) return Swal.fire('แจ้งเตือน', 'กรุณากรอกรหัสประจำตัว', 'warning');

  // แสดงอนิเมชั่นโหลด ป้องกันผู้ใช้กดปุ่มรัวๆ
  Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  
  // เรียก API เพื่อขอ Login
  const res = await callAPI('loginUser', { personalId: personalId });

  if (res.status === 'success') {
    currentUser = res.user; // เก็บข้อมูลผู้ใช้ลง Global State
    Swal.close();
    setupDashboard();       // ไปจัดหน้าจอตามสิทธิ์
  } else {
    Swal.fire('ข้อผิดพลาด', res.message, 'error');
  }
}

// ฟังก์ชันจัดหน้าจอ (Single Page Application Router)
function setupDashboard() {
  // ซ่อนหน้า Login และแสดง Navbar
  document.getElementById('login-view').classList.remove('d-block');
  document.getElementById('main-nav').style.display = 'block';
  
  // แปลงให้เป็นตัวพิมพ์ใหญ่และตัดช่องว่างแอบแฝงทิ้ง (ป้องกันบั๊กจากไฟล์ CSV)
  const safeRole = currentUser.role ? currentUser.role.toString().trim().toUpperCase() : 'TRAINEE';
  
  // พิมพ์ชื่อขึ้น Navbar
  document.getElementById('display-user-name').innerText = currentUser.name;
  document.getElementById('display-user-role').innerText = safeRole;

  // เคลียร์ทุก View ให้ซ่อนไปก่อน (Reset State)
  document.querySelectorAll('.app-view').forEach(el => el.classList.remove('d-block'));
  
  // Routing: ตัดสินใจว่าจะโชว์หน้าไหนตาม Role
  if (safeRole === 'ADMIN' || safeRole === 'STAFF') {
    document.getElementById('admin-view').classList.add('d-block');
    startRealtimeDashboard(); // สั่งรันกราฟแบบ Auto-refresh
    fetchProgressData();      // ดึงตารางความก้าวหน้า

    // 🔴 ระบบจัดการสิทธิ์เชิงลึก: ถ้าเป็นแค่ STAFF ห้ามเห็นเมนูจัดการข้อมูล
    if (safeRole === 'STAFF') {
      document.getElementById('nav-crud-menu').style.display = 'none'; 
      document.getElementById('crud').classList.remove('show', 'active');
    } else {
      document.getElementById('nav-crud-menu').style.display = 'block'; 
    }
  } else {
    // ถ้าไม่ใช่ Admin/Staff ก็ให้เข้าหน้า Trainee
    document.getElementById('trainee-view').classList.add('d-block');
  }
}

// ฟังก์ชันออกจากระบบ (ล้างค่าทั้งหมดแล้วเด้งกลับหน้า Login)
function logout() {
  currentUser = null;
  if (chartUpdateInterval) clearInterval(chartUpdateInterval); // หยุดการดึงกราฟอัตโนมัติ (ประหยัดเน็ต)
  document.getElementById('main-nav').style.display = 'none';
  document.querySelectorAll('.app-view').forEach(el => el.classList.remove('d-block'));
  document.getElementById('login-view').classList.add('d-block');
  document.getElementById('input-personal-id').value = '';
}

// ==========================================
// 3. ฟังก์ชันผู้เข้าอบรม (Trainee Actions)
// ==========================================
async function checkInModal(dayNo, timeSlot) {
  // ใช้ SweetAlert สร้าง Modal ให้กรอกเป้าหมายแบบด่วน
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

// [ระบบสร้างแบบประเมินอัตโนมัติ (Dynamic Form Rendering)]
async function openSurveyModal() {
  Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('getQuestions', { qType: 'SURVEY' });
  if (res.status === 'success') {
    Swal.close();
    renderSurveyUI(res.data); // โยนข้อมูล JSON เข้าไปสร้าง HTML
  } else {
    Swal.fire('ข้อผิดพลาด', res.message, 'error');
  }
}

function renderSurveyUI(surveyData) {
  // Algorithm จัดกลุ่มคำถามตามหมวดหมู่ (q_category) ด้วย Array.reduce
  const groupedData = surveyData.reduce((acc, curr) => {
    if (!acc[curr.q_category]) acc[curr.q_category] = []; // ถ้ายังไม่มีหมวดนี้ให้สร้าง Array เปล่า
    acc[curr.q_category].push(curr); // ดันคำถามเข้าไปในหมวดนั้น
    return acc;
  }, {});

  // เริ่มต่อ String เพื่อสร้างโครงสร้าง HTML ของแบบฟอร์ม
  let html = '<form id="satisfactionForm" class="text-start" style="font-size: 0.95rem;">';
  let sectionNumber = 1;

  // วนลูป Object ที่จัดหมวดหมู่เสร็จแล้ว [key, value]
  for (const [category, questions] of Object.entries(groupedData)) {
    // พิมพ์หัวข้อของหมวดนั้น (เช่น หมวดที่ 1: ด้านสถานที่)
    html += `<div class="mt-4 mb-3 border-bottom border-2 border-primary pb-2"><h6 class="fw-bold text-primary mb-0">หมวดที่ ${sectionNumber}: ${category}</h6></div>`;
    
    // วนลูปสร้างคำถามแต่ละข้อในหมวดนั้น
    questions.forEach((q, index) => {
      html += `<div class="mb-3 p-3 bg-white rounded border shadow-sm"><label class="d-block fw-bold text-dark mb-3">${index + 1}. ${q.question}</label><div class="d-flex justify-content-between px-1 px-md-4">`;
      
      // สร้างปุ่ม Radio 5 ตัวเลือก (5 ถึง 1)
      [5, 4, 3, 2, 1].forEach(score => {
        // แอตทริบิวต์ name="${q.q_id}" จะถูกใช้เป็น Key ตอนส่งข้อมูลกลับ
        html += `<div class="form-check text-center m-0 p-0"><input class="form-check-input float-none m-0" type="radio" name="${q.q_id}" value="${score}" required><label class="d-block small mt-1 text-muted">${score}</label></div>`;
      });
      html += `</div></div>`;
    });
    sectionNumber++;
  }
  html += '</form>';

  // โชว์ฟอร์มที่วาดเสร็จแล้วบน SweetAlert Modal
  Swal.fire({
    title: 'แบบประเมินความพึงพอใจ',
    html: html,
    width: '800px',
    showCancelButton: true,
    confirmButtonText: 'ส่งแบบประเมิน',
    customClass: { popup: 'rounded-4 bg-light' },
    preConfirm: () => {
      const form = document.getElementById('satisfactionForm');
      // ตรวจสอบว่าเลือกครบทุกข้อหรือไม่ (ทำงานคู่กับ attr `required` ใน HTML)
      if (!form.checkValidity()) {
        Swal.showValidationMessage('กรุณาตอบแบบประเมินให้ครบทุกข้อครับ');
        return false;
      }
      // รวบรวมคำตอบจากฟอร์มให้กลายเป็น Object ก้อนเดียว
      return Object.fromEntries(new FormData(form).entries());
    }
  }).then((result) => {
    // ตรงนี้คือจุดที่สามารถเอา result.value ไปเขียนโค้ดเรียก API ส่งกลับไปเซฟลง DB ได้ครับ
    if (result.isConfirmed) Swal.fire('ขอบคุณครับ!', 'บันทึกผลการประเมินเรียบร้อย', 'success');
  });
}

// ==========================================
// 4. แดชบอร์ดและสถิติ (Admin / Staff Actions)
// ==========================================

// [วาดกราฟวงกลมด้วย Chart.js]
async function fetchPieChartData() {
  const res = await callAPI('getAttendanceSummary');
  if (res.status === 'success') {
    const ctx = document.getElementById('attendancePieChart');
    if (pieChartInstance) pieChartInstance.destroy(); // ทำลายกราฟเก่าทิ้งป้องกันการกระพริบซ้อนกัน
    pieChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: res.labels, datasets: [{ data: res.values, backgroundColor: ['#0d6efd', '#ffc107', '#fd7e14', '#198754'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%' } // cutout ทำให้รูตรงกลางใหญ่ขึ้น
    });
    fetchMissingData(); // ให้ดึงตารางคนขาดควบคู่กับตอนอัปเดตกราฟเสมอ
  }
}

// ตั้งค่าให้โหลดข้อมูลใหม่ทุกๆ 30 วินาทีแบบเนียนๆ เบื้องหลัง (Long Polling)
function startRealtimeDashboard() {
  fetchPieChartData();
  if (chartUpdateInterval) clearInterval(chartUpdateInterval);
  chartUpdateInterval = setInterval(fetchPieChartData, 30000); 
}

// [ตารางค้นหาคนขาด (Missing Persons)]
async function fetchMissingData() {
  const tbody = document.getElementById('missing-table-body');
  tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4"><div class="spinner-border spinner-border-sm text-danger"></div> โหลด...</td></tr>';
  
  const res = await callAPI('getMissingPersons', { dayNo: document.getElementById('missing-day').value, timeSlot: document.getElementById('missing-time').value });
  if (res.status === 'success') {
    tbody.innerHTML = res.data.length === 0 ? '<tr><td colspan="3" class="text-center text-success py-3">มาครบทุกคน!</td></tr>' : '';
    res.data.forEach(p => tbody.innerHTML += `<tr><td class="ps-3"><span class="badge bg-light text-dark border">${p.personal_id}</span></td><td>${p.name}</td><td>${p.group}</td></tr>`);
  }
}

// ==========================================
// 5. ระบบตารางความก้าวหน้า + Pagination + Filter
// ==========================================
// ดึงข้อมูลครั้งแรกครั้งเดียว (โหลดก้อนใหญ่มาเก็บไว้ที่ Client เพื่อให้ Search ได้ไวระดับเสี้ยววินาที)
async function fetchProgressData() {
  const res = await callAPI('getTraineeProgress');
  if (res.status === 'success') {
    globalProgressData = res.data; // เก็บข้อมูลดิบทั้งหมด
    filterProgressTable(); // สั่งให้เริ่มทำงานกระบวนการ กรอง -> จัดหน้า -> วาด
  }
}

// กลไกที่ 1: กรองข้อมูลตามคำค้นหา (Keyword) และ Dropdown กลุ่ม
function filterProgressTable() {
  const keyword = document.getElementById('search-progress').value.toLowerCase();
  const selectedGroup = document.getElementById('filter-group-target').value;

  // กรองจาก Array โดยตรง (ใช้ความเร็วของเบราว์เซอร์แทนการยิง API)
  filteredProgressData = globalProgressData.filter(p => {
    const matchKeyword = p.name.toLowerCase().includes(keyword) || p.id.toString().includes(keyword);
    const matchGroup = selectedGroup === 'ALL' || p.group.toString() === selectedGroup;
    return matchKeyword && matchGroup;
  });

  currentPage = 1; // เมื่อมีการค้นหาใหม่ ให้รีเซ็ตกลับไปแสดงหน้าแรกเสมอ
  renderPaginatedTable();
}

// กลไกที่ 2: วาดตารางโดยหั่นข้อมูลมาแค่ 10 แถว (ตามค่า rowsPerPage)
function renderPaginatedTable() {
  const tbody = document.getElementById('progress-table-body');
  tbody.innerHTML = '';

  // ดักกรณีค้นหาแล้วไม่เจอข้อมูล
  if (filteredProgressData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">ไม่พบข้อมูลผู้เข้าอบรม</td></tr>';
    document.getElementById('pagination-info').innerText = 'ไม่พบข้อมูล';
    document.getElementById('pagination-controls').innerHTML = '';
    return;
  }

  // คณิตศาสตร์ของการแบ่งหน้า (Pagination Math)
  const totalPages = Math.ceil(filteredProgressData.length / rowsPerPage); // ปัดเศษขึ้นเสมอ
  const startIdx = (currentPage - 1) * rowsPerPage; // จุดเริ่มต้นของ Array
  const endIdx = startIdx + rowsPerPage;            // จุดสิ้นสุดของ Array
  
  // หั่น (slice) อาร์เรย์ออกมาเฉพาะก้อนที่จะโชว์
  const paginatedItems = filteredProgressData.slice(startIdx, endIdx);

  // นำก้อนที่หั่นแล้วมาวาดลง HTML
  paginatedItems.forEach(p => {
    tbody.innerHTML += `<tr><td class="ps-3"><code>${p.id}</code></td><td>${p.name}</td><td><span class="badge bg-info text-dark">กลุ่ม ${p.group}</span></td></tr>`;
  });

  // อัปเดตข้อความบอกจำนวนแสดงผล
  document.getElementById('pagination-info').innerText = `แสดง ${startIdx + 1} ถึง ${Math.min(endIdx, filteredProgressData.length)} จากทั้งหมด ${filteredProgressData.length} รายการ`;
  
  // เรียกฟังก์ชันวาดปุ่มกดเปลี่ยนหน้า
  renderPaginationControls(totalPages);
}

// กลไกที่ 3: สร้างปุ่มกดเปลี่ยนหน้า (1, 2, 3...)
function renderPaginationControls(totalPages) {
  const ul = document.getElementById('pagination-controls');
  ul.innerHTML = '';

  // ปุ่มย้อนกลับ (ถ้าอยู่หน้า 1 ให้ปิดการใช้งาน disabled)
  ul.innerHTML += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changePage(${currentPage - 1}); return false;">ก่อนหน้า</a></li>`;
  
  // วนลูปสร้างปุ่มตัวเลขหน้าตามจำนวนทั้งหมด
  for (let i = 1; i <= totalPages; i++) {
    ul.innerHTML += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a></li>`;
  }
  
  // ปุ่มถัดไป
  ul.innerHTML += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changePage(${currentPage + 1}); return false;">ถัดไป</a></li>`;
}

// ทริกเกอร์เมื่อผู้ใช้กดเปลี่ยนหน้า
function changePage(page) {
  const totalPages = Math.ceil(filteredProgressData.length / rowsPerPage);
  if (page < 1 || page > totalPages) return; // บล็อกการกดเกินลิมิต
  currentPage = page;
  renderPaginatedTable(); // สั่งให้วาดตารางหน้านั้นใหม่
}

// ==========================================
// 6. ระบบจัดการฐานข้อมูล (Data Integration - นำเข้า/ส่งออก)
// ==========================================

// [นำเข้า CSV สู่ Google Sheet]
function handleImportCSV() {
  const file = document.getElementById('csvFileInput').files[0];
  if (!file) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์ .csv ที่ต้องการอัปโหลด', 'warning');
  
  const reader = new FileReader(); // ใช้ HTML5 API ในการอ่านไฟล์ดิบฝั่ง Client
  Swal.fire({ title: 'กำลังประมวลผล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  
  // Event: เมื่ออ่านไฟล์เสร็จ ให้ทำสิ่งนี้...
  reader.onload = async e => {
    // เอาข้อความ (Text) ที่อ่านได้ส่งไปให้ Backend จัดการแปลงลงตาราง
    const res = await callAPI('importCSV', { csvText: e.target.result });
    if (res.status === 'success') {
      Swal.fire('สำเร็จ', res.message, 'success');
      document.getElementById('csvFileInput').value = ''; // เคลียร์ช่องให้ว่าง
    } else {
      Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
    }
  };
  reader.readAsText(file, 'UTF-8'); // เริ่มอ่านไฟล์โดยใช้ฟอนต์ UTF-8 ป้องกันภาษาไทยเพี้ยน
}

// [ส่งออก Google Sheet เป็นไฟล์ CSV ดาวน์โหลดลงเครื่อง]
async function handleExportCSV() {
  Swal.fire({ title: 'กำลังดึงข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  
  // ไปเอา String CSV จาก Backend มา
  const res = await callAPI('exportCSV');
  
  if (res.status === 'success') {
    Swal.close();
    
    // สร้าง Blob Object (ก้อนข้อมูลเสมือนไฟล์) 
    // หมายเหตุ: การใส่ \uFEFF คือการใส่รหัส BOM ให้ Excel รู้ว่านี่คือภาษาไทยแบบ UTF-8 ป้องกันสระต่างด้าว
    const blob = new Blob(["\uFEFF" + res.csvData], { type: 'text/csv;charset=utf-8;' });
    
    // ทริคจำลองการดาวน์โหลด: สร้างลิงก์ล่องหน > สั่งคลิก > ทำลายทิ้ง
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = res.filename;
    link.click();
  } else {
    Swal.fire('ข้อผิดพลาด', res.message, 'error');
  }
}

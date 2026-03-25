// ==========================================
// 📌 นำ URL จาก Google Apps Script มาวางในเครื่องหมายคำพูดด้านล่างนี้
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbxwCOOKsedfJw80Xjknrl9EYYnU6uWH6YHlPgtwlSSvDGTW_dWvRgybcJko-wN5TTfm/exec";

// ตัวแปรส่วนกลาง (Global Variables) เก็บข้อมูลไว้ใช้ร่วมกันหลายๆ ฟังก์ชัน เพื่อลดการโหลดเซิร์ฟเวอร์บ่อยๆ
let currentUser = null;          // เก็บข้อมูลผู้ใช้ที่ล็อกอิน (เช่น ชื่อ, บทบาท)
let globalProgressData = [];     // เก็บข้อมูลตาราง Matrix ทั้งหมดที่ดึงมาจากหลังบ้าน
let filteredProgressData = [];   // เก็บข้อมูลตาราง Matrix ที่ถูกกรองแล้ว (จากการค้นหา/เลือกกลุ่ม)
let chartUpdateInterval = null;  // ตัวจับเวลาสำหรับรีเฟรชหน้าแอดมินอัตโนมัติ
let currentPage = 1;             // จำว่าตอนนี้ผู้ใช้อยู่หน้าที่เท่าไหร่ของตาราง
const rowsPerPage = 10;          // กำหนดให้ตารางแสดงหน้าละกี่คน

let globalMentorData = [];       // เก็บข้อมูลเด็กในกลุ่มของ Mentor
let filteredMentorData = [];
let mentorChartInstance = null;  // เก็บตัวกราฟเพื่อเอาไว้ทำลาย (Destroy) ก่อนวาดใหม่ ป้องกันกราฟซ้อนกัน
let mentorCurrentPage = 1;

// ==========================================
// 📌 2. ฟังก์ชันหลัก (Core Functions)
// ==========================================

// ฟังก์ชันหัวใจสำคัญ: ทำหน้าที่ยิงข้อมูล (POST Request) ไปคุยกับ Code.gs
// ใช้ async/await เพื่อสั่งให้ระบบ "รอ" จนกว่าเซิร์ฟเวอร์จะตอบกลับ ค่อยทำงานบรรทัดต่อไป
async function callAPI(action, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST', 
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // แปลงเป็นข้อความล้วนๆ ป้องกันปัญหา CORS บนเบราว์เซอร์
      body: JSON.stringify({ action: action, payload: payload }) // แพ็กข้อมูลส่งไป
    });
    return await response.json(); // แปลงคำตอบที่ได้กลับมาเป็นออบเจกต์ JSON
  } catch (error) { throw new Error("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้"); }
}

// ระบบเข้าสู่ระบบ
async function handleLogin() {
  const personalId = document.getElementById('input-personal-id').value.trim();
  if (!personalId) return Swal.fire('แจ้งเตือน', 'กรุณากรอกรหัสประจำตัว', 'warning');
  try {
    // โชว์กล่องหมุนๆ ระหว่างรอเซิร์ฟเวอร์ตรวจรหัส
    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const res = await callAPI('loginUser', { personalId: personalId });
    if (res.status === 'success') { 
      currentUser = res.user; // บันทึกข้อมูลผู้ใช้
      Swal.close(); 
      setupDashboard(); // สลับหน้าจอตามสิทธิ์
    } 
    else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
  } catch (err) { Swal.fire('ข้อผิดพลาดของระบบ', 'การเชื่อมต่อขัดข้อง', 'error'); }
}

// ออกจากระบบ (รีเฟรชหน้าเว็บทิ้งไปเลย เพื่อเคลียร์ข้อมูลทุกอย่าง)
function logout() { location.reload(); }

// ฟังก์ชันควบคุมการแสดงผลหน้าจอ (Routing)
function setupDashboard() {
  document.getElementById('login-view').classList.remove('d-block'); // ปิดหน้าล็อกอิน
  document.getElementById('main-nav').style.display = 'block'; // เปิดแถบด้านบน
  
  // นำชื่อและสิทธิ์ไปแปะบน Navbar
  const safeRole = currentUser.role ? currentUser.role.toString().trim().toUpperCase() : 'TRAINEE';
  document.getElementById('display-user-name').innerText = currentUser.name;
  document.getElementById('display-user-role').innerText = safeRole;
  
  // ซ่อนทุกหน้าจอก่อน
  document.querySelectorAll('.app-view').forEach(el => el.classList.remove('d-block'));
  
  // ตรวจสอบสิทธิ์ (Role) แล้วเปิดหน้าจอที่ถูกต้อง
  if (safeRole === 'ADMIN' || safeRole === 'STAFF') {
    document.getElementById('admin-view').classList.add('d-block');
    startRealtimeDashboard(); // สั่งให้ตาราง Matrix โหลดข้อมูล
    if (safeRole === 'ADMIN') {
      document.getElementById('nav-crud-menu').classList.remove('d-none'); // แอดมินเห็นเมนูจัดการข้อมูล
      loadSpeakerConfigToUI(); // โหลดตั้งค่าตารางต่างๆ
      loadConfigToUI(); 
      loadExamConfigToUI();
    }
  } else if (safeRole === 'MENTOR') {
    document.getElementById('mentor-view').classList.add('d-block');
    fetchMentorData();
  } else {
    document.getElementById('trainee-view').classList.add('d-block');
    loadAttendanceUI(); 
  }
}

// ==========================================
// 📌 3. ระบบผู้เข้าอบรม (Trainee View)
// ==========================================

// โหลดปุ่มลงเวลามาสร้างหน้าเว็บ
async function loadAttendanceUI() {
  const container = document.getElementById('attendance-buttons-container');
  if(!container) return;
  container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-success"></div> <span class="small text-muted">กำลังซิงค์เวลาเซิร์ฟเวอร์...</span></div>';
  try {
    const res = await callAPI('getAttendanceConfig');
    if (res.status === 'success') {
      container.innerHTML = ''; 
      const { schedule, serverDate, serverTime } = res;
      if(schedule.length === 0) { container.innerHTML = '<div class="alert alert-warning small">ขณะนี้ไม่มีรอบการลงเวลาที่เปิดใช้งาน</div>'; return; }
      
      // วนลูปวาดปุ่ม
      schedule.forEach(day => {
        let html = `<div class="mb-3 border-bottom pb-2"><h6 class="fw-bold text-secondary mb-2">วันที่ ${day.dayNo} <span class="small fw-normal text-muted">(${day.date})</span></h6><div class="d-flex flex-wrap gap-2">`;
        day.slots.forEach(slot => {
          // ตรวจสอบว่า วันนี้ตรงกับวันในระบบไหม และ เวลาปัจจุบันอยู่ในช่วงที่กำหนดไหม
          const isActive = (day.date === serverDate) && (serverTime >= slot.start && serverTime <= slot.end);
          if (isActive) html += `<button class="btn btn-success shadow-sm rounded-pill px-3" onclick="checkInModal('${day.dayNo}', '${slot.id}')"><i class="bi bi-check-circle-fill"></i> ${slot.label} <br><small class="fw-normal">${slot.start} - ${slot.end}</small></button>`;
          else html += `<button class="btn btn-outline-secondary rounded-pill px-3 opacity-50" disabled><i class="bi bi-lock-fill"></i> ${slot.label} <br><small class="fw-normal">${slot.start} - ${slot.end}</small></button>`;
        });
        html += `</div></div>`;
        container.innerHTML += html;
      });
    } else { container.innerHTML = `<div class="text-danger small"><i class="bi bi-exclamation-triangle"></i> โหลดตารางเวลาไม่สำเร็จ</div>`; }
  } catch (e) { container.innerHTML = `<div class="text-danger small">ขัดข้องทางเทคนิค</div>`; }
}

// บันทึกเวลา
async function checkInModal(dayNo, timeSlot) {
  const { value: note } = await Swal.fire({ title: `ลงเวลา (${timeSlot})`, input: 'textarea', inputPlaceholder: 'พิมพ์เป้าหมาย/สะท้อนผล...', showCancelButton: true, confirmButtonText: 'บันทึกเวลา' });
  if (note !== undefined) {
    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const res = await callAPI('recordAttendance', { personalId: currentUser.personal_id, dayNo: dayNo, timeSlot: timeSlot, note: note });
    if (res.status === 'success') { Swal.fire('สำเร็จ', res.message, 'success'); loadAttendanceUI(); } 
    else { Swal.fire('แจ้งเตือน', res.message, 'warning'); }
  }
}

// ----------------- ระบบสอบ (Exam System) -----------------

// อัลกอริทึม Fisher-Yates Shuffle สำหรับสับเปลี่ยนลำดับข้อมูลใน Array ให้ไม่ซ้ำกัน
function shuffleArray(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

// ตรวจสอบสิทธิ์ก่อนเปิดข้อสอบ
async function openExamModal(testType) {
  Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  // 1. ไปถามระบบหลังบ้าน (Gatekeeper) ก่อน
  const checkRes = await callAPI('checkExamEligibility', { personalId: currentUser.personal_id, testType: testType });
  if (checkRes.status !== 'success') return Swal.fire('ข้อผิดพลาด', checkRes.message, 'error');
  
  // 2. ถ้าถูกห้าม (เช่น สอบไปแล้ว หรือผิดเวลา) ให้เด้งเตือนแล้วหยุดการทำงาน (return ออกไปเลย)
  if (!checkRes.eligible) {
    let iconType = checkRes.reason === 'completed' ? 'success' : 'warning';
    return Swal.fire('แจ้งเตือน', checkRes.message, iconType);
  }

  // 3. ถ้าผ่าน ค่อยโหลดข้อสอบมาแสดง
  Swal.fire({ title: 'กำลังโหลดข้อสอบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('getQuestions', { qType: 'TEST' });
  if (res.status === 'success') {
    Swal.close();
    renderExamUI(res.data, testType);
  } else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
}

// วาดหน้าต่างกระดาษข้อสอบ
function renderExamUI(examData, testType) {
  if (examData.length === 0) return Swal.fire('แจ้งเตือน', 'ยังไม่มีข้อสอบในระบบ', 'warning');
  let html = `<form id="examForm" class="text-start" style="font-size: 0.95rem;">`;
  const title = testType === 'PRE' ? '📝 แบบทดสอบก่อนเรียน (Pre-Test)' : '✅ แบบทดสอบหลังเรียน (Post-Test)';

  // 1. สับเปลี่ยน "ข้อสอบ" 
  let shuffledQuestions = shuffleArray([...examData]);

  shuffledQuestions.forEach((q, index) => {
    html += `<div class="mb-4 p-3 bg-white rounded border shadow-sm"><label class="d-block fw-bold text-dark mb-3">ข้อ ${index + 1}. ${q.question}</label>`;
    
    // 2. นำตัวเลือกมาจับคู่กับรหัสคำตอบ (A, B, C...) เพื่อไม่ให้เฉลยผิดเพี้ยนเวลาสลับที่
    const originalLetters = ['A', 'B', 'C', 'D', 'E'];
    let optionsObj = [];
    q.options.forEach((opt, optIdx) => {
      if (opt) optionsObj.push({ text: opt, value: originalLetters[optIdx] });
    });

    // 3. สับเปลี่ยน "ตัวเลือก" 
    optionsObj = shuffleArray(optionsObj);
    const displayLetters = ['ก', 'ข', 'ค', 'ง', 'จ'];

    // 4. วาดตัวเลือกให้คนทำสอบเห็นเป็น ก ข ค ง
    optionsObj.forEach((opt, optIdx) => {
      const displayChar = displayLetters[optIdx];
      html += `<div class="form-check mb-2">
                 <input class="form-check-input" type="radio" name="${q.q_id}" id="${q.q_id}_${opt.value}" value="${opt.value}" required>
                 <label class="form-check-label text-muted" style="cursor:pointer;" for="${q.q_id}_${opt.value}">${displayChar}. ${opt.text}</label>
               </div>`;
    });
    html += `</div>`;
  });
  html += '</form>';

  // โชว์ป๊อปอัปและดักจับคำตอบตอนกดยืนยัน
  Swal.fire({
    title: title, html: html, width: '800px', showCancelButton: true, confirmButtonText: 'ส่งคำตอบ', cancelButtonText: 'ยกเลิก', customClass: { popup: 'rounded-4 bg-light' },
    preConfirm: () => {
      const form = document.getElementById('examForm');
      if (!form.checkValidity()) { Swal.showValidationMessage('กรุณาตอบข้อสอบให้ครบทุกข้อ'); return false; }
      return Object.fromEntries(new FormData(form).entries()); // กวาดคำตอบทั้งหมดแพ็กเป็นก้อน
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      Swal.fire({ title: 'กำลังตรวจคำตอบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
      const res = await callAPI('submitTestScore', { personalId: currentUser.personal_id, testType: testType, answers: result.value });
      if (res.status === 'success') {
        Swal.fire({ icon: 'success', title: 'ส่งคำตอบสำเร็จ!', text: res.message, confirmButtonText: 'ยอดเยี่ยม' });
        if(document.getElementById('admin-view').classList.contains('d-block')) fetchProgressData(); 
      } else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
    }
  });
}

// ----------------- ระบบประเมิน (Evaluation System) -----------------

// ดึงรายชื่อวิทยากรมาให้เลือกประเมิน
async function openSpeakerListModal() {
  Swal.fire({ title: 'กำลังโหลดรายชื่อ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('getActiveSpeakers');
  if (res.status === 'success') {
    Swal.close();
    if(res.data.length === 0) return Swal.fire('แจ้งเตือน', 'ยังไม่มีรายชื่อวิทยากรในขณะนี้', 'info');
    
    // สร้างปุ่มรายชื่อวิทยากร
    let html = '<div class="d-flex flex-column gap-2">';
    res.data.forEach(spk => {
      html += `<button class="btn btn-outline-dark text-start shadow-sm" onclick="Swal.close(); openSurveyModal('${spk.id}', 'ประเมิน: ${spk.name}')">
                 <i class="bi bi-person-fill"></i> ${spk.name} <br><small class="text-muted">หัวข้อ: ${spk.topic}</small>
               </button>`;
    });
    html += '</div>';
    Swal.fire({ title: 'เลือกวิทยากรที่ต้องการประเมิน', html: html, showConfirmButton: false });
  } else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
}

// ดึงข้อสอบประเภทประเมินมาแสดง (ให้คะแนน 1-5)
async function openSurveyModal(targetId, customTitle = null) {
  Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('getQuestions', { qType: 'SURVEY' });
  if (res.status === 'success') { 
    Swal.close(); 
    const title = customTitle || '📝 แบบประเมินภาพรวมโครงการ';
    renderSurveyUI(res.data, targetId, title); 
  } else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
}

function renderSurveyUI(surveyData, targetId, title) {
  // จัดกลุ่มคำถามตามหมวดหมู่ (q_category)
  const groupedData = surveyData.reduce((acc, curr) => { if (!acc[curr.q_category]) acc[curr.q_category] = []; acc[curr.q_category].push(curr); return acc; }, {});
  
  let html = '<form id="satisfactionForm" class="text-start" style="font-size: 0.95rem;">';
  let sectionNumber = 1;
  for (const [category, questions] of Object.entries(groupedData)) {
    html += `<div class="mt-4 mb-3 border-bottom border-2 border-primary pb-2"><h6 class="fw-bold text-primary mb-0">ส่วนที่ ${sectionNumber}: ${category}</h6></div>`;
    questions.forEach((q, index) => {
      html += `<div class="mb-3 p-3 bg-white rounded border shadow-sm"><label class="d-block fw-bold text-dark mb-3">${index + 1}. ${q.question}</label><div class="d-flex justify-content-between px-1 px-md-4">`;
      // สร้างปุ่มเรดิโอ 5 ระดับ (5, 4, 3, 2, 1)
      [5, 4, 3, 2, 1].forEach(score => { html += `<div class="form-check text-center m-0 p-0"><input class="form-check-input float-none m-0" type="radio" name="${q.q_id}" value="${score}" required><label class="d-block small mt-1 text-muted">${score}</label></div>`; });
      html += `</div></div>`;
    }); sectionNumber++;
  } html += '</form>';

  Swal.fire({
    title: title, html: html, width: '800px', showCancelButton: true, confirmButtonText: 'ส่งแบบประเมิน', customClass: { popup: 'rounded-4 bg-light' },
    preConfirm: () => {
      const form = document.getElementById('satisfactionForm');
      if (!form.checkValidity()) { Swal.showValidationMessage('กรุณาตอบแบบประเมินให้ครบ'); return false; }
      return Object.fromEntries(new FormData(form).entries());
    }
  }).then(async (result) => { 
    if (result.isConfirmed) {
      Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
      const res = await callAPI('submitSurvey', { personalId: currentUser.personal_id, targetId: targetId, answers: result.value });
      if (res.status === 'success') Swal.fire('สำเร็จ!', res.message, 'success');
      else Swal.fire('ข้อผิดพลาด', res.message, 'error');
    }
  });
}

// ==========================================
// 📌 4. ระบบวิทยากรพี่เลี้ยง (Mentor View)
// (ฟังก์ชันยังเหมือนเดิม ขอละคำอธิบายเพื่อความกระชับ)
// ==========================================
async function fetchMentorData() {
  const tbody = document.getElementById('mentor-table-body');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div> กำลังดึงข้อมูล...</td></tr>';
  const res = await callAPI('getMentorData', { mentorId: currentUser.personal_id });
  if (res.status === 'success') { globalMentorData = res.data; renderMentorChart(); filterMentorTable(); } 
  else { tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">เกิดข้อผิดพลาด: ${res.message}</td></tr>`; }
}
function renderMentorChart() { /* ยอดนับคนของกลุ่ม Mentor */
  const counts = { 'Morning': 0, 'Afternoon': 0, 'Evening': 0, 'Checkout': 0 };
  globalMentorData.forEach(log => { if(counts[log.time_slot] !== undefined) counts[log.time_slot]++; });
  const ctx = document.getElementById('mentorBarChart');
  if (mentorChartInstance) mentorChartInstance.destroy();
  mentorChartInstance = new Chart(ctx, { type: 'bar', data: { labels: ['รอบเช้า', 'รอบบ่าย', 'รอบเย็น', 'สะท้อนผล'], datasets: [{ label: 'ยอดการลงเวลาของกลุ่ม (ครั้ง)', data: [counts.Morning, counts.Afternoon, counts.Evening, counts.Checkout], backgroundColor: ['#0d6efd', '#ffc107', '#fd7e14', '#198754'], borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } } });
}
function filterMentorTable() {
  const keyword = document.getElementById('mentor-search').value.toLowerCase();
  const filterDay = document.getElementById('mentor-filter-day').value;
  const filterTime = document.getElementById('mentor-filter-time').value;
  filteredMentorData = globalMentorData.filter(log => { return (log.name.toLowerCase().includes(keyword) || log.personal_id.toString().includes(keyword)) && (filterDay === 'ALL' || log.day_no.toString() === filterDay) && (filterTime === 'ALL' || log.time_slot === filterTime); });
  mentorCurrentPage = 1; renderMentorPaginatedTable();
}
function renderMentorPaginatedTable() {
  const tbody = document.getElementById('mentor-table-body'); tbody.innerHTML = '';
  if (filteredMentorData.length === 0) return tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">ไม่พบประวัติการลงเวลา</td></tr>';
  const startIdx = (mentorCurrentPage - 1) * rowsPerPage;
  const paginatedItems = filteredMentorData.slice(startIdx, startIdx + rowsPerPage);
  const timeTranslates = { 'Morning': 'เช้า', 'Afternoon': 'บ่าย', 'Evening': 'เย็น', 'Checkout': 'สะท้อนผล' };
  paginatedItems.forEach(log => { tbody.innerHTML += `<tr><td class="ps-3"><code>${log.personal_id}</code></td><td>${log.name}</td><td>วันที่ ${log.day_no}</td><td><span class="badge bg-secondary">${timeTranslates[log.time_slot] || log.time_slot}</span></td><td class="small text-muted">${log.timestamp}</td></tr>`; });
  document.getElementById('mentor-pagination-info').innerText = `แสดง ${startIdx + 1} ถึง ${Math.min(startIdx + rowsPerPage, filteredMentorData.length)} จาก ${filteredMentorData.length} รายการ`;
  renderPaginationControls(Math.ceil(filteredMentorData.length / rowsPerPage), 'mentor');
}
function changeMentorPage(page) { mentorCurrentPage = page; renderMentorPaginatedTable(); }

// ==========================================
// 📌 5. ผู้ดูแลระบบ (Admin View)
// ==========================================

// โหลดข้อมูล Dashboard อัตโนมัติทุกๆ 30 วินาที
function startRealtimeDashboard() { 
  fetchProgressData(); 
  if (chartUpdateInterval) clearInterval(chartUpdateInterval);
  chartUpdateInterval = setInterval(fetchProgressData, 30000); 
}

// 📌 ฟังก์ชันดึงและกรองตาราง Matrix แสนดุดัน
async function fetchProgressData() {
  const res = await callAPI('getTraineeProgress'); // ดึงข้อมูลก้อนใหญ่จากเซิร์ฟเวอร์
  if (res.status === 'success') { globalProgressData = res.data; filterProgressTable(); }
}

function filterProgressTable() {
  const keyword = document.getElementById('search-progress').value.toLowerCase();
  const selectedGroup = document.getElementById('filter-group-target').value;
  // นำข้อมูลก้อนใหญ่ (globalProgressData) มากรอง (filter) ตามคำค้นหาและกลุ่มเป้าหมาย
  filteredProgressData = globalProgressData.filter(p => {
    const matchKeyword = p.name.toLowerCase().includes(keyword) || p.id.toString().includes(keyword);
    const matchGroup = selectedGroup === 'ALL' || p.group.toString() === selectedGroup;
    return matchKeyword && matchGroup;
  });
  currentPage = 1; renderPaginatedTable();
}

function renderPaginatedTable() {
  const tbody = document.getElementById('progress-table-body');
  tbody.innerHTML = '';
  
  if (filteredProgressData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="16" class="text-center py-4 text-muted">ไม่พบข้อมูล</td></tr>';
    document.getElementById('pagination-info').innerText = 'ไม่พบข้อมูล';
    document.getElementById('pagination-controls').innerHTML = '';
    return;
  }
  
  // ระบบแบ่งหน้า: ตัดเอาเฉพาะข้อมูลหน้าปัจจุบันมาวนลูปวาด
  const totalPages = Math.ceil(filteredProgressData.length / rowsPerPage);
  const startIdx = (currentPage - 1) * rowsPerPage;
  const paginatedItems = filteredProgressData.slice(startIdx, startIdx + rowsPerPage);

  const checkMark = '<i class="bi bi-check-circle-fill text-success fs-5"></i>';
  const crossMark = '<span class="text-muted opacity-25">-</span>';

  // วนลูปวาดตารางทีละคน (Row)
  paginatedItems.forEach(p => { 
    const att = p.attendance || {}; // ประวัติลงเวลาของคนนี้
    const test = p.testScore || {}; // คะแนนสอบ
    const surv = p.survey || {};    // ประวัติการประเมิน
    
    let count = 0; 
    
    // ฟังก์ชันช่วยตรวจสอบว่า ลงเวลาในวันและรอบนั้นๆ หรือไม่
    const checkSlot = (day, time) => {
      if (att[day] && att[day][time]) { count++; return checkMark; }
      return crossMark;
    };
    
    // 1. ดึงสถานะลงเวลา 7 ช่อง
    const d1m = checkSlot('1', 'Morning'); const d1a = checkSlot('1', 'Afternoon'); const d1e = checkSlot('1', 'Evening');
    const d2m = checkSlot('2', 'Morning'); const d2a = checkSlot('2', 'Afternoon'); const d2e = checkSlot('2', 'Evening');
    const d3m = checkSlot('3', 'Morning');

    // 2. คำนวณเปอร์เซ็นต์ (หารด้วย 7 ช่อง)
    const percentage = Math.round((count / 7) * 100);
    const badgeColor = percentage >= 80 ? 'bg-success' : (percentage >= 50 ? 'bg-warning text-dark' : 'bg-danger');

    // 3. กำหนดป้ายคะแนนสอบ (ถ้ามีโชว์คะแนน ถ้าไม่มีโชว์รอสอบ)
    const preScore = test['PRE'] ? `<span class="badge bg-info text-dark fs-6">${test['PRE']}</span>` : `<span class="badge bg-light text-muted border">รอสอบ</span>`;
    const postScore = test['POST'] ? `<span class="badge bg-info text-dark fs-6">${test['POST']}</span>` : `<span class="badge bg-light text-muted border">รอสอบ</span>`;

    // 4. กำหนดป้ายประเมิน (ถ้าประเมินแล้วจะเปลี่ยนสถานะเป็นสีเขียว)
    const evalSpeaker = surv.speaker ? '<span class="badge bg-success">ประเมินแล้ว <i class="bi bi-check-circle-fill"></i></span>' : '<span class="badge bg-light text-muted border">รอประเมิน</span>';
    const evalProject = surv.project ? '<span class="badge bg-success">ประเมินแล้ว <i class="bi bi-check-circle-fill"></i></span>' : '<span class="badge bg-light text-muted border">รอประเมิน</span>';

    // นำตัวแปรทั้งหมดมาประกอบเป็น HTML แถวตาราง
    tbody.innerHTML += `
      <tr>
        <td><code>${p.id}</code></td>
        <td class="text-start">${p.name}</td>
        <td><span class="badge bg-light text-dark border">กลุ่ม ${p.group}</span></td>
        <td>${d1m}</td><td>${d1a}</td><td class="border-end">${d1e}</td>
        <td>${d2m}</td><td>${d2a}</td><td class="border-end">${d2e}</td>
        <td class="border-end">${d3m}</td>
        <td class="fw-bold bg-light border-start">${count}</td>
        <td class="bg-light border-end"><span class="badge ${badgeColor}">${percentage}%</span></td>
        <td>${preScore}</td>
        <td>${evalSpeaker}</td>
        <td>${postScore}</td>
        <td>${evalProject}</td>
      </tr>
    `; 
  });
  
  document.getElementById('pagination-info').innerText = `แสดง ${startIdx + 1} ถึง ${Math.min(startIdx + rowsPerPage, filteredProgressData.length)} จากทั้งหมด ${filteredProgressData.length} รายการ`;
  renderPaginationControls(totalPages, 'admin');
}

// สร้างปุ่มเลขหน้า 1, 2, 3... (ใช้งานร่วมกันระหว่าง Admin และ Mentor)
function renderPaginationControls(totalPages, role = 'admin') {
  const ul = document.getElementById(role === 'admin' ? 'pagination-controls' : 'mentor-pagination-controls');
  const current = role === 'admin' ? currentPage : mentorCurrentPage;
  const changeFunc = role === 'admin' ? 'changePage' : 'changeMentorPage';
  
  ul.innerHTML = `<li class="page-item ${current === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="${changeFunc}(${current - 1}); return false;">ก่อนหน้า</a></li>`;
  for (let i = 1; i <= totalPages; i++) { ul.innerHTML += `<li class="page-item ${i === current ? 'active' : ''}"><a class="page-link" href="#" onclick="${changeFunc}(${i}); return false;">${i}</a></li>`; }
  ul.innerHTML += `<li class="page-item ${current === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" onclick="${changeFunc}(${current + 1}); return false;">ถัดไป</a></li>`;
}
function changePage(page) { currentPage = page; renderPaginatedTable(); }

// 📌 ดึงสรุปประเมินวิทยากรและโครงการ (แสดงค่า Mean / S.D.)
async function fetchEvaluationSummary() {
  const tbody = document.getElementById('eval-summary-body');
  tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center"><div class="spinner-border text-success"></div></td></tr>';
  const res = await callAPI('getSurveySummary');
  if (res.status === 'success') {
    tbody.innerHTML = '';
    if(res.data.length === 0) return tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-muted text-center">ยังไม่มีข้อมูลการประเมิน</td></tr>';
    
    // ฟังก์ชันแปลผลคะแนนเป็นข้อความสไตล์ประเมินราชการ
    const interpret = (mean) => {
      if(mean >= 4.5) return '<span class="text-success fw-bold">มากที่สุด</span>';
      if(mean >= 3.5) return '<span class="text-primary fw-bold">มาก</span>';
      if(mean >= 2.5) return '<span class="text-warning fw-bold">ปานกลาง</span>';
      return '<span class="text-danger fw-bold">น้อย/ปรับปรุง</span>';
    };

    res.data.forEach(item => {
      tbody.innerHTML += `<tr>
        <td class="text-start ps-4 fw-bold text-dark">${item.name}</td>
        <td>${item.evaluators}</td>
        <td class="fw-bold fs-5 text-primary">${item.mean}</td>
        <td class="text-muted">${item.sd}</td>
        <td>${interpret(item.mean)}</td>
      </tr>`;
    });
  } else { tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">เกิดข้อผิดพลาด</td></tr>`; }
}

// ==========================================
// 📌 6. ระบบจัดการข้อมูล (CRUD Operations)
// สำหรับตั้งค่าการลงเวลา, เปิด-ปิดข้อสอบ และวิทยากร
// ==========================================

// นำเข้า CSV (ดูดไฟล์ -> แปลงเป็น Text -> ส่งไปเซิร์ฟเวอร์)
function handleImportCSV() {
  const file = document.getElementById('csvFileInput').files[0];
  if (!file) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์', 'warning');
  const reader = new FileReader();
  Swal.fire({ title: 'กำลังประมวลผล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  reader.onload = async e => {
    const res = await callAPI('importCSV', { csvText: e.target.result });
    if (res.status === 'success') { Swal.fire('สำเร็จ', res.message, 'success'); document.getElementById('csvFileInput').value = ''; } 
    else { Swal.fire('เกิดข้อผิดพลาด', res.message, 'error'); }
  };
  reader.readAsText(file, 'UTF-8');
}

// ส่งออก CSV (ขอข้อมูลจากเซิร์ฟเวอร์ -> แปลงเป็นไฟล์ .csv -> สั่งเบราว์เซอร์ให้ดาวน์โหลด)
async function handleExportCSV() {
  Swal.fire({ title: 'กำลังดึงข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('exportCSV');
  if (res.status === 'success') {
    Swal.close();
    // ใส่ \uFEFF บังคับให้ Excel รู้ว่าเป็นไฟล์ UTF-8 (สระภาษาไทยจะได้ไม่เพี้ยน)
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF" + res.csvData], { type: 'text/csv;charset=utf-8;' }));
    link.download = res.filename;
    link.click();
  } else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
}

// -- ตารางตั้งค่าลงเวลา (Attendance Config) --
async function loadConfigToUI() {
  const tbody = document.getElementById('config-table-body');
  if(!tbody) return;
  const res = await callAPI('getRawAttendanceConfig');
  if (res.status === 'success') {
    tbody.innerHTML = '';
    res.data.forEach((row) => {
      const isChecked = row[7].toString().toUpperCase() === 'TRUE' ? 'checked' : '';
      tbody.innerHTML += `<tr>
          <td class="d-none"><input type="hidden" class="config-id" value="${row[0]}"></td>
          <td><select class="form-select form-select-sm config-slotid mx-auto text-center fw-bold text-secondary" style="width: 110px;">
              <option value="Morning" ${row[3] === 'Morning' ? 'selected' : ''}>Morning</option>
              <option value="Afternoon" ${row[3] === 'Afternoon' ? 'selected' : ''}>Afternoon</option>
              <option value="Evening" ${row[3] === 'Evening' ? 'selected' : ''}>Evening</option>
              <option value="Checkout" ${row[3] === 'Checkout' ? 'selected' : ''}>Checkout</option>
            </select></td>
          <td><input type="number" class="form-control form-control-sm text-center mx-auto config-day" value="${row[1]}" style="width: 60px;"></td>
          <td><input type="date" class="form-control form-control-sm config-date" value="${row[2]}"></td>
          <td><input type="text" class="form-control form-control-sm config-label" value="${row[4]}"></td>
          <td><input type="time" class="form-control form-control-sm config-start" value="${row[5]}"></td>
          <td><input type="time" class="form-control form-control-sm config-end" value="${row[6]}"></td>
          <td><div class="form-check form-switch d-flex justify-content-center m-0"><input class="form-check-input config-active" type="checkbox" style="cursor:pointer;" ${isChecked}></div></td>
          <td><button class="btn btn-sm btn-outline-danger rounded-circle shadow-sm" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td>
        </tr>`;
    });
  }
}

function addConfigRow() {
  const tbody = document.getElementById('config-table-body');
  const newId = 'CONF-NEW-' + Math.floor(Math.random() * 10000);
  tbody.innerHTML += `<tr>
      <td class="d-none"><input type="hidden" class="config-id" value="${newId}"></td>
      <td><select class="form-select form-select-sm config-slotid border-primary mx-auto text-center fw-bold text-primary" style="width: 110px;"><option value="Morning">Morning</option><option value="Afternoon">Afternoon</option><option value="Evening">Evening</option><option value="Checkout">Checkout</option></select></td>
      <td><input type="number" class="form-control form-control-sm text-center mx-auto config-day" value="1" style="width: 60px;"></td>
      <td><input type="date" class="form-control form-control-sm config-date"></td>
      <td><input type="text" class="form-control form-control-sm config-label" value="รอบใหม่" placeholder="ชื่อรอบ..."></td>
      <td><input type="time" class="form-control form-control-sm config-start" value="08:00"></td>
      <td><input type="time" class="form-control form-control-sm config-end" value="16:00"></td>
      <td><div class="form-check form-switch d-flex justify-content-center m-0"><input class="form-check-input config-active" type="checkbox" checked></div></td>
      <td><button class="btn btn-sm btn-outline-danger rounded-circle shadow-sm" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td>
    </tr>`;
}

async function saveConfigFromUI() {
  Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
  const rows = document.querySelectorAll('#config-table-body tr');
  let newConfigData = [];
  for(let tr of rows) {
    if(!tr.querySelector('.config-id')) continue; 
    newConfigData.push([
      tr.querySelector('.config-id').value, tr.querySelector('.config-day').value, tr.querySelector('.config-date').value,
      tr.querySelector('.config-slotid').value, tr.querySelector('.config-label').value,
      tr.querySelector('.config-start').value, tr.querySelector('.config-end').value,
      tr.querySelector('.config-active').checked ? 'TRUE' : 'FALSE'
    ]);
  }
  const res = await callAPI('saveRawAttendanceConfig', { configData: newConfigData });
  if (res.status === 'success') Swal.fire('สำเร็จ', res.message, 'success');
  else Swal.fire('ข้อผิดพลาด', res.message, 'error');
}

// -- ตารางตั้งค่าข้อสอบ (Exam Config) --
async function loadExamConfigToUI() {
  const tbody = document.getElementById('exam-config-table-body');
  if(!tbody) return;
  const res = await callAPI('getRawExamConfig');
  if (res.status === 'success') {
    tbody.innerHTML = '';
    // ฟังก์ชันแปลงเวลาจากชีตให้อยู่ในฟอร์แมต YYYY-MM-DDTHH:mm เพื่อให้กล่อง <input type="datetime-local"> อ่านออก
    const formatDT = (dtStr) => {
      if(!dtStr) return "";
      let d = new Date(dtStr);
      if(isNaN(d.getTime())) { d = new Date(dtStr.replace(" ", "T")); if(isNaN(d.getTime())) return ""; }
      const pad = (n) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    res.data.forEach((row) => {
      const isChecked = row[3].toString().toUpperCase() === 'TRUE' ? 'checked' : '';
      tbody.innerHTML += `<tr>
          <td><select class="form-select form-select-sm exam-type mx-auto text-center fw-bold text-secondary" style="width: 150px;">
              <option value="PRE" ${row[0].toUpperCase() === 'PRE' ? 'selected' : ''}>PRE-TEST</option>
              <option value="POST" ${row[0].toUpperCase() === 'POST' ? 'selected' : ''}>POST-TEST</option>
            </select></td>
          <td><input type="datetime-local" class="form-control form-control-sm exam-start mx-auto" value="${formatDT(row[1])}" style="max-width: 220px;"></td>
          <td><input type="datetime-local" class="form-control form-control-sm exam-end mx-auto" value="${formatDT(row[2])}" style="max-width: 220px;"></td>
          <td><div class="form-check form-switch d-flex justify-content-center m-0"><input class="form-check-input exam-active" type="checkbox" ${isChecked}></div></td>
          <td><button class="btn btn-sm btn-outline-danger rounded-circle shadow-sm" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td>
        </tr>`;
    });
  }
}

function addExamConfigRow() {
  const tbody = document.getElementById('exam-config-table-body');
  if(!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="form-select form-select-sm exam-type border-info mx-auto text-center fw-bold text-info" style="width: 150px;"><option value="PRE">PRE-TEST</option><option value="POST">POST-TEST</option></select></td>
    <td><input type="datetime-local" class="form-control form-control-sm exam-start mx-auto" style="max-width: 220px;"></td>
    <td><input type="datetime-local" class="form-control form-control-sm exam-end mx-auto" style="max-width: 220px;"></td>
    <td><div class="form-check form-switch d-flex justify-content-center m-0"><input class="form-check-input exam-active" type="checkbox" checked></div></td>
    <td><button class="btn btn-sm btn-outline-danger rounded-circle shadow-sm" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td>
  `;
  tbody.appendChild(tr);
}

async function saveExamConfigFromUI() {
  Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
  const rows = document.querySelectorAll('#exam-config-table-body tr');
  let newConfigData = [];
  // แปลงเวลากลับให้มีช่องว่างตรงกลาง (YYYY-MM-DD HH:mm) ก่อนส่งเซฟลงชีต
  const revertDT = (dtStr) => { return dtStr ? dtStr.replace("T", " ") : ""; };

  for(let tr of rows) {
    if(!tr.querySelector('.exam-type')) continue; 
    newConfigData.push([
      tr.querySelector('.exam-type').value, revertDT(tr.querySelector('.exam-start').value),
      revertDT(tr.querySelector('.exam-end').value), tr.querySelector('.exam-active').checked ? 'TRUE' : 'FALSE'
    ]);
  }
  const res = await callAPI('saveRawExamConfig', { configData: newConfigData });
  if (res.status === 'success') Swal.fire('สำเร็จ', res.message, 'success');
  else Swal.fire('ข้อผิดพลาด', res.message, 'error');
}

// -- ตารางตั้งค่าวิทยากร (Speaker Config) --
async function loadSpeakerConfigToUI() {
  const tbody = document.getElementById('speaker-config-table-body');
  if(!tbody) return;
  const res = await callAPI('getRawSpeakerConfig');
  if (res.status === 'success') {
    tbody.innerHTML = '';
    res.data.forEach(row => {
      const isChecked = row[3].toString().toUpperCase() === 'TRUE' ? 'checked' : '';
      tbody.innerHTML += `<tr>
        <td><input type="text" class="form-control form-control-sm spk-id mx-auto text-center fw-bold" value="${row[0]}" style="width: 100px;"></td>
        <td><input type="text" class="form-control form-control-sm spk-name" value="${row[1]}" placeholder="ชื่อ-สกุล"></td>
        <td><input type="text" class="form-control form-control-sm spk-topic" value="${row[2]}" placeholder="หัวข้อ"></td>
        <td><div class="form-check form-switch d-flex justify-content-center"><input class="form-check-input spk-active" type="checkbox" ${isChecked}></div></td>
        <td><button class="btn btn-sm btn-outline-danger rounded-circle" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td>
      </tr>`;
    });
  }
}

function addSpeakerConfigRow() {
  const tbody = document.getElementById('speaker-config-table-body');
  if(!tbody) return;
  const newId = 'SPK-' + Math.floor(Math.random() * 1000);
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="form-control form-control-sm spk-id mx-auto text-center fw-bold" value="${newId}" style="width: 100px;"></td>
    <td><input type="text" class="form-control form-control-sm spk-name" placeholder="ชื่อ-สกุล"></td>
    <td><input type="text" class="form-control form-control-sm spk-topic" placeholder="หัวข้อที่บรรยาย"></td>
    <td><div class="form-check form-switch d-flex justify-content-center"><input class="form-check-input spk-active" type="checkbox" checked></div></td>
    <td><button class="btn btn-sm btn-outline-danger rounded-circle" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td>
  `;
  tbody.appendChild(tr);
}

async function saveSpeakerConfigFromUI() {
  Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
  const rows = document.querySelectorAll('#speaker-config-table-body tr');
  let newConfig = [];
  for(let tr of rows) {
    if(!tr.querySelector('.spk-id')) continue;
    newConfig.push([
      tr.querySelector('.spk-id').value, tr.querySelector('.spk-name').value,
      tr.querySelector('.spk-topic').value, tr.querySelector('.spk-active').checked ? 'TRUE' : 'FALSE'
    ]);
  }
  const res = await callAPI('saveRawSpeakerConfig', { configData: newConfig });
  if (res.status === 'success') Swal.fire('สำเร็จ', res.message, 'success');
  else Swal.fire('ข้อผิดพลาด', res.message, 'error');
}
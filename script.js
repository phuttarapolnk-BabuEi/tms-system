// ==========================================
// 📌 นำ URL จาก Google Apps Script มาวางในเครื่องหมายคำพูดด้านล่างนี้
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbxwCOOKsedfJw80Xjknrl9EYYnU6uWH6YHlPgtwlSSvDGTW_dWvRgybcJko-wN5TTfm/exec";

let currentUser = null;          
let globalProgressData = [];     
let filteredProgressData = [];   
let chartUpdateInterval = null;  
let currentPage = 1;             
const rowsPerPage = 10;          

let globalMentorData = [];       
let filteredMentorData = [];
let mentorChartInstance = null;  
let mentorCurrentPage = 1;

let globalEvalData = null; // เก็บข้อมูลประเมินทั้งหมด (Admin)

// ==========================================
// 📌 2. ฟังก์ชันหลัก (Core Functions)
// ==========================================
async function callAPI(action, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST', 
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload })
    });
    return await response.json();
  } catch (error) { throw new Error("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้"); }
}

async function handleLogin() {
  const personalId = document.getElementById('input-personal-id').value.trim();
  if (!personalId) return Swal.fire('แจ้งเตือน', 'กรุณากรอกรหัสประจำตัว', 'warning');
  try {
    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const res = await callAPI('loginUser', { personalId: personalId });
    if (res.status === 'success') { 
      currentUser = res.user; Swal.close(); setupDashboard(); 
    } 
    else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
  } catch (err) { Swal.fire('ข้อผิดพลาดของระบบ', 'การเชื่อมต่อขัดข้อง', 'error'); }
}

function logout() { location.reload(); }

function setupDashboard() {
  document.getElementById('login-view').classList.remove('d-block');
  document.getElementById('main-nav').style.display = 'block';
  
  const safeRole = currentUser.role ? currentUser.role.toString().trim().toUpperCase() : 'TRAINEE';
  document.getElementById('display-user-name').innerText = currentUser.name;
  document.getElementById('display-user-role').innerText = safeRole;
  document.querySelectorAll('.app-view').forEach(el => el.classList.remove('d-block'));
  
  if (safeRole === 'ADMIN' || safeRole === 'STAFF') {
    document.getElementById('admin-view').classList.add('d-block');
    startRealtimeDashboard(); 
    if (safeRole === 'ADMIN') {
      document.getElementById('nav-crud-menu').classList.remove('d-none');
      loadSpeakerConfigToUI(); loadConfigToUI(); loadExamConfigToUI();
    }
  } else if (safeRole === 'MENTOR') {
    document.getElementById('mentor-view').classList.add('d-block'); fetchMentorData();
  } else {
    document.getElementById('trainee-view').classList.add('d-block'); loadAttendanceUI(); 
  }
}

// ==========================================
// 📌 3. ระบบผู้เข้าอบรม (Trainee View)
// ==========================================
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
      schedule.forEach(day => {
        let html = `<div class="mb-3 border-bottom pb-2"><h6 class="fw-bold text-secondary mb-2">วันที่ ${day.dayNo} <span class="small fw-normal text-muted">(${day.date})</span></h6><div class="d-flex flex-wrap gap-2">`;
        day.slots.forEach(slot => {
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
function shuffleArray(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex); currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

async function openExamModal(testType) {
  Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const checkRes = await callAPI('checkExamEligibility', { personalId: currentUser.personal_id, testType: testType });
  if (checkRes.status !== 'success') return Swal.fire('ข้อผิดพลาด', checkRes.message, 'error');
  if (!checkRes.eligible) {
    let iconType = checkRes.reason === 'completed' ? 'success' : 'warning';
    return Swal.fire('แจ้งเตือน', checkRes.message, iconType);
  }
  Swal.fire({ title: 'กำลังโหลดข้อสอบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('getQuestions', { qType: 'TEST' });
  if (res.status === 'success') { Swal.close(); renderExamUI(res.data, testType); } 
  else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
}

function renderExamUI(examData, testType) {
  if (examData.length === 0) return Swal.fire('แจ้งเตือน', 'ยังไม่มีข้อสอบในระบบ', 'warning');
  let html = `<form id="examForm" class="text-start" style="font-size: 0.95rem;">`;
  const title = testType === 'PRE' ? '📝 แบบทดสอบก่อนเรียน (Pre-Test)' : '✅ แบบทดสอบหลังเรียน (Post-Test)';
  let shuffledQuestions = shuffleArray([...examData]);

  shuffledQuestions.forEach((q, index) => {
    html += `<div class="mb-4 p-3 bg-white rounded border shadow-sm"><label class="d-block fw-bold text-dark mb-3">ข้อ ${index + 1}. ${q.question}</label>`;
    const originalLetters = ['A', 'B', 'C', 'D', 'E'];
    let optionsObj = [];
    q.options.forEach((opt, optIdx) => { if (opt) optionsObj.push({ text: opt, value: originalLetters[optIdx] }); });
    optionsObj = shuffleArray(optionsObj);
    const displayLetters = ['ก', 'ข', 'ค', 'ง', 'จ'];
    optionsObj.forEach((opt, optIdx) => {
      const displayChar = displayLetters[optIdx];
      html += `<div class="form-check mb-2"><input class="form-check-input" type="radio" name="${q.q_id}" id="${q.q_id}_${opt.value}" value="${opt.value}" required><label class="form-check-label text-muted" style="cursor:pointer;" for="${q.q_id}_${opt.value}">${displayChar}. ${opt.text}</label></div>`;
    });
    html += `</div>`;
  });
  html += '</form>';

  Swal.fire({
    title: title, html: html, width: '800px', showCancelButton: true, confirmButtonText: 'ส่งคำตอบ', cancelButtonText: 'ยกเลิก', customClass: { popup: 'rounded-4 bg-light' },
    preConfirm: () => {
      const form = document.getElementById('examForm');
      if (!form.checkValidity()) { Swal.showValidationMessage('กรุณาตอบข้อสอบให้ครบทุกข้อ'); return false; }
      return Object.fromEntries(new FormData(form).entries()); 
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
async function openSpeakerListModal() {
  Swal.fire({ title: 'กำลังตรวจสอบวาระ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('getActiveSpeakers');
  if (res.status === 'success') {
    Swal.close();
    const now = new Date(); let activeNow = [];
    res.data.forEach(spk => {
       if(spk.start && spk.end) {
          const startTime = new Date(spk.start); const endTime = new Date(spk.end);
          if(now >= startTime && now <= endTime) { activeNow.push(spk); }
       }
    });
    if(activeNow.length === 0) return Swal.fire('แจ้งเตือน', 'ยังไม่มีวาระการประเมินวิทยากรในขณะนี้ครับ 🔒', 'info');
    
    let html = '<div class="d-flex flex-column gap-2">';
    activeNow.forEach(spk => {
      html += `<button class="btn btn-outline-warning text-dark text-start shadow-sm fw-bold border-2" onclick="Swal.close(); openSurveyModal('${spk.id}', 'ประเมิน: ${spk.name}', 'SPEAKER_SURVEY')">
                 <i class="bi bi-person-video3"></i> ${spk.name} <br><small class="text-muted fw-normal">หัวข้อ: ${spk.topic}</small>
               </button>`;
    });
    html += '</div>';
    Swal.fire({ title: 'เลือกวิทยากรที่ต้องการประเมิน', html: html, showConfirmButton: false });
  } else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
}

async function openSurveyModal(targetId, customTitle = null, surveyType = 'PROJECT_SURVEY') {
  Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('getQuestions', { qType: surveyType }); 
  if (res.status === 'success') { 
    Swal.close(); 
    const title = customTitle || '📝 แบบประเมิน';
    renderSurveyUI(res.data, targetId, title); 
  } else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
}

function renderSurveyUI(surveyData, targetId, title) {
  if (!surveyData || surveyData.length === 0) {
    return Swal.fire('แจ้งเตือน', 'ยังไม่ได้เพิ่มข้อคำถามลงในระบบ (โปรดตรวจดูชีต Questions_Bank ว่าพิมพ์ถูกไหม)', 'warning');
  }

  const groupedData = surveyData.reduce((acc, curr) => { if (!acc[curr.q_category]) acc[curr.q_category] = []; acc[curr.q_category].push(curr); return acc; }, {});
  let html = '<form id="satisfactionForm" class="text-start" style="font-size: 0.95rem;">';
  let sectionNumber = 1;
  
  for (const [category, questions] of Object.entries(groupedData)) {
    html += `<div class="mt-4 mb-3 border-bottom border-2 border-primary pb-2"><h6 class="fw-bold text-primary mb-0">ส่วนที่ ${sectionNumber}: ${category}</h6></div>`;
    questions.forEach((q, index) => {
      html += `<div class="mb-3 p-3 bg-white rounded border shadow-sm"><label class="d-block fw-bold text-dark mb-3">${index + 1}. ${q.question}</label>`;
      if (q.input_type === 'TEXT') {
        html += `<textarea class="form-control" name="${q.q_id}" rows="3" placeholder="พิมพ์ข้อเสนอแนะที่นี่..." required></textarea>`;
      } else {
        html += `<div class="d-flex justify-content-between px-1 px-md-4">`;
        [5, 4, 3, 2, 1].forEach(score => { html += `<div class="form-check text-center m-0 p-0"><input class="form-check-input float-none m-0" type="radio" name="${q.q_id}" value="${score}" required><label class="d-block small mt-1 text-muted">${score}</label></div>`; });
        html += `</div>`;
      }
      html += `</div>`;
    }); 
    sectionNumber++;
  } 
  html += '</form>';

  Swal.fire({
    title: title, html: html, width: '800px', showCancelButton: true, confirmButtonText: 'ส่งแบบประเมิน', customClass: { popup: 'rounded-4 bg-light' },
    preConfirm: () => {
      const form = document.getElementById('satisfactionForm');
      if (!form.checkValidity()) { Swal.showValidationMessage('กรุณาตอบแบบประเมินให้ครบทุกข้อ'); return false; }
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
// ==========================================
async function fetchMentorData() {
  const tbody = document.getElementById('mentor-table-body');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div> กำลังดึงข้อมูล...</td></tr>';
  const res = await callAPI('getMentorData', { mentorId: currentUser.personal_id });
  if (res.status === 'success') { globalMentorData = res.data; renderMentorChart(); filterMentorTable(); } 
  else { tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">เกิดข้อผิดพลาด</td></tr>`; }
}
function renderMentorChart() { 
  const counts = { 'Morning': 0, 'Afternoon': 0, 'Evening': 0, 'Checkout': 0 };
  globalMentorData.forEach(log => { if(counts[log.time_slot] !== undefined) counts[log.time_slot]++; });
  const ctx = document.getElementById('mentorBarChart');
  if (mentorChartInstance) mentorChartInstance.destroy();
  mentorChartInstance = new Chart(ctx, { type: 'bar', data: { labels: ['รอบเช้า', 'รอบบ่าย', 'รอบเย็น', 'สะท้อนผล'], datasets: [{ label: 'ยอดลงเวลา (ครั้ง)', data: [counts.Morning, counts.Afternoon, counts.Evening, counts.Checkout], backgroundColor: ['#0d6efd', '#ffc107', '#fd7e14', '#198754'], borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false } });
}
function filterMentorTable() {
  const keyword = document.getElementById('mentor-search').value.toLowerCase(); const filterDay = document.getElementById('mentor-filter-day').value; const filterTime = document.getElementById('mentor-filter-time').value;
  filteredMentorData = globalMentorData.filter(log => { return (log.name.toLowerCase().includes(keyword) || log.personal_id.toString().includes(keyword)) && (filterDay === 'ALL' || log.day_no.toString() === filterDay) && (filterTime === 'ALL' || log.time_slot === filterTime); });
  mentorCurrentPage = 1; renderMentorPaginatedTable();
}
function renderMentorPaginatedTable() {
  const tbody = document.getElementById('mentor-table-body'); tbody.innerHTML = '';
  if (filteredMentorData.length === 0) return tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">ไม่พบข้อมูล</td></tr>';
  const startIdx = (mentorCurrentPage - 1) * rowsPerPage; const paginatedItems = filteredMentorData.slice(startIdx, startIdx + rowsPerPage);
  const timeTranslates = { 'Morning': 'เช้า', 'Afternoon': 'บ่าย', 'Evening': 'เย็น', 'Checkout': 'สะท้อนผล' };
  paginatedItems.forEach(log => { tbody.innerHTML += `<tr><td class="ps-3"><code>${log.personal_id}</code></td><td>${log.name}</td><td>วันที่ ${log.day_no}</td><td><span class="badge bg-secondary">${timeTranslates[log.time_slot] || log.time_slot}</span></td><td class="small text-muted">${log.timestamp}</td></tr>`; });
  document.getElementById('mentor-pagination-info').innerText = `แสดง ${startIdx + 1} ถึง ${Math.min(startIdx + rowsPerPage, filteredMentorData.length)} จาก ${filteredMentorData.length} รายการ`;
  renderPaginationControls(Math.ceil(filteredMentorData.length / rowsPerPage), 'mentor');
}
function changeMentorPage(page) { mentorCurrentPage = page; renderMentorPaginatedTable(); }

// ==========================================
// 📌 5. ผู้ดูแลระบบ (Admin View)
// ==========================================
function startRealtimeDashboard() { 
  fetchProgressData(); 
  if (chartUpdateInterval) clearInterval(chartUpdateInterval);
  chartUpdateInterval = setInterval(fetchProgressData, 30000); 
}

async function fetchProgressData() {
  const res = await callAPI('getTraineeProgress'); 
  if (res.status === 'success') { globalProgressData = res.data; filterProgressTable(); }
}

function filterProgressTable() {
  const keyword = document.getElementById('search-progress').value.toLowerCase(); const selectedGroup = document.getElementById('filter-group-target').value;
  filteredProgressData = globalProgressData.filter(p => { return (p.name.toLowerCase().includes(keyword) || p.id.toString().includes(keyword)) && (selectedGroup === 'ALL' || p.group.toString() === selectedGroup); });
  currentPage = 1; renderPaginatedTable();
}

function renderPaginatedTable() {
  const tbody = document.getElementById('progress-table-body'); tbody.innerHTML = '';
  if (filteredProgressData.length === 0) { tbody.innerHTML = '<tr><td colspan="16" class="text-center py-4 text-muted">ไม่พบข้อมูล</td></tr>'; return; }
  const totalPages = Math.ceil(filteredProgressData.length / rowsPerPage); const startIdx = (currentPage - 1) * rowsPerPage; const paginatedItems = filteredProgressData.slice(startIdx, startIdx + rowsPerPage);
  const checkMark = '<i class="bi bi-check-circle-fill text-success fs-5"></i>'; const crossMark = '<span class="text-muted opacity-25">-</span>';

  paginatedItems.forEach(p => { 
    const att = p.attendance || {}; const test = p.testScore || {}; const surv = p.survey || {};    
    let count = 0; 
    const checkSlot = (day, time) => { if (att[day] && att[day][time]) { count++; return checkMark; } return crossMark; };
    const d1m = checkSlot('1', 'Morning'); const d1a = checkSlot('1', 'Afternoon'); const d1e = checkSlot('1', 'Evening');
    const d2m = checkSlot('2', 'Morning'); const d2a = checkSlot('2', 'Afternoon'); const d2e = checkSlot('2', 'Evening');
    const d3m = checkSlot('3', 'Morning');
    const percentage = Math.round((count / 7) * 100);
    const badgeColor = percentage >= 80 ? 'bg-success' : (percentage >= 50 ? 'bg-warning text-dark' : 'bg-danger');
    const preScore = test['PRE'] ? `<span class="badge bg-info text-dark fs-6">${test['PRE']}</span>` : `<span class="badge bg-light text-muted border">รอสอบ</span>`;
    const postScore = test['POST'] ? `<span class="badge bg-info text-dark fs-6">${test['POST']}</span>` : `<span class="badge bg-light text-muted border">รอสอบ</span>`;
    const evalSpeaker = surv.speaker ? '<span class="badge bg-success">ประเมินแล้ว <i class="bi bi-check-circle-fill"></i></span>' : '<span class="badge bg-light text-muted border">รอประเมิน</span>';
    const evalProject = surv.project ? '<span class="badge bg-success">ประเมินแล้ว <i class="bi bi-check-circle-fill"></i></span>' : '<span class="badge bg-light text-muted border">รอประเมิน</span>';

    tbody.innerHTML += `<tr>
        <td><code>${p.id}</code></td><td class="text-start">${p.name}</td><td><span class="badge bg-light text-dark border">กลุ่ม ${p.group}</span></td>
        <td>${d1m}</td><td>${d1a}</td><td class="border-end">${d1e}</td><td>${d2m}</td><td>${d2a}</td><td class="border-end">${d2e}</td><td class="border-end">${d3m}</td>
        <td class="fw-bold bg-light border-start">${count}</td><td class="bg-light border-end"><span class="badge ${badgeColor}">${percentage}%</span></td>
        <td>${preScore}</td><td>${evalSpeaker}</td><td>${postScore}</td><td>${evalProject}</td>
      </tr>`; 
  });
  document.getElementById('pagination-info').innerText = `แสดง ${startIdx + 1} ถึง ${Math.min(startIdx + rowsPerPage, filteredProgressData.length)} จากทั้งหมด ${filteredProgressData.length} รายการ`;
  renderPaginationControls(totalPages, 'admin');
}

function renderPaginationControls(totalPages, role = 'admin') {
  const ul = document.getElementById(role === 'admin' ? 'pagination-controls' : 'mentor-pagination-controls');
  const current = role === 'admin' ? currentPage : mentorCurrentPage; const changeFunc = role === 'admin' ? 'changePage' : 'changeMentorPage';
  ul.innerHTML = `<li class="page-item ${current === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="${changeFunc}(${current - 1}); return false;">ก่อนหน้า</a></li>`;
  for (let i = 1; i <= totalPages; i++) { ul.innerHTML += `<li class="page-item ${i === current ? 'active' : ''}"><a class="page-link" href="#" onclick="${changeFunc}(${i}); return false;">${i}</a></li>`; }
  ul.innerHTML += `<li class="page-item ${current === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" onclick="${changeFunc}(${current + 1}); return false;">ถัดไป</a></li>`;
}
function changePage(page) { currentPage = page; renderPaginatedTable(); }

// ----------------------------------------
// 📌 Admin: สรุปผลประเมิน (X̄ / S.D. / ข้อเขียน)
// ----------------------------------------
async function fetchEvaluationSummary() {
  const container = document.getElementById('eval-detail-container');
  container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-success"></div><div class="mt-2 text-muted">กำลังคำนวณทางสถิติ...</div></div>';
  const res = await callAPI('getEvaluationDashboardData');
  if (res.status === 'success') {
    globalEvalData = res;
    const select = document.getElementById('eval-target-select');
    select.innerHTML = '';
    res.speakers.forEach(spk => { select.innerHTML += `<option value="${spk.id}">${spk.name}</option>`; });
    if(res.speakers.length > 0) renderEvaluationDetail();
    else container.innerHTML = '<div class="text-center py-5 text-muted">ยังไม่มีข้อมูลการตั้งค่าวิทยากร</div>';
  } else { container.innerHTML = `<div class="text-danger text-center py-5">เกิดข้อผิดพลาด: ${res.message}</div>`; }
}

function renderEvaluationDetail() {
  const targetId = document.getElementById('eval-target-select').value;
  const container = document.getElementById('eval-detail-container');
  if(!targetId || !globalEvalData) return;

  const { questions, surveys } = globalEvalData;
  const targetSurveys = surveys.filter(s => s.targetId === targetId);
  const N = targetSurveys.length;

  if(N === 0) {
    container.innerHTML = `<div class="alert alert-warning text-center shadow-sm border-0"><i class="bi bi-info-circle"></i> ยังไม่มีผู้เข้าอบรมทำแบบประเมินสำหรับรายการนี้ครับ</div>`;
    return;
  }

  const expectedQType = targetId === 'PROJECT' ? 'PROJECT_SURVEY' : 'SPEAKER_SURVEY';
  let targetQuestions = [];
  for (let qId in questions) { if (questions[qId].type === expectedQType) targetQuestions.push({ q_id: qId, ...questions[qId] }); }

  let html = `<div class="mb-3 text-end"><span class="badge bg-primary fs-6 shadow-sm">จำนวนผู้ประเมิน: ${N} คน</span></div>`;
  const categories = [...new Set(targetQuestions.map(q => q.category))];
  let textResponses = []; 

  categories.forEach(cat => {
    html += `<h6 class="fw-bold text-success mt-4 mb-2"><i class="bi bi-bookmark-check"></i> ${cat}</h6>`;
    html += `<div class="table-responsive mb-4"><table class="table table-bordered table-hover align-middle bg-white shadow-sm" style="font-size:0.9rem;">`;
    html += `<thead class="table-light"><tr><th style="width:60%;">รายการประเมิน</th><th class="text-center">X̄</th><th class="text-center">S.D.</th><th class="text-center">แปลผล</th></tr></thead><tbody>`;
    
    const catQuestions = targetQuestions.filter(q => q.category === cat);
    catQuestions.forEach(q => {
      if (q.inputType === 'TEXT') {
        let texts = [];
        targetSurveys.forEach(s => { const ans = s.answers[q.q_id]; if(ans && ans.trim() !== '') texts.push(ans.trim()); });
        textResponses.push({ question: q.text, answers: texts });
      } else {
        let scores = [];
        targetSurveys.forEach(s => { const val = parseFloat(s.answers[q.q_id]); if(!isNaN(val)) scores.push(val); });
        
        let mean = 0, sd = 0; const count = scores.length;
        if(count > 0) {
          mean = scores.reduce((a,b)=>a+b, 0) / count;
          let variance = 0; if(count > 1) variance = scores.reduce((a,b)=>a+Math.pow(b-mean, 2), 0) / (count-1);
          sd = Math.sqrt(variance);
        }
        const interpret = (m) => { if(m >= 4.5) return 'มากที่สุด'; if(m >= 3.5) return 'มาก'; if(m >= 2.5) return 'ปานกลาง'; if(m >= 1.5) return 'น้อย'; return 'ปรับปรุง'; };

        html += `<tr><td>${q.text}</td><td class="text-center fw-bold text-primary">${count > 0 ? mean.toFixed(2) : '-'}</td><td class="text-center text-muted">${count > 0 ? sd.toFixed(2) : '-'}</td><td class="text-center"><span class="badge ${mean >= 3.5 ? 'bg-success' : 'bg-warning text-dark'}">${count > 0 ? interpret(mean) : '-'}</span></td></tr>`;
      }
    });
    html += `</tbody></table></div>`;
  });

  if (textResponses.length > 0) {
     html += `<h6 class="fw-bold text-primary mt-5 mb-3"><i class="bi bi-chat-quote-fill"></i> ข้อเสนอแนะปลายเปิด (รายข้อ)</h6>`;
     textResponses.forEach((tr, i) => {
        html += `<div class="card border-0 shadow-sm mb-3"><div class="card-header bg-light fw-bold">${i+1}. ${tr.question}</div><ul class="list-group list-group-flush">`;
        if(tr.answers.length === 0) { html += `<li class="list-group-item text-muted text-center small py-3">- ไม่มีผู้ให้ข้อเสนอแนะ -</li>`; } 
        else { tr.answers.forEach(ans => { html += `<li class="list-group-item small"><i class="bi bi-arrow-right-short text-success fs-5"></i> ${ans}</li>`; }); }
        html += `</ul></div>`;
     });
  }
  container.innerHTML = html;
}

function exportEvaluationToCSV() {
  const targetId = document.getElementById('eval-target-select').value;
  const selectObj = document.getElementById('eval-target-select'); const targetName = selectObj.options[selectObj.selectedIndex].text;
  if(!targetId || !globalEvalData) return;

  const { questions, surveys } = globalEvalData;
  const targetSurveys = surveys.filter(s => s.targetId === targetId);
  const expectedQType = targetId === 'PROJECT' ? 'PROJECT_SURVEY' : 'SPEAKER_SURVEY';
  
  let targetQuestions = [];
  for (let qId in questions) { if (questions[qId].type === expectedQType) targetQuestions.push({ q_id: qId, ...questions[qId] }); }

  let csvContent = `"รายงานผลการประเมิน: ${targetName}"\n`; csvContent += `"จำนวนผู้ประเมิน: ${targetSurveys.length} คน"\n\n`;
  csvContent += `"ตอนที่ 1: การประเมินระดับความพึงพอใจ"\n`; csvContent += `"หมวดหมู่","รายการประเมิน","N","Mean","S.D.","แปลผล"\n`;

  targetQuestions.filter(q => q.inputType !== 'TEXT').forEach(q => {
     let scores = []; targetSurveys.forEach(s => { const val = parseFloat(s.answers[q.q_id]); if(!isNaN(val)) scores.push(val); });
     const count = scores.length; let mean = 0, sd = 0;
     if(count > 0) { mean = scores.reduce((a,b)=>a+b, 0) / count; if(count > 1) sd = Math.sqrt(scores.reduce((a,b)=>a+Math.pow(b-mean, 2), 0) / (count-1)); }
     const interpret = (m) => { if(m >= 4.5) return 'มากที่สุด'; if(m >= 3.5) return 'มาก'; if(m >= 2.5) return 'ปานกลาง'; if(m >= 1.5) return 'น้อย'; return 'ปรับปรุง'; };
     csvContent += `"${q.category}","${q.text.replace(/"/g, '""')}","${count}","${count > 0 ? mean.toFixed(2) : '-'}","${count > 0 ? sd.toFixed(2) : '-'}","${count > 0 ? interpret(mean) : '-'}"\n`;
  });

  csvContent += `\n"ตอนที่ 2: ข้อเสนอแนะปลายเปิด"\n`;
  targetQuestions.filter(q => q.inputType === 'TEXT').forEach(q => {
     csvContent += `"${q.text.replace(/"/g, '""')}"\n`; let hasAns = false;
     targetSurveys.forEach(s => { const ans = s.answers[q.q_id]; if(ans && ans.trim() !== '') { csvContent += `"- ${ans.trim().replace(/"/g, '""')}"\n`; hasAns = true; } });
     if(!hasAns) csvContent += `"- ไม่มีข้อเสนอแนะ -"\n`; csvContent += `\n`;
  });

  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Evaluation_Report_${new Date().getTime()}.csv`; link.click();
}

// ==========================================
// 📌 6. ระบบจัดการข้อมูล (CRUD Operations)
// ==========================================
function handleImportCSV() {
  const file = document.getElementById('csvFileInput').files[0];
  if (!file) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์', 'warning');
  const reader = new FileReader(); Swal.fire({ title: 'กำลังประมวลผล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  reader.onload = async e => {
    const res = await callAPI('importCSV', { csvText: e.target.result });
    if (res.status === 'success') { Swal.fire('สำเร็จ', res.message, 'success'); document.getElementById('csvFileInput').value = ''; } 
    else { Swal.fire('เกิดข้อผิดพลาด', res.message, 'error'); }
  };
  reader.readAsText(file, 'UTF-8');
}

async function handleExportCSV() {
  Swal.fire({ title: 'กำลังดึงข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
  const res = await callAPI('exportCSV');
  if (res.status === 'success') {
    Swal.close(); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\uFEFF" + res.csvData], { type: 'text/csv;charset=utf-8;' })); link.download = res.filename; link.click();
  } else { Swal.fire('ข้อผิดพลาด', res.message, 'error'); }
}

async function loadConfigToUI() {
  const tbody = document.getElementById('config-table-body'); if(!tbody) return;
  const res = await callAPI('getRawAttendanceConfig');
  if (res.status === 'success') {
    tbody.innerHTML = '';
    res.data.forEach((row) => {
      const isChecked = row[7].toString().toUpperCase() === 'TRUE' ? 'checked' : '';
      tbody.innerHTML += `<tr><td class="d-none"><input type="hidden" class="config-id" value="${row[0]}"></td><td><select class="form-select form-select-sm config-slotid mx-auto text-center fw-bold text-secondary" style="width: 110px;"><option value="Morning" ${row[3] === 'Morning' ? 'selected' : ''}>Morning</option><option value="Afternoon" ${row[3] === 'Afternoon' ? 'selected' : ''}>Afternoon</option><option value="Evening" ${row[3] === 'Evening' ? 'selected' : ''}>Evening</option><option value="Checkout" ${row[3] === 'Checkout' ? 'selected' : ''}>Checkout</option></select></td><td><input type="number" class="form-control form-control-sm text-center mx-auto config-day" value="${row[1]}" style="width: 60px;"></td><td><input type="date" class="form-control form-control-sm config-date" value="${row[2]}"></td><td><input type="text" class="form-control form-control-sm config-label" value="${row[4]}"></td><td><input type="time" class="form-control form-control-sm config-start" value="${row[5]}"></td><td><input type="time" class="form-control form-control-sm config-end" value="${row[6]}"></td><td><div class="form-check form-switch d-flex justify-content-center m-0"><input class="form-check-input config-active" type="checkbox" style="cursor:pointer;" ${isChecked}></div></td><td><button class="btn btn-sm btn-outline-danger rounded-circle shadow-sm" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td></tr>`;
    });
  }
}

function addConfigRow() {
  const tbody = document.getElementById('config-table-body'); if(!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `<td class="d-none"><input type="hidden" class="config-id" value="CONF-NEW-${Math.floor(Math.random() * 10000)}"></td><td><select class="form-select form-select-sm config-slotid border-primary mx-auto text-center fw-bold text-primary" style="width: 110px;"><option value="Morning">Morning</option><option value="Afternoon">Afternoon</option><option value="Evening">Evening</option><option value="Checkout">Checkout</option></select></td><td><input type="number" class="form-control form-control-sm text-center mx-auto config-day" value="1" style="width: 60px;"></td><td><input type="date" class="form-control form-control-sm config-date"></td><td><input type="text" class="form-control form-control-sm config-label" value="รอบใหม่" placeholder="ชื่อรอบ..."></td><td><input type="time" class="form-control form-control-sm config-start" value="08:00"></td><td><input type="time" class="form-control form-control-sm config-end" value="16:00"></td><td><div class="form-check form-switch d-flex justify-content-center m-0"><input class="form-check-input config-active" type="checkbox" checked></div></td><td><button class="btn btn-sm btn-outline-danger rounded-circle shadow-sm" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td>`;
  tbody.appendChild(tr);
}

async function saveConfigFromUI() {
  Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
  const rows = document.querySelectorAll('#config-table-body tr'); let newConfigData = [];
  for(let tr of rows) {
    if(!tr.querySelector('.config-id')) continue; 
    newConfigData.push([tr.querySelector('.config-id').value, tr.querySelector('.config-day').value, tr.querySelector('.config-date').value, tr.querySelector('.config-slotid').value, tr.querySelector('.config-label').value, tr.querySelector('.config-start').value, tr.querySelector('.config-end').value, tr.querySelector('.config-active').checked ? 'TRUE' : 'FALSE']);
  }
  const res = await callAPI('saveRawAttendanceConfig', { configData: newConfigData });
  if (res.status === 'success') Swal.fire('สำเร็จ', res.message, 'success'); else Swal.fire('ข้อผิดพลาด', res.message, 'error');
}

async function loadExamConfigToUI() {
  const tbody = document.getElementById('exam-config-table-body'); if(!tbody) return;
  const res = await callAPI('getRawExamConfig');
  if (res.status === 'success') {
    tbody.innerHTML = '';
    const formatDT = (dtStr) => { if(!dtStr) return ""; let d = new Date(dtStr); if(isNaN(d.getTime())) { d = new Date(dtStr.replace(" ", "T")); if(isNaN(d.getTime())) return ""; } const pad = (n) => n.toString().padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    res.data.forEach((row) => {
      const isChecked = row[3].toString().toUpperCase() === 'TRUE' ? 'checked' : '';
      tbody.innerHTML += `<tr><td><select class="form-select form-select-sm exam-type mx-auto text-center fw-bold text-secondary" style="width: 150px;"><option value="PRE" ${row[0].toUpperCase() === 'PRE' ? 'selected' : ''}>PRE-TEST</option><option value="POST" ${row[0].toUpperCase() === 'POST' ? 'selected' : ''}>POST-TEST</option></select></td><td><input type="datetime-local" class="form-control form-control-sm exam-start mx-auto" value="${formatDT(row[1])}" style="max-width: 220px;"></td><td><input type="datetime-local" class="form-control form-control-sm exam-end mx-auto" value="${formatDT(row[2])}" style="max-width: 220px;"></td><td><div class="form-check form-switch d-flex justify-content-center m-0"><input class="form-check-input exam-active" type="checkbox" ${isChecked}></div></td><td><button class="btn btn-sm btn-outline-danger rounded-circle shadow-sm" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td></tr>`;
    });
  }
}

function addExamConfigRow() {
  const tbody = document.getElementById('exam-config-table-body'); if(!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><select class="form-select form-select-sm exam-type border-info mx-auto text-center fw-bold text-info" style="width: 150px;"><option value="PRE">PRE-TEST</option><option value="POST">POST-TEST</option></select></td><td><input type="datetime-local" class="form-control form-control-sm exam-start mx-auto" style="max-width: 220px;"></td><td><input type="datetime-local" class="form-control form-control-sm exam-end mx-auto" style="max-width: 220px;"></td><td><div class="form-check form-switch d-flex justify-content-center m-0"><input class="form-check-input exam-active" type="checkbox" checked></div></td><td><button class="btn btn-sm btn-outline-danger rounded-circle shadow-sm" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td>`;
  tbody.appendChild(tr);
}

async function saveExamConfigFromUI() {
  Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
  const rows = document.querySelectorAll('#exam-config-table-body tr'); let newConfigData = [];
  const revertDT = (dtStr) => { return dtStr ? dtStr.replace("T", " ") : ""; };
  for(let tr of rows) {
    if(!tr.querySelector('.exam-type')) continue; 
    newConfigData.push([tr.querySelector('.exam-type').value, revertDT(tr.querySelector('.exam-start').value), revertDT(tr.querySelector('.exam-end').value), tr.querySelector('.exam-active').checked ? 'TRUE' : 'FALSE']);
  }
  const res = await callAPI('saveRawExamConfig', { configData: newConfigData });
  if (res.status === 'success') Swal.fire('สำเร็จ', res.message, 'success'); else Swal.fire('ข้อผิดพลาด', res.message, 'error');
}

async function loadSpeakerConfigToUI() {
  const tbody = document.getElementById('speaker-config-table-body'); if(!tbody) return;
  const res = await callAPI('getRawSpeakerConfig');
  if (res.status === 'success') {
    tbody.innerHTML = '';
    const formatDT = (dtStr) => { if(!dtStr) return ""; let d = new Date(dtStr); if(isNaN(d.getTime())) { d = new Date(dtStr.replace(" ", "T")); if(isNaN(d.getTime())) return ""; } const pad = (n) => n.toString().padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    res.data.forEach(row => {
      const isChecked = row[5].toString().toUpperCase() === 'TRUE' ? 'checked' : '';
      tbody.innerHTML += `<tr><td><input type="text" class="form-control form-control-sm spk-id mx-auto text-center fw-bold" value="${row[0]}" style="width: 90px;"></td><td><input type="text" class="form-control form-control-sm spk-name" value="${row[1]}" placeholder="ชื่อ-สกุล" style="min-width: 180px;"></td><td><input type="text" class="form-control form-control-sm spk-topic" value="${row[2]}" placeholder="หัวข้อ" style="min-width: 250px;"></td><td><input type="datetime-local" class="form-control form-control-sm spk-start mx-auto" value="${formatDT(row[3])}" style="min-width: 180px;"></td><td><input type="datetime-local" class="form-control form-control-sm spk-end mx-auto" value="${formatDT(row[4])}" style="min-width: 180px;"></td><td><div class="form-check form-switch d-flex justify-content-center"><input class="form-check-input spk-active" type="checkbox" ${isChecked}></div></td><td><button class="btn btn-sm btn-outline-danger rounded-circle" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td></tr>`;
    });
  }
}

function addSpeakerConfigRow() {
  const tbody = document.getElementById('speaker-config-table-body'); if(!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input type="text" class="form-control form-control-sm spk-id mx-auto text-center fw-bold" value="SPK-${Math.floor(Math.random() * 1000)}" style="width: 90px;"></td><td><input type="text" class="form-control form-control-sm spk-name" placeholder="ชื่อ-สกุล" style="min-width: 180px;"></td><td><input type="text" class="form-control form-control-sm spk-topic" placeholder="หัวข้อที่บรรยาย" style="min-width: 250px;"></td><td><input type="datetime-local" class="form-control form-control-sm spk-start mx-auto" style="min-width: 180px;"></td><td><input type="datetime-local" class="form-control form-control-sm spk-end mx-auto" style="min-width: 180px;"></td><td><div class="form-check form-switch d-flex justify-content-center"><input class="form-check-input spk-active" type="checkbox" checked></div></td><td><button class="btn btn-sm btn-outline-danger rounded-circle" onclick="this.closest('tr').remove()"><i class="bi bi-trash3-fill"></i></button></td>`;
  tbody.appendChild(tr);
}

async function saveSpeakerConfigFromUI() {
  Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
  const rows = document.querySelectorAll('#speaker-config-table-body tr'); let newConfig = [];
  const revertDT = (dtStr) => { return dtStr ? dtStr.replace("T", " ") : ""; };
  for(let tr of rows) {
    if(!tr.querySelector('.spk-id')) continue;
    newConfig.push([tr.querySelector('.spk-id').value, tr.querySelector('.spk-name').value, tr.querySelector('.spk-topic').value, revertDT(tr.querySelector('.spk-start').value), revertDT(tr.querySelector('.spk-end').value), tr.querySelector('.spk-active').checked ? 'TRUE' : 'FALSE']);
  }
  const res = await callAPI('saveRawSpeakerConfig', { configData: newConfig });
  if (res.status === 'success') Swal.fire('สำเร็จ', res.message, 'success'); else Swal.fire('ข้อผิดพลาด', res.message, 'error');
}
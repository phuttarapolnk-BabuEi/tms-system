// ==========================================
// 1. API Gateway (Router หลักของระบบ)
// ==========================================
function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const payload = requestData.payload;
    let result;

    switch (action) {
      case 'loginUser': result = loginUser(payload.personalId); break;
      case 'recordAttendance': result = recordAttendanceSafe(payload.personalId, payload.dayNo, payload.timeSlot, payload.note); break;
      case 'getAttendanceSummary': result = getAttendanceSummary(); break;
      case 'getMissingPersons': result = getMissingPersons(payload.dayNo, payload.timeSlot); break;
      case 'getTraineeProgress': result = getTraineeProgress(); break;
      case 'getMentorData': result = getMentorData(payload.mentorId); break;
      case 'importCSV': result = importQuestionsFromCSV(payload.csvText); break;
      case 'exportCSV': result = exportProgressToCSV(); break;
      case 'getQuestions': result = getQuestionsBank(payload.qType); break;
      case 'getAttendanceConfig': result = getAttendanceConfig(payload.personalId); break;
      case 'getRawAttendanceConfig': result = getRawAttendanceConfig(); break;
      case 'saveRawAttendanceConfig': result = saveRawAttendanceConfig(payload.configData); break;
      case 'checkExamEligibility': result = checkExamEligibility(payload.personalId, payload.testType); break;
      case 'submitTestScore': result = submitTestScore(payload.personalId, payload.testType, payload.answers); break;
      case 'getRawExamConfig': result = getRawExamConfig(); break;
      case 'saveRawExamConfig': result = saveRawExamConfig(payload.configData); break;
      case 'getActiveSpeakers': result = getActiveSpeakers(); break;
      case 'checkSurveyEligibility': result = checkSurveyEligibility(payload.personalId, payload.targetId); break;
      case 'submitSurvey': result = submitSurvey(payload.personalId, payload.targetId, payload.answers); break;
      case 'getEvaluationDashboardData': result = getEvaluationDashboardData(); break;
      case 'getRawSpeakerConfig': result = getRawSpeakerConfig(); break;
      case 'saveRawSpeakerConfig': result = saveRawSpeakerConfig(payload.configData); break;
      default: throw new Error("Invalid Action Endpoint");
    }

    output.setContent(JSON.stringify(result));
    return output;
  } catch (error) {
    output.setContent(JSON.stringify({ status: 'error', message: error.message }));
    return output;
  }
}

// ==========================================
// 2. Business Logic (ตรรกะและระบบฐานข้อมูลหลัก)
// ==========================================
function loginUser(personalId) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0]; 
    const idIdx = headers.indexOf('personal_id');
    const nameIdx = headers.indexOf('name');
    const roleIdx = headers.indexOf('role');
    const areaIdx = headers.indexOf('Area_Service'); 
    
    if (idIdx === -1) return { status: 'error', message: 'ไม่พบคอลัมน์ personal_id ในตาราง Users' };
    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx].toString().trim() === personalId.toString().trim()) { 
        return { 
          status: 'success', 
          user: { 
            personal_id: data[i][idIdx], 
            name: data[i][nameIdx], 
            role: data[i][roleIdx],
            area_service: areaIdx !== -1 ? data[i][areaIdx] : '' 
          } 
        };
      }
    }
    return { status: 'error', message: 'ไม่พบรหัสประจำตัวนี้ในระบบ' };
  } catch (err) { return { status: 'error', message: err.message }; }
}

function recordAttendanceSafe(personalId, dayNo, timeSlot, note) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance_Log');
    const data = sheet.getDataRange().getValues();

    // 📌 ป้องกันลงเวลาซ้ำ
    for(let i = 1; i < data.length; i++) {
       if(data[i][1].toString() === personalId.toString() && data[i][2].toString() === dayNo.toString() && data[i][3].toString() === timeSlot.toString()) {
          return { status: 'error', message: 'คุณได้ลงเวลาในรอบนี้ไปเรียบร้อยแล้วครับ ✅' };
       }
    }

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    const logId = "ATT-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000);
    sheet.appendRow([logId, personalId, dayNo, timeSlot, timestamp, note]);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'บันทึกข้อมูลสำเร็จ' };
  } catch (error) { return { status: 'error', message: 'ระบบคิวเต็มชั่วคราว โปรดลองกดใหม่อีกครั้ง' }; } finally { lock.releaseLock(); }
}

function getAttendanceSummary() {
  try {
    const data = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance_Log').getDataRange().getValues();
    let stats = { 'Morning': 0, 'Afternoon': 0, 'Evening': 0, 'Checkout': 0 };
    for (let i = 1; i < data.length; i++) { if (stats[data[i][3]] !== undefined) stats[data[i][3]]++; }
    return { status: 'success', labels: ['เช้า', 'บ่าย', 'เย็น', 'สะท้อนผล'], values: [stats.Morning, stats.Afternoon, stats.Evening, stats.Checkout] };
  } catch (err) { return { status: 'error', message: err.message }; }
}

function getMissingPersons(dayNo, timeSlot) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const usersData = ss.getSheetByName('Users').getDataRange().getValues();
    const attData = ss.getSheetByName('Attendance_Log').getDataRange().getValues();
    const roleIdx = usersData[0].indexOf('role'); const idIdx = usersData[0].indexOf('personal_id');
    const nameIdx = usersData[0].indexOf('name'); const groupIdx = usersData[0].indexOf('group_target');

    let trainees = [];
    for (let i = 1; i < usersData.length; i++) {
      if (usersData[i][roleIdx].toString().trim().toUpperCase() === 'TRAINEE') trainees.push({ personal_id: usersData[i][idIdx].toString(), name: usersData[i][nameIdx], group: usersData[i][groupIdx] || '-' });
    }
    let attendedIds = new Set();
    for (let i = 1; i < attData.length; i++) {
      if (attData[i][2].toString() === dayNo.toString() && attData[i][3] === timeSlot) attendedIds.add(attData[i][1].toString());
    }
    return { status: 'success', data: trainees.filter(t => !attendedIds.has(t.personal_id)) };
  } catch (err) { return { status: 'error', message: err.message }; }
}

function getTraineeProgress() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const usersData = ss.getSheetByName('Users').getDataRange().getValues();
    const attData = ss.getSheetByName('Attendance_Log').getDataRange().getValues();
    let testData = []; const testSheet = ss.getSheetByName('Test_Scores'); if (testSheet) testData = testSheet.getDataRange().getValues();
    let surveyData = []; const surveySheet = ss.getSheetByName('Survey_Scores'); if (surveySheet) surveyData = surveySheet.getDataRange().getValues();

    let scheduleConfig = [];
    const confSheet = ss.getSheetByName('Attendance_Config');
    if (confSheet) {
      const confData = confSheet.getDataRange().getDisplayValues();
      let sMap = {};
      for (let i = 1; i < confData.length; i++) {
        let dayNo = confData[i][1];
        if (!sMap[dayNo]) sMap[dayNo] = { dayNo: dayNo, date: confData[i][2], slots: [] };
        sMap[dayNo].slots.push({ id: confData[i][3], label: confData[i][4] });
      }
      scheduleConfig = Object.keys(sMap).map(k => sMap[k]);
    }

    let spkMap = {};
    const spkSheet = ss.getSheetByName('Speakers_Config');
    if (spkSheet) {
      const spkData = spkSheet.getDataRange().getValues();
      for(let i=1; i<spkData.length; i++) spkMap[spkData[i][0]] = spkData[i][1]; 
    }

    const roleIdx = usersData[0].indexOf('role'); const idIdx = usersData[0].indexOf('personal_id');
    const nameIdx = usersData[0].indexOf('name'); const groupIdx = usersData[0].indexOf('group_target');
    const clusterIdx = usersData[0].indexOf('Cluster'); 

    let attMap = {};
    for (let i = 1; i < attData.length; i++) {
      const pId = attData[i][1].toString(); const dayNo = attData[i][2].toString(); const timeSlot = attData[i][3].toString();
      if (!attMap[pId]) attMap[pId] = {}; if (!attMap[pId][dayNo]) attMap[pId][dayNo] = {};
      attMap[pId][dayNo][timeSlot] = true; 
    }

    let testMap = {};
    if (testData.length > 1) {
      const tIdIdx = testData[0].indexOf('personal_id'); const tTypeIdx = testData[0].indexOf('test_type'); 
      const tScoreIdx = testData[0].indexOf('score'); const tMaxIdx = testData[0].indexOf('max_score'); 
      for (let i = 1; i < testData.length; i++) {
        const pId = testData[i][tIdIdx].toString(); const tType = testData[i][tTypeIdx].toString().toUpperCase();
        if (!testMap[pId]) testMap[pId] = {}; testMap[pId][tType] = `${testData[i][tScoreIdx]}/${testData[i][tMaxIdx]}`; 
      }
    }

    let surveyMap = {};
    if (surveyData.length > 1) {
      for(let i = 1; i < surveyData.length; i++) {
        const pId = surveyData[i][1].toString(); const target = surveyData[i][2].toString();
        if(!surveyMap[pId]) surveyMap[pId] = { speakersEvaluated: [], project: false };
        if(target === 'PROJECT') { surveyMap[pId].project = true; } 
        else { const spkName = spkMap[target] || target; if(!surveyMap[pId].speakersEvaluated.includes(spkName)) surveyMap[pId].speakersEvaluated.push(spkName); }
      }
    }

    let progressList = [];
    for (let i = 1; i < usersData.length; i++) {
      if (usersData[i][roleIdx].toString().trim().toUpperCase() === 'TRAINEE') {
        const pId = usersData[i][idIdx].toString();
        progressList.push({ id: pId, name: usersData[i][nameIdx], cluster: clusterIdx !== -1 ? usersData[i][clusterIdx] : '-', group: usersData[i][groupIdx] || '-', attendance: attMap[pId] || {}, testScore: testMap[pId] || {}, survey: surveyMap[pId] || { speakersEvaluated: [], project: false } });
      }
    }
    return { status: 'success', data: progressList, schedule: scheduleConfig };
  } catch (err) { return { status: 'error', message: err.message }; }
}

function getQuestionsBank(qType) {
  try {
    const data = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Questions_Bank').getDataRange().getValues();
    let questions = [];
    const targetType = qType.toString().trim().toUpperCase(); 
    
    for (let i = 1; i < data.length; i++) {
      const rowType = data[i][1].toString().trim().toUpperCase(); 
      
      // 📌 รองรับทั้งแบบใช้ข้อสอบรวม (TEST) และแบบแยก (PRE_TEST, POST_TEST)
      let isMatch = false;
      if (targetType === 'PRE' || targetType === 'POST') {
         if (rowType === 'TEST' || rowType === targetType + '_TEST') isMatch = true;
      } else {
         if (rowType === targetType) isMatch = true;
      }

      if (isMatch) {
        const rawOpts = [data[i][4], data[i][5], data[i][6], data[i][7], data[i][8]];
        const opts = rawOpts.filter(val => val !== "" && val !== null && val !== undefined);
        
        let inputType = 'RATING';
        if (rowType === 'TEST' || rowType === 'PRE_TEST' || rowType === 'POST_TEST') inputType = 'TEST_CHOICE';
        else if (opts.length === 1 && opts[0].toString().trim().toUpperCase() === 'TEXT') inputType = 'TEXT';
        else if (opts.length > 0) inputType = 'CHOICE'; 

        questions.push({ q_id: data[i][0], q_category: data[i][2], question: data[i][3], input_type: inputType, options: opts });
      }
    }
    return { status: 'success', data: questions };
  } catch (err) { return { status: 'error', message: err.message }; }
}

// ==========================================
// 3. ระบบทดสอบออนไลน์ (Exam System)
// ==========================================
function checkExamEligibility(personalId, testType) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const testSheet = ss.getSheetByName('Test_Scores');
    if (testSheet) {
      const data = testSheet.getDataRange().getValues();
      const idIdx = data[0].indexOf('personal_id'); const typeIdx = data[0].indexOf('test_type');
      for (let i = 1; i < data.length; i++) {
        if (data[i][idIdx].toString() === personalId.toString() && data[i][typeIdx].toString().toUpperCase() === testType) return { status: 'success', eligible: false, reason: 'completed', message: 'คุณได้ทำแบบทดสอบนี้ไปแล้ว ระบบได้บันทึกคะแนนเรียบร้อยครับ ✅' };
      }
    }
    let configSheet = ss.getSheetByName('Exam_Config');
    if (!configSheet) return { status: 'success', eligible: true }; 

    const configData = configSheet.getDataRange().getValues();
    const now = new Date();
    const typeCol = configData[0].indexOf('test_type'); const startCol = configData[0].indexOf('start_datetime');
    const endCol = configData[0].indexOf('end_datetime'); const activeCol = configData[0].indexOf('is_active');

    for (let i = 1; i < configData.length; i++) {
      if (configData[i][typeCol].toString().toUpperCase() === testType) {
        if (configData[i][activeCol].toString().toUpperCase() !== 'TRUE') return { status: 'success', eligible: false, reason: 'closed', message: 'ระบบยังไม่เปิดให้ทำแบบทดสอบในขณะนี้ครับ 🔒' };
        const startTime = new Date(configData[i][startCol]); const endTime = new Date(configData[i][endCol]);
        if (now < startTime) return { status: 'success', eligible: false, reason: 'early', message: `ระบบจะเปิดให้ทำแบบทดสอบเวลา ${Utilities.formatDate(startTime, "Asia/Bangkok", "HH:mm น.")} ครับ ⏳` };
        if (now > endTime) return { status: 'success', eligible: false, reason: 'late', message: 'หมดเวลาทำแบบทดสอบแล้วครับ ⏰' };
      }
    }
    return { status: 'success', eligible: true }; 
  } catch (err) { return { status: 'error', message: err.message }; }
}

function submitTestScore(personalId, testType, userAnswers) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const qSheet = ss.getSheetByName('Questions_Bank');
    const qData = qSheet.getDataRange().getValues();

    let score = 0; let maxScore = 0;
    for (let i = 1; i < qData.length; i++) {
      const rowType = qData[i][1].toString().trim().toUpperCase();
      
      // 📌 ข้อละ 2 คะแนน และรองรับการแยก PRE_TEST / POST_TEST
      if (rowType === 'TEST' || rowType === testType.toUpperCase() + '_TEST') {
        maxScore += 2; 
        const correctAns = qData[i][9].toString().trim().toUpperCase(); 
        const userAns = (userAnswers[qData[i][0]] || '').toString().trim().toUpperCase();
        if (userAns === correctAns) {
           score += 2; 
        }
      }
    }

    let tSheet = ss.getSheetByName('Test_Scores');
    if (!tSheet) { tSheet = ss.insertSheet('Test_Scores'); tSheet.appendRow(['log_id', 'personal_id', 'test_type', 'score', 'max_score', 'timestamp']); }

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    tSheet.appendRow(["TEST-" + new Date().getTime(), personalId, testType, score, maxScore, timestamp]);
    SpreadsheetApp.flush();

    return { status: 'success', message: `ทำแบบทดสอบเรียบร้อย ได้คะแนน ${score} / ${maxScore}`, score: score, maxScore: maxScore };
  } catch (err) { return { status: 'error', message: err.message }; } finally { lock.releaseLock(); }
}

// ==========================================
// 4. ระบบประเมิน (Evaluation System)
// ==========================================
function getActiveSpeakers() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Speakers_Config');
    if (!sheet) return { status: 'success', data: [] };
    const data = sheet.getDataRange().getValues();
    let speakers = [];
    for(let i=1; i<data.length; i++) {
      if(data[i][5].toString().toUpperCase() === 'TRUE') { 
        speakers.push({ id: data[i][0], name: data[i][1], topic: data[i][2], start: data[i][3], end: data[i][4] });
      }
    }
    return { status: 'success', data: speakers };
  } catch (err) { return { status: 'error', message: err.message }; }
}

function checkSurveyEligibility(personalId, targetId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Survey_Scores');
    if(sheet) {
       const data = sheet.getDataRange().getValues();
       for(let i=1; i<data.length; i++) {
          if(data[i][1].toString() === personalId.toString() && data[i][2].toString() === targetId.toString()) {
             return { status: 'success', eligible: false, message: 'คุณได้ประเมินรายการนี้ไปเรียบร้อยแล้วครับ ✅' };
          }
       }
    }

    if(targetId === 'PROJECT') {
        let configSheet = ss.getSheetByName('Exam_Config');
        if (configSheet) {
           const configData = configSheet.getDataRange().getValues();
           const now = new Date();
           const typeCol = configData[0].indexOf('test_type'); const startCol = configData[0].indexOf('start_datetime');
           const endCol = configData[0].indexOf('end_datetime'); const activeCol = configData[0].indexOf('is_active');

           for (let i = 1; i < configData.length; i++) {
             if (configData[i][typeCol].toString().toUpperCase() === 'PROJECT') {
               if (configData[i][activeCol].toString().toUpperCase() !== 'TRUE') return { status: 'success', eligible: false, message: 'ระบบยังไม่เปิดให้ทำแบบประเมินโครงการในขณะนี้ครับ 🔒' };
               const startTime = new Date(configData[i][startCol]); const endTime = new Date(configData[i][endCol]);
               if (now < startTime) return { status: 'success', eligible: false, message: `ระบบจะเปิดให้ทำแบบประเมินเวลา ${Utilities.formatDate(startTime, "Asia/Bangkok", "HH:mm น.")} ครับ ⏳` };
               if (now > endTime) return { status: 'success', eligible: false, message: 'หมดเวลาทำแบบประเมินแล้วครับ ⏰' };
             }
           }
        }
    }
    return { status: 'success', eligible: true };
  } catch(err) { return { status: 'error', message: err.message }; }
}

function submitSurvey(personalId, targetId, answers) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Survey_Scores');
    if (!sheet) { sheet = ss.insertSheet('Survey_Scores'); sheet.appendRow(['log_id', 'personal_id', 'target_id', 'answers_json', 'timestamp']); }
    
    const data = sheet.getDataRange().getValues();
    for(let i=1; i<data.length; i++) {
       if(data[i][1].toString() === personalId.toString() && data[i][2].toString() === targetId.toString()) {
          return { status: 'error', message: 'คุณได้ประเมินรายการนี้ไปเรียบร้อยแล้วครับ ✅' };
       }
    }
    
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    sheet.appendRow(["SURV-" + new Date().getTime(), personalId, targetId, JSON.stringify(answers), timestamp]);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'บันทึกผลการประเมินเรียบร้อยแล้ว ขอบคุณครับ' };
  } catch (err) { return { status: 'error', message: err.message }; } finally { lock.releaseLock(); }
}

function getEvaluationDashboardData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let speakers = [];
    const spkSheet = ss.getSheetByName('Speakers_Config');
    if (spkSheet) {
      const spkData = spkSheet.getDataRange().getValues();
      for(let i=1; i<spkData.length; i++) speakers.push({ id: spkData[i][0], name: spkData[i][1] + ' (' + spkData[i][2] + ')' });
    }
    speakers.push({ id: 'PROJECT', name: 'ภาพรวมโครงการทั้งหมด' });

    let questions = {};
    const qSheet = ss.getSheetByName('Questions_Bank');
    if (qSheet) {
      const qData = qSheet.getDataRange().getValues();
      for(let i=1; i<qData.length; i++) {
        const qType = qData[i][1].toString().trim().toUpperCase();
        if(qType === 'SPEAKER_SURVEY' || qType === 'PROJECT_SURVEY') {
          const rawOpts = [qData[i][4], qData[i][5], qData[i][6], qData[i][7], qData[i][8]];
          const opts = rawOpts.filter(val => val !== "" && val !== null && val !== undefined);
          
          let inputType = 'RATING';
          if (opts.length === 1 && opts[0].toString().trim().toUpperCase() === 'TEXT') inputType = 'TEXT';
          else if (opts.length > 0) inputType = 'CHOICE';
          questions[qData[i][0]] = { type: qType, category: qData[i][2], text: qData[i][3], inputType: inputType, options: opts };
        }
      }
    }

    let surveys = [];
    const sSheet = ss.getSheetByName('Survey_Scores');
    if (sSheet) {
      const sData = sSheet.getDataRange().getValues();
      for(let i=1; i<sData.length; i++) {
        let ans = {}; try { ans = JSON.parse(sData[i][3] || "{}"); } catch(e){}
        surveys.push({ targetId: sData[i][2].toString(), answers: ans });
      }
    }
    return { status: 'success', speakers: speakers, questions: questions, surveys: surveys };
  } catch (err) { return { status: 'error', message: err.message }; }
}

function getMentorData(mentorId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const usersData = ss.getSheetByName('Users').getDataRange().getValues();
    const attData = ss.getSheetByName('Attendance_Log').getDataRange().getDisplayValues();
    const uHeaders = usersData[0];
    
    const idIdx = uHeaders.indexOf('personal_id'); 
    const nameIdx = uHeaders.indexOf('name');
    const roleIdx = uHeaders.indexOf('role'); 
    const mentorIdx = uHeaders.indexOf('mentor_id');
    const linkIdx = uHeaders.indexOf('Link_Table'); 
    const areaIdx = uHeaders.indexOf('Area_Service'); 
    const clusterIdx = uHeaders.indexOf('Cluster'); 
    const groupIdx = uHeaders.indexOf('group_target'); 

    let scheduleConfig = [];
    const confSheet = ss.getSheetByName('Attendance_Config');
    if (confSheet) {
      const confData = confSheet.getDataRange().getDisplayValues();
      let sMap = {};
      for (let i = 1; i < confData.length; i++) {
        let dayNo = confData[i][1];
        if (!sMap[dayNo]) sMap[dayNo] = { dayNo: dayNo, date: confData[i][2] };
      }
      scheduleConfig = Object.keys(sMap).map(k => sMap[k]);
    }

    let mentorLink = "";
    for (let i = 1; i < usersData.length; i++) {
      if (usersData[i][idIdx].toString().trim() === mentorId.toString().trim()) {
         mentorLink = linkIdx !== -1 ? usersData[i][linkIdx] : "";
         break;
      }
    }

    let myTrainees = new Set(); 
    let myTraineeDetails = {};
    let traineesInfo = []; 

    for (let i = 1; i < usersData.length; i++) {
      if (usersData[i][roleIdx].toString().trim().toUpperCase() === 'TRAINEE') {
        const assignedMentors = usersData[i][mentorIdx].toString().split(',').map(m => m.trim());
        const currentMentor = mentorId.toString().trim();
        
        if (assignedMentors.includes(currentMentor)) {
          const pId = usersData[i][idIdx].toString(); 
          myTrainees.add(pId); 
          myTraineeDetails[pId] = usersData[i][nameIdx];
          
          traineesInfo.push({
             id: pId,
             name: usersData[i][nameIdx],
             area: areaIdx !== -1 ? usersData[i][areaIdx] : '-',
             cluster: clusterIdx !== -1 ? usersData[i][clusterIdx] : '-',
             group: groupIdx !== -1 ? usersData[i][groupIdx] : '-'
          });
        }
      }
    }

    let logs = [];
    for (let i = 1; i < attData.length; i++) {
      const attId = attData[i][1].toString();
      if (myTrainees.has(attId)) {
        logs.push({ personal_id: attId, name: myTraineeDetails[attId], day_no: attData[i][2], time_slot: attData[i][3], timestamp: attData[i][4] });
      }
    }
    logs.reverse();
    return { status: 'success', data: logs, totalTrainees: myTrainees.size, schedule: scheduleConfig, mentorLink: mentorLink, traineesInfo: traineesInfo };
  } catch (err) { return { status: 'error', message: err.message }; }
}

// ==========================================
// 5. ระบบจัดการ Config & CSV
// ==========================================
function getAttendanceConfig(personalId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Attendance_Config');
    if (!sheet) throw new Error("ไม่พบตาราง Attendance_Config");

    const now = new Date(); 
    const currentDate = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd"); 
    const currentTime = Utilities.formatDate(now, "Asia/Bangkok", "HH:mm");
    
    const data = sheet.getDataRange().getDisplayValues(); 
    let scheduleMap = {};
    for (let i = 1; i < data.length; i++) {
      let dayNo = data[i][1]; let isActive = data[i][7].toString().toUpperCase() === 'TRUE';
      if (!isActive) continue;
      if (!scheduleMap[dayNo]) scheduleMap[dayNo] = { dayNo: dayNo, date: data[i][2], slots: [] };
      scheduleMap[dayNo].slots.push({ id: data[i][3], label: data[i][4], start: data[i][5], end: data[i][6] });
    }

    let checkedInSlots = [];
    if (personalId) {
       const attSheet = ss.getSheetByName('Attendance_Log');
       if (attSheet) {
         const attData = attSheet.getDataRange().getValues();
         for (let i = 1; i < attData.length; i++) {
            if (attData[i][1].toString() === personalId.toString()) {
               checkedInSlots.push(attData[i][2].toString() + '_' + attData[i][3].toString()); 
            }
         }
       }
    }

    return { status: 'success', schedule: Object.keys(scheduleMap).map(key => scheduleMap[key]), serverDate: currentDate, serverTime: currentTime, checkedInSlots: checkedInSlots };
  } catch (err) { return { status: 'error', message: err.message }; }
}

function getRawAttendanceConfig() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance_Config');
    if (!sheet) throw new Error("ไม่พบตาราง Attendance_Config");
    const data = sheet.getDataRange().getDisplayValues(); data.shift(); 
    return { status: 'success', data: data };
  } catch (err) { return { status: 'error', message: err.message }; }
}

function saveRawAttendanceConfig(configData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance_Config');
    if (!sheet) throw new Error("ไม่พบตาราง Attendance_Config");
    const maxRows = sheet.getMaxRows(); const maxCols = sheet.getMaxColumns();
    if (maxRows > 1) sheet.getRange(2, 1, maxRows - 1, maxCols).clearContent(); 
    if (configData && Array.isArray(configData) && configData.length > 0) sheet.getRange(2, 1, configData.length, configData[0].length).setValues(configData);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'บันทึกการตั้งค่าเวลาสำเร็จเรียบร้อยแล้ว' };
  } catch (err) { return { status: 'error', message: err.message }; } finally { lock.releaseLock(); }
}

function getRawExamConfig() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Exam_Config');
    if (!sheet) throw new Error("ไม่พบตาราง Exam_Config");
    const data = sheet.getDataRange().getDisplayValues(); data.shift(); 
    return { status: 'success', data: data };
  } catch (err) { return { status: 'error', message: err.message }; }
}

function saveRawExamConfig(configData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Exam_Config');
    if (!sheet) { sheet = ss.insertSheet('Exam_Config'); sheet.appendRow(['test_type', 'start_datetime', 'end_datetime', 'is_active']); }
    const maxRows = sheet.getMaxRows(); const maxCols = Math.max(sheet.getMaxColumns(), 4);
    if (maxRows > 1) sheet.getRange(2, 1, maxRows - 1, maxCols).clearContent(); 
    if (configData && Array.isArray(configData) && configData.length > 0) sheet.getRange(2, 1, configData.length, configData[0].length).setValues(configData);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'บันทึกการตั้งค่าเวลาสอบ/ประเมินสำเร็จเรียบร้อยแล้ว' };
  } catch (err) { return { status: 'error', message: err.message }; } finally { lock.releaseLock(); }
}

function getRawSpeakerConfig() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Speakers_Config');
    if (!sheet) throw new Error("ไม่พบตาราง Speakers_Config");
    const data = sheet.getDataRange().getDisplayValues(); data.shift(); 
    return { status: 'success', data: data };
  } catch (err) { return { status: 'error', message: err.message }; }
}

function saveRawSpeakerConfig(configData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Speakers_Config');
    if (!sheet) { sheet = ss.insertSheet('Speakers_Config'); sheet.appendRow(['spk_id', 'spk_name', 'spk_topic', 'eval_start', 'eval_end', 'is_active']); }
    const maxRows = sheet.getMaxRows(); const maxCols = Math.max(sheet.getMaxColumns(), 6);
    if (maxRows > 1) sheet.getRange(2, 1, maxRows - 1, maxCols).clearContent(); 
    if (configData && Array.isArray(configData) && configData.length > 0) sheet.getRange(2, 1, configData.length, configData[0].length).setValues(configData);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'บันทึกรายชื่อวิทยากรเรียบร้อยแล้ว' };
  } catch (err) { return { status: 'error', message: err.message }; } finally { lock.releaseLock(); }
}

function importQuestionsFromCSV(csvText) {
  try {
    const csvData = Utilities.parseCsv(csvText);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Questions_Bank') || ss.insertSheet('Questions_Bank');
    sheet.clear(); 
    sheet.getRange(1, 1, csvData.length, csvData[0].length).setValues(csvData);
    return { status: 'success', message: `นำเข้าข้อมูล ${csvData.length - 1} รายการ เรียบร้อยแล้ว` };
  } catch (err) { return { status: 'error', message: err.message }; }
}

function exportProgressToCSV() {
  try {
    const data = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance_Log').getDataRange().getDisplayValues();
    let csvString = "";
    for (let i = 0; i < data.length; i++) {
      const row = data[i].map(cell => '"' + cell.toString().replace(/"/g, '""') + '"');
      csvString += row.join(",") + "\n";
    }
    return { status: 'success', csvData: csvString, filename: 'TMS_Report_' + new Date().getTime() + '.csv' };
  } catch (err) { return { status: 'error', message: err.message }; }
}

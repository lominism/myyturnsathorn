// --- CONFIGURATION ---

const CALENDAR_IDS = {
  "Benz": "c320c146a3133eb9714ba4abf3849df1be6185b9eb3e4aab8546e4eb7640cdfd@group.calendar.google.com",
  "Louis": "7b24bc8ff869f13afbf991ce4f63ca38a0f35901323e22f28d01e70494175f18@group.calendar.google.com",
  "Mile": "0c2d26f3d7de3dfacc5815f1f376f08f89ea9b9308a9a9de0464358cf64bbd95@group.calendar.google.com",
  "Mos": "eb78e8b7d97aef501f02c2dfef5c1c42545b08f61733c29f3578cda5263c81cf@group.calendar.google.com",
  "Prame": "166ffbbe84d242afbb076ebb44de80ce5b2e468a8594f11aee5295703e4709e3@group.calendar.google.com",
  "Chaway": "0db57883884edf4de185e2b821382ff168508657082bb29ca38051f2f0c03963@group.calendar.google.com",
  "Wash&Dry": "bd2634f75eb1c119876325e54d0822a3b164e82baa48cfe8d9cad4a331d903fb@group.calendar.google.com"
};

const ADMIN_LINE_USER_ID = "U64c6bfc04462368648f7649155086fdc";

const ALL_SLOTS = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
];

function doGet(e) {
  var action = e.parameter ? e.parameter.action : null;
  
  try {
    // 1. Month Status
    if (action === "getMonthStatus") {
      var stylist = e.parameter.stylist;
      var year = parseInt(e.parameter.year, 10);
      var month = parseInt(e.parameter.month, 10);
      var result = getMonthStatus(stylist, year, month);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    } 
    
    // 2. Available Times
    if (action === "getAvailableTimes") {
      var stylist = e.parameter.stylist;
      var date = e.parameter.date;
      var duration = parseInt(e.parameter.duration, 10) || 60;
      var result = getAvailableTimes(stylist, date, duration);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({error: "Unknown action"})).setMimeType(ContentService.MimeType.JSON);
}

// 3. Handle Form Submission
function doPost(e) {
  try {
    var bookingData = JSON.parse(e.postData.contents);
    var responseObj = saveBooking(bookingData);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true, 
      details: responseObj.details, 
      debugInfo: responseObj.debugInfo
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, 
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Returns the availability status for each day in the given month/year for a stylist.
 * Status: 'green' (>50% free), 'yellow' (>0% free), 'red' (0% free).
 */
function getMonthStatus(stylist, year, month) {
  var statusMap = {};
  var calendarId = CALENDAR_IDS[stylist];
  if (!calendarId) return statusMap;

  var calendar;
  try {
    calendar = CalendarApp.getCalendarById(calendarId);
  } catch (e) {
    return statusMap;
  }
  if (!calendar) return statusMap;

  var monthStr = (month + 1).toString().padStart(2, "0");
  var yearStr = year.toString();
  var isoStart = yearStr + "-" + monthStr + "-01T00:00:00+07:00";
  var startDate = new Date(isoStart);

  var nextMonth = month + 1;
  var nextYear = year;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear++;
  }
  var nextMonthStr = (nextMonth + 1).toString().padStart(2, "0");
  var nextYearStr = nextYear.toString();
  var isoEnd = nextYearStr + "-" + nextMonthStr + "-01T00:00:00+07:00";
  var endDate = new Date(isoEnd);

  var events = calendar.getEvents(startDate, endDate);
  
  var dailyBookedMinutes = {}; 

  events.forEach(function(event) {
    var eventStart = event.getStartTime();
    var eventEnd = event.getEndTime();

    if (event.isAllDayEvent()) {
      var s = eventStart.getTime();
      var e = eventEnd.getTime();
      // All day events end at midnight the day after. Loop through each day it spans.
      for (var t = s; t < e; t += 24 * 60 * 60 * 1000) {
        var dStr = Utilities.formatDate(new Date(t), "GMT+7", "yyyy-MM-dd");
        if (!dailyBookedMinutes[dStr]) dailyBookedMinutes[dStr] = 0;
        dailyBookedMinutes[dStr] += 9999; // block the entire day by exceeding capacity
      }
      return;
    }
    
    var formattedDate = Utilities.formatDate(eventStart, "GMT+7", "yyyy-MM-dd");
    
    var durationMinutes = (eventEnd.getTime() - eventStart.getTime()) / (1000 * 60);
    
    if (!dailyBookedMinutes[formattedDate]) {
      dailyBookedMinutes[formattedDate] = 0;
    }
    dailyBookedMinutes[formattedDate] += durationMinutes;
  });

  // Calculate TOTAL_MINUTES based on our 30 min slots
  const TOTAL_MINUTES = ALL_SLOTS.length * 30; // 18 slots * 30 mins = 540 mins (9 hours)
  
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  for (var i = 1; i <= daysInMonth; i++) {
    var dStr = yearStr + "-" + monthStr + "-" + i.toString().padStart(2, "0");
    var dateObj = new Date(yearStr + "-" + monthStr + "-" + i.toString().padStart(2, "0") + "T00:00:00+07:00");
    
    // Check if it's Wednesday (3)
    if (dateObj.getDay() === 3) {
      statusMap[dStr] = 'red';
      continue;
    }

    var booked = dailyBookedMinutes[dStr] || 0;
    var freeMinutes = TOTAL_MINUTES - booked;
    var percentageFree = freeMinutes / TOTAL_MINUTES;

    if (percentageFree > 0.5) {
      statusMap[dStr] = 'green';
    } else if (percentageFree > 0) { 
      statusMap[dStr] = 'yellow';
    } else {
      statusMap[dStr] = 'red';
    }
  }

  return statusMap;
}

function getAvailableTimes(stylist, date, serviceDurationMinutes) {
  var calendarId = CALENDAR_IDS[stylist];
  var requiredDuration = serviceDurationMinutes || 60;
  // 1 slot = 30 minutes now
  var requiredSlots = requiredDuration / 30; 

  if (!calendarId) {
    return ALL_SLOTS.map(function(slot) {
      return { time: slot, available: true }; // Just return true if no calendar linked yet so UI works for other stylists
    });
  }

  var calendar;
  try {
    calendar = CalendarApp.getCalendarById(calendarId);
  } catch (e) {
    return ALL_SLOTS.map(function(slot) {
      return { time: slot, available: true };
    });
  }
  if (!calendar) {
    return ALL_SLOTS.map(function(slot) {
      return { time: slot, available: true };
    });
  }

  var isoStart = date + "T00:00:00+07:00";
  var isoEnd = date + "T23:59:59+07:00";
  var dStart = new Date(isoStart);
  var dEnd = new Date(isoEnd);

  // Check if it's Wednesday (3)
  if (dStart.getDay() === 3) {
    return ALL_SLOTS.map(function(slot) {
      return { time: slot, available: false };
    });
  }

  var events = calendar.getEvents(dStart, dEnd);
  
  var occupiedSlots = []; 
  
  var now = new Date();
  var todayStr = Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd");
  var isToday = (date === todayStr);
  var currentMins = 0;
  if (isToday) {
    var h = parseInt(Utilities.formatDate(now, "GMT+7", "HH"), 10);
    var m = parseInt(Utilities.formatDate(now, "GMT+7", "mm"), 10);
    // Use exact current time without buffer
    currentMins = h * 60 + m; 
  }

  ALL_SLOTS.forEach(function(slotTime) {
    if (isToday) {
      var p = slotTime.split(":");
      var slotStartMins = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
      if (slotStartMins < currentMins) {
         if (!occupiedSlots.includes(slotTime)) {
             occupiedSlots.push(slotTime);
         }
      }
    }
  });

  events.forEach(function(event) {
    if (event.isAllDayEvent()) {
      // If it's an all-day event, push every single slot into the occupied list
      for (var i = 0; i < ALL_SLOTS.length; i++) {
        if (!occupiedSlots.includes(ALL_SLOTS[i])) {
          occupiedSlots.push(ALL_SLOTS[i]);
        }
      }
      return;
    }
    
    var eventStartStr = Utilities.formatDate(event.getStartTime(), "GMT+7", "HH:mm");
    var eventEndStr = Utilities.formatDate(event.getEndTime(), "GMT+7", "HH:mm");
    
    for (var i = 0; i < ALL_SLOTS.length; i++) {
        var slotTime = ALL_SLOTS[i];
        
        var parseTime = function(tStr) {
            var p = tStr.split(":");
            return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
        };
        
        var slotStartMins = parseTime(slotTime);
        var slotEndMins = slotStartMins + 30; // 30 min duration for each base slot
        var evStartMins = parseTime(eventStartStr);
        var evEndMins = parseTime(eventEndStr);
        
        if (evStartMins < slotEndMins && evEndMins > slotStartMins) {
            if (!occupiedSlots.includes(slotTime)) {
                occupiedSlots.push(slotTime);
            }
        }
    }
  });

  var validStartTimes = filterSlotsForDuration(ALL_SLOTS, occupiedSlots, requiredSlots);
  
  return ALL_SLOTS.map(function(slot) {
    return {
      time: slot,
      available: validStartTimes.includes(slot)
    };
  });
}

function filterSlotsForDuration(allSlots, occupiedSlots, requiredSlots) {
  var validStartTimes = [];

  for (var i = 0; i < allSlots.length; i++) {
    var startSlot = allSlots[i];
    var isSequenceFree = true;

    for (var j = 0; j < requiredSlots; j++) {
      var checkIndex = i + j;
      if (checkIndex >= allSlots.length) {
        isSequenceFree = false; 
        break;
      }
      var checkSlot = allSlots[checkIndex];
      if (occupiedSlots.includes(checkSlot)) {
        isSequenceFree = false;
        break;
      }
    }

    if (isSequenceFree) {
      validStartTimes.push(startSlot);
    }
  }

  return validStartTimes;
}

function saveBooking(bookingData) {
  var calendarId = CALENDAR_IDS[bookingData.stylist];
  if (!calendarId) {
    throw new Error("Stylist calendar not found.");
  }
  
  var calendar;
  try {
      calendar = CalendarApp.getCalendarById(calendarId);
  } catch (e) {
      throw new Error("Could not access Google Calendar.");
  }
  
  if (!calendar) {
      throw new Error("Could not access Google Calendar.");
  }

  var allSlotsStatus = getAvailableTimes(bookingData.stylist, bookingData.date, bookingData.duration);
  var selectedSlot = allSlotsStatus.find(s => s.time === bookingData.time);
  
  if (!selectedSlot || !selectedSlot.available) {
    throw new Error("This slot is no longer available (it might overlap with another booking). Please choose another time.");
  }

  var isoStart = bookingData.date + "T" + bookingData.time + ":00+07:00";
  var startDate = new Date(isoStart);
  
  var duration = bookingData.duration || 60;
  var endDate = new Date(startDate.getTime() + duration * 60000);

  var genderFull = bookingData.gender === "M" ? "Male" : "Female";
  var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var dayName = days[startDate.getDay()];
  
  var endTimeStr = Utilities.formatDate(endDate, "GMT+7", "HH:mm");
  var dateStr = Utilities.formatDate(startDate, "GMT+7", "dd/MM/yyyy");
  var timeStr = dayName + " " + dateStr + ", " + bookingData.time + "-" + endTimeStr;

  var genderInitial = bookingData.gender === "M" ? "M" : "W";
  var genderLabel = bookingData.gender === "M" ? "Men's Hairstyles" : "Women's Hairstyles";
  var title = bookingData.name + " - " + genderInitial;
  
  var description = "Name: " + bookingData.name +
                    "\nPhone: " + bookingData.phone + 
                    "\n" + genderLabel +
                    "\nStylist: " + bookingData.stylist +
                    "\nService: " + bookingData.service +
                    "\nTime: " + timeStr;
  
  // 1. Send Booking to Google Calendar
  // We will create the event AFTER we send the line messages, so we can log the pushDebug to the calendar description!
  // However, since we need to save the booking first, let's keep it here but we can update it later.
  var event = calendar.createEvent(title, startDate, endDate, {
      description: description
  });
  
  // 2. Format exact confirmation text
  var fullMessage = "Booking Made\n" +
                    "You have successfully made your appointment. Please wait for admin to make final confirmation.\n\n" + 
                    description + 
                    "\n\nสำหรับการจองคิวใช้บริการครั้งแรกกับทางร้าน Myyturn Sathorn ทางร้านขออนุญาตเรียกเก็บค่ามัดจำสำหรับบริการ Haircut จำนวน 500 บาท\n\n" +
                    "รายละเอียดบัญชีสำหรับโอนมัดจำ\n\n" +
                    "บัญชี: บริษัท มายเทิร์น สาทร จำกัด\n" +
                    "เลขที่บัญชี: 203-1-63832-4\n\n" +
                    "หลังจากโอนเงินเรียบร้อยแล้ว กรุณาแนบสลิปการโอนเงินเพื่อยืนยันการจองคิวขอบคุณค่ะ🙏🏻☺️";
  
  // 3. Push Message via LINE API (only if we have their userId)
  var lineToken = "/MXTteuDdL/CR6iUlJfuerYo9kGTNln+8UDoYWHqPdCE+38NeFzWEgnsLEDOaZ1dKREeDwJy6biIoYtHU7ncuTIXsZboPjAGRqA/6eCmn30JyC4aIxms7KZpn3CUVJaMib0fAivwAjVstCMEgFkNAgdB04t89/1O/w1cDnyilFU="; // <--- UPDATE THIS
  
  var pushDebug = "Did not attempt to push. Missing user ID.";
  if (bookingData.lineUserId && lineToken !== "PASTE_YOUR_LINE_CHANNEL_ACCESS_TOKEN_HERE") {
    var url = 'https://api.line.me/v2/bot/message/push';
    var payload = {
      'to': bookingData.lineUserId,
      'messages': [{
        'type': 'text',
        'text': fullMessage
      }]
    };
    var options = {
      'headers': {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + lineToken
      },
      'method': 'post',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };
    try {
        var response = UrlFetchApp.fetch(url, options);
        pushDebug = "LINE API Response: " + response.getResponseCode() + " " + response.getContentText();
    } catch(e) {
        pushDebug = "Apps Script Error: " + e.message;
    }
  }

  // 3b. Push Message to ADMIN
  Utilities.sleep(500); // Wait 500ms before sending the second message
  if (ADMIN_LINE_USER_ID && lineToken !== "PASTE_YOUR_LINE_CHANNEL_ACCESS_TOKEN_HERE") {
    var adminUrl = 'https://api.line.me/v2/bot/message/push';
    var adminPayload = {
      'to': ADMIN_LINE_USER_ID,
      'messages': [{
        'type': 'text',
        'text': "📢 New Booking Alert!\n\n" + fullMessage
      }]
    };
    var adminOptions = {
      'headers': {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + lineToken
      },
      'method': 'post',
      'payload': JSON.stringify(adminPayload),
      'muteHttpExceptions': true
    };
    try {
        UrlFetchApp.fetch(adminUrl, adminOptions);
    } catch(e) {
        Logger.log("Admin Push Error: " + e.message);
    }
  }

  // 3c. Append debug info to calendar description
  try {
      event.setDescription(description + "\n\n--- DEBUG INFO ---\n" + pushDebug);
  } catch(e) {}
  
  // 4. Return Data Object directly to doPost
  return { details: description, debugInfo: pushDebug };
}

// DEDICATED FUNCTION TO TEST LINE BROADCAST MESSAGING
function testLineMessage() {
  var lineToken = "/MXTteuDdL/CR6iUlJfuerYo9kGTNln+8UDoYWHqPdCE+38NeFzWEgnsLEDOaZ1dKREeDwJy6biIoYtHU7ncuTIXsZboPjAGRqA/6eCmn30JyC4aIxms7KZpn3CUVJaMib0fAivwAjVstCMEgFkNAgdB04t89/1O/w1cDnyilFU=";
  
  // This broadcasts to ALL friends of the Bot! No User ID is required.
  var url = 'https://api.line.me/v2/bot/message/broadcast';
  var payload = {
    'messages': [{
      'type': 'text',
      'text': 'Hello! This is a test broadcast from Google Apps Script!'
    }]
  };
  
  var options = {
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + lineToken
    },
    'method': 'post',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    Logger.log("Response Code: " + response.getResponseCode());
    Logger.log("Response Body: " + response.getContentText());
  } catch(e) {
    Logger.log("Error: " + e.message);
  }
}
/**
 * Enfinity — Leave Applications sync
 * ----------------------------------
 * Appends APPROVED leaves from the dashboard into the "LEAVE APPLICATIONS" tab,
 * matching its columns exactly:
 *   Timestamp | Email Address | Name | Type of leave | Start date | End date |
 *   Duration | Reason | Additional email | Approval | Notified status
 *
 * DEPLOY (one time):
 *   1. Open the sheet → Extensions → Apps Script.
 *   2. Paste this whole file into Code.gs (replace what's there), Save.
 *   3. Deploy → New deployment → type "Web app".
 *        Execute as:  Me
 *        Who has access:  Anyone
 *      → Deploy → copy the Web app URL (ends with /exec).
 *   4. In the dashboard: Customize → Webhook URLs →
 *      "Leave Applications Sheet" → paste the /exec URL → Apply Changes.
 *   (Send me the URL and I can set it for you instead.)
 *
 * To test without the dashboard, run `testAppend` once (it appends a sample row,
 * then delete that row).
 */

var SPREADSHEET_ID = '1R4tuorHGkf9SglPY42GrDwO-93dq4j4-j6huV_KCfMw';
var SHEET_NAME     = 'LEAVE APPLICATIONS';   // matched by name; falls back to the gid below
var SHEET_GID      = 244953909;

function doPost(e) {
  try {
    var body = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var p = JSON.parse(body);
    // Only handle leave-application payloads (ignore anything else posted here).
    if (p.target && p.target !== 'leave-applications') {
      return _json({ ok: true, skipped: true });
    }
    var sheet = _sheet();
    var tz = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone() || 'Asia/Manila';

    var row = [
      Utilities.formatDate(new Date(), tz, 'M/d/yyyy H:mm:ss'), // Timestamp
      p.email || '',                                            // Email Address
      p.name || '',                                             // Name
      p.type || '',                                             // Type of leave
      _fmtDate(p.start_date, tz),                               // Start date
      _fmtDate(p.end_date || p.start_date, tz),                 // End date
      p.duration || 'Full day',                                 // Duration
      p.reason || '',                                           // Reason
      p.additional_email || '',                                 // Additional email
      p.approval || 'Approved',                                 // Approval
      p.notified || ''                                          // Notified status
    ];
    sheet.appendRow(row);
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function doGet() { return _json({ ok: true, service: 'leave-applications' }); }

function _sheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var s = ss.getSheetByName(SHEET_NAME);
  if (s) return s;
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) if (all[i].getSheetId() === SHEET_GID) return all[i];
  throw new Error('Sheet "' + SHEET_NAME + '" not found');
}

// 'YYYY-MM-DD' -> 'M/D/YYYY' to match the existing rows. Passes anything else through.
function _fmtDate(v, tz) {
  if (!v) return '';
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (!m) return String(v);
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Utilities.formatDate(d, tz, 'M/d/yyyy');
}

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// One-off manual check.
function testAppend() {
  doPost({ postData: { contents: JSON.stringify({
    target: 'leave-applications', email: 'test@enfinity.co', name: 'Test Rep',
    type: 'Vacation', start_date: '2026-07-25', end_date: '2026-07-25',
    duration: 'Full day', reason: 'Apps Script test row — delete me',
    approval: 'Approved', notified: ''
  }) } });
}

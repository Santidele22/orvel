/**
 * Waitlist webhook for Google Sheets.
 *
 * Bind this script to a Google Sheet (Extensions > Apps Script from the sheet).
 * Set script property WAITLIST_SECRET to the same value as server env WAITLIST_SHEETS_SECRET.
 * Deploy as a web app (Execute as: Me, Who has access: Anyone) and paste the URL into
 * WAITLIST_SHEETS_WEBHOOK_URL. Never commit the secret or the deployment URL.
 */

var SHEET_NAME = 'waitlist';
var HEADERS = ['timestamp', 'name', 'email', 'whatsapp', 'rubro'];

function jsonOutput(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getWaitlistSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Bind this script to a Google Sheet before deploying.');
  }

  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  ensureHeader(sheet);
  return sheet;
}

function ensureHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }

  var firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var matches = HEADERS.every(function (header, index) {
    return String(firstRow[index] || '').trim().toLowerCase() === header;
  });
  if (!matches) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function emailColumnIndex(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), HEADERS.length);
  var header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  for (var index = 0; index < header.length; index += 1) {
    if (String(header[index]).trim().toLowerCase() === 'email') return index;
  }
  return HEADERS.indexOf('email');
}

function occupiedCount(sheet) {
  return Math.max(0, sheet.getLastRow() - 1);
}

function findEmailPosition(sheet, email) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var column = emailColumnIndex(sheet);
  var values = sheet.getRange(2, column + 1, lastRow - 1, 1).getValues();
  var needle = email.toLowerCase();
  for (var index = 0; index < values.length; index += 1) {
    if (String(values[index][0] || '').trim().toLowerCase() === needle) return index + 1;
  }
  return 0;
}

function hasDuplicateEmail(sheet, email) {
  return findEmailPosition(sheet, email) > 0;
}

function doGet() {
  try {
    var sheet = getWaitlistSheet();
    return jsonOutput({ occupied: occupiedCount(sheet) });
  } catch (error) {
    return jsonOutput({ occupied: 0 });
  }
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
    var payload = JSON.parse(raw || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty('WAITLIST_SECRET');
    if (!expected || payload.secret !== expected) {
      return jsonOutput({ status: 'unauthorized' });
    }

    var sheet = getWaitlistSheet();
    if (payload.action === 'occupied') {
      return jsonOutput({ occupied: occupiedCount(sheet) });
    }

    var email = String(payload.email || '').trim();
    if (!email) {
      return jsonOutput({ status: 'error' });
    }

    var existing = findEmailPosition(sheet, email);
    if (existing > 0) {
      return jsonOutput({ status: 'duplicate', position: existing });
    }

    sheet.appendRow([
      payload.createdAt || new Date().toISOString(),
      payload.name || '',
      email,
      payload.normalizedWhatsapp || payload.whatsapp || '',
      payload.rubro || ''
    ]);
    return jsonOutput({ status: 'ok', position: occupiedCount(sheet) });
  } catch (error) {
    return jsonOutput({ status: 'error' });
  }
}

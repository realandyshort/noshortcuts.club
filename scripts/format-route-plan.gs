/**
 * No Shortcuts: brand styling for the public route plan Google Sheet.
 *
 * How to use (one time):
 *   1. Open the public route plan sheet.
 *   2. Extensions > Apps Script. Delete anything in the editor, paste this whole file, click Save.
 *   3. Choose "formatRoutePlan" in the function dropdown and click Run. Approve the permission
 *      prompt (it only touches this spreadsheet).
 *   4. Close the script editor. Run it again any time a new tab (e.g. Segment 6) appears.
 *
 * It only changes how cells look. Data and IMPORTRANGE formulas are untouched.
 * Readability first: warm banded rows, light borders, dark header, numbers in mono.
 */

var BRAND = {
  ink: '#161412',
  cream: '#FBE9D7',
  creamLight: '#FFF8F0',   // the lighter band, so rows alternate cream / light cream
  persimmon: '#E8593D',
  peach: '#F4C8AB',
  gray: '#8C8681',
  cobalt: '#2D4EE8',
  rule: '#E6D9CC',         // thin row and column lines
  ruleStrong: '#D9CBBD'
};

var FONT_BODY = 'Bricolage Grotesque';
var FONT_MONO = 'JetBrains Mono';
var MAX_ROWS = 400;        // format this many rows so new days show up styled

function formatRoutePlan() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (/^Segment\s*\d+/i.test(name)) {
      formatSegmentTab_(sheet);
    } else {
      formatOverviewTab_(sheet);
    }
  });
}

// Day-by-day tabs: Date, Day #, Departure, Destination, Mileage, Elevation Gain, Route, Accomodation, Email, Phone, Notes
function formatSegmentTab_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 11);
  var header = sheet.getRange(1, 1, 1, lastCol);
  var body = sheet.getRange(2, 1, MAX_ROWS - 1, lastCol);
  var all = sheet.getRange(1, 1, MAX_ROWS, lastCol);

  sheet.setTabColor(BRAND.persimmon);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  sheet.setHiddenGridlines(true);

  all.setFontFamily(FONT_BODY).setFontSize(10).setFontColor(BRAND.ink)
     .setVerticalAlignment('middle').setWrap(false);

  // Header: ink band, cream mono text
  header.setBackground(BRAND.ink).setFontColor(BRAND.cream)
        .setFontFamily(FONT_MONO).setFontSize(9).setFontWeight('bold')
        .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);

  // Body: alternating warm bands, thin lines
  body.setBackground(BRAND.creamLight);
  for (var r = 3; r <= MAX_ROWS; r += 2) {
    sheet.getRange(r, 1, 1, lastCol).setBackground(BRAND.cream);
  }
  body.setBorder(true, true, true, true, true, true, BRAND.rule, SpreadsheetApp.BorderStyle.SOLID);
  all.setBorder(true, true, true, true, null, null, BRAND.ruleStrong, SpreadsheetApp.BorderStyle.SOLID);

  // Column treatments (1-based: A=1 ... K=11)
  var dateCol = sheet.getRange(2, 1, MAX_ROWS - 1, 1);
  dateCol.setFontFamily(FONT_MONO).setFontSize(9).setFontColor(BRAND.gray);

  var dayCol = sheet.getRange(2, 2, MAX_ROWS - 1, 1);
  dayCol.setFontFamily(FONT_MONO).setFontSize(10).setFontColor(BRAND.persimmon)
        .setFontWeight('bold').setHorizontalAlignment('right');

  var numbers = sheet.getRange(2, 5, MAX_ROWS - 1, 2); // Mileage, Elevation Gain
  numbers.setFontFamily(FONT_MONO).setFontSize(10).setHorizontalAlignment('right')
         .setNumberFormat('#,##0.#');

  var route = sheet.getRange(2, 7, MAX_ROWS - 1, 1);
  route.setFontColor(BRAND.cobalt).setFontSize(9);

  var notes = sheet.getRange(2, 11, MAX_ROWS - 1, 1);
  notes.setFontColor('#5C5650').setWrap(true);

  // Widths that keep the whole day readable without scrolling sideways
  var widths = { 1: 80, 2: 52, 3: 150, 4: 150, 5: 70, 6: 90, 7: 130, 8: 170, 9: 120, 10: 110, 11: 320 };
  Object.keys(widths).forEach(function (c) { sheet.setColumnWidth(Number(c), widths[c]); });
  for (var r2 = 2; r2 <= MAX_ROWS; r2++) { sheet.setRowHeight(r2, 24); }

  // Conditional colour: rest days (no mileage) get the peach band; border and boat days get coloured notes
  sheet.clearConditionalFormatRules();
  var rows = sheet.getRange(2, 1, MAX_ROWS - 1, lastCol);
  var rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($B2<>"", OR($E2="", $E2=0))')
      .setBackground(BRAND.peach).setRanges([rows]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=REGEXMATCH(LOWER($K2), "border|frontera|crossing")')
      .setFontColor(BRAND.persimmon).setBold(true).setRanges([notes]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=REGEXMATCH(LOWER($K2), "ferry|boat|sail|lancha")')
      .setFontColor(BRAND.cobalt).setBold(true).setRanges([notes]).build()
  ];
  sheet.setConditionalFormatRules(rules);
}

// The overview tab (one row per segment): same header and bands, wrapped text
function formatOverviewTab_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var lastRow = Math.max(sheet.getLastRow(), 2);
  var header = sheet.getRange(1, 1, 1, lastCol);
  var body = sheet.getRange(2, 1, lastRow - 1, lastCol);

  sheet.setTabColor(BRAND.ink);
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);

  sheet.getRange(1, 1, lastRow, lastCol).setFontFamily(FONT_BODY).setFontSize(10)
       .setFontColor(BRAND.ink).setVerticalAlignment('top').setWrap(true);
  header.setBackground(BRAND.ink).setFontColor(BRAND.cream)
        .setFontFamily(FONT_MONO).setFontSize(9).setFontWeight('bold').setWrap(false);
  sheet.setRowHeight(1, 32);

  body.setBackground(BRAND.creamLight);
  for (var r = 3; r <= lastRow; r += 2) {
    sheet.getRange(r, 1, 1, lastCol).setBackground(BRAND.cream);
  }
  body.setBorder(true, true, true, true, true, true, BRAND.rule, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(2, 1, lastRow - 1, 1).setFontFamily(FONT_MONO).setFontColor(BRAND.persimmon).setFontWeight('bold');
}

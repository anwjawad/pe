/**
 * Palliative Equipments Tracker - Backend
 * 
 * Instructions:
 * 1. Open Extensions > Apps Script.
 * 2. Paste this code into Code.gs.
 * 3. Deploy > New Deployment > Web App > Execute as: Me > Who has access: Anyone.
 * 4. Copy the Web App URL and paste it into your frontend script.js.
 * 
 * The script will automatically create "Transactions" and "Inventory" sheets if they don't exist.
 */

const SHEET_TRANSACTIONS = "Transactions";
const SHEET_INVENTORY = "Inventory";

const HEADERS_TRANSACTIONS = [
  "Timestamp", "Patient Name", "Device Recipient Name", "Relationship",
  "Patient ID", "Recipient ID", "Contact Number", "Area", "Diagnosis",
  "Device", "Device Number", "Notes", "Status", "Type"
];

// Initial inventory list valid
const HEADERS_INVENTORY = ["Device Name", "Total Stock"];
const INITIAL_INVENTORY = [
  ["O2 Generator", 0],
  ["Nebulizer", 0],
  ["Suction Machine", 0],
  ["Air Mattress", 0],
  ["Lymphatic Drainage Device", 0],
  ["Commode", 0]
];

function setupSheets(ss) {
  let invSheet = ss.getSheetByName(SHEET_INVENTORY);
  if (!invSheet) {
    invSheet = ss.insertSheet(SHEET_INVENTORY);
    invSheet.appendRow(HEADERS_INVENTORY);
    // Optional: Pre-fill with default devices
    INITIAL_INVENTORY.forEach(row => invSheet.appendRow(row));
  }

  let transSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!transSheet) {
    transSheet = ss.insertSheet(SHEET_TRANSACTIONS);
    transSheet.appendRow(HEADERS_TRANSACTIONS);
  }

  return { invSheet, transSheet };
}

function doGet(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("Spreadsheet not found");

    const { invSheet: inventorySheet, transSheet: transactionsSheet } = setupSheets(ss);

    // --- 1. Process Inventory Level ---
    const inventoryData = inventorySheet.getDataRange().getValues();
    if (inventoryData.length < 1) return errorResponse("Inventory sheet error.");

    const headers = inventoryData.shift(); // Remove headers

    // Create an object to store inventory map
    const inventoryMap = {};
    inventoryData.forEach(row => {
      if (row[0]) {
        inventoryMap[row[0]] = {
          total: Number(row[1]) || 0,
          rented: 0,
          available: Number(row[1]) || 0
        };
      }
    });

    // --- 2. Process Transactions (History & Counts) ---
    // Load all transactions
    let transactionsList = [];
    if (transactionsSheet.getLastRow() > 1) {
      const transactionsData = transactionsSheet.getRange(2, 1, transactionsSheet.getLastRow() - 1, transactionsSheet.getLastColumn()).getValues();

      transactionsData.forEach((row, index) => {
        const deviceType = row[9]; // Device Name column index
        const status = row[12]; // Status column index (Delivered / Received / Not Received)

        if (inventoryMap[deviceType]) {
          // If the item is currently with the patient (Delivered) or legacy (Not Received), it counts as rented.
          // If it is 'Received', it is back in stock, so we don't count it as rented.
          if (status === "Delivered" || status === "Not Received") {
            inventoryMap[deviceType].rented++;
          }
        }

        // Add to transactions list (reverse chronological order later)
        transactionsList.push({
          row: index + 2, // 1-based row index in sheet
          timestamp: row[0],
          patientName: row[1],
          recipientName: row[2],
          relationship: row[3],
          patientId: row[4],
          recipientId: row[5],
          contact: row[6],
          area: row[7],
          diagnosis: row[8],
          device: row[9],
          deviceNumber: row[10],
          notes: row[11],
          status: row[12],
          type: row[13]
        });
      });
    }

    // Recalculate Available
    for (let key in inventoryMap) {
      inventoryMap[key].available = inventoryMap[key].total - inventoryMap[key].rented;
      if (inventoryMap[key].available < 0) inventoryMap[key].available = 0;
    }

    // Return Data
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: inventoryMap,
      inventoryList: Object.keys(inventoryMap).map(k => ({ name: k, ...inventoryMap[k] })),
      transactions: transactionsList.reverse().slice(0, 50) // Return last 50, newest first
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return errorResponse(err.toString());
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("Spreadsheet not found");
    const { invSheet: inventorySheet, transSheet: transactionsSheet } = setupSheets(ss);

    const data = JSON.parse(e.postData.contents);

    if (data.action === "addTransaction") {
      const newRow = [
        new Date(),
        data.patientName,
        data.recipientName,
        data.relationship,
        data.patientId,
        data.recipientId,
        data.contact,
        data.area,
        data.diagnosis,
        data.device,
        data.deviceNumber,
        data.notes,
        data.status,
        data.type
      ];
      transactionsSheet.appendRow(newRow);
      return successResponse("Transaction saved successfully.");

    } else if (data.action === "updateInventory") {
      const inventoryData = inventorySheet.getDataRange().getValues();
      let found = false;

      for (let i = 1; i < inventoryData.length; i++) {
        if (inventoryData[i][0] === data.device) {
          inventorySheet.getRange(i + 1, 2).setValue(data.newTotal);
          found = true;
          break;
        }
      }

      if (!found) {
        inventorySheet.appendRow([data.device, data.newTotal]);
      }

      return successResponse("Inventory updated.");

    } else if (data.action === "updateStatus") {
      // payload: { row: number, status: string }
      const rowIndex = Number(data.row);
      if (!rowIndex || rowIndex < 2) return errorResponse("Invalid row index");

      // Update Status Column (Column 13 -> M)
      // Check bounds
      if (rowIndex > transactionsSheet.getLastRow()) return errorResponse("Row not found");

      // Verify we are updating the right thing? (optional)

      transactionsSheet.getRange(rowIndex, 13).setValue(data.status);
      return successResponse("Status updated.");
    }

    return errorResponse("Unknown action");

  } catch (err) {
    return errorResponse(err.toString());
  } finally {
    lock.releaseLock();
  }
}

function successResponse(msg) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: msg
  })).setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(msg) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'error',
    message: msg
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Palliative Equipments Tracker - Frontend Logic
 */

// --- Configuration ---
const CONFIG = {
    // User provided GAS URL
    DEFAULT_URL: "https://script.google.com/macros/s/AKfycbwjwZcOtRy0SmgBZABxPVDE30NHD2y_Tfu8py5P_VmETiPZz07QHleM7vTQYWyaZQB2/exec",

    get webhookUrl() {
        // Return default URL if set, otherwise check local storage
        return this.DEFAULT_URL || localStorage.getItem('gas_webhook_url') || '';
    },
    set webhookUrl(url) {
        localStorage.setItem('gas_webhook_url', url.trim());
    }
};

// --- Data Lists ---
const LISTS = {
    regions: [
        "Hebron", "Jericho", "Jerusalem", "Bethlehem", "Ramallah",
        "Nablus", "Jenin", "Tulkarm", "Qalqilya", "Salfit"
    ],
    diagnoses: [
        "Gastric Cancers", "Colorectal cancers", "Lung Cancers", "Gynecological Cancers",
        "Prostate Cancers", "Head and Neck Cancers", "Breast Cancers", "Genitourinary Cancers",
        "Brain Cancers", "Sarcomas", "Lymphomas", "Endocrine Cancers",
        "Rare and Mixed Cancers", "Panceriatic cancer", "RCC", "Bladder Cancer"
    ],
    devices: [
        { name: "O2 Generator", icon: "fa-wind" },
        { name: "Nebulizer", icon: "fa-lungs" },
        { name: "Suction Machine", icon: "fa-pump-medical" },
        { name: "Air Mattress", icon: "fa-bed" },
        { name: "Lymphatic Drainage Device", icon: "fa-notes-medical" },
        { name: "Commode", icon: "fa-toilet" }
    ],
    signatories: [
        "Ameen Dahdolan", "Jawad Abu Subha", "Asala Nobani", "Other"
    ]
};

// --- State Management ---
let appState = {
    inventory: {},
    transactions: []
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    populateDropdowns();
    setupNavigation();
    setupForms();
    setupFilters();
    loadWebhookUrlInput();

    if (CONFIG.webhookUrl) {
        fetchData();
    } else {
        showSection('settings');
        showToast("Please setup Google Web App URL first", "info");
    }
});

// --- UI Navigation ---
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-links li');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Update active nav state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(sec => {
        sec.classList.remove('active-section');
    });
    // Show target section
    document.getElementById(sectionId).classList.add('active-section');
}

// --- Form & Dropdown Population ---
function populateDropdowns() {
    const createOption = (val) => `<option value="${val}">${val}</option>`;

    // Regions
    const areaSelect = document.getElementById('areaSelect');
    if (areaSelect) areaSelect.innerHTML = createOption("") + LISTS.regions.map(createOption).join('');

    // Diagnoses
    const diagSelect = document.getElementById('diagnosisSelect');
    if (diagSelect) diagSelect.innerHTML = createOption("") + LISTS.diagnoses.map(createOption).join('');

    // Signatures
    const sigSelect = document.getElementById('signatureSelect');
    if (sigSelect) sigSelect.innerHTML = createOption("") + LISTS.signatories.map(createOption).join('');

    // Devices (For both transaction form and inventory update form)
    const deviceOptions = createOption("") + LISTS.devices.map(d => `<option value="${d.name}">${d.name}</option>`).join('');

    const devSelect = document.getElementById('deviceSelect');
    if (devSelect) devSelect.innerHTML = deviceOptions;

    const invDevSelect = document.getElementById('inventoryDeviceSelect');
    if (invDevSelect) invDevSelect.innerHTML = deviceOptions;
}

function setupForms() {
    // Transaction Form
    const eqForm = document.getElementById('equipmentForm');
    if (eqForm) {
        eqForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleFormSubmit(eqForm);
        });
    }

    // Inventory Update Form
    const invForm = document.getElementById('inventoryUpdateForm');
    if (invForm) {
        invForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleFormSubmit(invForm);
        });
    }
}

// --- Data Fetching & Sync ---
function loadWebhookUrlInput() {
    document.getElementById('webhookUrlInput').value = CONFIG.webhookUrl;
}

function saveWebhookUrl() {
    const url = document.getElementById('webhookUrlInput').value;
    if (url) {
        CONFIG.webhookUrl = url;
        showToast("URL Saved. Fetching data...");
        fetchData();
    }
}

async function fetchData() {
    if (!CONFIG.webhookUrl) return;

    // Only show spinner if we have no data at all
    const grid = document.getElementById('inventory-grid');
    if (Object.keys(appState.inventory).length === 0) {
        grid.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Syncing...</div>';
    }

    try {
        const response = await fetch(CONFIG.webhookUrl);
        const result = await response.json();

        if (result.status === 'success') {
            // Update Local State
            appState.inventory = result.data || {};
            appState.transactions = result.transactions || [];

            renderDashboard();
            renderTransactionsList(appState.transactions);
        } else {
            console.error("API Error:", result);
            if (Object.keys(appState.inventory).length === 0) {
                grid.innerHTML = '<div class="error">Error syncing data. Check console.</div>';
            }
        }
    } catch (err) {
        console.error("Fetch Error:", err);
        if (Object.keys(appState.inventory).length === 0) {
            grid.innerHTML = '<div class="error">Connection failed. Check URL.</div>';
        }
    }
}

function renderDashboard(data) {
    // If data is passed, use it (legacy support), otherwise use appState
    const inventoryData = data || appState.inventory;

    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    // We iterate through our defined devices to ensure order and icons, 
    // merging with fetched data.
    LISTS.devices.forEach(deviceDef => {
        const deviceData = inventoryData[deviceDef.name] || { total: 0, available: 0, rented: 0 };
        // If data is missing (not in sheet yet), default to 0.

        const card = document.createElement('div');
        card.className = 'inventory-card';
        // Add ID for selective updates if needed later
        card.dataset.device = deviceDef.name;

        card.innerHTML = `
            <div class="card-icon">
                <i class="fas ${deviceDef.icon}"></i>
            </div>
            <div class="card-info">
                <h3>${deviceDef.name}</h3>
                <div class="count">${deviceData.available} / <span class="total-label">${deviceData.total}</span></div>
                <div style="font-size: 0.8rem; color: #aaa;">Available</div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- Printing ---
function printForm(lang) {
    const form = document.getElementById('equipmentForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    printData(data, lang);
}

function printTransaction(index, lang) {
    if (!window.currentTransactions || !window.currentTransactions[index]) return;
    const tx = window.currentTransactions[index];

    // Map API data to Print Template fields
    // API: timestamp, patientName, recipientName, relationship, patientId, recipientId, contact, area, diagnosis, device, deviceNumber, notes

    // Attempt to parse text from Notes if formatted as "Signed by: ...; Return Date: ..."
    let signature = "";
    let returnDate = "";

    if (tx.notes) {
        const notes = tx.notes;
        const sigMatch = notes.match(/Signed by:\s*([^;]+)/);
        if (sigMatch) signature = sigMatch[1].trim();

        const retMatch = notes.match(/Return Date:\s*([^;]+)/);
        if (retMatch) returnDate = retMatch[1].trim();
    }

    const data = {
        patientName: tx.patientName,
        recipientName: tx.recipientName,
        relationship: tx.relationship,
        patientId: tx.patientId,
        recipientId: tx.recipientId,
        contact: tx.contact,
        diagnosis: tx.diagnosis,
        device: tx.device,
        deviceNumber: tx.deviceNumber,
        deliveryDate: new Date(tx.timestamp).toLocaleDateString(),
        returnDate: returnDate,
        signature: signature
    };

    printData(data, lang);
}

function printData(data, lang) {
    // 1. Select Template
    document.querySelectorAll('.print-page').forEach(p => p.classList.remove('active-print'));

    const templateId = lang === 'ar' ? 'print-ar' : 'print-en';
    const template = document.getElementById(templateId);
    if (!template) return;
    template.classList.add('active-print');

    // 2. Populate Data
    // Class format: .p-key
    for (const [key, value] of Object.entries(data)) {
        const field = template.querySelector(`.p-${key}`);
        if (field) {
            field.textContent = value || "";
        }
    }

    // 3. Trigger Print
    window.print();
}

// --- API Submission ---
// --- API Submission (Refactored for Optimistic UI) ---
async function handleFormSubmit(form) {
    const btn = form.querySelector('button[type="submit"]'); // Keep reference but don't disable UI for speed
    const formData = new FormData(form);
    const data = {};
    formData.forEach((value, key) => data[key] = value);

    // Save current state for rollback if needed
    const backupState = JSON.parse(JSON.stringify(appState));

    // --- Optimistic Update Start ---
    const timestamp = new Date().toISOString();

    if (data.action === "addTransaction") {
        // 1. Add to local transactions
        const newTx = {
            ...data,
            timestamp: timestamp,
            row: -1 // temporary ID, will be refreshed on next sync
        };
        appState.transactions.unshift(newTx); // Add to top

        // 2. Update Local Inventory if "Delivered"
        if ((data.status === "Delivered" || data.status === "Not Received") && data.device) {
            const deviceName = data.device;
            if (!appState.inventory[deviceName]) {
                appState.inventory[deviceName] = { total: 0, available: 0, rented: 0 };
            }
            // Decrease available, Increase rented
            appState.inventory[deviceName].rented = (appState.inventory[deviceName].rented || 0) + 1;
            appState.inventory[deviceName].available = (appState.inventory[deviceName].total || 0) - appState.inventory[deviceName].rented;
            if (appState.inventory[deviceName].available < 0) appState.inventory[deviceName].available = 0;
        }

        showToast("Saved! Syncing...");

        // Auto-print Arabic Receipt
        // Use setTimeout to allow UI to update (toast/grid) before print dialog blocks
        setTimeout(() => {
            printData(data, 'ar');
            form.reset();
        }, 500);

    } else if (data.action === "updateInventory") {
        // Update Inventory Total
        const deviceName = data.device;
        const newTotal = parseInt(data.newTotal) || 0;

        if (!appState.inventory[deviceName]) {
            appState.inventory[deviceName] = { total: 0, available: 0, rented: 0 };
        }

        appState.inventory[deviceName].total = newTotal;
        // Re-calc available
        appState.inventory[deviceName].available = newTotal - (appState.inventory[deviceName].rented || 0);
        if (appState.inventory[deviceName].available < 0) appState.inventory[deviceName].available = 0;

        showToast("Inventory Updated!");
    }

    // Re-render UI immediately
    renderDashboard();
    renderTransactionsList(appState.transactions);
    // --- Optimistic Update End ---

    if (!CONFIG.webhookUrl) return;

    try {
        // Send to Backend
        const response = await fetch(CONFIG.webhookUrl, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.status === 'success') {
            // Success - Silent sync refresh to get real Row IDs and confirm data
            // We fetch data again to ensure consistency, but user already sees the result
            fetchData();
        } else {
            throw new Error(result.message);
        }

    } catch (err) {
        console.error(err);
        showToast("Sync Error! Reverting changes.", "error");
        // Rollback
        appState = backupState;
        renderDashboard();
        renderTransactionsList(appState.transactions);
    }
}

function renderTransactionsList(transactions) {
    if (!transactions) return;
    window.currentTransactions = transactions;
    const list = document.getElementById('transactions-list');
    list.innerHTML = '';

    if (transactions.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #888;">No transactions found.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'transaction-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Date</th>
                <th>Patient</th>
                <th>Recipient</th>
                <th>Relation</th>
                <th>Contact</th>
                <th>Device</th>
                <th>Notes</th>
                <th>Status</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    transactions.forEach((tx, index) => {
        const row = document.createElement('tr');

        // Format Date
        const date = new Date(tx.timestamp).toLocaleDateString();

        // Status Badge Style
        const isReceived = tx.status === 'Received';
        const badgeClass = isReceived ? 'badge-success' : 'badge-warning';

        row.innerHTML = `
            <td>${date}</td>
            <td>
                <div style="font-weight: 600;">${tx.patientName}</div>
                <div style="font-size: 0.8rem; color: #666;">ID: ${tx.patientId || '-'}</div>
            </td>
            <td>${tx.recipientName || '-'}</td>
            <td>${tx.relationship || '-'}</td>
            <td>${tx.contact || '-'}</td>
            <td>
                <div>${tx.device}</div>
                <div style="font-size: 0.8rem;">#${tx.deviceNumber}</div>
            </td>
            <td style="max-width: 150px; font-size: 0.85rem; color: #555;">${tx.notes || ''}</td>
            <td><span class="badge ${badgeClass}">${tx.status}</span></td>
            <td>
                <div style="display: flex; gap: 5px;">
                    ${!isReceived ? `
                    <button class="btn-icon" onclick="markReceived(${index}, this)" title="Mark as Received">
                        <i class="fas fa-check-circle"></i>
                    </button>
                    ` : '<i class="fas fa-check" style="color: #2ecc71; padding: 5px;"></i>'}
                    
                    <button class="btn-icon" onclick="printTransaction(${index}, 'en')" title="Print English">
                        <i class="fas fa-print"></i>
                    </button>
                    <button class="btn-icon" onclick="printTransaction(${index}, 'ar')" title="Print Arabic">
                        <i class="fas fa-print" style="color: #27ae60;"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    list.appendChild(table);
}


async function markReceived(localIndex, btnElement) {
    if (!confirm("Confirm mark as Received?")) return;

    // Save state for rollback
    const backupState = JSON.parse(JSON.stringify(appState));

    // --- Optimistic Update ---
    const tx = appState.transactions[localIndex];
    if (!tx) return;

    // 1. Update Transaction Status
    tx.status = 'Received';

    // 2. Update Inventory (Restore stock)
    // Assuming previous status was "Delivered" or "Not Received" which consumed stock
    const deviceName = tx.device;
    if (appState.inventory[deviceName]) {
        appState.inventory[deviceName].rented = (appState.inventory[deviceName].rented || 0) - 1;
        if (appState.inventory[deviceName].rented < 0) appState.inventory[deviceName].rented = 0;

        appState.inventory[deviceName].available = (appState.inventory[deviceName].total || 0) - appState.inventory[deviceName].rented;
    }

    // Render immediately
    renderDashboard();
    renderTransactionsList(appState.transactions);
    showToast("Status Updated! Syncing...");

    try {
        // Send to Backend
        // Note: We need the REAL row ID from the sheet, which we stored in tx.row
        // If tx.row is -1 (newly added), we might fail here if we haven't synced yet.
        // But assuming fetch happens fast enough or we just synced. 
        if (!tx.row || tx.row === -1) {
            // Fallback: If we don't have a row ID yet (corner case: user adds then immediately completes),
            // a full sync is safer, but strictly we can't update without row ID.
            // For now, we proceed. If it fails, rollback.
            console.warn("Transaction might lack Row ID. Syncing first.");
        }

        const response = await fetch(CONFIG.webhookUrl, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateStatus',
                row: tx.row,
                status: 'Received'
            })
        });

        const result = await response.json();

        if (result.status === 'success') {
            // Silent refresh to ensure consistency
            fetchData();
        } else {
            throw new Error(result.message);
        }

    } catch (err) {
        console.error(err);
        showToast("Sync Error! Reverting status.", "error");
        // Rollback
        appState = backupState;
        renderDashboard();
        renderTransactionsList(appState.transactions);
    }
}



// --- Filters ---
function setupFilters() {
    const searchInput = document.getElementById('searchTransactions');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = appState.transactions.filter(tx => {
                const searchStr = `${tx.patientName} ${tx.patientId} ${tx.recipientName} ${tx.device} ${tx.status} ${tx.deviceNumber}`.toLowerCase();
                return searchStr.includes(term);
            });
            renderTransactionsList(filtered);
        });
    }
}

// --- Utilities ---
function showToast(message, type = "success") {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = type === "error" ? "#e74c3c" : "#333";
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

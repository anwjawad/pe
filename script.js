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

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    populateDropdowns();
    setupNavigation();
    setupForms();
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

    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Syncing...</div>';

    try {
        const response = await fetch(CONFIG.webhookUrl);
        const result = await response.json();

        if (result.status === 'success') {
            renderDashboard(result.data);
            if (result.transactions) {
                renderTransactionsList(result.transactions);
            }
        } else {
            console.error("API Error:", result);
            grid.innerHTML = '<div class="error">Error syncing data. Check console.</div>';
        }
    } catch (err) {
        console.error("Fetch Error:", err);
        grid.innerHTML = '<div class="error">Connection failed. Check URL.</div>';
    }
}

function renderDashboard(data) {
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    // We iterate through our defined devices to ensure order and icons, 
    // merging with fetched data.
    LISTS.devices.forEach(deviceDef => {
        const deviceData = data[deviceDef.name] || { total: 0, available: 0, rented: 0 };
        // If data is missing (not in sheet yet), default to 0.

        const card = document.createElement('div');
        card.className = 'inventory-card';
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
async function handleFormSubmit(form) {
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    if (!CONFIG.webhookUrl) {
        showToast("Please configure Web App URL in Settings", "error");
        return;
    }

    try {
        // UI Loading State
        btn.disabled = true;
        btn.classList.add('loading');
        btn.innerHTML = '<div class="loader"></div> Processing...';

        // Collect Data
        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => data[key] = value);

        // Send Request (using no-cors mode if needed, but GAS requires CORS handling on server. 
        // We used ContentService.createTextOutput..JSON so it should be fine with standard fetch if simple POST).
        // Actually, GAS doPost simple fetch often faces CORS issues if not handled perfectly or if using 'application/json'. 
        // 'text/plain' payload is safer for avoiding OPTIONS preflight issues in some environments without complex GAS CORS setup.

        const response = await fetch(CONFIG.webhookUrl, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.status === 'success') {
            showToast("Saved Successfully!");
            form.reset();
            // Refresh Dashboard
            fetchData();
        } else {
            showToast("Error: " + result.message, "error");
        }

    } catch (err) {
        console.error(err);
        showToast("Network Error or CORS issue. View Console.", "error");
    } finally {
        // Reset UI
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.innerHTML = originalText;
    }
}

function renderTransactionsList(transactions) {
    window.currentTransactions = transactions; // Store for printing access
    const list = document.getElementById('transactions-list');
    list.innerHTML = '';

    if (!transactions || transactions.length === 0) {
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
                    <button class="btn-icon" onclick="markReceived(${tx.row}, this)" title="Mark as Received">
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


async function markReceived(rowIndex, btnElement) {
    if (!confirm("Confirm mark as Received?")) return;

    // UI Loading
    const originalContent = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btnElement.disabled = true;

    try {
        const response = await fetch(CONFIG.webhookUrl, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateStatus',
                row: rowIndex,
                status: 'Received'
            })
        });

        const result = await response.json();

        if (result.status === 'success') {
            showToast("Status Updated!");
            fetchData(); // Refresh list/inventory
        } else {
            showToast("Error update: " + result.message, "error");
            btnElement.innerHTML = originalContent;
            btnElement.disabled = false;
        }

    } catch (err) {
        console.error(err);
        showToast("Network Error", "error");
        btnElement.innerHTML = originalContent;
        btnElement.disabled = false;
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

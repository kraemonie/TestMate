// 1. IMPORT FIREBASE LIBRARIES
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, update, push, set, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 2. CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyCkxjYgv3J7D28auhqehs7dvcdat8rIbtI",
    authDomain: "trackmate-8fb8c.firebaseapp.com",
    databaseURL: "https://trackmate-8fb8c-default-rtdb.firebaseio.com/",
    projectId: "trackmate-8fb8c"
};

// 3. INITIALIZE
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// GLOBAL VARIABLES
let barChart = null;
let doughnutChart = null;
let globalBase64Image = "";
let requestsMap = {}; // Stores data for the popup modal

// ==========================================
//  AUTHENTICATION
// ==========================================

// Login Function
window.login = async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-msg');

    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        errorMsg.innerText = "Login Failed: " + error.message;
    }
};

// Logout Function
window.logout = () => signOut(auth);

// Auth State Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Optional: Check specific admin email
        // if(user.email !== "admin@trackmate.com") return signOut(auth);
        
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('dashboard-container').style.display = 'flex';
        initDashboard(); // Start loading data
    } else {
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('dashboard-container').style.display = 'none';
    }
});

// ==========================================
//  DASHBOARD LOGIC (Stats, Charts, Table)
// ==========================================

function initDashboard() {
    const requestsRef = ref(db, 'Requests');

    // Real-time Listener for Requests
    onValue(requestsRef, (snapshot) => {
        const data = snapshot.val();
        
        if (!data) {
            updateStats([]);
            return;
        }

        let allRequests = [];
        requestsMap = {}; // Clear map

        // Process each category
        if (data.AdmissionSlip) processCategory(data.AdmissionSlip, "Admission Slip", allRequests);
        if (data.GatePass) processCategory(data.GatePass, "Gate Pass", allRequests);
        if (data.ExitPass) processCategory(data.ExitPass, "Exit Pass", allRequests);

        // Sort Newest First
        allRequests.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Update UI
        updateStats(allRequests);
        renderCharts(allRequests);
        renderTable(allRequests);
    });

    // Real-time Listener for Lost & Found History
    onValue(ref(db, 'LostAndFound'), (snapshot) => {
        const data = snapshot.val();
        renderLostFoundTable(data);
    });
}

function processCategory(categoryData, typeName, array) {
    Object.keys(categoryData).forEach(key => {
        const item = categoryData[key];
        
        // Create object
        const requestObj = {
            id: key,
            type: typeName,
            rawType: typeName.replace(" ", ""), // Removes space for DB path
            student: item.StudentEmail || "Unknown",
            date: item.RequestDate || new Date().toISOString(),
            status: item.Status || "Pending",
            details: item.Reason || item.ItemsToBring || item.ReasonCategory || item.Purpose || "N/A",
            image: item.ParentLetterImage || null
        };

        array.push(requestObj);
        requestsMap[key] = requestObj; // Save for Modal lookup
    });
}

function updateStats(data) {
    document.getElementById('total-count').innerText = data.length;
    document.getElementById('pending-count').innerText = data.filter(x => x.status === "Pending").length;
    document.getElementById('ready-count').innerText = data.filter(x => x.status === "Teacher Approved").length;
    document.getElementById('approved-count').innerText = data.filter(x => x.status === "DO Approved").length;
}

// ==========================================
//  CHARTS (Chart.js)
// ==========================================

function renderCharts(data) {
    // 1. Bar Chart Data (By Type)
    const types = {
        "Admission": data.filter(x => x.type === "Admission Slip").length,
        "Gate Pass": data.filter(x => x.type === "Gate Pass").length,
        "Exit Pass": data.filter(x => x.type === "Exit Pass").length
    };

    const ctxBar = document.getElementById('barChart').getContext('2d');
    if (barChart) barChart.destroy();

    barChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: Object.keys(types),
            datasets: [{
                label: 'Requests',
                data: Object.values(types),
                backgroundColor: ['#004B8D', '#002F5D', '#FFD100'],
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 2. Doughnut Chart Data (By Status)
    const statuses = {
        "Pending": data.filter(x => x.status === "Pending").length,
        "Teacher Appr": data.filter(x => x.status === "Teacher Approved").length,
        "DO Appr": data.filter(x => x.status === "DO Approved").length,
        "Rejected": data.filter(x => x.status === "Rejected").length
    };

    const ctxPie = document.getElementById('doughnutChart').getContext('2d');
    if (doughnutChart) doughnutChart.destroy();

    doughnutChart = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: Object.keys(statuses),
            datasets: [{
                data: Object.values(statuses),
                backgroundColor: ['#F57F17', '#004B8D', '#2E7D32', '#C62828'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
    });
}

// ==========================================
//  TABLES & LISTS
// ==========================================

function renderTable(data) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = "";

    // Show top 100 recent requests
    data.slice(0, 100).forEach(item => {
        let badgeColor = "#999";
        let statusText = item.status;

        if (item.status === "Pending") badgeColor = "#F57F17";
        else if (item.status === "Teacher Approved") badgeColor = "#004B8D";
        else if (item.status === "DO Approved") badgeColor = "#2E7D32";
        else if (item.status === "Rejected") badgeColor = "#C62828";

        // View Button
        const actionHtml = `<button onclick="viewDetails('${item.id}')" style="background:#EEE; color:#333; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">View</button>`;

        const row = `
            <tr>
                <td>${new Date(item.date).toLocaleDateString()}</td>
                <td><b>${item.type}</b></td>
                <td>${item.student}</td>
                <td>${item.details.substring(0, 20)}...</td>
                <td><span style="color:${badgeColor}; font-weight:bold;">${statusText}</span></td>
                <td>${actionHtml}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

function renderLostFoundTable(data) {
    const tbody = document.getElementById('lf-table-body');
    if(tbody) tbody.innerHTML = "";
    
    if (!data) return;

    Object.keys(data).forEach(key => {
        const item = data[key];
        const row = `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:10px;">
                    <div style="font-weight:bold; color:#004B8D;">${item.ItemName}</div>
                    <div style="font-size:11px; color:#999;">${item.LocationFound}</div>
                </td>
                <td>
                    <button onclick="deleteLostItem('${key}')" style="background:#FFEBEE; color:#C62828; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px;">Delete</button>
                </td>
            </tr>
        `;
        if(tbody) tbody.innerHTML += row;
    });
}

// ==========================================
//  MODAL POPUP LOGIC
// ==========================================

window.viewDetails = function(id) {
    const item = requestsMap[id];
    if (!item) return;

    // 1. Fill Data
    document.getElementById('m-title').innerText = item.type;
    document.getElementById('m-student').innerText = item.student;
    document.getElementById('m-date').innerText = new Date(item.date).toLocaleString();
    document.getElementById('m-details').innerText = item.details;
    document.getElementById('m-status-badge').innerText = item.status;

    // 2. Handle Image (Parent Letter)
    const imgContainer = document.getElementById('m-image-container');
    const imgElement = document.getElementById('m-image');
    
    if (item.image) {
        imgContainer.style.display = "block";
        // Check if it's raw Base64 or URL
        imgElement.src = item.image.startsWith("data:") ? item.image : "data:image/jpeg;base64," + item.image;
    } else {
        imgContainer.style.display = "none";
    }

    // 3. Generate Buttons based on Status
    const actionDiv = document.getElementById('m-actions');
    actionDiv.innerHTML = "";

    if (item.status === "Teacher Approved") {
        // Admin actions
        actionDiv.innerHTML = `
            <button onclick="setStatus('${item.rawType}', '${item.id}', 'DO Approved'); closeModal()" class="btn-primary" style="background:#2E7D32; margin-right:10px;">Final Approve</button>
            <button onclick="setStatus('${item.rawType}', '${item.id}', 'Rejected'); closeModal()" class="btn-primary" style="background:#C62828;">Reject</button>
        `;
    } else if (item.status === "Pending") {
        actionDiv.innerHTML = `<span style="color:orange; font-size:12px; font-style:italic;">Waiting for Teacher approval first.</span>`;
    } else {
        actionDiv.innerHTML = `<span style="color:gray; font-size:12px;">Action completed.</span>`;
    }

    // 4. Show Modal
    document.getElementById('request-modal').style.display = "block";
};

// ==========================================
//  ACTIONS & UTILITIES
// ==========================================

// Update Status in Firebase
window.setStatus = (type, id, status) => {
    const itemRef = ref(db, `Requests/${type}/${id}`);
    update(itemRef, { Status: status })
        .then(() => console.log("Updated"))
        .catch(err => alert(err.message));
};

// Search Filter
window.filterTable = () => {
    const filter = document.getElementById('searchInput').value.toUpperCase();
    const rows = document.getElementById("table-body").getElementsByTagName("tr");
    for (let row of rows) {
        row.style.display = row.innerText.toUpperCase().includes(filter) ? "" : "none";
    }
};

// --- LOST & FOUND ---

// Image Converter
window.encodeImageFileAsURL = (el) => {
    const file = el.files[0];
    const reader = new FileReader();
    reader.onloadend = () => globalBase64Image = reader.result;
    reader.readAsDataURL(file);
};

// Post Item
window.postLostItem = () => {
    const n = document.getElementById('lf-name').value;
    const l = document.getElementById('lf-location').value;
    const d = document.getElementById('lf-desc').value;
    const date = document.getElementById('lf-date').value;

    if (!n || !l) return alert("Item Name and Location are required.");

    push(ref(db, 'LostAndFound'), {
        ItemName: n,
        LocationFound: l,
        Description: d,
        DateFound: date,
        ImageUrl: globalBase64Image
    }).then(() => {
        alert("Item Posted!");
        // Reset form
        document.getElementById('lf-name').value = "";
        document.getElementById('lf-location').value = "";
        document.getElementById('lf-desc').value = "";
        document.getElementById('lf-image-file').value = "";
        globalBase64Image = "";
    });
};

// Delete Item
window.deleteLostItem = (key) => {
    if (confirm("Remove this item from the list?")) {
        remove(ref(db, `LostAndFound/${key}`));
    }
};

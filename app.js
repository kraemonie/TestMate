import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, update, push, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCkxjYgv3J7D28auhqehs7dvcdat8rIbtI",
    authDomain: "trackmate-8fb8c.firebaseapp.com",
    databaseURL: "https://trackmate-8fb8c-default-rtdb.firebaseio.com/",
    projectId: "trackmate-8fb8c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// GLOBALS
let barChart = null;
let doughnutChart = null;
let globalBase64Image = "";

// --- AUTHENTICATION ---
window.login = async () => {
    const e = document.getElementById('email').value;
    const p = document.getElementById('password').value;
    try { await signInWithEmailAndPassword(auth, e, p); } 
    catch(err) { document.getElementById('error-msg').innerText = err.message; }
};
window.logout = () => signOut(auth);

onAuthStateChanged(auth, u => {
    document.getElementById('login-container').style.display = u ? 'none' : 'flex';
    document.getElementById('dashboard-container').style.display = u ? 'flex' : 'none';
    if(u) initDashboard();
});

// --- DASHBOARD DATA ---
function initDashboard() {
    onValue(ref(db, 'Requests'), snap => {
        const data = snap.val();
        if(!data) { updateStats([]); return; }

        let all = [];
        if(data.AdmissionSlip) process(data.AdmissionSlip, "Admission Slip", all);
        if(data.GatePass) process(data.GatePass, "Gate Pass", all);
        if(data.ExitPass) process(data.ExitPass, "Exit Pass", all);

        all.sort((a,b) => new Date(b.date) - new Date(a.date));
        
        updateStats(all);
        renderCharts(all);
        renderTable(all);
    });
}

function process(catData, type, arr) {
    Object.keys(catData).forEach(k => {
        const i = catData[k];
        arr.push({
            id: k, type: type, rawType: type.replace(" ", ""),
            student: i.StudentEmail, date: i.RequestDate, status: i.Status,
            details: i.Reason || i.ItemsToBring || i.ReasonCategory || i.Purpose
        });
    });
}

function updateStats(data) {
    document.getElementById('total-count').innerText = data.length;
    document.getElementById('pending-count').innerText = data.filter(x => x.status === "Pending").length;
    document.getElementById('ready-count').innerText = data.filter(x => x.status === "Teacher Approved").length;
    document.getElementById('approved-count').innerText = data.filter(x => x.status === "DO Approved").length;
}

// --- CHARTS ---
function renderCharts(data) {
    // BAR CHART
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
            datasets: [{ label: 'Requests', data: Object.values(types), backgroundColor: ['#004B8D', '#002F5D', '#FFD100'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // PIE CHART
    const statuses = {
        "Pending": data.filter(x => x.status === "Pending").length,
        "Ready (DO)": data.filter(x => x.status === "Teacher Approved").length,
        "Completed": data.filter(x => x.status === "DO Approved").length,
        "Rejected": data.filter(x => x.status === "Rejected").length
    };

    const ctxPie = document.getElementById('doughnutChart').getContext('2d');
    if (doughnutChart) doughnutChart.destroy();
    doughnutChart = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: Object.keys(statuses),
            datasets: [{ data: Object.values(statuses), backgroundColor: ['#F57F17', '#004B8D', '#2E7D32', '#C62828'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
    });
}

// --- TABLE ---
function renderTable(data) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = "";
    
    data.slice(0, 50).forEach(item => {
        let actionHtml = "";
        let color = "#666";

        if (item.status === "Pending") {
            color = "#F57F17";
            actionHtml = `<span style="color:gray; font-size:12px;">Waiting for Teacher</span>`;
        } 
        else if (item.status === "Teacher Approved") {
            color = "#004B8D";
            // Admin Action Buttons
            actionHtml = `
                <button onclick="setStatus('${item.rawType}', '${item.id}', 'DO Approved')" style="background:#2E7D32; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer;">Final Approve</button>
                <button onclick="setStatus('${item.rawType}', '${item.id}', 'Rejected')" style="background:#C62828; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer; margin-left:5px;">Reject</button>
            `;
        } 
        else if (item.status === "DO Approved") {
            color = "#2E7D32";
            actionHtml = `<span style="color:#2E7D32; font-weight:bold;">✔ Complete</span>`;
        }
        else if (item.status === "Rejected") {
            color = "#C62828";
            actionHtml = `<span style="color:#C62828;">Rejected</span>`;
        }

        tbody.innerHTML += `<tr>
            <td>${new Date(item.date).toLocaleDateString()}</td>
            <td><b>${item.type}</b></td>
            <td>${item.student}</td>
            <td>${item.details}</td>
            <td><span style="color:${color}; font-weight:bold;">${item.status}</span></td>
            <td>${actionHtml}</td>
        </tr>`;
    });
}

// --- ACTIONS ---
window.setStatus = (type, id, status) => update(ref(db, `Requests/${type}/${id}`), { Status: status });

window.filterTable = () => {
    const filter = document.getElementById('searchInput').value.toUpperCase();
    const rows = document.getElementById("table-body").getElementsByTagName("tr");
    for (let row of rows) {
        row.style.display = row.innerText.toUpperCase().includes(filter) ? "" : "none";
    }
};

// --- LOST & FOUND (IMAGE LOGIC) ---

// 1. Convert Image to Base64
window.encodeImageFileAsURL = function(element) {
    const file = element.files[0];
    const reader = new FileReader();
    reader.onloadend = function() {
        globalBase64Image = reader.result;
    }
    reader.readAsDataURL(file);
}

// 2. Post Item
window.postLostItem = () => {
    const n = document.getElementById('lf-name').value;
    const l = document.getElementById('lf-location').value;
    const d = document.getElementById('lf-desc').value;
    const date = document.getElementById('lf-date').value;

    if(!n || !l) return alert("Name/Location required");
    
    push(ref(db, 'LostAndFound'), { 
        ItemName: n, 
        LocationFound: l, 
        Description: d, 
        DateFound: date,
        ImageUrl: globalBase64Image // Save the image data
    }).then(() => { 
        alert("Posted!"); 
        // Reset
        document.getElementById('lf-name').value = "";
        document.getElementById('lf-location').value = "";
        document.getElementById('lf-desc').value = "";
        document.getElementById('lf-image-file').value = "";
        globalBase64Image = "";
    });
};